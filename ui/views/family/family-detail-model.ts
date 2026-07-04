// ui/views/family/family-detail-model.ts — reine Projektion einer Familie auf ein
// Detail-Modell (Spec 20 §1.5 [K]: "Detail mit anklickbaren Mitgliedern"). Liest
// AUSSCHLIESSLICH über core-Chokepoints/-Prädikate, keine Mutation. "Baum-Sprung" ist
// NICHT Teil dieser Scheibe (imperative Insel, s. Auftrag).
import type { Citation, Database, Event, Family, Person } from '../../../core/model/types';
import type { Coords, PlaceContext } from '../../../core/places';
import { eventCoords } from '../../../core/places';
import { isEventPresent } from '../../../core/model';
import { displayName, yearPlaceSummary } from '../../shell/person-display';

const SPECIAL_LABELS: Record<string, string> = {
  MARR: 'Heirat',
  ENGA: 'Verlobung',
};

export interface FamilyMemberRow {
  personId: string;
  name: string;
  role: 'husband' | 'wife' | 'child';
}

export interface FamilyEventRow {
  key: string;
  label: string;
  summary: string;
  note: string;
  citations: Citation[];
  coords: Coords | null;
}

export interface FamilyDetailModel {
  family: Family;
  label: string;
  members: FamilyMemberRow[];
  events: FamilyEventRow[];
  citations: Citation[];
}

function memberRow(id: string | null, role: FamilyMemberRow['role'], db: Database): FamilyMemberRow | null {
  if (!id) return null;
  const p = db.individuals.get(id);
  if (!p) return null;
  return { personId: id, name: displayName(p), role };
}

function toEventRow(key: string, label: string, ev: Event, ctx: PlaceContext): FamilyEventRow | null {
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

/**
 * Baut das read-only Detail-Modell einer Familie. Gibt null zurück, wenn die id im
 * aktuellen Datenbestand fehlt (definierter Fallback, Spec 21 §5 "nie stiller
 * Abbruch") — die Leerzustands-Darstellung liegt bei der aufrufenden Komponente.
 */
export function buildFamilyDetail(db: Database, ctx: PlaceContext, familyId: string): FamilyDetailModel | null {
  const family = db.families.get(familyId);
  if (!family) return null;

  const members: FamilyMemberRow[] = [];
  const husband = memberRow(family.husband, 'husband', db);
  if (husband) members.push(husband);
  const wife = memberRow(family.wife, 'wife', db);
  if (wife) members.push(wife);
  for (const childId of family.children) {
    const child = memberRow(childId, 'child', db);
    if (child) members.push(child);
  }

  const label = [husband?.name, wife?.name].filter(Boolean).join(' ⚭ ') || 'Unbekannte Familie';

  const events: FamilyEventRow[] = [];
  const special: [string, string, Event][] = [
    ['ENGA', SPECIAL_LABELS.ENGA, family.engagement],
    ['MARR', SPECIAL_LABELS.MARR, family.marriage],
  ];
  for (const [tag, evLabel, ev] of special) {
    const row = toEventRow(tag, evLabel, ev, ctx);
    if (row) events.push(row);
  }
  family.events.forEach((ev, i) => {
    const row = toEventRow(`ev-${i}`, ev.eventType || ev.type || 'Ereignis', ev, ctx);
    if (row) events.push(row);
  });

  return { family, label, members, events, citations: family.citations };
}

/** Personen-Nachschlage-Helfer für die Komponente (vermeidet doppelte Map-Lookups im Template). */
export function personName(db: Database, id: string): string {
  const p: Person | undefined = db.individuals.get(id);
  return p ? displayName(p) : '(unbekannt)';
}
