// core/places/types.ts — Orts-/Hof-Datenmodell (Spec 11 §1).
// DOM-frei, framework-frei (INV-ARCH-1). Reine Typdefinitionen + zwei kleine
// Basis-Werttypen; keine Laufzeit-Logik.
import type { PlaceId, HofId } from '../model/types';

/** Jahr als Zahl (aus DATE extrahiert) oder null (undatiert / kein Datum). */
export type Year = number | null;

/**
 * Wert mit optionalem Gültigkeitszeitraum (Spec 11 §1).
 * `from`/`to` sind Jahreszahlen (aus `_dateRaw` extrahiert). null = offen.
 * `_dateRaw` bewahrt den originalen GEDCOM/GRAMPS-Datumsstring (Roundtrip-Fidelity).
 */
export interface Dated {
  value: string;
  from: Year;
  to: Year;
  dateRaw?: string | null;
}

/** Datierte Namensvariante eines PlaceObject (sprachlich/orthographisch/historisch). */
export type DatedName = Dated;

/** Datierte Adress-Bezeichnung eines HofObject (Umbenennung, Hausnr.-Reform). */
export interface DatedAddress extends Dated {
  lang?: string;
}

/** Datierte Verwaltungs-Zugehörigkeit (enclosedBy). */
export interface DatedRef {
  placeId: PlaceId;
  from: Year;
  to: Year;
  dateRaw?: string | null;
}

/**
 * PlaceObject — Verwaltungseinheit (Spec 11 §1).
 * `type` ist NIE Farm/Building — Höfe sind separate Entität (HofObject).
 */
export interface PlaceObject {
  id: PlaceId;
  title: string;
  /**
   * Zeitinvarianter Anzeigename für Listen (Spec 11 §1, ADR-v9-90/-100). Leer = `title`.
   * Die dritte Achse neben `pnames` (Zeit) und `translations` (Sprache): EIN Name für
   * kompakte Listen, per Hand kuratiert dort, wo echte Homonyme es nötig machen
   * ("Frankfurt (Main)"). App-privat in `orte.json` — erreicht den EXPORT NIE (sonst
   * stünde die Anzeigekonvention in der GEDCOM-Datei, LP-1) und ist NIE Identitäts-
   * merkmal oder Match-Kriterium (§4.2 sieht ausschließlich `title` + `pnames`).
   * Einziger erlaubter Leseweg: `placeDisplayName()` (§5).
   */
  shortName: string;
  type: string;
  pnames: DatedName[];
  enclosedBy: DatedRef[];
  lat: number | null;
  long: number | null;
  note: string;
  existsFrom: Year;
  existsTo: Year;
  govId: string | null;
  govTypes: string[] | null;
}

/**
 * HofObject — Hof als eigenständige Entität (Spec 11 §1).
 * id ist deterministisch: `_hof_<addrSlug>_<villageSlug>` (Spec 11 §1, §6).
 */
export interface HofObject {
  id: HofId;
  villageId: PlaceId;
  addrs: DatedAddress[];
  lat: number | null;
  long: number | null;
  note: string;
  existsFrom: Year;
  existsTo: Year;
  predecessor: HofId | null;
  successor: HofId | null;
  govId: string | null;
  govTypes: string[] | null;
  schemaVersion: number;
}

/** Nach oben abgeschlossene Sammlung der aufgelösten Orts-/Hof-Welt. */
export type PlaceObjects = Map<PlaceId, PlaceObject>;
export type HofObjects = Map<HofId, HofObject>;
