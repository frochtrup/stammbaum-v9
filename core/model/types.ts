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
  /**
   * `type`, wie er beim Laden in der Datei stand — der Vergleichswert, an dem der Writer
   * einen NUTZER-Edit erkennt (BL-306). Anders als `formWire` trägt er keine eigene
   * Schreibweise (`MEDI` ist nicht kanonisiert): sein Zweck ist allein die Frage
   * „hat jemand den Typ angefasst?".
   *
   * WOZU. Die `MEDI`-Zeile eines inline-Mediums steht referenz-spezifisch da, der Wert ist
   * global. Wo eine Fundstelle sie nie trug (`MediaCitation.typeSeen`), darf der Writer sie
   * nicht ergänzen — es sei denn, der Nutzer hat den Typ geändert, dann käme sein Edit
   * sonst nirgends an. Dieselbe Zwei-Gründe-Form wie bei den Namens-Untertags
   * ([ADR-v9-210](../../specs/v9/04-Entscheidungslog.md)): die Quelle hatte es, oder es
   * sagt etwas Neues.
   */
  typeWire: string;
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
  /**
   * Trug DIESE Fundstelle die globalen Datenzeilen `FORM` bzw. `FORM`→`MEDI`? (BL-304-Klasse,
   * BL-306) — die Frage ist REFERENZ-spezifisch, obwohl die Werte selbst global sind.
   *
   * Ein inline-Medium hat keinen eigenen Record: seine globalen Felder stehen physisch am
   * `OBJE` JEDER verweisenden Stelle, und die Stellen dürfen einander widersprechen. `db.media`
   * ist nach Dateipfad geschlüsselt und hält deshalb EINEN Wert (erstes Vorkommen gewinnt,
   * `definingMediaNodes`) — ohne diese Auskunft schriebe der Emitter ihn an ALLE Fundstellen
   * zurück, auch an die, die ihn nie hatten. Am Realbestand sind 396 von 641 inline-Medien
   * mehrfach referenziert; 6 davon sind sich uneinig.
   *
   * Default `true`: eine Fundstelle, die das Modell NEU anlegt, ist die volle Form. Nur wer
   * aus der Datei kommt, weiß es besser — `parseMedia` setzt beide aus dem Knoten.
   */
  formSeen: boolean;
  typeSeen: boolean;
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
   * (231 verlorene Zeilen beim Neubau aller Records). Die Untertags selbst bekommen keine
   * eigene Semantik — sie liegen verbatim in `addrExtra` (s. dort, ADR-v9-228).
   */
  addr: string | null;
  /**
   * Die nicht erkannten `ADDR`-Kinder, verbatim ([ADR-v9-228](../../specs/v9/04-Entscheidungslog.md)).
   * Also alles außer `CONT`/`CONC` — die gehören zum Text und stecken bereits in `addr`.
   *
   * WARUM GEHALTEN STATT MODELLIERT: `ADR1`/`ADR2`/`ADR3` sind laut GEDCOM 5.5.1 (S. 41)
   * definitionsgemäß Kopien der `ADDR`- bzw. der beiden ersten `CONT`-Zeilen, `CITY`/
   * `STAE`/`POST`/`CTRY` isolierte Bestandteile derselben Adresse — Index-Kopien zum
   * Sortieren, keine zusätzlichen Angaben. Sieben Modellfelder hätten diese Redundanz als
   * eigenständige Semantik nachgebaut; `ADR1` stünde neben einem `addr`, dessen erste
   * Zeile es per Definition ist.
   *
   * WARUM ÜBERHAUPT AM MODELL: Der Passthrough erhält diese Zeilen zwar, aber er ist ein
   * Schreib-Mechanismus ohne Lesezugriff — die Zuordnung Ereignis ↔ Knoten entsteht erst
   * beim Serialisieren (positionelle Paarung in `write-back.ts`), ein Rückverweis vom
   * Event auf seinen `GedNode` existiert nicht. Ohne dieses Feld bleibt eine strukturierte
   * Adresse in der Anzeige unsichtbar, obwohl sie in der Datei steht (an
   * `Testdateien/Unsere Familie 2026.ged` 83 Blöcke, 82 davon an `RESI`).
   *
   * Dieselbe Form wie `MediaCitation.extra` und `Source.dataExtra` — drittes Vorkommen
   * eines vorhandenen Musters, keine neue Bauart.
   */
  addrExtra: GedNode[];
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
  /**
   * Standen `GIVN`/`SURN`/`NSFX` als Untertags in der Quelle? (BL-304) — dieselbe Rolle wie
   * `sexSeen`, und aus demselben Grund nötig: die drei Felder sind ab Import IMMER gefüllt,
   * weil `splitGedcomName` sie aus dem `NAME`-Wert ergänzt, wo die Quelle sie weglässt
   * (ADR-v9-112). Das ist eine ANZEIGE-Bequemlichkeit — ohne sie müsste jeder Leser den
   * Schrägstrich-Rückfall selbst kennen, ein Vertrag, der dreimal gerissen ist.
   *
   * Dem Writer fehlt damit die Auskunft, ob ein Wert aus der DATEI kam oder aus der
   * Zerlegung: er schrieb beide gleich, und jeder neu gebaute Record bekam Untertags, die
   * seine Quelle nie hatte (+100 `GIVN` und +100 `SURN` in `Unsere Familie 2026.ged`) —
   * „Speichern schreibt um" im Sinne von ADR-v9-197.
   *
   * BEWUSST kein Tristate an `given`/`surname` selbst: die Zusage „ab Import gefüllt" ist
   * genau der Zweck von ADR-v9-112 und darf nicht zurückgenommen werden, um eine Frage zu
   * beantworten, die nur den Writer betrifft (dieselbe Abwägung wie bei `sexSeen`/INV-P1).
   */
  givenSeen: boolean;
  surnameSeen: boolean;
  suffixSeen: boolean;
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
   *  Bestand `CITY`/`POST` als Kinder — die liegen in `addressExtra`. */
  address: string | null;
  /** Die nicht erkannten `ADDR`-Kinder, verbatim — Geschwister-Feld zu `Event.addrExtra`
   *  (ADR-v9-228). Seit `ADDR` ein selbstverwalteter Passthrough-Container ist, MUSS jeder
   *  ADDR-Träger sein eigenes Extra-Feld führen: der Tiefen-Passthrough greift dort nicht
   *  mehr, und ohne dieses Feld fiele die strukturierte Archiv-Adresse beim Record-Neubau
   *  weg. Genau das hat `wire-loss-classes.test.ts` beim ersten Bau gemeldet („2 CITY
   *  München" verschwand) — die Regel war an einer Stelle gebaut und an der Geschwister-
   *  Stelle vergessen. */
  addressExtra: GedNode[];
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
