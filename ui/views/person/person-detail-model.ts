// ui/views/person/person-detail-model.ts — reine Projektion einer Person auf
// Detail-Zeilen (Spec 20 §1.4 [K]: Ereignisse, Quellen-Badges, Geo-Links,
// Familien-Navigationszeilen). Liest AUSSCHLIESSLICH über core-Chokepoints/-Prädikate,
// keine Mutation, keine Feld-Interpretation, die eigentlich in den Kern gehört.
import type { Citation, Database, Event, Family, Person } from '../../../core/model/types';
import type { PlaceContext, Coords } from '../../../core/places';
import { eventCoords } from '../../../core/places';
import { isEventPresent } from '../../../core/model';
import { displayName, yearPlaceSummary } from '../../shell/person-display';

/** Deutsche Kurzlabels für die fest modellierten Sonder-Ereignisse (Spec 10 §5.1). */
const SPECIAL_LABELS: Record<string, string> = {
  BIRT: 'Geburt',
  CHR: 'Taufe',
  DEAT: 'Tod',
  BURI: 'Bestattung',
};

export interface EventRow {
  key: string;
  label: string;
  summary: string;
  note: string;
  citations: Citation[];
  coords: Coords | null;
}

export interface FamilyNavRow {
  familyId: string;
  role: 'parentIn' | 'childOf';
  label: string;
  /** Anklickbare Gegenpersonen dieser Familie (Partner bzw. Eltern), nie die Person selbst. */
  members: { personId: string; name: string }[];
}

export interface PersonDetailModel {
  person: Person;
  events: EventRow[];
  families: FamilyNavRow[];
}

function toEventRow(key: string, label: string, ev: Event, ctx: PlaceContext): EventRow | null {
  if (!isEventPresent(ev)) return null;
  return {
    key,
    label,
    summary: yearPlaceSummary(ev, ctx),
    note: ev.note,
    citations: ev.citations,
    coords: eventCoords(ev, ctx),
  };
}

function familyLabel(f: Family, db: Database): string {
  const names = [f.husband, f.wife]
    .filter((id): id is string => id != null)
    .map((id) => db.individuals.get(id))
    .filter((p): p is Person => p != null)
    .map(displayName);
  return names.length ? names.join(' ⚭ ') : 'Familie';
}

/**
 * Baut das read-only Detail-Modell einer Person. Gibt null zurück, wenn die id im
 * aktuellen Datenbestand fehlt — der definierte Fallback aus Spec 21 §5 ("bei
 * fehlender Entität → definierter Fallback, nie stiller Abbruch") liegt dann bei der
 * aufrufenden Komponente (Leerzustand statt Absturz).
 */
export function buildPersonDetail(
  db: Database,
  ctx: PlaceContext,
  personId: string,
): PersonDetailModel | null {
  const person = db.individuals.get(personId);
  if (!person) return null;

  const events: EventRow[] = [];
  const special: [string, Event][] = [
    ['BIRT', person.birth],
    ['CHR', person.chr],
    ['DEAT', person.death],
    ['BURI', person.buri],
  ];
  for (const [tag, ev] of special) {
    const row = toEventRow(tag, SPECIAL_LABELS[tag], ev, ctx);
    if (row) events.push(row);
  }
  person.events.forEach((ev, i) => {
    const row = toEventRow(`ev-${i}`, ev.eventType || ev.type || 'Ereignis', ev, ctx);
    if (row) events.push(row);
  });

  const families: FamilyNavRow[] = [];
  for (const familyId of person.parentIn) {
    const f = db.families.get(familyId);
    if (!f) continue;
    const members = [f.husband, f.wife]
      .filter((id): id is string => id != null && id !== personId)
      .map((id) => ({ personId: id, name: displayName(db.individuals.get(id)!) }))
      .filter((m) => m.name);
    families.push({ familyId, role: 'parentIn', label: familyLabel(f, db), members });
  }
  for (const link of person.childOf) {
    const f = db.families.get(link.familyId);
    if (!f) continue;
    const members = [f.husband, f.wife]
      .filter((id): id is string => id != null)
      .map((id) => ({ personId: id, name: displayName(db.individuals.get(id)!) }))
      .filter((m) => m.name);
    families.push({ familyId: link.familyId, role: 'childOf', label: familyLabel(f, db), members });
  }

  return { person, events, families };
}
