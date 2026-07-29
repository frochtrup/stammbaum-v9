// tests/ui/person-list-model.test.ts — Personen-Liste: alphabetische Gruppierung +
// Buchstaben-Trenner, Sortier-Umschalter Name⇄Geburtsdatum, Suche, erweiterte Filter
// (Spec 20 §1.4 [K], Kontrakt Spec 32 §6 "Komponente" — die Gruppierungs-/Filterlogik
// selbst ist aber reine Funktion, deshalb hier statt als Component-Test, s. TST-5
// Testpyramide).
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, makeFamily, makeCitation, makeMediaCitation } from '../../core/model';
import type { ChildLink } from '../../core/model/types';
import { makePlaceRegistry, makeHofRegistry, type PlaceContext } from '../../core/places';
import {
  buildPersonGroups,
  filterAndSortPersons,
  defaultPersonFilters,
  type PersonFilters,
} from '../../ui/views/person/person-list-model';

function emptyContext(): PlaceContext {
  return { places: makePlaceRegistry(new Map()), hofs: makeHofRegistry(new Map()) };
}

describe('Medien-Badge (Spec 20 §1.4 [K], ADR-v9-79 Punkt 3) — hasMedia-Feld je Zeile', () => {
  it('Person mit Medien-Eintrag → hasMedia=true', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.media.push(makeMediaCitation('foto.jpg'));
    db.individuals.set('@I1@', p);

    const groups = buildPersonGroups(db, emptyContext());

    expect(groups[0].rows[0].hasMedia).toBe(true);
  });

  it('Person ohne Medien → hasMedia=false', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Bauer' }));

    const groups = buildPersonGroups(db, emptyContext());

    expect(groups[0].rows[0].hasMedia).toBe(false);
  });
});

describe('buildPersonGroups — alphabetische Gruppierung mit Buchstaben-Trenner', () => {
  it('gruppiert Personen nach dem ersten Buchstaben des Nachnamens, Gruppen sortiert', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Bauer' }));
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Otto', surname: 'Meyer' }));
    db.individuals.set('@I3@', makePerson('@I3@', { given: 'Bert', surname: 'Bauer' }));

    const groups = buildPersonGroups(db, emptyContext());

    expect(groups.map((g) => g.letter)).toEqual(['B', 'M']);
    expect(groups[0].rows.map((r) => r.name)).toEqual(['Anna Bauer', 'Bert Bauer']);
    expect(groups[1].rows.map((r) => r.name)).toEqual(['Otto Meyer']);
  });

  it('liefert eine leere Gruppenliste, wenn keine Personen geladen sind', () => {
    const db = makeDatabase();
    expect(buildPersonGroups(db, emptyContext())).toEqual([]);
  });

  it('fällt bei fehlendem Nachnamen auf den Vornamen zurück (kein Absturz bei Teil-Daten)', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'NurVorname', surname: '' }));

    const groups = buildPersonGroups(db, emptyContext());

    expect(groups).toHaveLength(1);
    expect(groups[0].letter).toBe('N');
  });

  it('fällt bei komplett fehlendem Namen auf "#" als Sammel-Buchstaben zurück', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));

    const groups = buildPersonGroups(db, emptyContext());

    expect(groups).toHaveLength(1);
    expect(groups[0].letter).toBe('#');
  });

  it('markiert die "#"-Gruppe als nameless=true, alphabetische Gruppen als false (ADR-v9-121)', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@')); // namenlos → "#"
    db.individuals.set('@I2@', makePerson('@I2@')); // namenlos → "#"
    db.individuals.set('@I3@', makePerson('@I3@', { given: 'Anna', surname: 'Bauer' }));

    const groups = buildPersonGroups(db, emptyContext());

    const nameless = groups.find((g) => g.nameless);
    expect(nameless).toBeTruthy();
    expect(nameless!.letter).toBe('#');
    expect(nameless!.rows).toHaveLength(2); // beide Namenlosen in EINER Gruppe
    expect(groups.find((g) => g.letter === 'B')?.nameless).toBe(false);
  });

  it('im Geburtsdatum-Modus ist keine Gruppe nameless (kein Kollabieren ohne Buchstaben-Trenner)', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));

    const groups = buildPersonGroups(db, emptyContext(), 'birthDate');

    expect(groups.every((g) => g.nameless === false)).toBe(true);
  });

  it('zeigt Geburts-/Sterbejahr in der Zeilen-Zusammenfassung, wenn im Modell vorhanden', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.date = '1 JAN 1900';
    p.death.date = '1 JAN 1980';
    db.individuals.set('@I1@', p);

    const groups = buildPersonGroups(db, emptyContext());

    expect(groups[0].rows[0].birthSummary).toContain('1900');
    expect(groups[0].rows[0].deathSummary).toContain('1980');
  });

  it('im Geburtsdatum-Modus: EINE Gruppe ohne Buchstaben-Trenner, chronologisch sortiert', () => {
    const db = makeDatabase();
    const a = makePerson('@I1@', { given: 'Anna', surname: 'Zorn' });
    a.birth.date = '1 JAN 1950';
    const b = makePerson('@I2@', { given: 'Otto', surname: 'Adler' });
    b.birth.date = '1 JAN 1900';
    db.individuals.set('@I1@', a);
    db.individuals.set('@I2@', b);

    const groups = buildPersonGroups(db, emptyContext(), 'birthDate');

    expect(groups).toHaveLength(1);
    expect(groups[0].letter).toBeNull();
    expect(groups[0].rows.map((r) => r.name)).toEqual(['Otto Adler', 'Anna Zorn']);
  });

  it('im Geburtsdatum-Modus: leere Liste bleibt leer (kein Absturz)', () => {
    const db = makeDatabase();
    expect(buildPersonGroups(db, emptyContext(), 'birthDate')).toEqual([]);
  });
});

describe('filterAndSortPersons — Sortier-Umschalter Name ⇄ Geburtsdatum', () => {
  function db3() {
    const db = makeDatabase();
    const a = makePerson('@I1@', { given: 'Carl', surname: 'Zorn' });
    a.birth.date = '1 JAN 1950';
    const b = makePerson('@I2@', { given: 'Anna', surname: 'Adler' });
    b.birth.date = '1 JAN 1900';
    const c = makePerson('@I3@', { given: 'Bert', surname: 'Meyer' }); // kein Geburtsdatum
    db.individuals.set('@I1@', a);
    db.individuals.set('@I2@', b);
    db.individuals.set('@I3@', c);
    return db;
  }

  it('sortiert im Name-Modus alphabetisch nach Anzeigenamen', () => {
    const rows = filterAndSortPersons(db3(), emptyContext(), 'name', '', defaultPersonFilters());
    expect(rows.map((p) => p.id)).toEqual(['@I2@', '@I3@', '@I1@']); // Adler, Meyer, Zorn
  });

  it('sortiert im Geburtsdatum-Modus chronologisch, fehlendes Datum ans Ende', () => {
    const rows = filterAndSortPersons(db3(), emptyContext(), 'birthDate', '', defaultPersonFilters());
    expect(rows.map((p) => p.id)).toEqual(['@I2@', '@I1@', '@I3@']); // 1900, 1950, (fehlt)
  });

  it('Regression: sortiert im Name-Modus nach NACHNAME, nicht nach Vornamen (Vorname/Nachname-Reihenfolge bewusst gegenläufig)', () => {
    // db3() hätte den Bug nicht gefangen: dort läuft Vorname-Alphabet zufällig parallel
    // zum Nachname-Alphabet (Carl Zorn/Anna Adler/Bert Meyer → C/A/B passt zufällig zu Z/A/M
    // in derselben Reihenfolge). Hier divergieren beide bewusst.
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Zeder' })); // Vorname A, Nachname Z
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Otto', surname: 'Anders' })); // Vorname O, Nachname A
    db.individuals.set('@I3@', makePerson('@I3@', { given: 'Carl', surname: 'Mueller' })); // Vorname C, Nachname M

    const rows = filterAndSortPersons(db, emptyContext(), 'name', '', defaultPersonFilters());
    // Nach Nachname: Anders(@I2@), Mueller(@I3@), Zeder(@I1@) — NICHT nach Vorname
    // (das wäre Anna(@I1@), Carl(@I3@), Otto(@I2@)).
    expect(rows.map((p) => p.id)).toEqual(['@I2@', '@I3@', '@I1@']);
  });
});

describe('filterAndSortPersons — Live-Suche über Name/Titel/Ereignisse/Notizen/Religion', () => {
  it('findet über den Namen', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Bauer' }));
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Otto', surname: 'Meyer' }));

    const rows = filterAndSortPersons(db, emptyContext(), 'name', 'bauer', defaultPersonFilters());
    expect(rows.map((p) => p.id)).toEqual(['@I1@']);
  });

  it('findet über die Religion', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Bauer', religion: 'katholisch' }));
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Otto', surname: 'Meyer', religion: 'evangelisch' }));

    const rows = filterAndSortPersons(db, emptyContext(), 'name', 'katholisch', defaultPersonFilters());
    expect(rows.map((p) => p.id)).toEqual(['@I1@']);
  });

  it('findet über ein Ereignis (value)', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.events.push({ ...p.birth, type: 'OCCU', value: 'Schmiedin' });
    db.individuals.set('@I1@', p);
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Otto', surname: 'Meyer' }));

    const rows = filterAndSortPersons(db, emptyContext(), 'name', 'schmiedin', defaultPersonFilters());
    expect(rows.map((p) => p.id)).toEqual(['@I1@']);
  });

  it('findet über die Notiz', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Bauer', noteText: 'Auswanderer' }));
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Otto', surname: 'Meyer' }));

    const rows = filterAndSortPersons(db, emptyContext(), 'name', 'auswanderer', defaultPersonFilters());
    expect(rows.map((p) => p.id)).toEqual(['@I1@']);
  });

  it('leere Suche liefert alle Personen', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Bauer' }));
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Otto', surname: 'Meyer' }));

    const rows = filterAndSortPersons(db, emptyContext(), 'name', '', defaultPersonFilters());
    expect(rows).toHaveLength(2);
  });

  it('liefert eine leere Liste, wenn nichts passt (kein Absturz)', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Bauer' }));

    const rows = filterAndSortPersons(db, emptyContext(), 'name', 'nonexistent-query', defaultPersonFilters());
    expect(rows).toEqual([]);
  });
});

describe('filterAndSortPersons — erweiterte Filter (jede Dimension einzeln + kombiniert)', () => {
  function seeded() {
    const db = makeDatabase();
    const m = makePerson('@I1@', { given: 'Otto', surname: 'Bauer', sex: 'M' });
    m.birth.date = '1 JAN 1900';
    m.birth.place = 'Hildesheim';
    m.death.date = '1 JAN 1970';
    m.topLevelCitations.push(makeCitation('@S1@'));

    const f = makePerson('@I2@', { given: 'Anna', surname: 'Klein', sex: 'F' });
    f.birth.date = '1 JAN 1950';
    f.birth.place = 'Hannover';
    // kein Todesdatum, keine Quellen, keine Eltern

    const u = makePerson('@I3@', { given: 'X', surname: 'Unbekannt' });
    // sex bleibt 'U' (INV-P1 Default)

    db.individuals.set('@I1@', m);
    db.individuals.set('@I2@', f);
    db.individuals.set('@I3@', u);
    return db;
  }

  it('filtert nach Geschlecht M', () => {
    const filters: PersonFilters = { ...defaultPersonFilters(), sex: 'M' };
    const rows = filterAndSortPersons(seeded(), emptyContext(), 'name', '', filters);
    expect(rows.map((p) => p.id)).toEqual(['@I1@']);
  });

  it('filtert nach Geschlecht U (inkl. leerem sex)', () => {
    const filters: PersonFilters = { ...defaultPersonFilters(), sex: 'U' };
    const rows = filterAndSortPersons(seeded(), emptyContext(), 'name', '', filters);
    expect(rows.map((p) => p.id)).toEqual(['@I3@']);
  });

  it('filtert nach Geburtsjahr-Bereich', () => {
    const filters: PersonFilters = { ...defaultPersonFilters(), birthYearFrom: 1940, birthYearTo: 1960 };
    const rows = filterAndSortPersons(seeded(), emptyContext(), 'name', '', filters);
    expect(rows.map((p) => p.id)).toEqual(['@I2@']);
  });

  it('Geburtsjahr-Filter schließt Personen ohne Geburtsdatum aus', () => {
    const filters: PersonFilters = { ...defaultPersonFilters(), birthYearFrom: 1800 };
    const rows = filterAndSortPersons(seeded(), emptyContext(), 'name', '', filters);
    expect(rows.map((p) => p.id).sort()).toEqual(['@I1@', '@I2@']);
  });

  it('filtert nach Geburtsort (Textmatch, case-insensitive)', () => {
    const filters: PersonFilters = { ...defaultPersonFilters(), birthPlace: 'hildesheim' };
    const rows = filterAndSortPersons(seeded(), emptyContext(), 'name', '', filters);
    expect(rows.map((p) => p.id)).toEqual(['@I1@']);
  });

  it('filtert nach "kein Sterbedatum"', () => {
    const filters: PersonFilters = { ...defaultPersonFilters(), noDeathDate: true };
    const rows = filterAndSortPersons(seeded(), emptyContext(), 'name', '', filters);
    expect(rows.map((p) => p.id).sort()).toEqual(['@I2@', '@I3@']);
  });

  it('filtert nach "keine Quellen"', () => {
    const filters: PersonFilters = { ...defaultPersonFilters(), noSources: true };
    const rows = filterAndSortPersons(seeded(), emptyContext(), 'name', '', filters);
    expect(rows.map((p) => p.id).sort()).toEqual(['@I2@', '@I3@']);
  });

  it('filtert nach "keine Eltern"', () => {
    const filters: PersonFilters = { ...defaultPersonFilters(), noParents: true };
    const rows = filterAndSortPersons(seeded(), emptyContext(), 'name', '', filters);
    expect(rows.map((p) => p.id).sort()).toEqual(['@I1@', '@I2@', '@I3@']);
  });

  it('kombiniert Geschlecht + Geburtsjahr-Bereich', () => {
    const filters: PersonFilters = { ...defaultPersonFilters(), sex: 'F', birthYearFrom: 1900, birthYearTo: 2000 };
    const rows = filterAndSortPersons(seeded(), emptyContext(), 'name', '', filters);
    expect(rows.map((p) => p.id)).toEqual(['@I2@']);
  });

  it('kombiniert Suche + Filter: leere Liste, wenn nichts übrig bleibt', () => {
    const filters: PersonFilters = { ...defaultPersonFilters(), sex: 'M' };
    const rows = filterAndSortPersons(seeded(), emptyContext(), 'name', 'anna', filters);
    expect(rows).toEqual([]);
  });
});

describe('BL-195 — Geschlecht + Kekulé-Ziffer je Zeile', () => {
  function childLink(familyId: string): ChildLink {
    return { familyId, pedigree: 'birth', fatherRel: '', motherRel: '', fatherRelSeen: false, motherRelSeen: false, citations: [] };
  }

  function dbWithChildAndFather() {
    const db = makeDatabase();
    const father = makePerson('@I2@', { given: 'Otto', surname: 'Bauer', sex: 'M' });
    const child = makePerson('@I1@', { given: 'Anna', surname: 'Bauer', sex: 'F', childOf: [childLink('@F1@')] });
    db.individuals.set('@I2@', father);
    db.individuals.set('@I1@', child);
    db.families.set('@F1@', makeFamily('@F1@', { husband: '@I2@', children: ['@I1@'] }));
    return db;
  }

  it('sex-Feld wird je Zeile durchgereicht', () => {
    const db = dbWithChildAndFather();
    const rows = buildPersonGroups(db, emptyContext()).flatMap((g) => g.rows);
    expect(rows.find((r) => r.id === '@I1@')?.sex).toBe('F');
    expect(rows.find((r) => r.id === '@I2@')?.sex).toBe('M');
  });

  it('mit Proband → Kekulé: Proband=1, Vater=2 (geteiltes computeKekuleNumbers)', () => {
    const db = dbWithChildAndFather();
    const rows = buildPersonGroups(db, emptyContext(), 'name', '', defaultPersonFilters(), '@I1@').flatMap((g) => g.rows);
    expect(rows.find((r) => r.id === '@I1@')?.kekule).toBe(1);
    expect(rows.find((r) => r.id === '@I2@')?.kekule).toBe(2);
  });

  it('ohne Proband → keine Ahnenziffern (null)', () => {
    const db = dbWithChildAndFather();
    const rows = buildPersonGroups(db, emptyContext()).flatMap((g) => g.rows);
    expect(rows.every((r) => r.kekule === null)).toBe(true);
  });
});
