// core/places/gov.ts — GOV-Import (historisch datiert), BL-131 / Spec 20 §1.7 [S],
// Spec 11 §1 (`govId`/`govTypes`). Framework- und DOM-frei (INV-ARCH-1), reine
// Funktionen: Text → Struktur (`parseGovText`), Struktur → PlaceObjects
// (`applyGovEntry`).
//
// WOHER DIE DATEN KOMMEN — bewusst EINFÜGEN statt abrufen (v8-Vorbild
// `_parseGovText`/`applyGovText`, `legacy-v8/ui-views-place.js:381`): das
// Genealogische Ortsverzeichnis (gov.genealogy.net) hat keine offene, stabile
// Abfrage-Schnittstelle für diese Zusammenfassung; die Textform („GOV-ID, dann je Zeile
// `heißt`/`ist`/`gehört`/`hat externe Kennung`") ist dagegen dokumentiert, stabil und
// direkt aus der Weboberfläche kopierbar. Ein eigener Netzwerk-Pfad hierher wäre eine
// zweite Online-Abhängigkeit neben Nominatim (BL-130) mit deutlich schlechterer
// Verlässlichkeit — der Einfüge-Weg funktioniert offline und ist prüfbar.
//
// DREI BEWUSSTE ABWEICHUNGEN VOM v8-ORAKEL (ADR-v9-154):
//
// (1) SPRACHE STATT ALLES-IN-PNAMES. v8 kannte nur `pnames` und warf jeden GOV-Namen
//     dorthin. v9 hat zwei Achsen (Spec 11 §1): `pnames` = Zeitachse („wie hieß der Ort
//     WANN"), `translations` = Sprachachse („wie heißt derselbe Ort JETZT in welcher
//     Sprache"). GOV liefert die Sprache je Namen mit (`heißt (auf pol) Wrocław`) —
//     deutsche Namen gehen also nach `pnames`, fremdsprachige nach `translations`.
//
// (2) KEINE SYNTHETISCHEN TYP-NAMEN. v8 spiegelte jeden Typ-Eintrag zusätzlich als
//     datierten pname „<rawType> <title>" („Königreich Preußen"). Das ist in v9 falsch,
//     nicht nur überflüssig: `pnames` ist ein MATCH-KRITERIUM der Identitätsauflösung
//     (Spec 11 §4.2 sieht `title` + `pnames`) — ein erfundener, von GOV so nie
//     behaupteter Name würde die Zuordnung von Ereignissen verändern. Die Typ-Historie
//     bleibt in `govTypes`.
//
// (3) KEIN `Farm`/`Building` ALS ORTSTYP. v8s Typ-Tabelle mappte `Hof`→`Farm`. Ein Hof
//     ist in v9 eine eigene Entität; `PlaceObject.type` ist NIE Farm/Building (Spec 11
//     §1). Solche GOV-Typen bleiben in `govTypes` erhalten, setzen aber `type` nicht.
import type { PlaceId } from '../model/types';
import type { PlaceObject, PlaceObjects, Year } from './types';
import { slugify } from './normalize';

/** Ein `ist [ab X] [bis Y] (auf deu) TYP`-Eintrag. */
export interface GovTypeEntry {
  /** Das GOV-Wort, unverändert („Kirchdorf", „Königreich"). */
  rawType: string;
  /** Übersetzung in das v9-Typ-Vokabular (`PLACE_TYPE_DE`-Schlüssel) — `''` wenn keine. */
  type: string;
  from: Year;
  to: Year;
}

/** Ein `heißt [DATUM] (auf LANG) NAME`-Eintrag. */
export interface GovNameEntry {
  /** ISO-639-2-artiger GOV-Sprachcode („deu", „pol", „nld"). */
  lang: string;
  value: string;
  from: Year;
  to: Year;
}

/** Ein `gehört [ab X] [bis Y] zu object_NNNNN`-Eintrag. */
export interface GovParentEntry {
  govObjId: string;
  from: Year;
  to: Year;
}

export interface GovEntry {
  /** Die GOV-Kennung des Objekts (erste Zeile). */
  govId: string;
  types: GovTypeEntry[];
  names: GovNameEntry[];
  parents: GovParentEntry[];
  /** `hat externe Kennung geonames:2855745` → `{ geonames: '2855745' }`. */
  extIds: Record<string, string>;
  description: string;
}

/**
 * GOV-Typwort → v9-Ortstyp-Vokabular (Schlüssel aus `ui/shell/place-labels.ts`
 * `PLACE_TYPE_DE`). Übernommen aus dem v8-Orakel `_GOV_TYPE_MAP`, MINUS `Hof`→`Farm`
 * (s. Abweichung 3 oben).
 *
 * Ein Wort, das hier fehlt, ist kein Fehler: es bleibt roh in `govTypes` erhalten und
 * setzt `type` nur nicht (gleicher Vertrag wie `placeTypeLabel` für unbekannte Werte —
 * nichts erfinden).
 */
export const GOV_TYPE_TO_PLACE_TYPE: Readonly<Record<string, string>> = {
  Landgemeinde: 'Municipality',
  Gemeinde: 'Municipality',
  Verbandsgemeinde: 'Municipality',
  Samtgemeinde: 'Municipality',
  Verwaltungsgemeinschaft: 'Municipality',
  Amt: 'Municipality',
  Stadt: 'Town',
  'Stadt (Gebietskörperschaft)': 'Town',
  Stadtgemeinde: 'Town',
  Wigbold: 'Town',
  Flecken: 'Town',
  Marktgemeinde: 'Town',
  'Freie Stadt': 'City',
  Dorf: 'Village',
  Kirchdorf: 'Village',
  Weiler: 'Hamlet',
  Einöde: 'Hamlet',
  Kirchspiel: 'Parish',
  Kirchengemeinde: 'Parish',
  Pfarrei: 'Parish',
  Bistum: 'Parish',
  Erzbistum: 'Parish',
  Landkreis: 'County',
  Kreis: 'County',
  Stadtkreis: 'County',
  Regierungsbezirk: 'District',
  Bezirk: 'District',
  Provinz: 'Province',
  Bundesland: 'State',
  Land: 'State',
  Freistaat: 'State',
  Staat: 'Country',
  Königreich: 'Country',
  Großherzogtum: 'Country',
  Herzogtum: 'Country',
  Fürstentum: 'Country',
  Kurfürstentum: 'Country',
  Kirche: 'Church',
  Friedhof: 'Cemetery',
};

/** GOV-Sprachcodes für Deutsch — alles andere gilt als Übersetzung (Sprachachse).
 *  Beide Formen, weil das v8-Werkzeug `gov-enrich.py` (gegen echte GOV-Texte gelaufen)
 *  ebenfalls `('deu', 'de')` prüft. */
const LANGS_DE = new Set(['deu', 'de']);

/** Erste vierstellige Jahreszahl aus einem GOV-Datum („1885-01-01" → 1885). */
function govYear(s: string | null | undefined): Year {
  if (!s) return null;
  const m = s.match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

/**
 * Parst eine aus gov.genealogy.net kopierte Textzusammenfassung.
 *
 * Gibt `null` zurück, wenn der Text leer ist ODER keine EINZIGE GOV-Aussage enthält
 * (`heißt`/`ist`/`gehört`/`hat externe Kennung`).
 *
 * Die zweite Bedingung ist bewusst strenger als das v8-Orakel: dort galt der Text als
 * gültig, sobald die erste Zeile existierte — sie wird ja ungeprüft zur GOV-Kennung. Ein
 * versehentlich eingefügter Absatz irgendeines Textes hätte damit eine erfundene Kennung
 * an den Ort geschrieben. Kein Test hätte das gefangen; die Fehlermeldung „GOV-ID nicht
 * erkannt" war in v8 faktisch unerreichbar.
 */
export function parseGovText(raw: string): GovEntry | null {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/[,;]\s*$/, '').trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  const entry: GovEntry = {
    govId: lines[0],
    types: [],
    names: [],
    parents: [],
    extIds: {},
    description: '',
  };

  for (const line of lines.slice(1)) {
    if (line.startsWith('TEXT:')) {
      entry.description = line.replace(/^TEXT:/, '').replace(/:TEXT$/, '').trim();
      continue;
    }
    // `gehört DATUM zu object_NNNNN` (Stichtag ohne ab/bis — Altform). MUSS vor der
    // ab/bis-Form stehen: deren optionales Zusatzwort (s. u.) würde das Datum sonst
    // verschlucken und die Zugehörigkeit undatiert ablegen (beim Bau am Test gefunden).
    const parentAt = line.match(/^gehört\s+(\d\S*)\s+zu\s+(\S+)/);
    if (parentAt) {
      const y = govYear(parentAt[1]);
      entry.parents.push({ govObjId: parentAt[2], from: y, to: y });
      continue;
    }
    // `gehört [ab DATUM] [bis DATUM] [<Zusatzwort>] zu object_NNNNN`. Das optionale
    // Zusatzwort vor `zu` stammt aus `gov-enrich.py` (gegen echte GOV-Texte gelaufen) —
    // der v8-UI-Parser kannte es nicht und verlor solche Zeilen still.
    const parent = line.match(/^gehört(?:\s+ab\s+(\S+))?(?:\s+bis\s+(\S+))?\s+(?:\S+\s+)?zu\s+(\S+)/);
    if (parent) {
      entry.parents.push({ govObjId: parent[3], from: govYear(parent[1]), to: govYear(parent[2]) });
      continue;
    }
    // `ist [ab DATUM] [bis DATUM] (auf deu) TYP [sagt …]`
    const type = line.match(/^ist(?:\s+ab\s+(\S+))?(?:\s+bis\s+(\S+))?\s+\(auf \w+\)\s+(.+?)(?:\s+sagt\b.*)?$/);
    if (type) {
      const rawType = type[3].trim();
      entry.types.push({
        rawType,
        type: GOV_TYPE_TO_PLACE_TYPE[rawType] ?? '',
        from: govYear(type[1]),
        to: govYear(type[2]),
      });
      continue;
    }
    // `heißt [DATUM] (auf LANG) NAME [sagt …]`
    const name = line.match(/^heißt(?:\s+(?!\()(\S+))?\s*\(auf (\w+)\)\s+(.+?)(?:\s+sagt\b.*)?$/);
    if (name) {
      const y = govYear(name[1]);
      entry.names.push({ lang: name[2], value: name[3].trim(), from: y, to: y });
      continue;
    }
    const ext = line.match(/^hat externe Kennung\s+(\w+):(\S+)/);
    if (ext) entry.extIds[ext[1]] = ext[2];
  }

  const recognized =
    entry.names.length + entry.types.length + entry.parents.length + Object.keys(entry.extIds).length;
  if (recognized === 0) return null;

  return entry;
}

/**
 * Ist `pl` ein noch unaufgelöster GOV-Platzhalter?
 *
 * BEWUSST ABGELEITET STATT ALS FELD (Abweichung von v8s `_govUnresolved`-Flag): ein
 * Platzhalter ist genau ein Ort, dessen einziger bekannter „Name" seine GOV-Kennung ist.
 * Das ist ohne zusätzliches Feld ablesbar — kein `PLACES_SCHEMA_VERSION`-Bump, kein
 * Feld, das beim Union-Merge (LP-9) mitreisen und veralten könnte. Und es hat die
 * richtige Semantik von selbst: sobald jemand dem Ort einen echten Titel gibt (per Hand
 * oder durch Einfügen SEINER GOV-Zusammenfassung), ist er aufgelöst.
 */
export function isUnresolvedGovPlaceholder(pl: PlaceObject): boolean {
  return !!pl.govId && pl.title === pl.govId;
}

/** Wie viele unaufgelöste GOV-Platzhalter enthält der Bestand? (Kurations-Zähler, BL-206.) */
export function countUnresolvedGovPlaceholders(places: PlaceObjects): number {
  let n = 0;
  for (const pl of places.values()) if (isUnresolvedGovPlaceholder(pl)) n += 1;
  return n;
}

/** Deterministische Id eines Platzhalter-Orts — dieselbe GOV-Kennung ergibt auf jedem
 *  Gerät dieselbe Id (Voraussetzung dafür, dass der Union-Merge zweier orte.json sie
 *  als EINEN Ort erkennt, Spec 30 §4). */
export function govPlaceholderId(govObjId: string): PlaceId {
  return `_gov_${slugify(govObjId) || 'x'}`;
}

export interface GovApplyResult {
  /** Menschenlesbare Kurzbeschreibung dessen, was sich geändert hat (für die UI-Meldung). */
  notes: string[];
  /** Neu angelegte Platzhalter-Orte (Eltern, deren GOV-Eintrag noch fehlt). */
  createdPlaceholders: PlaceId[];
  /** Gesamtzahl der Einzeländerungen — 0 = nichts zu tun. */
  changes: number;
}

function sameYear(a: Year, b: Year): boolean {
  return (a ?? null) === (b ?? null);
}

/**
 * Wendet einen geparsten GOV-Eintrag auf das PlaceObject `placeId` an.
 *
 * FILL-IF-EMPTY, nicht überschreiben — dieselbe Regel wie beim Orts-Merge (§9.2): was der
 * Nutzer kuratiert hat, gewinnt gegen den Import. Ergänzt wird alles, was fehlt
 * (Namen, Übersetzungen, Zugehörigkeiten, Typ-Historie).
 *
 * Mutiert `places` (Map + Objekte), analog `mergePlaceObjects`. Gibt `null` zurück, wenn
 * `placeId` nicht existiert.
 */
export function applyGovEntry(places: PlaceObjects, placeId: PlaceId, entry: GovEntry): GovApplyResult | null {
  const pl = places.get(placeId);
  if (!pl) return null;

  // Defensive Normalisierung der abwärtskompatiblen Listen-Felder: `translations` (und
  // aus derselben Familie `pnames`/`enclosedBy`) können an einem aus einer älteren
  // orte.json geladenen Objekt FEHLEN — jeder Leseweg nutzt `?? []` (ADR-v9-144/-100).
  // Diese Funktion SCHREIBT auf ihnen, also muss sie sie hier einmalig sicherstellen.
  if (!pl.pnames) pl.pnames = [];
  if (!pl.translations) pl.translations = [];
  if (!pl.enclosedBy) pl.enclosedBy = [];

  const result: GovApplyResult = { notes: [], createdPlaceholders: [], changes: 0 };
  const bump = (note: string) => {
    result.changes += 1;
    result.notes.push(note);
  };

  if (!pl.govId && entry.govId) {
    pl.govId = entry.govId;
    bump(`GOV-Kennung ${entry.govId}`);
  }

  // Typ-Historie: alle GOV-Typwörter sammeln (roh — die Übersetzung steckt in `type`).
  const govTypes = [...(pl.govTypes ?? [])];
  let addedTypes = 0;
  for (const t of entry.types) {
    if (!govTypes.includes(t.rawType)) {
      govTypes.push(t.rawType);
      addedTypes += 1;
    }
  }
  if (addedTypes > 0) {
    pl.govTypes = govTypes;
    bump(`${addedTypes} GOV-Typ${addedTypes === 1 ? '' : 'en'}`);
  }

  // Aktueller Typ: offener Eintrag (kein `bis`) bevorzugt, sonst der jüngste — nur setzen,
  // wenn noch keiner kuratiert ist. Farm/Building sind hier ausgeschlossen, weil die
  // Typ-Tabelle sie gar nicht erst erzeugt (s. Kopfkommentar Abweichung 3).
  if (!pl.type || pl.type === 'Unknown') {
    // Unter den offen endenden Einträgen der mit dem SPÄTESTEN `ab` — nicht einfach der
    // erste (so tat es v8: `types.find(t => !t.dateTo)`). Ochtrup zeigt warum: „ist (auf
    // deu) Kirchdorf" (ganz ohne Datum, also formal offen) steht VOR „ist ab 1969 (auf
    // deu) Stadt". v8s Regel hätte „Dorf" als aktuellen Typ gesetzt.
    const usable = entry.types.filter((t) => t.type);
    const byRecency = [...usable].sort((a, b) => (b.from ?? 0) - (a.from ?? 0));
    const chosen = byRecency.find((t) => t.to == null) ?? byRecency[0];
    if (chosen) {
      pl.type = chosen.type;
      bump(`Typ „${chosen.rawType}"`);
    }
  }

  const germanNames = entry.names.filter((n) => LANGS_DE.has(n.lang));
  const foreignNames = entry.names.filter((n) => !LANGS_DE.has(n.lang));

  // Titel: nur füllen, wenn er fehlt oder noch die GOV-Kennung ist (Platzhalter).
  if ((!pl.title || pl.title === pl.govId) && germanNames.length > 0) {
    pl.title = germanNames[0].value;
    bump(`Titel „${pl.title}"`);
  }

  // Zeitachse: deutsche Namensvarianten als `pnames` (Spec 11 §1).
  let addedNames = 0;
  for (const n of germanNames) {
    if (n.value === pl.title && n.from == null && n.to == null) continue; // schon der Titel
    const exists = pl.pnames.some((p) => p.value === n.value && sameYear(p.from, n.from) && sameYear(p.to, n.to));
    if (exists) continue;
    pl.pnames.push({ value: n.value, from: n.from, to: n.to });
    addedNames += 1;
  }
  if (addedNames > 0) bump(`${addedNames} Namensvariante${addedNames === 1 ? '' : 'n'}`);

  // Sprachachse: fremdsprachige Namen als `translations` (Spec 11 §1) — NICHT als pnames
  // (v8 tat das mangels eigener Sprachachse, s. Kopfkommentar Abweichung 1).
  let addedTrans = 0;
  for (const n of foreignNames) {
    if (pl.translations.some((t) => t.lang === n.lang && t.value === n.value)) continue;
    pl.translations.push({ lang: n.lang, value: n.value });
    addedTrans += 1;
  }
  if (addedTrans > 0) bump(`${addedTrans} Übersetzung${addedTrans === 1 ? '' : 'en'}`);

  // Verwaltungs-Zugehörigkeit: je Elternteil ein `enclosedBy`-Eintrag. Existiert für die
  // GOV-Kennung noch kein Ort, entsteht ein PLATZHALTER (Titel = Kennung) — der Nutzer
  // löst ihn später auf, indem er dessen GOV-Zusammenfassung ebenfalls einfügt.
  let addedParents = 0;
  for (const parent of entry.parents) {
    let target = findByGovId(places, parent.govObjId);
    if (!target) {
      const id = govPlaceholderId(parent.govObjId);
      target = places.get(id) ?? null;
      if (!target) {
        target = makeGovPlaceholder(id, parent.govObjId);
        places.set(id, target);
        result.createdPlaceholders.push(id);
      }
    }
    const exists = pl.enclosedBy.some(
      (e) => e.placeId === target!.id && sameYear(e.from, parent.from) && sameYear(e.to, parent.to),
    );
    if (exists) continue;
    pl.enclosedBy.push({ placeId: target.id, from: parent.from, to: parent.to });
    addedParents += 1;
  }
  if (addedParents > 0) bump(`${addedParents} Zugehörigkeit${addedParents === 1 ? '' : 'en'}`);
  if (result.createdPlaceholders.length > 0) {
    result.notes.push(
      `${result.createdPlaceholders.length} GOV-Platzhalter angelegt (noch ohne Namen)`,
    );
  }

  return result;
}

function findByGovId(places: PlaceObjects, govObjId: string): PlaceObject | null {
  for (const pl of places.values()) {
    if (pl.govId === govObjId || pl.title === govObjId) return pl;
  }
  return null;
}

function makeGovPlaceholder(id: PlaceId, govObjId: string): PlaceObject {
  return {
    id,
    title: govObjId,
    shortName: '',
    type: '',
    pnames: [],
    translations: [],
    enclosedBy: [],
    lat: null,
    long: null,
    note: '',
    existsFrom: null,
    existsTo: null,
    govId: govObjId,
    govTypes: null,
  };
}
