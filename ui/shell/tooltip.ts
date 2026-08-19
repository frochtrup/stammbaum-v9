// ui/shell/tooltip.ts — geteilter Tooltip als Svelte-Action (`use:tooltip={text}`), INV-UI-4.
// EIN Mechanismus für alle bisher nativen `title`-Tooltips (Quellen-Pille, Koordinaten-Glyph …).
//
// Warum kein natives `title` mehr (ADR-v9-86 Nachtrag): der native Tooltip erscheint auf
// Touch/iPad GAR NICHT (kein Hover) und auf dem Desktop nur verzögert/unzuverlässig. Diese
// Action zeigt sofort — bei Hover UND Tastatur-Fokus (Desktop/A11y) und per Long-Press (Touch).
//
// AUF `Element` TYPISIERT, nicht auf `HTMLElement`: die Action benutzt ausschließlich
// `addEventListener` und `getBoundingClientRect`, die jedes Element hat — und die
// imperativen SVG-Inseln hängen sie an Pfade/Kreise (Fächer-Segmente). Eine engere
// Signatur hätte dort einen Cast erzwungen, also eine Behauptung statt einer Prüfung.
//
// Positionierung: EINE gemeinsame Blase (`position: fixed`, an <body> gehängt) — umgeht damit
// jedes `overflow:auto` eines Vorfahren (z. B. `.person-detail`), das eine absolut positionierte
// Blase abschneiden würde. Styling: `.stb-tooltip` in design-system.css (global, weil die Blase
// außerhalb jeder Svelte-Scope-Grenze im <body> lebt).
import type { Action } from 'svelte/action';

let bubble: HTMLDivElement | null = null;
let activeNode: Element | null = null;

function ensureBubble(): HTMLDivElement {
  if (bubble) {
    // Falls der <body> zwischenzeitlich neu aufgebaut wurde (die Blase also abgehängt ist),
    // wieder einhängen — sonst zeigte die Action ins Leere.
    if (!bubble.isConnected) document.body.appendChild(bubble);
    return bubble;
  }
  const el = document.createElement('div');
  el.className = 'stb-tooltip';
  el.setAttribute('role', 'tooltip');
  el.setAttribute('aria-hidden', 'true');
  el.style.position = 'fixed';
  el.style.visibility = 'hidden';
  el.style.opacity = '0';
  document.body.appendChild(el);
  bubble = el;
  // EIN globaler Scroll-/Resize-Listener (nicht pro Knoten) — so bleiben die node-lokalen
  // Listener die einzigen pro Trigger und werden mit dem Knoten weggeräumt (leak-sicher
  // auch für imperative Inseln, die Knoten bei jedem Re-Render neu aufbauen).
  window.addEventListener('scroll', () => hide(), true);
  window.addEventListener('resize', () => hide());
  return el;
}

function position(node: Element, el: HTMLDivElement): void {
  const r = node.getBoundingClientRect();
  const bw = el.offsetWidth;
  const bh = el.offsetHeight;
  const margin = 6;
  let top = r.top - bh - margin; // bevorzugt oberhalb
  if (top < margin) top = r.bottom + margin; // sonst unterhalb
  let left = r.left + r.width / 2 - bw / 2; // horizontal zentriert
  left = Math.max(margin, Math.min(left, window.innerWidth - bw - margin));
  el.style.top = `${Math.round(top)}px`;
  el.style.left = `${Math.round(left)}px`;
}

function showFor(node: Element, text: string): void {
  if (!text) return;
  const el = ensureBubble();
  el.textContent = text;
  activeNode = node;
  // erst unsichtbar rendern (für die Größen-Messung), dann positionieren und einblenden
  el.style.visibility = 'hidden';
  el.style.opacity = '0';
  position(node, el);
  el.style.visibility = 'visible';
  el.style.opacity = '1';
}

function hide(node?: Element): void {
  if (node && activeNode !== node) return;
  activeNode = null;
  if (!bubble) return;
  bubble.style.visibility = 'hidden';
  bubble.style.opacity = '0';
}

const LONG_PRESS_MS = 400;
const TOUCH_AUTOHIDE_MS = 2500;

export const tooltip: Action<Element, string | undefined> = (node, text) => {
  let current = text ?? '';
  let lpTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let lpFired = false;

  const onEnter = (): void => showFor(node, current);
  const onLeave = (): void => hide(node);
  const onFocus = (): void => showFor(node, current);
  const onBlur = (): void => hide(node);

  const clearLp = (): void => {
    if (lpTimer) {
      clearTimeout(lpTimer);
      lpTimer = undefined;
    }
  };

  const onTouchStart = (): void => {
    lpFired = false;
    clearLp();
    lpTimer = setTimeout(() => {
      lpFired = true;
      showFor(node, current);
    }, LONG_PRESS_MS);
  };
  // `Event` statt `TouchEvent`: die Touch-Ereignisse stehen nicht in `ElementEventMap`
  // (nur in der von HTMLElement), und gebraucht wird hier ohnehin nur `preventDefault`.
  const onTouchEnd = (e: Event): void => {
    clearLp();
    if (lpFired) {
      // Long-Press hat den Tooltip gezeigt → den synthetischen Klick (Navigation) unterdrücken
      e.preventDefault();
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => hide(node), TOUCH_AUTOHIDE_MS);
      lpFired = false;
    }
  };
  const onTouchMove = (): void => clearLp(); // Scrollen darf keinen Tooltip auslösen

  node.addEventListener('mouseenter', onEnter);
  node.addEventListener('mouseleave', onLeave);
  node.addEventListener('focus', onFocus);
  node.addEventListener('blur', onBlur);
  node.addEventListener('touchstart', onTouchStart, { passive: true });
  node.addEventListener('touchend', onTouchEnd); // non-passive: darf preventDefault rufen
  node.addEventListener('touchmove', onTouchMove, { passive: true });

  return {
    update(next: string | undefined): void {
      current = next ?? '';
      if (activeNode === node) {
        if (current) showFor(node, current);
        else hide(node);
      }
    },
    destroy(): void {
      clearLp();
      if (hideTimer) clearTimeout(hideTimer);
      node.removeEventListener('mouseenter', onEnter);
      node.removeEventListener('mouseleave', onLeave);
      node.removeEventListener('focus', onFocus);
      node.removeEventListener('blur', onBlur);
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchend', onTouchEnd);
      node.removeEventListener('touchmove', onTouchMove);
      hide(node);
    },
  };
};
