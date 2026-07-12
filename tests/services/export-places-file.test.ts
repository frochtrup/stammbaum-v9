// tests/services/export-places-file.test.ts — orte.json Export (Bytes raus, ADR-v9-70,
// Spec 14 §6, Spec 32 §6 "INV-FILE-1/2/3 · Unit (Adapter gemockt)"). Ruft NIE eine echte
// Plattform-API auf — alle Adapter/Stores sind In-Memory-Fakes.

import { describe, expect, it, vi } from 'vitest';
import { FileService } from '../../services/file/file-service';
import { exportPlacesFile } from '../../services/places/export-places-file';
import { PLACES_SCHEMA_VERSION } from '../../services/places/types';
import { createMockAdapterSet } from './mock-adapters';
import { createMockPlacesStore, createMockPlacesFileHandleStore } from './mock-places-store';
import { place, hof } from '../core/places-fixtures';

describe('exportPlacesFile — INV-FILE-2/3: dasselbe Export-Rohr, Tier-Auswahl bleibt FileService-Sache', () => {
  it('Tier 1 (FS-Handle): schreibt den rohen Wrapper in-place, wenn ein Handle im handleStore gemerkt ist', async () => {
    const wrapper = {
      schemaVersion: PLACES_SCHEMA_VERSION,
      rev: 3,
      device: 'dev-A',
      ts: 5000,
      placeObjects: [place('P1', { title: 'Ochtrup' })],
      hofObjects: [hof('H1', 'P1')]
    };
    const placesStore = createMockPlacesStore(wrapper);
    const handleStore = createMockPlacesFileHandleStore({ id: 'known-handle' });
    const { adapters, fsHandle, share, download } = createMockAdapterSet({
      fsHandleSupported: true,
      shareSupported: true // Tier 2 wäre auch da — Tier 1 hat Vorrang (INV-FILE-3).
    });
    const fileService = new FileService(adapters);

    const result = await exportPlacesFile(fileService, placesStore, handleStore);

    expect(result).toEqual({ tier: 'fs-handle', ok: true });
    expect(fsHandle.writeCalls).toHaveLength(1);
    expect(fsHandle.writeCalls[0].handle).toEqual({ id: 'known-handle' });
    // Der geschriebene Text ist exakt der ROHE Wrapper (schemaVersion/rev/device/ts
    // bleiben unverändert — Export selbst bumpt keine rev, er liest nur).
    expect(JSON.parse(fsHandle.writeCalls[0].bytes as string)).toEqual(wrapper);
    expect(share.share).not.toHaveBeenCalled();
    expect(download.download).not.toHaveBeenCalled();
  });

  it('fällt auf Tier 2 (share/download) zurück, wenn kein Handle bekannt ist', async () => {
    const wrapper = {
      schemaVersion: PLACES_SCHEMA_VERSION,
      rev: 1,
      device: 'dev-A',
      ts: 1000,
      placeObjects: [place('P1')],
      hofObjects: []
    };
    const placesStore = createMockPlacesStore(wrapper);
    const handleStore = createMockPlacesFileHandleStore(null);
    const { adapters, fsHandle, download } = createMockAdapterSet({
      fsHandleSupported: true, // Plattform könnte, aber ohne handle nicht anwendbar
      shareSupported: false
    });
    const fileService = new FileService(adapters);

    const result = await exportPlacesFile(fileService, placesStore, handleStore);

    expect(result).toEqual({ tier: 'download', ok: true });
    expect(fsHandle.write).not.toHaveBeenCalled();
    expect(download.downloadCalls).toEqual([{ filename: 'orte.json', mimeType: 'application/json' }]);
  });

  it('exportiert einen leeren Wrapper, wenn noch nie gespeichert wurde (frischer Start, kein Crash)', async () => {
    const placesStore = createMockPlacesStore(null);
    const handleStore = createMockPlacesFileHandleStore(null);
    const { adapters, download } = createMockAdapterSet({ fsHandleSupported: false, shareSupported: false });
    const fileService = new FileService(adapters);

    const result = await exportPlacesFile(fileService, placesStore, handleStore);

    expect(result.ok).toBe(true);
    expect(download.downloadCalls).toEqual([{ filename: 'orte.json', mimeType: 'application/json' }]);
    const writtenText = vi.mocked(download.download).mock.calls[0][0] as string;
    expect(JSON.parse(writtenText)).toEqual({
      schemaVersion: PLACES_SCHEMA_VERSION,
      rev: 0,
      device: '',
      ts: 0,
      placeObjects: [],
      hofObjects: []
    });
  });

  it('liest den ROHEN Wrapper über placesStore.load() — schemaVersion/rev/device/ts bleiben erhalten (kein Map-Umweg)', async () => {
    const wrapper = {
      schemaVersion: PLACES_SCHEMA_VERSION,
      rev: 7,
      device: 'dev-XYZ',
      ts: 99999,
      placeObjects: [],
      hofObjects: []
    };
    const placesStore = createMockPlacesStore(wrapper);
    const handleStore = createMockPlacesFileHandleStore(null);
    const { adapters, download } = createMockAdapterSet({ fsHandleSupported: false, shareSupported: false });
    const fileService = new FileService(adapters);

    await exportPlacesFile(fileService, placesStore, handleStore);

    const writtenText = vi.mocked(download.download).mock.calls[0][0] as string;
    expect(JSON.parse(writtenText)).toEqual(wrapper);
  });

  it('persistiert das Handle erneut nach erfolgreichem Tier-1-Export (No-op-Schreibsicherung, ADR-v9-70)', async () => {
    const wrapper = {
      schemaVersion: PLACES_SCHEMA_VERSION,
      rev: 1,
      device: 'dev-A',
      ts: 1000,
      placeObjects: [],
      hofObjects: []
    };
    const placesStore = createMockPlacesStore(wrapper);
    const handleStore = createMockPlacesFileHandleStore({ id: 'h1' });
    const { adapters } = createMockAdapterSet({ fsHandleSupported: true });
    const fileService = new FileService(adapters);

    await exportPlacesFile(fileService, placesStore, handleStore);

    expect(handleStore._peek()).toEqual({ id: 'h1' });
    expect(handleStore.save).toHaveBeenCalledWith({ id: 'h1' });
  });
});
