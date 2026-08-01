// ui/shell/swipe-nav.ts — Wisch-Geste für Zurück/Vorwärts auf Mobile (Spec 21 §2
// „Swipe-Right = Zurück (herkunftsbewusst)", BL-07, ADR-v9-177).
//
// Die ERKENNUNG ist eine reine Funktion (headless testbar, INV-ARCH-2), das Verdrahten
// eine dünne Svelte-Action. Schwellen 1:1 aus dem v8-Orakel (`_initDetailSwipe`,
// ui-views-tree.js): 60px Mindeststrecke, waagerecht mindestens 1,2× so weit wie
// senkrecht, höchstens 400ms. Das Verhältnis ist der eigentliche Schutz — ohne es
// löst jedes zügige Runterscrollen mit leichtem Seitwärtsdrall die Navigation aus.
//
// Warum die Geste und nicht ein zweiter Knopf: v8 trug Zurück/Verlauf/Vorwärts als
// sichtbares Trio in DREI Kopfzeilen (Detail, Zeitleiste, Story) — neun dauerhaft
// sichtbare Bedienelemente, Altlast §10 in Reinform, und heute ein Bruch von INV-UI-11.
// v9 hat für Zurück bereits eine Fläche (den vorhandenen Knopf im Detail-Kopf, der jetzt
// herkunftsbewusst ist); Vorwärts bekommt KEINE neue, sondern die Gegenrichtung derselben
// Geste plus das Tastenkürzel. Vorwärts ist eine Korrektur eines Zurück — wer nie zurück
// ging, braucht es nie.

/** Rohdaten einer abgeschlossenen Wischbewegung. */
export interface SwipeInput {
  dx: number;
  dy: number;
  elapsedMs: number;
}

export const SWIPE_MIN_DISTANCE = 60;
export const SWIPE_MAX_MS = 400;
/** Waagerecht muss deutlich überwiegen — sonst ist es ein Scroll, kein Wisch. */
export const SWIPE_AXIS_RATIO = 1.2;

/**
 * Flächen, auf denen die Geste nichts verloren hat (BL-271, INV-UI-16-Nachbar).
 *
 * WARUM ÜBERHAUPT: Die Aktion hängt am Detail-Pane, und ein offenes Modal liegt bis
 * INV-UI-13 vollzogen ist (BL-278) im DOM DARIN — `position: fixed` verschiebt nur die
 * Darstellung, nicht die Ereigniskette. Ein Rechtswisch im offenen Ereignis-Editor
 * navigierte deshalb weg und verwarf die Eingabe still; einen Dirty-Schutz gibt es
 * nicht. Dasselbe im aufgeklappten Bearbeiten-Formular.
 *
 * ZWEI EINTRÄGE, KEIN DRITTER MECHANISMUS: `.stb-modal-backdrop` ist die bereits
 * geteilte Overlay-Primitive (design-system.css, INV-UI-4) — sie deckt jedes Modal ab,
 * ohne dass eines sich einzeln anmelden muss. `[data-no-swipe]` ist die Abmeldung für
 * Flächen ohne Backdrop (die inline aufgeklappten Bearbeiten-Formulare). Bewusst NICHT
 * `input, textarea, button` pauschal: Ereigniszeilen SIND Buttons, ein solcher Ausschluss
 * nähme der Geste die halbe Detailfläche.
 */
export const KEIN_WISCH_SELEKTOR = '.stb-modal-backdrop, [data-no-swipe]';

/** Liegt der Berührungspunkt in einer Fläche, die die Geste abbestellt hat? */
export function wischGesperrt(target: EventTarget | null): boolean {
  const el = target as Element | null;
  return typeof el?.closest === 'function' && el.closest(KEIN_WISCH_SELEKTOR) !== null;
}

/** `right` = zurück (Herkunft), `left` = vorwärts, `null` = kein Wisch. */
export function swipeDirection(g: SwipeInput): 'right' | 'left' | null {
  if (g.elapsedMs >= SWIPE_MAX_MS) return null;
  if (Math.abs(g.dx) <= SWIPE_MIN_DISTANCE) return null;
  if (Math.abs(g.dx) <= Math.abs(g.dy) * SWIPE_AXIS_RATIO) return null;
  return g.dx > 0 ? 'right' : 'left';
}

export interface SwipeNavOptions {
  onBack: () => void;
  onForward: () => void;
  /** Aus, solange z. B. ein Modal offen ist oder auf Desktop. */
  enabled?: () => boolean;
}

/**
 * Svelte-Action: `<div use:swipeNav={{ onBack, onForward }}>`.
 *
 * Nur `touch*` — eine Maus zieht auf Desktop nicht „zurück" (dort trägt das
 * Tastenkürzel), und ein Pointer-Handler auf derselben Fläche machte aus jedem
 * Textmarkieren eine Navigation.
 */
export function swipeNav(node: HTMLElement, options: SwipeNavOptions) {
  let opts = options;
  let x0 = 0;
  let y0 = 0;
  let t0 = 0;
  let aktiv = false;

  function start(e: TouchEvent) {
    if (e.touches.length !== 1) return; // Pinch/Zwei-Finger gehören dem Inhalt
    if (opts.enabled && !opts.enabled()) return;
    // Beim START prüfen, nicht beim Ende: wer im Editor loswischt, meint den Editor —
    // auch wenn der Finger darüber hinausfährt.
    if (wischGesperrt(e.target)) return;
    const t = e.touches[0];
    x0 = t.clientX;
    y0 = t.clientY;
    t0 = Date.now();
    aktiv = true;
  }

  function end(e: TouchEvent) {
    if (!aktiv) return;
    aktiv = false;
    const t = e.changedTouches[0];
    if (!t) return;
    const richtung = swipeDirection({ dx: t.clientX - x0, dy: t.clientY - y0, elapsedMs: Date.now() - t0 });
    if (richtung === 'right') opts.onBack();
    else if (richtung === 'left') opts.onForward();
  }

  function cancel() {
    aktiv = false;
  }

  node.addEventListener('touchstart', start, { passive: true });
  node.addEventListener('touchend', end, { passive: true });
  node.addEventListener('touchcancel', cancel, { passive: true });

  return {
    update(next: SwipeNavOptions) {
      opts = next;
    },
    destroy() {
      node.removeEventListener('touchstart', start);
      node.removeEventListener('touchend', end);
      node.removeEventListener('touchcancel', cancel);
    },
  };
}
