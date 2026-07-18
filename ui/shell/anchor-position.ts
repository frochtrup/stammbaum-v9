// ui/shell/anchor-position.ts — wohin ein an einen Trigger gehängtes Overlay gehört.
//
// Reine Rechnung über Zahlen: kein DOM, kein Svelte, keine Messung. Das ist Absicht —
// die Platzierungsregeln (unten bevorzugt, bei Platzmangel nach oben klappen, an den
// Viewport-Rändern begrenzen) sind die einzige Stelle mit echter Logik am Portal-
// Mechanismus (BL-85) und damit die einzige, die sich ohne Layout-Engine prüfen lässt.
// happy-dom kann `getBoundingClientRect` nicht sinnvoll füllen; was hier steht, ist
// deshalb bewusst von der Messung getrennt (dieselbe Trennung wie bei
// `count-active-filters.ts`).

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface AnchorInput {
  /** Position des Trigger-Elements im Viewport. */
  trigger: Box;
  /** Gemessene Größe des Overlays (nach `max-height`, also die echte Höhe). */
  panel: { width: number; height: number };
  viewport: { width: number; height: number };
  /** Abstand zwischen Trigger und Overlay. */
  gap?: number;
  /** Mindestabstand zu den Viewport-Rändern. */
  margin?: number;
}

export interface AnchorResult {
  top: number;
  left: number;
  /** Wo das Overlay tatsächlich gelandet ist — für Pfeil-/Schatten-Richtung nutzbar. */
  placement: 'below' | 'above';
}

/**
 * Platziert ein Overlay an seinem Trigger — in Viewport-Koordinaten, weil das Overlay
 * nach dem Portalieren als `position: fixed` am `<body>` hängt und keinen positionierten
 * Vorfahren mehr hat.
 *
 * Reihenfolge der Regeln:
 * 1. **Unten bevorzugt** — die gewohnte Richtung für Menüs und Popover.
 * 2. **Nach oben klappen**, wenn unten nicht genug Platz ist UND oben mehr ist. Nur
 *    dann: ein Overlay, das über dem Trigger klebt, obwohl unten Platz war, wirkt wie
 *    ein Fehler.
 * 3. **Begrenzen** statt überlaufen. Ist das Overlay höher als der Viewport, gewinnt der
 *    obere Rand — der Kopf einer Liste ist wichtiger als ihr Ende, und scrollen kann sie
 *    selbst (`overflow-y: auto`).
 */
export function anchorPosition(input: AnchorInput): AnchorResult {
  const { trigger, panel, viewport } = input;
  const gap = input.gap ?? 4;
  const margin = input.margin ?? 8;

  const triggerBottom = trigger.top + trigger.height;
  const raumUnten = viewport.height - margin - (triggerBottom + gap);
  const raumOben = trigger.top - gap - margin;

  const nachOben = panel.height > raumUnten && raumOben > raumUnten;
  const placement: 'below' | 'above' = nachOben ? 'above' : 'below';

  let top = nachOben ? trigger.top - gap - panel.height : triggerBottom + gap;
  // Begrenzen — aber der obere Rand gewinnt, wenn beides nicht geht (s. Regel 3).
  top = Math.min(top, viewport.height - margin - panel.height);
  top = Math.max(top, margin);

  let left = trigger.left;
  left = Math.min(left, viewport.width - margin - panel.width);
  left = Math.max(left, margin);

  return { top, left, placement };
}
