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
import { extractHofAddr, normHofAddr, normPlaceName, placeYear, splitPlacSegments } from './normalize';
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
 *
 * OHNE STICHTAG GILT ZUSÄTZLICH DIE EBENEN-SPERRE (BL-384, ADR-v9-292). `buildFormString`
 * liefert für `when == null` bewusst nur den atomaren Leitnamen: eine Kette ohne Datum
 * wäre eine erfundene Epoche (am Realbestand hätte die volle undatierte Kette 696 von 711
 * undatierten Ereignissen 2.022 Segmente hinzugeschrieben, 686 davon über eine
 * reihenfolgeabhängige `enclosedBy[0]`-Wahl — „Kaiserreich Frankreich" auf einem
 * undatierten OCCU). Der Leitname ist damit die richtige KONSTRUKTION, aber kein
 * zulässiger ERSATZ für eine reichere Quelle: nennt der Quelltext eine Ortsebene, die
 * diese Projektion nicht trägt, wird `null` geliefert. Alle sieben `ev.place`-Schreib-
 * stellen fallen dadurch OHNE eigenes Zutun auf den Quelltext zurück (dieselbe Bewegung
 * wie der `hofObject fehlt`-Guard unten) — der Zwang statt der Erinnerung, statt die
 * Regel an sieben Aufrufern nachzuziehen und beim achten zu vergessen.
 *
 * DATIERT bleibt unberührt: dort hat die Frage seit ADR-v9-224 ihre eigene, engere
 * Antwort (`unbekannteEbenen` im Textangleich), und eine Kürzung kommt dort am
 * Realbestand in 0 von 4.538 Fällen vor.
 */
export function buildPlacForGedcom(ev: Event, when: Zeitbezug, ctx: PlaceContext): string | null {
  const gebaut = bauePlac(ev, when, ctx);
  if (when != null || gebaut == null) return gebaut;
  return verloreneEbenen(ev, ctx, gebaut).length > 0 ? null : gebaut;
}

function bauePlac(ev: Event, when: Zeitbezug, ctx: PlaceContext): string | null {
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
 * Die Ebenen, die der PLAC-Text des Ereignisses nennt und die KEIN Knoten seiner
 * periodengerechten Kette trägt — leer, wenn alles abgedeckt ist.
 *
 * WOZU: eine UMBENENNUNG von einem VERLUST unterscheiden. Beide sehen im Text gleich aus
 * (ein Segment der Quelle fehlt in der Projektion). „Kreis X" → „Amt X" ist derselbe
 * Knoten unter seinem periodengerechten Namen; „…, NRW, Deutschland" → „…,
 * Nordrhein-Westfalen" lässt eine Ebene weg, die der Bestand nicht kennt. Auf
 * Zeichenketten-Ebene ist das nicht zu trennen, auf Knoten-Ebene schon: gehört das Segment
 * zu irgendeinem Knoten der Kette (unter Titel, `shortName`, einer `pname` oder — beim Hof
 * — einer Adressvariante), ist es abgedeckt.
 *
 * EINE Fundstelle für zwei Konsumenten (INV-UI-4): die Verarmungs-Sperre des Textangleichs
 * (`alignCuratedEventTexts`, ADR-v9-224) entscheidet damit, ob sie schreiben darf, und die
 * Qualitätsregel `PLAC_EBENE_UNBEKANNT` meldet damit denselben Zustand als Befund. Zwei
 * Fassungen derselben Prüfung wären zwei Wahrheiten darüber, was „unbekannte Ebene" heißt.
 */
export function unbekannteEbenen(ev: Event, ctx: PlaceContext): string[] {
  const roh = segmente(ev?.place ?? '');
  if (!roh.length) return [];

  const kette = ketteNamen(ev, ctx);
  if (!kette) return [];

  const abgedeckt = new Set<string>();
  for (const knoten of kette.knoten) for (const n of knoten) abgedeckt.add(n);
  for (const a of kette.hofNamen) abgedeckt.add(a);
  abgedeckt.delete('');

  return roh.filter((seg) => !abgedeckt.has(normPlaceName(seg)));
}

/**
 * WARUM `unbekannteEbenen` allein keine Anzeige tragen kann (Nutzer-Befund 2026-08-28).
 *
 * Sie beantwortet EINE Frage — „trägt die periodengerechte Kette jedes Segment der
 * Quelle?" — und das ist als SPERRE genau richtig: sagt sie nein, darf
 * `alignCuratedEventTexts` den Quelltext nicht ersetzen ([ADR-v9-224]). Als BEFUND ist
 * dieselbe Antwort mehrdeutig, weil ein Nein drei verschiedene Ursachen haben kann, und
 * nur eine davon ist das, was die Regel-Beschriftung behauptet:
 *
 *   undatiert       Ohne Stichtag gibt es keine Kette. Gebaut wird trotzdem eine — über
 *                   den ersten `enclosedBy`-Eintrag — und gegen die wird dann gemessen.
 *                   Das ist dieselbe erfundene Epoche, die [ADR-v9-292] für die
 *                   PROJEKTION verboten hat; die PRÜFUNG hatte die Entscheidung nicht
 *                   mitbekommen. Am Bestand des Nutzers 7 von 12 Meldungen.
 *   ankerOhneKette  Der Ankerort trägt gar keine `enclosedBy`-Einträge. Die Kette ist
 *                   dann nur er selbst, und JEDES Elternsegment der Quelle gilt als
 *                   unbekannt — obwohl der Bestand die Ebenen sehr wohl kennt, sie nur
 *                   nicht über diesen Ort verkettet hat. Der Resolver ist hier
 *                   ausdrücklich nachsichtig (`chainCompatibleAnyPath`: „Modell-Kette
 *                   endet → Präfix ok"); dass die Regel es nicht war, ist der Kern des
 *                   Befunds „löst nicht gleich auf wie das Basisprogramm". 5 von 12.
 *   unbekannt       Der eigentliche Zustand: die Quelle nennt eine Ebene, die zum
 *                   Stichtag nicht in der Kette liegt, obwohl der Ort eine hat. 0 von 12.
 *
 * DIE SPERRE BLEIBT UNBERÜHRT. Diese Funktion klassifiziert nur, was `unbekannteEbenen`
 * bereits gefunden hat — sie lockert nichts. In allen zwölf gemessenen Fällen verhindert
 * die Sperre eine echte Kürzung (`Wulfen, Kreis Recklinghausen, …, Deutsches Reich` →
 * `Wulfen`) und tut damit das Richtige; falsch war allein die Beschriftung des Befunds.
 */
export type EbenenUrsache = 'keine' | 'undatiert' | 'ankerOhneKette' | 'unbekannt';

export interface EbenenBefund {
  ursache: EbenenUrsache;
  /** Die gemeldeten Segmente — leer genau bei `keine`. */
  ebenen: string[];
  /** Bei `ankerOhneKette` der Ort, dem die Verwaltungskette fehlt; sonst `null`. */
  ankerId: PlaceId | null;
}

const OHNE_BEFUND: EbenenBefund = { ursache: 'keine', ebenen: [], ankerId: null };

/** Der Ankerort eines Ereignisses für die Ketten-Frage (Hof → sein Dorf). */
function ankerOrt(ev: Event, ctx: PlaceContext): PlaceId | null {
  const hof = ev.hofId != null ? ctx.hofs.byId(ev.hofId) : undefined;
  return hof ? hof.villageId : ev.placeId;
}

/**
 * `unbekannteEbenen` plus die URSACHE (s. den Block darüber). Eine Fundstelle, drei
 * Konsumenten mit verschiedenen Bedürfnissen: die Sperre nimmt weiterhin die rohe
 * Antwort, die Personen-Regel nur `unbekannt`, die Orts-Regel nur `ankerOhneKette`.
 * Reine Funktion.
 */
export function ebenenBefund(ev: Event, ctx: PlaceContext): EbenenBefund {
  const ebenen = unbekannteEbenen(ev, ctx);
  if (!ebenen.length) return OHNE_BEFUND;
  if (eventSpanne(ev) == null) return { ursache: 'undatiert', ebenen, ankerId: null };
  const ankerId = ankerOrt(ev, ctx);
  if (ankerId != null && (ctx.places.byId(ankerId)?.enclosedBy.length ?? 0) === 0) {
    return { ursache: 'ankerOhneKette', ebenen, ankerId };
  }
  return { ursache: 'unbekannt', ebenen, ankerId };
}

/**
 * Die Ebenen, die der PLAC-Text des Ereignisses nennt und die eine gegebene PROJEKTION
 * fallenließe — die Nachbarfrage zu `unbekannteEbenen` (BL-384, ADR-v9-292).
 *
 * DER UNTERSCHIED IST NICHT KOSMETISCH, ER IST GEMESSEN. `unbekannteEbenen` fragt, ob die
 * Quelle eine Ebene nennt, die der BESTAND nicht kennt; hier wird gefragt, ob die
 * PROJEKTION eine Ebene wegläßt, die der Bestand sehr wohl kennt. Die erste Prüfung fängt
 * die zweite nicht: rechnet man dieselben 4.478 reichen, kuratierten Ereignisse des
 * Realbestands einmal OHNE Datum, würde `alignCuratedEventTexts` 260 von ihnen trotz
 * bestandener `unbekannteEbenen`-Sperre schreiben und dabei die Kette auf den Leitnamen
 * kappen („…, Llantwit Major, , The Vale of Glamorgan, Wales, Vereinigtes Königreich" →
 * „Llantwit Major").
 *
 * KNOTENBASIERT, aus demselben Grund wie dort und über dieselbe Abdeckung (`ketteNamen`):
 * ein Segment gilt als getragen, wenn IRGENDEIN Name seines Knotens in der Projektion
 * steht. Eine periodengerechte Umbenennung desselben Knotens („Herzogtum Oldenburg" →
 * „Großherzogtum Oldenburg", 232× gemessen in ADR-v9-224) ist deshalb KEIN Verlust — ein
 * reiner Zeichenketten-Vergleich hätte genau die mitgesperrt.
 *
 * Reine Funktion; die Projektion wird hereingereicht statt hier gebaut, damit die Prüfung
 * nicht davon abhängt, mit welchem Zeitbezug der Aufrufer gebaut hat.
 */
export function verloreneEbenen(ev: Event, ctx: PlaceContext, projektion: string): string[] {
  const roh = segmente(ev?.place ?? '');
  if (!roh.length) return [];

  const kette = ketteNamen(ev, ctx);
  if (!kette) return [];

  const projSegmente = segmente(projektion);
  const projOrte = new Set(projSegmente.map((s) => normPlaceName(s)));
  const projAdressen = new Set(projSegmente.map((s) => normHofAddr(s)));
  const vertreten = kette.knoten.map((namen) => [...namen].some((n) => n !== '' && projOrte.has(n)));
  const hofVertreten = [...kette.hofNamen].some((a) => a !== '' && projAdressen.has(a));

  const verloren: string[] = [];
  for (const seg of roh) {
    const name = normPlaceName(seg);
    const index = kette.knoten.findIndex((namen) => namen.has(name));
    if (index >= 0) {
      if (!vertreten[index]) verloren.push(seg);
      continue;
    }
    // Kein Ortsknoten — aber vielleicht eine Adressvariante des Hofs (Konvention α).
    if (kette.hofNamen.has(normHofAddr(seg)) && !hofVertreten) verloren.push(seg);
  }
  return verloren;
}

/**
 * Die Segmente eines Ortstexts — DIESELBE Sicht wie Seed, Resolver und `extractHofAddr`
 * ([ADR-v9-294]), nicht eine zweite daneben.
 *
 * Hier stand ein nacktes `split(',')`. Ein Komma INNERHALB einer Klammer klammert aber
 * einen Namen und trennt keine Ortsebene: `Oster 64 (110, Einhorst Leibzucht), Ochtrup`
 * sind ZWEI Ebenen, nicht drei. Die Dashboard-Regel `PLAC_EBENE_UNBEKANNT` meldete
 * deshalb an allen acht Ereignissen dieses Hofes das Fragment `Einhorst Leibzucht)` als
 * unbekannte Verwaltungsebene — eine Ebene, die es nicht gibt — während der Resolver
 * dieselbe Zeile anstandslos band (Nutzer-Befund 2026-08-28, am Realbestand gemessen:
 * 8 von 4.923 reichen, verankerten Ereignissen, und das war die EINZIGE Divergenz
 * zwischen Regel- und Resolver-Verdikt).
 */
const segmente = splitPlacSegments;

/**
 * Die Namens-Abdeckung der periodengerechten Kette eines Ereignisses — die gemeinsame
 * Grundlage von `unbekannteEbenen` und `verloreneEbenen`. JE KNOTEN eine Namensmenge
 * (Titel, `shortName`, alle `pnames`), dazu die Adressvarianten des gebundenen Hofs.
 *
 * Bewusst je Knoten statt als ein flaches Set: die eine Prüfung braucht nur die Vereinigung
 * („kennt der Bestand das Segment überhaupt?"), die andere die Zuordnung („welcher Knoten,
 * und steht der in der Projektion?"). Ein flaches Set kann die zweite Frage nicht
 * beantworten — und zwei getrennte Ketten-Läufe wären zwei Wahrheiten darüber, welche
 * Knoten überhaupt zur Kette gehören.
 *
 * `null`, wenn das Ereignis an nichts hängt (kein Anker → keine Aussage möglich).
 */
function ketteNamen(
  ev: Event,
  ctx: PlaceContext,
): { knoten: Set<string>[]; hofNamen: Set<string> } | null {
  const hof = ev.hofId != null ? ctx.hofs.byId(ev.hofId) : undefined;
  const ankerId = hof ? hof.villageId : ev.placeId;
  if (ankerId == null) return null;

  const knoten: Set<string>[] = [];
  for (const id of ctx.places.enclosureIdsAsOf(ankerId, eventSpanne(ev))) {
    const po = ctx.places.byId(id);
    if (!po) continue;
    const namen = new Set<string>([normPlaceName(po.title)]);
    for (const pn of po.pnames ?? []) namen.add(normPlaceName(pn.value));
    if (po.shortName) namen.add(normPlaceName(po.shortName));
    namen.delete('');
    knoten.push(namen);
  }
  const hofNamen = new Set<string>((hof?.addrs ?? []).map((a) => normHofAddr(a.value)));
  hofNamen.delete('');
  return { knoten, hofNamen };
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
