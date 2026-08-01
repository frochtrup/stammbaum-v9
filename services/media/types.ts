// services/media/types.ts — Verträge der Medien-Ordner-Anbindung (Spec 14 §7,
// Spec 20 §1.14, ADR-v9-187/-188).
//
// WARUM ÜBERHAUPT EIN ORDNER: `Media.file` trägt im Regelfall einen RELATIVEN Pfad
// (`Pictures/anna.jpg`) — am Realbestand 228 Vorkommen, 189 verschiedene Dateien. Im
// Browser ist ein solcher Pfad ohne einen vom Nutzer freigegebenen Verzeichnis-Handle
// nicht auflösbar; ein Pfad-STRING gäbe keine Bytes. Deshalb „Ordner wählen", nicht
// „Pfad eintippen" (Spec 20 §1.14).
//
// WARUM KATEGORIE A: ein `FileSystemDirectoryHandle` ist nicht JSON-serialisierbar und
// auf einem zweiten Gerät bedeutungslos — er bleibt gerätelokal in IndexedDB (Spec 30
// §2.2), wie der Arbeitskopie- und der orte.json-Handle. Was mitreisen kann, ist die
// Zuordnungs-REGEL (B1-Abschnitt `media` in app-data.json), nicht der Zugang.

/** Speicher des Verzeichnis-Handles — in Tests durch eine Attrappe ersetzbar (TST-3). */
export interface MediaFolderHandleStore {
  /** Undurchsichtiges Handle-Objekt (FileSystemDirectoryHandle) oder null. */
  load(): Promise<unknown | null>;
  save(handle: unknown): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Die eine Plattform-Verzweigung der Medien-Auflösung: Ordner wählen, Leserecht prüfen,
 * Verzeichnisbaum aufzählen, eine Datei lesen. Alles darüber (Index, tolerante Zuordnung,
 * Cache) ist reine Logik und darum testbar ohne Browser.
 */
export interface MediaFolderAdapter {
  /** Kann diese Plattform überhaupt Ordner öffnen? (iOS/Safari: nein → Import-Weg.) */
  isSupported(): boolean;
  /** Ordner-Auswahl durch den Nutzer; null bei Abbruch. */
  pick(): Promise<unknown | null>;
  /** Leserecht für ein gespeichertes Handle prüfen/erneut anfragen (Reload-Fall). */
  requestPermission(handle: unknown): Promise<boolean>;
  /** Anzeigename des Ordners (`handle.name`) — der Wiederfindungs-Hinweis für B1. */
  nameOf(handle: unknown): string;
  /** Rekursive Aufzählung: relativer Pfad (mit `/`) → Datei-Eintrag. */
  listFiles(handle: unknown): Promise<MediaFolderEntry[]>;
  /** Bytes einer zuvor aufgezählten Datei. */
  readFile(entry: MediaFolderEntry): Promise<Blob>;
}

export interface MediaFolderEntry {
  /** Pfad relativ zum gewählten Ordner, immer mit `/` getrennt. */
  path: string;
  /** Basisname inkl. Endung. */
  name: string;
  /** Undurchsichtiges FileSystemFileHandle. */
  handle: unknown;
}

/** Eine vom Nutzer gewählte Mediendatei (BL-259). */
export interface PickedMedia {
  /** Relativer Pfad, wenn der Browser einen liefert — sonst der Basisname. */
  path: string;
  blob: Blob;
}

/** Mehrfachauswahl von Mediendateien — der Zugangsweg ohne Verzeichnis-Handle. */
export interface MediaFilePicker {
  pickMany(): Promise<PickedMedia[]>;
}

/** Wie ein Treffer zustande kam — die UI macht den unscharfen Fall sichtbar. */
export type MediaMatchKind =
  /** Pfad stimmt zeichengenau. */
  | 'exact'
  /** Pfad stimmt bis auf Groß-/Kleinschreibung bzw. Trennzeichen. */
  | 'normalized'
  /** Nur der Dateiname stimmt — der Ordner darunter weicht ab. */
  | 'basename';

export interface MediaMatch {
  entry: MediaFolderEntry;
  kind: MediaMatchKind;
}
