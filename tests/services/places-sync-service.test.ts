// tests/services/places-sync-service.test.ts — orte.json-Browser-Spiegel-Orchestrierung
// (Spec 14 §6, Spec 30 §2.1/§4 LP-9). Ruft NIE eine echte Plattform-API auf — der
// PlacesStore ist ein In-Memory-Fake (mock-places-store.ts, analog ADR-v9-15).
//
// `reconcileAndSave` bekommt seit BL-82 den gemeinsamen VORFAHREN statt nur dessen
// Revision (`SyncBase`) — der Tie-Break bei Kollisionen hängt daran, nicht mehr an
// Zeitstempeln. Die Tie-Break-Fälle selbst stehen in `places-sync-tiebreak.test.ts`;
// hier bleiben Laden, Revisions-/Device-Logik und Schema-Schutz. `basis(...)` ist der
// bequeme Weg, den Vorfahren zu benennen: in den meisten Fällen hier ist er leer, weil
// es um Fälle OHNE Kollision geht.

import { describe, expect, it } from 'vitest';
import { PlacesSyncService } from '../../services/places/places-sync-service';
import { PLACES_SCHEMA_VERSION } from '../../services/places/types';
import { place, hof } from '../core/places-fixtures';
import { createMockClock, createMockDeviceId, createMockPlacesStore } from './mock-places-store';

const placeMap = (...ps: ReturnType<typeof place>[]) => new Map(ps.map((p) => [p.id, p]));
const hofMap = (...hs: ReturnType<typeof hof>[]) => new Map(hs.map((h) => [h.id, h]));

/** Gemeinsamer Vorfahre für reconcileAndSave — Revision plus (meist leerer) Inhalt. */
const basis = (
  rev: number,
  placeObjects = placeMap(),
  hofObjects = hofMap(),
) => ({ rev, placeObjects, hofObjects });

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

    const result = await svc.reconcileAndSave(placeMap(place('P1')), hofMap(), basis(0));

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
      hofMap(), basis(2));

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

    const result = await svc.reconcileAndSave(placeMap(place('P_LOCAL_ONLY', { title: 'Nur lokal' })), hofMap(), basis(1));

    expect(result.warning).toEqual({
      kind: 'union-merge',
      mergedPlaceIds: [],
      mergedHofIds: [],
      conflictPlaceIds: [],
      conflictHofIds: []
    });
    expect(result.placeObjects.has('P_REMOTE_ONLY')).toBe(true);
    expect(result.placeObjects.has('P_LOCAL_ONLY')).toBe(true);
    expect(result.placeObjects.size).toBe(2);
  });

  // Die beiden vormaligen Fälle „neueres ts gewinnt" (in beide Richtungen) stehen nicht
  // mehr hier: sie hingen an einer Mock-Uhr, die 2000 lieferte, während der gespeicherte
  // Stand ts=5000 trug — ein Zustand, den eine echte Uhr nicht erzeugen kann, weil der
  // gespeicherte Wert aus einem früheren now() desselben Zeitstrahls stammt. Sie belegten
  // damit eine Symmetrie, die es in der Anwendung nie gab (BL-82). Die Auflösung von
  // Kollisionen entscheidet seither der gemeinsame Vorfahre; ihre Fälle stehen vollständig
  // in `places-sync-tiebreak.test.ts` — inklusive eines Wächters, der anschlägt, sobald
  // das Ergebnis wieder von der Uhr abhängt.

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

    const result = await svc.reconcileAndSave(placeMap(), hofMap(hof('H_LOCAL_ONLY', 'P1')), basis(1));

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

    const result = await svc.reconcileAndSave(placeMap(place('P1', { title: 'Ochtrup' })), hofMap(), basis(1));

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

    const result = await svc.reconcileAndSave(placeMap(place('P1', { title: 'Neu' })), hofMap(), basis(1));

    expect(result.warning).toBeNull();
    expect(result.placeObjects.get('P1')?.title).toBe('Neu');
  });

  it('remote bereits weitergerückt (baseRev < remote.rev) → ebenfalls Union-Merge, kein Last-Write-Wins', async () => {
    // baseRev(=1) weicht von remote.rev(=3) ab: der gespeicherte Stand hat sich bereits
    // verändert, seit die lokale Fassung geladen wurde. Auch das läuft über Union-Merge
    // (Härtung dieser Slice, s. Kommentar in places-sync-service.ts) statt lokale
    // Änderungen stillschweigend zu verwerfen (Last-Write-Wins, explizit verworfen).
    // Deshalb bleiben P1 UND P2 erhalten — nichts geht verloren. Welche P1-Fassung gewinnt,
    // entscheidet der Vorfahre: die lokale Seite ist gegenüber `basis` unverändert, hat also
    // nichts zu sagen (BL-82).
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

    const lokalUnveraendert = place('P1', { title: 'Lokal-alter-Stand' });
    const result = await svc.reconcileAndSave(
      placeMap(lokalUnveraendert),
      hofMap(),
      basis(1, placeMap(lokalUnveraendert))
    );

    expect(result.placeObjects.has('P2')).toBe(true); // nichts verloren.
    expect(result.placeObjects.get('P1')?.title).toBe('Remote-neuer-Stand'); // nur remote hat geändert.
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

    const result = await svc.reconcileAndSave(placeMap(place('P_NEW', { title: 'Lokal neu angelegt' })), hofMap(), basis(1));

    expect(result.saved).toBe(false);
    expect(result.warning).toEqual({ kind: 'schema-too-new', foundSchemaVersion: PLACES_SCHEMA_VERSION + 1 });
    // Nichts wurde geschrieben — der Store-Inhalt bleibt exakt der alte Wrapper.
    expect(store._peek()).toBe(remoteWrapper);
    // Rückgabe zeigt den (unveränderten) gespeicherten Stand, NICHT die verworfene lokale Fassung.
    expect(result.placeObjects.get('P1')?.title).toBe('Von neuerer App-Version');
    expect(result.placeObjects.has('P_NEW')).toBe(false);
  });
});
