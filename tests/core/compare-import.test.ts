// tests/core/compare-import.test.ts — BL-63: Import-Vergleich, Kern (Spec 20 §1.12).
//
// Zwei Bestände, kein Schreiben: `compareImport` klassifiziert jede Person der
// Fremddatei (Übereinstimmung ≥75 · Unsicher 40–74 · Neu <40), `diffPerson` zerlegt ein
// zugeordnetes Paar in Ergänzungen · Konflikte · Identisch. Das Anwenden der Auswahl ist
// ein eigener Bauabschnitt.
import { describe, it, expect } from 'vitest';
import { makePerson, makeFamily, makeEvent } from '../../core/model/factory';
import type { Person, Family, PersonId, FamilyId } from '../../core/model/types';
import {
  compareImport,
  diffPerson,
  IMPORT_MATCH_THRESHOLD,
  IMPORT_UNCERTAIN_THRESHOLD,
  type PersonGraph,
} from '../../core/dedup';

function graph(persons: Person[], families: Family[] = []): PersonGraph {
  return {
    individuals: new Map(persons.map((p) => [p.id, p])),
    families: new Map(families.map((f) => [f.id, f])),
  };
}

function person(id: PersonId, patch: Partial<Person> = {}): Person {
  return makePerson(id, { given: 'Anna', surname: 'Decker', sex: 'F', ...patch });
}

const mitGeburt = (id: PersonId, jahr: string, ort = 'Ochtrup', patch: Partial<Person> = {}): Person =>
  person(id, { birth: makeEvent('BIRT', { date: jahr, place: ort }), ...patch });

// --- Klassifikation ---------------------------------------------------------------

describe('compareImport — Klassifikation', () => {
  it('erkennt eine klare Übereinstimmung', () => {
    const base = graph([mitGeburt('@B1@', '1850')]);
    const imported = graph([mitGeburt('@N1@', '1850')]);
    const [treffer] = compareImport(base, imported);
    expect(treffer.status).toBe('matched');
    expect(treffer.baseId).toBe('@B1@');
    expect(treffer.score).toBeGreaterThanOrEqual(IMPORT_MATCH_THRESHOLD);
  });

  it('stuft eine unsichere Zuordnung als „uncertain" ein, ohne sie zu verwerfen', () => {
    // Gleicher Nachname und Vorname, aber Geburtsjahr weit auseinander → der Malus aus
    // ADR-v9-106 drückt den Score in den mittleren Bereich.
    const base = graph([mitGeburt('@B1@', '1850')]);
    const imported = graph([mitGeburt('@N1@', '1885')]);
    const [treffer] = compareImport(base, imported);
    expect(treffer.status).toBe('uncertain');
    expect(treffer.baseId).toBe('@B1@');
    expect(treffer.score).toBeGreaterThanOrEqual(IMPORT_UNCERTAIN_THRESHOLD);
    expect(treffer.score).toBeLessThan(IMPORT_MATCH_THRESHOLD);
  });

  it('meldet eine unbekannte Person als „new" ohne Basis-Zuordnung', () => {
    const base = graph([mitGeburt('@B1@', '1850')]);
    const imported = graph([person('@N1@', { given: 'Wilhelm', surname: 'Kortmann', sex: 'M' })]);
    const [treffer] = compareImport(base, imported);
    expect(treffer.status).toBe('new');
    expect(treffer.baseId).toBeNull();
  });

  it('meldet jede Person der Fremddatei genau einmal', () => {
    const base = graph([mitGeburt('@B1@', '1850')]);
    const imported = graph([mitGeburt('@N1@', '1850'), mitGeburt('@N2@', '1900')]);
    const ergebnis = compareImport(base, imported);
    expect(ergebnis).toHaveLength(2);
    expect(ergebnis.map((m) => m.importId).sort()).toEqual(['@N1@', '@N2@']);
  });

  it('vergibt eine Basis-Person nicht zweimal als sichere Übereinstimmung', () => {
    // Sonst „gewinnt" dieselbe Basis-Person gegen mehrere Import-Personen und der
    // Nutzer bekommt zwei Zusammenführungen auf dasselbe Ziel vorgeschlagen.
    const base = graph([mitGeburt('@B1@', '1850')]);
    const imported = graph([mitGeburt('@N1@', '1850'), mitGeburt('@N2@', '1850')]);
    const belegt = compareImport(base, imported).filter((m) => m.status === 'matched');
    expect(belegt).toHaveLength(1);
  });

  it('ist deterministisch und mutiert nichts', () => {
    const base = graph([mitGeburt('@B1@', '1850')]);
    const imported = graph([mitGeburt('@N1@', '1850')]);
    expect(compareImport(base, imported)).toEqual(compareImport(base, imported));
    expect(base.individuals.size).toBe(1);
    expect(imported.individuals.size).toBe(1);
  });

  it('kommt mit einem leeren Bestand zurecht — dann ist alles neu', () => {
    const ergebnis = compareImport(graph([]), graph([mitGeburt('@N1@', '1850')]));
    expect(ergebnis).toHaveLength(1);
    expect(ergebnis[0].status).toBe('new');
  });
});

// --- Der Orakel-Fehler ------------------------------------------------------------

describe('compareImport — Verwandtschaft wird im RICHTIGEN Bestand nachgeschlagen', () => {
  it('bewertet Eltern der Import-Person aus der IMPORT-Datei, nicht aus dem Basis-Bestand', () => {
    // Der Fehler des Orakels: `_dedupScorePair` liest für beide Seiten `AppState.db`,
    // `cmpMatchPersons` ruft es aber mit einer Person der Fremddatei auf. Deren
    // Familien-Ids zeigen dann auf eine gleichnamige Familie des Basis-Bestands — hier
    // absichtlich mit VÖLLIG anderen Eltern belegt. Wer im falschen Bestand nachschlägt,
    // findet Franz/Maria und vergibt die Eltern-Punkte fälschlich.
    const gleicheFamId: FamilyId = '@F1@';
    const base = graph(
      [
        mitGeburt('@B1@', '1850', 'Ochtrup', { childOf: [link(gleicheFamId)] }),
        makePerson('@BV@', { given: 'Josef', surname: 'Decker' }),
        makePerson('@BM@', { given: 'Maria', surname: 'Decker' }),
      ],
      [makeFamily(gleicheFamId, { husband: '@BV@', wife: '@BM@', children: ['@B1@'] })],
    );
    // Import-Datei: dieselbe Familien-ID, aber ganz andere Eltern.
    const imported = graph(
      [
        mitGeburt('@N1@', '1850', 'Ochtrup', { childOf: [link(gleicheFamId)] }),
        makePerson('@NV@', { given: 'Zacharias', surname: 'Wüstefeld' }),
        makePerson('@NM@', { given: 'Ottilie', surname: 'Wüstefeld' }),
      ],
      [makeFamily(gleicheFamId, { husband: '@NV@', wife: '@NM@', children: ['@N1@'] })],
    );

    const [treffer] = compareImport(base, imported);
    // Die Eltern widersprechen sich — es darf KEIN „Vater identisch" gemeldet werden.
    expect(treffer.reasons).not.toContain('Vater identisch');
    expect(treffer.reasons).not.toContain('Mutter identisch');
  });
});

// --- Feld-Diff --------------------------------------------------------------------

describe('diffPerson — drei Kategorien', () => {
  it('nennt ein nur in der Import-Datei gefülltes Feld als Ergänzung', () => {
    const b = person('@B1@');
    const n = person('@N1@', { title: 'Hebamme' });
    const diff = diffPerson(b, n);
    expect(diff.additions.map((f) => f.key)).toContain('title');
    expect(diff.additions.find((f) => f.key === 'title')?.importValue).toBe('Hebamme');
  });

  it('nennt zwei verschiedene gefüllte Werte als Konflikt', () => {
    const b = person('@B1@', { title: 'Bäuerin' });
    const n = person('@N1@', { title: 'Hebamme' });
    const diff = diffPerson(b, n);
    const konflikt = diff.conflicts.find((f) => f.key === 'title');
    expect(konflikt?.baseValue).toBe('Bäuerin');
    expect(konflikt?.importValue).toBe('Hebamme');
    expect(diff.additions.map((f) => f.key)).not.toContain('title');
  });

  it('sammelt gleiche Werte als „identisch" (ausblendbar, nicht verschwiegen)', () => {
    const diff = diffPerson(person('@B1@'), person('@N1@'));
    expect(diff.identical.map((f) => f.key)).toContain('surname');
    expect(diff.conflicts).toHaveLength(0);
  });

  it('ein in der Import-Datei LEERES Feld erzeugt keinen Eintrag — Leere ist keine Information', () => {
    // Sonst schlüge der Vergleich vor, einen gepflegten Wert durch nichts zu ersetzen.
    const b = person('@B1@', { title: 'Bäuerin' });
    const n = person('@N1@');
    const diff = diffPerson(b, n);
    expect([...diff.additions, ...diff.conflicts].map((f) => f.key)).not.toContain('title');
  });

  it('meldet ein Ereignis, das nur die Import-Datei kennt, als Ergänzung', () => {
    const b = person('@B1@');
    const n = person('@N1@', { events: [makeEvent('OCCU', { value: 'Schmied', date: '1880' })] });
    const diff = diffPerson(b, n);
    const ev = diff.additions.find((f) => f.key.startsWith('event|'));
    expect(ev).toBeTruthy();
    expect(ev?.importValue).toContain('Schmied');
  });

  it('meldet ein beidseits vorhandenes Ereignis NICHT als Ergänzung', () => {
    const ereignis = () => makeEvent('OCCU', { value: 'Schmied', date: '1880' });
    const diff = diffPerson(person('@B1@', { events: [ereignis()] }), person('@N1@', { events: [ereignis()] }));
    expect(diff.additions.filter((f) => f.key.startsWith('event|'))).toHaveLength(0);
  });

  it('nutzt dieselbe Feldliste wie der Merge — sonst driften die beiden Werkzeuge', () => {
    const b = person('@B1@');
    const n = person('@N1@', {
      title: 'X',
      birth: makeEvent('BIRT', { date: '1850', place: 'Ochtrup' }),
    });
    const alle = [...diffPerson(b, n).additions, ...diffPerson(b, n).conflicts, ...diffPerson(b, n).identical];
    expect(alle.map((f) => f.key)).toContain('birth.date');
    expect(alle.map((f) => f.key)).toContain('birth.place');
    for (const f of alle) expect(f.label.length).toBeGreaterThan(0);
  });
});

function link(familyId: FamilyId) {
  return {
    familyId,
    pedigree: '' as const,
    fatherRel: '',
    motherRel: '',
    fatherRelSeen: false,
    motherRelSeen: false,
    citations: [],
  };
}
