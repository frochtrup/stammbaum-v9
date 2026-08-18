// ui/islands/tree/descendant-tree.ts — imperative SVG-Insel Nachkommen-Baum
// (Spec 20 §1.3 [S], BL-122, ADR-v9-123). Framework-frei. Mountet in den geteilten
// `tree-viewport` (Pan/Zoom/Vollbild/Tastatur) und zeichnet über den geteilten
// `tree-cards`-Renderer — identisch zur Sanduhr, nur mit dem Nachkommen-Layout und dem
// ▼-„mehr Nachkommen"-Badge als einzigem insel-eigenen Zusatz. Nach oben nur Callbacks.
import type { Database, PersonId } from '../../../core/model/types';
import {
  computeDescendantLayout,
  clampDescGenerations,
  DEFAULT_DESC_GENERATIONS,
  MIN_DESC_GENERATIONS,
  MAX_DESC_GENERATIONS,
} from './descendant-layout';
import {
  createTreeViewport,
  generationOptions,
  homeTargetFor,
  type DrawContext,
  type DiagramLayoutFrame,
} from './tree-viewport';
import { appendPersonCard, appendConnector, appendMarriageButton } from './tree-cards';
import { renderDescendantSvg } from './diagram-export';
import { tooltip } from '../../shell/tooltip';
import type { TreeMountCallbacks, TreeMountOptions, TreeIslandHandle } from './hourglass-tree';

/** `generations` liegt inzwischen in `TreeMountOptions` (uniformer Options-Beutel, damit
 *  `TreeIslandHandle.update` für alle drei Modi dieselbe Form hat) — dieser Alias bleibt
 *  als sprechender Name an der Aufrufstelle. */
export type DescendantMountOptions = TreeMountOptions;

/** Stufen des Nachkommen-Reglers — Generationen INKLUSIVE Zentrum. */
const DESC_GENERATION_OPTIONS = generationOptions(
  MIN_DESC_GENERATIONS,
  MAX_DESC_GENERATIONS,
  (n) => `${n} Generationen`,
);

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
  // Der Nachkommen-Baum trägt keine Kekule-Nummern und brauchte den Probanden bisher
  // nicht — jetzt schon, aber nur für „★ Zentrieren" (BL-367), nicht fürs Layout.
  let probandId = initialOptions.probandId ?? null;

  function draw(ctx: DrawContext): DiagramLayoutFrame | null {
    if (!currentId) return null;
    const gens = clampDescGenerations(generations ?? DEFAULT_DESC_GENERATIONS);
    const layout = computeDescendantLayout(db, currentId, {
      portrait: ctx.portrait,
      generations: gens,
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
      homeTarget: homeTargetFor(probandId, currentId),
      generations: { caption: 'Generationen', value: gens, options: DESC_GENERATION_OPTIONS },
    };
  }

  const viewport = createTreeViewport(
    container,
    {
      portrait: initialOptions.portrait,
      onNavigate: callbacks.onSelect,
      onGenerationsChange: callbacks.onGenerationsChange,
    },
    draw,
  );
  viewport.render();

  return {
    update(nextId, options: DescendantMountOptions = {}) {
      currentId = nextId;
      if (options.generations !== undefined) generations = options.generations;
      if (options.ringByPerson !== undefined) ringByPerson = options.ringByPerson;
      if (options.probandId !== undefined) probandId = options.probandId;
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
