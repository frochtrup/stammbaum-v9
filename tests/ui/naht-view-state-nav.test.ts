// tests/ui/naht-view-state-nav.test.ts — die Naht „Auswahl → Navigation → Rückweg"
// (INV-VS, Spec 21 §5; BL-293).
//
// WARUM DIESE DATEI, UND WARUM SIE ANDERS AUSSIEHT ALS view-state.test.ts. INV-VS hing an
// GENAU EINER Testdatei — gemessen mit `npm run test:mutation --nur INV-VS`. Beim Versuch,
// eine zweite anzulegen, kam ein Befund zutage, der wichtiger ist als die Zahl: die
// Mutation zielte auf das Change-Event (`for (const fn of listeners) …` stillgelegt), und
// `viewState.subscribe` hat im ganzen Repo KEINEN Produktionskonsumenten — die Svelte-
// Seite liest reaktiv über `$derived`. Jede zweite Datei gegen diese Mutation hätte
// zwangsläufig wieder `subscribe` aufgerufen, also den vorhandenen Einzelfall kopiert;
// genau das schließt BL-293 aus. Die Mutation wurde deshalb auf die Eigenschaft umgezielt,
// die INV-VS BENENNT: „genau eine Auswahl **je Ziel**" (s. `tools/mutation/mutationen.mjs`).
//
// Diese Datei verteidigt sie dort, wo sie wirkt: im Verlauf. `nav-history` verbucht je
// Ziel die zuständigen Slots (`slotsFor`) und stellt sie beim Rückweg wieder her. Fielen
// die Ziele in EINEN gemeinsamen Topf — v8s `currentX`/`_lastTabSel`-Trio, gegen das
// INV-VS formuliert ist —, dann überschriebe jeder Sprung die Auswahl des vorigen Ortes,
// und der Rückweg führte an eine leere oder falsche Stelle. Das ist keine Eigenschaft der
// Datenstruktur mehr, sondern eine des Weges; sie ist an `setCurrent` allein nicht
// sichtbar.
//
// Reine Zustandslogik ohne DOM (TST-5) — wie nav-history.test.ts.
import { describe, expect, it } from 'vitest';
import { createNavHistory, slotsFor } from '../../ui/shell/nav-history.svelte';
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

describe('Naht Auswahl → Navigation → Rückweg: eine Auswahl je Ziel (INV-VS)', () => {
  it('drei Ziele nacheinander besucht — jedes behält SEINE Auswahl, keins überschreibt ein anderes', () => {
    const { route, viewState, history, record } = aufbau();

    viewState.setCurrent('person', '@I1@');
    record();
    route.setTarget('place');
    viewState.setCurrent('place', 'p_arpke');
    record();
    route.setTarget('hof');
    viewState.setCurrent('hof', 'h_nr3');
    record();

    // Am Ziel angekommen stehen alle drei Auswahlen nebeneinander — kein gemeinsamer Topf.
    expect(viewState.getCurrent('person')).toBe('@I1@');
    expect(viewState.getCurrent('place')).toBe('p_arpke');
    expect(viewState.getCurrent('hof')).toBe('h_nr3');

    // Und der Rückweg findet jeden Ort so wieder, wie er verlassen wurde.
    expect(history.back()).toBe(true);
    expect(route.target).toBe('place');
    expect(viewState.getCurrent('place')).toBe('p_arpke');

    expect(history.back()).toBe(true);
    expect(route.target).toBe('person');
    expect(viewState.getCurrent('person')).toBe('@I1@');
  });

  it('ein Ziel mit ZWEI zuständigen Slots (Quelle + Archiv) verliert beim Rückweg keinen davon', () => {
    // `slotsFor('source')` führt beide: das Segment zeigt wahlweise eine Quelle oder ein
    // Archiv. Ein Rückweg, der nur einen Slot kennt, landete auf der falschen Fläche.
    const { route, viewState, history, record } = aufbau();
    expect(slotsFor('source')).toEqual(['source', 'repository']);

    route.setTarget('source');
    viewState.setCurrent('source', '@S1@');
    viewState.setCurrent('repository', '@R1@');
    record();
    route.setTarget('person');
    viewState.setCurrent('person', '@I9@');
    record();

    expect(history.back()).toBe(true);
    expect(viewState.getCurrent('source')).toBe('@S1@');
    expect(viewState.getCurrent('repository')).toBe('@R1@');
  });

  it('Vorwärts stellt denselben Stand wieder her, den Zurück verlassen hat', () => {
    const { route, viewState, history, record } = aufbau();

    viewState.setCurrent('person', '@I1@');
    record();
    route.setTarget('place');
    viewState.setCurrent('place', 'p_dolgen');
    record();

    expect(history.back()).toBe(true);
    expect(route.target).toBe('person');
    expect(history.forward()).toBe(true);
    expect(route.target).toBe('place');
    expect(viewState.getCurrent('place')).toBe('p_dolgen');
    // Die Personen-Auswahl hat der Ausflug nicht angefasst.
    expect(viewState.getCurrent('person')).toBe('@I1@');
  });

  it('der geteilte Lens-Fokus ist EIN Slot für alle Lenses — und keiner der Entitäts-Slots', () => {
    // Spec 21 §4: „Der Fokus bleibt beim Lens-Wechsel erhalten". Baum und Karte lesen
    // denselben Slot; die Personen-LISTE daneben hat trotzdem ihre eigene Auswahl.
    const { route, viewState, history, record } = aufbau();
    expect(slotsFor('tree')).toEqual(['lensFocus']);
    expect(slotsFor('map')).toEqual(['lensFocus']);

    viewState.setCurrent('person', '@I1@');
    record();
    route.setTarget('tree');
    viewState.setCurrent('lensFocus', '@I5@');
    record();
    route.setTarget('map');
    record();

    expect(viewState.getCurrent('lensFocus')).toBe('@I5@');
    expect(viewState.getCurrent('person')).toBe('@I1@');

    expect(history.back()).toBe(true);
    expect(route.target).toBe('tree');
    expect(viewState.getCurrent('lensFocus')).toBe('@I5@');
  });
});
