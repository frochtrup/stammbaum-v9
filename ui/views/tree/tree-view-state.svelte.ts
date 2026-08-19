// ui/views/tree/tree-view-state.svelte.ts — Ansichts-Unterzustand der Baum-Lens (BL-368,
// Spec 21 §5, Heimat ③).
//
// WAS HIER LIEGT: die gewählte Generationenzahl, JE MODUS eine eigene. Nicht ein
// gemeinsamer Wert, den jede Insel auf ihre Spanne klemmt — die drei Spannen sind
// verschieden (Vorfahren-Ebenen 1–4 · Nachkommen 2–7 · Fächer 3–8), und ein geteilter
// Wert hieße, dass der Regler „6" zeigt, während die Sanduhr 4 Ebenen zeichnet. Je Modus
// ein Slot macht diese stille Klemmung strukturell unmöglich (Nutzer-Entscheidung
// 2026-08-17).
//
// WARUM AUSSERHALB DER KOMPONENTE: `TreeView` wird beim Wechsel in eine andere Lens
// abgebaut. Läge der Wert komponenten-lokal, stünde er nach jedem Blick auf die Karte
// wieder auf der Vorgabe — Spec 21 §5 nennt genau das („Ansichts-Unterzustand, der eine
// Navigation überleben muss, gehört … nicht in komponenten-lokalen Zustand").
//
// WARUM HIER UND NICHT IM VIEWSTATE: derselbe Grund wie bei
// `quality-dashboard-state.svelte.ts` (ADR-v9-192/229) — der ViewState hält AUSWAHLEN je
// Navigationsziel (INV-VS), keine Anzeige-Einstellungen. Und nicht in `route`: dort
// wohnen die Merker „welches Ziel / welcher Anzeige-MODUS ist offen" (`treeMode`), nicht
// die Feineinstellung eines Modus.
//
// WARUM `null` STATT EINER ZAHL ALS VORGABE: die Vorgabe der Sanduhr hängt am Formfaktor
// (Hochformat 2, sonst 4), und den misst der Viewport am Container — nicht die Schale am
// Fenster. `null` heißt „noch nicht gewählt"; dann bildet und ZEIGT die Insel ihre eigene
// Vorgabe, und es gibt keine zweite Formfaktor-Wahrheit.
//
// NICHT persistiert: eine Ansichtswahl, die nach Wochen unerklärt wiederkehrt, wäre eine
// Überraschung, kein Dienst (dieselbe Erwägung wie beim transienten Probanden,
// ADR-v9-135, und beim Brennpunkte-Filter, ADR-v9-229).
import type { TreeModeId } from '../../shell/nav-model';

export interface TreeViewState {
  /** Gewählte Generationenzahl des Modus, oder `null` = „noch nicht gewählt". */
  generationsFor(mode: TreeModeId): number | null;
  /** Wahl des Nutzers ablegen. Geklemmt wird an der Insel-Grenze, nicht hier — die Spannen
   *  gehören den Layout-Modulen (INV-ARCH-1), und der Halter kennt keine Geometrie. */
  setGenerations(mode: TreeModeId, n: number): void;
}

/**
 * Baut EINEN Halter. Kein Modul-Singleton (gleiche Begründung wie `createViewState`):
 * die App-Wurzel erzeugt genau eine Instanz und reicht sie durch, Komponententests
 * bekommen eine frische, isolierte.
 */
export function createTreeViewState(): TreeViewState {
  const generations = $state<Record<TreeModeId, number | null>>({
    hourglass: null,
    descendant: null,
    fan: null,
  });

  return {
    generationsFor(mode) {
      return generations[mode];
    },
    setGenerations(mode, n) {
      generations[mode] = n;
    },
  };
}
