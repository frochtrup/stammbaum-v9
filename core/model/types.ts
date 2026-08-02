// core/model/types.ts — reine Typdefinitionen des Domänenkerns (Spec 10).
// DOM-frei, framework-frei (INV-ARCH-1). Keine Laufzeit-Logik hier.
import type { ResearchTask, LogEntry, Hypothesis } from '../research/types';

// Konkrete Orts-/Hof-Form kommt aus dem Orts-Kern (Spec 11). Type-only-Import →
// unter isolatedModules erased, kein Laufzeit-Zyklus (Model ↔ Places, gleiche Schicht).
import type { PlaceObject as PlaceObjectT, HofObject as HofObjectT } from '../places/types';

// GedNode ist die generische Passthrough-Zeile (INV-PT); MediaCitation.extra hält
// unbekannte OBJE-Kinder verbatim. Type-only-Import → unter isolatedModules erased,
// kein Laufzeit-Zyklus (Model liest nur den Struktur-Typ, keine Interop-Logik).
import type { GedNode } from '../interop/gedcom-tree';

// --- ID-Typen (GEDCOM-Konvention @Ixx@/@Fxx@/@Sxx@/@Rxx@/@Nxx@) ---
export type PersonId = string;
export type FamilyId = string;
export type SourceId = string;
export type RepoId = string;
export type NoteId = string;
export type PlaceId = string;
export type HofId = string;
/** Medien-Identität (ADR-v9-124): = der `FILE`-Pfad selbst, app-intern, NICHT serialisiert. */
export type MediaId = string;

export type Sex = 'M' | 'F' | 'U';

/** GEDCOM-Datumsangabe intern als normalisierter Raw-String (Spec 10 §5.2). */
export type DateValue = string;

// --- Evidenz (3-Achsen-Modell, Detail in Spec 12 §3) ---
export type EvidenceSource = 'original' | 'derivative' | 'authored' | '';
export type EvidenceInformation = 'primary' | 'secondary' | 'undetermined' | '';
export type EvidenceEvidenceKind = 'direct' | 'indirect' | 'negative' | '';

export interface EvidenceEval {
  source: EvidenceSource;
  information: EvidenceInformation;
  evidence: EvidenceEvidenceKind;
  /** Informant (optional, `_INFM`, Spec 12 §3): Freitext oder Person-Xref. */
  informant?: string;
}

/**
 * Globaler Datensatz EINES Mediums (Spec 10 §4, ADR-v9-124). Lebt in `db.media`,
 * keyed by `id` (= `file`). Trägt die globalen, referenz-übergreifenden Felder —
 * „Speichern (alle Ref.)" ändert nur hier.
 */
export interface Media {
  /** GEDCOM: `@M@`-Xref (Record) bzw. FILE-Pfad (Inline-Altform); GRAMPS: `id` (O0000).
   *  App-intern, wird NIE ins Wire-Format geschrieben. */
  id: MediaId;
  /** FILE / `<file src>` — relativer Pfad (Datei-/Sync-Ordner) — einzige Wahrheitsquelle. */
  file: string;
  /** FORM / `<file mime>` — Dateiformat, KANONISIERT als MIME (Narrow Waist, ADR-v9-126). */
  form: string;
  /**
   * Der GEDCOM-`FORM`-Wert, wie er in der Quelldatei stand (`JPEG`, `BMP`, `FILE`, `URL`) —
   * neben `wireOrigin` das zweite reine Fidelity-Feld dieser Entität, mit derselben
   * Begründung: der Writer erhält ihn unverändert (LP-1, BL-290/ADR-v9-207).
   *
   * `form` allein kann ihn nicht tragen: die Kanonisierung an der Parse-Grenze ist NICHT
   * umkehrbar (`JPEG`→`image/jpeg`→`jpg`), und `FILE`/`URL` bezeichnen überhaupt kein
   * Format. Ohne dieses Feld schrieb jedes Speichern die Schreibweise um — eine
   * byte-verändernde Projektion ohne Anlass (ADR-v9-197).
   *
   * **Nur GEDCOM.** GRAMPS hat kein `FORM`: sein `<file mime>` IST das kanonische MIME und
   * wird aus `form` zurückgeschrieben — dort bleibt das Feld leer. Beim Schreiben gilt es
   * nur, solange es dasselbe Format bezeichnet wie `form` (`gedFormValue`); ein Nutzer-Edit
   * an Format oder Dateiname setzt es außer Kraft, statt es zu konservieren.
   */
  formWire: string;
  /** MEDI — Medientyp (Standard-Enum unter FORM); GRAMPS/Import oft leer. */
  type: string;
  /** GLOBALE Beschriftung: GED7-Record-`TITL` / GRAMPS `<file description>`; leer bei 5.5.1-Inline. */
  title: string;
  /** Wire-Herkunft — der Writer erhält sie unverändert (LP-1): `record`→Record+Zeiger, `inline`→inline. */
  wireOrigin: 'record' | 'inline';
  lastChanged: string;
}

/**
 * Referenz-spezifische Verknüpfung EIN Medium ↔ EINE Entität/Ereignis/Zitat
 * (Spec 10 §4). Gleiche Rollenverteilung wie `Source`/`Citation`.
 */
export interface MediaCitation {
  /** FK auf `Media.id`. */
  mediaId: MediaId;
  /** Per-Ref-OVERRIDE der globalen `Media.title` (leer ⇒ globalen Titel verwenden). */
  title: string;
  /** _DATE — Aufnahmedatum in diesem Kontext. */
  date: string;
  /** NOTE. */
  note: string;
  /** _PRIM — Hauptfoto/-dokument für DIESEN Datensatz. */
  primary: boolean;
  /** Unbekannte OBJE-Kinder (z. B. `_SCBK`) verbatim erhalten (INV-PT, edit-sicher). */
  extra: GedNode[];
}

export type Quay = 0 | 1 | 2 | 3;

/** Einheitlicher Zitatkörper — gilt in ALLEN Kontexten (Spec 10 §5.3). */
export interface Citation {
  sourceId: SourceId;
  page: string;
  /**
   * `QUAY` — TRISTATE: `null` = kein QUAY-Tag, `0`–`3` = ausdrückliche Bewertung
   * (BL-302, [ADR-v9-208]). `0` heißt in GEDCOM „unzuverlässig" und ist damit eine
   * AUSSAGE — solange es zugleich der Default war, fiel es mit „gar keine Bewertung"
   * zusammen und der Writer ließ die Zeile weg (30× in `Unsere Familie 2026.ged`).
   *
   * Der Editor braucht dafür KEINEN vierten Zustand: „nicht bewertet" ist schlicht
   * „nie angefasst". Anzeigende Leser nehmen `quay ?? 0` — für sie ändert sich nichts.
   */
  quay: Quay | null;
  note: string;
  media: MediaCitation[];
  eval: EvidenceEval | null;
  /** = media[0].mediaId (OBJE/FILE-Pfad), NICHT page. */
  deepLinkUrl: string;
  /**
   * Roundtrip-Fidelity: die eindeutige GRAMPS-`id` (C0000) des GETEILTEN `<citation>`-Records,
   * aus dem dieses Zitat projiziert wurde (ADR-v9-11/114). Wie alle GRAMPS-Referenzen zeigt
   * das Modell auf die `id`, NICHT das Datei-`handle` (BL-136): mehrfach genutzte Zitate sind
   * über ihre stabile id identifizierbar/zusammenführbar, das Handle→id/id→Handle stellt
   * `buildRefIndex`. Nur GRAMPS-seitig gesetzt; GEDCOM ignoriert es. `null` = kein GRAMPS-
   * Ursprung / neu (dann vergibt das Write-Back eine frische id + Handle).
   */
  grampsId: string | null;
}

/** FAMC-Mitgliedschaft als Kind — Beziehungstyp lebt INDI-seitig (INV-P4). */
export interface ChildLink {
  familyId: FamilyId;
  pedigree: 'birth' | 'adopted' | 'foster' | 'sealing' | '';
  fatherRel: string;
  motherRel: string;
  fatherRelSeen: boolean;
  motherRelSeen: boolean;
  citations: Citation[];
}

export interface PersonName {
  nameRaw: string;
  given: string;
  surname: string;
  prefix: string;
  suffix: string;
  type: string;
  citations: Citation[];
}

export interface NameTranslation {
  lang: string;
  value: string;
}

export interface Association {
  personRef: PersonId | null;
  grampsHandle: string | null;
  role: string;
  note: string;
  citations: Citation[];
}

export interface ExternalId {
  value: string;
  type: string;
}

/**
 * Event — Person und Familie teilen ein Modell (Spec 10 §5.1).
 * Feld-Tristate für date/place/addr: null (Tag fehlt), '' (Tag da, leer), Wert (belegt).
 */
export interface Event {
  type: string;
  value: string;
  eventType: string;
  date: DateValue | null;
  datePhrase: string;
  place: string | null;
  placeId: PlaceId | null;
  hofId: HofId | null;
  lati: number | null;
  long: number | null;
  /**
   * `ADDR` — Tristate wie date/place, und aus demselben Grund verschärft (BL-292): eine
   * `2 ADDR`-Zeile OHNE Wert, aber MIT `ADR1`/`CITY`/`POST`/`CTRY` darunter, ist im
   * Realbestand der Regelfall der strukturierten Adresse (83× in `Unsere Familie 2026.ged`).
   * Solange `''` „kein ADDR" hieß, schrieb der Writer die Zeile nicht — und mit ihr fiel
   * der gesamte un-modellierte Teilbaum weg, den der Tiefen-Passthrough sonst rettet
   * (231 verlorene Zeilen beim Neubau aller Records). Die Untertags selbst bleiben
   * bewusst un-modelliert: sie überleben als Passthrough (INV-PT), sobald ihr Elternknoten
   * wieder geschrieben wird.
   */
  addr: string | null;
  note: string;
  citations: Citation[];
  media: MediaCitation[];
  /** INV-P5: bewahrt leere-aber-vorhandene Blöcke (`1 BIRT` ohne Sub-Tags). */
  seen: boolean;
  /**
   * Roundtrip-Fidelity: die eindeutige GRAMPS-`id` (E0000) des GETEILTEN `<event>`-Records,
   * aus dem dieses Ereignis projiziert wurde (ADR-v9-11/114). GRAMPS-Events sind Top-Level und
   * werden von mehreren Ownern per `<eventref>` geteilt; das Modell hält ihre stabile `id`,
   * NICHT das Datei-`handle` (BL-136), das `buildRefIndex` beidseitig auflöst. Nur GRAMPS-
   * seitig gesetzt; GEDCOM ignoriert es. `null` = kein GRAMPS-Ursprung / neu (GEDCOM-Import,
   * leerer Main-Slot; beim Write-Back bekommt ein neues Event eine frische id + Handle).
   */
  grampsId: string | null;
}

export interface Person {
  id: PersonId;

  name: string;
  given: string;
  surname: string;
  prefix: string;
  suffix: string;
  nick: string;
  /** `NAME.TYPE` des HAUPTNAMENS (`birth`/`married`/`aka`, GEDCOM `NAME_TYPE`). Gegenstück
   *  zu `PersonName.type` der weiteren Namensformen — ohne dieses Feld wäre der Untertag
   *  am Hauptnamen modelliert-aber-heimatlos und ginge beim Neubau verloren (BL-292). */
  nameType: string;
  sex: Sex;
  /**
   * Stand `1 SEX` in der Quelle? (BL-302) — dieselbe Rolle wie `Event.seen` (INV-P5):
   * bewahrt einen vorhandenen Tag, dessen Wert mit dem Default zusammenfaellt.
   *
   * `U` IST modelliert und editierbar; verloren ging es nicht am Modell, sondern am
   * WRITER, der `U` unterdrueckte — weil `U` zugleich der Default jedes Records OHNE
   * SEX-Zeile ist (INV-P1) und ein bedingungsloses Schreiben jedem solchen Record eine
   * Zeile hinzugefuegt haette, die er nie hatte (ADR-v9-197).
   *
   * BEWUSST kein `sex: Sex | null`: INV-P1 sagt zu, dass jeder Leser einen gueltigen Wert
   * bekommt. Ein Tristate haette die Zusage gebrochen, um eine Frage zu beantworten, die
   * nur den Writer betrifft.
   */
  sexSeen: boolean;
  title: string;
  restriction: string;
  email: string;
  www: string;
  uid: string;

  birth: Event;
  chr: Event;
  death: Event;
  cause: string;
  buri: Event;
  events: Event[];

  extraNames: PersonName[];
  aliases: PersonId[];
  aliaNames: string[];
  nameTrans: NameTranslation[];

  topLevelCitations: Citation[];
  nameCitations: Citation[];

  childOf: ChildLink[];
  parentIn: FamilyId[];
  associations: Association[];

  media: MediaCitation[];
  noteText: string;
  noteRefs: NoteId[];

  noEvents: Set<string>;
  exids: ExternalId[];
  createdDate: string;

  /**
   * Merge-Machinerie (BL-164, ADR-v9-129): ids der Records, die per Dedup in DIESEN
   * absorbiert wurden. Format-agnostisch (nur ids, keine Rohbäume), runtime-only — wird NIE
   * serialisiert und NICHT von `modelEquiv`/Dirty-Check verglichen. Der Write-Back holt den
   * un-modellierten Passthrough dieser (noch im Quell-Baum stehenden) Verlierer-Records und
   * hängt ihn dedupliziert an den Gewinner-Record (verlustfreier Merge auf Passthrough-Ebene).
   * Selbstkorrigierend: nach dem ersten Save ist der Verlierer-Record aus `roots` weg → eine
   * erneute Projektion findet nichts (idempotent); Reload setzt es nie.
   */
  mergedRecordIds?: string[];

  // Forschung (Spec 12) — Form definiert in core/research/types.ts.
  tasks: ResearchTask[];
  researchLog: LogEntry[];
  hypotheses: Hypothesis[];

  lastChanged: string;
}

export interface Family {
  id: FamilyId;
  husband: PersonId | null;
  wife: PersonId | null;
  children: PersonId[];
  marriage: Event;
  engagement: Event;
  events: Event[];
  noteText: string;
  citations: Citation[];
  tasks: ResearchTask[];
  researchLog: LogEntry[];
  hypotheses: Hypothesis[];
  lastChanged: string;
}

/** `SOUR.DATA.EVEN` — welche Ereignisarten diese Quelle abdeckt, in welchem Zeitraum, wo.
 *  `eventTypes` ist eine ENUMERATION, kein Freitext: kommaseparierte
 *  `EVENT_ATTRIBUTE_TYPE` (5.5.1) bzw. `List#Enum` über `enumset-EVENATTR` (7.0),
 *  z. B. `BIRT, MARR, DEAT`. `date` ist ein `DATE_PERIOD` (`FROM 1874 TO 1938`). */
export interface SourceDataEvent {
  eventTypes: string;
  date: string;
  place: string;
}

export interface Source {
  id: SourceId;
  abbr: string;
  title: string;
  author: string;
  /** Erfassungsdatum des DATENSATZES (`CREA` in 7.0, `1 _DATE` in 5.5.1), Anzeige
   *  „Erfasst am" — ADR-v9-179. NICHT das Datum des Dokuments: dessen Entstehung führt
   *  `PUBL` (`publisher`), der abgedeckte Zeitraum `dataEvents[].date`. Ein `1 DATE`
   *  direkt unter `SOUR` ist in beiden GEDCOM-Versionen unzulässig und wird nie
   *  geschrieben (es überlebt als Passthrough, falls eine Fremddatei eines trägt). */
  createdDate: string;
  publisher: string;
  text: string;
  repo: RepoId | string;
  callNumber: string;
  callMedia: string;
  /** `SOUR.DATA.AGNC` — verantwortliche Stelle („Behörde"). */
  agnc: string;
  dataEvents: SourceDataEvent[];
  /** Übrige `DATA`-Kinder (NOTE/SNOTE …) verbatim — `DATA` ist als Ganzes erkannt, ohne
   *  diesen Rest fiele alles Un-modellierte darunter aus dem Passthrough (INV-PT). */
  dataExtra: GedNode[];
  externalRefs: { value: string; type: string }[];
  media: MediaCitation[];
  lastChanged: string;
}

export interface Repository {
  id: RepoId;
  name: string;
  type: string;
  /** `ADDR` — Tristate wie `Event.addr` (BL-292): eine leere `1 ADDR`-Zeile trägt im
   *  Bestand `CITY`/`POST` als Passthrough-Kinder. */
  address: string | null;
  phone: string;
  www: string;
  email: string;
  findingAid: string;
  lastChanged: string;
}

export interface Note {
  id: NoteId;
  type: 'NOTE' | 'SNOTE';
  text: string;
}

export interface HeaderMeta {
  /** verbatim erhaltene HEAD-Zeilen (Roundtrip-Fidelity). */
  raw: string[];
}

export interface Database {
  individuals: Map<PersonId, Person>;
  families: Map<FamilyId, Family>;
  sources: Map<SourceId, Source>;
  repositories: Map<RepoId, Repository>;
  notes: Map<NoteId, Note>;
  /** Globale Medien-Identität (ADR-v9-124), keyed by MediaId (= Dateipfad). */
  media: Map<MediaId, Media>;
  // placeObjects/hofObjects (Spec 11): konkrete Form aus dem Orts-Kern.
  placeObjects: Map<PlaceId, PlaceObjectT>;
  hofObjects: Map<HofId, HofObjectT>;
  placForm: string;
  gedVersion: 'unknown' | '5.5.1' | '7.0';
  header: HeaderMeta;
}
