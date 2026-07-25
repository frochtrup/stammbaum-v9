// ui/islands/tree/hourglass-tree.ts — imperative SVG-Insel Sanduhr-Baum
// (Spec 02 §5, Spec 20 §1.3 [K]). Framework-freies Vanilla-JS. Rechnet NUR aus dem
// Modell (computeTreeLayout, tree-layout.ts) — nie aus dem Live-DOM.
//
// Seit ADR-v9-123 trägt diese Datei nur noch das SANDUHR-SPEZIFISCHE: die Karten-/Linien-/
// Badge-Darstellung und die Übersetzung des Layout-Modells in DOM. Das Gemeinsame aller
// drei Baum-Inseln (Gerüst, Drag-Pan, Pinch-Zoom, Vollbild, Auto-Fit, Tastatur-Dispatch)
// lebt EINMAL im geteilten `tree-viewport.ts` (INV-UI-4). Diese Insel liefert dem Viewport
// nur eine `draw()`-Funktion: sie zeichnet in die gestellten Flächen und gibt ihr Layout-
// Modell (Maße/Zentrum/navTargets) zurück; Rezentrierung/Zoom/Resize = kompletter
// Neu-Aufbau (kein Fein-Diffing, Spec 02 §5). Nach oben ausschließlich über Callbacks.
import type { Database, PersonId } from '../../../core/model/types';
import { computeTreeLayout, type TreeLayoutResult } from './tree-layout';
import { createTreeViewport, type DrawContext, type DiagramLayoutFrame } from './tree-viewport';
// Geteilter Tooltip (INV-UI-12/ADR-v9-87): hier IMPERATIV aufgerufen (kein Svelte-`use:`),
// da die Insel framework-frei ist. `tooltip.ts` ist zur Laufzeit reines DOM (nur Typ-Import
// aus svelte/action, erased) — INV-ARCH bleibt gewahrt. Kein destroy nötig — Karten werden
// je Render neu gebaut, die Listener sterben mit dem entfernten Knoten.
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
  /** Erzwingt Portrait/Landscape statt Container-Maße zu messen (v. a. für Tests). */
  portrait?: boolean;
  maxAncestorLevels?: number;
}

export interface TreeIslandHandle {
  /** Neu zentrieren auf eine andere Person — kompletter Neu-Aufbau. */
  update(personId: PersonId, options?: TreeMountOptions): void;
  /** Vollbild-Zustand umschalten (Spec 21 §3). Bleibt für Tests/künftige Tastenkürzel. */
  toggleFullscreen(): void;
  /** Aktueller Vollbild-Zustand. */
  readonly isFullscreen: boolean;
  /** Listener entfernen, DOM leeren. */
  destroy(): void;
  /** Aktuell zentrierte Person-ID (für Tests/Diagnose). */
  readonly currentId: PersonId | null;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Mountet die Sanduhr-Insel in `container` über den geteilten Baum-Viewport. Alle
 * Gesten-/Tastatur-Listener liegen im Viewport und werden von `destroy()` wieder entfernt.
 */
export function mountHourglassTree(
  container: HTMLElement,
  db: Database,
  personId: PersonId,
  callbacks: TreeMountCallbacks,
  initialOptions: TreeMountOptions = {},
): TreeIslandHandle {
  let currentId: PersonId | null = personId;
  // Nur `maxAncestorLevels` ist sanduhr-eigen; `portrait` misst der Viewport (er besitzt
  // den Container) und reicht es über `ctx.portrait` an `draw()`.
  let maxAncestorLevels = initialOptions.maxAncestorLevels;

  function svgLine(svg: SVGSVGElement, x1: number, y1: number, x2: number, y2: number, dashed: boolean): void {
    const el = document.createElementNS(SVG_NS, 'line');
    el.setAttribute('x1', String(x1));
    el.setAttribute('y1', String(y1));
    el.setAttribute('x2', String(x2));
    el.setAttribute('y2', String(y2));
    el.setAttribute('class', 'tree-island__line' + (dashed ? ' tree-island__line--half' : ''));
    if (dashed) el.setAttribute('stroke-dasharray', '4 3');
    svg.appendChild(el);
  }

  function makeCard(ctx: DrawContext, layout: TreeLayoutResult, card: TreeLayoutResult['cards'][number], peekIndex: number): void {
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
      ctx.wrap.appendChild(div);
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
      if (ctx.shouldSuppressClick()) return; // Klick nach Drag unterdrücken (Orakel-Verhalten)
      handler();
    });
    div.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler();
      }
    });
    ctx.wrap.appendChild(div);
  }

  // Die Insel-Zeichenfunktion: rechnet das Layout, zeichnet Linien/Karten/Badges in die
  // vom Viewport gestellten Flächen und gibt das Layout-Modell zurück (Maße/Zentrum/
  // navTargets) — alles Weitere (Zoom/Zentrierung/Tastatur) besorgt der Viewport.
  function draw(ctx: DrawContext): DiagramLayoutFrame | null {
    if (!currentId) return null;
    const layout = computeTreeLayout(db, currentId, {
      portrait: ctx.portrait,
      maxAncestorLevels,
    });
    if (!layout) return null;

    ctx.wrap.querySelectorAll('.tree-island__card, .tree-island__marr-btn, .tree-island__sib-more').forEach((el) => el.remove());
    ctx.svg.innerHTML = '';

    for (const c of layout.connectors) svgLine(ctx.svg, c.x1, c.y1, c.x2, c.y2, c.dashed);
    let peekIndex = 0;
    for (const card of layout.cards) makeCard(ctx, layout, card, card.isPeek ? peekIndex++ : 0);

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
      ctx.wrap.appendChild(morEl);
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
      ctx.wrap.appendChild(btn);
    }

    return {
      width: layout.width,
      height: layout.height,
      centerX: layout.centerX,
      centerY: layout.centerY,
      navTargets: layout.navTargets,
    };
  }

  const viewport = createTreeViewport(
    container,
    { portrait: initialOptions.portrait, onNavigate: callbacks.onSelect },
    draw,
  );
  viewport.render();

  return {
    update(nextId, options = {}) {
      currentId = nextId;
      if (options.maxAncestorLevels !== undefined) maxAncestorLevels = options.maxAncestorLevels;
      viewport.render();
    },
    toggleFullscreen() {
      viewport.toggleFullscreen();
    },
    get isFullscreen() {
      return viewport.isFullscreen;
    },
    destroy() {
      viewport.destroy();
    },
    get currentId() {
      return currentId;
    },
  };
}
