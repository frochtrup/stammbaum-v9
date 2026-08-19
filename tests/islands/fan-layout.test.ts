// tests/islands/fan-layout.test.ts — Layout-Berechnung des Fächer-Diagramms als reine
// Funktion Modell -> Geometrie (Spec 32 §2, TST-2, BL-123). Prüft Struktur/Winkel, NICHT
// Pixel-Rendering. Orakel: legacy-v8 `ui-fanchart.js`.
import { describe, expect, it } from 'vitest';
import { makeDatabase, makeEvent, makeFamily, makePerson } from '../../core/model';
import { makeHofRegistry, makePlaceRegistry, type PlaceContext } from '../../core/places';
import type { Database } from '../../core/model/types';
import { computeFanLayout, MAX_FAN_GENERATIONS } from '../../ui/islands/tree/fan-layout';
import { buildFourGenTree } from './tree-fixtures';

/**
 * Lückenlose Ahnenreihe über `depth` Generationen (2^depth-1 Personen) um `I1`. Nötig,
 * weil `buildFourGenTree` nur bis zu den Urgroßeltern reicht — eine Zusicherung über die
 * ÄUSSEREN Ringe liefe dort über eine leere Menge und wäre grün, ohne etwas zu prüfen.
 */
function buildDeepAncestry(depth: number): Database {
  const db = makeDatabase();
  db.individuals.set('I1', makePerson('I1', { name: 'Proband', given: 'Proband', sex: 'M' }));
  let level = ['I1'];
  let next = 2;
  for (let g = 1; g <= depth; g++) {
    const parents: string[] = [];
    for (const childId of level) {
      const fatherId = `I${next++}`;
      const motherId = `I${next++}`;
      const famId = `F${childId}`;
      db.individuals.set(fatherId, makePerson(fatherId, { name: `Ahn${g} ${fatherId}`, given: `Ahn${g}`, surname: fatherId, sex: 'M' }));
      db.individuals.set(motherId, makePerson(motherId, { name: `Ahnin${g} ${motherId}`, given: `Ahnin${g}`, surname: motherId, sex: 'F' }));
      db.families.set(famId, makeFamily(famId, { husband: fatherId, wife: motherId, children: [childId] }));
      db.individuals.get(fatherId)!.parentIn.push(famId);
      db.individuals.get(motherId)!.parentIn.push(famId);
      db.individuals.get(childId)!.childOf.push({
        familyId: famId, pedigree: 'birth', fatherRel: '', motherRel: '',
        fatherRelSeen: false, motherRelSeen: false, citations: [],
      });
      parents.push(fatherId, motherId);
    }
    level = parents;
  }
  return db;
}

/** PlaceContext aus derselben `db`-Welt wie im echten App-State (reine Indizes). */
function ctxForDb(db: Database): PlaceContext {
  return { places: makePlaceRegistry(db.placeObjects), hofs: makeHofRegistry(db.hofObjects) };
}

describe('computeFanLayout', () => {
  it('gibt null zurück, wenn die Zentrumsperson nicht existiert', () => {
    const db = makeDatabase();
    expect(computeFanLayout(db, 'nope')).toBeNull();
  });

  it('legt einen Zentrums-Kreis in der Mitte an (unten), mit Radius > 0', () => {
    const db = buildFourGenTree();
    const layout = computeFanLayout(db, 'I1')!;
    expect(layout.center).not.toBeNull();
    expect(layout.center!.id).toBe('I1');
    expect(layout.center!.cx).toBe(layout.width / 2);
    expect(layout.center!.r).toBeGreaterThan(0);
  });

  it('jede Generation g hat 2^g Segmente', () => {
    const db = buildFourGenTree();
    const layout = computeFanLayout(db, 'I1', { generations: 4 })!;
    for (let g = 1; g <= 4; g++) {
      const n = layout.segments.filter((s) => s.gen === g).length;
      expect(n).toBe(2 ** g);
    }
  });

  it('Vater (erstes Segment Gen 1) liegt links, Mutter rechts vom Zentrum', () => {
    const db = buildFourGenTree();
    const layout = computeFanLayout(db, 'I1', { generations: 4 })!;
    const gen1 = layout.segments.filter((s) => s.gen === 1);
    const father = gen1.find((s) => s.id === 'I2')!;
    const mother = gen1.find((s) => s.id === 'I3')!;
    // Textmittelpunkt: Vater links vom Zentrum (x < cx), Mutter rechts (x > cx).
    expect(father.texts[0].x).toBeLessThan(layout.width / 2);
    expect(mother.texts[0].x).toBeGreaterThan(layout.width / 2);
  });

  it('fehlende Vorfahren erzeugen leere Segmente (id=null, keine Texte)', () => {
    const db = buildFourGenTree();
    // Urgroßeltern I8..I15 sind belegt, deren Eltern (Gen 4) nicht → 16 leere Segmente.
    const layout = computeFanLayout(db, 'I1', { generations: 4 })!;
    const gen4 = layout.segments.filter((s) => s.gen === 4);
    expect(gen4).toHaveLength(16);
    for (const s of gen4) {
      expect(s.id).toBeNull();
      expect(s.texts).toHaveLength(0);
    }
  });

  it('belegte Segmente tragen Text (Gen 1: Vorname + Nachname, zwei Zeilen)', () => {
    const db = buildFourGenTree();
    const layout = computeFanLayout(db, 'I1')!;
    const father = layout.segments.find((s) => s.id === 'I2')!;
    expect(father.texts.length).toBeGreaterThanOrEqual(1);
    expect(father.texts.some((t) => t.text.includes('Vater'))).toBe(true);
  });

  it('Segmentpfad ist ein gültiger Ring-Arc (M … A … A … Z)', () => {
    const db = buildFourGenTree();
    const layout = computeFanLayout(db, 'I1')!;
    const seg = layout.segments.find((s) => s.id === 'I2')!;
    expect(seg.d.startsWith('M ')).toBe(true);
    expect((seg.d.match(/A /g) ?? []).length).toBe(2);
    expect(seg.d.endsWith('Z')).toBe(true);
  });

  it('Generationen werden auf 3..8 begrenzt', () => {
    const db = buildFourGenTree();
    const low = computeFanLayout(db, 'I1', { generations: 1 })!;
    const high = computeFanLayout(db, 'I1', { generations: 99 })!;
    expect(Math.max(...low.segments.map((s) => s.gen))).toBe(3);
    expect(Math.max(...high.segments.map((s) => s.gen))).toBe(MAX_FAN_GENERATIONS);
    expect(MAX_FAN_GENERATIONS).toBe(8);
  });

  it('jede wählbare Stufe bis 8 hat einen Radius (kein NaN im Pfad)', () => {
    const db = buildFourGenTree();
    for (let g = 3; g <= MAX_FAN_GENERATIONS; g++) {
      const layout = computeFanLayout(db, 'I1', { generations: g })!;
      expect(Math.max(...layout.segments.map((s) => s.gen))).toBe(g);
      // 2^1 + … + 2^g Segmente, alle mit endlichen Koordinaten.
      expect(layout.segments).toHaveLength(2 ** (g + 1) - 2);
      expect(layout.segments.some((s) => /NaN|undefined/.test(s.d))).toBe(false);
      expect(Number.isFinite(layout.width) && layout.width > 0).toBe(true);
      expect(Number.isFinite(layout.height) && layout.height > 0).toBe(true);
    }
  });

  it('die äußeren Ringe tragen keine gezeichnete Beschriftung mehr — dafür einen Tooltip', () => {
    const db = buildDeepAncestry(8);
    const layout = computeFanLayout(db, 'I1', { generations: 8 })!;
    const aussen = layout.segments.filter((s) => s.gen >= 6);
    // Zählung VOR der Zusicherung: die Schleife darf nicht über eine leere Menge laufen.
    expect(aussen).toHaveLength(2 ** 6 + 2 ** 7 + 2 ** 8);
    expect(aussen.every((s) => s.id !== null)).toBe(true);
    for (const s of aussen) {
      expect(s.texts).toHaveLength(0); // gezeichnete Beschriftung: keine
      expect(s.tooltip).toContain('Ahn'); // Tooltip: voller Name
    }
    // Und die inneren Ringe behalten beides.
    const innen = layout.segments.filter((s) => s.gen <= 3);
    expect(innen).toHaveLength(2 + 4 + 8);
    expect(innen.every((s) => s.texts.length > 0 && s.tooltip !== '')).toBe(true);
  });

  it('leere Segmente tragen keinen Tooltip (nichts zu benennen)', () => {
    const db = buildFourGenTree();
    const layout = computeFanLayout(db, 'I1', { generations: 5 })!;
    const leer = layout.segments.filter((s) => s.id === null);
    expect(leer.length).toBeGreaterThan(0);
    expect(leer.every((s) => s.tooltip === '')).toBe(true);
  });

  it('die Tooltip-Zeile hat die Picker-Form: Name · Jahr, Ort', () => {
    const db = buildFourGenTree();
    db.individuals.get('I2')!.birth = makeEvent('BIRT', { date: '12 MAR 1834', place: 'Hasbergen' });
    const layout = computeFanLayout(db, 'I1', { placeContext: ctxForDb(db) })!;
    expect(layout.segments.find((s) => s.id === 'I2')!.tooltip).toBe('Vater Testperson · 1834, Hasbergen');
  });

  it('ohne PlaceContext bleibt das Geburtsjahr — der Name steht nie allein da', () => {
    const db = buildFourGenTree();
    db.individuals.get('I3')!.birth = makeEvent('BIRT', { date: '1840', place: 'Hasbergen' });
    const layout = computeFanLayout(db, 'I1')!;
    expect(layout.segments.find((s) => s.id === 'I3')!.tooltip).toBe('Mutter Testperson · 1840');
    // Ohne jedes Datum bleibt nur der Name (kein leerer Trenner).
    expect(layout.segments.find((s) => s.id === 'I2')!.tooltip).toBe('Vater Testperson');
  });

  it('auch der Zentrums-Kreis trägt die Zeile (er zeigt kein Geburtsjahr)', () => {
    const db = buildFourGenTree();
    db.individuals.get('I1')!.birth = makeEvent('BIRT', { date: '1900' });
    const layout = computeFanLayout(db, 'I1')!;
    expect(layout.center!.tooltip).toBe('Proband Testperson · 1900');
  });

  it('navTargets: hoch = Vater, Shift-hoch = Mutter, runter/rechts = null (nur Vorfahren)', () => {
    const db = buildFourGenTree();
    const layout = computeFanLayout(db, 'I1')!;
    expect(layout.navTargets).toEqual({ up: 'I2', up2: 'I3', down: null, right: null });
  });

  it('ist deterministisch: gleiche Eingabe -> identisches Ergebnis', () => {
    const db = buildFourGenTree();
    expect(computeFanLayout(db, 'I1')).toEqual(computeFanLayout(db, 'I1'));
  });
});
