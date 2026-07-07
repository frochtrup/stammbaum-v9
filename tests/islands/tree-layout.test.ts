// tests/islands/tree-layout.test.ts — Layout-Berechnung des Sanduhr-Baums als reine
// Funktion Modell -> Positionen (Spec 32 §2, TST-2). Prüft Geometrie/Struktur, NICHT
// Pixel/SVG-Rendering (das ist bewusst nicht Gegenstand dieser Ebene).
import { describe, expect, it } from 'vitest';
import { makeDatabase } from '../../core/model';
import { computeTreeLayout } from '../../ui/islands/tree/tree-layout';
import { addPerson, buildFourGenTree, marry } from './tree-fixtures';

describe('computeTreeLayout', () => {
  it('gibt null zurück, wenn der Proband nicht existiert', () => {
    const db = makeDatabase();
    expect(computeTreeLayout(db, 'nope', { portrait: false })).toBeNull();
  });

  it('platziert genau eine Zentrum-Karte für den Probanden', () => {
    const db = buildFourGenTree();
    const layout = computeTreeLayout(db, 'I1', { portrait: false })!;
    const centerCards = layout.cards.filter((c) => c.isCenter);
    expect(centerCards).toHaveLength(1);
    expect(centerCards[0].id).toBe('I1');
  });

  it('Desktop (Landscape): bis zu 4 Vorfahren-Ebenen, hier 3 belegte Ebenen (Eltern/Großeltern/Urgroßeltern)', () => {
    const db = buildFourGenTree();
    const layout = computeTreeLayout(db, 'I1', { portrait: false, maxAncestorLevels: 4 })!;
    // Eltern(2) + Großeltern(4) + Urgroßeltern(8) = 14 Ahnen-Karten + 1 Proband + 1 Ehepartner + 2 Kinder = 18
    const nonNullAncestors = layout.cards.filter((c) => !c.isCenter && c.kekule && c.kekule >= 2 && c.kekule <= 15);
    expect(nonNullAncestors).toHaveLength(14);
  });

  it('Portrait/Mobile: nur 2 Ebenen (Eltern + Großeltern), keine Urgroßeltern-Karten', () => {
    const db = buildFourGenTree();
    const layout = computeTreeLayout(db, 'I1', { portrait: true })!;
    const kekuleNumbers = layout.cards.map((c) => c.kekule).filter((k): k is number => k != null);
    expect(Math.max(...kekuleNumbers)).toBeLessThan(8); // keine Urgroßeltern (Kekule 8..15)
  });

  it('Kekule-Nummern erscheinen auf den Ahnen-Karten (Proband=1, Vater=2, Mutter=3)', () => {
    const db = buildFourGenTree();
    const layout = computeTreeLayout(db, 'I1', { portrait: false })!;
    const byId = new Map(layout.cards.filter((c) => c.id).map((c) => [c.id, c.kekule]));
    expect(byId.get('I1')).toBe(1);
    expect(byId.get('I2')).toBe(2);
    expect(byId.get('I3')).toBe(3);
  });

  it('Ehepartner wird als Karte rechts vom Probanden platziert (höhere X, gleiche Y-Zeile)', () => {
    const db = buildFourGenTree();
    const layout = computeTreeLayout(db, 'I1', { portrait: false })!;
    const center = layout.cards.find((c) => c.isCenter)!;
    const spouse = layout.cards.find((c) => c.id === 'I20')!;
    expect(spouse.x).toBeGreaterThan(center.x + center.width);
  });

  it('marriageBadge referenziert die aktive Familie zwischen Proband und Ehepartner', () => {
    const db = buildFourGenTree();
    const layout = computeTreeLayout(db, 'I1', { portrait: false })!;
    expect(layout.marriageBadge).not.toBeNull();
    expect(layout.marriageBadge!.familyId).toBe('F2');
    expect(layout.marriageCount).toBe(1);
  });

  it('Mehrfach-Ehen: marriageCount > 1, alle Ehepartner-Karten vorhanden (Spec: ⚭N)', () => {
    const db = buildFourGenTree();
    addPerson(db, 'I21', 'Zweite Ehefrau', 'F');
    marry(db, 'F3', 'I1', 'I21', []);
    const layout = computeTreeLayout(db, 'I1', { portrait: false })!;
    expect(layout.marriageCount).toBe(2);
    const spouseIds = layout.cards.filter((c) => c.id === 'I20' || c.id === 'I21').map((c) => c.id);
    expect(spouseIds.sort()).toEqual(['I20', 'I21']);
  });

  it('activeSpouseIndex wählt die aktive Ehe (Hauptkinder-Set) um', () => {
    const db = buildFourGenTree();
    addPerson(db, 'I21', 'Zweite Ehefrau', 'F');
    addPerson(db, 'I32', 'Kind aus zweiter Ehe');
    marry(db, 'F3', 'I1', 'I21', ['I32']);
    const layoutDefault = computeTreeLayout(db, 'I1', { portrait: false })!;
    const kidsDefault = layoutDefault.cards.filter((c) => !c.isCenter && (c.id === 'I30' || c.id === 'I31' || c.id === 'I32'));
    // Default (Index 0 = F2/I20): I30/I31 sind Hauptkinder (nicht halb), I32 ist Halbkind.
    expect(kidsDefault.find((c) => c.id === 'I32')!.isHalfSibling).toBe(true);
    expect(kidsDefault.find((c) => c.id === 'I30')!.isHalfSibling).toBe(false);

    const layoutActive1 = computeTreeLayout(db, 'I1', { portrait: false, activeSpouseIndex: 1 })!;
    const kidsActive1 = layoutActive1.cards.filter((c) => !c.isCenter && (c.id === 'I30' || c.id === 'I32'));
    expect(kidsActive1.find((c) => c.id === 'I32')!.isHalfSibling).toBe(false);
    expect(kidsActive1.find((c) => c.id === 'I30')!.isHalfSibling).toBe(true);
  });

  it('Halbgeschwister-Kennzeichnung (½): Kinder aus Nicht-Hauptfamilie sind isHalfSibling', () => {
    const db = buildFourGenTree();
    addPerson(db, 'I21', 'Zweite Ehefrau', 'F');
    addPerson(db, 'I32', 'Halbkind');
    marry(db, 'F3', 'I1', 'I21', ['I32']);
    const layout = computeTreeLayout(db, 'I1', { portrait: false })!;
    const half = layout.cards.find((c) => c.id === 'I32')!;
    const full = layout.cards.find((c) => c.id === 'I30')!;
    expect(half.isHalfSibling).toBe(true);
    expect(full.isHalfSibling).toBe(false);
  });

  it('Kinder werden in Zeilen zu maximal 4 Spalten umgebrochen', () => {
    const db = makeDatabase();
    addPerson(db, 'P');
    addPerson(db, 'SP');
    const kids = ['K1', 'K2', 'K3', 'K4', 'K5'];
    for (const k of kids) addPerson(db, k);
    marry(db, 'F1', 'P', 'SP', kids);
    const layout = computeTreeLayout(db, 'P', { portrait: false })!;
    const kidCards = layout.cards.filter((c) => kids.includes(c.id ?? ''));
    expect(kidCards).toHaveLength(5);
    // 5. Kind muss in einer neuen Zeile stehen (andere Y als die ersten 4).
    const rowYs = new Set(kidCards.map((c) => c.y));
    expect(rowYs.size).toBe(2);
  });

  it('navTargets liefert Vater/Mutter/erstes Kind/aktiven Partner für Tastaturnavigation', () => {
    const db = buildFourGenTree();
    const layout = computeTreeLayout(db, 'I1', { portrait: false })!;
    expect(layout.navTargets).toEqual({ up: 'I2', up2: 'I3', down: 'I30', right: 'I20' });
  });

  it('ist deterministisch: gleiche Eingabe -> identisches Ergebnis (kein Zufall/Zeit)', () => {
    const db = buildFourGenTree();
    const a = computeTreeLayout(db, 'I1', { portrait: false });
    const b = computeTreeLayout(db, 'I1', { portrait: false });
    expect(a).toEqual(b);
  });

  describe('Geschwisterzeile des Probanden (ADR-v9-23, Spec 20 §1.3 [K])', () => {
    function addSibling(db: ReturnType<typeof makeDatabase>, id: string, familyId: string): void {
      addPerson(db, id, id);
      db.families.get(familyId)!.children.push(id);
      db.individuals.get(id)!.childOf.push({
        familyId,
        pedigree: 'birth',
        fatherRel: '',
        motherRel: '',
        fatherRelSeen: false,
        motherRelSeen: false,
        citations: [],
      });
    }

    it('ohne Geschwister: keine isSibling-Karten', () => {
      const db = buildFourGenTree();
      const layout = computeTreeLayout(db, 'I1', { portrait: false })!;
      expect(layout.cards.filter((c) => c.isSibling)).toHaveLength(0);
    });

    it('Vollgeschwister aus der primären Familie erscheinen als eigene Zeile links vom Probanden, nicht half-markiert', () => {
      const db = buildFourGenTree();
      addSibling(db, 'I42', 'F1');
      const layout = computeTreeLayout(db, 'I1', { portrait: false })!;
      const sibCards = layout.cards.filter((c) => c.isSibling);
      expect(sibCards).toHaveLength(1);
      expect(sibCards[0].id).toBe('I42');
      expect(sibCards[0].isHalfSibling).toBe(false);

      const center = layout.cards.find((c) => c.isCenter)!;
      // Geschwisterzeile liegt komplett links von der Proband-Karte.
      expect(sibCards[0].x + sibCards[0].width).toBeLessThanOrEqual(center.x);
      // Vertikal auf die Proband-Zeile zentriert (gleiche Zeile wie Proband/Ehepartner).
      expect(sibCards[0].y).toBeGreaterThanOrEqual(center.y);
      expect(sibCards[0].y).toBeLessThanOrEqual(center.y + center.height);
    });

    it('Halbgeschwister aus einer zweiten Elternfamilie sind isHalfSibling markiert (½)', () => {
      const db = buildFourGenTree();
      addPerson(db, 'I51', 'Neuer Partner Vater', 'F');
      marry(db, 'F20', 'I2', 'I51', []);
      addSibling(db, 'I52', 'F20');
      db.individuals.get('I1')!.childOf.push({
        familyId: 'F20',
        pedigree: 'birth',
        fatherRel: '',
        motherRel: '',
        fatherRelSeen: false,
        motherRelSeen: false,
        citations: [],
      });

      const layout = computeTreeLayout(db, 'I1', { portrait: false })!;
      const sibCards = layout.cards.filter((c) => c.isSibling);
      expect(sibCards).toHaveLength(1);
      expect(sibCards[0].id).toBe('I52');
      expect(sibCards[0].isHalfSibling).toBe(true);
    });

    it('Proband selbst taucht nie in der Geschwisterzeile auf', () => {
      const db = buildFourGenTree();
      addSibling(db, 'I42', 'F1');
      const layout = computeTreeLayout(db, 'I1', { portrait: false })!;
      const sibCards = layout.cards.filter((c) => c.isSibling);
      expect(sibCards.some((c) => c.id === 'I1')).toBe(false);
    });

    it('mehrere Geschwister werden nebeneinander (unterschiedliche X, gleiche Y) platziert', () => {
      const db = buildFourGenTree();
      addSibling(db, 'I42', 'F1');
      addSibling(db, 'I43', 'F1');
      const layout = computeTreeLayout(db, 'I1', { portrait: false })!;
      const sibCards = layout.cards.filter((c) => c.isSibling);
      expect(sibCards).toHaveLength(2);
      expect(new Set(sibCards.map((c) => c.x)).size).toBe(2);
      expect(new Set(sibCards.map((c) => c.y)).size).toBe(1);
    });

    it('erzeugt eine T-Verbindungslinie zwischen Eltern-Junktion und jeder Geschwister-Karte', () => {
      const db = buildFourGenTree();
      addSibling(db, 'I42', 'F1');
      const withSibs = computeTreeLayout(db, 'I1', { portrait: false })!;
      const without = computeTreeLayout(db, 'I2', { portrait: false })!; // I2 hat kein famc -> keine Geschwister-Linien
      expect(withSibs.connectors.length).toBeGreaterThan(without.connectors.length);
    });

    it('Geschwisterzeile beeinflusst navTargets nicht (nur Kinder/Eltern/Partner sind Navigationsziele)', () => {
      const db = buildFourGenTree();
      addSibling(db, 'I42', 'F1');
      const layout = computeTreeLayout(db, 'I1', { portrait: false })!;
      expect(layout.navTargets).toEqual({ up: 'I2', up2: 'I3', down: 'I30', right: 'I20' });
    });

    it('bleibt deterministisch mit Geschwistern (gleiche Eingabe -> identisches Ergebnis)', () => {
      const db = buildFourGenTree();
      addSibling(db, 'I42', 'F1');
      const a = computeTreeLayout(db, 'I1', { portrait: false });
      const b = computeTreeLayout(db, 'I1', { portrait: false });
      expect(a).toEqual(b);
    });

    it('Layout-Breite bleibt durch den Ahnen-Fächer begrenzt, auch mit vielen Geschwistern (Regressionsschutz gegen unbegrenztes Breitenwachstum, Nachtrag Auftrag)', () => {
      // Vorher (ohne Kappung) wuchs totalW linear mit nSibs, weil personCX die Geschwister-
      // zeile mit einreservierte. Jetzt hängt personCX NUR vom Ahnen-Fächer ab (Orakel) —
      // die Geschwisterzeile schrumpft/kappt sich in den verfügbaren Platz hinein, totalW
      // bleibt vom Ahnen-Fächer bestimmt (bzw. wächst nur noch marginal durch Rundung).
      const db = buildFourGenTree();
      const before = computeTreeLayout(db, 'I1', { portrait: false })!;
      for (let i = 0; i < 6; i++) addSibling(db, `I6${i}`, 'F1');
      const after = computeTreeLayout(db, 'I1', { portrait: false })!;
      expect(after.width).toBeLessThanOrEqual(before.width);
    });
  });

  describe('Geschwisterzeile: Kappung + Peek-Stapel-Fallback (Orakel legacy-v8 `useHorizSibs`)', () => {
    function addSibling(db: ReturnType<typeof makeDatabase>, id: string, familyId: string): void {
      addPerson(db, id, id);
      db.families.get(familyId)!.children.push(id);
      db.individuals.get(id)!.childOf.push({
        familyId,
        pedigree: 'birth',
        fatherRel: '',
        motherRel: '',
        fatherRelSeen: false,
        motherRelSeen: false,
        citations: [],
      });
    }
    function addManySiblings(db: ReturnType<typeof makeDatabase>, n: number): string[] {
      const ids: string[] = [];
      for (let i = 0; i < n; i++) {
        const id = `SIB${i}`;
        addSibling(db, id, 'F1');
        ids.push(id);
      }
      return ids;
    }

    it('horizontale Zeile mit wenigen Geschwistern (>=3 Ahnen-Ebenen): alle sichtbar, kein Overflow', () => {
      const db = buildFourGenTree();
      addSibling(db, 'I42', 'F1');
      addSibling(db, 'I43', 'F1');
      const layout = computeTreeLayout(db, 'I1', { portrait: false, maxAncestorLevels: 4 })!;
      const sibCards = layout.cards.filter((c) => c.isSibling);
      expect(sibCards).toHaveLength(2);
      expect(layout.siblingOverflow).toBeNull();
    });

    it('horizontale Zeile mit vielen Geschwistern (10) bei >=3 Ahnen-Ebenen: Kappung + Overflow-Indikator', () => {
      const db = buildFourGenTree();
      const ids = addManySiblings(db, 10);
      const layout = computeTreeLayout(db, 'I1', { portrait: false, maxAncestorLevels: 4 })!;
      const sibCards = layout.cards.filter((c) => c.isSibling);

      // nFit < nSibs -> Kappung, Overflow-Indikator vorhanden
      expect(sibCards.length).toBeLessThan(ids.length);
      expect(layout.siblingOverflow).not.toBeNull();
      expect(layout.siblingOverflow!.count).toBe(ids.length - sibCards.length);

      // Kartenbreite geschrumpft, aber nie unter MIN_SIB_W (60 im Landscape)
      const widths = new Set(sibCards.map((c) => c.width));
      expect(widths.size).toBe(1);
      const [w] = [...widths];
      expect(w).toBeLessThanOrEqual(96); // < normale Kartenbreite W
      expect(w).toBeGreaterThanOrEqual(60); // MIN_SIB_W landscape

      // Gesamtbreite bleibt in einem vernünftigen, begrenzten Rahmen — wächst NICHT
      // mehr linear mit nSibs (Regressionsschutz gegen den gemeldeten Bug).
      const dbFew = buildFourGenTree();
      addManySiblings(dbFew, 2);
      const layoutFew = computeTreeLayout(dbFew, 'I1', { portrait: false, maxAncestorLevels: 4 })!;
      // Unterschied zwischen 2 und 10 Geschwistern darf nicht das ~5-fache betragen wie
      // es bei linearem Wachstum (10 vs 2 Karten) der Fall wäre.
      expect(layout.width).toBeLessThan(layoutFew.width * 2);

      // Alle sichtbaren Geschwister-Karten liegen weiterhin links der Proband-Karte.
      const center = layout.cards.find((c) => c.isCenter)!;
      for (const c of sibCards) expect(c.x + c.width).toBeLessThanOrEqual(center.x);

      // Kein Zähler-Badge im Horizontal-Modus (das ist nur der Peek-Stapel-Fallback).
      expect(layout.siblingCountBadge).toBeNull();
    });

    it('„…"-Overflow-Indikator liegt links der sichtbaren Geschwister-Karten, mit Zähler + Tooltip-Text', () => {
      const db = buildFourGenTree();
      addManySiblings(db, 10);
      const layout = computeTreeLayout(db, 'I1', { portrait: false, maxAncestorLevels: 4 })!;
      const overflow = layout.siblingOverflow!;
      const sibCards = layout.cards.filter((c) => c.isSibling);
      expect(overflow.count).toBeGreaterThan(0);
      expect(overflow.title).toBe(`+${overflow.count} Geschwister nicht dargestellt`);
      // volle Kartenhöhe
      const anySib = sibCards[0];
      expect(overflow.height).toBe(anySib.height);
      // links von allen sichtbaren Geschwister-Karten (oder an Stelle davon, falls nFit=0)
      for (const c of sibCards) expect(overflow.x + overflow.width).toBeLessThanOrEqual(c.x + 0.01);
    });

    it('Peek-Stapel-Fallback bei <3 Ahnen-Ebenen: ALLE Geschwister gerendert, kein Overflow, Zähler-Badge vorhanden', () => {
      const db = makeDatabase();
      addPerson(db, 'P');
      addPerson(db, 'VATER', 'Vater', 'M');
      addPerson(db, 'MUTTER', 'Mutter', 'F');
      marry(db, 'F1', 'VATER', 'MUTTER', ['P']);
      const ids = addManySiblings(db, 10);

      // maxAncestorLevels=1 -> nur Elternebene -> ancLevels < 3 -> Peek-Stapel
      const layout = computeTreeLayout(db, 'P', { portrait: false, maxAncestorLevels: 1 })!;
      const sibCards = layout.cards.filter((c) => c.isSibling);
      expect(sibCards).toHaveLength(ids.length); // alle 10, kein Cutoff
      expect(layout.siblingOverflow).toBeNull();
      expect(layout.siblingCountBadge).toBe(ids.length);

      // vertikal versetzt (PEEK-Offset), nicht alle auf derselben Y-Position
      const ys = new Set(sibCards.map((c) => c.y));
      expect(ys.size).toBeGreaterThan(1);

      // Reserviert nur EINE Kartenbreite (keine Breiten-Multiplikation) -> Höhe wächst statt Breite.
      const center = layout.cards.find((c) => c.isCenter)!;
      for (const c of sibCards) {
        expect(c.width).toBe(sibCards[0].width);
        expect(c.x + c.width).toBeLessThanOrEqual(center.x);
      }
    });

    it('Peek-Stapel: Proband-Zähler-Badge nur wenn nSibs > 1', () => {
      const db = buildFourGenTree();
      addSibling(db, 'ONLY', 'F1');
      // Portrait mit 1 Ahnen-Ebene -> Peek-Modus, aber nur 1 Geschwister -> kein Badge.
      const layout = computeTreeLayout(db, 'I1', { portrait: false, maxAncestorLevels: 1 })!;
      expect(layout.cards.filter((c) => c.isSibling)).toHaveLength(1);
      expect(layout.siblingCountBadge).toBeNull();
    });

    it('Modus-Umschaltung ist deterministisch anhand ancLevels (Regressionsschutz 1-2-Geschwister-Fall bleibt unverändert)', () => {
      const db = buildFourGenTree();
      addSibling(db, 'I42', 'F1');
      addSibling(db, 'I43', 'F1');
      // Standard-Optionen (portrait:false -> 4 Ebenen Default): identisch zu vorher.
      const layout = computeTreeLayout(db, 'I1', { portrait: false })!;
      const sibCards = layout.cards.filter((c) => c.isSibling);
      expect(sibCards).toHaveLength(2);
      expect(new Set(sibCards.map((c) => c.width)).size).toBe(1);
      expect(sibCards[0].width).toBeLessThanOrEqual(96);
      expect(layout.siblingOverflow).toBeNull();
      expect(layout.siblingCountBadge).toBeNull();
    });
  });

  it('Person ohne jede Familie: Zentrum-Karte + 2 leere Ahnen-Slots (Ghost-Karten für unbekannte Eltern), keine Kinder/Ehepartner', () => {
    const db = makeDatabase();
    addPerson(db, 'solo');
    const layout = computeTreeLayout(db, 'solo', { portrait: false })!;
    // Orakel-Verhalten (legacy-v8 `tree-card-empty`): Ebene 1 (Eltern) wird immer als
    // 2 Slots gerendert, auch wenn beide unbekannt sind — nur Ebene >=2 überspringt
    // komplett leere Slots. Center-Karte + 2 Ghost-Elternkarten = 3.
    expect(layout.cards).toHaveLength(3);
    const center = layout.cards.find((c) => c.isCenter)!;
    expect(center.id).toBe('solo');
    const ghosts = layout.cards.filter((c) => !c.isCenter);
    expect(ghosts).toHaveLength(2);
    expect(ghosts.every((c) => c.id === null)).toBe(true);
    expect(layout.marriageBadge).toBeNull();
    expect(layout.marriageCount).toBe(0);
  });
});
