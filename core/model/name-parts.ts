// core/model/name-parts.ts — Vor-/Nachname einer Person, kanonisch (Spec 10 §2).
//
// WARUM ES DAS GIBT: `Person.given`/`Person.surname` sind NUR gefüllt, wenn die
// GEDCOM-Quelle explizite `GIVN`/`SURN`-Untertags hatte. Die verbreitete Form
// `1 NAME Anna /Decker/` ohne Untertags lässt beide LEER — der Name steckt dann
// ausschließlich in `Person.name`, mit dem Nachnamen zwischen Schrägstrichen.
//
// Wer das übersieht, baut eine Funktion, die auf der Hälfte aller Dateien still nichts
// tut. Genau das ist zweimal passiert: erst in `family-list-model.ts` (Familien-Sortierung
// brach auf Label-Text durch), dann im Duplikat-Scoring (`core/dedup`) — dort fielen 44
// der 100 Punkte weg UND das Nachname-Bucketing griff ins Leere, ohne dass ein Test
// anschlug, weil die Test-Fixtures die Felder direkt setzen und die Referenz-Datei
// (Ancestris) die Untertags schreibt.
//
// Deshalb liegt die Regel im KERN und nicht in der Anzeige-Schicht: sie ist eine Aussage
// über das GEDCOM-Namensformat, keine Darstellungsfrage.
// `ui/shell/person-display.ts::surnameCandidate` delegiert hierher.
import type { Person } from './types';

/** Nachname: `SURN` falls vorhanden, sonst der Teil zwischen den Schrägstrichen von `NAME`. */
export function surnameOf(p: Pick<Person, 'surname' | 'name'>): string {
  if (p.surname) return p.surname;
  return p.name.split('/')[1]?.trim() ?? '';
}

/** Vorname: `GIVN` falls vorhanden, sonst der Teil VOR den Schrägstrichen von `NAME`. */
export function givenOf(p: Pick<Person, 'given' | 'name'>): string {
  if (p.given) return p.given;
  return p.name.split('/')[0]?.trim() ?? '';
}
