// tests/islands/fan-layout.test.ts — Layout-Berechnung des Fächer-Diagramms als reine
// Funktion Modell -> Geometrie (Spec 32 §2, TST-2, BL-123). Prüft Struktur/Winkel, NICHT
// Pixel-Rendering. Orakel: legacy-v8 `ui-fanchart.js`.
import { describe, expect, it } from 'vitest';
import { makeDatabase } from '../../core/model';
import { computeFanLayout } from '../../ui/islands/tree/fan-layout';
import { buildFourGenTree } from './tree-fixtures';

describe('computeFanLayout', () => {
  it('gibt null zurück, wenn der Proband nicht existiert', () => {
    const db = makeDatabase();
    expect(computeFanLayout(db, 'nope')).toBeNull();
  });

  it('legt einen Proband-Kreis in der Mitte an (unten), mit Radius > 0', () => {
    const db = buildFourGenTree();
    const layout = computeFanLayout(db, 'I1')!;
    expect(layout.proband).not.toBeNull();
    expect(layout.proband!.id).toBe('I1');
    expect(layout.proband!.cx).toBe(layout.width / 2);
    expect(layout.proband!.r).toBeGreaterThan(0);
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

  it('Generationen werden auf 3..6 begrenzt', () => {
    const db = buildFourGenTree();
    const low = computeFanLayout(db, 'I1', { generations: 1 })!;
    const high = computeFanLayout(db, 'I1', { generations: 9 })!;
    expect(Math.max(...low.segments.map((s) => s.gen))).toBe(3);
    expect(Math.max(...high.segments.map((s) => s.gen))).toBe(6);
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
