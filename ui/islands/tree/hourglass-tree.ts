// ui/islands/tree/hourglass-tree.ts — imperative SVG-Insel Sanduhr-Baum
// (Spec 02 §5, Spec 20 §1.3 [K]). Framework-freies Vanilla-JS in einem von der
// reaktiven Schale gestellten Container. Rechnet NUR aus dem Modell (computeTreeLayout,
// tree-layout.ts) — nie aus dem Live-DOM. Bei Rezentrierung/Zoom/Resize: kompletter
// Neu-Aufbau (kein Fein-Diffing, kein Framework-Reconciler, Spec 02 §5).
//
// Die Insel ruft nach oben ausschließlich über Callbacks (`onSelect`, `onSelectFamily`) —
// sie greift NICHT selbst auf ViewState/Kommandos zu (INV-ARCH-1-analoge Regel für
// Inseln, Auftrag "Nur über Callbacks nach oben").
import type { Database, PersonId } from '../../../core/model/types';
import { computeTreeLayout, type TreeLayoutResult } from './tree-layout';
// Geteilter Tooltip (INV-UI-12/ADR-v9-87): hier IMPERATIV aufgerufen (kein Svelte-`use:`),
// da die Insel framework-frei ist. `tooltip.ts` ist zur Laufzeit reines DOM (nur Typ-Import
// aus svelte/action, erased) — INV-ARCH bleibt gewahrt. Kollisionsfrei mit Pan/Pinch: jede
// Bewegung bricht den Long-Press ab; `touchmove` ist passiv; `touchend`-preventDefault feuert
// nur nach stationärem Long-Press. Kein destroy nötig — Karten werden je Render neu gebaut,
// die Listener sterben mit dem entfernten Knoten (ein globaler Scroll-Listener, kein pro-Knoten).
import { tooltip } from '../../shell/tooltip';
import { displayNameOr } from '../../shell/person-display';

export interface TreeMountCallbacks {
  /** Klick auf eine Ahnen-/Ehepartner-/Kind-Karte -> Rezentrierung auf diese Person. */
  onSelect: (id: PersonId) => void;
  /** Klick auf die Zentrum-Karte -> Detailansicht öffnen (kein Rezentrieren). */
  onSelectCenter?: (id: PersonId) => void;
  /** Klick auf den ⚭-Badge zwischen Proband und aktivem Ehepartner. */
  onSelectFamily?: (familyId: string) => void;
}

export interface TreeMountOptions {
  /** Erzwingt Portrait/Landscape statt Container-Maßen zu messen (v. a. für Tests). */
  portrait?: boolean;
  maxAncestorLevels?: number;
}

export interface TreeIslandHandle {
  /** Neu zentrieren auf eine andere Person — kompletter Neu-Aufbau. */
  update(personId: PersonId, options?: TreeMountOptions): void;
  /** Vollbild-Zustand umschalten (State-Klasse auf dem Container, Spec 21 §3).
   *  Die Insel trägt ihren eigenen Schalter (BL-95); dieser Weg bleibt für Tests und
   *  künftige Tastenkürzel. */
  toggleFullscreen(): void;
  /** Aktueller Vollbild-Zustand — die Insel ist die einzige Quelle dafür. */
  readonly isFullscreen: boolean;
  /** Listener entfernen, DOM leeren. */
  destroy(): void;
  /** Aktuell zentrierte Person-ID (für Tests/Diagnose). */
  readonly currentId: PersonId | null;
}

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 3;
const SVG_NS = 'http://www.w3.org/2000/svg';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Mountet die Sanduhr-Insel in `container`. Framework-freies Vanilla-DOM/SVG,
 * Gesten-Listener (Pinch/Drag/Tastatur) direkt auf dem Container-Subbaum registriert
 * und in `destroy()` wieder entfernt (kein Leck bei wiederholtem Mount/Unmount, z. B.
 * Svelte-Komponenten-Wechsel).
 */
export function mountHourglassTree(
  container: HTMLElement,
  db: Database,
  personId: PersonId,
  callbacks: TreeMountCallbacks,
  initialOptions: TreeMountOptions = {},
): TreeIslandHandle {
  let currentId: PersonId | null = null;
  let zoomScale = 1;
  let fullscreen = false;
  let lastLayout: TreeLayoutResult | null = null;

  // ── Container-Grundgerüst (einmalig) ──
  container.classList.add('tree-island');

  // Der Vollbild-Schalter gehört IN die Insel, nicht in die Lens-Kopfzeile darüber
  // (BL-95/Nutzerbefund 2026-07-21). Zwei Gründe, beide gemessen:
  //
  //  1. Er war im Vollbild nicht mehr erreichbar. `.tree-island--fullscreen` ist
  //     `position: fixed; inset: 0; z-index: 500` und legt sich damit über die Kopfzeile
  //     UND über die Bottom-Nav: `elementFromPoint` traf am Knopf `tree-island__wrap`, an
  //     der Navigation `tree-island__scroll` — der Vollbildmodus war eine Einbahnstraße,
  //     verlassbar nur durch Neuladen der Seite. Ein Schalter INNERHALB der Insel wandert
  //     mit ihr ins Vollbild und bleibt bedienbar.
  //  2. Er teilte sich die Zeile mit dem Lens-Umschalter und nahm ihm 79 px, wodurch
  //     „Story" vollständig aus dem Bild rutschte (BL-95).
  //
  // Escape verlässt zusätzlich das Vollbild — dieselbe Erwartung wie bei jedem Overlay
  // (INV-UI-13-Nachbarschaft); ein Modus, den man nur über EINEN Weg wieder los wird, ist
  // genau die Falle, die dieser Umbau beseitigt.
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

  function setFullscreen(next: boolean): void {
    if (fullscreen === next) return;
    fullscreen = next;
    container.classList.toggle('tree-island--fullscreen', fullscreen);
    setFsLabel();
    if (currentId) render(currentId, initialOptions);
  }

  fsBtn.addEventListener('click', () => setFullscreen(!fullscreen));
  setFsLabel();

  function detectPortrait(): boolean {
    if (initialOptions.portrait != null) return initialOptions.portrait;
    return container.clientWidth > 0 && container.clientHeight > 0
      ? container.clientWidth < container.clientHeight
      : false;
  }

  function svgLine(x1: number, y1: number, x2: number, y2: number, dashed: boolean): void {
    const el = document.createElementNS(SVG_NS, 'line');
    el.setAttribute('x1', String(x1));
    el.setAttribute('y1', String(y1));
    el.setAttribute('x2', String(x2));
    el.setAttribute('y2', String(y2));
    el.setAttribute('class', 'tree-island__line' + (dashed ? ' tree-island__line--half' : ''));
    if (dashed) el.setAttribute('stroke-dasharray', '4 3');
    svg.appendChild(el);
  }

  function makeCard(layout: TreeLayoutResult, card: TreeLayoutResult['cards'][number], peekIndex: number): void {
    const div = document.createElement('div');
    div.className =
      'tree-island__card' +
      (card.isCenter ? ' tree-island__card--center' : '') +
      (card.isSibling ? ' tree-island__card--sibling' : '') +
      (card.isHalfSibling ? ' tree-island__card--half' : '') +
      (card.isPeek ? ' tree-island__card--peek' : '');
    div.style.left = `${Math.round(card.x)}px`;
    div.style.top = `${Math.round(card.y)}px`;
    div.style.width = `${card.width}px`;
    div.style.height = `${card.height}px`;
    // Peek-Stapel (Orakel: v8 `zidx = nSibs - i + 5`): jüngere Stapelkarte deckt ältere
    // teilweise ab, jeweils oben auf dem Stapel liegend.
    if (card.isPeek) div.style.zIndex = String(peekIndex + 1);

    if (!card.id) {
      div.classList.add('tree-island__card--empty');
      div.textContent = '?';
      wrapEl.appendChild(div);
      return;
    }

    const person = db.individuals.get(card.id);
    if (!person) return;
    div.dataset.sex = person.sex;
    div.setAttribute('tabindex', '0');
    div.setAttribute('role', 'button');
    div.dataset.personId = card.id;

    const nameEl = document.createElement('div');
    nameEl.className = 'tree-island__name';
    nameEl.textContent = displayNameOr(person, card.id);
    div.appendChild(nameEl);

    const by = (person.birth.date || '').match(/\d{4}/)?.[0];
    const dy = (person.death.date || '').match(/\d{4}/)?.[0];
    const yr = [by ? `*${by}` : '', dy ? `†${dy}` : ''].filter(Boolean).join(' ');
    if (yr) {
      const yrEl = document.createElement('div');
      yrEl.className = 'tree-island__year';
      yrEl.textContent = yr;
      div.appendChild(yrEl);
    }

    if (card.kekule) {
      const kEl = document.createElement('div');
      kEl.className = 'tree-island__kekule';
      tooltip(kEl, `Kekule-Nr. ${card.kekule} (Proband = 1)`);
      kEl.textContent = String(card.kekule);
      div.appendChild(kEl);
    }
    if (card.isHalfSibling) {
      const halfEl = document.createElement('div');
      halfEl.className = 'tree-island__half-badge';
      halfEl.textContent = '½';
      div.appendChild(halfEl);
    }
    if (card.isCenter && layout.marriageCount > 1) {
      const marrEl = document.createElement('div');
      marrEl.className = 'tree-island__marr-badge';
      marrEl.textContent = `⚭ ${layout.marriageCount}`;
      div.appendChild(marrEl);
    }
    if (card.isCenter && layout.siblingCountBadge != null) {
      // Peek-Stapel-Fallback (Orakel: `tree-half-badge--sib-count`, unten-links am
      // Proband-Kartenrand — kein Konflikt mit ⚭/Kekule oben-rechts/oben-links).
      const sibCountEl = document.createElement('div');
      sibCountEl.className = 'tree-island__sib-count-badge';
      tooltip(sibCountEl, `${layout.siblingCountBadge} Geschwister`);
      sibCountEl.textContent = String(layout.siblingCountBadge);
      div.appendChild(sibCountEl);
    }

    const handler = () => {
      if (card.isCenter) {
        callbacks.onSelectCenter?.(card.id!);
      } else {
        callbacks.onSelect(card.id!);
      }
    };
    div.addEventListener('click', () => {
      if (dragMoved) return; // Klick nach Drag unterdrücken (Orakel-Verhalten)
      handler();
    });
    div.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler();
      }
    });
    wrapEl.appendChild(div);
  }

  function applyZoom(): void {
    wrapEl.style.transform = zoomScale !== 1 ? `scale(${zoomScale})` : '';
    wrapEl.style.transformOrigin = '0 0';
  }

  function render(personId: PersonId, options: TreeMountOptions): void {
    const layout = computeTreeLayout(db, personId, {
      portrait: options.portrait ?? detectPortrait(),
      maxAncestorLevels: options.maxAncestorLevels,
    });
    if (!layout) return;
    lastLayout = layout;
    currentId = personId;

    wrapEl.querySelectorAll('.tree-island__card, .tree-island__marr-btn, .tree-island__sib-more').forEach((el) => el.remove());
    svg.innerHTML = '';
    wrapEl.style.width = `${layout.width}px`;
    wrapEl.style.height = `${layout.height}px`;
    svg.setAttribute('width', String(layout.width));
    svg.setAttribute('height', String(layout.height));
    svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);

    for (const c of layout.connectors) svgLine(c.x1, c.y1, c.x2, c.y2, c.dashed);
    let peekIndex = 0;
    for (const card of layout.cards) makeCard(layout, card, card.isPeek ? peekIndex++ : 0);

    if (layout.siblingOverflow) {
      // „…"-Kappungs-Indikator (Orakel: `tree-sib-more`) — Geschwister, die trotz
      // Kartenschrumpfung nicht mehr in die horizontale Zeile passen.
      const overflow = layout.siblingOverflow;
      const morEl = document.createElement('div');
      morEl.className = 'tree-island__sib-more';
      morEl.style.left = `${Math.round(overflow.x)}px`;
      morEl.style.top = `${Math.round(overflow.y)}px`;
      morEl.style.width = `${overflow.width}px`;
      morEl.style.height = `${overflow.height}px`;
      tooltip(morEl, overflow.title);
      morEl.textContent = '…';
      wrapEl.appendChild(morEl);
    }

    if (layout.marriageBadge && callbacks.onSelectFamily) {
      const badge = layout.marriageBadge;
      const btn = document.createElement('div');
      btn.className = 'tree-island__marr-btn';
      btn.style.left = `${Math.round(badge.x)}px`;
      btn.style.top = `${Math.round(badge.y)}px`;
      btn.style.width = `${Math.round(badge.width)}px`;
      btn.style.height = `${Math.round(badge.height)}px`;
      tooltip(btn, 'Familie öffnen');
      btn.textContent = '⚭';
      btn.addEventListener('click', () => callbacks.onSelectFamily!(badge.familyId));
      wrapEl.appendChild(btn);
    }

    applyZoom();
    autoFitAndCenter(layout);
  }

  function autoFitAndCenter(layout: TreeLayoutResult): void {
    // Desktop Auto-Fit (Spec 20 §1.3 [K]): initial so skalieren, dass der Baum ins
    // Viewport passt. rAF statt Timeout, damit Layout/Größe vom Browser committed ist.
    requestAnimationFrame(() => {
      const cw = scrollEl.clientWidth;
      const ch = scrollEl.clientHeight;
      if (cw > 0 && ch > 0 && !detectPortrait()) {
        const fit = Math.min(1, cw / layout.width, ch / layout.height);
        if (fit > 0 && fit < 1) {
          zoomScale = Math.round(fit * 100) / 100;
          applyZoom();
        }
      }
      if (cw > 0 && ch > 0) {
        const scaledW = layout.width * zoomScale;
        const scaledH = layout.height * zoomScale;
        scrollEl.scrollLeft = Math.max(0, layout.centerX * zoomScale - cw / 2);
        scrollEl.scrollTop = Math.max(0, layout.centerY * zoomScale - ch * 0.4);
        void scaledW;
        void scaledH;
      }
    });
  }

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

  // ── Pinch-to-Zoom (Touch, 2 Finger; Bereich 0.3x–3x, Spec 20 §1.3 [K]) ──
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

  // ── Tastaturnavigation (Spec 20 §1.3 [K]: Pfeiltasten zwischen Fokuspersonen) ──
  // Registriert auf `document` (Orakel: legacy-v8 `_initTreeKeys()` — globaler Listener,
  // gültig solange die Baum-Ansicht aktiv/gemountet ist), NICHT auf `container` — die
  // Insel verlangt keinen expliziten DOM-Fokus auf einer Karte, bevor Pfeiltasten
  // greifen (analog v8: nur „ist ein Eingabefeld fokussiert" schließt aus).
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
    if (!lastLayout) return;
    const t = lastLayout.navTargets;
    if (e.key === 'ArrowUp') {
      const target = e.shiftKey ? t.up2 : t.up;
      if (target) {
        e.preventDefault();
        callbacks.onSelect(target);
      }
    } else if (e.key === 'ArrowDown') {
      if (t.down) {
        e.preventDefault();
        callbacks.onSelect(t.down);
      }
    } else if (e.key === 'ArrowRight') {
      if (t.right) {
        e.preventDefault();
        callbacks.onSelect(t.right);
      }
    }
    // ArrowLeft = History-Back ist Sache der Schale (ViewState/Navigation-History),
    // nicht dieser Insel — sie kennt keine History (Auftrag: nur Callbacks nach oben).
  };
  document.addEventListener('keydown', onKeyDown);

  // ── Resize (Orientierungswechsel: Portrait <-> Landscape neu zeichnen) ──
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  const onResize = () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (currentId) render(currentId, initialOptions);
    }, 250);
  };
  window.addEventListener('resize', onResize);

  render(personId, initialOptions);

  return {
    update(nextId, options = {}) {
      zoomScale = detectPortrait() ? 1 : zoomScale; // Portrait: kein Zoom (Orakel-Verhalten)
      render(nextId, options);
    },
    /** Bleibt als API-Weg bestehen (Tests, künftige Tastenkürzel) — DELEGIERT aber auf
     *  denselben Schalter, damit Zustand und Beschriftung nie auseinanderlaufen. */
    toggleFullscreen() {
      setFullscreen(!fullscreen);
    },
    get isFullscreen() {
      return fullscreen;
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
    get currentId() {
      return currentId;
    },
  };
}
