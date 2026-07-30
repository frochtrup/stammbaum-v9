// @vitest-environment happy-dom
// tests/orte/hof-flaeche.test.ts — die Hof-Fläche im Editor (OE-6, Spec 22 §3/§6).
//
// Geschwister-Datei zu orte-flaeche.test.ts. Sie existiert getrennt, weil die Hof-Liste
// eine EIGENE Anwendung derselben Regel ist: D1 wurde in beiden Listen gesetzt, und ein
// Fix nur an der aufgefallenen Stelle wäre der halbe Fix (die wiederkehrende Lehre dieses
// Projekts — wo gilt dieselbe Regel noch?).
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import HofList from '../../ui/views/hof/HofList.svelte';
import HofDetail from '../../ui/views/hof/HofDetail.svelte';
import { createOrteHost } from '../../app-orte/orte-state.svelte';
import { createOrteNav } from '../../app-orte/orte-nav.svelte';
import { hof, place } from '../core/places-fixtures';

function hostWithHofs(...addrs: string[]) {
  const host = createOrteHost();
  host.loadContent({
    placeObjects: new Map([['@P1@', place('@P1@', { title: 'Ochtrup', type: 'Village' })]]),
    hofObjects: new Map(
      addrs.map((a, i) => [
        `_hof_${i}_@P1@`,
        hof(`_hof_${i}_@P1@`, '@P1@', { addrs: [{ value: a, from: null, to: null }] })
      ])
    )
  });
  return host;
}

describe('Hof-Liste im Editor (D1)', () => {
  it('zeigt ALLE Höfe — die Hauptliste wäre ohne Ereignisse sonst leer', () => {
    const host = hostWithHofs('Wall 33', 'Schulze-Hof');
    render(HofList, { props: { appState: host, viewState: createOrteNav() } });

    expect(screen.getByText('Wall 33')).toBeTruthy();
    expect(screen.getByText('Schulze-Hof')).toBeTruthy();
  });

  it('blendet den „Ohne Bezug"-Umschalter aus', () => {
    const host = hostWithHofs('Wall 33');
    render(HofList, { props: { appState: host, viewState: createOrteNav() } });
    expect(screen.queryByRole('tablist', { name: /Höfe-Abschnitt/ })).toBeNull();
  });

  it('navigiert per Klick ins Hof-Detail', async () => {
    const host = hostWithHofs('Wall 33');
    const nav = createOrteNav();
    render(HofList, { props: { appState: host, viewState: nav } });

    await fireEvent.click(screen.getByText('Wall 33'));
    expect(nav.getCurrent('hof')).toBe('_hof_0_@P1@');
  });
});

describe('Hof-Detail im Editor (D3)', () => {
  it('rendert den Hof und blendet die Bewohner-Sektion aus', () => {
    const host = hostWithHofs('Wall 33');
    const nav = createOrteNav();
    nav.setCurrent('hof', '_hof_0_@P1@');
    render(HofDetail, { props: { appState: host, viewState: nav } });

    expect(screen.getAllByText(/Wall 33/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Bewohner/)).toBeNull();
  });

  it('eine Adress-Umbenennung landet im Bestand', () => {
    const host = hostWithHofs('Wall 33');
    host.updateHofAddr('_hof_0_@P1@', 0, 'Wall 35', null, null);
    expect(host.db.hofObjects.get('_hof_0_@P1@')?.addrs[0].value).toBe('Wall 35');
    expect(host.dirty).toBe(true);
  });

  it('Hof-Merge führt zusammen und ist rücknehmbar', () => {
    const host = hostWithHofs('Wall 33', 'Wall 33');
    host.mergeHof('_hof_0_@P1@', '_hof_1_@P1@');
    expect(host.db.hofObjects.size).toBe(1);
    host.undo();
    expect(host.db.hofObjects.size).toBe(2);
  });
});
