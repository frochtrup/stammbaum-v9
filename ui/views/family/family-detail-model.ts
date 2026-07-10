// ui/views/family/family-detail-model.ts — reine Projektion einer Familie auf ein
// Detail-Modell (Spec 20 §1.5 [K]: "Detail mit anklickbaren Mitgliedern"). Liest
// AUSSCHLIESSLICH über core-Chokepoints/-Prädikate, keine Mutation. "Baum-Sprung" ist
// NICHT Teil dieser Scheibe (imperative Insel, s. Auftrag).
import type { Citation, Database, Event, Family, Person } from '../../../core/model/types';
import type { Coords, PlaceContext } from '../../../core/places';
import { eventCoords, eventPlaceId, eventHofId } from '../../../core/places';
import { isEventPresent } from '../../../core/model';
import { displayName, yearPlaceSummary } from '../../shell/person-display';
import { eventTypeLabel } from '../../shell/event-labels';

export interface FamilyMemberRow {
  personId: string;
  name: string;
  role: 'husband' | 'wife' | 'child';
  /** Jahr+Ort der Geburt (analog PersonPicker.svelte's `.person-picker__field`-
   *  Sekundärzeile — `yearPlaceSummary` ist derselbe Mechanismus, kein neuer,
   *  Nachtrag 2026-07-06 [20 §1.5]). Für Eltern die Sekundärzeile der Box, für Kinder
   *  das sichtbare Geburtsjahr zur eindeutigen Identifikation bei Namensgleichheit. */
  summary: string;
}

export interface FamilyEventRow {
  key: string;
  label: string;
  summary: string;
  /** Typ-spezifischer Zusatztext (z. B. Beruf bei OCCU) — core/model/types.ts Event.value. */
  value: string;
  /** Adresse (RESI/PROP/CENS/OCCU) — core/model/types.ts Event.addr. */
  addr: string;
  note: string;
  citations: Citation[];
  coords: Coords | null;
  /** Für "Ort ansehen"-Link (Cross-Tab-Navigation zum Orte-Tab, ADR-v9-17-Muster). */
  placeId: string | null;
  /** Für "Hof ansehen"-Link (Cross-Tab-Navigation zum Höfe-Tab). */
  hofId: string | null;
}

export interface FamilyDetailModel {
  family: Family;
  label: string;
  members: FamilyMemberRow[];
  events: FamilyEventRow[];
  citations: Citation[];
}

function memberRow(
  id: string | null,
  role: FamilyMemberRow['role'],
  db: Database,
  ctx: PlaceContext,
): FamilyMemberRow | null {
  if (!id) return null;
  const p = db.individuals.get(id);
  if (!p) return null;
  return { personId: id, name: displayName(p), role, summary: yearPlaceSummary(p.birth, ctx) };
}

/** `tag` ist der reale GEDCOM-Tag — Label-Fallback via `eventTypeLabel` (`ui/shell/
 *  event-labels.ts`, INV-UI-4, DIE EINE deutsche Übersetzung), `ev.eventType` (freier
 *  TYPE-Text) hat Priorität, falls gesetzt — analog `person-detail-model.ts`. */
function toEventRow(key: string, tag: string, ev: Event, ctx: PlaceContext): FamilyEventRow | null {
  if (!isEventPresent(ev)) return null;
  return {
    key,
    label: ev.eventType || eventTypeLabel(tag),
    summary: yearPlaceSummary(ev, ctx),
    value: ev.value,
    addr: ev.addr,
    note: ev.note,
    citations: ev.citations,
    coords: eventCoords(ev, ctx),
    placeId: eventPlaceId(ev, ctx),
    hofId: eventHofId(ev, ctx),
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
  const husband = memberRow(family.husband, 'husband', db, ctx);
  if (husband) members.push(husband);
  const wife = memberRow(family.wife, 'wife', db, ctx);
  if (wife) members.push(wife);
  for (const childId of family.children) {
    const child = memberRow(childId, 'child', db, ctx);
    if (child) members.push(child);
  }

  const label = [husband?.name, wife?.name].filter(Boolean).join(' ⚭ ') || 'Unbekannte Familie';

  const events: FamilyEventRow[] = [];
  const special: [string, Event][] = [
    ['ENGA', family.engagement],
    ['MARR', family.marriage],
  ];
  for (const [tag, ev] of special) {
    const row = toEventRow(tag, tag, ev, ctx);
    if (row) events.push(row);
  }
  family.events.forEach((ev, i) => {
    const row = toEventRow(`ev-${i}`, ev.type || 'EVEN', ev, ctx);
    if (row) events.push(row);
  });

  return { family, label, members, events, citations: family.citations };
}

/** Personen-Nachschlage-Helfer für die Komponente (vermeidet doppelte Map-Lookups im Template). */
export function personName(db: Database, id: string): string {
  const p: Person | undefined = db.individuals.get(id);
  return p ? displayName(p) : '(unbekannt)';
}
