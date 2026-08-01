// services/union-merge.ts — der EINE Drei-Wege-Union-Merge für id-gekeyte Sammlungen
// (Spec 30 §4 LP-9). Rein, plattformfrei, ohne Bezug auf einen konkreten Datentyp.
//
// Warum hier oben und nicht in `services/places`: seit BL-239 braucht ihn eine zweite
// Sammlung — die Forschungsprojekte im B1-Bündel (`app-data.json`). Zwei Kopien derselben
// Konfliktpolitik wären zwei Wahrheiten darüber, was „beide Seiten bleiben erhalten"
// heißt; genau die Streuung, die INV-UI-4 auf der Oberfläche verbietet und die hier
// dieselbe Wirkung hätte. Die Funktion ist unverändert aus `places-sync-service.ts`
// gehoben — die dortigen Tests (tests/services/places-sync.test.ts) decken sie weiterhin
// ab, `tests/services/union-merge.test.ts` prüft sie direkt.
//
// POLICY: alle IDs beider Seiten bleiben erhalten (keine Seite verliert einen Eintrag,
// den die andere nicht hat). Existiert dieselbe ID auf beiden Seiten mit
// UNTERSCHIEDLICHEM Inhalt, entscheidet der GEMEINSAME VORFAHRE (`base`): die Seite, die
// sich gegenüber der Basis nicht verändert hat, hat nichts zu sagen und verliert. Haben
// beide sich verändert (oder gibt es keine Basis für diese ID), ist es ein echter Konflikt
// — lokal gewinnt deterministisch (es ist die Fassung, die der Nutzer vor Augen hat) und
// die ID wird gemeldet, damit die Meldung nicht Datenerhalt behauptet. Kein Feld-Merge.
//
// BEWUSSTE GRENZE: eine lokale LÖSCHUNG setzt sich nicht durch, solange die Gegenseite
// den Eintrag noch führt — „Union" heißt genau das. Ein Tombstone-Mechanismus wäre die
// Alternative und ist bewusst nicht gebaut (er verlangte eigene Lebenszeit-Regeln für
// Grabsteine); der Nutzer löscht dann zweimal.

export function toMap<T extends { id: string }>(list: readonly T[]): Map<string, T> {
  return new Map(list.map((item) => [item.id, item]));
}

export function toList<T>(map: Map<string, T>): T[] {
  return Array.from(map.values());
}

/** Strukturelle Gleichheit über die Wire-Form (JSON) — genügt für Konflikt-Erkennung. */
export function sameContent<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface UnionMergeResult<T> {
  merged: Map<string, T>;
  /** IDs, die auf beiden Seiten mit unterschiedlichem Inhalt standen. */
  collidedIds: string[];
  /** Teilmenge davon, in der BEIDE Seiten sich gegenüber `base` geändert haben. */
  conflictIds: string[];
}

/**
 * Union-Merge zweier id-gekeyter Maps gegen ihren gemeinsamen Vorfahren (Spec 30 §4 LP-9):
 * alle IDs beider Seiten bleiben; bei abweichendem Inhalt derselben ID entscheidet, WER
 * sich gegenüber `base` verändert hat.
 */
export function unionMerge<T extends { id: string }>(
  local: Map<string, T>,
  remote: Map<string, T>,
  base: Map<string, T>,
): UnionMergeResult<T> {
  const merged = new Map<string, T>();
  const collidedIds: string[] = [];
  const conflictIds: string[] = [];

  for (const [id, remoteItem] of remote) merged.set(id, remoteItem);
  for (const [id, localItem] of local) {
    const remoteItem = remote.get(id);
    if (remoteItem === undefined) {
      merged.set(id, localItem);
      continue;
    }
    if (sameContent(localItem, remoteItem)) continue; // kein Konflikt, identischer Inhalt.
    collidedIds.push(id);

    const baseItem = base.get(id);
    const lokalUnveraendert = baseItem !== undefined && sameContent(localItem, baseItem);
    const remoteUnveraendert = baseItem !== undefined && sameContent(remoteItem, baseItem);

    if (lokalUnveraendert) {
      merged.set(id, remoteItem); // nur die Gegenseite hat etwas zu sagen
    } else if (remoteUnveraendert) {
      merged.set(id, localItem);
    } else {
      conflictIds.push(id);
      merged.set(id, localItem);
    }
  }

  return { merged, collidedIds, conflictIds };
}
