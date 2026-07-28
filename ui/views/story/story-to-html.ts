// ui/views/story/story-to-html.ts — Story-Download als selbst-enthaltenes, druckbares HTML
// (BL-190, Spec 20 §1.10 / §4). Rendert ein bereits gebautes `StoryDoc` (story-model.ts)
// über die GETEILTE Report-Hülle (services/reports, ADR-v9-138) — kein zweiter Rechenweg,
// dieselbe Cover-/Print-CSS-Hülle wie die §4-Ausgaben. Karte als inline-SVG (buildStoryMapSvg,
// EIN Kartenrenderer wie in der Lens), Fotos als data:-URI (BL-189). Kein Server, keine
// externe Ressource — der Blob/DOM-Seiteneffekt (neuer Tab) liegt in open-report.ts.
import type { Database } from '../../../core/model/types';
import { renderReport, esc } from '../../../services/reports';
import { buildStoryMapSvg } from '../../islands/story/story-map-svg';
import { buildStoryDiagramSvg } from '../../islands/story/story-diagram';
import type { StoryDoc } from './story-model';

function sectionHtml(doc: StoryDoc): string {
  return doc.sections
    .map((s) => {
      const heading = s.heading ? `<h2>${esc(s.heading)}</h2>\n` : '';
      // Kinder-/Chronik-Abschnitte als Liste, sonst Absätze (nur Darstellung).
      const paras =
        s.id === 'children' || s.id === 'timeline'
          ? `<ul class="story-${s.id === 'children' ? 'children' : 'chron'}">${s.paragraphs.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`
          : s.paragraphs.map((p) => `<p class="story-para">${esc(p)}</p>`).join('\n');
      const blocks = (s.blocks ?? [])
        .map(
          (b) =>
            `<div class="story-block"><h3>${esc(b.subheading)}</h3>${b.paragraphs
              .map((p) => `<p class="story-para">${esc(p)}</p>`)
              .join('')}</div>`,
        )
        .join('');
      return `<section>${heading}${paras}${blocks}</section>`;
    })
    .join('\n');
}

/**
 * Baut das druckbare Story-HTML. `generatedOn` wird INJIZIERT (kein Wall-Clock im Rechenkern,
 * TST-3) → deterministisch goldfile-testbar.
 */
export function buildStoryHtml(db: Database, doc: StoryDoc, generatedOn: string): string {
  const photos = doc.photos.length
    ? `<section class="story-photos">${doc.photos
        .map((ph) => `<img class="story-photo" src="${esc(ph.src)}" alt="${esc(ph.title)}">`)
        .join('')}</section>`
    : '';
  const map = doc.mapPoints.length ? `<section class="story-map">${buildStoryMapSvg(doc.mapPoints)}</section>` : '';
  const diagram = `<section class="story-diagram">${buildStoryDiagramSvg(db, { subject: doc.subject, id: doc.id })}</section>`;
  const subtitle = [doc.subtitle, doc.lifespan].filter(Boolean).join(' · ');
  return renderReport({
    title: doc.title,
    subtitle: subtitle || undefined,
    meta: `erstellt am ${generatedOn}`,
    // Reihenfolge wie Orakel/Lens: Fotos → Karte → Diagramm → Erzählung.
    body: photos + map + diagram + sectionHtml(doc),
  });
}
