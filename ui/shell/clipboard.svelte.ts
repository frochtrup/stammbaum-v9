// ui/shell/clipboard.svelte.ts — DIE Zwischenablage-Primitive der Sitzung (INV-UI-4).
//
// Entstanden bei BL-234: die Quellreferenz-Ablage braucht exakt dieselbe Bauform wie die
// Ereignis-Ablage aus BL-212/[ADR-v9-156] — Fabrik statt Modul-Singleton, transienter
// Sitzungszustand, tiefe Kopie beim Ablegen UND beim Entnehmen. Statt diese 30 Zeilen ein
// zweites Mal zu schreiben (und damit einen zweiten Ablage-Mechanismus daneben zu
// stellen), liegt die Mechanik EINMAL hier; `createEventClipboard`/`createCitationClipboard`
// legen nur noch fest, WAS abgelegt wird und wie eine Kopie davon aussieht.
//
// AUSDRÜCKLICH TRANSIENT — Kategorie A ([30 §2](../../specs/v9/30-NFR-und-Persistenz.md)):
// lebt nur in dieser Sitzung, wird NICHT persistiert und reist nicht mit der Datei. Damit
// berührt sie das Kategorie-B-Sync-Bündel (BL-180) nicht; eine Zwischenablage, die einen
// Neustart überlebt, wäre auch fachlich Unsinn.
//
// KEIN Modul-Singleton (Bauform wie createRoute()/createViewState()), damit Tests eine
// frische, isolierte Instanz bekommen und zwei Testfälle sich nicht gegenseitig füllen.
//
// Warum zweimal kopiert wird (beim `copy` UND beim `take`): das Original lebt nach dem
// Ablegen weiter in seinem Datensatz und darf sich ändern, ohne die Ablage zu verändern;
// und zwei Einfügungen derselben Ablage dürfen kein geteiltes Objekt bekommen — sonst
// schriebe eine spätere Änderung an der einen still in die andere.

export interface Clipboard<T> {
  /** Der abgelegte Wert oder null (Ablage leer). */
  readonly value: T | null;
  /** Kurzbeschriftung für die Einfüge-Affordanz, leer wenn nichts abgelegt ist. */
  readonly label: string;
  copy(value: T, label: string): void;
  clear(): void;
  /** Frische Kopie zum Einfügen — nie das abgelegte Objekt selbst (s. Kopfkommentar). */
  take(): T | null;
}

/**
 * @param copyValue erzeugt eine vom Original entkoppelte Kopie — so tief, wie der
 *   jeweilige Wert es braucht (bei einem Ereignis inkl. Zitat-/Medien-Arrays, bei einer
 *   flachen Quellreferenz genügt der Spread).
 */
export function createClipboard<T>(copyValue: (value: T) => T): Clipboard<T> {
  let value = $state<T | null>(null);
  let label = $state('');

  return {
    get value() {
      return value;
    },
    get label() {
      return label;
    },
    copy(v, lbl) {
      value = copyValue(v);
      label = lbl;
    },
    clear() {
      value = null;
      label = '';
    },
    take() {
      return value === null ? null : copyValue(value);
    },
  };
}
