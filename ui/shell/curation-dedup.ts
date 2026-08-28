// ui/shell/curation-dedup.ts — die BESCHRIFTUNG der Dedup-Kriterien, für Orte- und
// Höfe-Ansicht gemeinsam (Spec 11 §9.2).
//
// DIE HEURISTIK SELBST STEHT SEIT [ADR-v9-298] IM KERN (`core/places/curation.ts::
// pickWinnerId`). Grund war ein zweiter Aufrufer, den die Schale nicht bedienen konnte:
// der AUTOMATISCHE Hof-Nachlauf nach einem Dorf-Merge (`reconcileHofsUnderVillage`) führte
// eine eigene, ältere Fassung — ohne `curated` ([ADR-v9-225]) und ohne die Evidenz-Sprossen
// ([ADR-v9-296]). Der Kern darf die Schale nicht aufrufen (INV-ARCH-1), also lag die Regel
// zweimal da, und nachgezogen wurde jedes Mal nur die sichtbare Hälfte.
//
// Was hier bleibt, ist reine Anzeige: die Zahl der datierten Perioden in Worte fassen.
export { pickWinnerId, type DedupCandidateMeta } from '../../core/places';

/**
 * Beschriftung der datierten Perioden für die Dedup-Zeile ([ADR-v9-296]) — EINE Fassung
 * für Orte und Höfe, wie die Heuristik selbst. Auch die Null wird ausgeschrieben: in einer
 * VERGLEICHS-Fläche ist „keine" die Information, an der sich der Vorschlag erklärt (dieselbe
 * Lesart, aus der die Anreicherungs-Pille dort bei jedem Mitglied steht, ADR-v9-191 E4 —
 * anders als in der Liste, wo Abwesenheit der Regelfall und damit Rauschen ist, ADR-v9-149).
 */
export function datedPeriodLabel(n: number): string {
  if (n === 0) return 'keine datierte Periode';
  return n === 1 ? '1 datierte Periode' : `${n} datierte Perioden`;
}

/** Tooltip dazu — nennt, was gezählt wird, und wofür die Zahl zählt. */
export const DATIERTE_PERIODEN_HILFE =
  'Wie viele Zugehörigkeits- und Namens-Einträge dieses Eintrags einen Zeitraum tragen ' +
  '(beim Hof: seine Adressvarianten). Für eine Verwaltungseinheit ist die Zeitachse das ' +
  'Wesensmerkmal — deshalb entscheidet diese Zahl den Vorschlag, wenn Kuration und ' +
  'Anreicherungs-Grad gleichstehen.';
