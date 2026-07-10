// ui/shell/count-active-filters.ts — zählt vom Default abweichende Filterfelder für
// den FilterBar-Trigger ("Filter · N", Spec 21 §10a). Reine Funktion, generisch über
// PersonFilters/FamilyFilters/PlaceFilters (alle Felder sind Primitiv-Werte: string,
// number|null, boolean) — KEINE eigene Filterlogik, nur ein Diff gegen den jeweiligen
// `defaultXFilters()`-Wert, den jede Liste bereits besitzt.
export function countActiveFilters<T extends object>(filters: T, defaults: T): number {
  let count = 0;
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    if (filters[key] !== defaults[key]) count += 1;
  }
  return count;
}
