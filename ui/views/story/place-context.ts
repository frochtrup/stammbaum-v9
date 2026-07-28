// ui/views/story/place-context.ts — Orts-Kontextsätze des Story-Modus (BL-185, Spec 20
// §1.10, Spec 11 §4). Reine Funktion über die `core/places`-Registry — headless testbar,
// keine eigene Ortslogik (INV-ARCH-1: liest ausschließlich über den Registry-Chokepoint).
// Verhaltens-Orakel: v8 `legacy-v8/ui-views-place.js` (`buildPlaceContextSentence`).
//
// Liefert reinen Text (die Svelte-Schale/der HTML-Download escapen an ihrer Grenze —
// gleicher Vertrag wie story-templates.ts).
import type { PlaceContext } from '../../../core/places';
import type { PlaceId } from '../../../core/model/types';

/** GEDCOM/GRAMPS-Ortstyp → deutsche Nominalphrase (Orakel `TYPE_DE`, 1:1). */
const TYPE_DE: Record<string, string> = {
  Country: 'ein Land', State: 'ein Bundesland', Region: 'eine Region', Province: 'eine Provinz',
  County: 'ein Kreis', District: 'ein Bezirk', Municipality: 'eine Gemeinde', City: 'eine Stadt',
  Town: 'eine Stadt', Village: 'ein Dorf', Hamlet: 'ein Weiler', Parish: 'eine Pfarrei',
  Borough: 'ein Stadtteil', Locality: 'eine Ortslage', Neighborhood: 'eine Nachbarschaft',
  Building: 'ein Gebäude', Farm: 'ein Hof', Cemetery: 'ein Friedhof', Church: 'eine Kirche',
};

/**
 * „Musterstadt war 1850 eine Stadt in Kreis X, Provinz Y." — Kontext zum Ort eines
 * Ereignisses (Geburt/Taufe/Tod/Begräbnis). Name periodenkorrekt zum `year`
 * (`resolveAsOf`), Zugehörigkeitskette ohne den Ort selbst (`enclosureChainAsOf.slice(1)`).
 * '' wenn kein `placeId`, der Ort unbekannt ist oder weder Typ noch Kette etwas hergeben.
 */
export function buildPlaceContextSentence(
  ctx: PlaceContext,
  placeId: PlaceId | null,
  year: number | null,
): string {
  if (!placeId) return '';
  const reg = ctx.places;
  const po = reg.byId(placeId);
  if (!po) return '';

  const typePart = TYPE_DE[po.type] ? ` ${TYPE_DE[po.type]}` : '';

  const rawName = (typeof year === 'number' ? reg.resolveAsOf(placeId, year) : null) || po.title || '';
  const name = rawName.split(',')[0].trim();
  if (!name) return '';

  const chain = reg.enclosureChainAsOf(placeId, year).slice(1);
  const chainPart = chain.length ? ` in ${chain.join(', ')}` : '';

  if (!typePart && !chainPart) return '';
  const yearStr = year ? ` ${year}` : '';
  return `${name} war${yearStr}${typePart}${chainPart}.`;
}
