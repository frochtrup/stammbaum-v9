// ui/shell/shortcuts.ts — Tastenkürzel der Schale (BL-01 bringt Undo/Redo mit; die
// übrigen aus BL-08 — Speichern/Verwerfen/Escape — kommen später hier dazu).
//
// Rein und DOM-frei bis auf den Ereignistyp: die Zuordnung Taste → Aktion ist eine
// Funktion, kein Listener. Damit ist sie ohne Event-Dispatch testbar (TST-3-Geist), und
// die Schale bleibt für das Verdrahten zuständig (App.svelte, `<svelte:window>`).

/** Die von der Schale ausführbaren Kürzel-Aktionen. */
export type Shortcut = 'undo' | 'redo';

/**
 * True, wenn der Tastendruck in einem Texteingabe-Kontext landet.
 *
 * WICHTIG für ⌘Z: in einem Eingabefeld gehört das Kürzel dem Feld (Text-Undo des
 * Browsers), NICHT dem Dokument. Ohne diese Prüfung würde ein ⌘Z beim Korrigieren eines
 * Namens die zuletzt gespeicherte Änderung der ganzen Datenbank zurücknehmen — eine
 * Überraschung, die schlimmer ist als kein Kürzel. Das Feld behält sein Verhalten,
 * weil wir das Ereignis dann gar nicht erst beanspruchen.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Ordnet einen Tastendruck einer Aktion zu, oder `null`.
 *
 * ⌘Z / Strg+Z → undo · ⇧⌘Z / Strg+Umschalt+Z → redo.
 *
 * Bewusst BEIDE Modifier akzeptiert statt Plattform-Erkennung: `metaKey` (macOS/iPadOS,
 * die primären Zielgeräte laut Spec 30 NFR-2) und `ctrlKey` (Windows/Linux). Eine
 * Plattform-Abfrage über den User-Agent wäre eine zusätzliche, unzuverlässige
 * Fehlerquelle für keinen Gewinn — Strg+Z auf dem Mac ist schlicht unüblich, nicht
 * schädlich. `altKey` schließt Kombinationen aus, die anderswo eigene Bedeutung haben.
 */
export function matchShortcut(e: KeyboardEvent): Shortcut | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null;
  if (e.key.toLowerCase() !== 'z') return null;
  return e.shiftKey ? 'redo' : 'undo';
}
