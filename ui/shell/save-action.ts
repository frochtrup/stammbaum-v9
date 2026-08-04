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
import type { ExportFormat, FileService, DocFormat } from '../../services/file';
import type { ParsedGedcom, GrampsParsed, XmlDocument } from '../../core/interop';
import type { AppState } from './app-state.svelte';

/** Dateiname ohne Endung — Basis für den Export-Namen. */
export function baseNameOf(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, '');
}

/**
 * Die Formate, die die Oberfläche anbieten KANN — seit BL-160/ADR-v9-127 ALLE (GRAMPS
 * eingeschlossen, ADR-v9-113 Befund E5 ist damit überholt): jedes Format ist aus JEDEM
 * geladenen `db` exportierbar, auch wenn es einer ANDEREN Familie angehört als das
 * Quell-Doc (Cross-Family-Export, `exportCrossFamily` unten synthetisiert dann direkt aus
 * dem Modell statt aus einem — nicht existenten — Passthrough-Baum dieses Formats).
 */
export type UiExportFormat = ExportFormat;

/** Das native (in-place-fähige) Exportformat des geladenen Dokuments. */
function nativeFormatOf(appState: AppState): ExportFormat {
  return appState.docFormat === 'gramps' ? 'gramps' : 'gedcom-5.5.1';
}

/**
 * Ziel-Familie eines Exportformats (die beiden GEDCOM-Varianten neben 5.5.1 zählen
 * ebenfalls als 'gedcom' — nur GRAMPS bildet die andere Familie). Exportiert, damit die
 * Export-Fläche (ExportView.svelte) dieselbe Cross-Family-Erkennung fürs Labeling nutzt,
 * statt sie ein zweites Mal nachzubauen (INV-UI-4-Grundsatz auf eine Nicht-CSS-Regel).
 */
export function formatFamily(format: ExportFormat): DocFormat {
  return format === 'gramps' ? 'gramps' : 'gedcom';
}

/**
 * Cross-Family-Export (BL-160, ADR-v9-127): entscheidet, ob das angeforderte Format zur
 * Familie des GELADENEN Dokuments passt (dann die bestehende native Passthrough-Projektion,
 * `buildGedcomDoc`/`buildGrampsDoc` — Roundtrip-Treue, LP-1, unangetastet) oder einer ANDEREN
 * Familie angehört (dann `appState.buildCrossFamilyDoc()`, das den Zielbaum direkt aus dem
 * Modell synthetisiert, KEIN Quell-Doc dieser Familie vorausgesetzt). Das ist die EINE Naht,
 * über die jedes Format aus jedem geladenen `db` exportierbar wird — kein zweiter Pfad daneben.
 */
export function exportCrossFamily(
  appState: AppState,
  format: ExportFormat,
): { gedcomDoc?: ParsedGedcom; grampsDoc?: GrampsParsed | XmlDocument } {
  const targetFamily = formatFamily(format);
  if (targetFamily !== appState.docFormat) {
    return appState.buildCrossFamilyDoc(targetFamily);
  }
  return targetFamily === 'gramps' ? { grampsDoc: appState.buildGrampsDoc() } : { gedcomDoc: appState.buildGedcomDoc() };
}

export interface ExportRequestUi {
  format: UiExportFormat;
  /** Gesetzt = anonymisierter Export; der Wert ist das Bezugsjahr (injiziert, TST-3). */
  anonymizeReferenceYear?: number;
  /** FS-Handle der Originaldatei; wird nur bei format==geladenem Format (in-place) genutzt. */
  handle?: unknown;
}

/**
 * Ergebnis eines Export-Vorgangs für die Oberfläche.
 *
 * `handle` ist ein PFLICHTFELD des Rückgabetyps (optional nur im Wert), damit der Compiler
 * jeden Aufrufer die Frage stellen lässt „muss ich das merken?" — dieselbe Wahl wie bei
 * `EventsByType.resetKey` (Zwang statt Erinnerung). Wer es fallen lässt, verliert nur den
 * stillen Folge-Save; wer es vergisst, ohne es zu sehen, hätte einen Nutzer, der bei JEDEM
 * Speichern wieder den Dialog bekommt.
 */
export interface ExportOutcome {
  /** Anzuzeigender Hinweis. */
  notice: string;
  /** Bei „Speichern unter" (Tier 1b) das neu erworbene FS-Handle, sonst undefined. */
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
): Promise<ExportOutcome> {
  const baseName = baseNameOf(appState.fileName);
  const anonymize = req.anonymizeReferenceYear != null;
  const isGramps = req.format === 'gramps';
  // In-place nur, wenn das Exportformat DEM GELADENEN entspricht (gleiche Endung + gleiches
  // Format wie der Handle zeigt) und nicht anonymisiert wird — sonst neuer Dateiname/Download.
  // Ein Cross-Family-Format (BL-160) erfüllt das nie: nativeFormatOf(appState) liegt IMMER
  // in der Familie des geladenen Dokuments, ein Cross-Format nie — Download+neuer Dateiname
  // sind also bereits durch diese eine Bedingung erzwungen, kein Extra-Zweig nötig.
  const inPlaceCapable = req.format === nativeFormatOf(appState) && !anonymize;
  const filename = exportFileName(baseName, req.format, anonymize);
  try {
    const { gedcomDoc, grampsDoc } = exportCrossFamily(appState, req.format);
    const result = await exportViaOnePipe(fileService, {
      format: req.format,
      baseName,
      gedcomDoc,
      grampsDoc,
      gzip: isGramps ? gzipCodec : undefined,
      handle: inPlaceCapable ? req.handle : undefined,
      anonymizeReferenceYear: req.anonymizeReferenceYear,
    });
    if (!result.ok) return { notice: 'Speichern abgebrochen.' };
    if (result.tier === 'fs-handle') return { notice: 'Gespeichert (direkt in die Datei).' };
    // Tier 1b: der Nutzer hat das Ziel selbst gewählt — die Datei IST geschrieben, nicht
    // nur „angeboten". Das Handle geht mit zurück, damit der nächste Save still läuft.
    if (result.tier === 'fs-picker') {
      // Persistenz HIER, nicht beim Aufrufer: exportGedcom ist die eine Naht, durch die
      // Knopf, ⌘S und Export-Fläche laufen — drei Aufrufer, die es einzeln vergessen
      // könnten. Ein Tier-1b-Save trifft nur den nativen Pfad (jedes andere Format läuft
      // mit forceDownload), das Handle gehört also zwingend zur Arbeitskopie.
      //
      // ABSICHTLICH best-effort: die Datei IST an dieser Stelle bereits vollständig
      // geschrieben. Das Merken ist eine Bequemlichkeit für den NÄCHSTEN Save — scheitert
      // es (IDB voll, Handle nicht strukturiert klonbar), wäre „Speichern fehlgeschlagen"
      // eine Falschmeldung, die den Nutzer ein zweites Mal speichern lässt. Der Preis des
      // Scheiterns ist allein, dass beim nächsten Mal wieder der Dialog kommt.
      try {
        await fileService.rememberHandle(result.handle);
      } catch {
        /* bewusst verschluckt — s. o. */
      }
      return { notice: 'Gespeichert (in die gewählte Datei).', handle: result.handle };
    }
    const wohin = result.tier === 'share' ? 'Zum Sichern angeboten (Share-Sheet).' : 'Als Download bereitgestellt.';
    return { notice: inPlaceCapable ? wohin : `${wohin.slice(0, -1)}: ${filename}` };
  } catch (err) {
    return { notice: 'Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)) };
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
): Promise<ExportOutcome> {
  return exportGedcom(appState, fileService, { format: nativeFormatOf(appState), handle });
}
