// @vitest-environment happy-dom
// tests/ui/MapExplorePanel.component.test.ts — Orts-Explorationspanel der Karte-Lens
// (BL-210, Spec 20 §1.9; v8-Orakel `_showExplorationPanel`).
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import MapExplorePanel from '../../ui/views/map/MapExplorePanel.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makePerson, makeEvent } from '../../core/model';
import { savePlaceObject, saveHofObject } from '../../core/places';
import { place, hof } from '../core/places-fixtures';

function stateWithData(): ReturnType<typeof createAppState> {
  const db = makeDatabase();
  savePlaceObject(db.placeObjects, place('P1', { title: 'Ochtrup', lat: 52.2, long: 7.2 }));
  saveHofObject(db.hofObjects, hof('H1', 'P1', { addrs: [{ value: 'Wall 33', from: null, to: null }], lat: 52.2, long: 7.2 }));
  const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
  p.birth.placeId = 'P1';
  p.birth.date = '1 JAN 1850';
  db.individuals.set('@I1@', p);
  const q = makePerson('@I2@', { given: 'Otto', surname: 'Meyer' });
  // Unangereicherter Weg: nur Adresse, kein `hofId` (TST-16).
  q.events.push(makeEvent('RESI', { placeId: 'P1', addr: 'Wall 33', date: '1 JAN 1900' }));
  db.individuals.set('@I2@', q);
  const appState = createAppState();
  appState.loadDatabase(db, 'test.ged');
  return appState;
}

describe('MapExplorePanel (BL-210)', () => {
  it('rendert nichts ohne geklickten Marker', () => {
    const { container } = render(MapExplorePanel, {
      props: { appState: stateWithData(), placeId: null, onClose: vi.fn() },
    });
    expect(container.querySelector('.map-explore')).toBeNull();
  });

  it('zeigt Titel + Personen des geklickten Orts und navigiert auf Personen-Klick', async () => {
    const onNavigateToPerson = vi.fn();
    render(MapExplorePanel, {
      props: { appState: stateWithData(), placeId: 'P1', onClose: vi.fn(), onNavigateToPerson },
    });

    expect(screen.getByText('Ochtrup')).toBeTruthy();
    await fireEvent.click(screen.getByText('Anna Bauer'));
    expect(onNavigateToPerson).toHaveBeenCalledWith('@I1@');
  });

  it('„→ Steckbrief" springt beim Ortsmarker in den Ort, beim Hofmarker in den Hof (zwei Register, ein Knopf)', async () => {
    const onNavigateToPlace = vi.fn();
    const onNavigateToHof = vi.fn();
    const appState = stateWithData();

    const { unmount } = render(MapExplorePanel, {
      props: { appState, placeId: 'P1', onClose: vi.fn(), onNavigateToPlace, onNavigateToHof },
    });
    await fireEvent.click(screen.getByText('→ Steckbrief'));
    expect(onNavigateToPlace).toHaveBeenCalledWith('P1');
    expect(onNavigateToHof).not.toHaveBeenCalled();
    unmount();

    render(MapExplorePanel, {
      props: { appState, placeId: 'H1', onClose: vi.fn(), onNavigateToPlace, onNavigateToHof },
    });
    expect(screen.getByText('Wall 33')).toBeTruthy();
    await fireEvent.click(screen.getByText('→ Steckbrief'));
    expect(onNavigateToHof).toHaveBeenCalledWith('H1');
  });

  it('Schließen-Knopf meldet nach oben', async () => {
    const onClose = vi.fn();
    render(MapExplorePanel, { props: { appState: stateWithData(), placeId: 'P1', onClose } });
    await fireEvent.click(screen.getByLabelText('Panel schließen'));
    expect(onClose).toHaveBeenCalled();
  });

  it('Ort ohne verknüpfte Personen zeigt einen Leerzustand statt einer leeren Fläche', () => {
    const db = makeDatabase();
    savePlaceObject(db.placeObjects, place('P9', { title: 'Leerdorf', lat: 52, long: 7 }));
    const appState = createAppState();
    appState.loadDatabase(db, 'test.ged');
    render(MapExplorePanel, { props: { appState, placeId: 'P9', onClose: vi.fn() } });
    expect(screen.getByText(/Keine Personen mit einem Ereignis/)).toBeTruthy();
  });
});
