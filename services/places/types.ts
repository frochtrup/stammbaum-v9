// services/places/types.ts — Adapter-Schnittstelle + Wire-Format von `orte.json`
// (Spec 14 §6, Spec 11 §2, Spec 30 §2.1/§4).
//
// Analog services/file/types.ts (ADR-v9-15): eine schmale injizierte Schnittstelle statt
// eines Plattform-Blocks, damit die Sync-/Konfliktlogik (places-sync-service.ts) headless
// mit einem simplen In-Memory-Fake testbar ist — KEINE `fake-indexeddb`-Testabhängigkeit.
//
// Scope dieser Slice (bewusst ausgeklammert, s. Modul-Kommentar in idb-places-store.ts):
// nur der Browser-Spiegel (IndexedDB). Der Sync-Ordner-Dateipfad (orte.json NEBEN der
// Genealogie-Datei, vom OS gesynct) ist eine spätere Erweiterung über denselben
// PlacesStore-Vertrag — kein Graph-API/OAuth nötig, analog wie FileService optionale
// Cloud-Adapter hinter derselben Schnittstelle vorsieht (Spec 14 §5).

import type { PlaceObject, HofObject } from '../../core/places/types';

/** Bekannte Schema-Version dieses Programms (Spec 11 §2, Spec 30 §4: Read-Only-Schreibstopp). */
export const PLACES_SCHEMA_VERSION = 1;

/**
 * Wire-Wrapper von `orte.json` (Spec 14 §6, Spec 30 §2.1). Maps sind als Arrays
 * serialisiert, weil JSON keine Maps kennt — Rückwandlung in Maps beim Laden.
 */
export interface PlacesFileWrapper {
  schemaVersion: number;
  rev: number;
  device: string;
  ts: number;
  placeObjects: PlaceObject[];
  hofObjects: HofObject[];
}

/**
 * Persistenz-Adapter für den orte.json-Browser-Spiegel. Reale Implementierung nutzt
 * IndexedDB (idb-places-store.ts); Tests mocken mit einer simplen In-Memory-Variante
 * (tests/services/mock-places-store.ts) — kein Bedarf an echter IndexedDB-Emulation,
 * weil die zu testende Logik (places-sync-service.ts: Konflikt-Erkennung, Union-Merge,
 * Schema-Gate) nicht von IDB-Interna abhängt.
 */
export interface PlacesStore {
  load(): Promise<PlacesFileWrapper | null>;
  save(wrapper: PlacesFileWrapper): Promise<void>;
}

/**
 * Geräte-ID-Quelle (injiziert für Determinismus in Tests, analog der injizierten Clock
 * aus Spec 32 §5). Reale Implementierung generiert einmalig + persistiert lokal
 * (device-id-adapter.ts); Tests injizieren eine feste ID.
 */
export interface DeviceIdProvider {
  deviceId(): string;
}

/** Injizierte Uhr (Spec 32 §5 TST-3: kein Wall-Clock-Zugriff außerhalb von Adaptern). */
export interface Clock {
  now(): number;
}

/**
 * Persistenz-Adapter für das FS-Access-Handle des orte.json-Datei-Ein-/Ausgangs
 * (ADR-v9-70, Spec 14 §6). GETRENNT vom `WorkingCopyStore` der Genealogie-Datei
 * (services/file/types.ts) — eigener Store, eigener Key, eigenes Handle, damit ein
 * Datei-Wechsel bei der einen Datei nie das Handle der anderen überschreibt. Reale
 * Implementierung: idb-places-file-handle-store.ts; Tests mocken mit einem simplen
 * In-Memory-Fake (analog createMockWorkingCopyStore).
 */
export interface PlacesFileHandleStore {
  /** Undurchsichtiges Handle-Objekt (z. B. FileSystemFileHandle) oder null, falls noch keins bekannt. */
  load(): Promise<unknown | null>;
  save(handle: unknown): Promise<void>;
  clear(): Promise<void>;
}
