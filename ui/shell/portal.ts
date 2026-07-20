// ui/shell/portal.ts — DER EINE Weg, ein Overlay aus seinen Vorfahren zu befreien
// (BL-85, Spec 21 §6). Zwei Svelte-Actions, eine Datei:
//
//   use:portal          — hängt den Knoten an <body> um (Backdrops, Bottom-Sheets)
//   use:anchoredTo={t}  — dasselbe PLUS Positionierung an einem Trigger (Popover/Menü)
//
// Warum überhaupt: `z-index` reicht nachweislich nicht. Ein Overlay, dessen Vorfahre
// einen Stacking-Context (`position: sticky; z-index: 1`) oder einen Klipp-Context
// (`overflow: auto`) aufspannt, konkurriert nach außen mit dem WERT DES VORFAHREN, nicht
// mit dem eigenen — am laufenden System bis `z-index: 9999` gemessen und wirkungslos
// (ADR-v9-97/98). Beide Fälle verschwinden, sobald der Knoten kein Kind dieses Vorfahren
// mehr ist; genau das tut diese Datei und sonst nichts.
//
// Die Platzierungs-Rechnung liegt bewusst nebenan in `anchor-position.ts` (rein, ohne
// DOM) — hier bleibt nur das Messen und Schreiben.
import { anchorPosition, type Box } from './anchor-position';

/**
 * Hängt den Knoten ans Ende von `<body>` um und räumt ihn beim Zerstören wieder weg.
 *
 * Svelte entfernt beim Unmount nur Knoten, die es selbst im Baum hält; ein umgehängter
 * Knoten muss deshalb hier von Hand entfernt werden — sonst bleibt bei jedem Öffnen ein
 * Backdrop mehr über dem Dokument liegen, unsichtbar, aber klickfangend.
 */
export function portal(node: HTMLElement) {
  document.body.appendChild(node);
  return {
    destroy() {
      node.remove();
    },
  };
}

/**
 * Portaliert den Knoten UND positioniert ihn an `trigger`.
 *
 * Neu gemessen wird bei jedem Scroll und jeder Größenänderung — ein Popover, das beim
 * Scrollen an seiner alten Stelle stehen bleibt, zeigt auf nichts mehr. `scroll` mit
 * `capture: true`, weil die relevante Bewegung in einem inneren Scroll-Container
 * stattfindet (`.person-detail`), nicht am Fenster; ohne Capture-Phase sähe der Listener
 * genau die Bewegung nicht, die das Problem verursacht.
 *
 * Die Koordinaten landen als CSS-Variablen auf dem Knoten, nicht als `top`/`left`. So
 * entscheidet weiterhin das Stylesheet, OB angedockt wird — `FilterBar` nutzt sie nur
 * im Desktop-Zweig und bleibt auf Mobil ein Bottom-Sheet, ohne dass der Breakpoint ein
 * zweites Mal in JavaScript stünde.
 */
export function anchoredTo(node: HTMLElement, trigger: HTMLElement | undefined) {
  let current = trigger;
  document.body.appendChild(node);

  function place() {
    if (!current) return;
    const t = current.getBoundingClientRect();
    const p = node.getBoundingClientRect();
    const box: Box = { top: t.top, left: t.left, width: t.width, height: t.height };
    const { top, left, placement } = anchorPosition({
      trigger: box,
      panel: { width: p.width, height: p.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
    node.style.setProperty('--stb-anchor-top', `${top}px`);
    node.style.setProperty('--stb-anchor-left', `${left}px`);
    node.dataset.placement = placement;
  }

  place();
  window.addEventListener('scroll', place, true);
  window.addEventListener('resize', place);

  return {
    update(next: HTMLElement | undefined) {
      current = next;
      place();
    },
    destroy() {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      node.remove();
    },
  };
}
