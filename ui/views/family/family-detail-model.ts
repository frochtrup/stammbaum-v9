// ui/views/family/family-detail-model.ts — reine Projektion einer Familie auf ein
// Detail-Modell (Spec 20 §1.5 [K]: "Detail mit anklickbaren Mitgliedern"). Liest
// AUSSCHLIESSLICH über core-Chokepoints/-Prädikate, keine Mutation. "Baum-Sprung" ist
// NICHT Teil dieser Scheibe (imperative Insel, s. Auftrag).
import type { Citation, Database, Event, Family, Person } from '../../../core/model/types';
import type { Coords, PlaceContext } from '../../../core/places';
import { eventCoords, eventPlaceId, eventHofId } from '../../../core/places';
import { isEventPresent, isEventEmpty, addrDisplay } from '../../../core/model';
import { displayName, yearPlaceSummary, fullDateLabel, eventPlaceLabel, pedigreeLabel, sortPersonIdsByBirth } from '../../shell/person-display';
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
  /** Kind-Verhältnis-Label (BL-199, PEDI) — nur bei `role === 'child'` und nur bei einem
   *  ABWEICHENDEN Verhältnis gesetzt (adoptiert/Pflege/gesiegelt); leer bei leiblich/leer
   *  und für Eltern (`pedigreeLabel`, INV-UI-4 mit dem Personen-Detail-Eltern-Suffix). */
  pedigree: string;
  /** Die BELEGE DER KINDSCHAFT (`ChildLink.citations`, BL-329) — nur bei `role === 'child'`.
   *  Getrennt von den Familien-Zitaten (`FamilyDetailModel.citations`, die die Ehe belegen):
   *  diese hier belegen, dass DIESE Person Kind DIESER Eltern ist. */
  childCitations: Citation[];
}

export interface FamilyEventRow {
  key: string;
  label: string;
  /** VOLLES, lokalisiertes Datum (`fullDateLabel`, [21 INV-UI-9](
   *  ../../../specs/v9/21-UI-UX.md), ADR-v9-64) — dies ist die EIGENE Ereigniszeile der
   *  Familie (Verlobung/Heirat/generische events[]), nicht eine Disambiguierungs-Liste
   *  (die bleibt bei yearPlaceSummary/Jahr-only, s. FamilyMemberRow.summary oben).
   *  Getrennt von `placeLabel` (ADR-v9-80 Punkt 1, `EventLine.svelte`). */
  dateLabel: string;
  /** GEDCOM-`PHRASE` (`Event.datePhrase`) — kursiv neben dem Datum (BL-197). */
  datePhrase: string;
  /** Alter — bei Familien-Ereignissen stets leer (kein Einzel-Subjekt), nur zur
   *  strukturellen Kompatibilität mit `EventLineRow` (BL-196). */
  age: string;
  /** Periodengerechter Ortsname (`eventPlaceLabel`, ADR-v9-80 Punkt 1) — der Ort-Link-
   *  Text in `EventLine.svelte`. */
  placeLabel: string;
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
  /** `isEventEmpty(ev)` (Nachtrag 2026-07-12, Spec 20 §2 „Generalisiert") — steuert die
   *  generalisierte ✕-Rücknahme: FamilyDetail.svelte zeigt für Verlobung UND jeden
   *  generischen `events[]`-Eintrag ein Rücknahme-Control, SOLANGE dieses Feld `true` ist.
   *  Heirat bleibt außen vor (Spec: "immer offen", keine Rücknahme). */
  empty: boolean;
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
  familyId?: string,
): FamilyMemberRow | null {
  if (!id) return null;
  const p = db.individuals.get(id);
  if (!p) return null;
  // Kind-Verhältnis UND Kindschafts-Belege aus DIESER Familie (INV-P4: beides lebt
  // INDI-seitig am ChildLink, nicht an der Familie).
  const link = role === 'child' && familyId ? p.childOf.find((cl) => cl.familyId === familyId) : undefined;
  return {
    personId: id,
    name: displayName(p),
    role,
    summary: yearPlaceSummary(p.birth, ctx),
    pedigree: pedigreeLabel(link?.pedigree ?? ''),
    childCitations: link?.citations ?? [],
  };
}

/** `tag` ist der reale GEDCOM-Tag — Label-Fallback via `eventTypeLabel` (`ui/shell/
 *  event-labels.ts`, INV-UI-4, DIE EINE deutsche Übersetzung), `ev.eventType` (freier
 *  TYPE-Text) hat Priorität, falls gesetzt — analog `person-detail-model.ts`. */
/**
 * `alwaysShow` (Nachtrag 2026-07-12, Spec 20 §2 „Generalisiert", analog
 * person-detail-model.ts): generische `events[]`-Einträge werden IMMER projiziert, auch
 * wenn `!isEventPresent(ev)` — anders als ENGA/MARR (weiterhin isEventPresent-gated).
 */
function toEventRow(
  key: string,
  tag: string,
  ev: Event,
  ctx: PlaceContext,
  alwaysShow = false,
): FamilyEventRow | null {
  if (!alwaysShow && !isEventPresent(ev)) return null;
  return {
    key,
    label: ev.eventType || eventTypeLabel(tag),
    dateLabel: fullDateLabel(ev),
    datePhrase: ev.datePhrase,
    // Familien-Ereignisse haben kein Einzel-Subjekt → kein Alter (BL-196 nur im Personen-Kontext).
    age: '',
    placeLabel: eventPlaceLabel(ev, ctx),
    value: ev.value,
    addr: addrDisplay(ev),
    note: ev.note,
    citations: ev.citations,
    coords: eventCoords(ev, ctx),
    placeId: eventPlaceId(ev, ctx),
    hofId: eventHofId(ev, ctx),
    empty: isEventEmpty(ev),
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
  // Kinder chronologisch (Nutzer-Wunsch 2026-08-13), Eltern bleiben davor. Derselbe
  // Helfer wie im Personen-Steckbrief; er sortiert eine Kopie (LP-1).
  for (const childId of sortPersonIdsByBirth(db, family.children)) {
    const child = memberRow(childId, 'child', db, ctx, familyId);
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
    const row = toEventRow(`ev-${i}`, ev.type || 'EVEN', ev, ctx, true);
    if (row) events.push(row);
  });

  return { family, label, members, events, citations: family.citations };
}

/** Personen-Nachschlage-Helfer für die Komponente (vermeidet doppelte Map-Lookups im Template). */
export function personName(db: Database, id: string): string {
  const p: Person | undefined = db.individuals.get(id);
  return p ? displayName(p) : '(unbekannt)';
}
