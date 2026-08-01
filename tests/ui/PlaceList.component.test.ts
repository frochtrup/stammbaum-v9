// @vitest-environment happy-dom
// tests/ui/PlaceList.component.test.ts — Orte-Tab-Liste als Component-Test (Spec 32 §6;
// Spec 20 §1.7 [K]). Deckt tatsächliches DOM-Rendering + Klick-Navigation ab. Seit
// ADR-v9-46 zeigt die Hauptliste (Segment "Orte") NUR referenzierte PlaceObjects — die
// Fixtures hängen darum ein referenzierendes Event an, wo ein Ort in der Hauptliste
// erwartet wird (analog einem echten, aus einem Import geseedeten Ort).
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PlaceList from '../../ui/views/place/PlaceList.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeDatabase, makePerson } from '../../core/model';
import { place } from '../core/places-fixtures';

/** Hängt ein referenzierendes BIRT-Event (ev.placeId) an eine frische Person — macht das
 *  PlaceObject `hasReference === true` (Spec 11 §9.3), damit es in der Hauptliste erscheint. */
function withReferencingPerson(db: ReturnType<typeof makeDatabase>, personId: string, placeId: string) {
  const p = makePerson(personId);
  p.birth.placeId = placeId;
  db.individuals.set(personId, p);
}

describe('PlaceList — Sammlung, Typ-Badge, Koordinaten-Indikator, Klick-Navigation', () => {
  it('rendert eine Zeile je referenziertem PlaceObject mit Typ-Badge', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup', type: 'Village' }));
    withReferencingPerson(db, '@I1@', '@P1@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });

    expect(screen.getByText('Ochtrup')).toBeTruthy();
    // Deutsch, nicht der rohe GRAMPS-Wert (ADR-v9-149) — vormals wurde hier „Village"
    // erwartet, was die B7-Regression im Test festgeschrieben hat.
    expect(screen.getByText('Dorf')).toBeTruthy();
    expect(screen.queryByText('Village')).toBeNull();
  });

  it('übersetzt den Typ ins Deutsche statt den rohen GRAMPS-Wert zu zeigen (ADR-v9-149)', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ahaus', type: 'Town' }));
    withReferencingPerson(db, '@I1@', '@P1@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });

    expect(screen.getByText('Stadt')).toBeTruthy();
    expect(screen.queryByText('Town')).toBeNull();
  });

  it('zeigt für type="Unknown" GAR KEINEN Chip (kein "Unknown", kein "Unbekannt")', () => {
    // Der häufigste Zustand direkt nach dem Import (ADR-v9-77 „der normale, unauffällige
    // Fall") — ein Chip darauf ist Rauschen auf der Mehrheit der Zeilen, kein Signal.
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Albersloh', type: 'Unknown' }));
    withReferencingPerson(db, '@I1@', '@P1@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    const { container } = render(PlaceList, { props: { appState, viewState } });

    expect(screen.getByText('Albersloh')).toBeTruthy();
    expect(screen.queryByText('Unknown')).toBeNull();
    expect(screen.queryByText('Unbekannt')).toBeNull();
    const row = container.querySelector('.place-list__row')!;
    expect(Array.from(row.querySelectorAll('.stb-pill')).map((el) => el.textContent)).toEqual([]);
  });

  it('Klick auf eine Zeile setzt die ViewState-Auswahl "place"', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    withReferencingPerson(db, '@I1@', '@P1@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('Ochtrup'));

    expect(viewState.getCurrent('place')).toBe('@P1@');
  });

  it('„Namensvarianten anzeigen" zeigt pnames-Varianten unter dem Titel', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set(
      '@P1@',
      place('@P1@', { title: 'Sassenberg', pnames: [{ value: 'Sassenbergk', from: null, to: null }] }),
    );
    withReferencingPerson(db, '@I1@', '@P1@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });
    // Liegt seit ADR-v9-149 hinter der Filter-Disclosure (INV-UI-11: als Dauer-Element
    // erzwang sie bei 375px eine dritte Toolbar-Zeile).
    await fireEvent.click(screen.getByText('Filter'));
    await fireEvent.click(screen.getByLabelText('Namensvarianten anzeigen'));

    expect(screen.getByText('Sassenbergk')).toBeTruthy();
  });

  it('Admin-Filter blendet Verwaltungseinheiten aus', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Kreis Steinfurt', type: 'County' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Ochtrup', type: 'Village' }));
    withReferencingPerson(db, '@I1@', '@P1@');
    withReferencingPerson(db, '@I2@', '@P2@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('Filter'));
    await fireEvent.click(screen.getByLabelText('Verwaltungseinheiten ausblenden'));

    expect(screen.queryByText('Kreis Steinfurt')).toBeNull();
    expect(screen.getByText('Ochtrup')).toBeTruthy();
  });

  it('Typ-Filter reduziert die Liste auf den gewählten Typ (value/onchange-Muster, kein bind:value)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Kreis Steinfurt', type: 'County' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Ochtrup', type: 'Village' }));
    withReferencingPerson(db, '@I1@', '@P1@');
    withReferencingPerson(db, '@I2@', '@P2@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('Filter'));
    const select = screen.getByLabelText('Typ') as HTMLSelectElement;
    // Optionswert ist die deutsche Kategorie, nicht der GRAMPS-Rohwert (ADR-v9-149).
    await fireEvent.change(select, { target: { value: 'Dorf' } });

    expect(select.value).toBe('Dorf');
    expect(screen.queryByText('Kreis Steinfurt')).toBeNull();
    expect(screen.getByText('Ochtrup')).toBeTruthy();
  });

  it('zeigt einen Leerzustand ohne Orte — verweist auf den automatischen Import-Seed (ADR-v9-28), kein Opt-in-Dialog mehr', () => {
    const appState = createAppState();
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });

    expect(screen.getByText(/automatisch aus den/)).toBeTruthy();
    // Regression: der frühere Opt-in-Dialog ("Orte vorschlagen") ist mit ADR-v9-28
    // (automatischer Seed beim Import) entfallen — er darf nicht mehr auftauchen.
    expect(screen.queryByText('Orte vorschlagen')).toBeNull();
  });
});

describe('PlaceList — Anreicherung als Filter statt Zeilen-Pille (ADR-v9-149)', () => {
  it('ein plain PlaceObject trägt KEINE "ohne Zusatzangaben"-Pille mehr', () => {
    // Vormals (ADR-v9-44/79) stand hier eine Pille. Sie ist entfallen: `enriched === false`
    // ist nach dem Import der Regelfall, die Pille stand also auf der Mehrheit der Zeilen
    // und trug die höchste Wortlast für den informationsärmsten Zustand.
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    withReferencingPerson(db, '@I1@', '@P1@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });

    expect(screen.getByText('Ochtrup')).toBeTruthy();
    expect(screen.queryByText('ohne Zusatzangaben')).toBeNull();
  });

  it('die Anreicherungs-Stufe blendet die anderen Stufen aus (ADR-v9-191)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Plainhausen' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Kurierthausen', type: 'Village' }));
    withReferencingPerson(db, '@I1@', '@P1@');
    withReferencingPerson(db, '@I2@', '@P2@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });

    // Beide sichtbar, solange der Filter aus ist (opt-in).
    expect(screen.getByText('Plainhausen')).toBeTruthy();
    expect(screen.getByText('Kurierthausen')).toBeTruthy();

    await fireEvent.click(screen.getByText('Filter'));
    const wahl = screen.getByLabelText('Anreicherung') as HTMLSelectElement;
    await fireEvent.change(wahl, { target: { value: 'none' } });

    expect(screen.getByText('Plainhausen')).toBeTruthy();
    expect(screen.queryByText('Kurierthausen')).toBeNull();

    // Die Gegenrichtung — das ist der Zugewinn gegenüber dem früheren Ja/Nein: „was habe
    // ich nur angefasst?" war damit gar nicht abfragbar.
    await fireEvent.change(wahl, { target: { value: 'sparse' } });

    expect(screen.getByText('Kurierthausen')).toBeTruthy();
    expect(screen.queryByText('Plainhausen')).toBeNull();
  });
});

describe('PlaceList — Referenz-Filter (ADR-v9-46, Spec 11 §9.3)', () => {
  it('referenzloser Ort erscheint NICHT in der Hauptliste, aber im "Ohne Bezug"-Segment', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Referenziert' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Verwaist' }));
    withReferencingPerson(db, '@I1@', '@P1@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });

    expect(screen.getByText('Referenziert')).toBeTruthy();
    expect(screen.queryByText('Verwaist')).toBeNull();
    expect(screen.getByText('Ohne Bezug (1)')).toBeTruthy();

    await fireEvent.click(screen.getByText('Ohne Bezug (1)'));

    expect(screen.getByText('Verwaist')).toBeTruthy();
    expect(screen.queryByText('Referenziert')).toBeNull();
  });

  it('referenzloser Ort bleibt über das "Ohne Bezug"-Segment anklickbar (voll editierbar/löschbar in PlaceDetail)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Verwaist' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('Ohne Bezug (1)'));
    await fireEvent.click(screen.getByText('Verwaist'));

    expect(viewState.getCurrent('place')).toBe('@P1@');
  });

  it('TST-7 Kapazitäts-Fall: viele referenzlose Orte gleichzeitig — Segment-Zähler bleibt korrekt', () => {
    const appState = createAppState();
    const db = makeDatabase();
    for (let i = 0; i < 30; i++) {
      db.placeObjects.set(`@P${i}@`, place(`@P${i}@`, { title: `Ort ${i}` }));
    }
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });

    expect(screen.getByText('Ohne Bezug (30)')).toBeTruthy();
    expect(screen.getByText('Orte (0)')).toBeTruthy();
  });
});

describe('PlaceList — Hierarchie-Badge (ADR-v9-79 Punkt 3)', () => {
  it('zeigt die "Hierarchie"-Pille nur, wenn enclosedBy einen Eintrag hat', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set(
      '@P1@',
      place('@P1@', { title: 'Mit Kette', enclosedBy: [{ placeId: '@DE@', from: null, to: null }] }),
    );
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Ohne Kette' }));
    withReferencingPerson(db, '@I1@', '@P1@');
    withReferencingPerson(db, '@I2@', '@P2@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });

    const row1 = screen.getByText('Mit Kette').closest('.place-list__row') as HTMLElement;
    const row2 = screen.getByText('Ohne Kette').closest('.place-list__row') as HTMLElement;
    expect(Array.from(row1.querySelectorAll('.stb-pill')).some((el) => el.textContent === 'Hierarchie')).toBe(true);
    expect(Array.from(row2.querySelectorAll('.stb-pill')).some((el) => el.textContent === 'Hierarchie')).toBe(false);
  });
});

describe('PlaceList — CoordIndicator (ADR-v9-79 Punkt l, INV-UI-4)', () => {
  it('Klick auf den gefüllten Glyph setzt lensPlaceFocus und navigiert zur Karte-Lens', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup', lat: 52.1, long: 7.6 }));
    withReferencingPerson(db, '@I1@', '@P1@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    const onNavigateLens = vi.fn();

    render(PlaceList, { props: { appState, viewState, onNavigateLens } });
    await fireEvent.click(screen.getByText('◎'));

    expect(viewState.getCurrent('lensPlaceFocus')).toBe('@P1@');
    expect(onNavigateLens).toHaveBeenCalledWith('map');
  });

  it('zeigt den leeren Glyph, wenn keine Koordinaten gesetzt sind', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    withReferencingPerson(db, '@I1@', '@P1@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });

    expect(screen.getByText('◌')).toBeTruthy();
  });
});

describe('PlaceList — Toolbar-Ownership "Massen-Dedup" (Spec 21 §10c)', () => {
  it('rendert den Button NICHT, wenn kein onOpenDedup übergeben wird', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    withReferencingPerson(db, '@I1@', '@P1@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    render(PlaceList, { props: { appState, viewState } });

    // Ohne Callbacks entfällt der ganze Einstieg — kein leeres "Werkzeuge"-Panel.
    expect(screen.queryByRole('button', { name: 'Werkzeuge' })).toBeNull();
    expect(screen.queryByText('Massen-Dedup')).toBeNull();
  });

  it('rendert "Massen-Dedup" in der eigenen Toolbar und ruft onOpenDedup bei Klick auf', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    withReferencingPerson(db, '@I1@', '@P1@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    const onOpenDedup = vi.fn();

    render(PlaceList, { props: { appState, viewState, onOpenDedup } });
    // Seit BL-96 liegen die Kuratierungs-Werkzeuge hinter EINEM "Werkzeuge"-Einstieg
    // (Spec 21 §6h) — die Toolbar-Ownership aus §10c bleibt unberührt, die Liste besitzt
    // den Einstieg weiterhin selbst. Nur ein Klick mehr, und die Panel-Inhalte liegen
    // portaliert am <body> (deshalb `screen`, nicht `container`).
    await fireEvent.click(screen.getByRole('button', { name: 'Werkzeuge' }));
    await fireEvent.click(screen.getByText('Massen-Dedup'));

    expect(onOpenDedup).toHaveBeenCalledOnce();
  });
});

describe('PlaceList — Kurations-Achtungs-Punkt am Werkzeuge-Trigger (BL-206, ADR-v9-148)', () => {
  it('ohne offene Fälle trägt der Trigger keinen Punkt (Name bleibt schlicht "Werkzeuge")', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    withReferencingPerson(db, '@I1@', '@P1@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    const { container } = render(PlaceList, { props: { appState, viewState, onOpenDedup: () => {} } });

    expect(screen.getByRole('button', { name: 'Werkzeuge' })).toBeTruthy();
    expect(container.querySelector('.stb-filterbar__dot')).toBeNull();
  });

  it('Dedup-Gruppe > 0 setzt den Achtungs-Punkt; aufgeklappt steht der beschriftete Zähler', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    // Zwei gleichnamige Orte → EINE Dedup-Gruppe (findPlaceDuplicates, Spec 11 §9.2).
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Ochtrup' }));
    withReferencingPerson(db, '@I1@', '@P1@');
    withReferencingPerson(db, '@I2@', '@P2@');
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();

    const { container } = render(PlaceList, { props: { appState, viewState, onOpenDedup: () => {} } });

    // Dot am immer sichtbaren Trigger — proaktiv, ohne die Disclosure zu öffnen.
    expect(container.querySelector('.stb-filterbar__dot')).not.toBeNull();
    const trigger = screen.getByRole('button', { name: /Werkzeuge.*Handlungsbedarf/ });

    // Beschrifteter Einzelzähler erst aufgeklappt (echte Wörter, keine Glyphen).
    await fireEvent.click(trigger);
    expect(screen.getByText('Massen-Dedup · 1 Gruppe')).toBeTruthy();
  });
});

describe('PlaceList — GOV-Platzhalter als Kurations-Signal + Filter (BL-131)', () => {
  function dbWithPlaceholder() {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    withReferencingPerson(db, '@I1@', '@P1@');
    // Ein GOV-Import-Rest: Elternort, den nur seine Kennung benennt.
    db.placeObjects.set('_gov_object_9', place('_gov_object_9', { title: 'object_9', govId: 'object_9' }));
    return db;
  }

  it('ein unaufgelöster Platzhalter setzt den Achtungs-Punkt — der dritte in ADR-v9-148 vorgesehene Fall', () => {
    const appState = createAppState();
    appState.loadDatabase(dbWithPlaceholder(), 'test.ged');

    const { container } = render(PlaceList, {
      props: { appState, viewState: createViewState(), onOpenDedup: () => {} },
    });

    expect(container.querySelector('.stb-filterbar__dot')).not.toBeNull();
  });

  it('der Filter „nur GOV-Platzhalter" zeigt genau diese Orte und trägt ihre Zahl', async () => {
    const appState = createAppState();
    appState.loadDatabase(dbWithPlaceholder(), 'test.ged');

    render(PlaceList, { props: { appState, viewState: createViewState() } });

    await fireEvent.click(screen.getByRole('button', { name: /^Filter/ }));
    const box = screen.getByLabelText(/nur GOV-Platzhalter/) as HTMLInputElement;
    expect(box.parentElement!.textContent).toMatch(/\(1\)/);

    await fireEvent.click(box);
    // Ein GOV-Platzhalter ist immer ein VERWALTUNGS-Elternteil: kein Ereignis zeigt auf
    // ihn, er lebt also in „Ohne Bezug" — wie jeder Kreis/jedes Land. Die Segment-Zähler
    // machen das sichtbar (Orte (0) · Ohne Bezug (1)), der Filter wirkt auf beide.
    expect(screen.getByRole('tab', { name: 'Orte (0)' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('tab', { name: 'Ohne Bezug (1)' }));
    expect(screen.getByText('object_9')).toBeTruthy();
    expect(screen.queryByText('Ochtrup')).toBeNull();
  });
});
