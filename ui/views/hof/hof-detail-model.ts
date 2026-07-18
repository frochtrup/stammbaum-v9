// ui/views/hof/hof-detail-model.ts — reiner Hof-Steckbrief (Spec 20 §1.8 [K]: "Detail
// mit Bewohnern chronologisch"). Liest AUSSCHLIESSLICH über den eventHofId-Chokepoint
// (Spec 11 §5) — KEIN eigenes String-Aggregat über ev.addr (das wäre eine Parallel-
// Implementierung der Kern-Identitätsauflösung, ADR-v9-18-Lehre).
import type { Database, Event, HofId } from '../../../core/model/types';
import type { HofObject, PlaceContext } from '../../../core/places';
import { eventHofId, eventYear, placeDisplayName } from '../../../core/places';
import { isEventPresent } from '../../../core/model';
import { displayName } from '../../shell/person-display';
import { eventTypeLabel } from '../../shell/event-labels';

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
 *  das `role`-Feld je Zeile (Format, nicht Gruppierung). NIMMT den REALEN Tag (nicht
 *  die übersetzte Anzeige) — die Rollen-Klassifikation darf sich nicht durch die
 *  Übersetzung ändern. */
function hofRole(tag: string): HofResidentRole {
  return tag === 'PROP' ? 'Eigentümer' : 'Bewohner';
}

/** Bei gleichem Jahr (oder beide undatiert) steht Eigentümer (PROP) vor Bewohner
 *  (RESI/CENS/Lebens-Ereignis) — Nutzer-Vorgabe 2026-07-10: ein Eigentumswechsel ist
 *  der strukturell vorausgehende Fakt (man wird Eigentümer, dann/dabei Bewohner),
 *  nicht umgekehrt. Innerhalb derselben Rolle bleibt der Name der Tie-Breaker. */
const ROLE_ORDER: Record<HofResidentRole, number> = { Eigentümer: 0, Bewohner: 1 };

function compareByRoleThenName(a: HofResidentRow, b: HofResidentRow): number {
  if (a.role !== b.role) return ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
  return a.personName.localeCompare(b.personName, 'de');
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

/** `tag` ist der REALE GEDCOM-Tag — Quelle für Rollen-Klassifikation (`hofRole`) UND
 *  Label-Übersetzung (`eventTypeLabel`, INV-UI-4). `ev.eventType` (freier TYPE-Text)
 *  hat Priorität für das Label, ändert aber NIE die Rolle. */
function collectResident(
  ev: Event,
  key: string,
  tag: string,
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
    eventType: tag,
    label: ev.eventType || eventTypeLabel(tag),
    year: eventYear(ev),
    role: hofRole(tag),
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
    collectResident(p.birth, `${p.id}-BIRT`, 'BIRT', p, db, ctx, hofId, rows);
    collectResident(p.chr, `${p.id}-CHR`, 'CHR', p, db, ctx, hofId, rows);
    collectResident(p.death, `${p.id}-DEAT`, 'DEAT', p, db, ctx, hofId, rows);
    collectResident(p.buri, `${p.id}-BURI`, 'BURI', p, db, ctx, hofId, rows);
    p.events.forEach((ev, i) => {
      collectResident(ev, `${p.id}-ev-${i}`, ev.type || 'EVEN', p, db, ctx, hofId, rows);
    });
  }

  rows.sort((a, b) => {
    if (a.year == null && b.year == null) return compareByRoleThenName(a, b);
    if (a.year == null) return 1;
    if (b.year == null) return -1;
    if (a.year !== b.year) return a.year - b.year;
    return compareByRoleThenName(a, b);
  });

  const predecessor = hof.predecessor ? db.hofObjects.get(hof.predecessor) : null;
  const successor = hof.successor ? db.hofObjects.get(hof.successor) : null;

  return {
    hof,
    villageId: hof.villageId,
    // Dorf-Anzeigename über den einzigen erlaubten Weg (Spec 11 §5, INV-UI-14).
    villageTitle: village ? placeDisplayName(village) : hof.villageId,
    residents: rows,
    predecessorLabel: predecessor ? predecessor.addrs[0]?.value ?? predecessor.id : null,
    successorLabel: successor ? successor.addrs[0]?.value ?? successor.id : null,
  };
}
