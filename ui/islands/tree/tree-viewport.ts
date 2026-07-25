// ui/islands/tree/tree-viewport.ts — geteilte, framework-freie Viewport-Primitive für
// die imperativen Baum-Inseln (Sanduhr/Nachkommen/Fächer, ADR-v9-123, Spec 21 §8).
//
// Besitzt EINMAL, was jede der drei Inseln braucht (INV-UI-4, statt je Insel neu):
// das DOM-Gerüst (`.tree-island__scroll/__wrap/__svg`), den Vollbild-Schalter INNERHALB
// der Insel (BL-95), Drag-Pan (Desktop), Pinch-Zoom (Touch, 0.3×–3×), Auto-Fit-
// Zentrierung, Escape-Ausgang und den Tastatur-Dispatch über generische `navTargets`
// (↑ Vater · Shift+↑ Mutter · ↓ erstes Kind · → Partner). Reduced-Motion wird als
// geteilter Lese-Punkt an die Insel durchgereicht (Spec 21 §6i: EIN Check, von allen
// gemeinsam gelesen), nicht pro Insel neu abgefragt.
//
// Jede Insel liefert nur eine `draw(ctx)`-Funktion: sie zeichnet ihre Karten/Segmente in
// die gestellten Flächen (`ctx.wrap`/`ctx.svg`) und gibt ihr Layout-Modell (Maße/Zentrum/
// navTargets) zurück. Die Kartenform bleibt inselspezifisch (Rechteck-Divs bei den
// Bäumen, Arc-Paths beim Fächer) — der Viewport ist formagnostisch. Bei jeder
// (Re-)Zentrierung/Zoom/Resize: kompletter Neu-Aufbau (kein Fein-Diffing, Spec 02 §5).
import type { PersonId } from '../../../core/model/types';
import { prefersReducedMotion } from '../shared/reduced-motion';

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 3;
const SVG_NS = 'http://www.w3.org/2000/svg';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Tastaturnavigationsziele (Spec 20 §1.3: Pfeiltasten zwischen Fokuspersonen). */
export interface DiagramNavTargets {
  up: PersonId | null;
  up2: PersonId | null;
  down: PersonId | null;
  right: PersonId | null;
}

/** Das reine Modell, das eine Insel-`draw()` zurückgibt — nur was der Viewport für Maße,
 *  Auto-Fit-Zentrierung und Tastaturnavigation braucht (nicht die Karten selbst). */
export interface DiagramLayoutFrame {
  width: number;
  height: number;
  /** X-Zentrum + Y der Fokus-Karte (für Auto-Fit/Scroll-Zentrierung). */
  centerX: number;
  centerY: number;
  navTargets: DiagramNavTargets;
}

/** Zeichen-Kontext, den der Viewport an die Insel-`draw()` reicht. */
export interface DrawContext {
  /** Absolut positionierte Karten-Ebene (px). */
  wrap: HTMLElement;
  /** Linien-/Segment-Ebene (Layout-Koordinaten). */
  svg: SVGSVGElement;
  /** Hoch-/Querformat (vom Viewport gemessen, in Tests erzwingbar). */
  portrait: boolean;
  /** true, wenn die letzte Zeigergeste ein Drag war → Klick auf einer Karte unterdrücken. */
  shouldSuppressClick(): boolean;
  /** EIN geteilter Reduced-Motion-Lesepunkt (Spec 21 §6i) — die Insel fragt NICHT selbst
   *  `matchMedia` ab, sondern liest ihn hier (für animierte Übergänge/Ringe künftiger Inseln). */
  reducedMotion: boolean;
}

export interface TreeViewportOptions {
  /** Erzwingt Portrait/Landscape statt Container-Maße zu messen (v. a. für Tests). */
  portrait?: boolean;
  /** Pfeiltasten-Navigation zwischen Fokuspersonen (↑/↓/→). */
  onNavigate: (id: PersonId) => void;
}

export interface TreeViewportHandle {
  /** Kompletter Neu-Aufbau: ruft `draw()`, richtet Maße/Zoom/Zentrierung ein. */
  render(): void;
  /** Vollbild umschalten (State-Klasse auf dem Container, Spec 21 §3). */
  toggleFullscreen(): void;
  /** Aktueller Vollbild-Zustand — der Viewport ist die einzige Quelle dafür. */
  readonly isFullscreen: boolean;
  /** Die gestellten Zeichenflächen (für Inseln, die außerhalb von `draw()` etwas anhängen). */
  readonly wrap: HTMLElement;
  readonly svg: SVGSVGElement;
  /** Listener entfernen, DOM leeren. */
  destroy(): void;
}

/**
 * Erzeugt einen Baum-Insel-Viewport in `container`. Framework-freies Vanilla-DOM/SVG;
 * alle Gesten-/Tastatur-Listener werden in `destroy()` wieder entfernt (kein Leck bei
 * wiederholtem Mount/Unmount, z. B. Svelte-Komponenten-Wechsel).
 */
export function createTreeViewport(
  container: HTMLElement,
  options: TreeViewportOptions,
  draw: (ctx: DrawContext) => DiagramLayoutFrame | null,
): TreeViewportHandle {
  let zoomScale = 1;
  let fullscreen = false;
  let lastFrame: DiagramLayoutFrame | null = null;

  // ── Container-Grundgerüst (einmalig) ──
  container.classList.add('tree-island');

  // Der Vollbild-Schalter gehört IN die Insel, nicht in die Lens-Kopfzeile darüber
  // (BL-95): `.tree-island--fullscreen` ist `position: fixed; inset: 0; z-index: 500` und
  // legt sich über Kopfzeile UND Bottom-Nav — ein Schalter außerhalb wäre im Vollbild
  // unerreichbar. Ein Schalter INNERHALB wandert mit ins Vollbild und bleibt bedienbar.
  // Escape verlässt zusätzlich das Vollbild (ein Modus braucht mehr als einen Ausgang).
  const fsBtn = document.createElement('button');
  fsBtn.type = 'button';
  fsBtn.className = 'tree-island__fs-btn';
  const setFsLabel = (): void => {
    fsBtn.textContent = fullscreen ? '⤡ Vollbild beenden' : '⤢ Vollbild';
    fsBtn.setAttribute('aria-pressed', String(fullscreen));
  };

  const scrollEl = document.createElement('div');
  scrollEl.className = 'tree-island__scroll';
  const wrapEl = document.createElement('div');
  wrapEl.className = 'tree-island__wrap';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'tree-island__svg');
  wrapEl.appendChild(svg);
  scrollEl.appendChild(wrapEl);
  container.innerHTML = '';
  container.appendChild(scrollEl);
  container.appendChild(fsBtn); // NACH dem Scroll-Layer: liegt darüber, ohne z-index-Turnen

  function detectPortrait(): boolean {
    if (options.portrait != null) return options.portrait;
    return container.clientWidth > 0 && container.clientHeight > 0
      ? container.clientWidth < container.clientHeight
      : false;
  }

  function applyZoom(): void {
    wrapEl.style.transform = zoomScale !== 1 ? `scale(${zoomScale})` : '';
    wrapEl.style.transformOrigin = '0 0';
  }

  function render(): void {
    const portrait = detectPortrait();
    // Portrait: kein Zoom (Orakel-Verhalten) — vor draw zurücksetzen, damit die
    // Auto-Fit-Skalierung (die im Portrait bewusst nicht greift) keinen alten
    // Landscape-Zoom stehen lässt.
    if (portrait) zoomScale = 1;

    const frame = draw({
      wrap: wrapEl,
      svg,
      portrait,
      shouldSuppressClick: () => dragMoved,
      reducedMotion: prefersReducedMotion(),
    });
    if (!frame) return;
    lastFrame = frame;

    wrapEl.style.width = `${frame.width}px`;
    wrapEl.style.height = `${frame.height}px`;
    svg.setAttribute('width', String(frame.width));
    svg.setAttribute('height', String(frame.height));
    svg.setAttribute('viewBox', `0 0 ${frame.width} ${frame.height}`);

    applyZoom();
    autoFitAndCenter(frame);
  }

  function autoFitAndCenter(frame: DiagramLayoutFrame): void {
    // Desktop Auto-Fit (Spec 20 §1.3 [K]): initial so skalieren, dass der Baum ins
    // Viewport passt. rAF statt Timeout, damit Layout/Größe vom Browser committed ist.
    requestAnimationFrame(() => {
      const cw = scrollEl.clientWidth;
      const ch = scrollEl.clientHeight;
      if (cw > 0 && ch > 0 && !detectPortrait()) {
        const fit = Math.min(1, cw / frame.width, ch / frame.height);
        if (fit > 0 && fit < 1) {
          zoomScale = Math.round(fit * 100) / 100;
          applyZoom();
        }
      }
      if (cw > 0 && ch > 0) {
        scrollEl.scrollLeft = Math.max(0, frame.centerX * zoomScale - cw / 2);
        scrollEl.scrollTop = Math.max(0, frame.centerY * zoomScale - ch * 0.4);
      }
    });
  }

  function setFullscreen(next: boolean): void {
    if (fullscreen === next) return;
    fullscreen = next;
    container.classList.toggle('tree-island--fullscreen', fullscreen);
    setFsLabel();
    render();
  }

  fsBtn.addEventListener('click', () => setFullscreen(!fullscreen));
  setFsLabel();

  // ── Drag-to-Pan (Desktop) ──
  let dragState: { x: number; y: number; sl: number; st: number } | null = null;
  let dragMoved = false;
  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    dragState = { x: e.clientX, y: e.clientY, sl: scrollEl.scrollLeft, st: scrollEl.scrollTop };
    dragMoved = false;
  };
  const onMouseMove = (e: MouseEvent) => {
    if (!dragState) return;
    const dx = e.clientX - dragState.x;
    const dy = e.clientY - dragState.y;
    if (!dragMoved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
    dragMoved = true;
    scrollEl.scrollLeft = dragState.sl - dx;
    scrollEl.scrollTop = dragState.st - dy;
  };
  const onMouseUp = () => {
    if (!dragState) return;
    dragState = null;
    if (dragMoved) setTimeout(() => (dragMoved = false), 0);
  };
  scrollEl.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  // ── Pinch-to-Zoom (Touch, 2 Finger; Bereich 0.3×–3×, Spec 20 §1.3 [K]) ──
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      pinchStartDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      pinchStartScale = zoomScale;
      e.preventDefault();
    }
  };
  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length !== 2 || !pinchStartDist) return;
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY,
    );
    zoomScale = clamp(pinchStartScale * (dist / pinchStartDist), ZOOM_MIN, ZOOM_MAX);
    applyZoom();
    e.preventDefault();
  };
  const onTouchEnd = (e: TouchEvent) => {
    if (e.touches.length < 2) pinchStartDist = 0;
  };
  scrollEl.addEventListener('touchstart', onTouchStart, { passive: false });
  scrollEl.addEventListener('touchmove', onTouchMove, { passive: false });
  scrollEl.addEventListener('touchend', onTouchEnd);

  // ── Tastaturnavigation (Spec 20 §1.3 [K]) ──
  // Registriert auf `document` (Orakel: legacy-v8 `_initTreeKeys()` — globaler Listener,
  // gültig solange die Insel gemountet ist), NICHT auf `container`: die Insel verlangt
  // keinen expliziten DOM-Fokus auf einer Karte, bevor Pfeiltasten greifen (nur „ist ein
  // Eingabefeld fokussiert" schließt aus). ArrowLeft = History-Back ist Sache der Schale.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.key === 'Escape' && fullscreen) {
      e.preventDefault();
      setFullscreen(false);
      return;
    }
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable))
      return;
    if (!lastFrame) return;
    const t = lastFrame.navTargets;
    if (e.key === 'ArrowUp') {
      const target = e.shiftKey ? t.up2 : t.up;
      if (target) {
        e.preventDefault();
        options.onNavigate(target);
      }
    } else if (e.key === 'ArrowDown') {
      if (t.down) {
        e.preventDefault();
        options.onNavigate(t.down);
      }
    } else if (e.key === 'ArrowRight') {
      if (t.right) {
        e.preventDefault();
        options.onNavigate(t.right);
      }
    }
  };
  document.addEventListener('keydown', onKeyDown);

  // ── Resize (Orientierungswechsel: Portrait <-> Landscape neu zeichnen) ──
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  const onResize = () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => render(), 250);
  };
  window.addEventListener('resize', onResize);

  return {
    render,
    toggleFullscreen() {
      setFullscreen(!fullscreen);
    },
    get isFullscreen() {
      return fullscreen;
    },
    get wrap() {
      return wrapEl;
    },
    get svg() {
      return svg;
    },
    destroy() {
      scrollEl.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      scrollEl.removeEventListener('touchstart', onTouchStart);
      scrollEl.removeEventListener('touchmove', onTouchMove);
      scrollEl.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      if (resizeTimer) clearTimeout(resizeTimer);
      container.innerHTML = '';
      container.classList.remove('tree-island', 'tree-island--fullscreen');
    },
  };
}
