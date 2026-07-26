// tests/islands/descendant-layout.test.ts — Layout-Berechnung des Nachkommen-Baums als
// reine Funktion Modell -> Positionen (Spec 32 §2, TST-2, BL-122). Prüft Geometrie/
// Struktur, NICHT Pixel/SVG-Rendering. Orakel: legacy-v8 `ui-desc-tree.js`.
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson } from '../../core/model';
import { computeDescendantLayout } from '../../ui/islands/tree/descendant-layout';
import { addPerson, buildFourGenTree, marry } from './tree-fixtures';

/** Fügt `childId` als weiteres Kind an eine bestehende Familie an (Geschwister-Setup). */
function addChildTo(db: ReturnType<typeof makeDatabase>, familyId: string, childId: string): void {
  db.families.get(familyId)!.children.push(childId);
  db.individuals.get(childId)!.childOf.push({
    familyId,
    pedigree: 'birth',
    fatherRel: '',
    motherRel: '',
    fatherRelSeen: false,
    motherRelSeen: false,
    citations: [],
  });
}

describe('computeDescendantLayout', () => {
  it('gibt null zurück, wenn der Proband nicht existiert', () => {
    const db = makeDatabase();
    expect(computeDescendantLayout(db, 'nope', { portrait: false })).toBeNull();
  });

  it('platziert genau eine Zentrum-Karte (Proband) oben (y = PAD)', () => {
    const db = buildFourGenTree();
    const layout = computeDescendantLayout(db, 'I1', { portrait: false })!;
    const center = layout.cards.filter((c) => c.isCenter);
    expect(center).toHaveLength(1);
    expect(center[0].id).toBe('I1');
    expect(center[0].y).toBe(20); // PAD (landscape)
  });

  it('rendert Vorfahren NICHT (top-down): Eltern des Probanden fehlen in den Karten', () => {
    const db = buildFourGenTree();
    const layout = computeDescendantLayout(db, 'I1', { portrait: false })!;
    const ids = layout.cards.map((c) => c.id);
    expect(ids).not.toContain('I2');
    expect(ids).not.toContain('I3');
  });

  it('Kinder (Gen 2) stehen unter dem Probanden, keine Zentrum-Karten', () => {
    const db = buildFourGenTree();
    const layout = computeDescendantLayout(db, 'I1', { portrait: false })!;
    const root = layout.cards.find((c) => c.isCenter)!;
    const kids = layout.cards.filter((c) => c.id === 'I30' || c.id === 'I31');
    expect(kids).toHaveLength(2);
    for (const k of kids) {
      expect(k.isCenter).toBe(false);
      expect(k.y).toBeGreaterThan(root.y);
    }
  });

  it('Enkel (Gen 3) erscheinen, wenn generations >= 3', () => {
    const db = buildFourGenTree();
    addPerson(db, 'I50', 'Enkel');
    marry(db, 'F30', 'I30', null, ['I50']);
    const layout = computeDescendantLayout(db, 'I1', { portrait: false, generations: 3 })!;
    expect(layout.cards.map((c) => c.id)).toContain('I50');
  });

  it('Generationen-Kappung: bei generations = 2 fehlt der Enkel, das Kind trägt hasMore', () => {
    const db = buildFourGenTree();
    addPerson(db, 'I50', 'Enkel');
    marry(db, 'F30', 'I30', null, ['I50']);
    const layout = computeDescendantLayout(db, 'I1', { portrait: false, generations: 2 })!;
    expect(layout.cards.map((c) => c.id)).not.toContain('I50');
    const kid = layout.cards.find((c) => c.id === 'I30')!;
    expect(kid.hasMore).toBe(true);
  });

  it('Halbkinder (andere Ehe als die Hauptfamilie) tragen isHalf', () => {
    const db = buildFourGenTree();
    addPerson(db, 'I21', 'Zweite Ehefrau', 'F');
    addPerson(db, 'I32', 'Halbkind');
    marry(db, 'F3', 'I1', 'I21', ['I32']);
    const layout = computeDescendantLayout(db, 'I1', { portrait: false })!;
    expect(layout.cards.find((c) => c.id === 'I32')!.isHalf).toBe(true);
    expect(layout.cards.find((c) => c.id === 'I30')!.isHalf).toBe(false);
  });

  it('Ehepartner-Karte steht rechts vom Probanden (höhere X)', () => {
    const db = buildFourGenTree();
    const layout = computeDescendantLayout(db, 'I1', { portrait: false })!;
    const root = layout.cards.find((c) => c.isCenter)!;
    const spouse = layout.cards.find((c) => c.id === 'I20')!;
    expect(spouse.x).toBeGreaterThan(root.x + root.width);
  });

  it('marriageBadge referenziert die Familie zwischen Proband und erstem Ehepartner', () => {
    const db = buildFourGenTree();
    const layout = computeDescendantLayout(db, 'I1', { portrait: false })!;
    expect(layout.marriageBadge).not.toBeNull();
    expect(layout.marriageBadge!.familyId).toBe('F2');
  });

  it('Geschwister-Stapel: Geschwister links vom Probanden, als isSibling markiert', () => {
    const db = buildFourGenTree();
    addPerson(db, 'I40', 'Geschwister');
    addChildTo(db, 'F1', 'I40'); // F1 = Herkunftsfamilie des Probanden
    const layout = computeDescendantLayout(db, 'I1', { portrait: false })!;
    const root = layout.cards.find((c) => c.isCenter)!;
    const sib = layout.cards.find((c) => c.id === 'I40')!;
    expect(sib.isSibling).toBe(true);
    expect(sib.x).toBeLessThan(root.x);
  });

  it('navTargets: hoch = Vater/Mutter, runter = erstes Kind, rechts = erster Ehepartner', () => {
    const db = buildFourGenTree();
    const layout = computeDescendantLayout(db, 'I1', { portrait: false })!;
    expect(layout.navTargets).toEqual({ up: 'I2', up2: 'I3', down: 'I30', right: 'I20' });
  });

  it('Kinder deterministisch nach Geburtsjahr sortiert (dann ID)', () => {
    const db = makeDatabase();
    db.individuals.set('P', makePerson('P', { name: 'Elternteil' }));
    db.individuals.set('C1', makePerson('C1', { name: 'Spät' }));
    db.individuals.set('C2', makePerson('C2', { name: 'Früh' }));
    db.individuals.get('C1')!.birth.date = '1980';
    db.individuals.get('C2')!.birth.date = '1975';
    marry(db, 'F1', 'P', null, ['C1', 'C2']);
    const layout = computeDescendantLayout(db, 'P', { portrait: false })!;
    // C2 (1975) muss vor C1 (1980) stehen — kleinere X.
    const c1 = layout.cards.find((c) => c.id === 'C1')!;
    const c2 = layout.cards.find((c) => c.id === 'C2')!;
    expect(c2.x).toBeLessThan(c1.x);
    // navTargets.down = erstes Kind = C2 (Geburtsjahr-Sortierung, nicht Einfüge-Reihenfolge)
    expect(layout.navTargets.down).toBe('C2');
  });

  it('ist deterministisch: gleiche Eingabe -> identisches Ergebnis', () => {
    const db = buildFourGenTree();
    const a = computeDescendantLayout(db, 'I1', { portrait: false });
    const b = computeDescendantLayout(db, 'I1', { portrait: false });
    expect(a).toEqual(b);
  });
});
