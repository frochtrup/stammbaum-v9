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
  /**
   * Bei Tier 1b der Name, den der Nutzer im Dialog TATSÄCHLICH gewählt hat — er muss dem
   * Vorschlag nicht entsprechen („Speichern unter" ist genau der Fall, in dem er es nicht
   * tut). Ohne diese Rückmeldung führte die App danach den alten Namen weiter und der
   * nächste Save schriebe still in eine Datei, die anders heißt als angezeigt.
   */
  name?: string;
  /**
   * Was mit der Sicherung vor dem Überschreiben geschah (Spec 14 §4.1, INV-FILE-4).
   * Nur bei Tier 1a von Belang; alle anderen Tiers überschreiben nichts.
   *
   *   `geschrieben`        — der vorherige Dateiinhalt liegt als datierte Kopie im Ordner
   *   `kein-ordner`        — kein Ordner verbunden, obwohl die Plattform es könnte;
   *                          DANN WURDE NICHT ÜBERSCHRIEBEN (`ok:false`)
   *   `nicht-moeglich`     — die Plattform kann keinen Ordner freigeben (iOS/Safari);
   *                          gespeichert wurde, weil es hier keine Wahl zu treffen gibt
   *   `uebersprungen`      — der Nutzer hat „Ohne Sicherung speichern" gewählt
   *   `leer`               — die Datei war leer/nicht lesbar; es gab nichts zu sichern
   *   `fehlgeschlagen`     — die Sicherung schlug fehl; DANN WURDE NICHT ÜBERSCHRIEBEN
   */
  backup?: 'geschrieben' | 'kein-ordner' | 'nicht-moeglich' | 'uebersprungen' | 'leer' | 'fehlgeschlagen';
  /** Dateiname der geschriebenen Sicherung (nur bei `backup: 'geschrieben'`). */
  backupName?: string;
  /** Grund des Fehlschlags (nur bei `backup: 'fehlgeschlagen'`) — für die Meldung. */
  backupError?: string;
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
  /**
   * Liest den AKTUELLEN Inhalt der Datei von der Platte — die Vorlage der Sicherung
   * (Spec 14 §4.1). `null`, wenn das Handle nichts (mehr) liefert.
   *
   * Gesichert wird bewusst der Stand VON DER PLATTE, nicht der aus dem Modell erzeugte
   * oder die Arbeitskopie: nur er ist genau das, was das Überschreiben vernichtet. Ein
   * aus dem Modell serialisierter „alter" Stand wäre bereits die Projektion des neuen.
   */
  read(handle: unknown): Promise<Uint8Array | null>;
  /** Der Dateiname hinter einem Handle — nach Tier 1b der vom Nutzer gewählte. */
  nameOf(handle: unknown): string;
}

/**
 * Der Backup-Ordner (Spec 14 §4.1): ein eigens gewähltes Verzeichnis-Handle, in das die
 * datierte Sicherung geschrieben wird, bevor Tier 1a die Originaldatei überschreibt.
 *
 * Ein eigener Adapter und nicht `FsHandleAdapter` mit einer weiteren Methode, weil es um
 * ein VERZEICHNIS geht (`showDirectoryPicker`/`getFileHandle`), nicht um eine Datei — und
 * weil die File System Access API keinen Weg von einem Datei-Handle zu seinem Ordner
 * kennt. Ohne dieses zweite Handle könnte die App keine Datei neben der Originaldatei
 * anlegen, obwohl sie diese in der Hand hält.
 */
export interface BackupFolderAdapter {
  isSupported(): boolean;
  /** Ordner-Dialog (`mode: 'readwrite'`). `null` = Nutzerabbruch. */
  pick(): Promise<unknown | null>;
  requestPermission(handle: unknown): Promise<boolean>;
  /** Anzeigename des Ordners für die Einstellungen. */
  nameOf(handle: unknown): string;
  /** Legt `filename` im Ordner an (überschreibt eine gleichnamige Datei). */
  writeInto(handle: unknown, filename: string, bytes: Uint8Array | string): Promise<void>;
}

/** Persistenz des Backup-Ordner-Handles (eigener IDB-Store, Kategorie A). */
export interface BackupFolderHandleStore {
  load(): Promise<unknown | null>;
  save(handle: unknown): Promise<void>;
  clear(): Promise<void>;
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
  /**
   * Backup-Ordner (Spec 14 §4.1). PFLICHTFELDER, obwohl die Sicherung selbst optional
   * ist: ein Adaptersatz, dem man sie weglassen kann, ist ein Adaptersatz, in dem sie
   * irgendwann fehlt — und ihr Fehlen ist genau der Schaden, den sie verhindert. Ob
   * gesichert wird, entscheidet der VERBUNDENE ORDNER (Store leer = nicht verbunden),
   * nicht die An-/Abwesenheit eines Adapters (Zwang statt Erinnerung).
   */
  backupFolder: BackupFolderAdapter;
  backupFolderStore: BackupFolderHandleStore;
  /**
   * Zeitgeber für den Stempel der Sicherung — injizierbar, damit Tests einen festen Namen
   * erwarten können (TST-3). Kein Plattform-Adapter, deshalb optional mit Vorgabe.
   */
  now?: () => Date;
}
