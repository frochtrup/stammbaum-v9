// @vitest-environment happy-dom
// tests/ui/PlacesFileButtons.component.test.ts — orte.json Export/Import-Buttons
// (ADR-v9-70, Spec 14 §6, Spec 20 §1.2 [K]). Nutzt gemockte Adapter/Stores — nie eine
// echte Plattform-API (analog SaveButton/ImportButton in App.component.test.ts).
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import PlacesFileButtons from '../../ui/shell/PlacesFileButtons.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createPlacesPersister } from '../../ui/shell/places-persister';
import { FileService } from '../../services/file/file-service';
import { PlacesSyncService } from '../../services/places';
import { PLACES_SCHEMA_VERSION } from '../../services/places/types';
import { createMockAdapterSet } from '../services/mock-adapters';
import {
  createMockClock,
  createMockDeviceId,
  createMockPlacesFileHandleStore,
  createMockPlacesStore,
} from '../services/mock-places-store';
import type { PickerAdapter, PickedFile } from '../../services/file/types';
import { place } from '../core/places-fixtures';

function mockPicker(result: PickedFile | null): PickerAdapter {
  return { pick: async () => result };
}

function setup(opts: {
  wrapper?: Parameters<typeof createMockPlacesStore>[0];
  handle?: unknown;
  pickResult?: PickedFile | null;
  fsHandleSupported?: boolean;
  shareSupported?: boolean;
} = {}) {
  const appState = createAppState();
  const { adapters, fsHandle, share, download } = createMockAdapterSet({
    fsHandleSupported: opts.fsHandleSupported ?? false,
    shareSupported: opts.shareSupported ?? false,
  });
  const fileService = new FileService(adapters);
  const placesStore = createMockPlacesStore(opts.wrapper ?? null);
  const handleStore = createMockPlacesFileHandleStore(opts.handle ?? null);
  const picker = mockPicker(opts.pickResult ?? null);
  const persister = createPlacesPersister(
    new PlacesSyncService(placesStore, createMockDeviceId('dev-A'), createMockClock(1000)),
  );

  render(PlacesFileButtons, {
    props: {
      appState,
      fileService,
      persister,
      placesFileIO: { placesStore, handleStore, picker },
    },
  });

  return { appState, placesStore, handleStore, fsHandle, share, download };
}

describe('PlacesFileButtons — Export', () => {
  it('zeigt "Orte exportieren" und "Orte importieren" als eigenständige Buttons', () => {
    setup();
    expect(screen.getByRole('button', { name: /Orte exportieren/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Orte importieren/ })).toBeTruthy();
  });

  it('Klick auf "Orte exportieren" ohne Handle fällt auf Download zurück und zeigt einen Hinweis', async () => {
    const { download } = setup({
      wrapper: {
        schemaVersion: PLACES_SCHEMA_VERSION,
        rev: 1,
        device: 'dev-A',
        ts: 1000,
        placeObjects: [place('P1')],
        hofObjects: [],
      },
    });

    await fireEvent.click(screen.getByRole('button', { name: /Orte exportieren/ }));

    await waitFor(() => {
      expect(download.downloadCalls).toEqual([{ filename: 'orte.json', mimeType: 'application/json' }]);
    });
    expect(await screen.findByText(/Download bereitgestellt/)).toBeTruthy();
  });

  it('Klick auf "Orte exportieren" MIT bekanntem Handle schreibt in-place (Tier 1)', async () => {
    const { fsHandle } = setup({
      wrapper: { schemaVersion: PLACES_SCHEMA_VERSION, rev: 1, device: 'dev-A', ts: 1000, placeObjects: [], hofObjects: [] },
      handle: { id: 'h1' },
      fsHandleSupported: true,
    });

    await fireEvent.click(screen.getByRole('button', { name: /Orte exportieren/ }));

    await waitFor(() => {
      expect(fsHandle.writeCalls).toHaveLength(1);
    });
    expect(await screen.findByText(/direkt in die Datei/)).toBeTruthy();
  });
});

describe('PlacesFileButtons — Import', () => {
  it('bricht ohne Fehler ab, wenn der Picker keine Datei liefert (Nutzerabbruch)', async () => {
    const { placesStore } = setup({ pickResult: null });

    await fireEvent.click(screen.getByRole('button', { name: /Orte importieren/ }));

    await waitFor(() => {
      expect(screen.getByText(/^Orte importieren$/)).toBeTruthy(); // zurück auf idle-Label, kein "Importiere …" mehr hängen
    });
    expect(screen.queryByText(/Import fehlgeschlagen/)).toBeNull();
    expect(placesStore.save).not.toHaveBeenCalled();
  });

  it('Klick auf "Orte importieren" übernimmt den importierten Stand in appState.db', async () => {
    const importedWrapper = {
      schemaVersion: PLACES_SCHEMA_VERSION,
      rev: 1,
      device: 'anderes-geraet',
      ts: 1000,
      placeObjects: [place('P_IMPORTIERT', { title: 'Importiert' })],
      hofObjects: [],
    };
    const { appState } = setup({ pickResult: { text: JSON.stringify(importedWrapper), name: 'orte.json', format: 'gedcom' } });

    await fireEvent.click(screen.getByRole('button', { name: /Orte importieren/ }));

    await waitFor(() => {
      expect(appState.db.placeObjects.get('P_IMPORTIERT')?.title).toBe('Importiert');
    });
    expect(await screen.findByText(/importiert/i)).toBeTruthy();
  });

  it('zeigt einen Fehlerhinweis bei kaputtem JSON, statt still zu importieren', async () => {
    setup({ pickResult: { text: '{ kaputt', name: 'orte.json', format: 'gedcom' } });

    await fireEvent.click(screen.getByRole('button', { name: /Orte importieren/ }));

    expect(await screen.findByText(/Import fehlgeschlagen/)).toBeTruthy();
  });
});
