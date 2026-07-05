// ui/views/place/place-bootstrap-model.ts — Orte-Bootstrap-Vorschlag, UI-Aufbereitung
// (Spec 20 §1.7 [K] "Orte-Bootstrap-Vorschlag aus GEDCOM-PLAC-Hierarchien", ADR-v9-27).
//
// Sammelt ALLE Events der Datenbank (Person- + Familie-Ebene, analog
// hof-review-model.ts collectAllEvents — dasselbe Sammel-Muster, hier ohne Owner-
// Annotation, weil der Sichtungs-Dialog keine "Quelle schärfen"-Navigation braucht)
// und ruft die EINE Kern-Funktion `suggestPlaceCandidates` auf (ADR-v9-18-Lehre: keine
// eigene Sammel-/Auflösungslogik parallel zum Kern).
//
// ID-Vergabe für neu anzulegende PlaceObjects: es gibt noch KEIN etabliertes "neues
// PlaceObject anlegen"-Muster (bisher wurde nur Bestehendes bearbeitet, s. PlaceDetail).
// Strukturelles Vorbild: makeHofId (core/places/hof-id.ts) — Slug + deterministischer
// Kollisions-Suffix. Hier bewusst OHNE die Hof-spezifische Adress-/Dorf-Doppel-Slug-Logik,
// nur das Muster "Slug + Suffix bei Kollision".
import type { Database, Event, PlaceId } from '../../../core/model/types';
import type { PlaceContext, PlaceObject, PlaceCandidate } from '../../../core/places';
import { suggestPlaceCandidates, slugify } from '../../../core/places';

/** Flache Sammlung aller Events aus Personen + Familien (analog hof-review-model.ts). */
export function collectAllEvents(db: Database): Event[] {
  const events: Event[] = [];
  for (const p of db.individuals.values()) {
    events.push(p.birth, p.chr, p.death, p.buri);
    for (const ev of p.events) events.push(ev);
  }
  for (const f of db.families.values()) {
    events.push(f.engagement, f.marriage);
    for (const ev of f.events) events.push(ev);
  }
  return events;
}

/** Baut die Vorschlagsliste für den Sichtungs-Dialog (Spec 20 §1.7 [K]). */
export function buildPlaceCandidates(db: Database, ctx: PlaceContext): PlaceCandidate[] {
  return suggestPlaceCandidates(collectAllEvents(db), ctx);
}

/**
 * Deterministische PlaceId aus einem Titel: `_place_<slug>`, mit Kollisions-Suffix
 * `_2`/`_3`/… falls die Basis-ID schon existiert (Vorbild: makeHofId, hof-id.ts).
 */
export function makePlaceId(title: string, existing: ReadonlyMap<PlaceId, PlaceObject>): PlaceId {
  const slug = slugify(title) || 'ort';
  const base = `_place_${slug}`;
  if (!existing.has(base)) return base;
  let n = 1;
  let id = `${base}_${++n}`;
  while (existing.has(id)) id = `${base}_${++n}`;
  return id;
}

/**
 * Baut ein neues PlaceObject aus einem bestätigten Kandidaten — Typ/pnames/enclosedBy/
 * Koordinaten bleiben leer/Standard (Spec-Auftrag: Nutzer ergänzt das später über die
 * bestehende Orte-Bearbeitung, PlaceDetail.svelte). Reine Funktion — mutiert `existing`
 * nicht, der Aufrufer persistiert über appState.savePlace(...).
 */
export function draftPlaceObject(candidate: PlaceCandidate, existing: ReadonlyMap<PlaceId, PlaceObject>): PlaceObject {
  return {
    id: makePlaceId(candidate.title, existing),
    title: candidate.title,
    type: '',
    pnames: [],
    enclosedBy: [],
    lat: null,
    long: null,
    note: '',
    existsFrom: null,
    existsTo: null,
    govId: null,
    govTypes: null,
  };
}
