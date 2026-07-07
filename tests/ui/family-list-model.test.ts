// tests/ui/family-list-model.test.ts — Familien-Listen-Aufbereitung (Spec 20 §1.5 [K]):
// Elternpaar-Namen, Heiratsdatum, Kinderzahl, Sortier-Umschalter (3 Zustände), Suche,
// erweiterte Filter. Reine Funktion, deshalb Unit- statt Component-Test (TST-5).
import { describe, expect, it } from 'vitest';
import { makeDatabase, makeFamily, makePerson, makeCitation } from '../../core/model';
import { makePlaceRegistry, makeHofRegistry, type PlaceContext } from '../../core/places';
import {
  buildFamilyRows,
  filterAndSortFamilies,
  defaultFamilyFilters,
  type FamilyFilters,
} from '../../ui/views/family/family-list-model';

function emptyContext(): PlaceContext {
  return { places: makePlaceRegistry(new Map()), hofs: makeHofRegistry(new Map()) };
}

describe('buildFamilyRows — Elternpaar/Heiratsdatum/Kinderzahl, alphabetisch sortiert', () => {
  it('baut eine Zeile mit Elternpaar-Label, Heirats-Zusammenfassung und Kinderzahl', () => {
    const db = makeDatabase();
    const husband = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    const wife = makePerson('@I2@', { given: 'Anna', surname: 'Klein' });
    const child = makePerson('@I3@', { given: 'Karl', surname: 'Bauer' });
    const f = makeFamily('@F1@', { husband: '@I1@', wife: '@I2@', children: ['@I3@'] });
    f.marriage.date = '1 JAN 1920';

    db.individuals.set('@I1@', husband);
    db.individuals.set('@I2@', wife);
    db.individuals.set('@I3@', child);
    db.families.set('@F1@', f);

    const rows = buildFamilyRows(db, emptyContext());

    expect(rows).toHaveLength(1);
    expect(rows[0].parentsLabel).toBe('Otto Bauer ⚭ Anna Klein');
    expect(rows[0].marriageSummary).toContain('1920');
    expect(rows[0].childCount).toBe(1);
  });

  it('zeigt "Unbekannte Familie" als Label, wenn weder Ehemann noch Ehefrau aufgelöst werden können', () => {
    const db = makeDatabase();
    db.families.set('@F1@', makeFamily('@F1@'));

    const rows = buildFamilyRows(db, emptyContext());

    expect(rows[0].parentsLabel).toBe('Unbekannte Familie');
  });

  it('sortiert Familien im Default-Modus (husbandSurname) alphabetisch', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Zora', surname: 'Zimmer' }));
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Anna', surname: 'Adler' }));
    db.families.set('@F1@', makeFamily('@F1@', { husband: '@I1@' }));
    db.families.set('@F2@', makeFamily('@F2@', { husband: '@I2@' }));

    const rows = buildFamilyRows(db, emptyContext());

    expect(rows.map((r) => r.id)).toEqual(['@F2@', '@F1@']);
  });

  it('Regression: sortiert nach Nachname Ehemann auch, wenn nur p.name (Slash-Form) gesetzt ist, kein GIVN/SURN', () => {
    // Reales GEDCOM ohne explizite GIVN/SURN-Untertags (core/interop/gedcom-parse.ts
    // liest given/surname NUR aus GIVN/SURN) lässt p.given/p.surname leer — nur p.name
    // ("Otto /Anders/") ist gesetzt. Ohne den surnameCandidate()-Fallback in
    // family-list-model.ts fiel die Sortierung hier still auf Label-Text-Vergleich
    // zurück (im Bugfall: alphabetisch nach VORNAME statt Nachname) — am echten
    // Browser-Import gefunden, nicht am Modell-Factory-Testpfad.
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { name: 'Otto /Anders/' })); // given/surname leer
    db.individuals.set('@I2@', makePerson('@I2@', { name: 'Carl /Mueller/' })); // given/surname leer
    db.families.set('@F1@', makeFamily('@F1@', { husband: '@I1@' })); // Anders
    db.families.set('@F2@', makeFamily('@F2@', { husband: '@I2@' })); // Mueller

    const rows = buildFamilyRows(db, emptyContext());

    // Anders < Mueller — NICHT nach Vornamen (Carl < Otto, was @F2@ zuerst gäbe).
    expect(rows.map((r) => r.id)).toEqual(['@F1@', '@F2@']);
  });

  it('zeigt 0 als Kinderzahl, wenn keine Kinder erfasst sind', () => {
    const db = makeDatabase();
    db.families.set('@F1@', makeFamily('@F1@'));

    const rows = buildFamilyRows(db, emptyContext());

    expect(rows[0].childCount).toBe(0);
  });
});

describe('filterAndSortFamilies — Sortier-Umschalter mit drei Zuständen', () => {
  function db3() {
    const db = makeDatabase();
    // F1: Ehemann Zimmer, Ehefrau Adler, Heirat 1950
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Otto', surname: 'Zimmer' }));
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Anna', surname: 'Adler' }));
    const f1 = makeFamily('@F1@', { husband: '@I1@', wife: '@I2@' });
    f1.marriage.date = '1 JAN 1950';

    // F2: Ehemann Adler, Ehefrau Zimmer, Heirat 1900
    db.individuals.set('@I3@', makePerson('@I3@', { given: 'Karl', surname: 'Adler' }));
    db.individuals.set('@I4@', makePerson('@I4@', { given: 'Berta', surname: 'Zimmer' }));
    const f2 = makeFamily('@F2@', { husband: '@I3@', wife: '@I4@' });
    f2.marriage.date = '1 JAN 1900';

    // F3: kein Ehemann/Ehefrau, kein Heiratsdatum
    const f3 = makeFamily('@F3@', {});

    db.families.set('@F1@', f1);
    db.families.set('@F2@', f2);
    db.families.set('@F3@', f3);
    return db;
  }

  it('sortiert nach Nachname Ehemann (fehlender Wert ans Ende)', () => {
    const rows = filterAndSortFamilies(db3(), emptyContext(), 'husbandSurname', '', defaultFamilyFilters());
    expect(rows.map((f) => f.id)).toEqual(['@F2@', '@F1@', '@F3@']); // Adler, Zimmer, (fehlt)
  });

  it('sortiert nach Nachname Ehefrau (fehlender Wert ans Ende)', () => {
    const rows = filterAndSortFamilies(db3(), emptyContext(), 'wifeSurname', '', defaultFamilyFilters());
    expect(rows.map((f) => f.id)).toEqual(['@F1@', '@F2@', '@F3@']); // Adler, Zimmer, (fehlt)
  });

  it('sortiert nach Heiratsdatum (fehlender Wert ans Ende)', () => {
    const rows = filterAndSortFamilies(db3(), emptyContext(), 'marriageDate', '', defaultFamilyFilters());
    expect(rows.map((f) => f.id)).toEqual(['@F2@', '@F1@', '@F3@']); // 1900, 1950, (fehlt)
  });
});

describe('filterAndSortFamilies — Suche über Ehepartner/Kinder/Ereignisse/Notizen', () => {
  it('findet über den Ehemann-Namen', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Otto', surname: 'Bauer' }));
    db.families.set('@F1@', makeFamily('@F1@', { husband: '@I1@' }));
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Karl', surname: 'Meyer' }));
    db.families.set('@F2@', makeFamily('@F2@', { husband: '@I2@' }));

    const rows = filterAndSortFamilies(db, emptyContext(), 'husbandSurname', 'bauer', defaultFamilyFilters());
    expect(rows.map((f) => f.id)).toEqual(['@F1@']);
  });

  it('findet über den Kindernamen', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Karl', surname: 'Schmidt' }));
    db.families.set('@F1@', makeFamily('@F1@', { children: ['@I1@'] }));
    db.families.set('@F2@', makeFamily('@F2@', {}));

    const rows = filterAndSortFamilies(db, emptyContext(), 'husbandSurname', 'schmidt', defaultFamilyFilters());
    expect(rows.map((f) => f.id)).toEqual(['@F1@']);
  });

  it('findet über die Notiz', () => {
    const db = makeDatabase();
    db.families.set('@F1@', makeFamily('@F1@', { noteText: 'Auswanderung nach USA' }));
    db.families.set('@F2@', makeFamily('@F2@', {}));

    const rows = filterAndSortFamilies(db, emptyContext(), 'husbandSurname', 'auswanderung', defaultFamilyFilters());
    expect(rows.map((f) => f.id)).toEqual(['@F1@']);
  });

  it('leere Suche liefert alle Familien', () => {
    const db = makeDatabase();
    db.families.set('@F1@', makeFamily('@F1@', {}));
    db.families.set('@F2@', makeFamily('@F2@', {}));

    const rows = filterAndSortFamilies(db, emptyContext(), 'husbandSurname', '', defaultFamilyFilters());
    expect(rows).toHaveLength(2);
  });

  it('liefert eine leere Liste, wenn nichts passt (kein Absturz)', () => {
    const db = makeDatabase();
    db.families.set('@F1@', makeFamily('@F1@', {}));

    const rows = filterAndSortFamilies(db, emptyContext(), 'husbandSurname', 'nonexistent-query', defaultFamilyFilters());
    expect(rows).toEqual([]);
  });
});

describe('filterAndSortFamilies — erweiterte Filter (jede Dimension einzeln + kombiniert)', () => {
  function seeded() {
    const db = makeDatabase();
    const f1 = makeFamily('@F1@', { children: ['@Ix@'] });
    f1.marriage.date = '1 JAN 1900';
    f1.marriage.place = 'Hildesheim';
    f1.citations.push(makeCitation('@S1@'));

    const f2 = makeFamily('@F2@', {});
    f2.marriage.date = '1 JAN 1950';
    f2.marriage.place = 'Hannover';
    // keine Quellen, keine Kinder

    const f3 = makeFamily('@F3@', {});
    // kein Heiratsdatum, keine Quellen, keine Kinder

    db.families.set('@F1@', f1);
    db.families.set('@F2@', f2);
    db.families.set('@F3@', f3);
    return db;
  }

  it('filtert nach Heiratsjahr-Bereich', () => {
    const filters: FamilyFilters = { ...defaultFamilyFilters(), marriageYearFrom: 1940, marriageYearTo: 1960 };
    const rows = filterAndSortFamilies(seeded(), emptyContext(), 'husbandSurname', '', filters);
    expect(rows.map((f) => f.id)).toEqual(['@F2@']);
  });

  it('Heiratsjahr-Filter schließt Familien ohne Heiratsdatum aus', () => {
    const filters: FamilyFilters = { ...defaultFamilyFilters(), marriageYearFrom: 1800 };
    const rows = filterAndSortFamilies(seeded(), emptyContext(), 'husbandSurname', '', filters);
    expect(rows.map((f) => f.id).sort()).toEqual(['@F1@', '@F2@']);
  });

  it('filtert nach Heiratsort (Textmatch, case-insensitive)', () => {
    const filters: FamilyFilters = { ...defaultFamilyFilters(), marriagePlace: 'hildesheim' };
    const rows = filterAndSortFamilies(seeded(), emptyContext(), 'husbandSurname', '', filters);
    expect(rows.map((f) => f.id)).toEqual(['@F1@']);
  });

  it('filtert nach "kein Heiratsdatum"', () => {
    const filters: FamilyFilters = { ...defaultFamilyFilters(), noMarriageDate: true };
    const rows = filterAndSortFamilies(seeded(), emptyContext(), 'husbandSurname', '', filters);
    expect(rows.map((f) => f.id)).toEqual(['@F3@']);
  });

  it('filtert nach "keine Quellen"', () => {
    const filters: FamilyFilters = { ...defaultFamilyFilters(), noSources: true };
    const rows = filterAndSortFamilies(seeded(), emptyContext(), 'husbandSurname', '', filters);
    expect(rows.map((f) => f.id).sort()).toEqual(['@F2@', '@F3@']);
  });

  it('filtert nach "keine Kinder"', () => {
    const filters: FamilyFilters = { ...defaultFamilyFilters(), noChildren: true };
    const rows = filterAndSortFamilies(seeded(), emptyContext(), 'husbandSurname', '', filters);
    expect(rows.map((f) => f.id).sort()).toEqual(['@F2@', '@F3@']);
  });

  it('kombiniert Heiratsjahr-Bereich + Heiratsort', () => {
    const filters: FamilyFilters = { ...defaultFamilyFilters(), marriageYearFrom: 1890, marriageYearTo: 1910, marriagePlace: 'hildesheim' };
    const rows = filterAndSortFamilies(seeded(), emptyContext(), 'husbandSurname', '', filters);
    expect(rows.map((f) => f.id)).toEqual(['@F1@']);
  });

  it('kombiniert Suche + Filter: leere Liste, wenn nichts übrig bleibt', () => {
    const filters: FamilyFilters = { ...defaultFamilyFilters(), noChildren: true };
    const rows = filterAndSortFamilies(seeded(), emptyContext(), 'husbandSurname', 'hildesheim', filters);
    expect(rows).toEqual([]);
  });
});
