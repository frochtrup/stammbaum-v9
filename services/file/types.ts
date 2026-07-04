// services/file/types.ts — Adapter-Schnittstellen des Dateihandlings (Spec 14).
//
// Plattform-APIs (IndexedDB, File System Access API, navigator.share, <a download>)
// werden NICHT direkt vom FileService aufgerufen, sondern ausschließlich über diese
// Interfaces. Das ist der TST-Seam aus Spec 32 §5: die Tier-Auswahl-Logik (INV-FILE-3)
// wird mit gemockten Implementierungen dieser Interfaces headless getestet; nur die
// *echten* Implementierungen (services/file/*-adapter.ts) referenzieren window/indexedDB/etc.
//
// INV-ARCH-1 gilt hier NICHT (das ist services/, nicht core/) — Plattform-Referenzen
// sind in Adaptern ausdrücklich erlaubt und vorgesehen (Spec 02 §7).

/** Die eine Arbeitskopie (INV-FILE-1): aktueller Dateitext + Name + optionaler FS-Handle. */
export interface WorkingCopy {
  text: string;
  name: string;
  /** Undurchsichtiges Handle-Objekt (z. B. FileSystemFileHandle) — nur für Tier-1-Save relevant. */
  handle?: unknown;
}

/** Ergebnis von pickAndImport(): Bytes rein, universal (Spec 14 §2). */
export interface ImportResult {
  text: string;
  name: string;
  handle?: unknown;
}

export type SaveTier = 'fs-handle' | 'share' | 'download';

export interface SaveResult {
  tier: SaveTier;
  /** true, wenn tatsächlich geschrieben/angeboten wurde (kein Nutzerabbruch). */
  ok: boolean;
}

/**
 * Persistenz-Adapter für die Arbeitskopie (INV-FILE-1). Reale Implementierung nutzt
 * IndexedDB (services/file/idb-working-copy-store.ts); Tests mocken mit einer simplen
 * In-Memory-Variante — kein Bedarf an einer echten IndexedDB-Emulation, weil die zu
 * testende Logik (FileService-Orchestrierung) nicht von IDB-Interna abhängt.
 */
export interface WorkingCopyStore {
  load(): Promise<WorkingCopy | null>;
  save(copy: WorkingCopy): Promise<void>;
  clear(): Promise<void>;
}

/** Ergebnis eines Öffnen-Vorgangs über den Picker-Adapter. */
export interface PickedFile {
  text: string;
  name: string;
  handle?: unknown;
}

/** Datei-Öffnen (Import), universal über alle Plattformen (Spec 14 §2). */
export interface PickerAdapter {
  pick(): Promise<PickedFile | null>;
}

/**
 * Tier 1: stilles In-place-Speichern über ein zuvor erworbenes FS-Handle
 * (FileSystemFileHandle.createWritable() — Desktop Chrome/Edge, Android).
 * `isSupported()` prüft NUR Plattform-Fähigkeit, nicht ob gerade ein Handle vorliegt.
 */
export interface FsHandleAdapter {
  isSupported(): boolean;
  /** Schreibt bytes in das gegebene Handle. Wirft bei fehlender/verweigerter Permission. */
  write(handle: unknown, bytes: Uint8Array | string): Promise<void>;
  /** Erneut nach Schreibrecht fragen (Reload-Fall, Spec 14 §4). */
  requestPermission(handle: unknown): Promise<boolean>;
}

/** Tier 2a: natives Share-Sheet (iOS/Safari u. a.). */
export interface ShareAdapter {
  isSupported(): boolean;
  share(bytes: Uint8Array | string, filename: string, mimeType: string): Promise<boolean>;
}

/** Tier 2b: Fallback-Download via <a download> (Firefox, wenn Share fehlt). */
export interface DownloadAdapter {
  download(bytes: Uint8Array | string, filename: string, mimeType: string): void;
}

/** Bündel aller Plattform-Adapter, die der FileService injiziert bekommt. */
export interface FileServiceAdapters {
  workingCopyStore: WorkingCopyStore;
  picker: PickerAdapter;
  fsHandle: FsHandleAdapter;
  share: ShareAdapter;
  download: DownloadAdapter;
}
