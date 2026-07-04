// @vitest-environment happy-dom
// tests/ui/MapLensView.component.test.ts — Platzhalter-Slot für die Karten-Lens
// (Spec 21 §4, ADR-v9-25). Prüft NUR die Navigations-/Fokus-Verdrahtung, die dieser
// Bauabschnitt vorbereitet — der echte Karteninhalt ist ein späterer Bauabschnitt.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import MapLensView from '../../ui/views/map/MapLensView.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';

describe('MapLensView — Platzhalter mit vorbereiteter Lens-/Fokus-Verdrahtung', () => {
  it('bindet den EINEN Lens-Umschalter mit "Karte" als aktiver Lens ein', () => {
    render(MapLensView, { props: { appState: createAppState(), viewState: createViewState() } });

    const mapTab = screen.getByRole('tab', { name: /Karte/ });
    expect(mapTab.getAttribute('aria-current')).toBe('page');
  });

  it('zeigt den ComingSoonPanel-Platzhalter (kein echter Karteninhalt in dieser Slice)', () => {
    render(MapLensView, { props: { appState: createAppState(), viewState: createViewState() } });

    expect(screen.getByText('Dieser Bereich folgt in einem späteren Bau-Durchgang.')).toBeTruthy();
  });

  it('liest den geteilten ViewState-Fokus-Slot "lensFocus" (derselbe Slot wie TreeView)', () => {
    const viewState = createViewState();
    viewState.setCurrent('lensFocus', '@I1@');

    render(MapLensView, { props: { appState: createAppState(), viewState } });

    expect(screen.getByText(/@I1@/)).toBeTruthy();
  });

  it('Klick auf "Baum" im eingebetteten Umschalter ruft onNavigateLens mit "tree" auf', async () => {
    const onNavigateLens = vi.fn();
    render(MapLensView, {
      props: { appState: createAppState(), viewState: createViewState(), onNavigateLens },
    });

    await fireEvent.click(screen.getByRole('tab', { name: /Baum/ }));

    expect(onNavigateLens).toHaveBeenCalledWith('tree');
  });
});
