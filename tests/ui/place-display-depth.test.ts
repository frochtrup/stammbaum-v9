// @vitest-environment happy-dom
// tests/ui/place-display-depth.test.ts — Schalen-Hälfte von INV-UI-14 (Spec 21 §6l,
// ADR-v9-90/-100, BL-55). Das Kern-Pendant (tests/core/place-display-depth.test.ts)
// deckt `buildListPlaceName`/`placeDisplayName` selbst ab; hier geht es um die
// VERDRAHTUNG: zeigen die Listen-Modelle/Komponenten den Kurznamen, bleibt die
// Detailzeile bei der vollen Kette, trägt der Tooltip die Kette, findet die Suche über
// shortName UND über die Kette, und ist `shortName` im Ort-Steckbrief editierbar
// (persistiert über appState.savePlace, kein neuer Mechanismus, ADR-v9-30)?
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { makeDatabase, makePerson, makeFamily } from '../../core/model';
import { makePlaceRegistry, makeHofRegistry, type PlaceContext } from '../../core/places';
import { place, hof } from '../core/places-fixtures';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { yearPlaceSummary, dateSummary } from '../../ui/shell/person-display';
import { buildPersonGroups } from '../../ui/views/person/person-list-model';
import { buildFamilyRows, matchesSearch as matchesFamilySearch } from '../../ui/views/family/family-list-model';
import { matchesSearch as matchesPersonSearch, filterAndSortPersons, defaultPersonFilters } from '../../ui/views/person/person-list-model';
import { buildPlaceRows } from '../../ui/views/place/place-list-model';
import PersonList from '../../ui/views/person/PersonList.svelte';
import FamilyList from '../../ui/views/family/FamilyList.svelte';
import PlaceDetail from '../../ui/views/place/PlaceDetail.svelte';

/** Ochtrup im Fürstbistum Münster — dieselbe Kette wie im Kern-Test (16 v8-Varianten,
 *  ADR-v9-90-Messung), damit UI- und Kern-Test dieselbe Fixture-Form teilen. */
function ochtrupDb(shortName = ''): { db: ReturnType<typeof makeDatabase>; ctx: PlaceContext } {
  const db = makeDatabase();
  db.placeObjects.set('@HRR@', place('@HRR@', { title: 'Heiliges Römisches Reich', type: 'Country' }));
  db.placeObjects.set(
    '@MS@',
    place('@MS@', { title: 'Fürstbistum Münster', type: 'State', enclosedBy: [{ placeId: '@HRR@', from: null, to: null }] }),
  );
  db.placeObjects.set(
    '@OCH@',
    place('@OCH@', { title: 'Ochtrup', shortName, type: 'Town', enclosedBy: [{ placeId: '@MS@', from: null, to: null }] }),
  );
  db.hofObjects.set('@HOF@', hof('@HOF@', '@OCH@', { addrs: [{ value: 'Oster 82a', from: null, to: null }] }));
  return { db, ctx: { places: makePlaceRegistry(db.placeObjects), hofs: makeHofRegistry(db.hofObjects) } };
}

describe('yearPlaceSummary (Listen-Kontext) zeigt den Kurznamen, dateSummary (Detail-Kontext) die volle Kette', () => {
  it('yearPlaceSummary: nur "Ochtrup", nie die Verwaltungskette', () => {
    const { ctx } = ochtrupDb();
    const p = makePerson('@I1@', {});
    p.birth.placeId = '@OCH@';
    p.birth.date = '1750';

    expect(yearPlaceSummary(p.birth, ctx)).toBe('1750, Ochtrup');
  });

  it('yearPlaceSummary: ein gesetzter shortName gewinnt in der Liste', () => {
    const { ctx } = ochtrupDb('Ochtrup (Westf.)');
    const p = makePerson('@I1@', {});
    p.birth.placeId = '@OCH@';
    p.birth.date = '1750';

    expect(yearPlaceSummary(p.birth, ctx)).toBe('1750, Ochtrup (Westf.)');
  });

  it('yearPlaceSummary: Hof-gelinktes Ereignis zeigt "Adresse, Dorf-Kurzname"', () => {
    const { ctx } = ochtrupDb('Ochtrup (Westf.)');
    const p = makePerson('@I1@', {});
    p.birth.hofId = '@HOF@';
    p.birth.date = '1750';

    expect(yearPlaceSummary(p.birth, ctx)).toBe('1750, Oster 82a, Ochtrup (Westf.)');
  });

  it('dateSummary (eigene Ereigniszeile, [21 INV-UI-9]) bleibt bei der vollen Kette — shortName bleibt hier unsichtbar', () => {
    const { ctx } = ochtrupDb('Ochtrup (Westf.)');
    const p = makePerson('@I1@', {});
    p.birth.placeId = '@OCH@';
    p.birth.date = '12 MAR 1750';

    expect(dateSummary(p.birth, ctx)).toBe('12. März 1750, Ochtrup, Fürstbistum Münster, Heiliges Römisches Reich');
  });
});

describe('Personen-/Familien-Listenmodelle: Zeile kurz, Suche über shortName UND Kette', () => {
  it('buildPersonGroups zeigt die Kurzform in birthSummary — vorher lange Kette, jetzt kurz', () => {
    const { db, ctx } = ochtrupDb('Ochtrup (Westf.)');
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.placeId = '@OCH@';
    p.birth.date = '1750';
    db.individuals.set('@I1@', p);

    const groups = buildPersonGroups(db, ctx);
    const row = groups.flatMap((g) => g.rows).find((r) => r.id === '@I1@')!;

    expect(row.birthSummary).toBe('1750, Ochtrup (Westf.)');
    // Die volle Kette bleibt als zweites Feld erhalten (Tooltip-Grundlage, ADR-v9-86).
    expect(row.birthPlaceFull).toBe('Ochtrup, Fürstbistum Münster, Heiliges Römisches Reich');
  });

  it('buildFamilyRows zeigt die Kurzform in marriageSummary, trägt die Kette in marriagePlaceFull', () => {
    const { db, ctx } = ochtrupDb('Ochtrup (Westf.)');
    const husband = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    const wife = makePerson('@I2@', { given: 'Anna', surname: 'Klein' });
    const f = makeFamily('@F1@', { husband: '@I1@', wife: '@I2@' });
    f.marriage.placeId = '@OCH@';
    f.marriage.date = '1780';
    db.individuals.set('@I1@', husband);
    db.individuals.set('@I2@', wife);
    db.families.set('@F1@', f);

    const rows = buildFamilyRows(db, ctx);

    expect(rows[0].marriageSummary).toBe('1780, Ochtrup (Westf.)');
    expect(rows[0].marriagePlaceFull).toBe('Ochtrup, Fürstbistum Münster, Heiliges Römisches Reich');
  });

  it('Personen-Suche (matchesSearch, Ortsfilter) findet über shortName UND über die volle Kette', () => {
    const { ctx } = ochtrupDb('Ochtrup (Westf.)');
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.placeId = '@OCH@';
    p.birth.date = '1750'; // Jahr nötig, damit die volle Kette (periodengerecht) aufgelöst wird.

    const db = makeDatabase();
    db.individuals.set('@I1@', p);
    const filtersShort = { ...defaultPersonFilters(), birthPlace: 'westf' };
    const filtersChain = { ...defaultPersonFilters(), birthPlace: 'Fürstbistum' };
    const filtersMiss = { ...defaultPersonFilters(), birthPlace: 'nonexistent-zzz' };

    expect(filterAndSortPersons(db, ctx, 'name', '', filtersShort).map((r) => r.id)).toEqual(['@I1@']);
    expect(filterAndSortPersons(db, ctx, 'name', '', filtersChain).map((r) => r.id)).toEqual(['@I1@']);
    expect(filterAndSortPersons(db, ctx, 'name', '', filtersMiss)).toEqual([]);
  });

  it('matchesPersonSearch/matchesFamilySearch bleiben unverändert (Namens-/Notiz-Suche, keine Ortslogik hier)', () => {
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    expect(matchesPersonSearch(p, 'bauer')).toBe(true);
    const db = makeDatabase();
    const f = makeFamily('@F1@', {});
    expect(matchesFamilySearch(db, f, '')).toBe(true);
  });
});

describe('PersonList/FamilyList (Component) — Tooltip trägt die volle Kette', () => {
  function bubbleText(): string | null | undefined {
    return document.querySelector('.stb-tooltip')?.textContent;
  }

  it('PersonList: Zeile zeigt den Kurznamen, use:tooltip-Blase zeigt die volle Kette bei Hover', async () => {
    const appState = createAppState();
    const { db } = ochtrupDb('Ochtrup (Westf.)');
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.placeId = '@OCH@';
    p.birth.date = '1750';
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PersonList, { props: { appState, viewState } });

    const summaryEl = screen.getByText('* 1750, Ochtrup (Westf.)');
    expect(summaryEl).toBeTruthy();

    await fireEvent.mouseEnter(summaryEl);
    expect(bubbleText()).toBe('Ochtrup, Fürstbistum Münster, Heiliges Römisches Reich');
  });

  it('FamilyList: Zeile zeigt den Kurznamen, use:tooltip-Blase zeigt die volle Kette bei Hover', async () => {
    const appState = createAppState();
    const { db } = ochtrupDb('Ochtrup (Westf.)');
    const husband = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    const wife = makePerson('@I2@', { given: 'Anna', surname: 'Klein' });
    const f = makeFamily('@F1@', { husband: '@I1@', wife: '@I2@' });
    f.marriage.placeId = '@OCH@';
    f.marriage.date = '1780';
    db.individuals.set('@I1@', husband);
    db.individuals.set('@I2@', wife);
    db.families.set('@F1@', f);
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(FamilyList, { props: { appState, viewState } });

    const summaryEl = screen.getByText('⚭ 1780, Ochtrup (Westf.)');
    await fireEvent.mouseEnter(summaryEl);
    expect(bubbleText()).toBe('Ochtrup, Fürstbistum Münster, Heiliges Römisches Reich');
  });
});

describe('Hof-Zeile zeigt "Adresse, Dorf-Kurzname" (INV-UI-14 Hof-Fall, 15 % gemessen ADR-v9-100)', () => {
  it('Orte-Liste (place-list-model): shortName gewinnt vor title, plain-Fall fällt auf title zurück', () => {
    const { db: dbShort } = ochtrupDb('Ochtrup (Westf.)');
    expect(buildPlaceRows(dbShort).find((r) => r.id === '@OCH@')?.title).toBe('Ochtrup (Westf.)');

    // TST-16: der unangereicherte Fall (kein shortName gepflegt) ist der Regelfall nach
    // Import (ADR-v9-28/44), nicht der Sonderfall — fällt korrekt auf title zurück.
    const { db: dbPlain } = ochtrupDb();
    expect(buildPlaceRows(dbPlain).find((r) => r.id === '@OCH@')?.title).toBe('Ochtrup');
  });
});

describe('PlaceDetail — shortName editierbar im bestehenden Bearbeiten-Modus (ADR-v9-30, kein neues Modal)', () => {
  it('speichert shortName über appState.savePlace und zeigt ihn nach erneutem Öffnen wieder (TST-8 Persistenz-Rundlauf)', async () => {
    const appState = createAppState();
    const { db } = ochtrupDb();
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@OCH@');

    render(PlaceDetail, { props: { appState, viewState } });

    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.input(screen.getByLabelText('Anzeigename (Listen)'), { target: { value: 'Ochtrup (Westf.)' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.placeObjects.get('@OCH@')?.shortName).toBe('Ochtrup (Westf.)');
    // Export-Neutralität (LP-1, ADR-v9-90): title bleibt unverändert, shortName ist ein
    // eigenes Feld.
    expect(appState.db.placeObjects.get('@OCH@')?.title).toBe('Ochtrup');

    // Persistenz-Rundlauf: erneut öffnen zeigt den gespeicherten Wert wieder.
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    expect((screen.getByLabelText('Anzeigename (Listen)') as HTMLInputElement).value).toBe('Ochtrup (Westf.)');
  });

  it('ein gesetzter shortName wirkt sofort in der Personen-Liste (Anzeige-Vollständigkeit, TST-14)', async () => {
    const appState = createAppState();
    const { db } = ochtrupDb();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.placeId = '@OCH@';
    p.birth.date = '1750';
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@OCH@');

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.input(screen.getByLabelText('Anzeigename (Listen)'), { target: { value: 'Ochtrup (Westf.)' } });
    await fireEvent.click(screen.getByText('Speichern'));

    const personViewState = createViewState();
    render(PersonList, { props: { appState, viewState: personViewState } });

    expect(screen.getByText('* 1750, Ochtrup (Westf.)')).toBeTruthy();
  });
});
