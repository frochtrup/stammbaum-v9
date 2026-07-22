// ui/shell/save-action.ts — DER EINE Speichern-Vorgang der Schale (Spec 20 §1.2,
// Spec 14 §3.2 INV-FILE-2).
//
// Herausgelöst aus SaveButton.svelte, als BL-93 das Kürzel `Cmd/Ctrl+S` bekam
// (Spec 21 §3 "Tastatur-first überall"). Ein zweiter Aufrufer heißt sonst zwangsläufig
// zweite Implementierung — und genau dieses Muster ist im Projekt schon zweimal real
// auseinandergelaufen (ADR-v9-80, ADR-v9-100). Knopf und Kürzel rufen jetzt dieselbe
// Funktion; wer den Tier-Fallback oder den Dateinamen ändert, ändert ihn für beide.
//
// Bewusst framework-frei (kein Rune-State): der Aufrufer hält seinen eigenen
// "speichert gerade"-Zustand, diese Funktion tut nur die Arbeit und meldet das Ergebnis.
import { exportViaOnePipe, exportFileName } from '../../services/file';
import type { ExportFormat, FileService } from '../../services/file';
import type { AppState } from './app-state.svelte';

/** Dateiname ohne Endung — Basis für den Export-Namen. */
export function baseNameOf(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, '');
}

/**
 * Die GEDCOM-Formate, die die Oberfläche anbietet. GRAMPS fehlt bewusst: die App hält
 * nie ein `grampsDoc`, und der Cross-Export aus dem Modell liefert eine Datei ohne
 * Ereignisse, Orte, Zitate und Daten (BL-139/ADR-v9-113).
 */
export type UiExportFormat = Exclude<ExportFormat, 'gramps'>;

export interface ExportRequestUi {
  format: UiExportFormat;
  /** Gesetzt = anonymisierter Export; der Wert ist das Bezugsjahr (injiziert, TST-3). */
  anonymizeReferenceYear?: number;
  /** FS-Handle der Originaldatei; wird bei Anon/Strict/GED7 vom Rohr ignoriert. */
  handle?: unknown;
}

/**
 * DER EINE Export-Vorgang der Schale: Speichern-Knopf, ⌘S und die Export-Fläche laufen
 * hier durch. Liefert den anzuzeigenden Hinweis zurück (nie einen Wurf — der Aufrufer
 * soll eine Meldung zeigen, nicht abstürzen).
 */
export async function exportGedcom(
  appState: AppState,
  fileService: FileService,
  req: ExportRequestUi,
): Promise<string> {
  const baseName = baseNameOf(appState.fileName);
  const anonymize = req.anonymizeReferenceYear != null;
  // In-place ist nur der unveränderte 5.5.1-Pfad; alles andere bekommt einen neuen
  // Dateinamen, den die Meldung nennt — sonst sucht der Nutzer eine Datei, die anders heißt.
  const inPlaceCapable = req.format === 'gedcom-5.5.1' && !anonymize;
  const filename = exportFileName(baseName, req.format, anonymize);
  try {
    const result = await exportViaOnePipe(fileService, {
      format: req.format,
      baseName,
      gedcomDoc: appState.buildGedcomDoc(),
      handle: req.handle,
      anonymizeReferenceYear: req.anonymizeReferenceYear,
    });
    if (!result.ok) return 'Speichern abgebrochen.';
    if (result.tier === 'fs-handle') return 'Gespeichert (direkt in die Datei).';
    const wohin = result.tier === 'share' ? 'Zum Sichern angeboten (Share-Sheet).' : 'Als Download bereitgestellt.';
    return inPlaceCapable ? wohin : `${wohin.slice(0, -1)}: ${filename}`;
  } catch (err) {
    return 'Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err));
  }
}

/**
 * Speichern = ein Export im Standardformat, ohne Schwärzung. Bewusst dieselbe Funktion
 * dahinter (INV-UI-4): wer den Tier-Fallback oder den Dateinamen ändert, ändert ihn für
 * Knopf, Kürzel UND Export-Fläche.
 */
export async function saveGedcom(
  appState: AppState,
  fileService: FileService,
  handle?: unknown,
): Promise<string> {
  return exportGedcom(appState, fileService, { format: 'gedcom-5.5.1', handle });
}
