// @vitest-environment happy-dom
// tests/ui/entity-id-visible.component.test.ts — die technische Datensatz-Kennung ist
// sichtbar UND auffindbar (Nutzer-Wunsch 2026-08-30, Spec 20 §1.4/§1.5).
//
// EINE Datei für beide Listen und beide Steckbriefe, weil es EINE Zusicherung ist: „was
// die Datei den Satz nennt, nennt ihn die Oberfläche auch, und die Suche findet ihn
// darüber". Verteilt auf vier Dateien wäre genau die Drift möglich, die INV-UI-4
// ausschließt — dass eine der vier Flächen sie beim nächsten Umbau still verliert.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import PersonList from '../../ui/views/person/PersonList.svelte';
import FamilyList from '../../ui/views/family/FamilyList.svelte';
import PersonDetailHeader from '../../ui/views/person/PersonDetailHeader.svelte';
import FamilyDetail from '../../ui/views/family/FamilyDetail.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeDatabase, makeFamily, makePerson } from '../../core/model';
import { entityIdLabel } from '../../ui/shell/entity-id';
import { matchesSearch as matchesPersonSearch } from '../../ui/views/person/person-list-model';
import { matchesSearch as matchesFamilySearch } from '../../ui/views/family/family-list-model';
import { globalSearch } from '../../ui/views/search/global-search-model';
import { makePlaceRegistry, makeHofRegistry, type PlaceContext } from '../../core/places';

function emptyContext(): PlaceContext {
  return { places: makePlaceRegistry(new Map()), hofs: makeHofRegistry(new Map()) };
}

function seed() {
  const appState = createAppState();
  const db = makeDatabase();
  db.individuals.set('@I42@', makePerson('@I42@', { given: 'Otto', surname: 'Bauer' }));
  db.individuals.set('@I43@', makePerson('@I43@', { given: 'Anna', surname: 'Klein' }));
  db.families.set('@F7@', makeFamily('@F7@', { husband: '@I42@', wife: '@I43@' }));
  appState.loadDatabase(db, 'test.ged');
  return { appState, db };
}

describe('entityIdLabel — eine Form für beide Herkünfte', () => {
  it('streift die GEDCOM-Zeigerklammern ab', () => {
    expect(entityIdLabel('@I42@')).toBe('I42');
  });

  it('lässt eine GRAMPS-Kennung unverändert (sie hat nie Klammern)', () => {
    expect(entityIdLabel('I0001')).toBe('I0001');
  });
});

describe('Sichtbarkeit (Nutzer-Wunsch 2026-08-30)', () => {
  it('Personen-Listenzeile nennt die Kennung', () => {
    const { appState } = seed();
    render(PersonList, { props: { appState, viewState: createViewState() } });
    expect(screen.getByText('I42')).toBeTruthy();
  });

  it('Familien-Listenzeile nennt die Kennung', () => {
    const { appState } = seed();
    render(FamilyList, { props: { appState, viewState: createViewState() } });
    expect(screen.getByText('F7')).toBeTruthy();
  });

  it('Personen-Steckbrief nennt die Kennung im Kopf', () => {
    const { db } = seed();
    render(PersonDetailHeader, {
      props: {
        person: db.individuals.get('@I42@')!,
        isProband: false,
        editing: false,
        onBack: () => {},
        onToggleEdit: () => {},
        onSetProband: () => {},
      },
    });
    expect(screen.getByText('I42')).toBeTruthy();
  });

  it('Familien-Steckbrief nennt die Kennung', () => {
    const { appState } = seed();
    const viewState = createViewState();
    viewState.setCurrent('family', '@F7@');
    render(FamilyDetail, { props: { appState, viewState } });
    expect(screen.getByText('F7')).toBeTruthy();
  });
});

describe('Auffindbarkeit — beide Listensuchen und die globale Suche', () => {
  it('Personensuche trifft mit und ohne Klammern', () => {
    const { db } = seed();
    const p = db.individuals.get('@I42@')!;
    expect(matchesPersonSearch(p, 'I42')).toBe(true);
    expect(matchesPersonSearch(p, '@I42@')).toBe(true);
    expect(matchesPersonSearch(p, 'I43')).toBe(false);
  });

  it('Familiensuche trifft mit und ohne Klammern', () => {
    const { db } = seed();
    const f = db.families.get('@F7@')!;
    expect(matchesFamilySearch(db, f, 'F7')).toBe(true);
    expect(matchesFamilySearch(db, f, '@F7@')).toBe(true);
    expect(matchesFamilySearch(db, f, 'F8')).toBe(false);
  });

  it('die globale Suche erbt beides über dieselben Bausteine (INV-UI-4)', () => {
    const { db } = seed();
    const personen = globalSearch(db, emptyContext(), 'I42');
    expect(personen.persons.map((r) => r.id)).toEqual(['@I42@']);
    const familien = globalSearch(db, emptyContext(), 'F7');
    expect(familien.families.map((r) => r.id)).toEqual(['@F7@']);
  });
});
