// ui/shell/person-display.ts — reine Darstellungs-Helfer für Personen (Präsentation,
// keine Domänenlogik — deshalb bewusst in ui/, nicht core/model). Liest AUSSCHLIESSLICH
// über core-Chokepoints/-Felder, schreibt nie zurück (reine Query-Funktionen, Spec 02 §3).
import type { Person, Event } from '../../core/model/types';
import type { PlaceContext } from '../../core/places';
import { eventPlaceId, buildFormString, eventYear } from '../../core/places';

/** Rohe GEDCOM-NAME-Form ("Otto /Meyer/") in Anzeigeform ("Otto Meyer"). */
export function displayName(p: Person): string {
  if (p.given || p.surname) {
    return [p.prefix, p.given, p.surname, p.suffix].filter(Boolean).join(' ').trim();
  }
  const cleaned = p.name.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || '(ohne Namen)';
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
  return p.surname || p.name.split('/')[1] || p.given || p.name;
}

/** Erster Buchstabe des Nachnamens für den Alphabet-Trenner der Personen-Liste. */
export function sortLetter(p: Person): string {
  const ch = surnameCandidate(p).trim().charAt(0).toUpperCase();
  // Kein alphabetisches Zeichen ermittelbar (auch kein GEDCOM-NAME vorhanden) →
  // Sammel-Buchstaben, statt versehentlich das Platzhalter-"(" von displayName zu sortieren.
  return /[A-ZÄÖÜ]/.test(ch) ? ch : '#';
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

/** Kombiniertes "Jahr, Ort" für die Listenzeile — leer, wenn beides fehlt. */
export function yearPlaceSummary(ev: Event, ctx: PlaceContext): string {
  const year = eventYearLabel(ev);
  const place = eventPlaceLabel(ev, ctx);
  if (year && place) return `${year}, ${place}`;
  return year || place;
}
