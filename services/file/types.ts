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

import type { DocFormat } from './doc-format';

/** Die eine Arbeitskopie (INV-FILE-1): aktueller Dateitext + Name + optionaler FS-Handle. */
export interface WorkingCopy {
  /** Kanonischer Text: GEDCOM roh, GRAMPS als ENTPACKTES XML (gzip nur beim Datei-Export). */
  text: string;
  name: string;
  /** Format der Arbeitskopie — steuert Auto-Load-Pfad + Auto-Save-Serializer (BL-139). */
  format?: DocFormat;
  /** Undurchsichtiges Handle-Objekt (z. B. FileSystemFileHandle) — nur für Tier-1-Save relevant. */
  handle?: unknown;
}

/** Ergebnis von pickAndImport(): Bytes rein, universal (Spec 14 §2). */
export interface ImportResult {
  text: string;
  name: string;
  format: DocFormat;
  handle?: unknown;
}

export type SaveTier = 'fs-handle' | 'fs-picker' | 'share' | 'download';

export interface SaveResult {
  tier: SaveTier;
  /** true, wenn tatsächlich geschrieben/angeboten wurde (kein Nutzerabbruch). */
  ok: boolean;
  /**
   * Bei Tier 1b („Speichern unter") das NEU erworbene FS-Handle. Der FileService merkt es
   * sich NICHT selbst: dasselbe Export-Rohr bedient Genealogie-Datei, `orte.json` und den
   * App-Daten-Export, die je einen EIGENEN Handle-Speicher haben (Spec 14 §6) — welcher
   * davon gemeint ist, weiß nur der Aufrufer. Er reicht es an `rememberHandle()` bzw.
   * seinen eigenen Store weiter, damit der nächste Save still über Tier 1a läuft.
   */
  handle?: unknown;
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
  /** Entpackter Text (GRAMPS gunzip-XML / GEDCOM roh). */
  text: string;
  name: string;
  format: DocFormat;
  handle?: unknown;
}

/** Datei-Öffnen (Import), universal über alle Plattformen (Spec 14 §2). */
export interface PickerAdapter {
  pick(): Promise<PickedFile | null>;
}

/**
 * Tier 1a/1b: File System Access API (Desktop Chrome/Edge).
 *   1a — stilles In-place-Speichern über ein zuvor erworbenes Handle (`createWritable()`).
 *   1b — „Speichern unter"-Dialog, wenn (noch) kein Handle vorliegt.
 * `isSupported()` prüft NUR Plattform-Fähigkeit, nicht ob gerade ein Handle vorliegt.
 */
export interface FsHandleAdapter {
  isSupported(): boolean;
  /** Schreibt bytes in das gegebene Handle. Wirft bei fehlender/verweigerter Permission. */
  write(handle: unknown, bytes: Uint8Array | string): Promise<void>;
  /** Erneut nach Schreibrecht fragen (Reload-Fall, Spec 14 §4). */
  requestPermission(handle: unknown): Promise<boolean>;
  /**
   * Tier 1b: Kann die Plattform einen „Speichern unter"-Dialog zeigen? Getrennt von
   * `isSupported()`, weil das Öffnen (`showOpenFilePicker`) und das Speichern
   * (`showSaveFilePicker`) zwei Fähigkeiten sind — die Trennung erlaubt es, den
   * Nutzerabbruch (`null`) vom „kann die Plattform gar nicht" zu unterscheiden, ohne
   * dass `pickSaveTarget` einen dritten Rückgabewert bräuchte.
   */
  canPickSaveTarget(): boolean;
  /** Öffnet den „Speichern unter"-Dialog. `null` = Nutzerabbruch (KEIN Ausweich-Tier). */
  pickSaveTarget(filename: string, mimeType: string): Promise<unknown | null>;
}

/**
 * Tier 2a: natives Share-Sheet. `isSupported()` beantwortet bewusst „ist das Share-Sheet
 * auf DIESER Plattform ein tauglicher Speicherweg", NICHT „existiert `navigator.share`" —
 * auf macOS existiert die API, aber das Sheet bietet kein „In Dateien sichern"
 * (Spec 14 §4, ADR-v9-194).
 */
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
