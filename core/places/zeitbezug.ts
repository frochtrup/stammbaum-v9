// core/places/zeitbezug.ts — die Zeitrechnung der Orts-Auflösung (BL-324, ADR-v9-243).
// Framework-frei, reine Funktionen, kein Wall-Clock (INV-ARCH-1, TST-3).
//
// DAS PROBLEM. Bis hierher verglich die Auflösung JAHRE: `from`/`to` einer Zugehörigkeit
// gegen `placeYear(ev.date)`. Beide Enden inklusiv — zwei aufeinanderfolgende Perioden,
// die sich ein Grenzjahr teilen („…1810" und „1810…"), gelten deshalb im Grenzjahr BEIDE,
// und die Tie-Break-Regel entscheidet statt der Daten. Am maßgeblichen Bestand
// (`Testdateien/orte-2.json`, rev 277) sind das 433 Paare und **null** echte
// Überlappungen: das Problem ist die Auflösung, nicht der Bestand.
//
// DIE LÖSUNG IST EINE INTERVALL-RECHNUNG, KEINE FALLUNTERSCHEIDUNG. Spec 11 §1 verlangt
// einen „zweistufigen Vergleich" — tagegenau nur, wenn beide Seiten einen Tag tragen,
// sonst Jahr gegen Jahr. Das ist die BESCHREIBUNG des Verhaltens; als Mechanismus wäre ein
// `if (beideHabenTag)` zwei Vergleichspfade, die auseinanderlaufen können. Stattdessen
// wird die Ungenauigkeit in die BREITE des Intervalls gelegt:
//
//   Angabe            Intervall
//   „15 JUN 1810"     [1810-06-15, 1810-06-15]   ein Tag
//   „1810" als `from` [1810-01-01, offen]        Jahresanfang
//   „1810" als `to`   [offen, 1810-12-31]        Jahresende
//   „1810" (Ereignis) [1810-01-01, 1810-12-31]   das ganze Jahr
//
// „Trifft" heißt dann schlicht: die Intervalle überschneiden sich. Daraus folgt der
// zweistufige Vergleich von selbst, und zwar in BEIDE Richtungen:
//
//   * Periode und Ereignis tagegenau → nur eine Periode trifft. Das ist der Gewinn.
//   * Ereignis nur jahrgenau → sein Intervall deckt das ganze Jahr und trifft beide
//     Perioden weiterhin. Kein Rückschritt, keine erfundene Genauigkeit.
//   * Periode nur jahrgenau → „bis irgendwann 1810" deckt das ganze Jahr; auch ein
//     tagegenaues Ereignis kann dann nicht entscheiden. Ehrlich, und richtig so.
//
// WARUM DIE EREIGNIS-SEITE NUR EXAKTE DATEN VERSCHMÄLERT. `ABT 15 JUN 1810` trägt einen
// Tag, aber keine Tagesgenauigkeit — „ungefähr" ist die Aussage, nicht der 15. Juni.
// Dasselbe gilt für `BET`/`FROM`/`BEF`/`AFT`/`CAL`/`EST`. Am Realbestand
// (`Testdateien/Unsere Familie 2026.ged`) betrifft das 747 von 9377 Datumszeilen. Sie
// behalten exakt ihr bisheriges Verhalten (ganzes Jahr aus `placeYear`) — diese Datei
// ändert für sie nichts.
import type { Year } from './types';
import { placeYear } from './normalize';
import { parseDateValue } from '../model/gedcom-date';

const MONATE = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * Ein halboffenes-bis-geschlossenes Intervall in Tagesauflösung. Grenzen sind
 * `yyyymmdd`-Ordinale (1810-06-15 → 18100615), `null` heißt offen — dieselbe
 * Richtungs-Semantik wie `from`/`to` in Spec 11 §1: `von = null` ist „seit jeher",
 * `bis = null` ist „bis heute", und beide `null` ist „undatiert, jederzeit gültig".
 */
export interface Spanne {
  von: number | null;
  bis: number | null;
}

/**
 * Was ein Aufrufer der Registry als Zeitangabe mitgeben darf.
 *
 * Bewusst eine Union statt einer Umstellung aller Aufrufer auf `Spanne`: von den 33
 * Aufrufstellen von `resolveAsOf`/`enclosureIdsAsOf`/`enclosureChainAsOf` haben die
 * meisten gar kein Ereignis in der Hand (Massen-Dedup, Anzeige ohne Jahreskontext,
 * `year=null`) oder nur ein Jahr — sie in `jahresSpanne(1810)` zu zwingen, machte
 * ~30 Testzeilen unleserlicher, ohne eine Frage zu beantworten. Die Normalisierung
 * passiert an genau EINER Stelle (`alsSpanne`), nicht je Aufrufer.
 */
export type Zeitbezug = Year | Spanne;

/** `yyyymmdd`-Ordinal. Monat/Tag `null` werden vom Aufrufer geklemmt, nicht hier. */
function ordinal(jahr: number, monat: number, tag: number): number {
  return jahr * 10000 + monat * 100 + tag;
}

/** `JAN`..`DEC` → 1..12, sonst `null`. */
function monatsZahl(m: string | null): number | null {
  if (!m) return null;
  const i = MONATE.indexOf(m.toUpperCase());
  return i < 0 ? null : i + 1;
}

/** Untere Kante eines Jahres (1. Januar). */
export const jahresBeginn = (j: number): number => ordinal(j, 1, 1);
/** Obere Kante eines Jahres (31. Dezember) — kein echter Kalendertag nötig, nur eine
 *  obere Schranke, die jeden Tag des Jahres einschließt. */
export const jahresEnde = (j: number): number => ordinal(j, 12, 31);

/** Ein ganzes Jahr als Spanne. */
export const jahresSpanne = (j: number): Spanne => ({ von: jahresBeginn(j), bis: jahresEnde(j) });

/**
 * Tagesgenaues Ordinal eines GEDCOM-Datumsstrings — `null`, sobald irgendetwas daran
 * ungenau ist (Qualifier, fehlender Tag, fehlender Monat, fehlendes Jahr). Das ist die
 * Stelle, an der „trägt einen Tag" von „ist tagegenau" getrennt wird.
 */
export function tagesOrdinal(roh: string | null | undefined): number | null {
  if (!roh) return null;
  const t = parseDateValue(roh);
  if (t.qualifier !== 'EXACT') return null;
  const m = monatsZahl(t.month);
  if (t.year == null || m == null || t.day == null) return null;
  return ordinal(t.year, m, t.day);
}

/**
 * Die Spanne EINER datierten Angabe (`pnames`/`enclosedBy`/`addrs`). `fromDate`/`toDate`
 * gewinnen, wo sie tagegenau sind; sonst klemmt das Jahr auf seine jeweilige Kante.
 *
 * Die Kanten sind absichtlich asymmetrisch: ein Jahr als ANFANG heißt „ab irgendwann in
 * diesem Jahr", also frühestens am 1. Januar; als ENDE heißt es „bis irgendwann in diesem
 * Jahr", also spätestens am 31. Dezember. Beides zusammen ergibt genau die bisherige
 * inklusive Jahres-Semantik — deshalb ändert diese Funktion für undatierte
 * `fromDate`/`toDate` nachweislich nichts.
 */
export function spanneVonDatiert(d: {
  from: Year;
  to: Year;
  fromDate?: string | null;
  toDate?: string | null;
}): Spanne {
  const vonTag = tagesOrdinal(d.fromDate);
  const bisTag = tagesOrdinal(d.toDate);
  const vonJahr = placeYear(d.from);
  const bisJahr = placeYear(d.to);
  return {
    von: vonTag ?? (vonJahr != null ? jahresBeginn(vonJahr) : null),
    bis: bisTag ?? (bisJahr != null ? jahresEnde(bisJahr) : null),
  };
}

/** Trägt die Angabe überhaupt eine Datierung? (Spec 11 §1: beide `null` = jederzeit.) */
export function istDatiert(d: { from: Year; to: Year; fromDate?: string | null; toDate?: string | null }): boolean {
  return placeYear(d.from) != null || placeYear(d.to) != null || d.fromDate != null || d.toDate != null;
}

/**
 * Die Spanne eines EREIGNIS-Datums: ein Tag bei exaktem Volldatum, sonst das ganze Jahr,
 * `null` wenn gar kein Jahr erkennbar ist (= undatiert, trifft nichts und wird vom
 * Aufrufer als „kein Jahreskontext" behandelt, wie bisher `placeYear(...) == null`).
 */
export function spanneVonEreignis(datum: string | null | undefined): Spanne | null {
  const tag = tagesOrdinal(datum);
  if (tag != null) return { von: tag, bis: tag };
  const jahr = placeYear(datum);
  return jahr == null ? null : jahresSpanne(jahr);
}

/**
 * EINE Grenze einer Periode, wie sie aus einem Eingabefeld kommt: Jahr UND (falls
 * tagegenau getippt) der Tag. Beide zusammen, weil [ADR-v9-243] verlangt, dass `from`/`to`
 * aus `fromDate`/`toDate` ABLEITBAR sind und dazu passen — zwei getrennte Parameter
 * ließen genau das auseinanderlaufen, und niemand würde es merken.
 */
export interface Grenze {
  jahr: Year;
  datum: string | null;
}

export const OFFENE_GRENZE: Grenze = { jahr: null, datum: null };

/**
 * Was ein Aufrufer als Grenze übergeben darf — dieselbe Entscheidung wie bei `Zeitbezug`
 * eine Ebene höher: eine nackte Jahreszahl bleibt gültig und heißt „nur das Jahr bekannt".
 * Wer einen Stichtag hat, übergibt eine `Grenze`. Die Normalisierung passiert an EINER
 * Stelle (`alsGrenze`), nicht je Aufrufer.
 */
export type GrenzEingabe = Grenze | Year;

export function alsGrenze(g: GrenzEingabe): Grenze {
  return g == null || typeof g === 'number' ? { jahr: g, datum: null } : g;
}

/**
 * Liest EIN Eingabefeld: leer → offen, „1810" → nur Jahr, „1 OCT 1810" → Jahr + Tag.
 * Unlesbares wird zu „offen" statt zu einem stillen 0 — dieselbe Haltung wie beim
 * bisherigen `<input type="number">`, das ein geleertes Feld als `null` las.
 */
export function grenzeAusEingabe(roh: string | null | undefined): Grenze {
  const t = (roh ?? '').trim();
  if (!t) return OFFENE_GRENZE;
  const datum = tagesOrdinal(t) != null ? t : null;
  return { jahr: placeYear(t), datum };
}

/** Was in einem Eingabefeld stehen soll: der Tag, wenn es einen gibt, sonst das Jahr. */
export function grenzeText(jahr: Year, datum: string | null | undefined): string {
  if (datum) return datum;
  return jahr == null ? '' : String(jahr);
}

/**
 * Das Jahr eines Bezugszeitraums — für die Stellen, die weiterhin jahresweise rechnen:
 * `existsFrom`/`existsTo` sind Jahres-Skalare geblieben (BL-324 rüstet `Dated`/`DatedRef`
 * nach, nicht sie: sie entscheiden, OB ein Knoten existiert, und tragen keinen Tie-Break).
 * Bei einer nach unten offenen Spanne zählt die obere Grenze.
 */
export function jahrAus(s: Spanne): number | null {
  const o = s.von ?? s.bis;
  return o == null ? null : Math.trunc(o / 10000);
}

/** Normalisiert, was ein Aufrufer übergeben hat (s. `Zeitbezug`). */
export function alsSpanne(z: Zeitbezug): Spanne | null {
  if (z == null) return null;
  if (typeof z === 'number') return jahresSpanne(z);
  return z;
}

/** Überschneiden sich Periode und Bezugszeitraum? Offene Grenzen zählen als unendlich. */
export function trifft(periode: Spanne, bezug: Spanne): boolean {
  const pv = periode.von ?? -Infinity;
  const pb = periode.bis ?? Infinity;
  const bv = bezug.von ?? -Infinity;
  const bb = bezug.bis ?? Infinity;
  return Math.max(pv, bv) <= Math.min(pb, bb);
}

/**
 * Sortierwert für die Tie-Break-Regel „spätester Beginn gewinnt" (Spec 11 §5). Eine nach
 * unten offene Periode trägt `-Infinity` — der Aufrufer MUSS deshalb zusätzlich prüfen,
 * ob überhaupt schon etwas gewählt wurde (die Falle aus ADR-v9-181/BL-249).
 */
export const beginnWert = (s: Spanne): number => s.von ?? -Infinity;
