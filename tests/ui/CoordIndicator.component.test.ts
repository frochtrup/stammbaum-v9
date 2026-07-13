// @vitest-environment happy-dom
// tests/ui/CoordIndicator.component.test.ts — geteilter Koordinaten-Indikator
// (ADR-v9-79 Punkt l, ADR-v9-80 Punkt 2, Spec 32 §6). Deckt den Paar-Zustand-Glyph
// (◎/◌), den internen Karte-Sprung (`lensPlaceFocus` + `onNavigateLens`) UND die
// sekundäre externe OpenStreetMap-Affordanz ab.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/svelte';
import CoordIndicator from '../../ui/shell/CoordIndicator.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';

describe('CoordIndicator — Glyph-Zustand', () => {
  it('rendert den gefüllten Glyph (◎), wenn Koordinaten vorhanden sind', () => {
    const viewState = createViewState();

    render(CoordIndicator, {
      props: { coords: { lat: 52.1, long: 7.6 }, focusId: '@P1@', viewState },
    });

    expect(screen.getByText('◎')).toBeTruthy();
    expect(screen.queryByText('◌')).toBeNull();
  });

  it('rendert den leeren Glyph (◌), wenn keine Koordinaten vorhanden sind', () => {
    const viewState = createViewState();

    render(CoordIndicator, { props: { coords: null, focusId: null, viewState } });

    expect(screen.getByText('◌')).toBeTruthy();
    expect(screen.queryByText('◎')).toBeNull();
  });
});

describe('CoordIndicator — interner Karte-Sprung (ADR-v9-78/80)', () => {
  it('Klick mit Koordinaten + focusId setzt lensPlaceFocus und navigiert zur Karte-Lens', async () => {
    const viewState = createViewState();
    const onNavigateLens = vi.fn();

    render(CoordIndicator, {
      props: { coords: { lat: 52.1, long: 7.6 }, focusId: '@P1@', viewState, onNavigateLens },
    });

    await fireEvent.click(screen.getByText('◎'));

    expect(viewState.getCurrent('lensPlaceFocus')).toBe('@P1@');
    expect(onNavigateLens).toHaveBeenCalledWith('map');
  });

  it('Klick ohne Koordinaten tut nichts — der Glyph ist kein Link/Button', () => {
    const viewState = createViewState();
    const onNavigateLens = vi.fn();

    render(CoordIndicator, { props: { coords: null, focusId: null, viewState, onNavigateLens } });

    const glyph = screen.getByText('◌');
    expect(glyph.tagName).not.toBe('BUTTON');
    expect(glyph.closest('button')).toBeNull();
  });

  it('Koordinaten vorhanden, aber keine focusId: Glyph bleibt nicht-interaktiv (kein Sprungziel)', async () => {
    const viewState = createViewState();
    const onNavigateLens = vi.fn();

    render(CoordIndicator, {
      props: { coords: { lat: 52.1, long: 7.6 }, focusId: null, viewState, onNavigateLens },
    });

    const glyph = screen.getByText('◎');
    expect(glyph.closest('button')).toBeNull();
    expect(onNavigateLens).not.toHaveBeenCalled();
  });
});

describe('CoordIndicator — sekundäre externe Affordanz (OpenStreetMap)', () => {
  it('zeigt den "↗ OpenStreetMap"-Link nur, wenn Koordinaten vorhanden sind', () => {
    const viewState = createViewState();

    const { unmount } = render(CoordIndicator, {
      props: { coords: { lat: 52.1, long: 7.6 }, focusId: '@P1@', viewState },
    });

    const link = screen.getByRole('link', { name: /OpenStreetMap/ });
    expect(link.getAttribute('href')).toContain('52.1');
    expect(link.getAttribute('href')).toContain('7.6');
    unmount();

    render(CoordIndicator, { props: { coords: null, focusId: null, viewState } });
    expect(screen.queryByRole('link', { name: /OpenStreetMap/ })).toBeNull();
  });
});
