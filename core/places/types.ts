// core/places/types.ts — Orts-/Hof-Datenmodell (Spec 11 §1).
// DOM-frei, framework-frei (INV-ARCH-1). Reine Typdefinitionen + zwei kleine
// Basis-Werttypen; keine Laufzeit-Logik.
import type { PlaceId, HofId, NameTranslation } from '../model/types';

export type { NameTranslation };

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
  /** Tagegenauer Beginn als GEDCOM-Datumsstring (BL-324, ADR-v9-243) — optional und
   *  ADDITIV: `from` bleibt die Jahres-Vergleichsbasis und muss dazu passen. Wo dies
   *  fehlt, verhält sich die Auflösung unverändert jahresweise (`core/places/zeitbezug.ts`).
   *  App-privat: erreicht weder GEDCOM noch GRAMPS. NICHT zu verwechseln mit `dateRaw`,
   *  das den unveränderten Quelltext einer IMPORTIERTEN Datierung bewahrt. */
  fromDate?: string | null;
  /** Tagegenaues Ende, analog `fromDate`. */
  toDate?: string | null;
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
  /** s. `Dated.fromDate` (BL-324) — hier trägt es den Stichtag einer Verwaltungsreform. */
  fromDate?: string | null;
  /** s. `Dated.toDate` (BL-324). */
  toDate?: string | null;
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
  /**
   * Mehrsprachige Namensform (Spec 11 §1, BL-59) — die SPRACHACHSE neben `pnames` (Zeit)
   * und `shortName` (Anzeige): „wie heißt DERSELBE Ort JETZT in welcher Sprache" (Breslau
   * `de` / Wrocław `pl`). `NameTranslation {lang, value}` ist derselbe Struct, den Person
   * für `nameTrans` nutzt (INV-UI-4 auf Datenebene). App-privat wie `shortName`: lebt nur in
   * `orte.json`, speist NIE den PLAC-Wire (der kommt aus `pnames`/`title` über
   * `buildFormString`) und ist NIE Identitäts-/Match-Kriterium (§4.2 sieht `title` + `pnames`).
   * Über den orte.json-Roundtrip erhalten (LP-1). Optional beim Lesen (alte Datei ohne Feld):
   * jeder Leseweg nutzt `?? []` — kein `PLACES_SCHEMA_VERSION`-Bump (abwärtskompatibel wie
   * `shortName`, ADR-v9-100/-144).
   */
  translations: NameTranslation[];
  enclosedBy: DatedRef[];
  lat: number | null;
  long: number | null;
  note: string;
  existsFrom: Year;
  existsTo: Year;
  govId: string | null;
  govTypes: string[] | null;
  /**
   * Prüf-Marker (Spec 11 §9.1, ADR-v9-191) — Zeitstempel der ausdrücklichen Nutzer-
   * Entscheidung „ich habe diesen Ort angesehen". Er behauptet NICHT „fertig recherchiert"
   * (das ist bei einem Ort keine haltbare Aussage), sondern nur, dass ein Mensch entschieden
   * hat.
   *
   * **Die zweite Achse neben dem Anreicherungs-Grad** (`isEnrichedPlace`, §9.1): der Grad
   * misst den INHALT und kann über die Herkunft nichts sagen — ein GOV-Platzhalter trägt
   * `govId` und gilt inhaltlich als angereichert, obwohl ihn nie jemand gesehen hat; ein
   * geprüfter, für richtig befundener Ort ändert dagegen kein einziges Feld. Genau diese
   * Lücke schließt der Marker; ableitbar ist er deshalb prinzipiell nicht.
   *
   * **Nur der „geprüft"-Knopf setzt ihn.** Kein automatischer Pfad (Seed, GOV-Platzhalter,
   * Hof-Bootstrap, Merge-Nachlauf), und Bearbeiten allein ebenfalls nicht. Umkehrbar.
   * Optional: eine `orte.json` ohne das Feld ist gültig (`undefined` = nie geprüft) —
   * additiv und beidseitig abwärtskompatibel wie `shortName`, also KEIN
   * `PLACES_SCHEMA_VERSION`-Bump. Einziger Leseweg: `isReviewed()` (§9.1).
   */
  reviewedAt?: number | null;
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
  /** Prüf-Marker wie beim PlaceObject (Spec 11 §9.1, ADR-v9-191) — dieselbe Semantik,
   *  dieselbe Herkunftsregel, derselbe Leseweg (`isReviewed`). */
  reviewedAt?: number | null;
  schemaVersion: number;
  /**
   * Roundtrip-Fidelity: die GRAMPS-`id` (P0000) des `<placeobj type="Building">`, aus dem
   * dieser Hof projiziert wurde (BL-143). Optional — gesetzt NUR für Building-Ursprungs-Höfe;
   * `null`/fehlend bei GEDCOM-Höfen und bei Höfen, die aus einer RESI/PROP-`<description>`
   * gebootet wurden (deren Adresse round-trippt über das Event-`<description>`, NICHT als
   * eigenes `<placeobj>` — sonst entstünde beim reinen Laden/Speichern net_delta≠0). Nur der
   * placeobj-Write-Back liest es; GEDCOM ignoriert es. Die `id` selbst bleibt deterministisch
   * (`_hof_<addrSlug>_<villageSlug>`), damit die Hof-Identität formatunabhängig gilt.
   */
  grampsId?: string | null;
}

/** Nach oben abgeschlossene Sammlung der aufgelösten Orts-/Hof-Welt. */
export type PlaceObjects = Map<PlaceId, PlaceObject>;
export type HofObjects = Map<HofId, HofObject>;
