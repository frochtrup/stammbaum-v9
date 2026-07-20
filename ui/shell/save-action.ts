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
import { exportViaOnePipe } from '../../services/file';
import type { FileService } from '../../services/file';
import type { AppState } from './app-state.svelte';

/** Dateiname ohne Endung — Basis für den Export-Namen. */
export function baseNameOf(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, '');
}

/**
 * Speichert den aktuellen Stand über das eine Export-Rohr und liefert den
 * anzuzeigenden Hinweis zurück (nie einen Wurf — der Aufrufer soll eine Meldung
 * zeigen, nicht abstürzen).
 */
export async function saveGedcom(
  appState: AppState,
  fileService: FileService,
  handle?: unknown,
): Promise<string> {
  try {
    const result = await exportViaOnePipe(fileService, {
      format: 'gedcom-5.5.1',
      baseName: baseNameOf(appState.fileName),
      gedcomDoc: appState.buildGedcomDoc(),
      handle,
    });
    if (!result.ok) return 'Speichern abgebrochen.';
    if (result.tier === 'fs-handle') return 'Gespeichert (direkt in die Datei).';
    if (result.tier === 'share') return 'Zum Sichern angeboten (Share-Sheet).';
    return 'Als Download bereitgestellt.';
  } catch (err) {
    return 'Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err));
  }
}
