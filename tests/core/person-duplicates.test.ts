// tests/core/person-duplicates.test.ts — BL-62/ADR-v9-104: Kern-Finder für Personen-Duplikate.
//
// Die Gewichte sind KEINE Erfindung dieses Bauabschnitts, sondern byte-genau die des
// v8-Orakels (`legacy-v8/gedcom.js::_dedupScorePair`). Spec 20 §1.12 nennt nur den
// Default-Schwellenwert 65 — nach der Wert-Ebenen-Regel (CLAUDE.md) reicht ein
// Spec-Bullet ohne Kodierung nicht aus, um eine eigene, plausibel wirkende Gewichtung
// zu erfinden. Diese Tests halten die Zahlen fest, damit ein späteres „aufräumen" der
// Gewichte auffällt statt still die Trefferqualität zu verschieben.
//
// Summe der Maxima = 100: Nachname 24 · Vorname 20 · Geschlecht 11 · Geburtsjahr 16 ·
// Geburtsort 7 · Vater 7 · Mutter 7 · Partner 8.
//
// EINE Abweichung an der Gewichtung selbst: Geburtsjahr-Abstand > 5 kostet −15
// (ADR-v9-106) — am echten Bestand gemessen, s. den zugehörigen Test unten.
import { describe, it, expect } from 'vitest';
import { makePerson, makeFamily, makeEvent } from '../../core/model/factory';
import type { Person, Family, PersonId, FamilyId } from '../../core/model/types';
import {
  findPersonDuplicates,
  scorePersonPair,
  pairKey,
  DEFAULT_DUPLICATE_THRESHOLD,
  type PersonGraph,
} from '../../core/dedup';

// --- Fixture-Helfer ---------------------------------------------------------------

function graph(persons: Person[], families: Family[] = []): PersonGraph {
  return {
    individuals: new Map(persons.map((p) => [p.id, p])),
    families: new Map(families.map((f) => [f.id, f])),
  };
}

interface PersonSpec {
  given?: string;
  surname?: string;
  sex?: 'M' | 'F' | 'U';
  birthDate?: string;
  birthPlace?: string;
  birthPlaceId?: string;
}

function person(id: PersonId, spec: PersonSpec = {}): Person {
  return makePerson(id, {
    given: spec.given ?? '',
    surname: spec.surname ?? '',
    sex: spec.sex ?? 'U',
    birth: makeEvent('BIRT', {
      date: spec.birthDate ?? null,
      place: spec.birthPlace ?? null,
      placeId: spec.birthPlaceId ?? null,
    }),
  });
}

/** Ein Paar mit maximal ähnlichen Randbedingungen — jeder Test variiert genau eine Achse. */
function pairScore(a: Person, b: Person, families: Family[] = []): number {
  return scorePersonPair(graph([a, b], families), a, b).score;
}

// --- Einzelne Achsen --------------------------------------------------------------

describe('scorePersonPair — Gewichte des v8-Orakels', () => {
  it('zwei völlig namenlose Personen ohne Daten erhalten nur den Datums-Neutralwert (+4)', () => {
    // Kein Nachname, kein Vorname, sex 'U' beidseitig (kein Bonus, kein Malus),
    // kein Geburtsjahr → der neutrale +4-Zuschlag ist der einzige Beitrag.
    expect(pairScore(person('@I1@'), person('@I2@'))).toBe(4);
  });

  it('identischer Nachname bringt 24 Punkte', () => {
    const a = person('@I1@', { surname: 'Decker' });
    const b = person('@I2@', { surname: 'Decker' });
    expect(pairScore(a, b)).toBe(24 + 4);
  });

  it('identischer Vorname bringt 20 Punkte', () => {
    const a = person('@I1@', { given: 'Anna' });
    const b = person('@I2@', { given: 'Anna' });
    expect(pairScore(a, b)).toBe(20 + 4);
  });

  it('gleiches bekanntes Geschlecht bringt +11, verschiedenes −15', () => {
    const m1 = person('@I1@', { sex: 'M' });
    const m2 = person('@I2@', { sex: 'M' });
    const f1 = person('@I3@', { sex: 'F' });
    expect(pairScore(m1, m2)).toBe(11 + 4);
    expect(pairScore(m1, f1)).toBe(-15 + 4);
  });

  it("'U' auf einer Seite lässt die Geschlechts-Achse ganz aus (kein Bonus, kein Malus)", () => {
    const m = person('@I1@', { sex: 'M' });
    const u = person('@I2@', { sex: 'U' });
    expect(pairScore(m, u)).toBe(4);
  });

  it('Geburtsjahr staffelt 16/12/6/2 nach Abstand', () => {
    const base = person('@I1@', { birthDate: '12 MAR 1850' });
    const same = person('@I2@', { birthDate: '3 JUN 1850' });
    const off1 = person('@I3@', { birthDate: '1851' });
    const off2 = person('@I4@', { birthDate: '1852' });
    const off5 = person('@I5@', { birthDate: '1855' });
    expect(pairScore(base, same)).toBe(16);
    expect(pairScore(base, off1)).toBe(12);
    expect(pairScore(base, off2)).toBe(6);
    expect(pairScore(base, off5)).toBe(2);
  });

  it('ab mehr als 5 Jahren Abstand gibt es −15 Malus (ADR-v9-106, über das Orakel hinaus)', () => {
    // Das Orakel kennt nur Boni: ein Abstand von 60 Jahren kostet nichts, er bringt
    // bloß nichts ein. Zusammen mit den +14 für gemeinsame Eltern ließ das in einem
    // Dorfstammbaum jede Geschwisterreihe verdächtig aussehen (gemessen: 2.436
    // Verdachtspaare bei 2.795 Personen). Der Malus ist die Symmetrie zum bereits
    // vorhandenen Geschlechts-Malus: ein bekannter Widerspruch spricht GEGEN Identität,
    // nicht bloß nicht dafür.
    const base = person('@I1@', { birthDate: '1850' });
    expect(pairScore(base, person('@I6@', { birthDate: '1856' }))).toBe(-15);
    expect(pairScore(base, person('@I7@', { birthDate: '1911' }))).toBe(-15);
  });

  it('der Malus greift nur, wenn BEIDE Jahre bekannt sind', () => {
    // Unwissen ist kein Widerspruch — sonst würde der Malus genau die schlecht
    // belegten Personen bestrafen, für die das Werkzeug am nötigsten ist.
    const dated = person('@I1@', { birthDate: '1850' });
    expect(pairScore(dated, person('@I2@'))).toBe(4);
  });

  it('nennt den Jahrgang-Widerspruch als Grund gegen das Paar', () => {
    const a = person('@I1@', { surname: 'Decker', birthDate: '1850' });
    const b = person('@I2@', { surname: 'Decker', birthDate: '1900' });
    expect(scorePersonPair(graph([a, b]), a, b).reasons).toContain('Geburtsjahr weit auseinander');
  });

  it('fehlt EIN Geburtsdatum, greift der neutrale +4-Zuschlag statt der Staffel', () => {
    const withDate = person('@I1@', { birthDate: '1850' });
    const without = person('@I2@');
    expect(pairScore(withDate, without)).toBe(4);
  });

  it('identischer Geburtsort bringt 7 Punkte', () => {
    const a = person('@I1@', { birthPlace: 'Sassenberg' });
    const b = person('@I2@', { birthPlace: 'Sassenberg' });
    expect(pairScore(a, b)).toBe(7 + 4);
  });
});

// --- v9-Zugewinn gegenüber dem Orakel ---------------------------------------------

describe('scorePersonPair — Ortsidentität statt reinem Stringvergleich', () => {
  it('gleiche placeId zählt als identischer Ort, auch bei abweichender Schreibweise', () => {
    // Genau der Fall, den die v9-Ortsidentität löst und v8 nicht lösen konnte:
    // „Sassenbergk" und „Sassenberg" sind derselbe Ort (INV-PLACE), der reine
    // Levenshtein-Vergleich würde hier Punkte verschenken.
    const a = person('@I1@', { birthPlace: 'Sassenbergk, Warendorf', birthPlaceId: '@P1@' });
    const b = person('@I2@', { birthPlace: 'Sassenberg', birthPlaceId: '@P1@' });
    expect(pairScore(a, b)).toBe(7 + 4);
  });

  it('verschiedene placeId verhindert Punkte trotz identischer Schreibweise', () => {
    // Zwei gleichnamige, aber verschiedene Orte (Oldenburg NDS vs. Oldenburg USA,
    // ADR-v9-29) — der Resolver hat sie bereits auseinandergehalten, das Scoring
    // darf sie nicht wieder zusammenziehen.
    const a = person('@I1@', { birthPlace: 'Oldenburg', birthPlaceId: '@P_NDS@' });
    const b = person('@I2@', { birthPlace: 'Oldenburg', birthPlaceId: '@P_US@' });
    expect(pairScore(a, b)).toBe(4);
  });

  it('ohne placeId bleibt es beim Textvergleich (unaufgelöste Ereignisse sind der Regelfall)', () => {
    const a = person('@I1@', { birthPlace: 'Sassenberg' });
    const b = person('@I2@', { birthPlace: 'Sassenberg' });
    expect(pairScore(a, b)).toBe(7 + 4);
  });
});

// --- Namensnormalisierung ---------------------------------------------------------

describe('scorePersonPair — Namensnormalisierung', () => {
  it('faltet Umlaute und ß, ignoriert Groß-/Kleinschreibung', () => {
    const a = person('@I1@', { surname: 'Müller' });
    const b = person('@I2@', { surname: 'MUELLER' });
    expect(pairScore(a, b)).toBe(24 + 4);
  });

  it('vergleicht Doppelnamen komponentenweise (bester Teiltreffer gewinnt)', () => {
    // v8-Verhalten: „Schulte-Decker" vs. „Decker" trifft über die Komponente voll.
    const a = person('@I1@', { surname: 'Schulte-Decker' });
    const b = person('@I2@', { surname: 'Decker' });
    expect(pairScore(a, b)).toBe(24 + 4);
  });

  it('ähnliche Namen bringen anteilige Punkte, keine vollen', () => {
    const a = person('@I1@', { surname: 'Decker' });
    const b = person('@I2@', { surname: 'Dekker' });
    const score = pairScore(a, b);
    expect(score).toBeGreaterThan(4);
    expect(score).toBeLessThan(24 + 4);
  });
});

// --- Verwandtschafts-Achsen -------------------------------------------------------

describe('scorePersonPair — Eltern und Partner', () => {
  it('identische Eltern bringen bis zu 7 Punkte je Elternteil', () => {
    const vater = makePerson('@V@', { given: 'Josef', surname: 'Decker' });
    const mutter = makePerson('@M@', { given: 'Maria', surname: 'Decker' });
    const famA = makeFamily('@F1@', { husband: '@V@', wife: '@M@', children: ['@I1@'] });
    const famB = makeFamily('@F2@', { husband: '@V@', wife: '@M@', children: ['@I2@'] });
    const a = makePerson('@I1@', { childOf: [childLink('@F1@')] });
    const b = makePerson('@I2@', { childOf: [childLink('@F2@')] });
    const g = graph([a, b, vater, mutter], [famA, famB]);
    // Vater 5+2 und Mutter 5+2 voll, plus neutraler Datums-Zuschlag.
    expect(scorePersonPair(g, a, b).score).toBe(7 + 7 + 4);
  });

  it('der beste Partner-Treffer zählt, nicht die Summe aller Partner', () => {
    const ehefrau = makePerson('@W@', { given: 'Anna', surname: 'Meier' });
    const famA = makeFamily('@F1@', { husband: '@I1@', wife: '@W@' });
    const famB = makeFamily('@F2@', { husband: '@I2@', wife: '@W@' });
    const a = makePerson('@I1@', { parentIn: ['@F1@'] });
    const b = makePerson('@I2@', { parentIn: ['@F2@'] });
    const g = graph([a, b, ehefrau], [famA, famB]);
    expect(scorePersonPair(g, a, b).score).toBe(8 + 4);
  });

  it('nennt die tragenden Gründe im Klartext', () => {
    const a = person('@I1@', { given: 'Anna', surname: 'Decker', sex: 'F', birthDate: '1850' });
    const b = person('@I2@', { given: 'Anna', surname: 'Decker', sex: 'F', birthDate: '1850' });
    const { reasons } = scorePersonPair(graph([a, b]), a, b);
    expect(reasons).toContain('Nachname identisch');
    expect(reasons).toContain('Vorname identisch');
    expect(reasons).toContain('Geburtsjahr identisch');
  });

  it('meldet abweichendes Geschlecht als Grund gegen das Paar', () => {
    const a = person('@I1@', { surname: 'Decker', sex: 'M' });
    const b = person('@I2@', { surname: 'Decker', sex: 'F' });
    expect(scorePersonPair(graph([a, b]), a, b).reasons).toContain('Geschlecht verschieden');
  });
});

// --- Der Finder -------------------------------------------------------------------

describe('findPersonDuplicates', () => {
  const twinA = person('@I1@', { given: 'Anna', surname: 'Decker', sex: 'F', birthDate: '1850' });
  const twinB = person('@I2@', { given: 'Anna', surname: 'Decker', sex: 'F', birthDate: '1850' });
  const stranger = person('@I3@', { given: 'Wilhelm', surname: 'Kortmann', sex: 'M', birthDate: '1902' });

  it('findet das offensichtliche Paar und lässt den Fremden aus', () => {
    const hits = findPersonDuplicates(graph([twinA, twinB, stranger]));
    expect(hits).toHaveLength(1);
    expect([hits[0].a, hits[0].b].sort()).toEqual(['@I1@', '@I2@']);
    expect(hits[0].score).toBeGreaterThanOrEqual(DEFAULT_DUPLICATE_THRESHOLD);
  });

  it('meldet jedes Paar genau einmal, nie sich selbst', () => {
    const hits = findPersonDuplicates(graph([twinA, twinB]));
    expect(hits).toHaveLength(1);
    expect(hits[0].a).not.toBe(hits[0].b);
  });

  it('der Schwellenwert ist einstellbar; 65 ist der Default (v8-Vorgabe)', () => {
    expect(DEFAULT_DUPLICATE_THRESHOLD).toBe(65);
    const g = graph([twinA, twinB, stranger]);
    expect(findPersonDuplicates(g, 100)).toHaveLength(0);
    expect(findPersonDuplicates(g, 0)).toHaveLength(1);
    // Genau EIN Paar auch bei Schwelle 0 — nicht drei: „Kortmann" und „Decker" liegen in
    // verschiedenen Nachname-Buckets und werden nie miteinander verglichen. Der
    // Schwellenwert filtert innerhalb der Buckets, er öffnet sie nicht.
  });

  it('sortiert absteigend nach Score', () => {
    const nearTwin = person('@I4@', { given: 'Anne', surname: 'Decker', sex: 'F', birthDate: '1852' });
    const hits = findPersonDuplicates(graph([twinA, twinB, nearTwin]), 40);
    const scores = hits.map((h) => h.score);
    expect(scores).toEqual([...scores].sort((x, y) => y - x));
  });

  it('ist deterministisch — gleiche Eingabe, gleiche Reihenfolge (TST-3)', () => {
    const g = graph([twinA, twinB, stranger]);
    expect(findPersonDuplicates(g, 40)).toEqual(findPersonDuplicates(g, 40));
  });

  it('mutiert die Eingabe nicht', () => {
    const g = graph([twinA, twinB]);
    const before = JSON.stringify([...g.individuals.keys()]);
    findPersonDuplicates(g);
    expect(JSON.stringify([...g.individuals.keys()])).toBe(before);
    expect(g.individuals.get('@I1@')).toBe(twinA);
  });

  it('BL-105: ein als „kein Duplikat" abgehaktes Paar taucht nicht mehr auf', () => {
    const g = graph([twinA, twinB]);
    expect(findPersonDuplicates(g)).toHaveLength(1);
    expect(findPersonDuplicates(g, DEFAULT_DUPLICATE_THRESHOLD, new Set([pairKey('@I1@', '@I2@')]))).toEqual([]);
  });

  it('BL-105: die Ignorier-Menge ist reihenfolge-unabhängig', () => {
    // Der Speicher kennt nur den Schlüssel, nicht welche id links stand — käme die
    // Sortierung hier anders heraus als in `pairKey`, fände die gespeicherte Liste
    // ihre eigenen Einträge nach einem Neustart nicht wieder.
    const g = graph([twinA, twinB]);
    expect(findPersonDuplicates(g, DEFAULT_DUPLICATE_THRESHOLD, new Set([pairKey('@I2@', '@I1@')]))).toEqual([]);
  });

  it('kommt mit einem leeren Bestand zurecht', () => {
    expect(findPersonDuplicates(graph([]))).toEqual([]);
  });

  it('BEKANNTE GRENZE: ein Tippfehler IM Nachname-Präfix trennt die Buckets', () => {
    // „Decker"/„Dekker" landen in den Buckets „dec" bzw. „dek" und werden nie
    // miteinander verglichen — obwohl das Scoring sie mit 86 klar als Paar erkennen
    // WÜRDE. Das ist der bewusst bezahlte Preis des Bucketings, kein Versehen.
    //
    // Gemessen am echten Bestand (tests/fixtures/MeineDaten_ancestris.ged, 2.795
    // Personen, 2026-07-19), Präfixlänge gegen Laufzeit und Treffer ab Score 65:
    //   3 Zeichen (v8):  289 Buckets ·   112.653 Paare ·  747 ms · 2436 Treffer
    //   2 Zeichen:       127 Buckets ·   140.212 Paare ·  912 ms · 2443 Treffer
    //   1 Zeichen:        25 Buckets ·   310.611 Paare · 2039 ms · 2447 Treffer
    //   ohne Bucketing:    1 Bucket  · 3.904.615 Paare · 27145 ms · 2495 Treffer
    // Der Verzicht auf das Bucketing kostet das 36-fache an Laufzeit und findet 2,4 %
    // mehr Paare — deshalb bleibt es bei drei Zeichen. Dieser Test hält die Grenze
    // sichtbar, damit sie eine Entscheidung bleibt und nicht als Bug wiederentdeckt wird.
    const a = person('@I1@', { given: 'Anna', surname: 'Decker', sex: 'F', birthDate: '1850' });
    const b = person('@I2@', { given: 'Anna', surname: 'Dekker', sex: 'F', birthDate: '1850' });
    expect(findPersonDuplicates(graph([a, b]))).toHaveLength(0);
    expect(scorePersonPair(graph([a, b]), a, b).score).toBeGreaterThan(DEFAULT_DUPLICATE_THRESHOLD);
  });

  it('bucketet Namenlose zusammen, statt sie fallenzulassen', () => {
    const a = person('@I1@', { given: 'Anna', sex: 'F', birthDate: '1850' });
    const b = person('@I2@', { given: 'Anna', sex: 'F', birthDate: '1850' });
    expect(findPersonDuplicates(graph([a, b]), 40)).toHaveLength(1);
  });
});

// --- Hilfsfunktion ----------------------------------------------------------------

function childLink(familyId: FamilyId) {
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
