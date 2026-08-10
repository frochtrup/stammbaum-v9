// core/validate/types.ts — Typen der Validierungs-Engine (Spec 20 §3).
// Kern-Schicht: DOM-frei, framework-frei (INV-ARCH-1). Reine Typdefinitionen.
//
// EINE Engine, zwei Konsumenten (Spec 20 §3): der RAM-Bericht hinter „✓ Daten prüfen"
// (§1.11h) und — später — das Qualitäts-Dashboard (§1.11g, BL-05). Die Engine ändert
// NIE Daten; sie liefert ausschließlich `Finding[]`.
import type {
  Database,
  Family,
  FamilyId,
  HofId,
  Person,
  PersonId,
  PlaceId,
  SourceId,
} from '../model/types';
import type { HofObject, PlaceObject } from '../places/types';
import type { PlaceContext } from '../places';

/** Schweregrade der Spec-Skala: ✗ Fehler · ⚠ Warnung · ℹ Hinweis. */
export type Severity = 'error' | 'warn' | 'info';

/** Regelgruppen der Spec-Tabelle (Spec 20 §3) — nur Gliederung, keine Logik. */
export type RuleGroup =
  | 'logik'
  | 'plausibilitaet'
  | 'vollstaendigkeit'
  | 'quellen'
  | 'vernetzung'
  | 'geo'
  /** Format (Interop) — prüft nicht den genealogischen Inhalt, sondern die Struktur der
   *  Datei (ADR-v9-228). Erste Regel dieser Art: ADDR_INDEX_ONLY. */
  | 'format';

/**
 * Vorschlags-Kategorie für „→ Als Aufgabe übernehmen" (ResearchTask.category).
 * Bewusst `string`, KEIN geschlossenes Enum — Spec 12 §1 hält die Kategorie frei;
 * die drei v8-Werte sind nur die üblichen Vorschläge.
 */
export type TaskCategory = string;

/** Ein einzelner Befund. Reines RAM-Ergebnis — nichts davon wird je gespeichert. */
export interface Finding {
  rule: RuleId;
  severity: Severity;
  /** Fertig formulierter deutscher Befundtext (enthält ggf. Zahlen/Grenzwerte). */
  text: string;
  category: TaskCategory;
  /** Trägerentität. Genau eine der vier ist gesetzt, ausser bei Familien-Befunden,
   *  die zusätzlich auf einen Gatten als Anker zeigen (personId + familyId). */
  personId: PersonId | null;
  familyId: FamilyId | null;
  placeId: PlaceId | null;
  hofId: HofId | null;
}

// --- Schwellenwerte ---------------------------------------------------------

/**
 * Konfigurierbare Grenzwerte (Spec 20 §3 „in der Regel-Konfiguration anpassbar").
 * Die Defaults stehen in `defaultThresholds()` (config.ts).
 */
export interface Thresholds {
  /** Unrealistisches Alter (Jahre). */
  maxAge: number;
  /** Geburt ab diesem Jahr → Standesamtsurkunde erwartbar. */
  staStAera: number;
  minMotherAge: number;
  maxMotherAge: number;
  minFatherAge: number;
  maxFatherAge: number;
  minMarrAge: number;
  maxChildren: number;
  /** Max. plausible Distanz Hof ↔ umschließender Ort (km, Haversine). */
  hofMaxDistKm: number;
  /** Bounding-Box plausibler Koordinaten. */
  bboxMinLat: number;
  bboxMaxLat: number;
  bboxMinLon: number;
  bboxMaxLon: number;
}

export type ThresholdKey = keyof Thresholds;

// --- Konfiguration ----------------------------------------------------------

/**
 * Regel-Konfiguration. Lebt app-lokal (IndexedDB, ADR-v9-96) — NICHT in der
 * Genealogie-Datei; der Writer bleibt unberührt, LP-1 damit ununterschritten.
 *
 * `known` ist der Regelstand zum Speicherzeitpunkt: Regeln, die eine gespeicherte
 * Konfiguration noch nicht kannte, erben beim Laden ihren `defaultEnabled`-Wert statt
 * still aktiv zu werden (Spec 20 §3 „known-Vererbung"). Ohne das würde jede neu
 * ergänzte opt-in-Regel bei Bestandsnutzern nach einem App-Update anspringen.
 */
export interface ValidationConfig {
  /** IDs abgeschalteter Regeln. */
  disabled: ReadonlySet<RuleId>;
  thresholds: Thresholds;
  /** Optional: Wurzel der Kernbaum-BFS. null → kleinste Personen-ID als Fallback. */
  probandId: PersonId | null;
}

/** Serialisierbare Fassung für die Persistenz (Sets → Arrays). */
export interface StoredValidationConfig {
  disabled: string[];
  thresholds: Partial<Thresholds>;
  /** Regelstand zum Speicherzeitpunkt — Grundlage der `known`-Vererbung. */
  known: string[];
}

// --- Auswertungs-Kontext ----------------------------------------------------

/**
 * Alles DB-Weite, das VOR den Regelschleifen genau einmal berechnet wird.
 *
 * Warum das die zweite Predicate-Art ersetzt: Spec 20 §3 verlangt für die beiden
 * Vernetzungs-Regeln einen eigenen `graphPredicate`, „DB-weit statt pro Person".
 * Der eigentliche Bedarf ist aber nicht ein anderer Aufruf-Rhythmus, sondern eine
 * DB-weite VORBERECHNUNG (die BFS vom Probanden). Liegt deren Ergebnis im Kontext,
 * sind `ISOLATED_PERSON`/`DISCONNECTED_FROM_ROOT` gewöhnliche Personen-Prädikate —
 * ein Mechanismus weniger, gleiches Ergebnis (ADR-v9-96).
 */
export interface RuleContext {
  db: Database;
  /** Orts-/Hof-Registries (Chokepoints, Spec 11 §5) — `buildContext` baut sie ohnehin für
   *  `hofsWithResidence`; Regeln, die eine periodengerechte Kette brauchen, lesen sie hier,
   *  statt sich eine zweite zu bauen. */
  places: PlaceContext;
  thresholds: Thresholds;
  /** Vom Probanden aus über Eltern-/Ehe-Kanten erreichbare Personen. */
  reachable: ReadonlySet<PersonId>;
  /** Wurzel der BFS (Proband oder Fallback), null bei leerer Datenbank. */
  rootId: PersonId | null;
  /** IDs tatsächlich vorhandener Quellen — Basis für ORPHAN_CITATION. */
  knownSourceIds: ReadonlySet<SourceId>;
  /**
   * Höfe mit mindestens einem hof-bindenden Ereignis (HOF_EVENT_TYPES = RESI/PROP/CENS).
   * HOF_NO_COORD/HOF_FAR prüfen NUR diese. OCCU (Arbeitsstätte) bindet keinen Hof mehr
   * (ADR-v9-143) — damit sind Hof-Bindung und Wohn-Semantik deckungsgleich.
   */
  hofsWithResidence: ReadonlySet<HofId>;
}

// --- Regel-Registry ---------------------------------------------------------

/** Rohtreffer eines Prädikats — der Runner ergänzt Regel-Metadaten und Anker. */
export interface Hit {
  text: string;
  /**
   * Anker-Person. Bei Personen-Regeln implizit die geprüfte Person; Familien-Regeln
   * setzen sie explizit (v8-Parität: ein Familien-Befund hängt am betroffenen Gatten,
   * damit „→ Als Aufgabe übernehmen" eine Trägerentität hat).
   */
  personId?: PersonId | null;
}

export type PersonPredicate = (p: Person, ctx: RuleContext) => readonly Hit[];
export type FamilyPredicate = (f: Family, ctx: RuleContext) => readonly Hit[];
export type PlacePredicate = (o: PlaceObject, ctx: RuleContext) => readonly Hit[];
export type HofPredicate = (h: HofObject, ctx: RuleContext) => readonly Hit[];

/**
 * EINE Regel = EIN Objektliteral in `RULES` (rules.ts). Eine neue Regel zu ergänzen
 * heißt: Eintrag anhängen, `RuleId` erweitern, Test schreiben — kein Eingriff in den
 * Runner, keine zweite Fundstelle in der UI (Config-Sheet und Bericht rendern aus der
 * Registry). Das ist die datengetriebene Auslegung aus Spec 20 §3.
 *
 * Eine Regel kann MEHRERE Entitätsarten prüfen (z. B. ORPHAN_CITATION an Personen und
 * Familien, GEO_BBOX an Orten und Höfen) — Label, Schwere und Schalter bleiben dabei
 * einer, sonst stünde dieselbe Regel zweimal im Konfigurations-Sheet.
 */
export interface Rule {
  id: RuleId;
  label: string;
  group: RuleGroup;
  severity: Severity;
  /** false = ab Werk deaktiviert (opt-in, Spec 20 §3 Konfiguration). */
  defaultEnabled: boolean;
  /** Schwellenwert, den diese Regel benutzt — steuert die Config-UI. */
  threshold: ThresholdKey | null;
  /** Vorschlag für „→ Als Aufgabe übernehmen". */
  category: TaskCategory;
  person?: PersonPredicate;
  family?: FamilyPredicate;
  place?: PlacePredicate;
  hof?: HofPredicate;
}

/**
 * Regel-Identifikatoren. Bewusst als String-Union statt `string`: eine deaktivierte
 * Regel wird über diese ID persistiert, ein Tippfehler wäre sonst ein stiller
 * No-Op-Schalter.
 */
export type RuleId =
  // Logische Fehler
  | 'DEATH_BEFORE_BIRTH'
  | 'EVENT_AFTER_DEATH'
  | 'MARR_BEFORE_BIRTH'
  | 'MARR_AFTER_DEATH'
  | 'CHILD_BEFORE_PARENT'
  | 'CHILD_AFTER_FATHER_DEATH'
  | 'MOTHER_TOO_YOUNG'
  // Plausibilität
  | 'AGE_OVER_MAX'
  | 'MOTHER_TOO_OLD'
  | 'FATHER_TOO_OLD'
  | 'FATHER_TOO_YOUNG'
  | 'MARR_TOO_YOUNG'
  | 'MISSING_SURNAME'
  | 'MISSING_SEX'
  | 'MANY_CHILDREN'
  | 'MULTI_FAMC'
  // Vollständigkeit
  | 'MISSING_BIRTH'
  | 'MISSING_BIRTHPLACE'
  | 'MISSING_DEATHPLACE'
  | 'MISSING_GIVEN'
  | 'MISSING_MARRDATE'
  | 'MISSING_QUAY'
  // Quellen
  | 'NO_SOURCES_AT_ALL'
  | 'BIRTH_AFTER_STAERA'
  | 'NO_FAM_SOURCES'
  | 'ORPHAN_CITATION'
  | 'MISSING_EVAL'
  | 'EVIDENCE_CONFLICT'
  | 'OPEN_HYPO'
  // Vernetzung
  | 'ISOLATED_PERSON'
  | 'DISCONNECTED_FROM_ROOT'
  // Geo (Orte/Höfe)
  | 'GEO_BBOX'
  | 'PNAME_DATE'
  | 'PNAME_OVERLAP'
  | 'ENCLOSURE_CYCLE'
  | 'HOF_NO_COORD'
  | 'HOF_FAR'
  // Format (Interop)
  | 'ADDR_INDEX_ONLY'
  | 'PLAC_EBENE_UNBEKANNT';
