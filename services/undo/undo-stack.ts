// services/undo/undo-stack.ts — Undo/Redo-Stack (BL-01, ADR-v9-92, Spec 20 §1.2).
//
// BAUWEISE: Ein Eintrag ist eine REFERENZ auf ein `Database`-Objekt, keine Kopie.
// Spec 20 §1.2 fordert einen „Snapshot-Stack (≥30 Einträge)"; die wörtliche Lesart
// (Tiefkopie je Eintrag) wurde in ADR-v9-92 gemessen und verworfen — 1,3 GiB bei der
// zugesicherten Bestandsgröße von 20.000 Personen, auf dem primären Zielgerät
// (iPad/Safari, Spec 30 NFR-2) nicht tragbar. Mit geteilten Entitäten sind es 12,8 MiB.
//
// Die Zahl trägt nur, solange kein Kommando eine Entität in-place ändert, die ein
// gehaltener Eintrag noch teilt. Diese Disziplin ist NICHT Sache dieses Moduls — sie
// steckt in `core/model/draft.ts` (compiler-erzwungen) und wird von
// `tests/ui/app-state-cow.test.ts` verriegelt. Hier wird bewusst NICHT defensiv kopiert:
// eine Sicherheitskopie „für alle Fälle" wäre genau die Tiefkopie, die der ADR verwirft,
// und würde den Fehler zudem verdecken statt melden.
//
// Framework-frei (INV-ARCH-1): kein Svelte, kein DOM, kein I/O. Die Schale
// (`ui/shell/app-state.svelte.ts`) legt vor jedem mutierenden Kommando ab und macht die
// Reaktivität; dieses Modul kennt nur Zustände und ihre Reihenfolge.
import type { Database } from '../../core/model/types';

/** Spec 20 §1.2: „Snapshot-Stack (≥30 Einträge)". */
export const DEFAULT_UNDO_LIMIT = 30;

export interface UndoStack {
  /** true, wenn ein Zustand zum Zurückgehen bereitliegt. */
  readonly canUndo: boolean;
  /** true, wenn ein zurückgenommener Zustand wiederherstellbar ist. */
  readonly canRedo: boolean;
  /** Anzahl gehaltener Undo-Einträge (für Tests/Diagnose). */
  readonly depth: number;
  /**
   * Legt den Zustand VOR einem Kommando ab. Verwirft den Redo-Zweig: nach einer neuen
   * Änderung führt kein Weg mehr in die zurückgenommene Zukunft (Standard-Verhalten,
   * sonst könnte ein Redo einen Zustand einsetzen, der nie aus dem aktuellen entstanden ist).
   */
  push(before: Database): void;
  /**
   * Geht einen Schritt zurück. `current` ist der Zustand JETZT (wandert in den Redo-Zweig).
   * `null`, wenn nichts zurückzunehmen ist — dann greift „Revert to Saved" (Spec 20 §1.2).
   */
  undo(current: Database): Database | null;
  /** Geht einen zurückgenommenen Schritt wieder vor. `null`, wenn der Redo-Zweig leer ist. */
  redo(current: Database): Database | null;
  /**
   * Leert beide Richtungen. Beim Laden einer Datei aufzurufen: ein Undo über eine
   * Dateiöffnung hinweg gibt es nicht (ADR-v9-92 Punkt 5) — der volle Lade-Pass ist Teil
   * des Ladens, nicht des Editierens.
   */
  clear(): void;
}

/**
 * Baut EINEN Undo-Stack. Kein Modul-Singleton (analog createAppState/createViewState) —
 * Tests bekommen je einen frischen, kein geteilter Zustand über Testgrenzen hinweg.
 */
export function createUndoStack(limit: number = DEFAULT_UNDO_LIMIT): UndoStack {
  let past: Database[] = [];
  let future: Database[] = [];

  return {
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
    get depth() {
      return past.length;
    },
    push(before) {
      past.push(before);
      // Ältesten Eintrag verwerfen, sobald das Limit überschritten ist — der Stack ist
      // ein gleitendes Fenster, kein unbegrenztes Journal (Speicher, Spec 30 NFR-2).
      if (past.length > limit) past = past.slice(past.length - limit);
      future = [];
    },
    undo(current) {
      const previous = past.pop();
      if (previous === undefined) return null;
      future.push(current);
      return previous;
    },
    redo(current) {
      const next = future.pop();
      if (next === undefined) return null;
      past.push(current);
      return next;
    },
    clear() {
      past = [];
      future = [];
    },
  };
}
