// @vitest-environment happy-dom
// tests/ui/PlaceMiniMap.component.test.ts — Mini-Karte-Präsentationskomponente
// (BL-214, ADR-v9-147). Deckt die Grundkarten-Umschaltung nach Kontext ab:
// App-online → OSM-Kachel-Insel (`.mini-map__leaflet`); App-offline → gebündelter
// Vektor-SVG-Renderer (aria-label „Karte: …"). Ohne Koordinaten: nichts (TST-16).
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import PlaceMiniMap from '../../ui/views/place/PlaceMiniMap.svelte';
import { onlineStatus, type OnlineStatusEnv } from '../../ui/shell/online-status.svelte';

function env(online: boolean): OnlineStatusEnv {
  return {
    isOnline: () => online,
    addListener: () => {},
    removeListener: () => {},
    hasAppCache: async () => true,
  };
}

afterEach(() => onlineStatus.reset());

describe('PlaceMiniMap — Grundkarten-Umschaltung (BL-214)', () => {
  it('App-offline: rendert den Vektor-SVG (self-contained), keine Kachel-Insel', () => {
    onlineStatus.start(env(false));
    const { container } = render(PlaceMiniMap, {
      props: { lat: 52.2, long: 7.19, label: 'Ochtrup', context: { kind: 'ort' } },
    });
    expect(screen.getByRole('img', { name: /Karte: Ochtrup/ })).toBeTruthy();
    expect(container.querySelector('.mini-map__leaflet')).toBeNull();
  });

  it('App-online: mountet die Kachel-Insel, KEIN Vektor-SVG', () => {
    onlineStatus.start(env(true));
    const { container } = render(PlaceMiniMap, {
      props: { lat: 52.2, long: 7.19, label: 'Ochtrup', context: { kind: 'ort' } },
    });
    expect(container.querySelector('.mini-map__leaflet')).not.toBeNull();
    expect(screen.queryByRole('img', { name: /Karte:/ })).toBeNull();
  });

  it('ohne Koordinaten: rendert gar nichts (TST-16, unangereicherter Regelfall)', () => {
    onlineStatus.start(env(false));
    const { container } = render(PlaceMiniMap, { props: { lat: null, long: null, context: { kind: 'ort' } } });
    expect(container.querySelector('.mini-map')).toBeNull();
    expect(screen.queryByRole('img', { name: /Karte:/ })).toBeNull();
  });

  it('Hof-Kontext (offline): zeichnet Dorf/Geschwisterhöfe als zusätzliche Kontext-Punkte', () => {
    onlineStatus.start(env(false));
    const withCtx = render(PlaceMiniMap, {
      props: {
        lat: 52.2,
        long: 7.19,
        label: 'Wall 33',
        context: { kind: 'hof', villageCoords: { lat: 52.21, long: 7.17 }, siblingCoords: [{ lat: 52.19, long: 7.22 }] },
      },
    });
    const svg = withCtx.container.querySelector('.mini-map__svg')!;
    // Marker (2 Kreise) + 2 Kontext-Punkte → mehr Kreise als eine reine Marker-Karte.
    expect(svg.querySelectorAll('circle').length).toBeGreaterThanOrEqual(4);
  });
});
