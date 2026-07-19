// @vitest-environment happy-dom
// tests/ui/multi-pane.test.ts — Desktop-Multi-Pane (Spec 21 §3, BL-92).
//
// Die Zusage ist "Navigations-/Listen-Pane + Detail-Pane dauerhaft nebeneinander".
// Dauerhaft ist das entscheidende Wort: mobil ERSETZT das Detail die Liste, auf Desktop
// steht die Liste weiter da. Genau diese Differenz wird hier geprüft — einmal je
// Richtung, damit kein Formfaktor das Verhalten des anderen erbt.
//
// Zwei Punkte, die aus der Nebeneinander-Anordnung folgen und mitgeprüft werden:
// "← Zur Liste" entfällt (die Liste ist sichtbar), und ohne Auswahl trägt der
// Detail-Pane einen Leerzustand statt gar nichts (Spec 21 §5: nie ein stiller Abbruch).
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import EntityTab from '../../ui/views/EntityTab.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { createRoute } from '../../ui/shell/route.svelte';
import { pinLayout } from './layout-harness';
import { layout } from '../../ui/shell/layout.svelte';
import { makeDatabase, makePerson } from '../../core/model';

let unpin: () => void;
afterEach(() => {
  unpin();
  layout.reset();
});

function seed() {
  const db = makeDatabase();
  db.individuals.set('@I1@', makePerson('@I1@', { given: 'Otto', surname: 'Bauer' }));
  db.individuals.set('@I2@', makePerson('@I2@', { given: 'Anna', surname: 'Klein' }));
  const appState = createAppState();
  appState.loadDatabase(db, 'test.ged');
  return appState;
}

function panes() {
  return {
    list: document.querySelector('.entity-tab__pane--list'),
    detail: document.querySelector('.entity-tab__pane--detail'),
  };
}

describe('Multi-Pane auf Desktop — Liste UND Detail nebeneinander', () => {
  beforeEach(() => {
    unpin = pinLayout(true);
  });

  it('zeigt ohne Auswahl die Liste und einen Leerzustand im Detail-Pane', () => {
    render(EntityTab, { props: { appState: seed(), viewState: createViewState(), route: createRoute() } });

    const { list, detail } = panes();
    expect(list, 'Listen-Pane fehlt').toBeTruthy();
    expect(detail, 'Detail-Pane fehlt').toBeTruthy();
    expect(within(list as HTMLElement).getByText(/Bauer/)).toBeTruthy();
    expect(within(detail as HTMLElement).getByText(/Kein Eintrag ausgewählt/)).toBeTruthy();
  });

  it('lässt die Liste stehen, sobald ein Eintrag ausgewählt ist — das ist der ganze Punkt', async () => {
    const viewState = createViewState();
    render(EntityTab, { props: { appState: seed(), viewState, route: createRoute() } });

    await fireEvent.click(screen.getByText(/Bauer/));

    const { list, detail } = panes();
    // Liste weiterhin da (mobil wäre sie jetzt weg) …
    expect(within(list as HTMLElement).getByText(/Klein/)).toBeTruthy();
    // … und das Detail daneben zeigt die Auswahl.
    expect(viewState.getCurrent('person')).toBe('@I1@');
    expect(within(detail as HTMLElement).getByText(/Otto/)).toBeTruthy();
    expect(within(detail as HTMLElement).queryByText(/Kein Eintrag ausgewählt/)).toBeNull();
  });

  it('blendet "← Zur Liste" aus — die Liste ist sichtbar, ein Rückweg wäre sinnlos', async () => {
    render(EntityTab, { props: { appState: seed(), viewState: createViewState(), route: createRoute() } });
    await fireEvent.click(screen.getByText(/Bauer/));

    expect(screen.queryByRole('button', { name: /Zur Liste/ })).toBeNull();
  });

  it('wechselt den Detail-Pane bei einer zweiten Auswahl, ohne die Liste anzufassen', async () => {
    render(EntityTab, { props: { appState: seed(), viewState: createViewState(), route: createRoute() } });

    await fireEvent.click(screen.getByText(/Bauer/));
    await fireEvent.click(within(panes().list as HTMLElement).getByText(/Klein/));

    const { list, detail } = panes();
    expect(within(detail as HTMLElement).getByText(/Anna/)).toBeTruthy();
    expect(within(list as HTMLElement).getByText(/Bauer/)).toBeTruthy();
  });
});

describe('Mobile bleibt entweder-oder — der Multi-Pane erbt nicht nach unten', () => {
  beforeEach(() => {
    unpin = pinLayout(false);
  });

  it('rendert gar keine Panes, sondern die Liste allein', () => {
    render(EntityTab, { props: { appState: seed(), viewState: createViewState(), route: createRoute() } });

    expect(panes().list).toBeNull();
    expect(panes().detail).toBeNull();
    expect(screen.getByText(/Bauer/)).toBeTruthy();
  });

  it('ersetzt die Liste durch das Detail und behält "← Zur Liste"', async () => {
    render(EntityTab, { props: { appState: seed(), viewState: createViewState(), route: createRoute() } });

    await fireEvent.click(screen.getByText(/Bauer/));

    // Die zweite Person aus der Liste ist nicht mehr da: das Detail hat die Fläche.
    expect(screen.queryByText(/Klein/)).toBeNull();
    expect(screen.getByRole('button', { name: /Zur Liste/ })).toBeTruthy();
  });
});
