// tests/services/places-sync-service.test.ts — orte.json-Browser-Spiegel-Orchestrierung
// (Spec 14 §6, Spec 30 §2.1/§4 LP-9). Ruft NIE eine echte Plattform-API auf — der
// PlacesStore ist ein In-Memory-Fake (mock-places-store.ts, analog ADR-v9-15).

import { describe, expect, it } from 'vitest';
import { PlacesSyncService } from '../../services/places/places-sync-service';
import { PLACES_SCHEMA_VERSION } from '../../services/places/types';
import { place, hof } from '../core/places-fixtures';
import { createMockClock, createMockDeviceId, createMockPlacesStore } from './mock-places-store';

const placeMap = (...ps: ReturnType<typeof place>[]) => new Map(ps.map((p) => [p.id, p]));
const hofMap = (...hs: ReturnType<typeof hof>[]) => new Map(hs.map((h) => [h.id, h]));

describe('loadPlaces', () => {
  it('liefert leere Maps + isEmpty=true, wenn noch nie gespeichert wurde', async () => {
    const store = createMockPlacesStore(null);
    const svc = new PlacesSyncService(store, createMockDeviceId('dev-A'), createMockClock(1000));

    const loaded = await svc.loadPlaces();

    expect(loaded.isEmpty).toBe(true);
    expect(loaded.placeObjects.size).toBe(0);
    expect(loaded.hofObjects.size).toBe(0);
    expect(loaded.rev).toBe(0);
  });

  it('entpackt Arrays (Wire-Form) zurück in id-gekeyte Maps', async () => {
    const wrapper = {
      schemaVersion: PLACES_SCHEMA_VERSION,
      rev: 3,
      device: 'dev-A',
      ts: 5000,
      placeObjects: [place('P1', { title: 'Ochtrup' })],
      hofObjects: [hof('H1', 'P1', { addrs: [{ value: 'Wall 33', from: null, to: null }] })]
    };
    const store = createMockPlacesStore(wrapper);
    const svc = new PlacesSyncService(store, createMockDeviceId('dev-A'), createMockClock(1000));

    const loaded = await svc.loadPlaces();

    expect(loaded.isEmpty).toBe(false);
    expect(loaded.rev).toBe(3);
    expect(loaded.ts).toBe(5000);
    expect(loaded.placeObjects.get('P1')?.title).toBe('Ochtrup');
    expect(loaded.hofObjects.get('H1')?.villageId).toBe('P1');
  });
});

describe('reconcileAndSave — kein Konflikt (Normalfall)', () => {
  it('schreibt anstandslos, wenn noch nichts gespeichert war (baseRev=0), und bumpt rev', async () => {
    const store = createMockPlacesStore(null);
    const svc = new PlacesSyncService(store, createMockDeviceId('dev-A'), createMockClock(1000));

    const result = await svc.reconcileAndSave(placeMap(place('P1')), hofMap(), 0);

    expect(result.saved).toBe(true);
    expect(result.warning).toBeNull();
    expect(result.placeObjects.get('P1')).toBeDefined();
    expect(store._peek()).toMatchObject({ rev: 1, device: 'dev-A' });
  });

  it('gleiches Device, gleiche baseRev, kein Inhaltsunterschied → normales Schreiben ohne Warnung', async () => {
    const remoteWrapper = {
      schemaVersion: PLACES_SCHEMA_VERSION,
      rev: 2,
      device: 'dev-A',
      ts: 1000,
      placeObjects: [place('P1', { title: 'Ochtrup' })],
      hofObjects: []
    };
    const store = createMockPlacesStore(remoteWrapper);
    const svc = new PlacesSyncService(store, createMockDeviceId('dev-A'), createMockClock(2000));

    const result = await svc.reconcileAndSave(
      placeMap(place('P1', { title: 'Ochtrup' }), place('P2', { title: 'Wall' })),
      hofMap(),
      2
    );

    expect(result.saved).toBe(true);
    expect(result.warning).toBeNull();
    expect(result.placeObjects.size).toBe(2);
    expect(store._peek()?.rev).toBe(3);
  });
});

describe('reconcileAndSave — Union-Merge (LP-9): gleiche rev + anderes Device + abweichender Inhalt', () => {
  it('behält IDs, die nur lokal existieren, UND IDs, die nur remote existieren (kein Datenverlust)', async () => {
    const remoteWrapper = {
      schemaVersion: PLACES_SCHEMA_VERSION,
      rev: 1,
      device: 'dev-REMOTE',
      ts: 1000,
      placeObjects: [place('P_REMOTE_ONLY', { title: 'Nur remote' })],
      hofObjects: []
    };
    const store = createMockPlacesStore(remoteWrapper);
    const svc = new PlacesSyncService(store, createMockDeviceId('dev-LOCAL'), createMockClock(2000));

    const result = await svc.reconcileAndSave(placeMap(place('P_LOCAL_ONLY', { title: 'Nur lokal' })), hofMap(), 1);

    expect(result.warning).toEqual({ kind: 'union-merge', mergedPlaceIds: [], mergedHofIds: [] });
    expect(result.placeObjects.has('P_REMOTE_ONLY')).toBe(true);
    expect(result.placeObjects.has('P_LOCAL_ONLY')).toBe(true);
    expect(result.placeObjects.size).toBe(2);
  });

  it('bei gleicher ID mit abweichendem Inhalt gewinnt die Seite mit dem neueren ts', async () => {
    const remoteWrapper = {
      schemaVersion: PLACES_SCHEMA_VERSION,
      rev: 1,
      device: 'dev-REMOTE',
      ts: 5000, // remote ist NEUER als local (2000) → remote gewinnt trotz "lokaler" Fassung.
      placeObjects: [place('P1', { title: 'Remote-Titel (neuer)' })],
      hofObjects: []
    };
    const store = createMockPlacesStore(remoteWrapper);
    const svc = new PlacesSyncService(store, createMockDeviceId('dev-LOCAL'), createMockClock(2000));

    const result = await svc.reconcileAndSave(placeMap(place('P1', { title: 'Lokaler-Titel (älter)' })), hofMap(), 1);

    expect(result.warning).toEqual({ kind: 'union-merge', mergedPlaceIds: ['P1'], mergedHofIds: [] });
    expect(result.placeObjects.get('P1')?.title).toBe('Remote-Titel (neuer)');
  });

  it('bei gleicher ID mit abweichendem Inhalt gewinnt die lokale Seite, wenn sie neuer ist', async () => {
    const remoteWrapper = {
      schemaVersion: PLACES_SCHEMA_VERSION,
      rev: 1,
      device: 'dev-REMOTE',
      ts: 1000, // remote ist ÄLTER als local (9000) → lokal gewinnt.
      placeObjects: [place('P1', { title: 'Remote-Titel (älter)' })],
      hofObjects: []
    };
    const store = createMockPlacesStore(remoteWrapper);
    const svc = new PlacesSyncService(store, createMockDeviceId('dev-LOCAL'), createMockClock(9000));

    const result = await svc.reconcileAndSave(placeMap(place('P1', { title: 'Lokaler-Titel (neuer)' })), hofMap(), 1);

    expect(result.warning).toEqual({ kind: 'union-merge', mergedPlaceIds: ['P1'], mergedHofIds: [] });
    expect(result.placeObjects.get('P1')?.title).toBe('Lokaler-Titel (neuer)');
  });

  it('merged auch hofObjects nach derselben Politik, unabhängig von placeObjects', async () => {
    const remoteWrapper = {
      schemaVersion: PLACES_SCHEMA_VERSION,
      rev: 1,
      device: 'dev-REMOTE',
      ts: 1000,
      placeObjects: [],
      hofObjects: [hof('H_REMOTE_ONLY', 'P1')]
    };
    const store = createMockPlacesStore(remoteWrapper);
    const svc = new PlacesSyncService(store, createMockDeviceId('dev-LOCAL'), createMockClock(2000));

    const result = await svc.reconcileAndSave(placeMap(), hofMap(hof('H_LOCAL_ONLY', 'P1')), 1);

    expect(result.hofObjects.has('H_REMOTE_ONLY')).toBe(true);
    expect(result.hofObjects.has('H_LOCAL_ONLY')).toBe(true);
    expect(result.warning?.kind).toBe('union-merge');
  });

  it('gleiche rev + ANDERES Device, aber IDENTISCHER Inhalt → kein Konflikt, keine Warnung', async () => {
    const sharedPlace = place('P1', { title: 'Ochtrup' });
    const remoteWrapper = {
      schemaVersion: PLACES_SCHEMA_VERSION,
      rev: 1,
      device: 'dev-REMOTE',
      ts: 1000,
      placeObjects: [sharedPlace],
      hofObjects: []
    };
    const store = createMockPlacesStore(remoteWrapper);
    const svc = new PlacesSyncService(store, createMockDeviceId('dev-LOCAL'), createMockClock(2000));

    const result = await svc.reconcileAndSave(placeMap(place('P1', { title: 'Ochtrup' })), hofMap(), 1);

    expect(result.warning).toBeNull();
    expect(result.saved).toBe(true);
  });

  it('gleiches Device (kein Fremdgerät), abweichender Inhalt → KEIN Union-Merge (Normalfall, eigenes Update)', async () => {
    const remoteWrapper = {
      schemaVersion: PLACES_SCHEMA_VERSION,
      rev: 1,
      device: 'dev-A',
      ts: 1000,
      placeObjects: [place('P1', { title: 'Alt' })],
      hofObjects: []
    };
    const store = createMockPlacesStore(remoteWrapper);
    const svc = new PlacesSyncService(store, createMockDeviceId('dev-A'), createMockClock(2000));

    const result = await svc.reconcileAndSave(placeMap(place('P1', { title: 'Neu' })), hofMap(), 1);

    expect(result.warning).toBeNull();
    expect(result.placeObjects.get('P1')?.title).toBe('Neu');
  });

  it('remote bereits weitergerückt (baseRev < remote.rev) → ebenfalls Union-Merge, kein Last-Write-Wins', async () => {
    // baseRev(=1) weicht von remote.rev(=3) ab: der gespeicherte Stand hat sich bereits
    // verändert, seit die lokale Fassung geladen wurde. Auch das läuft über Union-Merge
    // (Härtung dieser Slice, s. Kommentar in places-sync-service.ts) statt lokale
    // Änderungen stillschweigend zu verwerfen (Last-Write-Wins, explizit verworfen).
    // Deshalb bleiben P1(lokal) UND P2(remote) sowie P1(remote, gewinnt bei ts-Vorrang)
    // erhalten — nichts geht verloren.
    const remoteWrapper = {
      schemaVersion: PLACES_SCHEMA_VERSION,
      rev: 3,
      device: 'dev-REMOTE',
      ts: 9000,
      placeObjects: [place('P1', { title: 'Remote-neuer-Stand' }), place('P2', { title: 'Nur remote' })],
      hofObjects: []
    };
    const store = createMockPlacesStore(remoteWrapper);
    const svc = new PlacesSyncService(store, createMockDeviceId('dev-LOCAL'), createMockClock(1000));

    const result = await svc.reconcileAndSave(placeMap(place('P1', { title: 'Lokal-alter-Stand' })), hofMap(), 1);

    expect(result.placeObjects.has('P2')).toBe(true); // nichts verloren.
    expect(result.placeObjects.get('P1')?.title).toBe('Remote-neuer-Stand'); // remote neuer.
    expect(result.saved).toBe(true);
  });
});

describe('reconcileAndSave — höhere Schema-Version als bekannt (Spec 30 §4)', () => {
  it('verweigert das Schreiben (Read-Only-Schreibstopp) und gibt eine Warnung zurück', async () => {
    const remoteWrapper = {
      schemaVersion: PLACES_SCHEMA_VERSION + 1,
      rev: 1,
      device: 'dev-FUTURE',
      ts: 1000,
      placeObjects: [place('P1', { title: 'Von neuerer App-Version' })],
      hofObjects: []
    };
    const store = createMockPlacesStore(remoteWrapper);
    const svc = new PlacesSyncService(store, createMockDeviceId('dev-LOCAL'), createMockClock(2000));

    const result = await svc.reconcileAndSave(placeMap(place('P_NEW', { title: 'Lokal neu angelegt' })), hofMap(), 1);

    expect(result.saved).toBe(false);
    expect(result.warning).toEqual({ kind: 'schema-too-new', foundSchemaVersion: PLACES_SCHEMA_VERSION + 1 });
    // Nichts wurde geschrieben — der Store-Inhalt bleibt exakt der alte Wrapper.
    expect(store._peek()).toBe(remoteWrapper);
    // Rückgabe zeigt den (unveränderten) gespeicherten Stand, NICHT die verworfene lokale Fassung.
    expect(result.placeObjects.get('P1')?.title).toBe('Von neuerer App-Version');
    expect(result.placeObjects.has('P_NEW')).toBe(false);
  });
});
