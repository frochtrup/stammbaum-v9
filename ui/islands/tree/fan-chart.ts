// ui/islands/tree/fan-chart.ts — imperative SVG-Insel Fächer-Diagramm
// (Spec 20 §1.3 [S], BL-123, ADR-v9-123). Framework-frei. Mountet in den geteilten
// `tree-viewport` (Pan/Zoom/Vollbild/Tastatur) und zeichnet konzentrische Halbkreis-
// Segmente + Proband-Kreis direkt in den gestellten SVG (keine Rechteck-Karten, deshalb
// KEIN `tree-cards`-Renderer — die Geometrie kommt aus `fan-layout.ts`). Nach oben nur
// Callbacks. Rezentrierung/Zoom/Resize = kompletter Neu-Aufbau (Spec 02 §5).
import type { Database, PersonId } from '../../../core/model/types';
import { computeFanLayout, type FanText } from './fan-layout';
import { createTreeViewport, type DrawContext, type DiagramLayoutFrame } from './tree-viewport';
import type { TreeMountCallbacks, TreeMountOptions, TreeIslandHandle } from './hourglass-tree';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface FanMountOptions extends TreeMountOptions {
  /** Generationen inkl. Proband-Ringe (3–6, Spec 20 §1.3). Default 5. */
  generations?: number;
}

function drawText(svg: SVGSVGElement, t: FanText): void {
  const el = document.createElementNS(SVG_NS, 'text');
  el.setAttribute('x', String(t.x));
  el.setAttribute('y', String(t.y));
  el.setAttribute('text-anchor', 'middle');
  el.setAttribute('dominant-baseline', 'middle');
  el.setAttribute('font-size', String(t.fontSize));
  el.setAttribute('class', 'tree-island__fan-text' + (t.dim ? ' tree-island__fan-text--dim' : ''));
  if (t.rotation) el.setAttribute('transform', `rotate(${t.rotation},${t.x},${t.y})`);
  el.textContent = t.text;
  svg.appendChild(el);
}

/**
 * Mountet das Fächer-Diagramm in `container`. Gleiche Handle-Form wie die Sanduhr
 * (`mountHourglassTree`), damit die Schale alle Baum-Modi uniform behandeln kann.
 */
export function mountFanChart(
  container: HTMLElement,
  db: Database,
  personId: PersonId,
  callbacks: TreeMountCallbacks,
  initialOptions: FanMountOptions = {},
): TreeIslandHandle {
  let currentId: PersonId | null = personId;
  let generations = initialOptions.generations;

  function draw(ctx: DrawContext): DiagramLayoutFrame | null {
    if (!currentId) return null;
    const layout = computeFanLayout(db, currentId, { generations });
    if (!layout) return null;

    ctx.wrap.querySelectorAll('.tree-island__card').forEach((el) => el.remove());
    ctx.svg.innerHTML = '';

    // ── Ringsegmente (Vorfahren) ──
    for (const seg of layout.segments) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', seg.d);
      path.setAttribute('class', 'tree-island__fan-seg' + (seg.id ? '' : ' tree-island__fan-seg--empty'));
      if (seg.id) path.dataset.sex = seg.sex;
      path.setAttribute('fill-opacity', String(seg.fillOpacity));
      if (seg.id) {
        path.dataset.personId = seg.id;
        path.style.cursor = 'pointer';
        path.addEventListener('click', () => {
          if (ctx.shouldSuppressClick()) return;
          callbacks.onSelect(seg.id!);
        });
      }
      ctx.svg.appendChild(path);
      for (const t of seg.texts) drawText(ctx.svg, t);
    }

    // ── Proband-Kreis (Zentrum) ──
    if (layout.proband) {
      const pr = layout.proband;
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', String(pr.cx));
      circle.setAttribute('cy', String(pr.cy));
      circle.setAttribute('r', String(pr.r));
      circle.setAttribute('class', 'tree-island__fan-proband');
      circle.dataset.sex = pr.sex;
      circle.dataset.personId = pr.id;
      circle.style.cursor = 'pointer';
      circle.addEventListener('click', () => {
        if (ctx.shouldSuppressClick()) return;
        callbacks.onSelectCenter?.(pr.id);
      });
      ctx.svg.appendChild(circle);
      if (pr.given) drawText(ctx.svg, { text: pr.given, x: pr.cx, y: pr.cy - 6, rotation: 0, fontSize: 10, dim: false });
      if (pr.surname) drawText(ctx.svg, { text: pr.surname, x: pr.cx, y: pr.cy + 7, rotation: 0, fontSize: 9, dim: true });
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
    update(nextId, options: FanMountOptions = {}) {
      currentId = nextId;
      if (options.generations !== undefined) generations = options.generations;
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
