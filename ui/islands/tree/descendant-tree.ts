// ui/islands/tree/descendant-tree.ts — imperative SVG-Insel Nachkommen-Baum
// (Spec 20 §1.3 [S], BL-122, ADR-v9-123). Framework-frei. Mountet in den geteilten
// `tree-viewport` (Pan/Zoom/Vollbild/Tastatur) und zeichnet über den geteilten
// `tree-cards`-Renderer — identisch zur Sanduhr, nur mit dem Nachkommen-Layout und dem
// ▼-„mehr Nachkommen"-Badge als einzigem insel-eigenen Zusatz. Nach oben nur Callbacks.
import type { Database, PersonId } from '../../../core/model/types';
import { computeDescendantLayout } from './descendant-layout';
import { createTreeViewport, type DrawContext, type DiagramLayoutFrame } from './tree-viewport';
import { appendPersonCard, appendConnector, appendMarriageButton } from './tree-cards';
import { renderDescendantSvg } from './diagram-export';
import { tooltip } from '../../shell/tooltip';
import type { TreeMountCallbacks, TreeMountOptions, TreeIslandHandle } from './hourglass-tree';

export interface DescendantMountOptions extends TreeMountOptions {
  /** Dargestellte Generationen inkl. Proband (2–7, Spec 20 §1.3). Default 4. */
  generations?: number;
}

/**
 * Mountet den Nachkommen-Baum in `container`. Gleiche Handle-Form wie die Sanduhr
 * (`mountHourglassTree`), damit die Schale beide Modi uniform behandeln kann.
 */
export function mountDescendantTree(
  container: HTMLElement,
  db: Database,
  personId: PersonId,
  callbacks: TreeMountCallbacks,
  initialOptions: DescendantMountOptions = {},
): TreeIslandHandle {
  let currentId: PersonId | null = personId;
  let generations = initialOptions.generations;
  let ringByPerson = initialOptions.ringByPerson;

  function draw(ctx: DrawContext): DiagramLayoutFrame | null {
    if (!currentId) return null;
    const layout = computeDescendantLayout(db, currentId, {
      portrait: ctx.portrait,
      generations,
    });
    if (!layout) return null;

    ctx.wrap.querySelectorAll('.tree-island__card, .tree-island__marr-btn').forEach((el) => el.remove());
    ctx.svg.innerHTML = '';

    for (const c of layout.connectors) appendConnector(ctx.svg, c.x1, c.y1, c.x2, c.y2);

    for (const card of layout.cards) {
      const ring = card.id ? ringByPerson?.get(card.id) : undefined;
      const div = appendPersonCard(ctx, db, { ...card, ring }, callbacks);
      if (div && card.hasMore) {
        // ▼ „mehr Nachkommen" — am Generationen-Rand abgeschnitten; Klick auf die Karte
        // rezentriert ohnehin (macht das Kind zur neuen Wurzel mit eigenen Generationen).
        const moreEl = document.createElement('div');
        moreEl.className = 'tree-island__desc-more';
        tooltip(moreEl, 'Mehr Nachkommen — antippen zum Anzeigen');
        moreEl.textContent = '▼';
        div.appendChild(moreEl);
      }
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
    update(nextId, options: DescendantMountOptions = {}) {
      currentId = nextId;
      if (options.generations !== undefined) generations = options.generations;
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
    getExportSvg() {
      if (!currentId) return null;
      const layout = computeDescendantLayout(db, currentId, { portrait: false, generations });
      return layout ? renderDescendantSvg(db, layout, ringByPerson) : null;
    },
  };
}
