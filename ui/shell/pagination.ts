// ui/shell/pagination.ts — geteilter Slice-/"N weitere laden"-Helfer für lange, flach
// gerenderte Listen (Spec 21 §10b). Befund: SourceDetail.svelte's "Referenzen (N)"
// rendert bislang JEDE Referenz in einem einzigen `{#each}` ohne Gruppierung/Deckel —
// bei vielen Zitatstellen (z. B. eine oft zitierte Kirchenbuch-Quelle) eine
// unbegrenzt lange Liste. Diese reine Funktion trägt NUR die Slice-Arithmetik; welche
// Liste in Gruppen zerlegt wird (z. B. nach Referenz-Kontext-Typ), bleibt Sache des
// jeweiligen *-detail-model.ts (Spec-konforme "reine Projektion", kein DOM/State hier).
export const DEFAULT_PAGE_SIZE = 30;

export interface PagedSlice<T> {
  /** Die ersten `shown` Elemente (oder alle, falls weniger vorhanden). */
  visible: T[];
  /** Wie viele Elemente NICHT gezeigt werden — 0 heißt "vollständig sichtbar". */
  remaining: number;
}

/** Schneidet `items` auf die ersten `shown` Elemente zu (min. 0, max. `items.length`). */
export function pageSlice<T>(items: T[], shown: number): PagedSlice<T> {
  const clamped = Math.min(Math.max(shown, 0), items.length);
  const visible = items.slice(0, clamped);
  return { visible, remaining: items.length - visible.length };
}
