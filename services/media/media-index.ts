// services/media/media-index.ts — die Zuordnung Pfad → Datei, als REINE Logik
// (Spec 14 §7, ADR-v9-187 Punkt 5). Kein Plattform-API: der Adapter liefert die Liste,
// hier wird nur gesucht — damit ist der schwierige Teil ohne Browser testbar (TST-3).
//
// WARUM UNSCHARF: der Realbestand ist nicht sauber. Er trägt `Pictures/FranzDecker.BMP`
// neben `Pictures/FranzDecker1.bmp` (Endung mal groß, mal klein), einen Backslash-Pfad,
// einen absoluten Pfad (`/Documents/…`) und zwei Dateinamen ganz ohne Ordner. Eine
// zeichengenaue Suche fände einen Teil davon nie.
//
// WARUM DIE UNSCHÄRFE SICHTBAR BLEIBT: ein Rückfall auf den bloßen Dateinamen kann das
// FALSCHE Bild finden (zwei `portrait.jpg` in verschiedenen Ordnern). Deshalb liefert
// jeder Treffer MIT, wie er zustande kam; die UI zeigt das an, statt es zu verschlucken.
import type { MediaFolderEntry, MediaMatch } from './types';

/** `\` → `/`, führende `./` und `/` weg, Kleinschreibung — die Vergleichsform. */
export function normalizePath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .toLowerCase();
}

export function basenameOf(path: string): string {
  const parts = path.trim().replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] ?? '';
}

export interface MediaIndex {
  /** Anzahl der aufgezählten Dateien — für die Status-Anzeige der Einstellungen. */
  size: number;
  find(file: string): MediaMatch | null;
}

/**
 * Baut den Suchindex EINMAL aus der Verzeichnis-Aufzählung. Drei Stufen, in dieser
 * Reihenfolge: zeichengenau → normalisiert → Dateiname.
 *
 * Ein Dateiname, der im Ordner MEHRFACH vorkommt, taugt nicht als Rückfall — dann wäre
 * die Zuordnung geraten, nicht gefunden. Solche Namen fallen bewusst aus der Basisnamen-
 * Stufe heraus (die Datei gilt dann als nicht auffindbar, was ehrlicher ist als ein
 * zufälliger Treffer).
 */
export function buildMediaIndex(entries: readonly MediaFolderEntry[]): MediaIndex {
  const byExact = new Map<string, MediaFolderEntry>();
  const byNormalized = new Map<string, MediaFolderEntry>();
  const byBasename = new Map<string, MediaFolderEntry>();
  const ambiguousBasenames = new Set<string>();

  for (const e of entries) {
    if (!byExact.has(e.path)) byExact.set(e.path, e);

    const norm = normalizePath(e.path);
    if (!byNormalized.has(norm)) byNormalized.set(norm, e);

    const base = e.name.toLowerCase();
    if (byBasename.has(base)) ambiguousBasenames.add(base);
    else byBasename.set(base, e);
  }

  return {
    size: entries.length,
    find(file: string): MediaMatch | null {
      const raw = file.trim();
      if (!raw) return null;

      const exact = byExact.get(raw);
      if (exact) return { entry: exact, kind: 'exact' };

      const norm = normalizePath(raw);
      const normalized = byNormalized.get(norm);
      if (normalized) return { entry: normalized, kind: 'normalized' };

      // Absolute Pfade und fremde Ordnertiefen: von hinten her die längste passende
      // Endstrecke suchen (`/Users/x/Genealogie/Pictures/a.jpg` findet `Pictures/a.jpg`).
      const segs = norm.split('/');
      for (let i = 1; i < segs.length; i++) {
        const tail = segs.slice(i).join('/');
        const hit = byNormalized.get(tail);
        if (hit) return { entry: hit, kind: 'normalized' };
      }

      const base = basenameOf(raw).toLowerCase();
      if (!base || ambiguousBasenames.has(base)) return null;
      const byName = byBasename.get(base);
      return byName ? { entry: byName, kind: 'basename' } : null;
    },
  };
}
