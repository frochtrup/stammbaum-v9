// @vitest-environment happy-dom
// tests/ui/EventLine.component.test.ts — geteilte Ereigniszeile (ADR-v9-80, Spec 32 §6).
// Ersetzt die vorher byte-identisch duplizierten `{#snippet eventRow}`-Kopien in
// PersonDetail.svelte/FamilyDetail.svelte — hier isoliert getestet (INV-UI-4).
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import EventLine from '../../ui/shell/EventLine.svelte';
import type { EventLineRow } from '../../ui/shell/event-line-row';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeCitation, makeDatabase, makeSource } from '../../core/model';

function row(patch: Partial<EventLineRow> = {}): EventLineRow {
  return {
    key: 'BIRT',
    label: 'Geburt',
    dateLabel: '',
    placeLabel: '',
    value: '',
    addr: '',
    note: '',
    citations: [],
    coords: null,
    placeId: null,
    hofId: null,
    empty: false,
    ...patch,
  };
}

describe('EventLine — Datum + klickbarer Ort (ADR-v9-80 Punkt 1)', () => {
  it('rendert "Datum, Ort" mit dem Ort als klickbarem Link, wenn placeId + onNavigateToPlace vorhanden sind', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const onNavigateToPlace = vi.fn();

    render(EventLine, {
      props: {
        ev: row({ dateLabel: '12. März 1890', placeLabel: 'Ochtrup', placeId: '@P1@' }),
        appState,
        viewState,
        onNavigateToPlace,
        onEdit: vi.fn(),
      },
    });

    expect(screen.getByText(/12\. März 1890/)).toBeTruthy();
    const link = screen.getByRole('button', { name: 'Ochtrup' });
    await fireEvent.click(link);
    expect(onNavigateToPlace).toHaveBeenCalledWith('@P1@');
  });

  it('Hof hat Priorität vor Ort, wenn beide gesetzt sind (hofId > placeId)', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const onNavigateToPlace = vi.fn();
    const onNavigateToHof = vi.fn();

    render(EventLine, {
      props: {
        ev: row({ dateLabel: '1950', placeLabel: 'Wall 33', placeId: '@P1@', hofId: '@H1@' }),
        appState,
        viewState,
        onNavigateToPlace,
        onNavigateToHof,
        onEdit: vi.fn(),
      },
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Wall 33' }));

    expect(onNavigateToHof).toHaveBeenCalledWith('@H1@');
    expect(onNavigateToPlace).not.toHaveBeenCalled();
  });

  it('unaufgelöster Freitext-Ort (keine placeId/hofId) bleibt unverlinkter Text — kein Link ohne Ziel', () => {
    const appState = createAppState();
    const viewState = createViewState();

    render(EventLine, {
      props: {
        ev: row({ dateLabel: '1950', placeLabel: 'Irgendwo' }),
        appState,
        viewState,
        onNavigateToPlace: vi.fn(),
        onEdit: vi.fn(),
      },
    });

    expect(screen.queryByRole('button', { name: 'Irgendwo' })).toBeNull();
    expect(screen.getByText('Irgendwo')).toBeTruthy();
  });

  it('placeId gesetzt, aber KEIN onNavigateToPlace-Callback übergeben: bleibt unverlinkter Text', () => {
    const appState = createAppState();
    const viewState = createViewState();

    render(EventLine, {
      props: {
        ev: row({ dateLabel: '1950', placeLabel: 'Ochtrup', placeId: '@P1@' }),
        appState,
        viewState,
        onEdit: vi.fn(),
      },
    });

    expect(screen.queryByRole('button', { name: 'Ochtrup' })).toBeNull();
    expect(screen.getByText('Ochtrup')).toBeTruthy();
  });
});

describe('EventLine — CoordIndicator statt "Karte ↗"-Text-Link (ADR-v9-80 Punkt 2)', () => {
  it('zeigt den CoordIndicator (gefüllter Glyph), wenn das Ereignis Koordinaten hat', () => {
    const appState = createAppState();
    const viewState = createViewState();

    render(EventLine, {
      props: {
        ev: row({ dateLabel: '1950', coords: { lat: 52.1, long: 7.6 } }),
        appState,
        viewState,
        onEdit: vi.fn(),
      },
    });

    expect(screen.getByText('◎')).toBeTruthy();
    expect(screen.queryByText('Karte ↗')).toBeNull();
  });

  it('zeigt KEINEN CoordIndicator, wenn die Zeile weder Koordinaten noch einen Ort hat', () => {
    const appState = createAppState();
    const viewState = createViewState();

    render(EventLine, {
      props: { ev: row({ value: 'Bauer' }), appState, viewState, onEdit: vi.fn() },
    });

    expect(screen.queryByText('◎')).toBeNull();
    expect(screen.queryByText('◌')).toBeNull();
  });

  it('Klick auf den Glyph setzt lensPlaceFocus (hofId > placeId) und ruft onNavigateLens("map") auf — Hof trägt eigene Koordinaten', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const onNavigateLens = vi.fn();
    appState.db.hofObjects.set('@H1@', {
      id: '@H1@',
      villageId: '@P1@',
      addrs: [],
      lat: 52.1,
      long: 7.6,
      note: '',
      existsFrom: null,
      existsTo: null,
      predecessor: null,
      successor: null,
      govId: null,
      govTypes: null,
      schemaVersion: 1,
    });

    render(EventLine, {
      props: {
        ev: row({ dateLabel: '1950', coords: { lat: 52.1, long: 7.6 }, placeId: '@P1@', hofId: '@H1@' }),
        appState,
        viewState,
        onNavigateLens,
        onEdit: vi.fn(),
      },
    });

    await fireEvent.click(screen.getByText('◎'));

    expect(viewState.getCurrent('lensPlaceFocus')).toBe('@H1@');
    expect(onNavigateLens).toHaveBeenCalledWith('map');
  });

  it('Ereignis mit NUR Fallback-Koordinaten (ev.lati/long, PlaceObject selbst ohne eigene lat/long) zeigt gefüllten Glyph, aber KEINEN internen Karte-Sprung — Regressionstest, s. ADR-v9-78/80-Bau-Nachtrag', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const onNavigateLens = vi.fn();
    // Realistischer Fall: frisch geseedetes PlaceObject (ADR-v9-28/44) OHNE eigene
    // Koordinaten — `ev.coords` kommt hier ausschließlich aus dem `ev.lati/long`-
    // Fallback (eventCoords-Chokepoint, Spec 11 §5), NICHT vom PlaceObject selbst.
    appState.db.placeObjects.set('@P1@', {
      id: '@P1@',
      title: 'Rheine',
      type: '',
      pnames: [],
      enclosedBy: [],
      lat: null,
      long: null,
      note: '',
      existsFrom: null,
      existsTo: null,
      govId: null,
      govTypes: null,
    });

    render(EventLine, {
      props: {
        ev: row({ dateLabel: '1930', placeLabel: 'Rheine', coords: { lat: 52.28, long: 7.43 }, placeId: '@P1@' }),
        appState,
        viewState,
        onNavigateLens,
        onEdit: vi.fn(),
      },
    });

    // Glyph bleibt gefüllt (ev.coords ist vorhanden) — informativ, aber nicht mehr
    // als Button (kein Sprungziel, die Karte kann diesen Ort nicht zentrieren/markieren,
    // da placesWithCoords() nur Orte MIT eigenen Koordinaten als Marker führt).
    expect(screen.getByText('◎')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '◎' })).toBeNull();

    expect(viewState.getCurrent('lensPlaceFocus')).toBeNull();
    expect(onNavigateLens).not.toHaveBeenCalled();
  });
});

describe('EventLine — Quellen-Badges (unverändert übernommen)', () => {
  it('rendert eine §N-Badge je Zitat', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.sources.set('@S42@', makeSource('@S42@', { abbr: 'KB Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');

    render(EventLine, {
      props: {
        ev: row({ citations: [makeCitation('@S42@', { quay: 3 })] }),
        appState,
        viewState,
        onEdit: vi.fn(),
      },
    });

    const badge = screen.getByText('§42');
    expect(badge.className).toContain('src-badge--q3');
  });
});

describe('EventLine — ✕-Rücknahme + ✎-Bearbeiten', () => {
  it('zeigt das ✕-Control nur, wenn empty=true UND onRetract übergeben wurde', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const onRetract = vi.fn();

    const { unmount } = render(EventLine, {
      props: { ev: row({ empty: true }), appState, viewState, onRetract, onEdit: vi.fn() },
    });
    await fireEvent.click(screen.getByLabelText('Geburt zurücknehmen'));
    expect(onRetract).toHaveBeenCalledWith('BIRT');
    unmount();

    render(EventLine, { props: { ev: row({ empty: true }), appState, viewState, onEdit: vi.fn() } });
    expect(screen.queryByLabelText('Geburt zurücknehmen')).toBeNull();
  });

  it('ruft onEdit mit dem Zeilen-Key auf', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const onEdit = vi.fn();

    render(EventLine, { props: { ev: row({ key: 'ev-2' }), appState, viewState, onEdit } });
    await fireEvent.click(screen.getByLabelText('Geburt bearbeiten'));

    expect(onEdit).toHaveBeenCalledWith('ev-2');
  });
});

describe('EventLine — Note/Addr/Value', () => {
  it('rendert addr, value und note, wenn gesetzt', () => {
    const appState = createAppState();
    const viewState = createViewState();

    render(EventLine, {
      props: {
        ev: row({ value: 'Bauer', addr: 'Wall 33', note: 'Anmerkung' }),
        appState,
        viewState,
        onEdit: vi.fn(),
      },
    });

    expect(screen.getByText('Bauer')).toBeTruthy();
    expect(screen.getByText('Wall 33')).toBeTruthy();
    expect(screen.getByText('Anmerkung')).toBeTruthy();
  });
});
