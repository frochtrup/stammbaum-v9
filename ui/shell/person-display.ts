// ui/shell/person-display.ts — reine Darstellungs-Helfer für Personen (Präsentation,
// keine Domänenlogik — deshalb bewusst in ui/, nicht core/model). Liest AUSSCHLIESSLICH
// über core-Chokepoints/-Felder, schreibt nie zurück (reine Query-Funktionen, Spec 02 §3).
import type { Person, Event, Sex, ChildLink, Database } from '../../core/model/types';
import type { PlaceContext } from '../../core/places';
import { eventPlaceId, buildFormString, buildListPlaceName, eventYear } from '../../core/places';
import { dateSortKey, formatDateForDisplay, parseDateValue } from '../../core/model/gedcom-date';
import { surnameOf } from '../../core/model/name-parts';

/**
 * Anzeigename mit selbst gewähltem Rückfall für den namenlosen Fall.
 *
 * WOFÜR: in Listen und Formularen ist der Platzhalter „(ohne Namen)" richtig, in den
 * Diagramm-Inseln dagegen die Person-ID — dort stünde sonst auf mehreren Karten derselbe
 * Text und die Records wären nicht auseinanderzuhalten.
 *
 * WARUM EIGENE FUNKTION statt eines optionalen zweiten Parameters an `displayName`:
 * (1) `displayName(p) || p.id` beim Aufrufer erreicht den Rückfall NIE, weil der
 * Platzhalter wahrheitswertig ist — diese Falle hat hier bereits zugeschlagen; (2) ein
 * optionaler Parameter macht `.map(displayName)` still falsch, weil der Array-Index als
 * `fallback` ankäme (fünf solcher Aufrufstellen existieren — der Compiler hat sie beim
 * ersten Versuch angezeigt).
 */
export function displayNameOr(p: Person, fallback: string): string {
  if (p.given || p.surname) {
    return [p.prefix, p.given, p.surname, p.suffix].filter(Boolean).join(' ').trim();
  }
  const cleaned = p.name.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || fallback;
}

/** Rohe GEDCOM-NAME-Form ("Otto /Meyer/") in Anzeigeform ("Otto Meyer"). */
export function displayName(p: Person): string {
  return displayNameOr(p, '(ohne Namen)');
}

/**
 * Geschlechts-Symbol für Listen-/Kopf-Zeilen (Spec 20 §1.4, v8-Orakel `p-sex`-Klasse).
 * EINE Quelle für ♂/♀/◇ (INV-UI-4) — dieselben Symbole wie die Statistik-Legende
 * (`StatisticsView`). Wiederverwendet in Personenliste (BL-195), Suche (BL-211) und
 * Personen-Detailkopf (BL-198).
 */
export function sexSymbol(sex: Sex): string {
  return sex === 'M' ? '♂' : sex === 'F' ? '♀' : '◇';
}

/**
 * Kind-Verhältnis-Label (PEDI) für Kind-/Eltern-Zeilen (BL-199, v8-Orakel `_pediLabel`).
 * Leer beim Regelfall (leiblich/leer) — nur ein ABWEICHENDES Verhältnis trägt einen
 * sichtbaren Marker, damit die Zeile nicht mit „leiblich" verrauscht.
 */
export function pedigreeLabel(pedigree: ChildLink['pedigree']): string {
  switch (pedigree) {
    case 'adopted':
      return 'adoptiert';
    case 'foster':
      return 'Pflegekind';
    case 'sealing':
      return 'gesiegelt';
    default:
      return '';
  }
}

/**
 * Nachname-Kandidat, konsistent für Gruppierung (sortLetter), Sortierung (sortKey) UND
 * jede andere Stelle, die "den Nachnamen einer Person" braucht (z. B. Familien-Sortierung
 * nach Nachname Ehemann/Ehefrau). `p.surname` ist NUR gesetzt, wenn die GEDCOM-Quelle
 * explizite `GIVN`/`SURN`-Untertags hatte (core/interop/gedcom-parse.ts) — bei reinem
 * `1 NAME Otto /Anders/` ohne Untertags (verbreitete Form) bleibt `p.surname` leer, daher
 * der Fallback auf den Slash-Teil von `p.name`. EXPORTIERT, damit kein Aufrufer eine eigene,
 * abweichende Nachname-Ermittlung baut (das war ein realer Bug: family-list-model.ts hatte
 * eine eigene, fallback-lose `surnameFor()` → Familien-Sortierung nach Nachname brach bei
 * Personen ohne GIVN/SURN-Untertags auf reine Label-Text-Sortierung durch).
 */
export function surnameCandidate(p: Person): string {
  return surnameOf(p) || p.given || p.name;
}

/** Sammel-Trenner-Wert für Personen ohne alphabetisch sortierbaren Namen (namenlos oder
 *  reine Platzhalter wie „?"). Die Personen-Liste fasst diese Gruppe zu einer
 *  kollabierbaren „N ohne Namen"-Zeile zusammen (ADR-v9-121). */
export const NAMELESS_LETTER = '#';

/** Erster Buchstabe des Nachnamens für den Alphabet-Trenner der Personen-Liste. */
export function sortLetter(p: Person): string {
  const ch = surnameCandidate(p).trim().charAt(0).toUpperCase();
  // Kein alphabetisches Zeichen ermittelbar (auch kein GEDCOM-NAME vorhanden) →
  // Sammel-Buchstaben, statt versehentlich das Platzhalter-"(" von displayName zu sortieren.
  return /[A-ZÄÖÜ]/.test(ch) ? ch : NAMELESS_LETTER;
}

/**
 * Sortierschlüssel "Nachname, Vorname" für den Name-Sortier-Modus — MUSS denselben
 * Nachname-Kandidaten wie sortLetter() verwenden, sonst laufen Buchstaben-Trenner
 * (nach Nachname gruppiert) und tatsächliche Reihenfolge (sonst nach displayName()
 * = "Vorname Nachname" sortiert, also fälschlich nach Vornamen) auseinander.
 */
export function sortKey(p: Person): string {
  return `${surnameCandidate(p)} ${p.given ?? ''}`.trim().toLowerCase();
}

/** Jahr aus einem Event-Datum, für die Kurzanzeige in der Personen-Liste. */
export function eventYearLabel(ev: Event): string {
  const y = eventYear(ev);
  return y != null ? String(y) : '';
}

/**
 * Periodengerechter Ortsname eines Events über den Places-Chokepoint (Spec 11 §5) —
 * NIE ev.place roh anzeigen, wenn eine Auflösung möglich ist (Chokepoint-Pflicht).
 */
export function eventPlaceLabel(ev: Event, ctx: PlaceContext): string {
  const placeId = eventPlaceId(ev, ctx);
  if (placeId != null) {
    const built = buildFormString(ctx.places, placeId, eventYear(ev));
    if (built) return built;
  }
  return ev.place ?? '';
}

/** Kombiniertes "Jahr, Ort" für die Listenzeile — leer, wenn beides fehlt.
 *  DISAMBIGUIERUNGS-/Übersichts-Kontext (Kinder-/Ehepartner-/Eltern-Zeilen, Ort-/Hof-
 *  Listen, Suche, INV-UI-6/[21 §6f] INV-UI-9, [21 §6l] INV-UI-14) — Jahr genügt hier, und
 *  der Ortsteil ist der KURZNAME (`buildListPlaceName`, Spec 11 §5), nicht die volle
 *  Verwaltungskette — ein volles Datum ODER eine lange Kette wären hier Rauschen. Die
 *  Kette bleibt per `use:tooltip` an derselben Zeile erreichbar (ADR-v9-86), s. Aufrufer.
 *  NICHT für die eigenen Ereigniszeilen einer Detail-Seite verwenden, dafür siehe
 *  dateSummary() (die weiterhin die volle Kette via eventPlaceLabel trägt). */
export function yearPlaceSummary(ev: Event, ctx: PlaceContext): string {
  const year = eventYearLabel(ev);
  const place = buildListPlaceName(ev, ctx);
  if (year && place) return `${year}, ${place}`;
  return year || place;
}

/**
 * Alter der Person bei einem Ereignis (BL-196, v8-Orakel `_ageAt`) — Ereignisjahr minus
 * Geburtsjahr, als „42 J." bzw. „~42 J." wenn eines der beiden Daten unscharf ist
 * (Qualifier ≠ EXACT: ca./vor/nach/zwischen). Leer, wenn ein Jahr fehlt oder das Alter
 * unplausibel ist (< 0 oder > 130 — dann ist der Bezug vermutlich falsch, kein Rauschen).
 */
export function ageAtEvent(birth: Event, ev: Event): string {
  const b = eventYear(birth);
  const e = eventYear(ev);
  if (b == null || e == null) return '';
  const age = e - b;
  if (age < 0 || age > 130) return '';
  const approx =
    parseDateValue(birth.date ?? '').qualifier !== 'EXACT' || parseDateValue(ev.date ?? '').qualifier !== 'EXACT';
  return `${approx ? '~' : ''}${age} J.`;
}

/** Volles, lokalisiertes Datum eines Events (Tag+Monat wo vorhanden, deutscher
 *  Monatsname, Qualifier-Präfix) — Eigene-Ereignis-Kontext, [21 INV-UI-9](
 *  ../../specs/v9/21-UI-UX.md). Reine Delegation an core/model/gedcom-date.ts (INV-UI-4:
 *  ein Parser, keine zweite Implementierung). */
export function fullDateLabel(ev: Event): string {
  return formatDateForDisplay(ev.date);
}

/** Kombiniertes "volles Datum, Ort" für die EIGENE Ereigniszeile einer Detail-Seite
 *  (PersonDetail/FamilyDetail, [21 INV-UI-9](../../specs/v9/21-UI-UX.md)) — leer, wenn
 *  beides fehlt. Gleiche Orts-Chokepoint-Logik wie yearPlaceSummary(), nur der
 *  Datums-Teil ist voll statt Jahr-only. NICHT für Disambiguierungs-Listen verwenden,
 *  dafür bleibt yearPlaceSummary() der kanonische Weg (INV-UI-6). */
export function dateSummary(ev: Event, ctx: PlaceContext): string {
  const date = fullDateLabel(ev);
  const place = eventPlaceLabel(ev, ctx);
  if (date && place) return `${date}, ${place}`;
  return date || place;
}

/**
 * Personen-Ids chronologisch nach Geburtsdatum — die Anzeige-Reihenfolge der Kinder einer
 * Familie (Nutzer-Befund 2026-08-13), in `PersonDetail` wie in `FamilyDetail` (INV-UI-4:
 * eine Reihenfolge, nicht zwei).
 *
 * SORTIERT EINE KOPIE. Die gespeicherte `family.children`-Reihenfolge ist Dateiinhalt und
 * wird beim Schreiben unverändert ausgegeben — sie hier umzustellen hieße, eine Datei zu
 * verändern, die niemand angefasst hat (LP-1).
 *
 * STABIL: Kinder ohne Geburtsdatum (Schlüssel `Infinity`) und solche mit demselben Datum
 * behalten untereinander die Dateireihenfolge — `Array.prototype.sort` ist seit ES2019
 * stabil zugesichert. Unbekannte Ids fallen heraus, wie in den Aufrufern auch.
 */
export function sortPersonIdsByBirth(db: Database, ids: readonly string[]): string[] {
  return ids
    .filter((id) => db.individuals.has(id))
    .slice()
    .sort((a, b) => dateSortKey(db.individuals.get(a)!.birth.date) - dateSortKey(db.individuals.get(b)!.birth.date));
}
