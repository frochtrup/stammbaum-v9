// ui/shell/event-grouping.ts — reine Gruppierungs-Logik für "Ereignis-Reihen nach
// Schlüssel" (INV-UI-4, Spec 21 §6b Nachtrag): PlaceDetail.svelte gruppierte Ereignisse
// nach literalem GEDCOM-Typ ("Ereignisse nach Typ", z. B. "RESI (3)"); HofDetail.svelte
// hatte denselben visuellen Zweck ("Bewohner (chronologisch)"), aber KEINE Gruppierung —
// und mischte dabei RESI/CENS (Bewohner) mit PROP (Eigentümer) in einer einzigen,
// fachlich falsch beschrifteten Liste. Diese eine Funktion + der begleitende
// `EventsByType.svelte`-Renderer decken BEIDE Fälle ab: PlaceDetail gruppiert nach dem
// rohen `row.eventType`, HofDetail nach einer gröberen, aus dem eventType abgeleiteten
// Eigentümer-/Bewohner-Kennung — derselbe Mechanismus, nur ein anderer `keyOf`.
export interface EventGroup<T> {
  /** Gruppen-Schlüssel — bei PlaceDetail der rohe GEDCOM-Typ (z. B. "RESI"), bei
   *  HofDetail ein Sammel-Label ("Bewohner"/"Eigentümer"). */
  type: string;
  rows: T[];
}

/**
 * Partitioniert `rows` nach `keyOf(row)`, ohne die relative Reihenfolge innerhalb einer
 * Gruppe zu verändern (Aufrufer liefert bereits chronologisch sortierte Zeilen, s.
 * hof-detail-model.ts/place-detail-model.ts). Gruppen-Reihenfolge: standardmäßig
 * alphabetisch (de) — bei GLEICHRANGIGEN Kategorien (Ereignistyp, Referenz-Typ). Optional
 * `order` (Nutzer-Vorgabe 2026-07-10, `person-detail-model.ts`s Ereignis-Kategorien):
 * feste Reihenfolge statt alphabetisch, für Kategorien mit inhärenter Rangfolge
 * (Lebensdaten vor Bildung vor Beruf …) — Gruppen, die nicht in `order` vorkommen,
 * sortieren ans Ende (alphabetisch untereinander).
 */
export function groupByKey<T>(rows: T[], keyOf: (row: T) => string, order?: readonly string[]): EventGroup<T>[] {
  const byKey = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = byKey.get(key);
    if (list) list.push(row);
    else byKey.set(key, [row]);
  }
  const groups = Array.from(byKey.entries()).map(([type, typeRows]) => ({ type, rows: typeRows }));
  if (!order) {
    return groups.sort((a, b) => a.type.localeCompare(b.type, 'de'));
  }
  const rankOf = (type: string) => {
    const i = order.indexOf(type);
    return i === -1 ? order.length : i;
  };
  return groups.sort((a, b) => rankOf(a.type) - rankOf(b.type) || a.type.localeCompare(b.type, 'de'));
}
