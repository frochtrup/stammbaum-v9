// tests/ui/places-file-import.test.ts — orte.json Import (Bytes rein, ADR-v9-70,
// Spec 14 §6). Ruft NIE eine echte Plattform-API auf — Picker/HandleStore/PlacesStore
// sind In-Memory-Fakes (analog tests/services/*).
import { describe, expect, it, vi } from 'vitest';
import { importPlacesFile } from '../../ui/shell/places-file-import';
import { createPlacesPersister } from '../../ui/shell/places-persister';
import { PlacesSyncService } from '../../services/places';
import { PLACES_SCHEMA_VERSION } from '../../services/places/types';
import type { PickerAdapter, PickedFile } from '../../services/file/types';
import { createMockClock, createMockDeviceId, createMockPlacesFileHandleStore, createMockPlacesStore } from '../services/mock-places-store';
import { place, hof } from '../core/places-fixtures';

function mockPicker(result: PickedFile | null): PickerAdapter {
  return { pick: vi.fn(async () => result) };
}

describe('importPlacesFile — Bytes rein, INV-FILE-1-Analogie (ein Handle-Store, kein zweiter Cache)', () => {
  it('gibt imported=false zurück, wenn der Nutzer den Picker abbricht (kein Fehler, kein Merge)', async () => {
    const picker = mockPicker(null);
    const handleStore = createMockPlacesFileHandleStore(null);
    const store = createMockPlacesStore(null);
    const persister = createPlacesPersister(new PlacesSyncService(store, createMockDeviceId('dev-A'), createMockClock(1000)));

    const result = await importPlacesFile(picker, handleStore, persister);

    expect(result).toEqual({ imported: false });
    expect(handleStore.save).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it('parst den importierten Wrapper und gleicht ihn über den Persister gegen den lokalen IDB-Stand ab (Normalfall, kein Konflikt)', async () => {
    const importedWrapper = {
      schemaVersion: PLACES_SCHEMA_VERSION,
      rev: 99, // fremde rev — wird NICHT direkt übernommen, reconcileAndSave bumpt lokal weiter.
      device: 'anderes-geraet',
      ts: 50000,
      placeObjects: [place('P1', { title: 'Ochtrup' })],
      hofObjects: [hof('H1', 'P1')]
    };
    const picker = mockPicker({ text: JSON.stringify(importedWrapper), name: 'orte.json' });
    const handleStore = createMockPlacesFileHandleStore(null);
    const store = createMockPlacesStore(null); // lokal: noch nie etwas gespeichert.
    const persister = createPlacesPersister(new PlacesSyncService(store, createMockDeviceId('dev-LOCAL'), createMockClock(1000)));

    const result = await importPlacesFile(picker, handleStore, persister);

    expect(result.imported).toBe(true);
    expect(result.notice).toBe('');
    expect(result.placeObjects?.get('P1')?.title).toBe('Ochtrup');
    expect(result.hofObjects?.has('H1')).toBe(true);
    // Persister hat tatsächlich gegen den lokalen Store geschrieben (Persistenz-Rundlauf, TST-8).
    expect(store._peek()?.placeObjects.map((p) => p.id)).toEqual(['P1']);
    expect(store._peek()?.device).toBe('dev-LOCAL'); // lokal geschrieben, nicht die fremde device-id übernommen.
  });

  it('Union-Merge: reconcileAndSave greift unverändert, auch wenn das "lokale" Maps-Paar aus einem Datei-Import statt einem Edit stammt (ADR-v9-70/21)', async () => {
    // Der IDB-Spiegel wurde zuvor von einem ANDEREN Geräte-Prozess beschrieben (device
    // 'dev-REMOTE-PRIOR') — dieselbe rev wie die baseRev, auf der die App gerade aufsetzt
    // (nach persister.load()). Der Import selbst ist irrelevant für DIESE Fallunterscheidung
    // (reconcileAndSave kennt nur "lokale Maps" vs. "aktuell gespeicherter Stand" — ob die
    // lokalen Maps aus einem Edit oder einem Datei-Import stammen, macht keinen Unterschied,
    // exakt das Verhalten, das ADR-v9-70 fordert: "verhält sich wie ein Stand von einem
    // anderen Device").
    const localWrapper = {
      schemaVersion: PLACES_SCHEMA_VERSION,
      rev: 1,
      device: 'dev-REMOTE-PRIOR',
      ts: 1000,
      placeObjects: [place('P_LOCAL_ONLY', { title: 'Nur lokal' })],
      hofObjects: []
    };
    const store = createMockPlacesStore(localWrapper);
    const persister = createPlacesPersister(new PlacesSyncService(store, createMockDeviceId('dev-THIS-APP'), createMockClock(2000)));
    await persister.load(); // baseRev = 1, analog App-Start/vorherigem GEDCOM-Import.

    const importedWrapper = {
      schemaVersion: PLACES_SCHEMA_VERSION,
      rev: 1, // die rev im Wrapper selbst ist irrelevant für den Merge-Entscheid — nur baseRev zaehlt.
      device: 'irgendein-geraet-das-die-datei-mal-exportiert-hat',
      ts: 5000,
      placeObjects: [place('P_IMPORTED_ONLY', { title: 'Nur importiert' })],
      hofObjects: []
    };
    const picker = mockPicker({ text: JSON.stringify(importedWrapper), name: 'orte.json' });
    const handleStore = createMockPlacesFileHandleStore(null);

    const result = await importPlacesFile(picker, handleStore, persister);

    // Kein Datenverlust: beide Seiten bleiben erhalten (Union, s. ADR-v9-21).
    expect(result.placeObjects?.has('P_LOCAL_ONLY')).toBe(true);
    expect(result.placeObjects?.has('P_IMPORTED_ONLY')).toBe(true);
    expect(result.notice).toContain('anderen Gerät');
  });

  it('merkt ein mitgeliefertes FS-Handle im Handle-Store, damit künftige Exporte in-place gehen (ADR-v9-70)', async () => {
    const importedWrapper = {
      schemaVersion: PLACES_SCHEMA_VERSION,
      rev: 1,
      device: 'x',
      ts: 1000,
      placeObjects: [],
      hofObjects: []
    };
    const fakeHandle = { id: 'orte-json-handle' };
    const picker = mockPicker({ text: JSON.stringify(importedWrapper), name: 'orte.json', handle: fakeHandle });
    const handleStore = createMockPlacesFileHandleStore(null);
    const store = createMockPlacesStore(null);
    const persister = createPlacesPersister(new PlacesSyncService(store, createMockDeviceId('dev-A'), createMockClock(1000)));

    await importPlacesFile(picker, handleStore, persister);

    expect(handleStore._peek()).toEqual(fakeHandle);
  });

  it('lässt den Handle-Store unangetastet, wenn der Picker kein Handle liefert (z. B. <input type="file"> ohne FS-Access)', async () => {
    const importedWrapper = {
      schemaVersion: PLACES_SCHEMA_VERSION,
      rev: 1,
      device: 'x',
      ts: 1000,
      placeObjects: [],
      hofObjects: []
    };
    const picker = mockPicker({ text: JSON.stringify(importedWrapper), name: 'orte.json' }); // kein handle
    const handleStore = createMockPlacesFileHandleStore({ id: 'bereits-bekannt' });
    const store = createMockPlacesStore(null);
    const persister = createPlacesPersister(new PlacesSyncService(store, createMockDeviceId('dev-A'), createMockClock(1000)));

    await importPlacesFile(picker, handleStore, persister);

    expect(handleStore.save).not.toHaveBeenCalled();
    expect(handleStore._peek()).toEqual({ id: 'bereits-bekannt' });
  });

  it('wirft einen klaren Fehler bei kaputtem JSON, statt still zu importieren (kein Absturz, Aufrufer fängt/zeigt ihn)', async () => {
    const picker = mockPicker({ text: '{ kaputtes json', name: 'orte.json' });
    const handleStore = createMockPlacesFileHandleStore(null);
    const store = createMockPlacesStore(null);
    const persister = createPlacesPersister(new PlacesSyncService(store, createMockDeviceId('dev-A'), createMockClock(1000)));

    await expect(importPlacesFile(picker, handleStore, persister)).rejects.toThrow(/kein gültiges JSON/);
    // Nichts wurde geschrieben — der fehlerhafte Import hat keine Seiteneffekte.
    expect(store.save).not.toHaveBeenCalled();
    expect(handleStore.save).not.toHaveBeenCalled();
  });

  it('wirft einen klaren Fehler bei fremdem JSON-Format (z. B. eine andere App-Datei), statt still zu importieren', async () => {
    const picker = mockPicker({ text: JSON.stringify({ unrelated: true }), name: 'irgendwas.json' });
    const handleStore = createMockPlacesFileHandleStore(null);
    const store = createMockPlacesStore(null);
    const persister = createPlacesPersister(new PlacesSyncService(store, createMockDeviceId('dev-A'), createMockClock(1000)));

    await expect(importPlacesFile(picker, handleStore, persister)).rejects.toThrow(/unerwartetes Dateiformat/);
  });
});
