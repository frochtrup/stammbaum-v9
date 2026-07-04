// tests/ui/person-list-model.test.ts — Personen-Liste: alphabetische Gruppierung +
// Buchstaben-Trenner (Spec 20 §1.4 [K], Kontrakt Spec 32 §6 "Komponente" — die
// Gruppierungslogik selbst ist aber reine Funktion, deshalb hier statt als
// Component-Test, s. TST-5 Testpyramide).
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson } from '../../core/model';
import { makePlaceRegistry, makeHofRegistry, type PlaceContext } from '../../core/places';
import { buildPersonGroups } from '../../ui/views/person/person-list-model';

function emptyContext(): PlaceContext {
  return { places: makePlaceRegistry(new Map()), hofs: makeHofRegistry(new Map()) };
}

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
});
