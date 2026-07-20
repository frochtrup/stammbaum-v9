// ui/shell/shortcuts.ts — Tastenkürzel der Schale (Spec 20 §1.2, Spec 21 §3
// "Tastatur-first überall"). Undo/Redo kamen mit BL-01, Speichern/Escape mit BL-08,
// die Befehlspalette mit BL-93 — bewusst in EINEM Zug gebaut (ADR-v9-101): die Datei
// ist klein, sie zweimal aufzumachen kostet mehr als die sauberere Backlog-Grenze wert
// wäre.
//
// Rein und DOM-frei bis auf den Ereignistyp: die Zuordnung Taste → Aktion ist eine
// Funktion, kein Listener. Damit ist sie ohne Event-Dispatch testbar (TST-3-Geist), und
// die Schale bleibt für das Verdrahten zuständig (App.svelte, `<svelte:window>`).

/** Die von der Schale ausführbaren Kürzel-Aktionen. */
export type Shortcut = 'undo' | 'redo' | 'save' | 'palette' | 'escape';

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
  // Escape trägt keinen Modifier — zuerst prüfen, sonst fällt es durch die
  // Modifier-Schranke unten.
  if (e.key === 'Escape') return 'escape';

  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null;
  const key = e.key.toLowerCase();
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (key === 's') return 'save';
  if (key === 'k') return 'palette';
  return null;
}

/**
 * Gehört das Kürzel im Texteingabe-Kontext dem FELD statt der App?
 *
 * Nur Undo/Redo: dort ist das Text-Undo des Browsers die erwartete Bedeutung (s.
 * `isEditableTarget`). Speichern, Befehlspalette und Escape sollen dagegen GERADE auch
 * beim Tippen greifen — ein Escape, das ein offenes Overlay nicht schließt, weil der
 * Fokus im Suchfeld dieses Overlays steht, wäre die Falle statt der Rettung (LP-8,
 * Spec 21 §6i "Escape schließt jedes Overlay").
 *
 * Vor BL-93 war diese Unterscheidung nicht nötig und lag als pauschales
 * `if (isEditableTarget(e.target)) return;` beim Aufrufer — mit Escape im Kürzel-Satz
 * wäre daraus genau der beschriebene Keyboard-Trap geworden.
 */
export function belongsToField(shortcut: Shortcut): boolean {
  return shortcut === 'undo' || shortcut === 'redo';
}
