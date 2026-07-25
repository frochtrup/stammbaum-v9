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
import { exportViaOnePipe, exportFileName, gzipCodec } from '../../services/file';
import type { ExportFormat, FileService } from '../../services/file';
import type { AppState } from './app-state.svelte';

/** Dateiname ohne Endung — Basis für den Export-Namen. */
export function baseNameOf(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, '');
}

/**
 * Die Formate, die die Oberfläche anbieten KANN. GRAMPS ist nur dann eine sinnvolle Wahl,
 * wenn tatsächlich ein `.gramps` geladen ist (dann round-trippt der Export voll, BL-139/140/
 * 142/144) — ein GRAMPS-Cross-Export aus einem GEDCOM-Ursprung wäre hohl (ADR-v9-113). Die
 * Export-Fläche filtert `gramps` deshalb anhand von `appState.docFormat` heraus.
 */
export type UiExportFormat = ExportFormat;

/** Das native (in-place-fähige) Exportformat des geladenen Dokuments. */
function nativeFormatOf(appState: AppState): ExportFormat {
  return appState.docFormat === 'gramps' ? 'gramps' : 'gedcom-5.5.1';
}

export interface ExportRequestUi {
  format: UiExportFormat;
  /** Gesetzt = anonymisierter Export; der Wert ist das Bezugsjahr (injiziert, TST-3). */
  anonymizeReferenceYear?: number;
  /** FS-Handle der Originaldatei; wird nur bei format==geladenem Format (in-place) genutzt. */
  handle?: unknown;
}

/**
 * DER EINE Export-Vorgang der Schale: Speichern-Knopf, ⌘S und die Export-Fläche laufen
 * hier durch. Liefert den anzuzeigenden Hinweis zurück (nie einen Wurf — der Aufrufer
 * soll eine Meldung zeigen, nicht abstürzen). Verzweigt formatabhängig zwischen GEDCOM-Doc
 * und GRAMPS-Doc (+ gzip), aber NUR in der Doc-Wahl — das Save-Rohr bleibt eins (INV-FILE-2).
 */
export async function exportGedcom(
  appState: AppState,
  fileService: FileService,
  req: ExportRequestUi,
): Promise<string> {
  const baseName = baseNameOf(appState.fileName);
  const anonymize = req.anonymizeReferenceYear != null;
  const isGramps = req.format === 'gramps';
  // In-place nur, wenn das Exportformat DEM GELADENEN entspricht (gleiche Endung + gleiches
  // Format wie der Handle zeigt) und nicht anonymisiert wird — sonst neuer Dateiname/Download.
  const inPlaceCapable = req.format === nativeFormatOf(appState) && !anonymize;
  const filename = exportFileName(baseName, req.format, anonymize);
  try {
    const result = await exportViaOnePipe(fileService, {
      format: req.format,
      baseName,
      gedcomDoc: isGramps ? undefined : appState.buildGedcomDoc(),
      grampsDoc: isGramps ? appState.buildGrampsDoc() : undefined,
      gzip: isGramps ? gzipCodec : undefined,
      handle: inPlaceCapable ? req.handle : undefined,
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
 * Speichern = ein Export im NATIVEN Format des geladenen Dokuments (GEDCOM 5.5.1 bzw.
 * GRAMPS — Round-trip), ohne Schwärzung. Bewusst dieselbe Funktion dahinter (INV-UI-4):
 * wer den Tier-Fallback oder den Dateinamen ändert, ändert ihn für Knopf, Kürzel UND
 * Export-Fläche.
 */
export async function saveCurrentDoc(
  appState: AppState,
  fileService: FileService,
  handle?: unknown,
): Promise<string> {
  return exportGedcom(appState, fileService, { format: nativeFormatOf(appState), handle });
}
