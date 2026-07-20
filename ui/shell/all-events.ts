// ui/shell/all-events.ts — flache Sammlung ALLER Events einer Database (Person- und
// Familien-Sonder-Ereignisse + events[]). Reine Funktion, kein Kern-Wissen (nur
// core/model/types) — UI-seitiger Sammel-Helfer, den mehrere Kurations-/Review-Stellen
// gleichermaßen brauchen (Spec 11 §9 hasReference, §9.2 Massen-Dedup-Gewinner-Heuristik).
//
// Dasselbe Sammel-Muster existiert bereits INLINE an mehreren Stellen (hof-review-model.ts
// `collectAllEvents`, place-detail-model.ts, hof-detail-model.ts) — dort jeweils MIT
// Owner-Annotation (wer besitzt das Event), die diese Stellen für ihre eigene Zeilen-
// Darstellung brauchen. Hier reicht die flache Event-Liste OHNE Owner (hasReference/
// Dedup-Verwendungszahl brauchen nur die Events selbst, keine Besitzer-Auflösung) — kein
// Duplikat der owner-annotierten Varianten, sondern der schlankere gemeinsame Nenner.
import type { Database, Event } from '../../core/model/types';

/** Alle Events der Datenbank (Person-Sonderereignisse + events[], Familie ebenso), flach. */
export function collectAllEvents(db: Database): Event[] {
  const events: Event[] = [];
  for (const p of db.individuals.values()) {
    events.push(p.birth, p.chr, p.death, p.buri);
    events.push(...p.events);
  }
  for (const f of db.families.values()) {
    events.push(f.engagement, f.marriage);
    events.push(...f.events);
  }
  return events;
}
