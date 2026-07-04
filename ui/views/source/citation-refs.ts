// ui/views/source/citation-refs.ts — reine Traversierung aller Zitatstellen der
// Datenbank (Spec 20 §1.6 [K]: Referenzzähler + "Detail mit allen referenzierenden
// Personen/Familien inkl. PAGE/QUAY"). Liest nur öffentliche Modellfelder (Spec 10
// §5.3 "einheitlicher Zitatkörper in ALLEN Kontexten") — keine Kern-Logik, reine
// Aggregation für die Darstellung.
import type { Citation, Database, Event, Family, Person } from '../../../core/model/types';

export type CitationOwnerKind = 'person' | 'family';

export interface CitationRef {
  citation: Citation;
  ownerKind: CitationOwnerKind;
  ownerId: string;
  /** Deutsches Kurzlabel der Fundstelle (z. B. "Geburt", "Heirat", "Name", "Notiz"). */
  context: string;
}

function fromEvent(ev: Event, label: string, ownerKind: CitationOwnerKind, ownerId: string): CitationRef[] {
  return ev.citations.map((citation) => ({ citation, ownerKind, ownerId, context: label }));
}

function personRefs(p: Person): CitationRef[] {
  const refs: CitationRef[] = [];
  refs.push(...fromEvent(p.birth, 'Geburt', 'person', p.id));
  refs.push(...fromEvent(p.chr, 'Taufe', 'person', p.id));
  refs.push(...fromEvent(p.death, 'Tod', 'person', p.id));
  refs.push(...fromEvent(p.buri, 'Bestattung', 'person', p.id));
  p.events.forEach((ev) => {
    refs.push(...fromEvent(ev, ev.eventType || ev.type || 'Ereignis', 'person', p.id));
  });
  for (const c of p.topLevelCitations) {
    refs.push({ citation: c, ownerKind: 'person', ownerId: p.id, context: 'Person' });
  }
  for (const c of p.nameCitations) {
    refs.push({ citation: c, ownerKind: 'person', ownerId: p.id, context: 'Name' });
  }
  for (const name of p.extraNames) {
    for (const c of name.citations) {
      refs.push({ citation: c, ownerKind: 'person', ownerId: p.id, context: 'Namensvariante' });
    }
  }
  for (const link of p.childOf) {
    for (const c of link.citations) {
      refs.push({ citation: c, ownerKind: 'person', ownerId: p.id, context: 'Kindschaft' });
    }
  }
  for (const assoc of p.associations) {
    for (const c of assoc.citations) {
      refs.push({ citation: c, ownerKind: 'person', ownerId: p.id, context: 'Assoziation' });
    }
  }
  return refs;
}

function familyRefs(f: Family): CitationRef[] {
  const refs: CitationRef[] = [];
  refs.push(...fromEvent(f.engagement, 'Verlobung', 'family', f.id));
  refs.push(...fromEvent(f.marriage, 'Heirat', 'family', f.id));
  f.events.forEach((ev) => {
    refs.push(...fromEvent(ev, ev.eventType || ev.type || 'Ereignis', 'family', f.id));
  });
  for (const c of f.citations) {
    refs.push({ citation: c, ownerKind: 'family', ownerId: f.id, context: 'Familie' });
  }
  return refs;
}

/** Alle Zitatstellen der Datenbank, Personen vor Familien, in Modell-Iterationsreihenfolge. */
export function collectCitationRefs(db: Database): CitationRef[] {
  const refs: CitationRef[] = [];
  for (const p of db.individuals.values()) refs.push(...personRefs(p));
  for (const f of db.families.values()) refs.push(...familyRefs(f));
  return refs;
}
