// ui/views/settings/settings-model.ts — reine Aufbereitung der Einstellungen-Fläche
// (Spec 20 §1.14, ADR-v9-188). Kein DOM, keine Plattform-API — TST-5.
//
// Die Fläche beantwortet drei Fragen, und JEDES Element muss sagen können, zu welcher es
// gehört: was gilt geräteübergreifend, was nur hier, wie nehme ich es mit. Genau dafür
// gibt es `scope`.
import type { Database } from '../../../core/model/types';
import { classifyMediaFile } from '../../../core/model/media-kind';
import type { StoredValidationConfig } from '../../../core/validate/index';
import type { ExportPrefs } from '../../../services/app-data';

/** Reist die Einstellung mit (`app-data.json`) oder bleibt sie am Gerät (Kategorie A)? */
export type SettingScope = 'travels' | 'device';

export const SCOPE_LABEL: Record<SettingScope, string> = {
  travels: 'Gilt für alle Stammbäume · reist über app-data.json mit',
  device: 'Nur auf diesem Gerät · reist nicht mit',
};

/**
 * Alle Dateiwerte des Bestands, die überhaupt einen Ordner brauchen — Grundlage der
 * Zuordnungs-Bilanz. Weblinks und eingebettete Medien zählen bewusst NICHT mit: sie
 * sind unabhängig vom Ordner vollständig (ADR-v9-187).
 *
 * Am Realbestand sind das 189 der 642 Medien; ohne diese Filterung stünde in den
 * Einstellungen „453 von 642 fehlen", was den Ordner grundlos schlecht aussehen ließe.
 */
export function mediaFilePaths(db: Database): string[] {
  const out: string[] = [];
  for (const m of db.media.values()) {
    if (classifyMediaFile(m.file) === 'file') out.push(m.file);
  }
  return out;
}

/**
 * „N abweichend von der Voreinstellung" für die Prüfregeln — die Zahl der
 * Zusammenfassungszeile, die in die Prüf-Fläche springt (statt die Regeln hier ein
 * zweites Mal zu bedienen, INV-UI-2).
 */
export function valConfigDeviationCount(cfg: StoredValidationConfig | null): number {
  if (!cfg) return 0;
  return cfg.disabled.length + Object.keys(cfg.thresholds ?? {}).length;
}

/** Kurzfassung der Export-Vorwahl für dieselbe Art Zusammenfassungszeile. */
export function exportPrefsSummary(prefs: ExportPrefs | null): string {
  if (!prefs) return 'unverändert';
  const parts = [prefs.format];
  if (prefs.anonymize) parts.push('anonymisiert');
  return parts.join(' · ');
}

export interface MediaFolderSummary {
  connected: boolean;
  folderName: string;
  fileCount: number;
  /** Einzeln importierte Dateien (BL-259) — der zweite Zugangsweg. */
  importedCount: number;
  total: number;
  found: number;
  missing: number;
  byBasename: number;
}

/**
 * Der Satz, den die Ordner-Zeile zeigt. Bewusst EINE Funktion statt Template-Logik:
 * „N gefunden / N fehlen / N nur über den Dateinamen" ist die Aussage, wegen der es
 * diesen Abschnitt gibt, und sie gehört unit-getestet.
 */
export function mediaFolderStatusText(s: MediaFolderSummary): string {
  // Die Bilanz zählt, was TATSÄCHLICH auflösbar ist — egal über welchen der beiden Wege
  // (Ordner oder Import). Sie steht deshalb vorn, sobald einer davon etwas liefert.
  const quelle = s.connected
    ? `Ordner „${s.folderName}" (${s.fileCount} Dateien)`
    : s.importedCount > 0
      ? `${s.importedCount} importierte ${s.importedCount === 1 ? 'Datei' : 'Dateien'}`
      : '';

  if (!quelle) {
    return s.total === 0
      ? 'Noch keine Medien verbunden.'
      : `Nichts verbunden — ${s.total} Dateiverweise sind daher nicht auflösbar.`;
  }
  if (s.total === 0) return `${quelle} — der Bestand enthält keine Dateiverweise.`;

  const bits = [`${s.found} von ${s.total} Verweisen gefunden`];
  if (s.missing > 0) bits.push(`${s.missing} fehlen`);
  if (s.byBasename > 0) bits.push(`${s.byBasename} nur über den Dateinamen zugeordnet`);
  return `${quelle} — ${bits.join(', ')}.`;
}
