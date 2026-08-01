// @vitest-environment happy-dom
// tests/ui/EntityTab.tools-with-selection.component.test.ts — ein Werkzeug muss sich auch
// dann öffnen lassen, wenn im Segment gerade ein Datensatz ausgewählt ist (Spec 21 §3
// Multi-Pane, §6h Werkzeug-Flächen).
//
// DER DEFEKT, DEN DIESE DATEI FESTHÄLT (Nutzerbefund 2026-08-01, ADR-v9-184): `overlayActive`
// in EntityTab verlangte zusätzlich `!selectedPersonId`/`!selectedPlaceId`/`!selectedHofId`.
// Diese Bedingung stammt aus dem MOBILEN Entweder-oder-Modell, wo bei vorhandener Auswahl
// die Detailfläche statt der Liste rendert — der Werkzeug-Auslöser war dort gar nicht
// erreichbar, die Bedingung konnte also nie stören. Mit dem Desktop-Multi-Pane (BL-92)
// bleibt die Listenspalte SAMT „Werkzeuge"-Disclosure dauerhaft sichtbar: der Klick setzte
// den Overlay-Zustand, und nichts rendete. Aus Nutzersicht „der Knopf tut nichts", bis zum
// Reload (ViewState ist Sitzungszustand und startet leer).
//
// Deshalb DESKTOP-Formfaktor in dieser Datei — mobil ist der Fall konstruktionsbedingt
// unerreichbar (s. layout-harness.ts: den Formfaktor zu raten heißt, ihn nicht zu prüfen).
//
// Alle DREI strukturgleichen Segmente stehen hier, nicht nur das gemeldete: der Defekt
// steckte in einer Bedingung mit drei Zweigen, ein Fix am gemeldeten Zweig allein hätte die
// beiden Geschwister stehen lassen.
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import EntityTab from '../../ui/views/EntityTab.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { createRoute } from '../../ui/shell/route.svelte';
import { makeDatabase, makeFamily, makePerson } from '../../core/model';
import { place, hof } from '../core/places-fixtures';
import { pinLayout } from './layout-harness';
import { layout } from '../../ui/shell/layout.svelte';

function seedDb() {
  const db = makeDatabase();
  const husband = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
  const wife = makePerson('@I2@', { given: 'Anna', surname: 'Klein' });
  husband.death.place = 'Ochtrup';
  husband.death.addr = 'Wall 33';
  db.individuals.set('@I1@', husband);
  db.individuals.set('@I2@', wife);
  husband.parentIn.push('@F1@');
  wife.parentIn.push('@F1@');
  db.families.set('@F1@', makeFamily('@F1@', { husband: '@I1@', wife: '@I2@' }));
  db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup', type: 'Town' }));
  db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
  return db;
}

/** Das Segment kommt auf Desktop aus der ROUTE, nicht aus einer Segmentreihe: die
 *  entfällt oberhalb der Layout-Grenze (INV-UI-2, die Sidebar trägt die Ziele). */
function mount(segment: 'person' | 'place' | 'hof', selectedId?: string) {
  const appState = createAppState();
  appState.loadDatabase(seedDb(), 'test.ged');
  const viewState = createViewState();
  if (selectedId) viewState.setCurrent(segment, selectedId);
  render(EntityTab, {
    props: { appState, viewState, route: createRoute({ target: segment }) },
  });
  return { appState, viewState };
}

let unpin: () => void;
beforeEach(() => {
  unpin = pinLayout(true);
});
afterEach(() => {
  unpin();
  layout.reset();
});

describe('EntityTab — Werkzeuge bei bestehender Auswahl (Desktop-Multi-Pane)', () => {
  it('Orte: "Orts-Zuweisungen prüfen" öffnet auch mit ausgewähltem Ort', async () => {
    const { viewState } = mount('place', '@P1@');

    await fireEvent.click(screen.getByRole('button', { name: /Werkzeuge/ }));
    await fireEvent.click(screen.getByText(/Orts-Zuweisungen prüfen/));

    expect(screen.getByRole('heading', { name: 'Orts-Zuweisungen prüfen' })).toBeTruthy();
    // Das Werkzeug beansprucht die volle Breite — die Einzelauswahl gibt dafür nach
    // (Variante (a) aus ADR-v9-184, Gegenrichtung zu `closeForPlace()`).
    expect(viewState.getCurrent('place')).toBeNull();
  });

  it('Orte: "Massen-Dedup" öffnet auch mit ausgewähltem Ort', async () => {
    const { viewState } = mount('place', '@P1@');

    await fireEvent.click(screen.getByRole('button', { name: /Werkzeuge/ }));
    await fireEvent.click(screen.getByText(/Massen-Dedup/));

    expect(screen.getByRole('heading', { name: 'Orte — Massen-Dedup' })).toBeTruthy();
    expect(viewState.getCurrent('place')).toBeNull();
  });

  it('Höfe: "Hof-Zuweisungen prüfen" öffnet auch mit ausgewähltem Hof', async () => {
    const { viewState } = mount('hof', '@H1@');

    await fireEvent.click(screen.getByRole('button', { name: /Werkzeuge/ }));
    await fireEvent.click(screen.getByText(/Hof-Zuweisungen prüfen/));

    expect(screen.getByRole('heading', { name: 'Hof-Zuweisungen prüfen' })).toBeTruthy();
    expect(viewState.getCurrent('hof')).toBeNull();
  });

  it('Höfe: "Massen-Dedup" öffnet auch mit ausgewähltem Hof', async () => {
    const { viewState } = mount('hof', '@H1@');

    await fireEvent.click(screen.getByRole('button', { name: /Werkzeuge/ }));
    await fireEvent.click(screen.getByText(/Massen-Dedup/));

    expect(screen.getByRole('heading', { name: 'Höfe — Massen-Dedup' })).toBeTruthy();
    expect(viewState.getCurrent('hof')).toBeNull();
  });

  it('Personen: "Duplikate suchen" öffnet auch mit ausgewählter Person', async () => {
    const { viewState } = mount('person', '@I1@');

    await fireEvent.click(screen.getByRole('button', { name: /Werkzeuge/ }));
    await fireEvent.click(screen.getByText('Duplikate suchen'));

    expect(screen.getByRole('heading', { name: 'Personen — Duplikate' })).toBeTruthy();
    expect(viewState.getCurrent('person')).toBeNull();
  });

  it('Personen: "Verwandtschaft berechnen" öffnet auch mit ausgewählter Person', async () => {
    const { viewState } = mount('person', '@I1@');

    await fireEvent.click(screen.getByRole('button', { name: /Werkzeuge/ }));
    await fireEvent.click(screen.getByText('Verwandtschaft berechnen'));

    expect(screen.getByRole('heading', { name: 'Beziehungsrechner' })).toBeTruthy();
    expect(viewState.getCurrent('person')).toBeNull();
  });

  it('ohne Auswahl unverändert: das Werkzeug öffnet wie bisher', async () => {
    mount('place');

    await fireEvent.click(screen.getByRole('button', { name: /Werkzeuge/ }));
    await fireEvent.click(screen.getByText(/Massen-Dedup/));

    expect(screen.getByRole('heading', { name: 'Orte — Massen-Dedup' })).toBeTruthy();
  });
});
