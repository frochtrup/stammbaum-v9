// ui/views/hof/hof-detail-model.ts — reiner Hof-Steckbrief (Spec 20 §1.8 [K]: "Detail
// mit Bewohnern chronologisch"). Liest AUSSCHLIESSLICH über den eventHofId-Chokepoint
// (Spec 11 §5) — KEIN eigenes String-Aggregat über ev.addr (das wäre eine Parallel-
// Implementierung der Kern-Identitätsauflösung, ADR-v9-18-Lehre).
import type { Database, Event, HofId } from '../../../core/model/types';
import type { HofObject, PlaceContext } from '../../../core/places';
import { eventHofId, eventYear } from '../../../core/places';
import { isEventPresent } from '../../../core/model';
import { displayName } from '../../shell/person-display';

export type HofResidentRole = 'Bewohner' | 'Eigentümer';

export interface HofResidentRow {
  key: string;
  personId: string;
  personName: string;
  eventType: string;
  label: string;
  year: number | null;
  role: HofResidentRole;
}

/** PROP-Ereignisse sind Eigentums-, keine Bewohner-Nachweise. Alle anderen
 *  HOF_EVENT_TYPES (RESI/CENS) sowie Lebens-Ereignisse mit hofId/addr
 *  (BIRT/CHR/DEAT/BURI) gelten als "Bewohner". Nachtrag 2026-07-10 (Spec 21 §10j,
 *  revidiert): getrennte Bewohner-/Eigentümer-SEKTIONEN rissen die zeitliche
 *  Erzählung eines Hofes auseinander (wer wohnte wann neben wem, wer besaß ihn zu
 *  welcher Zeit) — jetzt EINE chronologische Liste, Differenzierung nur noch über
 *  das `role`-Feld je Zeile (Format, nicht Gruppierung). */
function hofRole(eventType: string): HofResidentRole {
  return eventType === 'PROP' ? 'Eigentümer' : 'Bewohner';
}

export interface HofDetailModel {
  hof: HofObject;
  villageId: string;
  villageTitle: string;
  /** EINE zeitlich integrierte Liste (Bewohner UND Eigentümer gemeinsam
   *  chronologisch, undatiert ans Ende) — Differenzierung über `row.role`,
   *  nicht über getrennte Sektionen (Nachtrag 2026-07-10, Spec 21 §10j). */
  residents: HofResidentRow[];
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
  const eventType = ev.eventType || ev.type || label;
  out.push({
    key,
    personId: person.id,
    personName: p ? displayName(p) : '(unbekannt)',
    eventType,
    label,
    year: eventYear(ev),
    role: hofRole(eventType),
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

  const predecessor = hof.predecessor ? db.hofObjects.get(hof.predecessor) : null;
  const successor = hof.successor ? db.hofObjects.get(hof.successor) : null;

  return {
    hof,
    villageId: hof.villageId,
    villageTitle: village?.title || hof.villageId,
    residents: rows,
    predecessorLabel: predecessor ? predecessor.addrs[0]?.value ?? predecessor.id : null,
    successorLabel: successor ? successor.addrs[0]?.value ?? successor.id : null,
  };
}
