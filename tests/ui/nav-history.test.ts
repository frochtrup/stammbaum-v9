// tests/ui/nav-history.test.ts — History-Navigation über die EINE Routen-Quelle
// (Spec 20 §1.1, Spec 21 §2/§3 INV-UI-15, BL-07, ADR-v9-177).
//
// Reine Zustandslogik ohne DOM (TST-5): der Verlauf ist eine Frage an Route + ViewState,
// nicht an gerenderte Knöpfe. Die Geste dazu liegt in swipe-nav.test.ts.
import { describe, expect, it } from 'vitest';
import { createNavHistory, slotsFor, NAV_HISTORY_CAP } from '../../ui/shell/nav-history.svelte';
import { createRoute } from '../../ui/shell/route.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';

function aufbau() {
  const route = createRoute();
  const viewState = createViewState();
  const history = createNavHistory(route, viewState);
  /** Was der beobachtende `$effect` in App.svelte tut — hier von Hand ausgelöst. */
  const record = () => history.record();
  return { route, viewState, history, record };
}

describe('BL-07: Verlauf — Zurück/Vorwärts', () => {
  it('am Anfang gibt es weder Zurück noch Vorwärts', () => {
    const { history, record } = aufbau();
    record();
    expect(history.canGoBack).toBe(false);
    expect(history.canGoForward).toBe(false);
    expect(history.back()).toBe(false);
    expect(history.forward()).toBe(false);
  });

  it('HERKUNFTSBEWUSST: Person A → Ort → Person C führt zurück auf Person A, nicht auf die Liste', () => {
    // Genau der Weg, an dem „← Zur Liste" scheiterte (Ereigniszeile → Ort → Person).
    const { route, viewState, history, record } = aufbau();
    viewState.setCurrent('person', '@I1@');
    record();
    route.setTarget('place');
    viewState.setCurrent('place', 'p_ochtrup');
    record();
    route.setTarget('person');
    viewState.setCurrent('person', '@I3@');
    record();

    expect(history.back()).toBe(true);
    expect(route.target).toBe('place');
    expect(viewState.getCurrent('place')).toBe('p_ochtrup');

    expect(history.back()).toBe(true);
    expect(route.target).toBe('person');
    expect(viewState.getCurrent('person')).toBe('@I1@');
  });

  it('die AUSWAHL gehört zum Punkt — Person A → Person C ist ein Ortswechsel', () => {
    const { viewState, history, record } = aufbau();
    viewState.setCurrent('person', '@I1@');
    record();
    viewState.setCurrent('person', '@I3@');
    record();

    expect(history.canGoBack).toBe(true);
    history.back();
    expect(viewState.getCurrent('person')).toBe('@I1@');
  });

  it('vorwärts führt zurück auf den verlassenen Punkt', () => {
    const { route, history, record } = aufbau();
    record();
    route.setTarget('map');
    record();

    history.back();
    expect(route.target).toBe('person');
    expect(history.canGoForward).toBe(true);
    expect(history.forward()).toBe(true);
    expect(route.target).toBe('map');
    expect(history.canGoForward).toBe(false);
  });

  it('ein NEUER Weg nach dem Zurückgehen verwirft den Vorwärts-Ast (wie im Browser)', () => {
    const { route, history, record } = aufbau();
    record();
    route.setTarget('map');
    record();
    history.back();
    expect(history.canGoForward).toBe(true);

    route.setTarget('tasks');
    record();
    expect(history.canGoForward).toBe(false);
  });

  it('record ist IDEMPOTENT — derselbe Stand mehrfach verbucht ergibt keinen Rückweg', () => {
    // Das ist der Grund, warum kein Aufrufer ein `pushHistory=false`-Flag braucht (v8):
    // nach `back()` läuft der beobachtende Effekt erneut und darf nichts anrichten.
    const { route, history, record } = aufbau();
    record();
    route.setTarget('map');
    record();
    history.back();
    record();
    record();

    expect(history.canGoBack).toBe(false);
    expect(history.canGoForward).toBe(true); // der Vorwärts-Ast überlebt das Nach-Verbuchen
  });

  it('der Stapel ist gedeckelt (kein unbegrenztes Wachsen über eine lange Sitzung)', () => {
    const { viewState, history, record } = aufbau();
    for (let i = 0; i < NAV_HISTORY_CAP + 20; i++) {
      viewState.setCurrent('person', `@I${i}@`);
      record();
    }
    let schritte = 0;
    while (history.back()) schritte++;
    expect(schritte).toBe(NAV_HISTORY_CAP);
  });

  it('slotsFor: Quellen führen Quelle UND Archiv, Lenses den geteilten Fokus', () => {
    expect(slotsFor('source')).toEqual(['source', 'repository']);
    expect(slotsFor('person')).toEqual(['person']);
    expect(slotsFor('map')).toEqual(['lensFocus']);
    expect(slotsFor('timeline')).toEqual(['lensFocus']);
    // Arbeitsflächen ohne Auswahl: das Ziel selbst IST der Ort.
    expect(slotsFor('file')).toEqual([]);
    expect(slotsFor('more')).toEqual([]);
  });

  it('der Rückweg ins Quellen-Segment stellt auch ein offenes Archiv wieder her', () => {
    const { route, viewState, history, record } = aufbau();
    route.setTarget('source');
    viewState.setCurrent('repository', '@R2@');
    record();
    route.setTarget('person');
    record();

    history.back();
    expect(route.target).toBe('source');
    expect(viewState.getCurrent('repository')).toBe('@R2@');
  });

  it('INV-VS bleibt gewahrt: der Verlauf fasst nur die Slots seines Ziels an', () => {
    // Ein Rücksprung in die Karte darf keine Personenliste-Auswahl umschreiben —
    // die ViewState-Slots sind unabhängig (tests/ui/view-state.test.ts).
    const { route, viewState, history, record } = aufbau();
    route.setTarget('map');
    viewState.setCurrent('lensFocus', '@I9@');
    record();
    route.setTarget('person');
    viewState.setCurrent('person', '@I1@');
    record();

    history.back();
    expect(viewState.getCurrent('person')).toBe('@I1@');
    expect(viewState.getCurrent('lensFocus')).toBe('@I9@');
  });
});
