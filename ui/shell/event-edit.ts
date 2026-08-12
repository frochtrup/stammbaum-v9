// ui/shell/event-edit.ts — geteilte Formular-Feldlogik für EIN Ereignis: strukturiertes
// Datum (Qualifier + Tag/Monat/Jahr, Tristate-Dirty-Tracking), Ort-/Hof-Picker-Verknüpfung
// (linkEventToPlace/linkEventToHof, ADR-v9-42), Tristate-Erhaltung beim Zurückbauen ins
// Event-Objekt (Spec 10 §5.1 "date/place unterscheiden null/''/Wert").
//
// Extrahiert aus PersonForm.svelte UND FamilyForm.svelte (identischer Code an beiden
// Stellen, ADR-v9-30 Punkt 1) — jetzt EINE Quelle, von PersonForm/FamilyForm (volles
// Formular) UND EventEditModal.svelte (Einzel-Ereignis-Bearbeitung aus der Detail-Ansicht)
// genutzt (INV-UI-4). Reine Formular-Logik, kein Domänen-Invariante — bleibt deshalb in
// ui/shell, nicht core/ (INV-ARCH-1: core/ kennt keine Formular-Dirty-Zustände).
//
// PersonForm's `cause` (Todesursache, lebt auf Person.cause, NICHT am Event) ist bewusst
// NICHT Teil von EditableEvent — Family kennt kein Cause-Äquivalent, und cause ist strukturell
// kein Event-Feld (core/model/types.ts Person.cause ist ein eigenständiges Person-Feld).
// Aufrufer, die cause brauchen (PersonForm's Tod-Abschnitt, EventEditModal bei DEAT), führen
// es separat neben dem EditableEvent.
import type { AppState } from './app-state.svelte';
import type { Event, Citation } from '../../core/model/types';
import type { PlaceContext } from '../../core/places';
import { parseDateValue, formatDateValue, normalizeMonth, type DateQualifier } from '../../core/model/gedcom-date';
import { addrDisplay } from '../../core/model/event';
import { linkEventToPlace, linkEventToHof } from '../../core/places';
import { eventPlaceLabel } from './person-display';

export const QUALIFIER_OPTIONS: { value: DateQualifier; label: string }[] = [
  { value: 'EXACT', label: 'exakt' },
  { value: 'ABT', label: 'ca. (ABT)' },
  { value: 'CAL', label: 'errechnet (CAL)' },
  { value: 'EST', label: 'geschätzt (EST)' },
  { value: 'BEF', label: 'vor (BEF)' },
  { value: 'AFT', label: 'nach (AFT)' },
  { value: 'BET', label: 'zwischen (BET…AND…)' },
  { value: 'FROM', label: 'Zeitraum (FROM…TO…)' },
];

/**
 * Nur der Datums-TEIL eines EditableEvent — das, was `EventDateFields.svelte` braucht
 * (BL-352, Extraktion aus EventEditModal.svelte). `EditableEvent` erfüllt diesen Typ
 * strukturell (es ist ein Obertyp, kein separates Objekt) — ein Aufrufer ohne volles
 * Ereignis (die Erfassungs-Vorlagen-Fläche hat vor dem Speichern kein Event, nur einen
 * Entwurfswert je Slot) hält sich genau dieses schmalere Gerüst.
 */
export interface EditableDate {
  dateQualifier: DateQualifier;
  day: number | null;
  month: string | null;
  year: number | null;
  day2: number | null;
  month2: string | null;
  year2: number | null;
  originalDate: string | null;
  dateDirty: boolean;
}

/** Frisches, unangetastetes Datums-Gerüst — Startzustand für einen Slot ohne Ereignis
 *  dahinter (EntryTemplateCapture.svelte). `dateDirty: false` + `originalDate: null`
 *  macht `computeDate` bis zur ersten Eingabe zu `null` (= "kein Datum"), genau wie ein
 *  frisch angelegtes Ereignis es täte. */
export function makeEditableDate(): EditableDate {
  return {
    dateQualifier: 'EXACT',
    day: null,
    month: null,
    year: null,
    day2: null,
    month2: null,
    year2: null,
    originalDate: null,
    dateDirty: false,
  };
}

/** Editierbarer Ereignis-Zustand: strukturiertes Datum statt roher Raw-String, damit
 *  die Qualifier/Tag/Monat/Jahr-Felder direkt daran binden können. ADR-v9-30 Punkt 1:
 *  KEIN hasDate/hasPlace-Gate mehr — stattdessen originalDate/originalPlace (roher
 *  Ursprungswert, Tristate-treu) + dateDirty/placeDirty (wird von JEDEM Change-Handler
 *  am jeweiligen Teilformular gesetzt). Nur wenn der Nutzer das Teilformular tatsächlich
 *  anfasst, wird beim Speichern neu berechnet — sonst bleibt der Rohwert (null/''/Wert)
 *  unangetastet durchgereicht (Roundtrip-Erhaltung, Spec 10 §5.1). */
export interface EditableEvent {
  key: string;
  type: string;
  value: string;
  eventType: string;
  dateQualifier: DateQualifier;
  day: number | null;
  month: string | null;
  year: number | null;
  day2: number | null;
  month2: string | null;
  year2: number | null;
  originalDate: string | null;
  dateDirty: boolean;
  place: string;
  originalPlace: string | null;
  placeDirty: boolean;
  /** ADR-v9-42: über EventPlaceField/EventAddrField per Picker gesetzt (linkEventToPlace/
   *  linkEventToHof) — anders als Datum/Ort-Freitext kein Tristate-Dirty-Tracking nötig,
   *  weil das Setzen IMMER explizit über eine Nutzerauswahl passiert (nie stiller Reset). */
  placeId: string | null;
  hofId: string | null;
  addr: string;
  /** Der beim Öffnen ANGEZEIGTE Adresstext (ADR-v9-228) — Vergleichsbasis für „angefasst?".
   *  Bei strukturierter Adresse ist das die aus addrExtra abgeleitete Fassung, nicht ev.addr. */
  originalAddrText: string;
  note: string;
  citations: Citation[];
}

/** Baut den editierbaren Formular-Zustand aus einem Event. `ctx` (PlaceContext) wird für
 *  den Live-Anfangswert des Ort-Feldes gebraucht (ADR-v9-47 Punkt 3: bei gesetzter
 *  placeId/hofId LIVE aus dem Modell seeden statt den ggf. veralteten Cache-Rohwert zu
 *  zeigen — NUR der initiale Anzeigewert, Tristate-Erhaltung bleibt unverändert). */
export function toEditable(key: string, ev: Event, ctx: PlaceContext): EditableEvent {
  const parts = ev.date != null ? parseDateValue(ev.date) : null;
  return {
    key,
    type: ev.type,
    value: ev.value,
    eventType: ev.eventType,
    dateQualifier: parts?.qualifier ?? 'EXACT',
    day: parts?.day ?? null,
    month: parts?.month ?? null,
    year: parts?.year ?? null,
    day2: parts?.day2 ?? null,
    month2: parts?.month2 ?? null,
    year2: parts?.year2 ?? null,
    originalDate: ev.date,
    dateDirty: false,
    place: ev.placeId != null || ev.hofId != null ? eventPlaceLabel(ev, ctx) : (ev.place ?? ''),
    originalPlace: ev.place,
    placeDirty: false,
    placeId: ev.placeId,
    hofId: ev.hofId,
    addr: addrDisplay(ev),
    originalAddrText: addrDisplay(ev),
    note: ev.note,
    citations: ev.citations.map((c) => ({ ...c })),
  };
}

/** Markiert das Datums-Teilformular als angefasst — von JEDEM Qualifier/Tag/Monat/Jahr
 *  (inkl. der zweiten BET/FROM-Grenze)-Change-Handler aufgerufen (ADR-v9-30 Punkt 1).
 *  Nimmt `EditableDate` (nicht das volle `EditableEvent`) — `EventDateFields.svelte` ist
 *  der einzige Aufrufer und kennt kein Ereignis, nur diesen Ausschnitt (BL-352). */
export function markDateDirty(ev: EditableDate): void {
  ev.dateDirty = true;
}

/** Normalisiert eine Monat-Eingabe UND markiert das Datumsformular als angefasst — ein
 *  Aufruf pro Monat-Blur-Handler statt zwei getrennter (dateFields-Snippet, beide Formen). */
export function onMonthBlur(target: EditableDate, field: 'month' | 'month2', raw: string): void {
  target[field] = normalizeMonth(raw);
  markDateDirty(target);
}

/** Baut den Roh-Datumsstring aus dem strukturierten Teilformular (Tristate beachtet,
 *  ADR-v9-30 Punkt 1): unberührt (`!dateDirty`) -> Rohwert unverändert; sonst neu
 *  zusammengesetzt (leer -> null = "kein Datum"). Gemeinsam genutzt von `fromEditable`
 *  (Speichern) UND `liveEventFrom` (Picker-Verknüpfung braucht das aktuell angezeigte
 *  Datum für die Jahres-Ableitung) UND `EntryTemplateCapture` (baut aus dem Ergebnis den
 *  Slot-Wert, ohne je ein volles `EditableEvent` zu besitzen). */
export function computeDate(e: EditableDate): string | null {
  if (!e.dateDirty) return e.originalDate;
  const formatted = formatDateValue({
    qualifier: e.dateQualifier,
    day: e.day,
    month: e.month,
    year: e.year,
    day2: e.day2,
    month2: e.month2,
    year2: e.year2,
  });
  return formatted === '' ? null : formatted;
}

/** Baut ein Event-Objekt aus dem AKTUELLEN Formularzustand (nicht nur dem gespeicherten
 *  Original) — für `linkEventToPlace`/`linkEventToHof`, die den vollen Event-Kontext
 *  (Typ/Datum/Ort/Adresse) für die Jahres-Ableitung + Reprojektion brauchen. Felder ohne
 *  Formular-Entsprechung (lati/long/datePhrase/addrExtra/media/seen/grampsId) sind hier neutral belegt — sie
 *  fließen weder in die Jahres-Ableitung noch in buildPlacForGedcom ein. */
export function liveEventFrom(e: EditableEvent): Event {
  return {
    type: e.type,
    value: e.value,
    eventType: e.eventType,
    date: computeDate(e),
    datePhrase: '',
    place: e.place === '' ? null : e.place,
    placeId: e.placeId,
    hofId: e.hofId,
    lati: null,
    long: null,
    addr: e.addr,
    addrExtra: [],
    note: e.note,
    citations: e.citations,
    media: [],
    seen: true,
    grampsId: null,
  };
}

/** Picker-Auswahl/-Neuanlage eines Ortes (EventPlaceField.onPick, ADR-v9-42): verknüpft
 *  über den Kern-Chokepoint `linkEventToPlace` (ID + Text SOFORT atomar reprojiziert) und
 *  übernimmt das Ergebnis zurück ins Formularfeld (placeDirty, damit `fromEditable` beim
 *  Speichern den reprojizierten Text — nicht den alten Rohwert — verwendet). */
export function pickPlaceFor(appState: AppState, target: EditableEvent, placeId: string): void {
  const live = liveEventFrom(target);
  linkEventToPlace(live, placeId, appState.placeContext);
  target.place = live.place ?? '';
  target.placeId = live.placeId;
  target.placeDirty = true;
}

/** Picker-Auswahl/-Neuanlage eines Hofes (EventAddrField.onPick, ADR-v9-42): analog
 *  pickPlaceFor, aber über `linkEventToHof` — reprojiziert `place` UND füllt `addr` (nur
 *  wenn bisher leer, s. Kommentar an linkEventToHof). */
export function pickHofFor(appState: AppState, target: EditableEvent, hofId: string): void {
  const live = liveEventFrom(target);
  linkEventToHof(live, hofId, appState.placeContext);
  target.place = live.place ?? '';
  target.addr = live.addr ?? '';
  target.hofId = live.hofId;
  target.placeDirty = true;
}

/**
 * Der Tristate-Rückweg für `addr` (BL-292) — das Formularfeld kennt nur `string`, das
 * Modell drei Zustände.
 *
 * Ein leeres Feld heißt NICHT automatisch „kein ADDR": eine `ADDR`-Zeile ohne Wert ist im
 * Bestand der Träger der strukturierten Adresse (`ADR1`/`CITY`/`POST`), die als
 * Passthrough unter ihr hängt. War sie schon vorher leer, bleibt sie bestehen — sonst
 * risse ein beliebiger Ereignis-Edit den ganzen Teilbaum mit. Hat der Nutzer dagegen einen
 * VORHANDENEN Wert gelöscht, ist das eine Aussage: die Zeile fällt weg (`null`), wie beim
 * Ort auch.
 */
function addrZurueck(original: Event, e: EditableEvent): string | null {
  // Save-Time-No-Op (ADR-v9-228): unangetastet heißt unverändert. Verglichen wird gegen den
  // ANGEZEIGTEN Startwert, nicht gegen `original.addr` — bei einer strukturierten Adresse
  // ist der Rohwert leer und im Feld steht die aus `addrExtra` abgeleitete Fassung; ein
  // Vergleich gegen den Rohwert hielte jedes Öffnen-und-Speichern für eine Änderung und
  // schriebe die abgeleitete Fassung in die Datei.
  if (!addrGeaendert(e)) return original.addr;
  if (e.addr !== '') return e.addr;
  return original.addr === '' ? '' : null;
}

/** Hat der Nutzer das Adressfeld angefasst? (ADR-v9-228, s. `addrZurueck`) */
export function addrGeaendert(e: EditableEvent): boolean {
  return e.addr !== e.originalAddrText;
}

/** Baut das strukturierte Formular-Ereignis zurück in ein Event (Tristate beachtet, Spec
 *  10 §5.1 "date/place unterscheiden null/''/Wert"). placeId/hofId werden aus dem
 *  Formularzustand übernommen (ADR-v9-42 — Picker kann sie SOFORT setzen, s. pickPlaceFor/
 *  pickHofFor), nicht blind vom Original übernommen. */
export function fromEditable(original: Event, e: EditableEvent): Event {
  const date = computeDate(e);
  const place = !e.placeDirty ? e.originalPlace : (e.place === '' ? null : e.place);
  return {
    ...original,
    type: e.type,
    value: e.value,
    eventType: e.eventType,
    date,
    place,
    placeId: e.placeId,
    hofId: e.hofId,
    addr: addrZurueck(original, e),
    // ADR-v9-228 Entscheidung 3: ein Adress-Edit verwirft die Index-Kopien, statt sie zu
    // raten — `ADR1`/`ADR2`/`ADR3` sind laut Spec Kopien der `ADDR`/`CONT`-Zeilen, und wenn
    // die sich ändert, ist die Kopie ungültig; `CITY`/`POST`/`CTRY` ließen sich aus einem
    // Freitext nur erfinden. Bleibt das Feld unangetastet, bleiben auch die Knoten stehen
    // (über den `...original`-Spread oben) und der Roundtrip ist byte-identisch.
    addrExtra: addrGeaendert(e) ? [] : original.addrExtra,
    note: e.note,
    citations: e.citations,
  };
}
