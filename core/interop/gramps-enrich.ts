// core/interop/gramps-enrich.ts — reine LESE-Anreicherung der GRAMPS-Projektion
// (BL-140 Stufe 1d, ADR-v9-114 D1/D4/D5).
//
// GRAMPS hält Ereignisse/Zitate/Orte als Top-Level-Records (`<events>`/`<citations>`/
// `<places>`), von Person/Familie per Handle referenziert. Diese Anreicherung löst diese
// Referenzen NACH der Basis-Projektion (`projectPerson`/`projectFamily`) auf und füllt die
// Modell-Felder (`birth`/`events`/`nameCitations`/`marriage`/…).
//
// BEWUSST getrennt von `projectPerson`/`projectFamily`: jene bleiben die „write-back-
// relevante" Projektion (Name/Geschlecht/Links, die das Write-Back vergleicht UND schreibt,
// ADR-v9-14). Ereignisse/Zitate werden hier nur GELESEN — beim Schreiben bleiben sie
// vorerst Passthrough im Baum (INV-PT). Ihr Write-Back kommt symmetrisch in BL-142; erst
// dann wandern sie in `projectPerson`/`personGleich`/`personKinder` (gemeinsam, nicht einzeln).
//
// Reine Funktionen, DOM-/Plattform-frei (INV-ARCH-1).

import type { Event, Family, Person } from '../model/types';
import type { XmlNode } from './xml-tree';
import { attr, childrenByTag, firstChild } from './xml-tree';
import type { GrampsRefIndex } from './gramps';
import { distributeFamilyEvents, distributePersonEvents, projectGrampsEvent } from './gramps-events';
import { collectCitations } from './gramps-citations';

export interface EnrichContext {
  eventOf: (handle: string) => XmlNode | null;
  citationOf: (handle: string) => XmlNode | null;
  /** `<place hlink>` → Orts-String (placeobj ptitle, ersatzweise erster pname). D3. */
  resolvePlace: (handle: string) => string;
  /**
   * `<place hlink>` → native Modell-Bindung (placeId ODER hofId), aus der projizierten
   * `<places>`-Sektion (BL-143). Bindet den Event-Ort direkt an das native placeobj — kein
   * String-Matching (robuster als der findByName-Fallback in applyPlaceResolution). `null`,
   * wenn das Handle kein bekanntes placeobj trifft (Fremd-/Dangling-Verweis).
   */
  resolvePlaceLink: (handle: string) => { placeId?: string; hofId?: string } | null;
  /** `<sourceref hlink>` → Quellen-Modell-`id` (BL-136-Handle→id). */
  resolveSourceId: (handle: string) => string;
}

function indexSection(root: XmlNode, section: string, item: string): Map<string, XmlNode> {
  const m = new Map<string, XmlNode>();
  const sec = firstChild(root, section);
  if (sec) {
    for (const n of childrenByTag(sec, item)) {
      const h = attr(n, 'handle');
      if (h) m.set(h, n);
    }
  }
  return m;
}

/**
 * Baut die Auflösungs-Kontexte aus dem Baum (Events/Citations/Placeobj + BL-136-Index).
 * `placeLink` (BL-143, aus `projectPlaces`) bindet `<place hlink>` nativ an placeId/hofId;
 * ohne Argument (Write-Back-Aufrufer, der nur den String braucht) bleibt die Bindung leer.
 */
export function buildEnrichContext(
  root: XmlNode,
  index: GrampsRefIndex,
  placeLink?: Map<string, { placeId?: string; hofId?: string }>,
): EnrichContext {
  const events = indexSection(root, 'events', 'event');
  const citations = indexSection(root, 'citations', 'citation');
  const places = indexSection(root, 'places', 'placeobj');
  return {
    eventOf: (h) => events.get(h) ?? null,
    citationOf: (h) => citations.get(h) ?? null,
    resolvePlace: (h) => {
      const p = places.get(h);
      if (!p) return '';
      const ptitle = firstChild(p, 'ptitle')?.text;
      if (ptitle) return ptitle;
      const pname = firstChild(p, 'pname');
      return pname ? attr(pname, 'value') : '';
    },
    resolvePlaceLink: (h) => placeLink?.get(h) ?? null,
    resolveSourceId: (h) => index.handleToId.get(h) ?? h,
  };
}

/** Ein `<eventref>` → Modell-Event (mit seinen Zitaten), oder null bei hängendem Handle. */
function projectEventRef(ref: XmlNode, ctx: EnrichContext): Event | null {
  const eventNode = ctx.eventOf(attr(ref, 'hlink'));
  if (!eventNode) return null;
  const e = projectGrampsEvent(eventNode, ctx.resolvePlace);
  e.citations = collectCitations(eventNode, ctx.citationOf, ctx.resolveSourceId);
  // BL-143: den Event-Ort NATIV ans placeobj binden (placeId/hofId per handle→id), statt ihn
  // dem String-Resolver zu überlassen. `event.place` behält den ptitle-String (Anzeige).
  const placeRef = firstChild(eventNode, 'place');
  if (placeRef) {
    const link = ctx.resolvePlaceLink(attr(placeRef, 'hlink'));
    // Building-Bindung setzt BEIDES (hofId + dessen Dorf-placeId); Verwaltungs-Bindung nur placeId.
    if (link?.hofId != null) e.hofId = link.hofId;
    if (link?.placeId != null) e.placeId = link.placeId;
  }
  return e;
}

/** Sammelt die Events eines Owners für die passenden Rollen (fehlende Rolle zählt als Owner). */
function ownedEvents(node: XmlNode, ownerRole: string, ctx: EnrichContext): Event[] {
  const out: Event[] = [];
  for (const ref of childrenByTag(node, 'eventref')) {
    const role = attr(ref, 'role');
    if (role !== ownerRole && role !== '') continue; // andere Rollen (Witness/…) bleiben Passthrough
    const e = projectEventRef(ref, ctx);
    if (e) out.push(e);
  }
  return out;
}

/** Füllt Ereignisse (Rolle „Primary") + Namens-/Personen-Zitate in eine projizierte Person. */
export function enrichPerson(p: Person, node: XmlNode, ctx: EnrichContext): void {
  const nameNode = firstChild(node, 'name');
  if (nameNode) p.nameCitations = collectCitations(nameNode, ctx.citationOf, ctx.resolveSourceId);
  p.topLevelCitations = collectCitations(node, ctx.citationOf, ctx.resolveSourceId);

  const dist = distributePersonEvents(ownedEvents(node, 'Primary', ctx));
  p.birth = dist.birth;
  p.chr = dist.chr;
  p.death = dist.death;
  p.buri = dist.buri;
  p.events = dist.events;
}

/** Füllt Ereignisse (Rolle „Family") + Familien-Zitate in eine projizierte Familie. */
export function enrichFamily(f: Family, node: XmlNode, ctx: EnrichContext): void {
  f.citations = collectCitations(node, ctx.citationOf, ctx.resolveSourceId);

  const dist = distributeFamilyEvents(ownedEvents(node, 'Family', ctx));
  f.marriage = dist.marriage;
  f.engagement = dist.engagement;
  f.events = dist.events;
}
