// ui/islands/tree/hourglass-tree.ts — imperative SVG-Insel Sanduhr-Baum
// (Spec 02 §5, Spec 20 §1.3 [K]). Framework-freies Vanilla-JS. Rechnet NUR aus dem
// Modell (computeTreeLayout, tree-layout.ts) — nie aus dem Live-DOM.
//
// Seit ADR-v9-123 trägt diese Datei nur noch das SANDUHR-SPEZIFISCHE: die Übersetzung
// des Layout-Modells in DOM plus die drei sanduhr-eigenen Zusatz-Badges (Kekule-Nummer,
// ⚭N-Mehrfachehe, Geschwisterzähler). Das Gemeinsame aller Baum-Inseln lebt EINMAL: das
// Gerüst/die Gesten im geteilten `tree-viewport.ts`, der Karten-/Linien-/Heirats-Renderer
// in `tree-cards.ts` (INV-UI-4). Diese Insel liefert dem Viewport nur eine `draw()`, die
// in die gestellten Flächen zeichnet und ihr Layout-Modell (Maße/Zentrum/navTargets)
// zurückgibt; Rezentrierung/Zoom/Resize = kompletter Neu-Aufbau (Spec 02 §5). Nach oben
// ausschließlich über Callbacks.
import type { Database, PersonId } from '../../../core/model/types';
import { computeTreeLayout, type TreeLayoutResult } from './tree-layout';
import { createTreeViewport, type DrawContext, type DiagramLayoutFrame } from './tree-viewport';
import { appendPersonCard, appendConnector, appendMarriageButton, type CardRing } from './tree-cards';
// Geteilter Tooltip (INV-UI-12/ADR-v9-87): hier IMPERATIV aufgerufen (kein Svelte-`use:`),
// da die Insel framework-frei ist. `tooltip.ts` ist zur Laufzeit reines DOM.
import { tooltip } from '../../shell/tooltip';

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
  /** Vorberechnete Vollständigkeits-Ringe je Person (BL-121); fehlt = keine Ringe. */
  ringByPerson?: ReadonlyMap<PersonId, CardRing>;
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
  let ringByPerson = initialOptions.ringByPerson;

  function makeCard(ctx: DrawContext, layout: TreeLayoutResult, card: TreeLayoutResult['cards'][number], peekZIndex: number): void {
    const div = appendPersonCard(
      ctx,
      db,
      {
        id: card.id,
        x: card.x,
        y: card.y,
        width: card.width,
        height: card.height,
        isCenter: card.isCenter,
        isHalf: card.isHalfSibling,
        isSibling: card.isSibling,
        isPeek: card.isPeek,
        zIndex: card.isPeek ? peekZIndex : undefined,
        ring: card.id ? ringByPerson?.get(card.id) : undefined,
      },
      callbacks,
    );
    if (!div) return; // leere „?"-Karte oder Person fehlt — keine Zusatz-Badges

    // ── Sanduhr-eigene Zusatz-Badges (der gemeinsame Renderer kennt sie nicht) ──
    if (card.kekule) {
      const kEl = document.createElement('div');
      kEl.className = 'tree-island__kekule';
      tooltip(kEl, `Kekule-Nr. ${card.kekule} (Proband = 1)`);
      kEl.textContent = String(card.kekule);
      div.appendChild(kEl);
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

    for (const c of layout.connectors) appendConnector(ctx.svg, c.x1, c.y1, c.x2, c.y2, c.dashed);
    let peekIndex = 0;
    for (const card of layout.cards) makeCard(ctx, layout, card, card.isPeek ? peekIndex++ + 1 : 0);

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
      appendMarriageButton(ctx, layout.marriageBadge, callbacks.onSelectFamily);
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
      if (options.ringByPerson !== undefined) ringByPerson = options.ringByPerson;
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
