// ui/views/hof/hof-detail-model.ts — reiner Hof-Steckbrief (Spec 20 §1.8 [K]: "Detail
// mit Bewohnern chronologisch"). Liest AUSSCHLIESSLICH über den eventHofId-Chokepoint
// (Spec 11 §5) — KEIN eigenes String-Aggregat über ev.addr (das wäre eine Parallel-
// Implementierung der Kern-Identitätsauflösung, ADR-v9-18-Lehre).
import type { Database, Event, HofId } from '../../../core/model/types';
import type { HofObject, PlaceContext } from '../../../core/places';
import { eventHofId, eventYear } from '../../../core/places';
import { isEventPresent } from '../../../core/model';
import { displayName } from '../../shell/person-display';
import { groupByKey, type EventGroup } from '../../shell/event-grouping';

export interface HofResidentRow {
  key: string;
  personId: string;
  personName: string;
  eventType: string;
  label: string;
  year: number | null;
}

/** PROP-Ereignisse sind Eigentums-, keine Bewohner-Nachweise (Spec 21 §10j-Aufarbeitung:
 *  die frühere "Bewohner (chronologisch)"-Sektion mischte beides unter einem fachlich
 *  falschen Titel für PROP-Zeilen). Alle anderen HOF_EVENT_TYPES (RESI/CENS) sowie
 *  Lebens-Ereignisse mit hofId/addr (BIRT/CHR/DEAT/BURI) gelten als "Bewohner". */
function hofBucketLabel(eventType: string): string {
  return eventType === 'PROP' ? 'Eigentümer' : 'Bewohner';
}

export interface HofDetailModel {
  hof: HofObject;
  villageId: string;
  villageTitle: string;
  /** "Bewohner"/"Eigentümer", je intern chronologisch (undatiert ans Ende) sortiert
   *  (Spec 21 §10j: RESI/CENS vs. PROP getrennt, nicht mehr eine vermischte Liste). */
  residentGroups: EventGroup<HofResidentRow>[];
  predecessorLabel: string | null;
  successorLabel: string | null;
}

const PERSON_SPECIAL_LABELS: Record<string, string> = {
  BIRT: 'Geburt',
  CHR: 'Taufe',
  DEAT: 'Tod',
  BURI: 'Bestattung',
};

function collectResident(
  ev: Event,
  key: string,
  label: string,
  person: { id: string },
  db: Database,
  ctx: PlaceContext,
  hofId: HofId,
  out: HofResidentRow[],
): void {
  if (!isEventPresent(ev)) return;
  if (eventHofId(ev, ctx) !== hofId) return;
  const p = db.individuals.get(person.id);
  out.push({
    key,
    personId: person.id,
    personName: p ? displayName(p) : '(unbekannt)',
    eventType: ev.eventType || ev.type || label,
    label,
    year: eventYear(ev),
  });
}

/**
 * Baut den read-only Steckbrief eines HofObject. Gibt null zurück, wenn die id im
 * aktuellen Datenbestand fehlt (definierter Fallback, Spec 21 §5).
 */
export function buildHofDetail(db: Database, ctx: PlaceContext, hofId: HofId): HofDetailModel | null {
  const hof = db.hofObjects.get(hofId);
  if (!hof) return null;

  const village = db.placeObjects.get(hof.villageId);

  const rows: HofResidentRow[] = [];
  for (const p of db.individuals.values()) {
    collectResident(p.birth, `${p.id}-BIRT`, PERSON_SPECIAL_LABELS.BIRT, p, db, ctx, hofId, rows);
    collectResident(p.chr, `${p.id}-CHR`, PERSON_SPECIAL_LABELS.CHR, p, db, ctx, hofId, rows);
    collectResident(p.death, `${p.id}-DEAT`, PERSON_SPECIAL_LABELS.DEAT, p, db, ctx, hofId, rows);
    collectResident(p.buri, `${p.id}-BURI`, PERSON_SPECIAL_LABELS.BURI, p, db, ctx, hofId, rows);
    p.events.forEach((ev, i) => {
      collectResident(ev, `${p.id}-ev-${i}`, ev.eventType || ev.type || 'Ereignis', p, db, ctx, hofId, rows);
    });
  }

  rows.sort((a, b) => {
    if (a.year == null && b.year == null) return a.personName.localeCompare(b.personName, 'de');
    if (a.year == null) return 1;
    if (b.year == null) return -1;
    if (a.year !== b.year) return a.year - b.year;
    return a.personName.localeCompare(b.personName, 'de');
  });

  // Gruppierung NACH der chronologischen Sortierung (nicht vorher) — jede Gruppe bleibt
  // dadurch intern chronologisch, wie gefordert (Spec 21 §10j), statt die Reihenfolge
  // durch die Gruppierung selbst zu verlieren.
  const residentGroups = groupByKey(rows, (row) => hofBucketLabel(row.eventType));

  const predecessor = hof.predecessor ? db.hofObjects.get(hof.predecessor) : null;
  const successor = hof.successor ? db.hofObjects.get(hof.successor) : null;

  return {
    hof,
    villageId: hof.villageId,
    villageTitle: village?.title || hof.villageId,
    residentGroups,
    predecessorLabel: predecessor ? predecessor.addrs[0]?.value ?? predecessor.id : null,
    successorLabel: successor ? successor.addrs[0]?.value ?? successor.id : null,
  };
}
