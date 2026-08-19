// ui/islands/tree/fan-chart.ts — imperative SVG-Insel Fächer-Diagramm
// (Spec 20 §1.3 [S], BL-123, ADR-v9-123). Framework-frei. Mountet in den geteilten
// `tree-viewport` (Pan/Zoom/Vollbild/Tastatur) und zeichnet konzentrische Halbkreis-
// Segmente + Proband-Kreis direkt in den gestellten SVG (keine Rechteck-Karten, deshalb
// KEIN `tree-cards`-Renderer — die Geometrie kommt aus `fan-layout.ts`). Nach oben nur
// Callbacks. Rezentrierung/Zoom/Resize = kompletter Neu-Aufbau (Spec 02 §5).
import type { Database, PersonId } from '../../../core/model/types';
import {
  computeFanLayout,
  clampFanGenerations,
  DEFAULT_FAN_GENERATIONS,
  MIN_FAN_GENERATIONS,
  MAX_FAN_GENERATIONS,
  type FanText,
} from './fan-layout';
import {
  createTreeViewport,
  generationOptions,
  homeTargetFor,
  type DrawContext,
  type DiagramLayoutFrame,
} from './tree-viewport';
import { renderFanSvg } from './diagram-export';
// Geteilter Tooltip (INV-UI-4: EIN Mechanismus, ADR-v9-86/87), imperativ aufgerufen —
// s. hourglass-tree.ts. Er ersetzt das native `title`, das auf Touch gar nicht und auf dem
// Desktop nur verzögert erscheint; im Fächer ist er der einzige Weg zu den Namen der
// äußeren Ringe, deren Beschriftung die Bogenlänge nicht mehr hergibt (ADR-v9-276).
import { tooltip } from '../../shell/tooltip';
import type { PlaceContext } from '../../../core/places';
import type { TreeMountCallbacks, TreeMountOptions, TreeIslandHandle } from './hourglass-tree';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** `generations` liegt inzwischen in `TreeMountOptions` (uniformer Options-Beutel) — der
 *  Alias bleibt als sprechender Name an der Aufrufstelle. */
export type FanMountOptions = TreeMountOptions;

/** Stufen des Fächer-Reglers. Gezählt werden AHNEN-RINGE um das Zentrum: „5" heißt fünf
 *  Ringe zusätzlich zum Zentrums-Kreis. */
const FAN_GENERATION_OPTIONS = generationOptions(
  MIN_FAN_GENERATIONS,
  MAX_FAN_GENERATIONS,
  (n) => `${n} Generationen`,
);

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
  // Der Fächer trägt keine Kekule-Nummern und brauchte den Probanden bisher nicht — jetzt
  // schon, aber nur für „★ Zentrieren" (BL-367), nicht fürs Layout.
  let probandId = initialOptions.probandId ?? null;
  // Nur für den Orts-Teil der Tooltip-Zeile (Spec 11 §5); ohne ihn bleibt das Geburtsjahr.
  let placeContext: PlaceContext | undefined = initialOptions.placeContext;

  function draw(ctx: DrawContext): DiagramLayoutFrame | null {
    if (!currentId) return null;
    const gens = clampFanGenerations(generations ?? DEFAULT_FAN_GENERATIONS);
    const layout = computeFanLayout(db, currentId, { generations: gens, placeContext });
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
        // `data-person-id` ist zugleich der Zeiger-Kontrakt: die geteilte SVG-Ebene ist
        // stumm, erst dieses Attribut holt Klick und `cursor` zurück (CSS, BL-366).
        path.dataset.personId = seg.id;
        path.addEventListener('click', () => {
          if (ctx.shouldSuppressClick()) return;
          callbacks.onSelect(seg.id!);
        });
        // Der Tooltip trägt, was die gezeichnete Beschriftung nicht mehr trägt: den vollen
        // Namen plus Geburtsjahr/-ort. `tooltip` ist auf `Element` typisiert, weil es nur
        // `addEventListener`/`getBoundingClientRect` benutzt — beides kann ein SVG-Pfad.
        tooltip(path, seg.tooltip);
      }
      ctx.svg.appendChild(path);
      for (const t of seg.texts) drawText(ctx.svg, t);
    }

    // ── Zentrums-Kreis (die Person, um die gezeichnet wird — nicht der Proband, ADR-v9-273) ──
    if (layout.center) {
      const pr = layout.center;
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', String(pr.cx));
      circle.setAttribute('cy', String(pr.cy));
      circle.setAttribute('r', String(pr.r));
      circle.setAttribute('class', 'tree-island__fan-center');
      circle.dataset.sex = pr.sex;
      circle.dataset.personId = pr.id;
      circle.addEventListener('click', () => {
        if (ctx.shouldSuppressClick()) return;
        callbacks.onSelectCenter?.(pr.id);
      });
      tooltip(circle, pr.tooltip);
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
      homeTarget: homeTargetFor(probandId, currentId),
      generations: { caption: 'Generationen', value: gens, options: FAN_GENERATION_OPTIONS },
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
    update(nextId, options: FanMountOptions = {}) {
      currentId = nextId;
      if (options.generations !== undefined) generations = options.generations;
      if (options.probandId !== undefined) probandId = options.probandId;
      if (options.placeContext !== undefined) placeContext = options.placeContext;
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
      const layout = computeFanLayout(db, currentId, { generations, placeContext });
      return layout ? renderFanSvg(layout) : null;
    },
  };
}
