// tests/ui/family-list-model.test.ts — Familien-Listen-Aufbereitung (Spec 20 §1.5 [K]):
// Elternpaar-Namen, Heiratsdatum, Kinderzahl, alphabetische Sortierung. Reine Funktion,
// deshalb Unit statt Component-Test (TST-5).
import { describe, expect, it } from 'vitest';
import { makeDatabase, makeFamily, makePerson } from '../../core/model';
import { makePlaceRegistry, makeHofRegistry, type PlaceContext } from '../../core/places';
import { buildFamilyRows } from '../../ui/views/family/family-list-model';

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

  it('sortiert Familien alphabetisch nach dem Elternpaar-Label', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Zora', surname: 'Zimmer' }));
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Anna', surname: 'Adler' }));
    db.families.set('@F1@', makeFamily('@F1@', { husband: '@I1@' }));
    db.families.set('@F2@', makeFamily('@F2@', { husband: '@I2@' }));

    const rows = buildFamilyRows(db, emptyContext());

    expect(rows.map((r) => r.id)).toEqual(['@F2@', '@F1@']);
  });

  it('zeigt 0 als Kinderzahl, wenn keine Kinder erfasst sind', () => {
    const db = makeDatabase();
    db.families.set('@F1@', makeFamily('@F1@'));

    const rows = buildFamilyRows(db, emptyContext());

    expect(rows[0].childCount).toBe(0);
  });
});
