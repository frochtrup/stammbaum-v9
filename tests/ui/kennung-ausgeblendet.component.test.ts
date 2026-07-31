// @vitest-environment happy-dom
// tests/ui/kennung-ausgeblendet.component.test.ts — die technische Kennung erscheint nicht
// in der Oberfläche (BL-237, ADR-v9-172-Nachtrag).
//
// ANLASS: Nutzer-Rückfrage nach dem Hof-Dorfwechsel. Die Id `_hof_<adresse>_<dorf>` bleibt
// beim Umzug bewusst stehen (sie ist der Sync-Schlüssel, s. ADR-v9-172) und trägt danach
// den Slug des ALTEN Dorfes — sie ist damit nicht nur unlesbar, sondern irreführend.
// Sechs Stellen zeigten sie als Rückfall, wenn ein Objekt keinen Namen hat.
//
// Der Fall ist ein Randfall (Seed setzt Titel, Bootstrap setzt addrs[0]) — er entsteht
// erst, wenn jemand alle Namen entfernt. Genau deshalb steht er als Test da: von Hand
// stolpert man nicht darüber.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import HofDetail from '../../ui/views/hof/HofDetail.svelte';
import PlaceDetail from '../../ui/views/place/PlaceDetail.svelte';
import { createOrteHost } from '../../app-orte/orte-state.svelte';
import { createOrteNav } from '../../app-orte/orte-nav.svelte';
import { place, hof } from '../core/places-fixtures';
import { OHNE_ADRESSE, OHNE_NAMEN, hofHeading, placeHeading } from '../../ui/shell/place-labels';

describe('Hof ohne Adresse', () => {
  it('zeigt einen lesbaren Platzhalter statt der Kennung', () => {
    const host = createOrteHost();
    host.loadContent({
      placeObjects: new Map([['@P1@', place('@P1@', { title: 'Ochtrup' })]]),
      hofObjects: new Map([['_hof_bauernschaft_ep_3fff290c', hof('_hof_bauernschaft_ep_3fff290c', '@P1@', { addrs: [] })]]),
    });
    const nav = createOrteNav();
    nav.setCurrent('hof', '_hof_bauernschaft_ep_3fff290c');
    render(HofDetail, { props: { appState: host, viewState: nav } });

    expect(screen.getAllByText(OHNE_ADRESSE).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('_hof_bauernschaft_ep_3fff290c');
  });
});

describe('Ort ohne Titel', () => {
  it('zeigt einen lesbaren Platzhalter statt der Kennung', () => {
    const host = createOrteHost();
    host.loadContent({
      placeObjects: new Map([['_ep_3fff290c', place('_ep_3fff290c', { title: '' })]]),
      hofObjects: new Map(),
    });
    const nav = createOrteNav();
    nav.setCurrent('place', '_ep_3fff290c');
    render(PlaceDetail, { props: { appState: host, viewState: nav } });

    expect(screen.getAllByText(OHNE_NAMEN).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('_ep_3fff290c');
  });
});

describe('Die Helfer selbst', () => {
  it('bevorzugen den echten Namen, wo es einen gibt', () => {
    expect(placeHeading({ shortName: '', title: 'Ochtrup' })).toBe('Ochtrup');
    expect(placeHeading({ shortName: 'Frankfurt (Main)', title: 'Frankfurt am Main' })).toBe('Frankfurt (Main)');
    expect(hofHeading({ addrs: [{ value: 'Wall 33' }] })).toBe('Wall 33');
  });

  it('fallen auf den Platzhalter zurück, nie auf eine Kennung', () => {
    expect(placeHeading({ shortName: '', title: '' })).toBe(OHNE_NAMEN);
    expect(placeHeading(null)).toBe(OHNE_NAMEN);
    expect(hofHeading({ addrs: [] })).toBe(OHNE_ADRESSE);
    expect(hofHeading(null)).toBe(OHNE_ADRESSE);
  });
});
