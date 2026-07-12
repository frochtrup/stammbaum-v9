// ui/views/person/person-detail-model.ts — reine Projektion einer Person auf
// Detail-Zeilen (Spec 20 §1.4 [K]: Ereignisse, Quellen-Badges, Geo-Links,
// Familien-Navigationszeilen). Liest AUSSCHLIESSLICH über core-Chokepoints/-Prädikate,
// keine Mutation, keine Feld-Interpretation, die eigentlich in den Kern gehört.
import type { Citation, Database, Event, Family, Person } from '../../../core/model/types';
import type { PlaceContext, Coords } from '../../../core/places';
import { eventCoords, eventPlaceId, eventHofId, eventYear } from '../../../core/places';
import { isEventPresent, isEventEmpty } from '../../../core/model';
import { displayName, yearPlaceSummary, dateSummary } from '../../shell/person-display';
import { eventTypeLabel, eventCategory, EVENT_CATEGORY_ORDER } from '../../shell/event-labels';
import { groupByKey, type EventGroup } from '../../shell/event-grouping';

export interface EventRow {
  key: string;
  label: string;
  /** REALER GEDCOM-Tag (nicht der übersetzte `label`-Text) — für Sortier-/Gruppierungs-
   *  Entscheidungen, die den echten Typ brauchen (z. B. "OCCU vor Beschäftigung
   *  innerhalb Beruf", Nutzer-Vorgabe 2026-07-10), analog `HofResidentRow.eventType`. */
  tag: string;
  /** Kategorie für die gruppierte Anzeige (Nutzer-Vorgabe 2026-07-10, `event-labels.ts`). */
  category: string;
  /** Jahr für die Sortierung innerhalb einer Kategorie (`sortWithinCategory`) — undatiert
   *  = `null`, sortiert ans Ende. */
  year: number | null;
  /** VOLLES, lokalisiertes Datum + Ort (`dateSummary`, [21 INV-UI-9](
   *  ../../../specs/v9/21-UI-UX.md), ADR-v9-64) — dies ist die EIGENE Ereigniszeile der
   *  Person, nicht eine Disambiguierungs-Liste (die bleibt bei yearPlaceSummary/Jahr-only,
   *  s. FamilyNavRow.children unten). */
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
  /** `isEventEmpty(ev)` (Nachtrag 2026-07-12, Spec 20 §2 „Generalisiert") — steuert die
   *  generalisierte ✕-Rücknahme: PersonDetail.svelte zeigt für Taufe/Bestattung UND jeden
   *  generischen `events[]`-Eintrag ein Rücknahme-Control, SOLANGE dieses Feld `true` ist.
   *  Tod bleibt bewusst außen vor (eigene, bereits bestehende Death-spezifische Prüfung
   *  — `value='Y'` zählt dort NICHT als „echte Daten", hier schon). */
  empty: boolean;
}

export interface FamilyNavRow {
  familyId: string;
  role: 'parentIn' | 'childOf';
  label: string;
  /** Anklickbare Gegenpersonen dieser Familie (Partner bzw. Eltern), nie die Person selbst. */
  members: { personId: string; name: string }[];
  /** Nur bei role==='parentIn': Kinder dieser eigenen Familie, ebenfalls anklickbar
   *  (ADR-v9-30 Punkt 6/Nachtrag — "wesentliche Beziehungen" zeigte bisher nur den
   *  Ehepartner, keine Kinder). Bei role==='childOf' immer leer (Geschwister sind
   *  NICHT Teil dieser Zeile — nur Eltern, unverändert). `summary` (Geburtsjahr, via
   *  denselben yearPlaceSummary-Mechanismus wie family-detail-model.ts's Kinder-Zeile,
   *  Nachtrag 2026-07-06 [20 §1.5]) zur eindeutigen Identifikation bei Namensgleichheit —
   *  fehlte hier bisher, obwohl FamilyDetail dieselben Kinder bereits so anzeigt. */
  children: { personId: string; name: string; summary: string }[];
}

export interface PersonDetailModel {
  person: Person;
  events: EventRow[];
  /** `events`, gruppiert in feste Kategorien (Nutzer-Vorgabe 2026-07-10: "primär/
   *  Lebensdaten, educ und grad, dann occu und beschäftigung, dann resi und prop sowie
   *  weitere") — s. `event-labels.ts` `EVENT_CATEGORY_ORDER`. Reihenfolge INNERHALB einer
   *  Kategorie bleibt normalerweise die GEDCOM-Schreibreihenfolge aus `events` (keine
   *  Neusortierung) — AUSSER "Beruf": dort OCCU vor allen anderen (z. B. "Beschäftigung"),
   *  danach chronologisch (`sortWithinCategory`, Nutzer-Vorgabe 2026-07-10). */
  eventGroups: EventGroup<EventRow>[];
  families: FamilyNavRow[];
}

/**
 * `tag` ist der REALE GEDCOM-Tag (z. B. "GRAD", "EDUC", "BIRT") — Quelle für Kategorie
 * UND Label-Fallback. `ev.eventType` (aus dem `TYPE`-Sub-Tag beim Parsen befüllt, s.
 * `core/interop/gedcom-parse.ts::parseEvent`) ist ein freier Anzeige-Text (z. B. "Schule"
 * bei einem `EDUC`/`EVEN`-Ereignis mit `2 TYPE Schule`) und hat PRIORITÄT vor der
 * generischen Übersetzung, wenn gesetzt. Für die Kategorie gilt: ein Tag mit EIGENER
 * Bedeutung (EDUC/GRAD/OCCU/…) entscheidet immer — ein `EDUC`-Ereignis mit TYPE "Schule"
 * bleibt "Bildung". NUR bei kategorie-losen Tags (EVEN/FACT) prüft `eventCategory`
 * zusätzlich den freien Text gegen bekannte Synonyme (Nutzer-Vorgabe 2026-07-10: ein
 * `EVEN`-Ereignis mit TYPE "Beschäftigung" gehört fachlich zu "Beruf", wie ein
 * OCCU-Ereignis — `event-labels.ts::CATEGORY_BY_CUSTOM_TEXT`).
 */
/**
 * `alwaysShow` (Nachtrag 2026-07-12, Spec 20 §2 „Generalisiert"): generische
 * `events[]`-Einträge werden IMMER projiziert, auch wenn `!isEventPresent(ev)` — anders
 * als die vier Sonder-Felder (BIRT/CHR/DEAT/BURI, weiterhin isEventPresent-gated, „nie
 * aktiviert" bleibt unsichtbar). Grund: ein per Pill/„+ Ereignis"-Menü frisch angelegtes,
 * dann leer gespeichertes Event landet in `events[]` (Array-Append, PersonDetail.svelte's
 * `saveModal`) — OHNE diese Ausnahme wäre der Eintrag unsichtbar UND unentfernbar (der
 * ursprüngliche Bug-Befund: „verschwindet nur scheinbar aus der Ansicht, bleibt aber als
 * leerer events[]-Eintrag bestehen"). Mit `alwaysShow` wird die Zeile stattdessen
 * sichtbar+leer gerendert (PersonDetail.svelte's `ev.empty`-Zweig), mit ✕-Rücknahme.
 */
function toEventRow(
  key: string,
  tag: string,
  ev: Event,
  ctx: PlaceContext,
  alwaysShow = false,
): EventRow | null {
  if (!alwaysShow && !isEventPresent(ev)) return null;
  return {
    key,
    label: ev.eventType || eventTypeLabel(tag),
    tag,
    category: eventCategory(tag, ev.eventType),
    year: eventYear(ev),
    summary: dateSummary(ev, ctx),
    value: ev.value,
    addr: ev.addr,
    note: ev.note,
    citations: ev.citations,
    coords: eventCoords(ev, ctx),
    placeId: eventPlaceId(ev, ctx),
    hofId: eventHofId(ev, ctx),
    empty: isEventEmpty(ev),
  };
}

/** Innerhalb der Kategorie "Beruf": OCCU-Zeilen vor allen anderen (z. B. "Beschäftigung"-
 *  Synonym-Zeilen, ADR-v9-58), danach chronologisch (Jahr, undatiert ans Ende) — Nutzer-
 *  Vorgabe 2026-07-10. Andere Kategorien behalten ihre bestehende Reihenfolge
 *  unverändert (Lebensdaten: kanonische GEDCOM-Position; alle übrigen: Einfüge-
 *  Reihenfolge aus `person.events[]`) — nur für "Beruf" explizit angefragt.
 */
function sortWithinCategory(category: string, rows: EventRow[]): EventRow[] {
  if (category !== 'Beruf') return rows;
  return [...rows].sort((a, b) => {
    const aOccu = a.tag === 'OCCU' ? 0 : 1;
    const bOccu = b.tag === 'OCCU' ? 0 : 1;
    if (aOccu !== bOccu) return aOccu - bOccu;
    if (a.year == null && b.year == null) return 0;
    if (a.year == null) return 1;
    if (b.year == null) return -1;
    return a.year - b.year;
  });
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
    const row = toEventRow(tag, tag, ev, ctx);
    if (row) events.push(row);
  }
  person.events.forEach((ev, i) => {
    const row = toEventRow(`ev-${i}`, ev.type || 'EVEN', ev, ctx, true);
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
    const children = f.children
      .map((id) => {
        const child = db.individuals.get(id)!;
        return { personId: id, name: displayName(child), summary: yearPlaceSummary(child.birth, ctx) };
      })
      .filter((c) => c.name);
    families.push({ familyId, role: 'parentIn', label: familyLabel(f, db), members, children });
  }
  for (const link of person.childOf) {
    const f = db.families.get(link.familyId);
    if (!f) continue;
    const members = [f.husband, f.wife]
      .filter((id): id is string => id != null)
      .map((id) => ({ personId: id, name: displayName(db.individuals.get(id)!) }))
      .filter((m) => m.name);
    families.push({ familyId: link.familyId, role: 'childOf', label: familyLabel(f, db), members, children: [] });
  }

  const eventGroups = groupByKey(events, (row) => row.category, EVENT_CATEGORY_ORDER).map((group) => ({
    ...group,
    rows: sortWithinCategory(group.type, group.rows),
  }));

  return { person, events, eventGroups, families };
}
