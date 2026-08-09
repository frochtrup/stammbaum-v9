// core/places/build-plac.ts — Orts-String-Bau, zwei Zwillinge (Spec 11 §5).
//
//   buildPlacForGedcom  → volle periodengerechte Kette. WIRE + Detail-Kontext.
//   buildListPlaceName  → Kurzname ohne Kette.        LISTEN-Kontext (INV-UI-14).
//
// Reine Funktionen aus (event, year, registries). Der erste ist gemeinsamer Chokepoint
// mit dem Writer (Spec 13): ändert sich das PLAC-Bauen, ist roundtrip-verify (LP-1)
// Pflicht. Der zweite berührt den Wire NIE — er ist reine Anzeige und darf deshalb
// `shortName` sehen, was dem ersten verboten ist (ADR-v9-90).
import type { Event, PlaceId, HofId } from '../model/types';
import type { Year, PlaceObject } from './types';
import type { PlaceRegistry } from './place-registry';
import type { HofRegistry } from './hof-registry';
import { extractHofAddr, placeYear } from './normalize';
import { spanneVonEreignis, type Spanne, type Zeitbezug } from './zeitbezug';

/** Erstes Komma-Segment eines Namens (atomarer Ortsname ohne Hierarchie). */
function atomic(s: string | null): string {
  return s ? s.split(',')[0].trim() : '';
}

export interface PlaceContext {
  places: PlaceRegistry;
  hofs: HofRegistry;
}

/**
 * Periodenkorrekter, FORM-kompatibler Dorf-PLAC-String via enclosureChainAsOf.
 * Pro Knoten nur das erste Komma-Segment (atomar) — sonst würde „Bayern, Deutschland"
 * als ein Knotenname die Kette verdoppeln.
 */
export function buildFormString(
  reg: PlaceRegistry,
  placeId: PlaceId | null,
  when: Zeitbezug,
): string | null {
  if (!placeId) return null;
  if (when == null) return atomic(reg.resolveAsOf(placeId, null)) || null;
  const chain = reg.enclosureChainAsOf(placeId, when).map(atomic).filter(Boolean);
  if (chain.length) return chain.join(', ');
  return atomic(reg.resolveAsOf(placeId, when)) || null;
}

/**
 * Vollständige Namenskette eines Orts, periodenunabhängig (nutzt `enclosureChainAsOf`
 * direkt mit `year=null` — anders als `buildFormString`, das bei `year=null` bewusst nur
 * den atomaren Einzelnamen liefert). Für Kuration/Anzeige OHNE Event-/Jahres-Kontext,
 * z. B. Massen-Dedup (Spec 11 §9.2, ADR-v9-50) — dort sollen mehrere gleichnamige Orte
 * anhand ihrer vollen Verwaltungskette unterscheidbar sein. NICHT für den Wire-Bau
 * (dafür `buildFormString`/`buildPlacForGedcom` mit echtem Jahr). Reine Funktion, kein
 * Wall-Clock (TST-3).
 */
export function buildFullPlaceName(reg: PlaceRegistry, placeId: PlaceId | null): string | null {
  if (!placeId) return null;
  const chain = reg.enclosureChainAsOf(placeId, null).map(atomic).filter(Boolean);
  return chain.length ? chain.join(', ') : null;
}

/**
 * Der anzuzeigende Name EINES Orts (Spec 11 §5, INV-UI-14) — `shortName` vor `title`,
 * die `id` als letzter Notnagel (nie ein leerer String für einen existierenden Ort).
 * Der EINZIGE erlaubte Weg dorthin: kein View liest `po.title` direkt, sonst entstehen
 * N Fassungen derselben Regel (INV-UI-4).
 *
 * REINE ANZEIGE. Speist nie den Writer, nie eine Identitäts-/Match-Entscheidung, nie die
 * Review-Klassifikation (§6) — `shortName` ist dort absichtlich unsichtbar (ADR-v9-90).
 */
export function placeDisplayName(po: PlaceObject | undefined | null): string {
  if (!po) return '';
  return po.shortName || po.title || po.id;
}

/**
 * Chokepoint (Spec 11 §5): was zeigt eine LISTENZEILE für dieses Event?
 * Der Listen-Zwilling von `buildPlacForGedcom` — dieselben zwei Pfade, aber ohne
 * Verwaltungskette (INV-UI-14, [21 §6l]). Drei Fälle, in dieser Reihenfolge:
 *
 *   1. hofId → "Hofadresse, Dorf-Kurzname". Das Dorf bleibt, weil eine Hausnummer
 *      allein zwischen Dörfern nicht eindeutig ist; die Kette hinter dem Dorf fällt weg.
 *   2. placeId → Kurzname des Orts.
 *   3. weder noch → erstes Komma-Segment des Rohtexts (gemessen 1,2 % der Zeilen, davon
 *      zwei Drittel mit Kette — genau die Zeilen, die sonst am längsten sind).
 *
 * Warum im KERN und nicht in `ui/shell`: die Zeitleisten-Insel ist framework-freies JS
 * ohne Zugriff auf die Schale (Spec 02 §5) und braucht denselben Text wie
 * `person-display.ts` — ein Schalen-Helfer hätte als zweite Implementierung geendet.
 *
 * Die volle Kette geht nicht verloren, sie wechselt die Ebene: der Aufrufer hängt sie
 * per `use:tooltip` an dieselbe Zeile (`buildPlacForGedcom`, ADR-v9-86).
 * Reine Funktion — keine Wall-Clock, kein Zustand.
 */
export function buildListPlaceName(ev: Event, ctx: PlaceContext): string {
  if (!ev) return '';
  const bezug = eventSpanne(ev);

  if (ev.hofId != null) {
    const hof = ctx.hofs.byId(ev.hofId);
    if (hof) {
      // Komma-Schutz wie im Wire-Bau: eine Alt-Adresse "Oster 82a, Wester 141" ist zwei
      // Adressen in einem Feld — in der Listenzeile zählt die erste.
      const addrFull = ctx.hofs.resolveAddrAsOf(ev.hofId, bezug) ?? '';
      const addr = addrFull.includes(',') ? extractHofAddr(addrFull) : addrFull;
      const village = placeDisplayName(ctx.places.byId(hof.villageId));
      if (addr && village) return `${addr}, ${village}`;
      if (addr || village) return addr || village;
    }
    // GUARD: hofId gesetzt, Hof-Objekt fehlt (stale) → Rohtext-Fall unten, nicht werfen.
  } else if (ev.placeId != null) {
    const name = placeDisplayName(ctx.places.byId(ev.placeId));
    if (name) return name;
  }

  return atomic(ev.place ?? '');
}

/**
 * Chokepoint (Spec 11 §5): welcher PLAC-String würde für dieses Event geschrieben?
 * Zwei orthogonale Pfade:
 *   1. hofId gesetzt → Hof-Adresse (periodengerecht, Komma-geschützt via Konvention α)
 *      + Dorf-Hierarchie aus buildFormString(hof.villageId). Hof-Blatt erscheint genau
 *      einmal.
 *   2. kein hofId, aber placeId → nur Dorf-Hierarchie.
 * Reine Funktion — keine Wall-Clock, kein Zustand.
 */
export function buildPlacForGedcom(ev: Event, when: Zeitbezug, ctx: PlaceContext): string | null {
  if (!ev) return null;

  const hofId: HofId | null = ev.hofId;
  if (hofId != null) {
    const hof = ctx.hofs.byId(hofId);
    if (hof) {
      const hofAddrFull = ctx.hofs.resolveAddrAsOf(hofId, when) ?? '';
      // Komma-Schutz: PLAC nutzt ',' als Hierarchie-Separator. Enthält die Hof-Adresse
      // selbst ein Komma (Altbestand „Oster 82a, Wester 141"), nur den Teil bis zum
      // ersten Komma in PLAC schreiben. ADDR trägt den vollen Wert; beim Re-Import
      // findet Pfad B (ADDR-basiert) den Hof wieder.
      const hofAddr = hofAddrFull.includes(',') ? extractHofAddr(hofAddrFull) : hofAddrFull;
      const villagePart = buildFormString(ctx.places, hof.villageId, when);
      if (hofAddr && villagePart) return hofAddr + ', ' + villagePart;
      return hofAddr || villagePart || null;
    }
    // GUARD: hofId gesetzt aber hofObject fehlt (stale). NICHT nur placeId schreiben —
    // das würde den Hof-Adressteil verlieren. null → Aufrufer fällt auf ev.place zurück.
    return null;
  }

  if (ev.placeId != null) return buildFormString(ctx.places, ev.placeId, when);
  return null;
}

/** Jahr des Events aus seinem DATE-Feld (Chokepoint-intern; null wenn undatiert). */
export function eventYear(ev: Event): Year {
  return placeYear(ev.date);
}

/**
 * Der ZEITBEZUG eines Events für die Orts-Auflösung (BL-324) — der Nachfolger von
 * `eventYear` an genau den Stellen, an denen gegen datierte Perioden verglichen wird.
 *
 * Warum nicht `eventYear` selbst umgebaut wurde: es hat 53 Aufrufer, und die meisten
 * wollen wirklich ein JAHR (Lebensalter, Zeitleisten-Achse, Karten-Einfärbung,
 * Story-Epochen). Nur die Orts-Auflösung braucht die Tagesauflösung; sie bekommt hier
 * ihre eigene, schmale Tür statt einer Signaturänderung quer durch die App.
 *
 * `null` heißt „undatiert" — identisch zu `eventYear(ev) == null`, und die Aufrufer
 * behandeln es wie bisher (kein Jahreskontext, alle Einträge kommen in Frage).
 */
export function eventSpanne(ev: Event): Spanne | null {
  return spanneVonEreignis(ev.date);
}
