// ui/shell/review-events.ts — die EINE flache, owner-annotierte Event-Sammlung für die
// Review-Ansichten (Spec 11 §6, INV-UI-4). Geteilt von `ui/views/hof/hof-review-model.ts`
// (Klassen A/C/D) und `ui/views/place/place-review-model.ts` (Klasse P).
//
// WARUM GETEILT und nicht je View eigen: `resolveEvents()` gibt Review-Items mit einem
// `index` zurück, der auf DIESE Liste zeigt — die UI-Kommandos führen darüber auf das
// ECHTE, in Person/Family lebende Event zurück (resolveEvents ist rein und arbeitet auf
// Kopien). Reihenfolge und Auswahl müssen daher zwischen Sammlung und Aktion EXAKT
// übereinstimmen. Zwei Kopien dieser Funktion wären zwei Gelegenheiten, genau diese
// Invariante auseinanderlaufen zu lassen — und der Bruch wäre still: ein falscher Index
// trifft ein anderes, real existierendes Event und schreibt die Zuordnung dorthin.
import type { Database, Event } from '../../core/model/types';
import { displayName } from './person-display';

export interface OwnerRef {
  ownerKind: 'person' | 'family';
  ownerId: string;
}

/**
 * Baut die flache, owner-annotierte Event-Liste. MUSS mit derselben Reihenfolge und
 * Auswahl arbeiten wie die anwendenden Kommandos (s. Modul-Kommentar) — deshalb lebt sie
 * hier EINMAL statt je Review-View. Reine Sammel-Funktion, keine Auflösung.
 */
export function collectAllEvents(db: Database): { events: Event[]; owners: OwnerRef[] } {
  const events: Event[] = [];
  const owners: OwnerRef[] = [];
  const push = (ev: Event, ref: OwnerRef) => {
    events.push(ev);
    owners.push(ref);
  };

  for (const p of db.individuals.values()) {
    push(p.birth, { ownerKind: 'person', ownerId: p.id });
    push(p.chr, { ownerKind: 'person', ownerId: p.id });
    push(p.death, { ownerKind: 'person', ownerId: p.id });
    push(p.buri, { ownerKind: 'person', ownerId: p.id });
    for (const ev of p.events) push(ev, { ownerKind: 'person', ownerId: p.id });
  }
  for (const f of db.families.values()) {
    push(f.engagement, { ownerKind: 'family', ownerId: f.id });
    push(f.marriage, { ownerKind: 'family', ownerId: f.id });
    for (const ev of f.events) push(ev, { ownerKind: 'family', ownerId: f.id });
  }

  return { events, owners };
}

/** Anzeigename des Event-Besitzers (Person: Name; Familie: „Mann ⚭ Frau"). */
export function ownerLabelFor(db: Database, ref: OwnerRef): string {
  if (ref.ownerKind === 'person') {
    const p = db.individuals.get(ref.ownerId);
    return p ? displayName(p) : '(unbekannte Person)';
  }
  const f = db.families.get(ref.ownerId);
  if (!f) return '(unbekannte Familie)';
  const names = [f.husband, f.wife]
    .filter((id): id is string => id != null)
    .map((id) => db.individuals.get(id))
    .filter((p): p is NonNullable<typeof p> => p != null)
    .map(displayName);
  return names.length ? names.join(' ⚭ ') : 'Familie';
}
