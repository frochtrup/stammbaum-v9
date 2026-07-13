// ui/islands/map/svg-fallback-map.ts — kachel-freier SVG-Weltumriss als Offline-
// Fallback (ADR-v9-25, Spec 02 §5 imperative Insel). Framework-freies Vanilla-SVG,
// KEIN echtes GeoJSON-Kartenmaterial (Vereinfachen vor Erfinden, Auftrag: "ein grober
// Weltumriss reicht") — eine handkuratierte, sehr grobe Kontinent-Silhouette aus
// kompakten Koordinatenlisten + eine einfache äquidistante (Plattkarte-)Projektion.
//
// Deckt alle 3 Modi ab (Orte/Personen/Migrationen), rechnet ausschließlich aus den
// bereits von map-model.ts aufbereiteten Daten (nie aus dem Live-DOM, Spec 02 §5).
// Personen-/Migrations-Modus dürfen hier vereinfacht sein (Auftrag: "nur Linien ohne
// Animation") — Orte-Modus (Marker-Punkte) ist der verlässliche Kernfall.
import type { PlacePoint, MigrationLine, BiographyPoint } from './map-model';
import { findFocusPoint } from './map-model';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEW_W = 1000;
const VIEW_H = 520;
/** Zoom-Faktor der Fokus-Zentrierung im Fallback (ADR-v9-78 Punkt 4) — angewandt als
 * Gruppen-Transform auf den Inhalt (Kontinente+Marker), NICHT auf den Ozean-
 * Hintergrund, der immer den ganzen viewBox füllt (s. render() unten). */
const FOCUS_SCALE = 3;

/**
 * Sehr grobe Kontinent-Umrisse als [lat, long][]-Polygone (grob abgetastete
 * Küstenlinien, keine amtliche Genauigkeit — reicht als visuelle Orientierung für
 * den Offline-Fall). Bewusst kompakt gehalten statt eines echten GeoJSON-Datensatzes.
 */
const CONTINENT_OUTLINES: [number, number][][] = [
  // Europa (sehr grob)
  [
    [71, 25], [70, 28], [65, 40], [60, 30], [55, 38], [45, 36], [40, 20],
    [37, 10], [43, -9], [50, -5], [58, 6], [60, 5], [63, 10], [66, 12],
    [70, 20], [71, 25],
  ],
  // Afrika (sehr grob)
  [
    [37, 10], [30, -10], [15, -17], [5, -10], [-5, 12], [-20, 15], [-34, 20],
    [-25, 33], [-10, 40], [5, 48], [15, 43], [30, 33], [37, 10],
  ],
  // Asien (sehr grob)
  [
    [70, 60], [60, 60], [55, 90], [45, 135], [30, 122], [20, 105], [10, 105],
    [5, 95], [20, 70], [25, 60], [35, 55], [45, 45], [55, 40], [65, 45],
    [70, 60],
  ],
  // Nordamerika (sehr grob)
  [
    [70, -160], [60, -140], [48, -125], [30, -117], [15, -95], [20, -87],
    [30, -81], [45, -67], [60, -65], [70, -80], [70, -160],
  ],
  // Südamerika (sehr grob)
  [
    [10, -75], [0, -80], [-15, -75], [-35, -71], [-55, -68], [-50, -65],
    [-30, -50], [-10, -35], [5, -60], [10, -75],
  ],
  // Australien (sehr grob)
  [
    [-12, 130], [-15, 145], [-25, 153], [-38, 145], [-35, 137], [-32, 115],
    [-20, 113], [-12, 130],
  ],
];

/** Äquidistante Plattkarte-Projektion (lat/long -> Pixel), kein Mercator-Verzerrungsaufwand nötig. */
function project(lat: number, long: number): { x: number; y: number } {
  const x = ((long + 180) / 360) * VIEW_W;
  const y = ((90 - lat) / 180) * VIEW_H;
  return { x, y };
}

export interface SvgFallbackMountOptions {
  mode: 'orte' | 'person' | 'migr';
  places: PlacePoint[];
  migrations: MigrationLine[];
  biography: BiographyPoint[];
  onSelectPlace?: (placeId: string) => void;
  /**
   * Orts-/Hof-ID zum Zentrieren+Hervorheben im Orte-Modus (ADR-v9-78 Punkt 4, Spec
   * 20 §1.9 "Lücke 2") — honoriert denselben Fokus wie der primäre Leaflet-Pfad
   * (Offline-Parität-Disziplin, s. `leaflet-map.ts::LeafletMountData.focusPlaceId`).
   */
  focusPlaceId?: string | null;
}

export interface SvgFallbackHandle {
  update(options: SvgFallbackMountOptions): void;
  destroy(): void;
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}

/**
 * Mountet den SVG-Fallback in `container`. Kompletter Neu-Aufbau bei jedem `update`
 * (kein Fein-Diffing, Spec 02 §5) — die Insel ist klein genug, dass das keine
 * Performance-Frage ist.
 */
export function mountSvgFallbackMap(container: HTMLElement, options: SvgFallbackMountOptions): SvgFallbackHandle {
  container.classList.add('map-fallback');
  const svg = svgEl('svg');
  svg.setAttribute('class', 'map-fallback__svg');
  svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  container.innerHTML = '';
  container.appendChild(svg);

  function render(opts: SvgFallbackMountOptions): void {
    svg.innerHTML = '';

    // Ozean-Hintergrund bleibt UN-transformiert außerhalb der Inhalts-Gruppe (füllt
    // immer den ganzen viewBox) — nur Kontinente+Marker werden bei einem Fokus
    // reinzoomt (s. Fokus-Transform am Ende dieser Funktion).
    const oceanBg = svgEl('rect');
    oceanBg.setAttribute('x', '0');
    oceanBg.setAttribute('y', '0');
    oceanBg.setAttribute('width', String(VIEW_W));
    oceanBg.setAttribute('height', String(VIEW_H));
    oceanBg.setAttribute('class', 'map-fallback__ocean');
    svg.appendChild(oceanBg);

    const content = svgEl('g');
    content.setAttribute('class', 'map-fallback__content');
    svg.appendChild(content);

    for (const outline of CONTINENT_OUTLINES) {
      const poly = svgEl('polygon');
      const points = outline.map(([lat, long]) => {
        const { x, y } = project(lat, long);
        return `${x},${y}`;
      });
      poly.setAttribute('points', points.join(' '));
      poly.setAttribute('class', 'map-fallback__continent');
      content.appendChild(poly);
    }

    let focusPoint: PlacePoint | null = null;
    if (opts.mode === 'orte') {
      // Fokus-Hervorhebung + -Zentrierung (ADR-v9-78 Punkt 4, Spec 20 §1.9 "Lücke 2")
      // — dieselbe Lookup-Funktion wie der primäre Leaflet-Pfad (Offline-Parität,
      // EINE Quelle für "ist das der fokussierte Punkt").
      focusPoint = findFocusPoint(opts.places, opts.focusPlaceId);
      for (const p of opts.places) {
        const isFocused = focusPoint != null && p.placeId === focusPoint.placeId;
        const { x, y } = project(p.lat, p.long);
        const circle = svgEl('circle');
        circle.setAttribute('cx', String(x));
        circle.setAttribute('cy', String(y));
        const r = p.personCount >= 20 ? 6 : p.personCount >= 5 ? 4.5 : 3;
        circle.setAttribute('r', String(isFocused ? r + 2 : r));
        circle.setAttribute(
          'class',
          'map-fallback__marker' +
            (p.isHof ? ' map-fallback__marker--hof' : '') +
            (isFocused ? ' map-fallback__marker--focused' : ''),
        );
        circle.setAttribute('role', 'button');
        circle.setAttribute('tabindex', '0');
        const title = svgEl('title');
        title.textContent = `${p.title} · ${p.personCount} Person${p.personCount !== 1 ? 'en' : ''}`;
        circle.appendChild(title);
        circle.addEventListener('click', () => opts.onSelectPlace?.(p.placeId));
        content.appendChild(circle);
      }
    } else if (opts.mode === 'migr') {
      // Vereinfacht (Auftrag: "nur Linien ohne Animation"): statische Polylinien,
      // eingefärbt nach Epoche — kein Play/Pause/Loop im Fallback.
      for (const line of opts.migrations) {
        const poly = svgEl('polyline');
        const pts = line.points.map((pt) => {
          const { x, y } = project(pt.lat, pt.long);
          return `${x},${y}`;
        });
        poly.setAttribute('points', pts.join(' '));
        poly.setAttribute('class', 'map-fallback__migr-line');
        poly.setAttribute('stroke', line.color);
        const title = svgEl('title');
        title.textContent = line.personName;
        poly.appendChild(title);
        content.appendChild(poly);
      }
    } else {
      // Personen-Modus: Biografie-Linie ohne Animation, nummerierte Stationen.
      const pts = opts.biography.map((pt) => project(pt.lat, pt.long));
      if (pts.length > 1) {
        const poly = svgEl('polyline');
        poly.setAttribute('points', pts.map((pt) => `${pt.x},${pt.y}`).join(' '));
        poly.setAttribute('class', 'map-fallback__bio-line');
        content.appendChild(poly);
      }
      opts.biography.forEach((pt, i) => {
        const { x, y } = project(pt.lat, pt.long);
        const circle = svgEl('circle');
        circle.setAttribute('cx', String(x));
        circle.setAttribute('cy', String(y));
        circle.setAttribute('r', '4');
        circle.setAttribute('class', 'map-fallback__marker map-fallback__marker--bio');
        const title = svgEl('title');
        title.textContent = `${i + 1}. ${pt.role} — ${pt.title}${pt.date ? ' (' + pt.date + ')' : ''}`;
        circle.appendChild(title);
        content.appendChild(circle);
      });
    }

    // Fokus-Zentrierung: Gruppen-Transform statt viewBox-Änderung (einfacher, kein
    // zweiter Projektions-Pfad nötig) — kein CSS-`transition` hier (Spec 02 §5:
    // "kompletter Neu-Aufbau" pro `render()`-Aufruf, die Gruppe ist bei jedem Update
    // ein NEUES Element ohne Vorzustand, ein `transition` würde also nie sichtbar
    // animieren; die Zentrierung ist damit von sich aus ein direkter Sprung, erfüllt
    // `prefers-reduced-motion`/Spec 21 §6i ohne zusätzlichen JS-Check).
    if (focusPoint) {
      const { x, y } = project(focusPoint.lat, focusPoint.long);
      const tx = VIEW_W / 2 - x * FOCUS_SCALE;
      const ty = VIEW_H / 2 - y * FOCUS_SCALE;
      content.setAttribute('transform', `translate(${tx}, ${ty}) scale(${FOCUS_SCALE})`);
    }
  }

  render(options);

  return {
    update(nextOptions) {
      render(nextOptions);
    },
    destroy() {
      container.innerHTML = '';
      container.classList.remove('map-fallback');
    },
  };
}
