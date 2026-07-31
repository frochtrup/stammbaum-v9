// @vitest-environment happy-dom
// tests/ui/PlaceMiniMap.component.test.ts — Mini-Karte-Präsentationskomponente
// (BL-214, ADR-v9-147). Deckt die Grundkarten-Umschaltung nach Kontext ab:
// App-online → OSM-Kachel-Insel (`.mini-map__leaflet`); App-offline → gebündelter
// Vektor-SVG-Renderer (aria-label „Karte: …"). Ohne Koordinaten: nichts (TST-16).
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PlaceMiniMap from '../../ui/views/place/PlaceMiniMap.svelte';
import { onlineStatus, type OnlineStatusEnv } from '../../ui/shell/online-status.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';

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

describe('PlaceMiniMap — Sprung zur Karte-Lens (ADR-v9-150)', () => {
  it('ohne Navigations-Kontext bleibt die Karte reine Anzeige (kein Klick-Signal ohne Ziel)', () => {
    onlineStatus.start(env(false));
    const { container } = render(PlaceMiniMap, {
      props: { lat: 52.2, long: 7.19, label: 'Ochtrup', context: { kind: 'ort' } },
    });
    expect(container.querySelector('.mini-map__frame--clickable')).toBeNull();
    expect(screen.queryByRole('button', { name: /Karte/ })).toBeNull();
  });

  it('mit viewState + onNavigateLens: Klick zentriert die Lens auf die Koordinate und wechselt dorthin', async () => {
    onlineStatus.start(env(false));
    const viewState = createViewState();
    const seen: string[] = [];
    render(PlaceMiniMap, {
      props: {
        lat: 52.2,
        long: 7.19,
        label: 'Ochtrup',
        context: { kind: 'ort' },
        viewState,
        focusId: '@P1@',
        onNavigateLens: (l: string) => seen.push(l),
      },
    });

    const frame = screen.getByRole('button', { name: 'Ochtrup auf der großen Karte öffnen' });
    await fireEvent.click(frame);

    // Derselbe Dreisatz wie CoordIndicator — beide über `focusOnMap` (INV-UI-4).
    expect(viewState.getMapCoordFocus()).toEqual({ lat: 52.2, long: 7.19 });
    expect(viewState.getCurrent('lensPlaceFocus')).toBe('@P1@');
    expect(seen).toEqual(['map']);
  });

  it('ist per Tastatur bedienbar (Enter) — role="button" ohne echtes <button>', async () => {
    onlineStatus.start(env(false));
    const viewState = createViewState();
    const seen: string[] = [];
    render(PlaceMiniMap, {
      props: {
        lat: 52.2, long: 7.19, label: 'Ochtrup', context: { kind: 'ort' },
        viewState, focusId: '@P1@', onNavigateLens: (l: string) => seen.push(l),
      },
    });

    await fireEvent.keyDown(screen.getByRole('button', { name: /Ochtrup/ }), { key: 'Enter' });

    expect(seen).toEqual(['map']);
  });

  it('die OSM-Attribution steht AUSSERHALB der klickbaren Fläche (BL-66)', () => {
    // Vormals lag Leaflets Attribution IM Rahmen, und ein Klick-Wächter (`closest('a')`)
    // hielt den Rahmen-Handler davon ab, den Link zu kapern. Das löste nur die halbe
    // Frage: ein fokussierbarer Link INNERHALB eines `role="button"` ist für Screenreader
    // und Tastatur ein Bedienelement im Bedienelement (axe `nested-interactive`) —
    // dagegen half kein Klick-Wächter. Jetzt trägt Leaflet keine Attribution mehr
    // (`attributionControl: false`), und die Namensnennung steht als eigene Zeile
    // darunter. Damit ist der Wächter überflüssig statt nur unauffällig.
    onlineStatus.start(env(true));
    const viewState = createViewState();
    const { container } = render(PlaceMiniMap, {
      props: {
        lat: 52.2, long: 7.19, label: 'Ochtrup', context: { kind: 'ort' },
        viewState, focusId: '@P1@', onNavigateLens: () => {},
      },
    });

    const frame = container.querySelector('.mini-map__frame--clickable')!;
    expect(frame.querySelector('a')).toBeNull();

    const attribution = container.querySelector('.mini-map__attribution a') as HTMLAnchorElement | null;
    expect(attribution?.href).toBe('https://openstreetmap.org/copyright');
    expect(frame.contains(attribution)).toBe(false);
  });
});
