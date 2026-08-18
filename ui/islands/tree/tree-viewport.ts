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

/**
 * Der Generationen-Regler EINER Insel (BL-368). Die Spanne und ihre Beschriftung sind
 * inselspezifisch und bleiben es: die Sanduhr zählt Ebenen ÜBER dem Zentrum, Nachkommen
 * und Fächer zählen Generationen — ein gemeinsames Wort wäre gelogen. Der Viewport
 * rendert nur, was hier steht; er kennt weder `TreeModeId` noch die Spannen (INV-ARCH-1).
 */
export interface DiagramGenerationsControl {
  /** Zugänglicher Name des Reglers, z. B. „Generationen" / „Vorfahren-Ebenen". */
  caption: string;
  /** Der EFFEKTIV gezeichnete Wert — was der Regler zeigt, ist das, was zu sehen ist. */
  value: number;
  /** Wählbare Stufen mit sprechender Beschriftung, aufsteigend. */
  options: readonly { value: number; label: string }[];
}

/** Das reine Modell, das eine Insel-`draw()` zurückgibt — nur was der Viewport für Maße,
 *  Auto-Fit-Zentrierung, Tastaturnavigation und die Überlagerung braucht (nicht die
 *  Karten selbst). */
export interface DiagramLayoutFrame {
  width: number;
  height: number;
  /** X-Zentrum + Y der Fokus-Karte (für Auto-Fit/Scroll-Zentrierung). */
  centerX: number;
  centerY: number;
  navTargets: DiagramNavTargets;
  /**
   * Person, auf die „★ Zentrieren" zurückführt (BL-367) — `null` blendet den Knopf aus.
   * Die Inseln setzen ihn auf den Probanden, SOLANGE er nicht schon das Zentrum ist: ein
   * Knopf, der nichts täte, wäre ein wirkungsloser Wiederhol-Klick (dieselbe Erwägung wie
   * „★ Proband" statt eines zweiten „Als Proband setzen", ADR-v9-140 (d)).
   * Bewusst der Frame und kein eigener Options-Pfad: er ist der Kanal, den jede Insel je
   * Zeichnung ohnehin befüllt.
   */
  homeTarget: PersonId | null;
  /** Generationen-Regler dieser Insel; `null` blendet ihn aus. */
  generations: DiagramGenerationsControl | null;
}

/**
 * Baut die Stufenliste eines Generationen-Reglers. EIN Bauhelfer für alle drei Inseln
 * (INV-UI-4) — sie unterscheiden sich nur in Spanne und Beschriftung, nicht in der Form.
 */
export function generationOptions(
  min: number,
  max: number,
  label: (n: number) => string,
): { value: number; label: string }[] {
  const out: { value: number; label: string }[] = [];
  for (let n = min; n <= max; n++) out.push({ value: n, label: label(n) });
  return out;
}

/**
 * Ziel für „★ Zentrieren": der Proband, solange er nicht schon das Zentrum ist.
 * Eine Regel, von allen drei Inseln gelesen — sonst beantwortete jede die Frage „wann ist
 * der Knopf sinnvoll?" für sich, und die Antworten drifteten auseinander.
 */
export function homeTargetFor(probandId: PersonId | null, centerId: PersonId | null): PersonId | null {
  return probandId && probandId !== centerId ? probandId : null;
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
  /** Pfeiltasten-Navigation zwischen Fokuspersonen (↑/↓/→) UND „★ Zentrieren" — ein
   *  Rückkanal für „zeige mir jetzt diese Person", nicht zwei. */
  onNavigate: (id: PersonId) => void;
  /** Der Nutzer hat eine andere Generationenzahl gewählt (BL-368). Die Insel hält den Wert
   *  NICHT selbst — die Schale legt ihn ab und reicht ihn über `update()` zurück, damit es
   *  genau eine Wahrheit gibt. */
  onGenerationsChange?: (n: number) => void;
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

  // ÜBERLAGERUNG: alle Bedienelemente der Insel in EINEM Streifen (BL-367/368).
  //
  // Warum sie IN der Insel liegen und nicht in der Modus-Zeile darüber — dasselbe
  // Argument, mit dem BL-95 schon den Vollbild-Schalter hierher geholt hat:
  // `.tree-island--fullscreen` ist `position: fixed; inset: 0; z-index: 500` und legt sich
  // über Kopfzeile UND Bottom-Nav. Alles außerhalb wäre im Vollbild unerreichbar — also
  // genau in dem Modus, in dem man am ehesten die Orientierung verliert und am ehesten
  // mehr Generationen sehen will. Zweitens war in der Modus-Zeile bei 375px kein Platz
  // (351px nutzbar, ~322px belegt — weniger als ein Tap-Ziel frei), und drittens berührt
  // die Überlagerung damit das Befehlsflächen-Budget des Kopfbereichs nicht (INV-UI-11).
  //
  // EIN Wrapper statt dreier absolut gesetzter Knöpfe: die Vollbild-Safe-Area-Regel wird
  // dadurch einmal gepflegt, nicht je Element (INV-UI-4).
  const overlayEl = document.createElement('div');
  overlayEl.className = 'tree-island__overlay';

  // Generationen-Regler (BL-368). Natives `<select>` — dieselbe Bauform wie die
  // Ast-Ebenen-Wahl im Dashboard (ADR-v9-167), nur imperativ statt in Svelte. Er trägt
  // seinen Namen als `aria-label`, weil ein sichtbares Label in der Überlagerung Platz
  // über dem Diagramm kostete, den es nicht wert ist.
  const genSel = document.createElement('select');
  genSel.className = 'tree-island__gen-sel';
  genSel.hidden = true;
  /** Signatur der aktuell gerenderten Stufen — nur bei Änderung neu aufbauen. */
  let genSig = '';
  genSel.addEventListener('change', () => {
    options.onGenerationsChange?.(Number(genSel.value));
  });

  // „★ Zentrieren" (BL-367): zurück auf den Probanden, OHNE die Lens zu verlassen.
  // Bewusst nicht „Zum Probanden" — so heißt der Palette-Befehl, und der hat ein anderes
  // Ziel (den Steckbrief). Gleiche Wörter für zwei Ziele wären INV-UI-2.
  const homeBtn = document.createElement('button');
  homeBtn.type = 'button';
  homeBtn.className = 'tree-island__home-btn';
  homeBtn.textContent = '★ Zentrieren';
  homeBtn.setAttribute('aria-label', 'Auf den Probanden zentrieren');
  homeBtn.hidden = true;

  // Escape verlässt zusätzlich das Vollbild (ein Modus braucht mehr als einen Ausgang).
  const fsBtn = document.createElement('button');
  fsBtn.type = 'button';
  fsBtn.className = 'tree-island__fs-btn';
  const setFsLabel = (): void => {
    fsBtn.textContent = fullscreen ? '⤡ Vollbild beenden' : '⤢ Vollbild';
    fsBtn.setAttribute('aria-pressed', String(fullscreen));
  };
  overlayEl.append(genSel, homeBtn, fsBtn);

  const scrollEl = document.createElement('div');
  scrollEl.className = 'tree-island__scroll';
  // Zwischen-Ebene mit der SKALIERTEN Grundfläche (Orakel: v8 `treeScaleWrap`): `wrapEl`
  // wird per `transform: scale` verkleinert, was seine Layout-Box NICHT schrumpft — der
  // Scroll-Container würde also die unskalierte Breite messen und den Inhalt weder korrekt
  // scrollen noch zentrieren können. `scaleWrapEl` trägt die tatsächliche (skalierte) Größe
  // und wird per Margin mittig gesetzt, wenn der Inhalt kleiner als das Viewport ist.
  const scaleWrapEl = document.createElement('div');
  scaleWrapEl.className = 'tree-island__scale-wrap';
  const wrapEl = document.createElement('div');
  wrapEl.className = 'tree-island__wrap';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'tree-island__svg');
  wrapEl.appendChild(svg);
  scaleWrapEl.appendChild(wrapEl);
  scrollEl.appendChild(scaleWrapEl);
  container.innerHTML = '';
  container.appendChild(scrollEl);
  container.appendChild(overlayEl); // NACH dem Scroll-Layer: liegt darüber, ohne z-index-Turnen

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

  /** Setzt NUR die skalierte Grundfläche des `scaleWrap` (= sichtbare Größe nach dem
   *  `transform: scale` des `wrap`). Die Zentrierung selbst macht CSS (`margin: auto` im
   *  Flex-`scroll`): passt der Inhalt, ist er mittig; ist er größer, wird `margin:auto` zu 0
   *  und der Container scrollt vom Anfang an — deklarativ, ohne rAF-Timing. */
  function sizeContent(frame: DiagramLayoutFrame): void {
    scaleWrapEl.style.width = `${Math.round(frame.width * zoomScale)}px`;
    scaleWrapEl.style.height = `${Math.round(frame.height * zoomScale)}px`;
  }

  /**
   * Zieht die Überlagerung an dem nach, was die Insel gerade gezeichnet hat.
   *
   * Der `<select>` wird NUR bei geänderten Stufen neu aufgebaut (Modus-Wechsel), sonst
   * bekommt er bloß seinen Wert gesetzt: `render()` läuft auch bei Resize, Zoom und
   * Vollbild-Wechsel, und ein jedes Mal neu aufgebautes Feld verlöre mitten in der
   * Bedienung den Fokus. `select.value = …` löst kein `change` aus — keine Rückkopplung.
   */
  function syncOverlay(frame: DiagramLayoutFrame): void {
    homeBtn.hidden = frame.homeTarget === null;

    const gen = frame.generations;
    genSel.hidden = gen === null;
    if (!gen) {
      genSig = '';
      return;
    }
    genSel.setAttribute('aria-label', gen.caption);
    const sig = gen.options.map((o) => `${o.value}:${o.label}`).join('|');
    if (sig !== genSig) {
      genSig = sig;
      genSel.innerHTML = '';
      for (const o of gen.options) {
        const opt = document.createElement('option');
        opt.value = String(o.value);
        opt.textContent = o.label;
        genSel.appendChild(opt);
      }
    }
    genSel.value = String(gen.value);
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
    syncOverlay(frame);

    wrapEl.style.width = `${frame.width}px`;
    wrapEl.style.height = `${frame.height}px`;
    svg.setAttribute('width', String(frame.width));
    svg.setAttribute('height', String(frame.height));
    svg.setAttribute('viewBox', `0 0 ${frame.width} ${frame.height}`);
    applyZoom();
    sizeContent(frame); // sofort korrekt zentriert (CSS margin:auto), auch vor dem Auto-Fit
    scheduleReflow();
  }

  /** Wartet frameweise, bis der Container tatsächlich eine Größe hat, dann Auto-Fit. Nötig,
   *  weil ein Modus-Wechsel (destroy+remount im selben Svelte-Flush) den Container für einen
   *  Frame auf 0 kollabieren lässt — ein einzelner rAF misst dann `cw=0` und der Baum bliebe
   *  unskaliert. Gedeckelt, damit eine dauerhaft unsichtbare Insel nicht endlos pollt. */
  function scheduleReflow(attempt = 0): void {
    requestAnimationFrame(() => {
      if (scrollEl.clientWidth <= 0 && attempt < 10) {
        scheduleReflow(attempt + 1);
        return;
      }
      reflow();
    });
  }

  /** Auto-Fit (Desktop, Spec 20 §1.3 [K]): skaliert einen zu großen Baum herunter, bis er ins
   *  Viewport passt. Idempotent: `fit` bemisst sich an der UNSKALIERTEN `frame`-Breite. Die
   *  Zentrierung macht CSS — hier wird nach dem Zoom nur die Grundfläche nachgezogen. */
  function reflow(): void {
    if (!lastFrame) return;
    const cw = scrollEl.clientWidth;
    const ch = scrollEl.clientHeight;
    if (cw <= 0 || ch <= 0) return;
    if (!detectPortrait()) {
      const fit = Math.min(1, cw / lastFrame.width, ch / lastFrame.height);
      // ABRUNDEN, nicht runden: Aufrunden (0,406 → 0,41) macht den Inhalt minimal größer als
      // das Viewport und erzeugt einen 1–2px-Überlauf, der die margin:auto-Zentrierung kippt.
      zoomScale = fit < 1 ? Math.floor(fit * 100) / 100 : 1;
      applyZoom();
    }
    sizeContent(lastFrame);
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

  homeBtn.addEventListener('click', () => {
    const target = lastFrame?.homeTarget;
    if (target) options.onNavigate(target);
  });

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

  // Container-Größe kann sich unabhängig vom Fenster ändern (Modus-Wechsel, Sidebar,
  // verzögerter Layout-Commit) — dann NUR neu einpassen/zentrieren (kein Layout-Neubau).
  // Beobachtet den Container (nicht `scrollEl`), dessen Größe unabhängig vom Inhalt ist —
  // so kann eine durch `positionContent` ausgelöste Scrollleiste keine Rückkopplung erzeugen.
  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => reflow()) : null;
  resizeObserver?.observe(container);

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
      resizeObserver?.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
      container.innerHTML = '';
      container.classList.remove('tree-island', 'tree-island--fullscreen');
    },
  };
}
