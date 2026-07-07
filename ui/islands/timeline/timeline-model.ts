// ui/islands/timeline/timeline-model.ts — reine, DOM-freie Datenaufbereitung der
// Zeitleiste-Insel (Spec 20 §1.10 [S] "Zeitleiste (Swim-Lane + Dekaden-Modus,
// Mehrpersonen bis 5, historische Ereignisse als Kontext)", Spec 02 §5 imperative Insel,
// Spec 32 §2: "Layout-Berechnung wird über Modell -> Positionen unit-getestet").
//
// INV-ARCH-1: keine Kern-Logik hier (keine Identitätsauflösung/Parsen) — liest
// AUSSCHLIESSLICH über die core/places-Chokepoints (eventPlaceId/eventYear) sowie
// core-Felder direkt (Event/Person/Family). Ortsnamen kommen über denselben Chokepoint-
// Pfad wie person-display.ts (eventPlaceLabel-Äquivalent), damit Zeitleiste und
// Personen-Detail nie auseinanderlaufen.
//
// Verhaltens-Orakel: legacy-v8/ui-timeline.js (`_buildPersonEvents`, `_swimLane`,
// `_resolveSwimOverlaps`, `_renderTlV`-Dekaden-Gruppierung, Konstanten `_TL_PX_EMPTY`/
// `_TL_PX_PER_EV`/`_TL_PX_DEC_MIN`). Portiert die Datenaufbereitung als reine Funktionen;
// das SVG/DOM-Rendering selbst lebt in timeline-view.ts (Trennung Layout<->Rendering,
// Spec 02 §5).
//
// Nachtrag (Stresstest 5 Personen, dicht beieinanderliegende Ereignisse 1848-1940):
// zwei am Code verifizierte Schwachstellen behoben. (1) `SWIM_LANES[].height` war
// unabhängig von Personenzahl/Ereignisdichte konstant — Orakel skaliert wenigstens die
// "life"-Lane mit `numPersons*16`; hier verallgemeinert auf ALLE Lanes über den
// tatsächlichen Sub-Zeilen-Bedarf (`swimLaneHeight`). (2) `_resolveSwimOverlaps`
// (2-Ebenen-`nudge`-Schema, wörtlich portiert) vergleicht neue Chips nur mit dem
// kumulativen `lastRight` des VORHERIGEN Chips, nicht mit allen bereits platzierten —
// bei ≥3 dicht beieinanderliegenden Chips fällt der dritte auf dieselbe Ebene wie der
// erste zurück (durchgerechnet: pxLeft 0/50/100, chipWidth 147 -> Chip1 und Chip3 beide
// nudge=1, überlappen sich). Ersetzt durch `assignOverlapRows` (Greedy Interval
// Scheduling, beliebig viele Sub-Zeilen statt fixer 2).
//
// Bewusste v9-Vereinfachung ggü. Orakel (Vereinfachen vor Erfinden): EIN Modul für
// Swim-Lane- UND Dekaden-Modus statt zweier Insel-Dateien — beide Modi konsumieren
// dieselbe `collectPersonEvents()`-Ausgabe, nur die Gruppierung unterscheidet sich
// (Zeit-Achse vs. Dekaden-Buckets). Das vermeidet eine künstliche Dateigrenze mitten durch
// denselben Event-Sammel-Code (Orakel hatte diese Trennung auch nicht — `_buildPersonEvents`
// wird von beiden Rendering-Zweigen geteilt).
import type { Database, Event, Person, PersonId } from '../../../core/model/types';
import type { PlaceContext } from '../../../core/places';
import { eventPlaceId, eventYear, buildFormString } from '../../../core/places';
import { HIST_EVENTS, type HistEvent } from './historical-events';

/** Swim-Lane-Kategorie (Orakel: `_SL_LANES`-IDs, wörtlich übernommen). */
export type TimelineLaneId = 'life' | 'resi' | 'work' | 'family' | 'church' | 'other' | 'hist';

/** Event-Art innerhalb der Zeitleiste (Orakel: `type`-Feld in `_buildPersonEvents`). */
export type TimelineEventType = 'birth' | 'chr' | 'death' | 'buri' | 'marr' | 'child' | 'event';

export interface TimelinePersonEvent {
  /** Index der Person innerhalb der Mehrpersonen-Auswahl (0 = primäre/erste Person). */
  personIdx: number;
  personId: PersonId;
  year: number | null;
  date: string | null;
  type: TimelineEventType;
  /** Vollständiges Anzeige-Label (Orakel: `label`, inkl. ": Beschreibung"-Suffix). */
  label: string;
  /** Reiner Ereignistitel ohne Beschreibung (Orakel: `title`). */
  title: string;
  desc: string;
  place: string;
  /** GEDCOM-Tag des Rohereignisses (nur bei `type==='event'`), für die Lane-Zuordnung. */
  gedType?: string;
  eventType?: string;
}

/**
 * Ordnet ein Ereignis seiner Swim-Lane zu (Orakel: `_swimLane`, wörtlich übernommene
 * Tag-Listen). Reine Funktion string -> string, deterministisch.
 */
export function swimLane(ev: Pick<TimelinePersonEvent, 'type' | 'gedType' | 'eventType'>): TimelineLaneId {
  if (ev.type === 'birth' || ev.type === 'chr' || ev.type === 'death' || ev.type === 'buri') return 'life';
  if (ev.type === 'marr' || ev.type === 'child') return 'family';
  const t = (ev.gedType || '').toUpperCase();
  const et = (ev.eventType || '').toUpperCase();
  if (['RESI', 'EMIG', 'IMMI', 'NATU'].includes(t)) return 'resi';
  if (['OCCU', 'TITL', 'EDUC', 'GRAD', 'RETI'].includes(t)) return 'work';
  if (t === 'EVEN' && /BESCH[AÄ]FTIGUNG|BERUF|AUSBILDUNG|OCCUPATION|EMPLOYMENT/i.test(et)) return 'work';
  if (['RELI', 'CONF', 'FCOM', 'ORDN', 'CENS', 'MILI', 'ADOP'].includes(t)) return 'church';
  return 'other';
}

const EVENT_LABELS: Record<string, string> = {
  RESI: 'Wohnort',
  EMIG: 'Auswanderung',
  IMMI: 'Einwanderung',
  NATU: 'Einbürgerung',
  OCCU: 'Beruf',
  TITL: 'Titel',
  EDUC: 'Ausbildung',
  GRAD: 'Abschluss',
  RETI: 'Ruhestand',
  RELI: 'Religion',
  CONF: 'Konfirmation',
  FCOM: 'Erstkommunion',
  ORDN: 'Ordination',
  CENS: 'Volkszählung',
  MILI: 'Militärdienst',
  ADOP: 'Adoption',
};

/** Erstes Komma-Segment eines Ortsstrings (Orakel: `_shortPlace`). */
function shortPlace(place: string): string {
  if (!place) return '';
  return (
    place
      .split(',')
      .map((s) => s.trim())
      .find((s) => s) || ''
  );
}

/**
 * Periodengerechter Ortsname eines Events über den Places-Chokepoint (Spec 11 §5),
 * analog `person-display.ts` `eventPlaceLabel` — NIE `ev.place` roh anzeigen, wenn eine
 * Auflösung über `eventPlaceId`/`buildFormString` möglich ist. Fällt auf den rohen,
 * gekürzten Ortsstring zurück, wenn kein PlaceObject auflösbar ist.
 */
function resolvedPlace(ev: Event, ctx: PlaceContext): string {
  const placeId = eventPlaceId(ev, ctx);
  if (placeId != null) {
    const built = buildFormString(ctx.places, placeId, eventYear(ev));
    if (built) return shortPlace(built);
  }
  return shortPlace(ev.place ?? '');
}

/**
 * Sammelt alle Zeitleiste-relevanten Ereignisse einer Person (Sonder-Events BIRT/CHR/
 * DEAT/BURI, reguläre Events, Heirat + Kinder aus den Familien) — Orakel: `_buildPersonEvents`.
 * `personIdx` wird vom Aufrufer (collectMultiPersonEvents) gesetzt; hier immer 0.
 */
export function collectPersonEvents(db: Database, ctx: PlaceContext, personId: PersonId): TimelinePersonEvent[] {
  const person = db.individuals.get(personId);
  if (!person) return [];
  const evs: TimelinePersonEvent[] = [];

  const special: [TimelineEventType, string, Event][] = [
    ['birth', 'Geburt', person.birth],
    ['chr', 'Taufe', person.chr],
    ['death', 'Tod', person.death],
    ['buri', 'Beerdigung', person.buri],
  ];
  for (const [type, label, ev] of special) {
    if (ev.seen && ev.date) {
      evs.push({
        personIdx: 0,
        personId,
        year: eventYear(ev),
        date: ev.date,
        type,
        label,
        title: label,
        desc: '',
        place: resolvedPlace(ev, ctx),
      });
    }
  }

  for (const ev of person.events) {
    const baseLabel = ev.eventType || EVENT_LABELS[ev.type] || ev.type;
    const desc = ev.value || '';
    const label = baseLabel + (desc ? ': ' + desc : '');
    evs.push({
      personIdx: 0,
      personId,
      year: eventYear(ev),
      date: ev.date,
      type: 'event',
      label,
      title: baseLabel,
      desc,
      place: resolvedPlace(ev, ctx),
      gedType: ev.type,
      eventType: ev.eventType || '',
    });
  }

  for (const familyId of person.parentIn) {
    const family = db.families.get(familyId);
    if (!family) continue;
    if (family.marriage.seen && family.marriage.date) {
      const partnerId = person.id === family.husband ? family.wife : family.husband;
      const partner = partnerId ? db.individuals.get(partnerId) : null;
      const partnerName = partner ? partner.surname || partner.given || '' : '';
      const label = 'Heirat' + (partnerName ? ': ' + partnerName : '');
      evs.push({
        personIdx: 0,
        personId,
        year: eventYear(family.marriage),
        date: family.marriage.date,
        type: 'marr',
        label,
        title: 'Heirat',
        desc: partnerName,
        place: resolvedPlace(family.marriage, ctx),
      });
    }
    for (const childId of family.children) {
      const child = db.individuals.get(childId);
      if (!child?.birth.seen) continue;
      const childName = child.given || child.name || childId;
      evs.push({
        personIdx: 0,
        personId,
        year: eventYear(child.birth),
        date: child.birth.date,
        type: 'child',
        label: 'Kind: ' + childName,
        title: 'Kind',
        desc: childName,
        place: resolvedPlace(child.birth, ctx),
      });
    }
  }

  return evs;
}

/** Maximal gleichzeitig vergleichbare Personen (Spec 20 §1.10 [S] "Mehrpersonen bis 5"). */
export const MAX_TIMELINE_PERSONS = 5;

/**
 * Sammelt Ereignisse mehrerer Personen und hängt den jeweiligen `personIdx` an
 * (Orakel: `_renderTimeline` `allPersonEvs = pidArr.flatMap(...)`). `personIds` wird auf
 * `MAX_TIMELINE_PERSONS` gekappt (deckungsgleich mit der UI-Guard-Grenze).
 */
export function collectMultiPersonEvents(
  db: Database,
  ctx: PlaceContext,
  personIds: readonly PersonId[],
): TimelinePersonEvent[] {
  const capped = personIds.slice(0, MAX_TIMELINE_PERSONS);
  const out: TimelinePersonEvent[] = [];
  capped.forEach((personId, idx) => {
    for (const ev of collectPersonEvents(db, ctx, personId)) {
      out.push({ ...ev, personIdx: idx });
    }
  });
  return out;
}

/** Ordnet ein Geburtsjahr in den Kontextbereich der historischen Tabelle ein (±2 Jahre Rand,
 * Orakel: `_HIST_EVENTS.filter(e => e.year >= minYear - 2 && e.year <= maxYear + 2 ...)`),
 * gefiltert auf die aktiven Kategorien. */
export function historicalEventsInRange(
  minYear: number,
  maxYear: number,
  activeCategories: ReadonlySet<HistEvent['cat']>,
): HistEvent[] {
  return HIST_EVENTS.filter(
    (e) => e.year >= minYear - 2 && e.year <= maxYear + 2 && activeCategories.has(e.cat),
  );
}

/** Alle Filter-Kategorien, Standard = alle aktiv (Orakel: `UIState._tlFilters` Default). */
export const ALL_HIST_CATEGORIES: ReadonlySet<HistEvent['cat']> = new Set([
  'war',
  'disease',
  'political',
  'religion',
  'natural',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Swim-Lane-Modus: horizontale Zeitachse, Chip-Positionen + Overlap-Auflösung
// (Orakel: _renderTlH / _resolveSwimOverlaps).
// ─────────────────────────────────────────────────────────────────────────────

export interface LaneDef {
  id: TimelineLaneId;
  label: string;
  /** Basis-Höhe in px (Orakel: `_SL_LANES[].h`). */
  height: number;
}

// Reihenfolge + Basishöhen wörtlich aus dem Orakel (`_SL_LANES`).
export const SWIM_LANES: readonly LaneDef[] = [
  { id: 'life', label: 'Leben', height: 50 },
  { id: 'resi', label: 'Wohnorte', height: 58 },
  { id: 'work', label: 'Beruf', height: 58 },
  { id: 'family', label: 'Familie', height: 62 },
  { id: 'church', label: 'Kirche', height: 58 },
  { id: 'other', label: 'Sonstiges', height: 58 },
  { id: 'hist', label: 'Geschichte', height: 44 },
];

export interface SwimChip extends TimelinePersonEvent {
  /** Pixel-Position auf der Zeitachse relativ zum Lane-Body-Anfang; `null` = undatiert. */
  pxLeft: number | null;
  /** Sub-Zeilen-Index innerhalb der Lane (0-basiert, 0 = erste/oberste Sub-Zeile).
   * Ersetzt das frühere 2-Ebenen-`nudge`-Schema (s. `assignOverlapRows`): bei ≥3 eng
   * beieinanderliegenden Chips reicht eine feste obere/untere Ebene nicht aus — ein
   * dritter, nah liegender Chip braucht eine DRITTE Sub-Zeile statt auf eine der beiden
   * bereits belegten zurückzufallen (verifizierter Bug, s. Kommentar bei `assignOverlapRows`). */
  row: number;
}

export interface HistChip extends HistEvent {
  pxLeft: number;
  /** Sub-Zeilen-Index innerhalb der Hist-Lane, analog SwimChip.row. */
  row: number;
}

export interface SwimLaneResult {
  /** Nur Lanes mit tatsächlichem Inhalt (Orakel: "Leben" immer, andere nur wenn belegt). */
  lanes: LaneDef[];
  chipsByLane: Record<TimelineLaneId, SwimChip[]>;
  histChips: HistChip[];
  minYear: number;
  maxYear: number;
  /** Pixel pro Jahr, für Jahres-Ticks/Chip-Platzierung durch die Rendering-Schicht. */
  pxPerYear: number;
  /** Gesamtbreite der Zeitachse in px (Orakel: `totalW`). */
  totalWidth: number;
}

/**
 * Überlappungsauflösung — Greedy Interval Scheduling (analog Kalender-UIs): jeder Chip
 * bekommt die NIEDRIGSTE freie Sub-Zeile, in der er mit KEINEM bereits in dieser
 * Sub-Zeile platzierten Chip kollidiert (nicht nur mit dem unmittelbar vorherigen Chip
 * verglichen). Anzahl benötigter Sub-Zeilen = `Math.max(...rows) + 1`, bestimmt direkt
 * den Höhenbedarf der Lane (s. `swimLaneHeight`).
 *
 * Ersetzt das v8-Orakel `_resolveSwimOverlaps` (2-Ebenen-`nudge`-Schema, abwechselnd
 * `1`/`-1` nur gegen den kumulativen `lastRight` des VORHERIGEN Chips verglichen). Bug
 * am Orakel-Algorithmus durchgerechnet und verifiziert: bei 3 Chips mit `pxLeft` 0/50/100
 * und `chipWidth=147` bekommt Chip 1 `nudge=1`, Chip 2 `nudge=-1` (Kollision mit 1), Chip 3
 * kollidiert mit `lastRight` (von Chip 2, Kante bei `50+147=197 > 100`) und bekommt daher
 * `nudge=1` — dieselbe Ebene wie Chip 1, obwohl Chip 1 und Chip 3 (Abstand 100px < 147px)
 * ebenfalls kollidieren -> sichtbarer Überlapp. Diese Funktion verhindert das strukturell:
 * Chip 3 sieht bei der Suche nach einer freien Zeile explizit nach, ob er mit JEDEM
 * bereits in Zeile 0 platzierten Chip (nicht nur dem letzten) kollidiert, und weicht bei
 * Bedarf in Zeile 2 aus. Mutiert die übergebenen Objekte NICHT (reine Funktion).
 */
export function assignOverlapRows<T extends { pxLeft: number | null; row: number }>(
  chips: readonly T[],
  chipWidth: number,
): T[] {
  const out = chips.map((c) => ({ ...c, row: 0 }));
  // rowRights[r] = rechte Kante (px) des am weitesten reichenden bislang in Sub-Zeile r
  // platzierten Chips. Ein neuer Chip passt in Zeile r, wenn sein pxLeft >= rowRights[r] + Puffer.
  const rowRights: number[] = [];
  for (const c of out) {
    if (c.pxLeft == null) {
      c.row = 0;
      continue;
    }
    let row = 0;
    while (row < rowRights.length && c.pxLeft < rowRights[row] + 6) row++;
    c.row = row;
    rowRights[row] = c.pxLeft + chipWidth;
  }
  return out;
}

/** Anzahl der von `assignOverlapRows` tatsächlich benötigten Sub-Zeilen (min. 1). */
export function overlapRowCount(chips: readonly { row: number }[]): number {
  if (chips.length === 0) return 1;
  return Math.max(...chips.map((c) => c.row)) + 1;
}

// Exportiert (statt modul-privat), weil timeline-view.ts denselben Wert für die
// explizite `.tl-swim-axis`/`.tl-lane`-Breite braucht (Sticky-Fix, s. dortiger
// Kommentar) — eine Quelle für die Label-/Pad-Breite statt eines zweiten `76`-Literals.
export const SWIM_LANE_LABEL_W = 76; // px — sticky Lane-Label-Breite (Orakel: `_SL_LABEL_W`).
const SL_LABEL_W = SWIM_LANE_LABEL_W;
const SL_MIN_PX_Y = 14; // px/Jahr — Mindest-Skalierung (Orakel: `_SL_MIN_PX_Y`).
const SL_CHIP_W = 140; // px — nominale Chip-Breite für Kollisionserkennung (Orakel: `_SL_CHIP_W`).
const SL_PAD_YR = 1.5; // Jahre — Rand links/rechts der Zeitachse (Orakel: `_SL_PAD_YR`).
const SL_HIST_CHIP_W = 88; // px — Kollisionsbreite historischer Chips (Orakel: `_resolveSwimOverlaps(..., 88)`).

// Höhe je zusätzlicher Sub-Zeile (Befund 1+2 hängen zusammen, s. Modul-Kopf-Kommentar):
// `assignOverlapRows` kann jetzt beliebig viele Sub-Zeilen brauchen (statt max. 2 beim
// alten `nudge`-Schema), also muss die Lane-Höhe mitwachsen, sonst hätten die neuen
// Sub-Zeilen keinen Platz und die Chips würden trotz korrekter `row`-Zuweisung wieder
// optisch überlappen. `SL_ROW_H` ist bewusst == Chip-Zeilenhöhe (Chip-Padding 0.15rem*2
// + Zeilenhöhe ≈ 22-24px, hier mit Marge 26px) statt eine zweite Konstante zu erfinden.
export const SL_ROW_H = 26; // px pro Sub-Zeile (Chip-Höhe + Marge).
// Exportiert (statt modul-privat): timeline-view.ts braucht denselben Wert für die
// tatsächliche Chip-/Hist-Chip-`top`-Platzierung (Zeile 0..N per `row * SL_*_ROW_H`),
// damit die Höhenrechnung hier und die Platzierung dort garantiert übereinstimmen —
// zwei getrennte Literale wären eine Wiederholung derselben Konstante (Fehlerquelle).
export const SL_HIST_ROW_H = 18; // px pro Sub-Zeile in der "hist"-Lane (kompaktere Textzeile, Orakel: `histRowH`).
export const SL_LANE_PAD = 12; // px — vertikaler Rand ober-/unterhalb der Sub-Zeilen einer Lane.

/**
 * Lane-Höhe als reine Funktion von Basis-Höhe, Sub-Zeilen-Bedarf und (nur "life")
 * Personenzahl (Befund 1 — Orakel: `_renderTlH` `lifeH = isMulti ? max(50, numPersons*16) : 50`,
 * hier verallgemeinert: JEDE Lane wächst mit ihrem tatsächlichen Sub-Zeilen-Bedarf, nicht
 * nur "life" mit der Personenzahl — bei dichten Wohnort-/Berufs-/Familien-Lanes tritt
 * dieselbe Enge auf wie in "life", s. Aufgabenstellung).
 */
function swimLaneHeight(base: number, rowCount: number, rowH: number, numPersons: number, isLifeLane: boolean): number {
  const byRows = rowCount * rowH + SL_LANE_PAD;
  if (isLifeLane) {
    // Gestaffelte Lebensspannen-Balken (eine Zeile pro Person, Orakel-Verhalten
    // `_renderTlH` life-Lane bei isMulti) UND ggf. zusätzliche Chip-Sub-Zeilen (z. B.
    // mehrere Geburten/Todesfälle knapp beieinander) — beide Bedarfe zählen additiv,
    // die größere Anforderung gewinnt.
    const byPersons = numPersons > 1 ? Math.max(50, numPersons * 16) : 50;
    return Math.max(base, byPersons, byRows);
  }
  return Math.max(base, byRows);
}

/**
 * Baut das vollständige Swim-Lane-Layout: Jahres-Skala, Lane-Zuordnung, Chip-Positionen,
 * Overlap-Auflösung (Orakel: `_renderTlH`, Kernberechnung ohne DOM/CSSOM-Teil — die
 * Pixel-Anwendung passiert erst in timeline-view.ts). `availableWidth` ist die vom
 * Host-Container verfügbare Breite (analog `body.clientWidth` im Orakel); Default
 * genügt für Tests ohne echten DOM-Container.
 */
export function computeSwimLaneLayout(
  events: readonly TimelinePersonEvent[],
  histEvents: readonly HistEvent[],
  availableWidth: number = 800,
): SwimLaneResult {
  const dated = events.filter((e) => e.year !== null) as (TimelinePersonEvent & { year: number })[];
  const undated = events.filter((e) => e.year === null);

  const allYears = dated.map((e) => e.year).concat(histEvents.map((e) => e.year));
  const minYear = allYears.length ? Math.min(...allYears) : 0;
  const maxYear = allYears.length ? Math.max(...allYears) : 0;
  const span = Math.max(maxYear - minYear, 10);
  const availW = Math.max(availableWidth - SL_LABEL_W - 16, 200);

  // Mindest-px/Jahr aus Event-Dichte je Lane (Orakel: `_laneYrs`/`_minDist`).
  const laneYears: Record<TimelineLaneId, number[]> = { life: [], resi: [], work: [], family: [], church: [], other: [], hist: [] };
  for (const ev of dated) laneYears[swimLane(ev)].push(ev.year);
  let minDist = Infinity;
  for (const id of Object.keys(laneYears) as TimelineLaneId[]) {
    const ys = [...laneYears[id]].sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) {
      if (ys[i] > ys[i - 1]) minDist = Math.min(minDist, ys[i] - ys[i - 1]);
    }
  }
  if (minDist === Infinity) minDist = span || 10;

  const pxForFit = availW / (span + SL_PAD_YR * 2);
  const pxForChips = Math.min((SL_CHIP_W + 4) / minDist, 40);
  const pxPerYear = Math.max(pxForFit, pxForChips, SL_MIN_PX_Y);
  const totalWidth = Math.max(Math.ceil((span + SL_PAD_YR * 2 + 1) * pxPerYear) + SL_CHIP_W, availW);
  const yearToX = (y: number): number => Math.round((y - minYear + SL_PAD_YR) * pxPerYear);

  const chipsByLane: Record<TimelineLaneId, SwimChip[]> = {
    life: [],
    resi: [],
    work: [],
    family: [],
    church: [],
    other: [],
    hist: [],
  };
  for (const ev of dated) {
    chipsByLane[swimLane(ev)].push({ ...ev, pxLeft: yearToX(ev.year), row: 0 });
  }
  for (const ev of undated) {
    chipsByLane[swimLane(ev)].push({ ...ev, pxLeft: null, row: 0 });
  }

  const rowCountByLane: Record<TimelineLaneId, number> = {
    life: 1,
    resi: 1,
    work: 1,
    family: 1,
    church: 1,
    other: 1,
    hist: 1,
  };
  for (const id of Object.keys(chipsByLane) as TimelineLaneId[]) {
    chipsByLane[id].sort((a, b) => (a.pxLeft ?? -Infinity) - (b.pxLeft ?? -Infinity));
    chipsByLane[id] = assignOverlapRows(chipsByLane[id], SL_CHIP_W);
    rowCountByLane[id] = overlapRowCount(chipsByLane[id]);
  }

  const histChips: HistChip[] = assignOverlapRows(
    histEvents.map((e) => ({ ...e, pxLeft: yearToX(e.year), row: 0 })),
    SL_HIST_CHIP_W,
  );
  rowCountByLane.hist = overlapRowCount(histChips);

  // Personenzahl aus tatsächlich vorhandenen Ereignissen (nicht aus einem separaten
  // Parameter) — reine Funktion des Modells, deckungsgleich mit Befund 1.
  const numPersons = new Set(events.map((e) => e.personIdx)).size || 1;

  const activeLanes = SWIM_LANES.filter((ln) => {
    if (ln.id === 'life') return true;
    if (ln.id === 'hist') return histChips.length > 0;
    return chipsByLane[ln.id].length > 0;
  }).map((ln) => ({
    ...ln,
    height: swimLaneHeight(
      ln.height,
      rowCountByLane[ln.id],
      ln.id === 'hist' ? SL_HIST_ROW_H : SL_ROW_H,
      numPersons,
      ln.id === 'life',
    ),
  }));

  return {
    lanes: activeLanes,
    chipsByLane,
    histChips,
    minYear,
    maxYear,
    pxPerYear,
    totalWidth,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dekaden-Modus: vertikale Gruppierung nach Jahrzehnt, Höhe proportional zur
// Ereignisdichte (Orakel: _renderTlV).
// ─────────────────────────────────────────────────────────────────────────────

const TL_PX_EMPTY = 36; // Höhe einer leeren Dekade (Orakel: `_TL_PX_EMPTY`).
const TL_PX_PER_EV = 58; // Höhe pro Event innerhalb einer Dekade (Orakel: `_TL_PX_PER_EV`).
const TL_PX_DEC_MIN = 90; // Mindesthöhe einer belegten Dekade (Orakel: `_TL_PX_DEC_MIN`).

export interface DecadeBucket {
  /** Dekaden-Startjahr, z. B. 1850 für "1850er". */
  decadeStart: number;
  personEvents: TimelinePersonEvent[];
  histEvents: HistEvent[];
  /** Höhe in px: leer -> `TL_PX_EMPTY`, sonst `max(count * TL_PX_PER_EV + 20, TL_PX_DEC_MIN)`. */
  height: number;
}

export interface DecadeLayoutResult {
  decades: DecadeBucket[];
  totalHeight: number;
}

/**
 * Gruppiert Ereignisse einer EINZELNEN Person (Dekaden-Modus ist Single-Person, Orakel:
 * "Vertikal: Multi-Person -> nur erste Person + Toast") nach Jahrzehnt, inklusive
 * historischer Kontext-Ereignisse im selben Bereich. Höhe pro Dekade proportional zur
 * Ereignisdichte, mit Mindesthöhe für leere Dekaden (Orakel: `_renderTlV`).
 */
export function computeDecadeLayout(
  personEvents: readonly TimelinePersonEvent[],
  histEvents: readonly HistEvent[],
): DecadeLayoutResult {
  const dated = personEvents.filter((e) => e.year !== null) as (TimelinePersonEvent & { year: number })[];
  if (dated.length === 0) return { decades: [], totalHeight: 0 };

  const minYear = Math.min(...dated.map((e) => e.year));
  const maxYear = Math.max(...dated.map((e) => e.year));
  const decStart = Math.floor(minYear / 10) * 10;
  const decEnd = Math.floor(maxYear / 10) * 10;

  const decades: DecadeBucket[] = [];
  for (let d = decStart; d <= decEnd; d += 10) {
    const pEvs = dated.filter((e) => e.year >= d && e.year < d + 10);
    const hEvs = histEvents.filter((e) => e.year >= d && e.year < d + 10);
    const count = pEvs.length + hEvs.length;
    const height = count ? Math.max(count * TL_PX_PER_EV + 20, TL_PX_DEC_MIN) : TL_PX_EMPTY;
    decades.push({ decadeStart: d, personEvents: pEvs, histEvents: hEvs, height });
  }

  const totalHeight = decades.reduce((s, d) => s + d.height, 0);
  return { decades, totalHeight };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mehrpersonen: deterministische Farbzuordnung je Personen-Index.
// ─────────────────────────────────────────────────────────────────────────────

/** Feste Palette für bis zu `MAX_TIMELINE_PERSONS` Personen (Orakel: `.tl-pc0`..`.tl-pc4`
 * CSS-Klassen, hier als konkrete Farbwerte für die Rendering-Schicht exportiert). */
export const TIMELINE_PERSON_COLORS: readonly string[] = [
  '#c8a84a', // Gold — primäre Person (Design-System-Primärfarbe)
  '#5b9bd5',
  '#4aaa8a',
  '#e07050',
  '#9b7aaa',
];

/** Farbe für den Personen-Index in der Mehrpersonen-Ansicht; deterministisch, zyklisch
 * über die Palette (auch falls `MAX_TIMELINE_PERSONS` in Zukunft erhöht wird). */
export function personColor(idx: number): string {
  return TIMELINE_PERSON_COLORS[idx % TIMELINE_PERSON_COLORS.length];
}

export function personDisplayName(p: Person): string {
  const full = `${p.given} ${p.surname}`.trim();
  return full || p.name || p.id;
}

export type { HistEvent };
