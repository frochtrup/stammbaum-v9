// ui/shell/create-retraction.ts — die Rücknahme der Sofort-Anlage (BL-275, INV-UI-10,
// [21 §6g]).
//
// DER BEFUND. `＋ Neue Person`/`＋ Neue Quelle`/`＋ Neues Archiv` legen den Datensatz
// SOFORT an (`PersonList.createPerson` & Co. rufen `appState.save*`) und öffnen dann den
// Editor auf der Detailseite. Wer die Anlage danach nicht mehr will, hatte keinen Weg
// zurück: der Editor schloss, der leere Datensatz blieb. INV-UI-10 verlangt für jede
// Ein-Klick-Sofort-Aktion eine ebenso leichte Rücknahme, solange der gesetzte Zustand
// noch leer ist — genau dieser Fall.
//
// WARUM HIER UND NICHT DREIMAL. Person, Quelle und Archiv unterscheiden sich nur in
// Prädikat und Lösch-Kommando; die REGEL ist eine (INV-UI-4). Sie hier zu halten gibt ihr
// außerdem einen Namen, an dem der Wächter (`tests/ui/entity-create-cancel.test.ts`)
// nachsehen kann, ob eine Detailansicht mit Sofort-Anlage sie überhaupt anwendet.
//
// WAS SIE BEWUSST NICHT TUT: sie fragt nicht, WOHIN danach navigiert wird. Der Aufrufer
// weiß das (sein `onBack` hängt am Verlauf, BL-07) und ruft es selbst — hier stünde sonst
// eine zweite Navigations-Quelle neben `nav-history` (INV-UI-2).

export interface RetractionArgs<T> {
  /**
   * Ist dies eine Anlage-Sitzung? — der Aufrufer leitet das aus seinem `startInEdit` ab
   * (gesetzt von `entity-tab-navigation`s „gerade angelegt"-Merker). Auf einem
   * BESTEHENDEN Datensatz ist der Wert `false`, und dann passiert hier nie etwas: eine
   * alte, zufällig leere Person ist kein Anlage-Versehen und wird nicht angefasst.
   */
  fresh: boolean;
  /** Der Datensatz in seinem AKTUELLEN Stand (nicht der Mount-Schnappschuss). */
  entity: T | null | undefined;
  /** `isPersonEmpty`/`isSourceEmpty`/`isRepositoryEmpty` (core/model/empty.ts). */
  isEmpty: (e: T) => boolean;
  /** Das referenz-auflösende Lösch-Kommando (`appState.deletePerson` & Co.). */
  remove: (e: T) => void;
}

/**
 * Nimmt eine Sofort-Anlage zurück, an der nichts hängt. Liefert `true`, wenn tatsächlich
 * gelöscht wurde — dann zeigt der Aufrufer eine Detailfläche ohne Datensatz und MUSS
 * seinen Rückweg gehen.
 */
export function retractIfPristine<T>({ fresh, entity, isEmpty, remove }: RetractionArgs<T>): boolean {
  if (!fresh || !entity) return false;
  if (!isEmpty(entity)) return false;
  remove(entity);
  return true;
}
