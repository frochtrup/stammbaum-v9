// ui/views/place/place-detail-model.ts — reiner Orts-Steckbrief (Spec 20 §1.7 [K]:
// "Ereignisse nach Typ, Quellen, … periodengerechte Verwaltungszeitlinie"). SVG-
// Namens-Zeitstrahl + Mini-Karte sind AUSSER SCOPE (imperative Inseln, Spec 20 §1.9/
// §1.10 — anderer Bauabschnitt); hier nur eine textuelle pnames-Liste als Platzhalter.
// Liest AUSSCHLIESSLICH über core-Chokepoints (eventPlaceId) — Ereignisse, die dieses
// PlaceObject referenzieren, werden durch einmaliges Scannen aller Personen-/Familien-
// Events ermittelt (kein v8-artiger `collectPlaces`-Cache nötig für diese Scheibe;
// wird bei Performance-Bedarf ein Folge-Schritt, s. Auftrag "Vereinfachen vor Erfinden").
import type { Citation, Database, Event, HofId, PlaceId } from '../../../core/model/types';
import type { PlaceContext, PlaceObject } from '../../../core/places';
import { eventHofId, eventPlaceId, eventYear, jahresBeginn, normPlaceName, tagesOrdinal } from '../../../core/places';
import { isEventPresent } from '../../../core/model';
import { formatDateForDisplay } from '../../../core/model/gedcom-date';
import { displayName, eventYearLabel } from '../../shell/person-display';
import { groupByKey, type EventGroup } from '../../shell/event-grouping';
import { eventTypeLabel } from '../../shell/event-labels';

export interface PlaceEventRow {
  key: string;
  eventType: string;
  label: string;
  /** NUR das Jahr — der Ortsname wird bewusst NICHT wiederholt: diese Seite IST der Ort
   *  (Spec 21 §10h, "eigene Identität nicht dreifach zurückspiegeln"). */
  year: string;
  citations: Citation[];
  ownerId: string;
  ownerKind: 'person' | 'family';
  ownerLabel: string;
}

export interface PlaceVariantRow {
  value: string;
  from: number | null;
  to: number | null;
}

/**
 * Ein klickbares Kettenglied einer Verwaltungshierarchie (ADR-v9-78 Punkt 3): trägt die
 * Ziel-Id NEBEN dem Anzeigenamen, damit die UI jedes Segment per `goToPlace` navigierbar
 * machen kann, statt eines zusammengesetzten Text-Strings.
 */
export interface ChainSegment {
  id: PlaceId;
  label: string;
}

/**
 * Eine Zeile der vollständigen Hierarchie-Zeitleiste ("Zugehörigkeit nach Jahr", v8-
 * Vorbild `_placeDetailHierarchyTimeline`): die VOLLE Kette (alle Ebenen, nicht nur der
 * direkte Elternteil, OHNE diesen Ort selbst) zu einem Schlüsseljahr. `chain: null`
 * markiert eine Lücke (kein Elternteil zu diesem Jahr dokumentiert — v8: "unbekannt").
 */
export interface HierarchyTimelineRow {
  /** `null` bei der undatierten Zeile (ADR-v9-191) — dort gibt es kein Schlüsseljahr, und
   *  eines zu erfinden wäre genau der Fehler, den diese Zeile behebt. */
  year: number | null;
  /** Beschriftung der ersten Spalte — ein ZEITRAUM, keine Zahl (ADR-v9-181, Spec 20 §1.7).
   *  „ab 1816" für den Regelfall, „bis 1806" für eine nach unten offene Zuordnung, deren
   *  Anfang vor der Überlieferung liegt. `year` bleibt daneben stehen: es ist der
   *  Sortier-/Schlüsselwert, nicht der Anzeigewert. */
  label: string;
  chain: ChainSegment[] | null;
  /** Die Kette wurde an einer mehrdeutigen/undokumentierten höheren Ebene abgeschnitten
   *  (`enclosureIdsAsOf`s `meta.truncated`) — kein eigenes Segment (kein Ziel-Ort), nur
   *  ein „› ?"-Hinweis in der Anzeige. */
  truncated: boolean;
  /** In diesem Jahr galten MEHRERE datierte Zugehörigkeiten; die gezeigte Kette ist die
   *  Wahl der Tie-Break-Regel, nicht die einzige richtige Antwort (`meta.ueberlappt`,
   *  BL-325, Spec 11 §5). Gegenteil von `truncated`: dort fehlt eine Antwort, hier gibt
   *  es zu viele. */
  ueberlappt: boolean;
}

/**
 * Ein Event, dessen `ev.place`-String zwar zum Namen dieses PlaceObject passt (Titel
 * ODER pnames-Variante), das aber noch KEIN `ev.placeId` trägt (String→PlaceObject
 * verknüpfen, Spec 20 §1.7 [K]). Referenz auf das Event selbst (nicht kopiert) — die
 * Verknüpfung mutiert es über linkEventToPlace(event, placeId) in-place.
 */
export interface UnlinkedEventRow {
  key: string;
  event: Event;
  ownerId: string;
  ownerKind: 'person' | 'family';
  ownerLabel: string;
  eventType: string;
  placeText: string;
}

export interface PlaceDetailModel {
  place: PlaceObject;
  /** Ereignisse, gruppiert nach Typ-Schlüssel (BIRT/DEAT/RESI/…), je periodengerecht sortiert. */
  eventsByType: EventGroup<PlaceEventRow>[];
  citations: Citation[];
  variants: PlaceVariantRow[];
  /** [Ort, übergeordnet, …] periodengerecht, inkl. dieses Orts selbst als erstes Segment
   *  (die UI rendert dieses Segment als reinen Text, kein Selbst-Link, ADR-v9-78 Punkt 3). */
  enclosureChain: ChainSegment[];
  /** Vollständige Verwaltungshierarchie ("Zugehörigkeit nach Jahr") — die Kette ALLER
   *  Ebenen zu jedem Schlüsseljahr, inkl. Zeitgrenzen, die sich erst aus den Perioden der
   *  ÜBERGEORDNETEN Ebenen selbst ergeben (v8-Vorbild `_placeDetailHierarchyTimeline`,
   *  Nutzer-Auftrag "Orts-Detailansicht" — Nachtrag ADR-v9-75, ERSETZT die zunächst
   *  zusätzlich gebaute, nur-direkter-Elternteil-Zeitraum-Ansicht — vom Nutzer nach
   *  Ansicht beider Sektionen nebeneinander als redundant erkannt und entfernt, zweiter
   *  Nachtrag). Leer, wenn `place.enclosedBy` leer ist.
   *
   *  **Jahres-Zeilen nur bei eigener datierter Zugehörigkeit (ADR-v9-191).** Fehlt sie,
   *  steht hier die EINE undatierte Zeile, und die Jahres-Zeilen wandern nach
   *  `ancestorHistory` — sie gehören dann dem Elternort. */
  hierarchyTimeline: HierarchyTimelineRow[];
  /** Die Verwaltungsgeschichte der ÜBERGEORDNETEN Ebenen (ADR-v9-191) — dieselben
   *  Jahres-Zeilen wie oben, aber ausdrücklich als fremde Aussage ausgewiesen. Nur
   *  gefüllt, wenn dieser Ort selbst keine datierte Zugehörigkeit trägt. */
  ancestorHistory: HierarchyTimelineRow[];
  /** String→PlaceObject-Kandidaten (Spec 20 §1.7 [K], Re-Import-Erkennung). */
  unlinkedEvents: UnlinkedEventRow[];
}

function ownerLabelFor(db: Database, kind: 'person' | 'family', id: string): string {
  if (kind === 'person') {
    const p = db.individuals.get(id);
    return p ? displayName(p) : '(unbekannte Person)';
  }
  const f = db.families.get(id);
  if (!f) return '(unbekannte Familie)';
  const names = [f.husband, f.wife]
    .filter((pid): pid is string => pid != null)
    .map((pid) => db.individuals.get(pid))
    .filter((p): p is NonNullable<typeof p> => p != null)
    .map(displayName);
  return names.length ? names.join(' ⚭ ') : 'Familie';
}

function collectEvent(
  ev: Event,
  key: string,
  label: string,
  ownerKind: 'person' | 'family',
  ownerId: string,
  db: Database,
  ctx: PlaceContext,
  targetPlaceId: PlaceId,
  out: PlaceEventRow[],
): void {
  if (!isEventPresent(ev)) return;
  if (eventPlaceId(ev, ctx) !== targetPlaceId) return;
  out.push({
    key,
    eventType: ev.eventType || ev.type || label,
    label,
    year: eventYearLabel(ev),
    citations: ev.citations,
    ownerId,
    ownerKind,
    ownerLabel: ownerLabelFor(db, ownerKind, ownerId),
  });
}

function collectUnlinked(
  ev: Event,
  key: string,
  ownerKind: 'person' | 'family',
  ownerId: string,
  db: Database,
  namesNorm: Set<string>,
  out: UnlinkedEventRow[],
): void {
  if (!isEventPresent(ev)) return;
  if (ev.placeId != null) return; // bereits verknüpft
  if (!ev.place) return;
  if (!namesNorm.has(normPlaceName(ev.place))) return;
  out.push({
    key,
    event: ev,
    ownerId,
    ownerKind,
    ownerLabel: ownerLabelFor(db, ownerKind, ownerId),
    eventType: ev.eventType || eventTypeLabel(ev.type || 'EVEN'),
    placeText: ev.place,
  });
}

/**
 * Beschriftung der Jahresspalte einer Zeitleisten-Zeile (ADR-v9-181). `null` heißt
 * "offen", und offen ist richtungsabhängig (Spec 11 §1): `bis` allein = nach unten offen
 * ("seit jeher bis X"), `von` allein = nach oben offen ("ab X"). Reine Funktion — sie
 * kennt weder Ort noch Kette, damit sie an genau EINER Stelle definiert, wie ein
 * Zeitraum in dieser Ansicht heißt.
 */
export function hierarchySpanLabel(von: number | null, bis: number | null): string {
  if (von == null && bis == null) return '';
  if (von == null) return `bis ${bis}`;
  if (bis == null) return `ab ${von}`;
  return von === bis ? String(von) : `${von}–${bis}`;
}

/**
 * Vollständige Verwaltungshierarchie zu jedem Schlüsseljahr ("Zugehörigkeit nach Jahr",
 * v8-Vorbild `_placeDetailHierarchyTimeline`, `legacy-v8/ui-views-place.js`). Zeigt die
 * VOLLE Kette (alle Ebenen, nicht nur der direkte Elternteil) — und die Schlüsseljahre
 * kommen NICHT nur aus `place.enclosedBy` selbst, sondern rekursiv (BFS über den
 * gesamten Eltern-Graphen, `place.enclosedBy[].placeId`) auch aus den Perioden JEDER
 * übergeordneten Ebene (deren eigene `enclosedBy`/`pnames`/
 * `existsFrom`/`existsTo`) — ein Wechsel drei Ebenen höher erzeugt hier also ebenfalls
 * eine neue Zeile, auch wenn die direkte Elternschaft dieses Orts unverändert blieb.
 * Konsekutive Schlüsseljahre mit IDENTISCHER voller Kette werden zu einer Zeile
 * zusammengefasst; Lücken (kein Elternteil zu diesem Jahr dokumentiert) erzeugen genau
 * EINE "unbekannt"-Zeile pro Lücke, nicht pro Jahr. Reine Funktion, deterministisch.
 *
 * Eine **nach unten offene** Zuordnung (`from == null` bei gesetztem `to`) ist ein
 * Zeitraum, kein fehlender Anfang (ADR-v9-181, Spec 11 §1). Sie wirkt hier zweimal: sie
 * hebt die untere Klemme auf (ein Ort ohne dokumentierten Anfang klemmt nichts weg), und
 * sie beschriftet die erste Zeile mit "bis …" statt mit einem Punktjahr. Ohne das fiel
 * die gesamte Periode aus der Ansicht — `docStart` entstand nur aus Einträgen MIT `from`
 * und warf alle früheren Schlüsseljahre weg (BL-249).
 */
function buildHierarchyTimeline(
  ctx: PlaceContext,
  placeId: PlaceId,
  place: PlaceObject,
): HierarchyTimelineRow[] {
  const encs = place.enclosedBy;
  if (!encs.length) return [];

  // Schlüsselpunkte rekursiv aus dem gesamten Eltern-Graphen sammeln (BFS, Zyklen-sicher).
  //
  // BL-324: ein Punkt ist ein TAGES-Ordinal, kein Jahr. Wo ein Stichtag erfasst ist
  // („1 OCT 1512"), ist er der Schlüsselpunkt; sonst der 1. Januar des Jahres — dann
  // verhält sich alles wie zuvor. Erst dadurch wird die Zeile ENTSCHEIDBAR: die Abfrage
  // unten fragt nach EINEM Tag, nicht nach einem ganzen Jahr, in dem beide Perioden
  // gelten. Der Rohtext wandert mit, weil nur er die Beschriftung tragen kann.
  const keyPunkte = new Map<number, string | null>();
  const merke = (jahr: number | null, roh: string | null | undefined): void => {
    const tag = tagesOrdinal(roh);
    if (tag != null) {
      keyPunkte.set(tag, roh ?? null);
      return;
    }
    if (jahr != null && !keyPunkte.has(jahresBeginn(jahr))) keyPunkte.set(jahresBeginn(jahr), null);
  };
  const visited = new Set<PlaceId>();
  const collectYears = (pid: PlaceId | null): void => {
    if (!pid || visited.has(pid)) return;
    visited.add(pid);
    const p = ctx.places.byId(pid);
    if (!p) return;
    for (const e of p.enclosedBy) {
      merke(e.from, e.fromDate);
      merke(e.to, e.toDate);
      collectYears(e.placeId);
    }
    for (const pn of p.pnames) {
      merke(pn.from, pn.fromDate);
      merke(pn.to, pn.toDate);
    }
    // 'existsFrom'/'existsTo' bleiben Jahres-Skalare (BL-324, s. core/places/zeitbezug.ts).
    merke(p.existsFrom, null);
    merke(p.existsTo, null);
  };
  collectYears(placeId);

  // Auf die Existenzdaten DIESES Orts + den dokumentierten enclosedBy-Zeitraum klemmen.
  const exFrom = place.existsFrom;
  const exTo = place.existsTo;
  const withFrom = encs.filter((e) => e.from != null);
  // Nach unten offen (`from == null` BEI GESETZTEM `to`) — nicht zu verwechseln mit
  // undatiert (`from == null && to == null`, jederzeit gültig). Von mehreren gilt der mit
  // dem spätesten `to`: er deckt den längsten Anfang ab.
  const offenerAnfang = encs.reduce<{ to: number } | null>(
    (best, e) =>
      e.from == null && e.to != null && (best == null || e.to > best.to) ? { to: e.to } : best,
    null,
  );
  // Ein vorne offener Eintrag HEBT die untere Klemme auf, statt sie zu verschieben: er hat
  // definitionsgemäß keinen dokumentierten Anfang. `Math.min` über nur die datierten
  // Einträge ergäbe hier den Beginn der NACHFOLGENDEN Zuordnung — und schnitte damit
  // ausgerechnet die Periode weg, die dargestellt werden soll (BL-249).
  const docStart = offenerAnfang
    ? null
    : withFrom.length
      ? Math.min(...withFrom.map((e) => e.from as number))
      : null;
  const hasOpenEnd = encs.some((e) => e.to == null);
  const docEnd = hasOpenEnd ? null : encs.length ? Math.max(...encs.map((e) => e.to ?? 0)) : null;

  const sortedKeyPunkte = [...keyPunkte.keys()]
    .sort((a, b) => a - b)
    .filter((punkt) => {
      const y = Math.trunc(punkt / 10000);
      return (
        (exFrom == null || y >= exFrom) &&
        (exTo == null || y <= exTo) &&
        (docStart == null || y >= docStart) &&
        (docEnd == null || y <= docEnd)
      );
    });
  if (sortedKeyPunkte.length < 1) return [];

  const rows: HierarchyTimelineRow[] = [];
  let lastKey: string | null = null;
  let inGap = false;
  for (const punkt of sortedKeyPunkte) {
    const year = Math.trunc(punkt / 10000);
    const roh = keyPunkte.get(punkt) ?? null;
    // EIN Tag, kein Jahr: nur so kann die Antwort eindeutig sein, wo Stichtage erfasst
    // sind. Ohne Stichtag ist der Punkt der 1. Januar — dann treffen wie bisher beide
    // Perioden eines geteilten Grenzjahres, und der ⚠-Hinweis (BL-325) bleibt zu Recht.
    const bezug = { von: punkt, bis: punkt };
    // Beschriftung: der Stichtag, wo es einen gibt — sonst das Jahr wie zuvor.
    const beschriftung = roh ? `ab ${formatDateForDisplay(roh)}` : hierarchySpanLabel(year, null);
    const meta = { truncated: false, ueberlappt: false };
    // Dieselbe periodengerechte ID-Kette wie enclosureChainAsOf (das ist intern nichts
    // anderes als enclosureIdsAsOf + resolveAsOf pro Knoten, ADR-v9-78 Punkt 3) — hier
    // direkt über die ID-Variante gebaut, damit jedes Segment eine klickbare Ziel-Id trägt.
    const ids = ctx.places.enclosureIdsAsOf(placeId, bezug, meta).slice(1);
    if (!ids.length) {
      if (!inGap) {
        rows.push({ year, label: beschriftung, chain: null, truncated: false, ueberlappt: false });
        inGap = true;
      }
      lastKey = null;
      continue;
    }
    inGap = false;
    const chain: ChainSegment[] = ids
      .map((id) => {
        const label = ctx.places.resolveAsOf(id, bezug);
        return label != null ? { id, label } : null;
      })
      .filter((s): s is ChainSegment => s != null);
    // Dedup-Schlüssel spiegelt exakt das, was gerendert würde (id UND periodengerechter
    // Name je Segment) — identisch zum vormaligen String-Vergleich (chain.join(' › ')),
    // nur jetzt strukturiert statt als zusammengesetzter Text.
    const key = chain.map((s) => `${s.id}:${s.label}`).join('|') + (meta.truncated ? '|trunc' : '') + (meta.ueberlappt ? '|ueb' : '');
    if (key === lastKey) continue;
    lastKey = key;
    rows.push({ year, label: beschriftung, chain, truncated: meta.truncated, ueberlappt: meta.ueberlappt });
  }

  // Die ERSTE Zeile trägt "bis …", wenn eine nach unten offene Zuordnung sie regiert —
  // ihr Anfang liegt vor der Überlieferung, ein Punktjahr davor wäre eine erfundene
  // Datierung (ADR-v9-181, verworfene Alternative (a)). Die Obergrenze ist der frühere
  // der beiden Werte: das `to` der Zuordnung, oder das Jahr vor der nächsten Zeile —
  // wechselt eine ÜBERGEORDNETE Ebene noch innerhalb der offenen Periode, endet die
  // Aussage dieser Zeile dort, nicht erst bei `to`.
  // `year != null` ist hier Formsache: jede Zeile DIESER Funktion stammt aus
  // `sortedKeyYears`, trägt also ein echtes Jahr. `null` kann nur die undatierte Zeile
  // (ADR-v9-191), und die entsteht anderswo.
  if (offenerAnfang && rows.length > 0 && rows[0].year != null && rows[0].year <= offenerAnfang.to) {
    const naechste = rows[1]?.year;
    const grenze = naechste != null ? Math.min(offenerAnfang.to, naechste - 1) : offenerAnfang.to;
    rows[0] = { ...rows[0], label: hierarchySpanLabel(null, grenze) };
  }
  return rows;
}

/**
 * Trägt der Ort eine EIGENE datierte Zugehörigkeit? (ADR-v9-191, Spec 11 §1: `from` ODER
 * `to` gesetzt — beides `null` heißt „undatiert, jederzeit gültig".)
 *
 * Das ist die Trennlinie, an der die Jahres-Zeilen ihren Eigentümer wechseln. Ohne eine
 * eigene Datierung stammt JEDES Schlüsseljahr der Zeitleiste aus einer übergeordneten
 * Ebene (`buildHierarchyTimeline` sammelt sie per BFS über den ganzen Elterngraphen), und
 * die undatierte eigene Zuordnung gilt „jederzeit" — sie wird also auf jedes fremde Jahr
 * projiziert. Das erzeugt zwei verschiedene Unwahrheiten: eine erfundene Datierung („ab
 * 1180" über einem undatierten Eintrag) und eine vorgetäuschte lokale Veränderung (eine
 * Zeile je Elternwechsel liest sich als „hier hat sich etwas geändert"). Am Realbestand
 * betraf das 66 von 171 unangereicherten Orten.
 */
export function hasOwnDatedEnclosure(place: PlaceObject): boolean {
  return place.enclosedBy.some((e) => e.from != null || e.to != null);
}

/**
 * Die EINE undatierte Zeile (ADR-v9-191): sie nennt genau das, was über DIESEN Ort
 * dokumentiert ist — seine direkten Elternorte, ohne Jahr. Bewusst nicht die volle Kette:
 * die Ebenen darüber sind Aussagen der Eltern und stehen in `ancestorHistory`.
 * Namen periodenunabhängig (`resolveAsOf(id, null)` → `title`) — es gibt hier kein Jahr,
 * zu dem aufzulösen wäre.
 *
 * **Sie erscheint nur, wenn sie etwas hinzufügt** (Spec 21 §10 f/h — eine Detail-Sektion
 * wiederholt nicht, was daneben schon steht). Das ist der Fall, wenn es eine geerbte
 * Historie GIBT (dann ist die Zeile die Grenze zwischen „meins" und „deren") oder wenn
 * mehrere Eltern gleichzeitig gelten (nach einem Merge, ADR-v9-72 — die „Aktuell:"-Kette
 * zeigt davon nur einen). Bei einem einzelnen undatierten Elter ohne eigene Geschichte
 * sagt die „Aktuell:"-Kette bereits alles Bekannte, und nichts Falsches wird behauptet.
 * Ein Komponententest hatte genau diese Verdopplung gefangen.
 */
function buildUndatedEnclosureRow(
  ctx: PlaceContext,
  place: PlaceObject,
  hatAhnenGeschichte: boolean,
): HierarchyTimelineRow[] {
  const chain: ChainSegment[] = [];
  const seen = new Set<PlaceId>();
  for (const e of place.enclosedBy) {
    if (e.placeId == null || seen.has(e.placeId)) continue;
    seen.add(e.placeId);
    const label = ctx.places.resolveAsOf(e.placeId, null);
    if (label != null) chain.push({ id: e.placeId, label });
  }
  if (!chain.length) return [];
  if (!hatAhnenGeschichte && chain.length < 2) return [];
  return [{ year: null, label: 'undatiert', chain, truncated: false, ueberlappt: false }];
}

/**
 * Die Verwaltungsgeschichte der ÜBERGEORDNETEN Ebenen (ADR-v9-191) — leer, sobald der Ort
 * eine eigene datierte Zugehörigkeit trägt: dann sind die Jahres-Zeilen Aussagen über IHN
 * und stehen in `hierarchyTimeline`.
 *
 * Die Zeilen selbst sind dieselben wie dort; was sich ändert, ist die Zuschreibung. Unter
 * der Überschrift „Geschichte der übergeordneten Ebenen" ist „ab 1180: Oberpfalz ›
 * Herzogtum Bayern" eine wahre Aussage über die Oberpfalz — unter dem Namen von Erkelsdorf
 * war sie eine erfundene über Erkelsdorf. Die Information geht nicht verloren, sie bekommt
 * ihren Eigentümer zurück.
 */
export function buildAncestorHistory(
  ctx: PlaceContext,
  placeId: PlaceId,
  place: PlaceObject,
): HierarchyTimelineRow[] {
  if (hasOwnDatedEnclosure(place)) return [];
  return buildHierarchyTimeline(ctx, placeId, place);
}

/**
 * Baut den read-only Steckbrief eines PlaceObject. Gibt null zurück, wenn die id im
 * aktuellen Datenbestand fehlt (definierter Fallback, Spec 21 §5).
 */
export function buildPlaceDetail(db: Database, ctx: PlaceContext, placeId: PlaceId): PlaceDetailModel | null {
  const place = db.placeObjects.get(placeId);
  if (!place) return null;

  const rows: PlaceEventRow[] = [];

  for (const p of db.individuals.values()) {
    collectEvent(p.birth, `${p.id}-BIRT`, eventTypeLabel('BIRT'), 'person', p.id, db, ctx, placeId, rows);
    collectEvent(p.chr, `${p.id}-CHR`, eventTypeLabel('CHR'), 'person', p.id, db, ctx, placeId, rows);
    collectEvent(p.death, `${p.id}-DEAT`, eventTypeLabel('DEAT'), 'person', p.id, db, ctx, placeId, rows);
    collectEvent(p.buri, `${p.id}-BURI`, eventTypeLabel('BURI'), 'person', p.id, db, ctx, placeId, rows);
    p.events.forEach((ev, i) => {
      collectEvent(ev, `${p.id}-ev-${i}`, ev.eventType || eventTypeLabel(ev.type || 'EVEN'), 'person', p.id, db, ctx, placeId, rows);
    });
  }

  for (const f of db.families.values()) {
    collectEvent(f.engagement, `${f.id}-ENGA`, eventTypeLabel('ENGA'), 'family', f.id, db, ctx, placeId, rows);
    collectEvent(f.marriage, `${f.id}-MARR`, eventTypeLabel('MARR'), 'family', f.id, db, ctx, placeId, rows);
    f.events.forEach((ev, i) => {
      collectEvent(ev, `${f.id}-ev-${i}`, ev.eventType || eventTypeLabel(ev.type || 'EVEN'), 'family', f.id, db, ctx, placeId, rows);
    });
  }

  // Gruppen-Header übersetzt (Nutzer-Fund 2026-07-10, INV-UI-4, event-labels.ts): ein
  // bekannter Roh-Tag ("RESI") wird zum deutschen Wort ("Wohnort"); ein bereits freier
  // TYPE-Text (z. B. "Schule", nicht in EVENT_TYPE_LABELS) kommt unverändert durch
  // (eventTypeLabel ist ein Passthrough-Fallback) — die GRUPPIERUNG selbst (welche Zeilen
  // zusammengehören) bleibt unverändert, nur die ANZEIGE des Gruppenschlüssels ändert sich.
  const eventsByType = groupByKey(rows, (row) => eventTypeLabel(row.eventType));

  // Quellen: alle Zitate der Events, die diesen Ort referenzieren, dedupliziert per sourceId.
  const citationsBySource = new Map<string, Citation>();
  const collectCitations = (evs: Event[]) => {
    for (const ev of evs) {
      if (!isEventPresent(ev)) continue;
      if (eventPlaceId(ev, ctx) !== placeId) continue;
      for (const cit of ev.citations) {
        if (!citationsBySource.has(cit.sourceId)) citationsBySource.set(cit.sourceId, cit);
      }
    }
  };
  for (const p of db.individuals.values()) {
    collectCitations([p.birth, p.chr, p.death, p.buri, ...p.events]);
  }
  for (const f of db.families.values()) {
    collectCitations([f.engagement, f.marriage, ...f.events]);
  }

  const variants: PlaceVariantRow[] = place.pnames.map((pn) => ({ value: pn.value, from: pn.from, to: pn.to }));

  // "Aktuell:"-Kette bewusst zum heutigen Kalenderjahr aufgelöst, NICHT year=null —
  // year=null würde in einer periodenkorrekten Registry lediglich enclosedBy[0] (reine
  // Einfüge-/Merge-Reihenfolge) liefern, nicht die tatsächlich zum heutigen Datum gültige
  // Kette (Bugfix 2026-07-12: bei mehrfach gemergten Orten mit mehreren datierten
  // enclosedBy-Perioden wich "Aktuell" dadurch von der letzten Zeile der vollen
  // Jahres-Zeitleiste unten ab — beide MÜSSEN für das jeweils aktuelle Jahr übereinstimmen).
  // Dieselbe periodengerechte ID-Kette wie enclosureChainAsOf (ADR-v9-78 Punkt 3: keine
  // neue Kern-Berechnung, nur die vorhandenen id-basierten Chokepoints statt der
  // Namens-Variante genutzt) — inkl. dieses Orts selbst als erstes Segment.
  const currentYear = new Date().getFullYear();
  const enclosureChain: ChainSegment[] = ctx.places
    .enclosureIdsAsOf(placeId, currentYear)
    .map((id) => {
      const label = ctx.places.resolveAsOf(id, currentYear);
      return label != null ? { id, label } : null;
    })
    .filter((s): s is ChainSegment => s != null);
  // ADR-v9-191: die Jahres-Zeilen gehören dem Ort nur, wenn er selbst datiert ist.
  const ancestorHistory = buildAncestorHistory(ctx, placeId, place);
  const hierarchyTimeline = hasOwnDatedEnclosure(place)
    ? buildHierarchyTimeline(ctx, placeId, place)
    : buildUndatedEnclosureRow(ctx, place, ancestorHistory.length > 0);

  // String→PlaceObject-Kandidaten: Events, deren rohes ev.place zum Titel ODER einer
  // pnames-Variante dieses PlaceObject normalisiert passt, aber noch ohne placeId sind.
  const namesNorm = new Set([place.title, ...place.pnames.map((p) => p.value)].map(normPlaceName).filter(Boolean));
  const unlinkedEvents: UnlinkedEventRow[] = [];
  if (namesNorm.size > 0) {
    for (const p of db.individuals.values()) {
      collectUnlinked(p.birth, `${p.id}-BIRT`, 'person', p.id, db, namesNorm, unlinkedEvents);
      collectUnlinked(p.chr, `${p.id}-CHR`, 'person', p.id, db, namesNorm, unlinkedEvents);
      collectUnlinked(p.death, `${p.id}-DEAT`, 'person', p.id, db, namesNorm, unlinkedEvents);
      collectUnlinked(p.buri, `${p.id}-BURI`, 'person', p.id, db, namesNorm, unlinkedEvents);
      p.events.forEach((ev, i) => collectUnlinked(ev, `${p.id}-ev-${i}`, 'person', p.id, db, namesNorm, unlinkedEvents));
    }
    for (const f of db.families.values()) {
      collectUnlinked(f.engagement, `${f.id}-ENGA`, 'family', f.id, db, namesNorm, unlinkedEvents);
      collectUnlinked(f.marriage, `${f.id}-MARR`, 'family', f.id, db, namesNorm, unlinkedEvents);
      f.events.forEach((ev, i) => collectUnlinked(ev, `${f.id}-ev-${i}`, 'family', f.id, db, namesNorm, unlinkedEvents));
    }
  }

  return {
    place,
    eventsByType,
    citations: Array.from(citationsBySource.values()),
    variants,
    enclosureChain,
    hierarchyTimeline,
    ancestorHistory,
    unlinkedEvents,
  };
}

// ---------------------------------------------------------------------------------------
// Ortszeitgenossen (Spec 20 §1.7 [S], ADR-v9-78 Punkt 5). Erweitert das Hof-Muster
// "Bewohner UND Eigentümer in EINER zeitlich integrierten, chronologischen Liste"
// (hof-detail-model.ts) auf die Village-Ebene: eine Zeile je (Person × Ereignis), nicht
// je Person — dieselbe Körnung wie HofDetailModel.residents, damit Jahrzehnt-Gruppierung
// und Jahresfenster-Filter über EIN Feld (`year`) funktionieren. Bewusst NICHT Teil von
// buildPlaceDetail: teuer bei Knotenpunkt-Orten (hunderte/tausende Treffer), läuft daher
// nur On-Demand, wenn die UI-Sektion tatsächlich geöffnet wird.
export interface PlaceContemporaryRow {
  key: string;
  personId: string;
  personName: string;
  year: number | null;
  label: string;
  hofId: HofId | null;
  /** null = Ereignis zeigt direkt auf den Ort (kein Hof-Bezug). */
  hofLabel: string | null;
}

/** Zeitfenster-Filter über EREIGNISJAHRE (nicht über geschätzte Lebensspannen — es gibt
 *  keinen Lebensspannen-Schätzer im Kern). Undatierte Zeilen fallen bei aktivem Filter
 *  heraus (kein Jahr = nicht im Fenster nachweisbar). */
export interface PlaceContemporaryFilter {
  refYear: number;
  window: number;
}

export type ContemporaryGroupMode = 'decade' | 'hof' | 'chrono';

function compareContemporaryRows(a: PlaceContemporaryRow, b: PlaceContemporaryRow): number {
  if (a.year == null && b.year == null) return a.personName.localeCompare(b.personName, 'de');
  if (a.year == null) return 1;
  if (b.year == null) return -1;
  if (a.year !== b.year) return a.year - b.year;
  return a.personName.localeCompare(b.personName, 'de');
}

/** `tag` ist der REALE GEDCOM-Tag — Quelle für Label-Übersetzung (`eventTypeLabel`), analog
 *  hof-detail-model.ts/collectResident. Doppelzählung vermeiden: ein Event, dessen
 *  `eventHofId` zu einem Hof DIESES Orts aufgelöst wird, zählt als Hof-Zeile — NICHT
 *  zusätzlich als Ort-Zeile, auch wenn `eventPlaceId` ebenfalls auf diesen Ort zeigt. */
function collectContemporary(
  ev: Event,
  key: string,
  tag: string,
  person: { id: string },
  db: Database,
  ctx: PlaceContext,
  placeId: PlaceId,
  hofLabelsOfPlace: Map<HofId, string>,
  out: PlaceContemporaryRow[],
): void {
  if (!isEventPresent(ev)) return;
  const hofId = eventHofId(ev, ctx);
  const hofLabel = hofId != null ? hofLabelsOfPlace.get(hofId) : undefined;
  if (hofId != null && hofLabel === undefined) {
    // Hof gehört zu einem ANDEREN Ort — für diesen Ort weder Hof- noch Ort-Zeile.
    return;
  }
  if (hofId == null && eventPlaceId(ev, ctx) !== placeId) return;

  const p = db.individuals.get(person.id);
  out.push({
    key,
    personId: person.id,
    personName: p ? displayName(p) : '(unbekannt)',
    year: eventYear(ev),
    label: ev.eventType || eventTypeLabel(tag),
    hofId: hofId ?? null,
    hofLabel: hofLabel ?? null,
  });
}

/**
 * Baut die "Ortszeitgenossen"-Zeilen: alle Personen-Ereignisse, die auf diesen Ort selbst
 * ODER einen seiner Höfe zeigen, chronologisch (undatiert ans Ende). Nur Personen-Events
 * (analog hof-detail-model.ts) — Familien-Events sind außer Scope. `filter` (optional)
 * grenzt auf ein Jahresfenster [refYear-window, refYear+window] ein; undatierte Zeilen
 * fallen bei aktivem Filter heraus.
 */
export function buildPlaceContemporaries(
  db: Database,
  ctx: PlaceContext,
  placeId: PlaceId,
  filter?: PlaceContemporaryFilter | null,
): PlaceContemporaryRow[] {
  const hofLabelsOfPlace = new Map<HofId, string>();
  for (const h of db.hofObjects.values()) {
    if (h.villageId === placeId) hofLabelsOfPlace.set(h.id, h.addrs[0]?.value ?? h.id);
  }

  const rows: PlaceContemporaryRow[] = [];
  for (const p of db.individuals.values()) {
    collectContemporary(p.birth, `${p.id}-BIRT`, 'BIRT', p, db, ctx, placeId, hofLabelsOfPlace, rows);
    collectContemporary(p.chr, `${p.id}-CHR`, 'CHR', p, db, ctx, placeId, hofLabelsOfPlace, rows);
    collectContemporary(p.death, `${p.id}-DEAT`, 'DEAT', p, db, ctx, placeId, hofLabelsOfPlace, rows);
    collectContemporary(p.buri, `${p.id}-BURI`, 'BURI', p, db, ctx, placeId, hofLabelsOfPlace, rows);
    p.events.forEach((ev, i) => {
      collectContemporary(ev, `${p.id}-ev-${i}`, ev.type || 'EVEN', p, db, ctx, placeId, hofLabelsOfPlace, rows);
    });
  }

  rows.sort(compareContemporaryRows);

  if (!filter) return rows;
  const { refYear, window } = filter;
  return rows.filter((r) => r.year != null && r.year >= refYear - window && r.year <= refYear + window);
}

const NO_DECADE_KEY = 'Ohne Jahr';
const DIRECT_AT_PLACE_KEY = 'Direkt am Ort';
const CHRONO_KEY = 'Chronologisch';

function decadeKeyOf(row: PlaceContemporaryRow): string {
  if (row.year == null) return NO_DECADE_KEY;
  return `${Math.floor(row.year / 10) * 10}er`;
}

function hofKeyOf(row: PlaceContemporaryRow): string {
  return row.hofLabel ?? DIRECT_AT_PLACE_KEY;
}

/**
 * Wählbare Gruppierung (ADR-v9-78 Punkt 5/6, Spec 21 §10b): Jahrzehnt (Default) · Hof ·
 * ungruppiert-chronologisch. Reine Erweiterung von `groupByKey` (INV-UI-4) — die
 * Gruppen-REIHENFOLGE wird jeweils explizit numerisch/fachlich vorgegeben (`order`), sonst
 * sortierte `groupByKey` alphabetisch als String ("1900er" vor "990er").
 */
export function groupContemporaries(
  rows: PlaceContemporaryRow[],
  mode: ContemporaryGroupMode,
): EventGroup<PlaceContemporaryRow>[] {
  if (mode === 'chrono') {
    return rows.length > 0 ? [{ type: CHRONO_KEY, rows }] : [];
  }
  if (mode === 'hof') {
    const hofLabels = Array.from(new Set(rows.filter((r) => r.hofLabel != null).map((r) => r.hofLabel as string)));
    hofLabels.sort((a, b) => a.localeCompare(b, 'de'));
    const order = [DIRECT_AT_PLACE_KEY, ...hofLabels];
    return groupByKey(rows, hofKeyOf, order);
  }
  // decade
  const decadeKeys = Array.from(
    new Set(rows.filter((r) => r.year != null).map((r) => Math.floor((r.year as number) / 10) * 10)),
  );
  decadeKeys.sort((a, b) => a - b);
  const order = [...decadeKeys.map((d) => `${d}er`), NO_DECADE_KEY];
  return groupByKey(rows, decadeKeyOf, order);
}
