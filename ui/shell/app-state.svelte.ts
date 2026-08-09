// ui/shell/app-state.svelte.ts — reaktiver App-Zustand der UI-Schale (Spec 02 §3).
//
// Hält die EINE geladene Datenbank + den daraus abgeleiteten PlaceContext (Chokepoint-
// Zugriff, Spec 11 §5). Reagiert der Kern nicht selbst (er hat keine Stores/Signals,
// Spec 02 §3) — die Schale liest ihn über die definierten Chokepoints und hält eine
// reaktive Referenz. Ein Kommando (hier: Import) → Chokepoints neu lesen → Views
// aktualisieren sich automatisch (ein Pfad, kein zweiter Render-Trigger nötig).
import type {
  ChildLink,
  Database,
  Event,
  PlaceId,
  HofId,
  PersonId,
  FamilyId,
  Person,
  Family,
  SourceId,
  RepoId,
  Source,
  Repository,
  Media,
  MediaId,
} from '../../core/model/types';
import type { PlaceObject, HofObject } from '../../core/places';
import { FULL_PLACES_CAPS, type PlacesHost, type PlacesHostCaps } from './places-host';
import {
  makeDatabase,
  savePerson as savePersonCmd,
  deletePersonCascade as deletePersonCmd,
  saveFamily as saveFamilyCmd,
  saveChildLink as saveChildLinkCmd,
  deleteFamilyCascade as deleteFamilyCmd,
  saveSource as saveSourceCmd,
  deleteSourceCascade as deleteSourceCmd,
  saveRepository as saveRepositoryCmd,
  deleteRepositoryCascade as deleteRepositoryCmd,
  saveMedia as saveMediaCmd,
  deleteMedia as deleteMediaCmd,
} from '../../core/model';
import {
  makePlaceRegistry,
  makeHofRegistry,
  savePlaceObject,
  saveHofObject,
  mergePlaceObjects,
  mergeHofObjects,
  moveHofToVillage,
  withUpdatedHofAddr,
  linkEventToPlace as linkEventToPlaceCmd,
  linkEventToHof as linkEventToHofCmd,
  applyGovEntry,
  parseGovText,
  normPlaceName,
  normHofAddr,
  type PlaceContext,
  type MergeResult,
  type MoveHofResult,
  type GovApplyResult,
} from '../../core/places';
import { editDatabase, mapAllEvents } from '../../core/model/draft';
import {
  mergePersons as mergePersonsCmd,
  applyImportPatch as applyImportPatchCmd,
  type MergeSelections,
  type ImportedFile,
  type ImportMatch,
  type ImportSelections,
  type ImportSourceConfig,
  type ApplyImportResult,
} from '../../core/dedup';
import { createUndoStack } from '../../services/undo';
import type { GedNode, GrampsParsed, XmlDocument, ParsedGedcom } from '../../core/interop';
import {
  applyDatabaseToRoots,
  serializeGedcom,
  applyDatabaseToXml,
  buildXMLText,
  buildGedcomTreeFromModel,
  buildGrampsTreeFromModel,
} from '../../core/interop';
import type { DocFormat } from '../../services/file';
import {
  applyPlaceResolution,
  deletePlaceCascade,
  deleteHofCascade,
  relinkHofVillageInEvents,
  renameHofAddrInEvents,
  reprojectEventsOfPlace,
  reprojectEventsOf,
  reprojectHofAddrInEvents,
  alignCuratedEventTexts,
} from '../../services/places';
import { collectAllEvents } from './all-events';
import type { Hypothesis, LogEntry, TaskStatus } from '../../core/research/types';
import type { TaskEntityKind } from '../views/tasks/tasks-model';
import {
  addTask as addTaskCmd,
  updateTask as updateTaskCmd,
  setTaskStatusById,
  deleteTask as deleteTaskCmd,
} from '../views/tasks/tasks-commands';
import {
  addLogEntry as addLogEntryCmd,
  updateLogEntry as updateLogEntryCmd,
  deleteLogEntry as deleteLogEntryCmd,
} from '../views/research-log/log-commands';
import {
  addHypothesis as addHypothesisCmd,
  updateHypothesis as updateHypothesisCmd,
  deleteHypothesis as deleteHypothesisCmd,
} from '../views/hypotheses/hypothesis-commands';

// `extends PlacesHost` ist der Zwang, nicht die Dokumentation: ändert jemand hier eine der
// zwölf geteilten Signaturen, bricht die Deklaration selbst — nicht erst der Orte-Editor
// (Spec 22 §3). Die Member sind unten trotzdem einzeln aufgeführt, weil ihre Kommentare
// das Hauptprogramm-Verhalten beschreiben; TypeScript prüft sie gegen den Vertrag.
export interface AppState extends PlacesHost {
  /** Aktuell geladene Datenbank (leer, bis eine Datei importiert wurde). */
  readonly db: Database;
  /** Abgeleiteter Orts-/Hof-Chokepoint-Kontext, immer zur aktuellen db passend. */
  readonly placeContext: PlaceContext;
  /**
   * Fähigkeiten für die geteilten Orts-/Hof-Views (Spec 22 §3, ADR-v9-161). Im
   * Hauptprogramm konstant `FULL_PLACES_CAPS` — es hat Ereignisse, einen Ereignis-Editor
   * und Linsen. Der Standalone-Orte-Editor setzt hier ab, ohne dass eine Komponente
   * doppelt existieren muss (INV-ORTE-1).
   */
  readonly caps: PlacesHostCaps;
  /** Dateiname der zuletzt importierten Datei (leer = noch nichts geladen). */
  readonly fileName: string;
  /**
   * Kommando: ersetzt die Datenbank (z. B. nach parseGedcom) — der EINE Ladepfad.
   * `roots` ist der Passthrough-Baum desselben Dokuments (core/interop ParsedGedcom.roots);
   * optional, weil ältere Aufrufer (Tests, Aufgaben-Kommandos-Setup) ihn nicht immer haben —
   * fehlt er, bleibt serialize() bei einem leeren Baum (kein Kern-Fallback nötig, s. u.).
   */
  loadDatabase(db: Database, fileName: string, roots?: GedNode[]): void;
  /**
   * Kommando: projiziert den aktuellen db-Stand zurück in den zuletzt geladenen
   * Passthrough-Baum (`applyDatabaseToRoots`) und serialisiert ihn zu GEDCOM-5.5.1-Text
   * (`serializeGedcom`). Übernimmt das PROJIZIERTE `roots`-Ergebnis intern als neuen
   * aktuellen Baum (s. createAppState-Kommentar WARUM) — ruft man serialize() zweimal
   * hintereinander ohne zwischenzeitliche Edits, bleibt applyDatabaseToRoots weiterhin
   * referenzgleich (Struktur-Vergleichs-Kurzschluss, core/interop/write-back.ts Kopf).
   * Genutzt für die stille Arbeitskopie (Text).
   */
  serialize(): string;
  /**
   * Kommando: wie `serialize()`, liefert aber das ParsedGedcom-Doc (`{db, roots}`) statt
   * des fertigen Textes — für den expliziten Export (exportViaOnePipe erwartet ein
   * `gedcomDoc`, s. services/file/export-pipe.ts, und serialisiert selbst). Teilt sich
   * denselben internen roots-Projektions-Schritt mit serialize() (kein zweiter Pfad).
   */
  buildGedcomDoc(): { db: Database; roots: GedNode[] };
  /**
   * Format des aktuell geladenen Dokuments (BL-139). Steuert den Auto-Save-Serializer
   * (GEDCOM-Text vs. GRAMPS-XML) und ob die Export-Fläche `gramps` anbietet (nur wenn ein
   * `.gramps` geladen ist — ein Cross-Export aus GEDCOM-Ursprung wäre hohl, ADR-v9-113).
   */
  readonly docFormat: DocFormat;
  /**
   * Kommando: lädt ein GRAMPS-Dokument (`parseXMLText`-Ergebnis) — das Gegenstück zu
   * `loadDatabase` für die GRAMPS-Seite. `doc` ist der Passthrough-XML-Baum (BL-139/144).
   */
  loadGrampsDoc(db: Database, fileName: string, doc: XmlDocument): void;
  /**
   * Kommando: wie `buildGedcomDoc()`, aber für GRAMPS — projiziert den db-Stand in den
   * gehaltenen GRAMPS-Baum (`applyDatabaseToXml`) und liefert `{ db, doc }` für das
   * Export-Rohr (`exportViaOnePipe` gzip-t selbst). Übernimmt das projizierte Doc intern
   * als neuen Baum (derselbe Idempotenz-Kurzschluss wie `buildGedcomDoc`).
   */
  buildGrampsDoc(): GrampsParsed;
  /**
   * Kommando: synthetisiert einen KOMPLETTEN Baum der angegebenen Ziel-Familie direkt aus
   * dem aktuellen `db`-Stand — unabhängig davon, ob überhaupt ein Quell-Doc dieser Familie
   * existiert (Cross-Family-Export, BL-160, ADR-v9-127; s. `exportCrossFamily` in
   * ui/shell/save-action.ts, das dies vom nativen Passthrough-Pfad abgrenzt). Nutzt
   * `buildGedcomTreeFromModel`/`buildGrampsTreeFromModel` (core/interop, BL-157/158) — NICHT
   * `buildGedcomDoc`/`buildGrampsDoc`, die einen Passthrough-Baum DIESES Formats voraussetzen
   * (der bei einer Fremd-Familie nicht existiert, ADR-v9-113 Befund 3). Reine Lese-Projektion:
   * rührt weder `db` noch den gehaltenen Passthrough-Baum (`roots`/`grampsDoc`) an.
   */
  buildCrossFamilyDoc(targetFamily: DocFormat): { gedcomDoc?: ParsedGedcom; grampsDoc?: XmlDocument };
  /** Kommando: Upsert eines PlaceObject (`savePlaceObject(model)`-Muster, Spec 20 §1.7 [K]). */
  savePlace(model: PlaceObject): void;
  /**
   * Kommando: GOV-Textzusammenfassung (gov.genealogy.net) auf ein PlaceObject anwenden
   * (BL-131, Spec 20 §1.7). Ergänzt Namen/Übersetzungen/Typ-Historie/Verwaltungs-
   * Zugehörigkeit fill-if-empty und legt für unbekannte Eltern GOV-Platzhalter an.
   *
   * `null` = der Text war unbrauchbar oder die Id existiert nicht — die UI meldet das,
   * ohne dass etwas committet wurde (kein stiller Abbruch, Spec 21 §5).
   */
  importGovEntry(placeId: PlaceId, rawText: string): GovApplyResult | null;
  /** Kommando: entfernt ein PlaceObject. */
  deletePlace(id: PlaceId): void;
  /**
   * Kommando: Upsert einer Person (`savePerson(model)`-Muster, Spec 20 §2). Bewusst OHNE
   * Relationship-Graph-Seiteneffekte (childOf/parentIn/Family.children/husband/wife) —
   * Beziehungen bearbeiten ist ein separates Folge-Feature (core/model/commands.ts). Löst
   * (falls injiziert) den `persistWorkingCopy`-Callback aus — die Genealogie-Arbeitskopie
   * bleibt dadurch nach jedem Save aktuell (Spec 14 §3.1).
   */
  savePerson(model: Person): void;
  /**
   * Kommando: entfernt eine Person referenz-auflösend (`deletePersonCascade`) — aus allen
   * Familien-Slots/Kindlisten, Assoziationen und Aliassen ausgehängt; eine dadurch völlig
   * leer werdende Familie wird mitgelöscht. Andere Personen/Ereignisse bleiben bestehen.
   */
  deletePerson(id: PersonId): void;
  /**
   * Kommando: führt `loserId` in `winnerId` zusammen (BL-103/BL-104, Spec 20 §1.12).
   *
   * ANDERS als das referenz-AUFLÖSENDE `deletePerson` (Referenzen werden gelöst/entfernt)
   * hängt der Merge hier ALLE Referenzen auf den Verlierer auf den GEWINNER um
   * (Family.husband/wife/children, Person.aliases, Association.personRef) — ein naives
   * `savePerson(winner)` + nacktes `deletePerson(loser)` (core/model/commands.ts) hinterließe
   * gegengeprüft drei Waisen (INV-P2, `tests/core/merge-persons.test.ts`). Rückgängig über den
   * regulären Undo-Stack, weil es wie jedes andere Kommando über `commit` läuft.
   */
  mergePerson(winnerId: PersonId, loserId: PersonId, selections?: MergeSelections): void;
  /**
   * Kommando: übernimmt die Auswahl eines Import-Vergleichs (BL-106/BL-107,
   * Spec 20 §1.12). Der Kern liefert einen fertigen neuen Stand samt mitgezogenen
   * Quellen/Archiven; hier wird nur committet — damit hängt auch dieser Schritt am
   * regulären Undo-Stack.
   */
  applyImport(
    imported: ImportedFile,
    matches: readonly ImportMatch[],
    selections: ImportSelections,
    sourceConfig: ImportSourceConfig | null,
  ): ApplyImportResult;
  /**
   * Kommando: Upsert einer Familie (`saveFamily(model)`-Muster, Spec 20 §2). ANDERS als
   * savePerson führt der Kern (core/model/commands.ts saveFamily) hier die INDI-Seite
   * (Person.parentIn/childOf) synchron nach (INV-P3) — deshalb mutiert das Kommando BEIDE
   * Maps (individuals + families) in-place und reassigned danach beide, damit Svelte's
   * Reaktivität an beiden betroffenen Aggregaten greift (analog addTask/updateTask unten).
   */
  saveFamily(model: Family): void;
  /**
   * Kommando: ersetzt EINEN `ChildLink` einer Person (Kind-Verhältnis + Kindschafts-Belege,
   * BL-329). Die Verknüpfung selbst entsteht über `saveFamily`; dieses Kommando beschreibt
   * sie nur — es hängt keine Beziehung um (INV-P3 bleibt unberührt).
   */
  saveChildLink(personId: PersonId, link: ChildLink): void;
  /**
   * Kommando: entfernt eine Familie referenz-auflösend (`deleteFamilyCascade`) — die
   * Person-Seite (parentIn/childOf) aller Beteiligten wird gelöst, die Personen selbst
   * bleiben bestehen (kein Kaskaden-Löschen).
   */
  deleteFamily(id: FamilyId): void;
  /**
   * Kommando: Upsert einer Quelle (`saveSource(model)`-Muster, Spec 20 §2). Source ist ein
   * FLACHES Modell ohne Beziehungs-Graph (Spec 10 §4) — reines Whole-Object-Upsert, analog
   * savePlace, KEINE Sync-Logik wie bei saveFamily nötig.
   */
  saveSource(model: Source): void;
  /**
   * Kommando: entfernt eine Quelle referenz-auflösend (`deleteSourceCascade`) — alle Zitate,
   * die auf sie zeigen, werden an jeder Träger-Stelle entfernt.
   */
  deleteSource(id: SourceId): void;
  /** Kommando: Upsert eines Archivs (`saveRepository(model)`-Muster, Spec 20 §2). */
  saveRepository(model: Repository): void;
  /**
   * Kommando: entfernt ein Archiv referenz-auflösend (`deleteRepositoryCascade`) — der
   * repo-Verweis jeder darauf zeigenden Quelle wird gelöst.
   */
  deleteRepository(id: RepoId): void;
  /**
   * Kommando: Upsert eines Mediums (`saveMedia(model)`-Muster, Spec 20 §1.4 [S]/Spec 10
   * §4). Media ist ein FLACHES Modell ohne Beziehungs-Graph — reines Whole-Object-Upsert,
   * analog saveSource. Deckt sowohl die globale Bearbeitung ("Speichern (alle Ref.)",
   * Medium-Detail ②) als auch die Neuanlage ab (📷-Kamera-Schnellzugriff, Ereignis-Editor).
   */
  saveMedia(model: Media): void;
  /**
   * Kommando: entfernt ein Medium referenz-auflösend (`deleteMedia`, BEWUSST MIT Kaskade,
   * anders als `deleteSource` — s. core/model/commands.ts-Kopf) — jede `MediaCitation`,
   * die auf dieses Medium zeigt, wird an jeder Träger-Stelle entfernt (Person/Familie/
   * Quelle, inkl. verschachtelter Event-/Zitat-Ebenen).
   */
  deleteMedia(id: MediaId): void;
  /**
   * Kommando: Dubletten-Merge — führt EINEN ODER MEHRERE `mergedIds` in `survivorId`
   * zusammen (Spec 20 §1.7 [K] paarweiser Merge; §9.2 Massen-Dedup, ADR-v9-45). Gibt
   * `MergeResult` zurück (`hofsMerged`/`villageId`) — Grundlage für den Toast über den
   * automatischen Hof-Nachlauf (ADR-v9-45 Nachtrag 2026-07-10), falls einer stattfand.
   */
  mergePlace(survivorId: PlaceId, mergedIds: PlaceId | readonly PlaceId[]): MergeResult;
  /** Kommando: Upsert eines HofObject (Spec 20 §1.8 [K]). */
  saveHof(model: HofObject): void;
  /**
   * Kommando: bearbeitet EINE Adressvariante eines Hofes (`addrs[index]`) UND zieht — falls
   * sich der Wert (`addrs[index].value`) dabei tatsächlich ändert — die Umbenennung auf alle
   * referenzierenden Events mit (`renameHofAddrInEvents`, Nutzeraktion, ADR-v9-47 gilt hier
   * NICHT). Der „Name" eines Hofes IST `addrs[0].value` (HofObject hat kein eigenes
   * `title`-Feld) — ohne diesen Nachlauf würde `ev.addr`/`ev.place` beim nächsten Anzeigen
   * weiter den alten Namen zeigen (Ereigniszeile) UND beim nächsten Laden den alten Namen
   * erneut bootstrappen (Pfad B, Spec 11 §4.2). Reine `from`/`to`-Änderungen (Wert bleibt
   * gleich) propagieren NICHT — nur ein tatsächlicher Namenswechsel ist eine Umbenennung.
   */
  updateHofAddr(hofId: HofId, index: number, value: string, from: number | null, to: number | null): void;
  /**
   * Kommando: hängt einen Hof an ein anderes Dorf (Spec 11 §1, ADR-v9-172). Liefert das
   * Umzugs-Ergebnis zurück — Grundlage für den Hinweis, falls im Zieldorf ein
   * gleichadressiger Hof konsolidiert wurde.
   */
  moveHof(hofId: HofId, villageId: PlaceId): MoveHofResult;
  /** Kommando: entfernt ein HofObject. */
  deleteHof(id: HofId): void;
  /**
   * Kommando: Hof-Dubletten-Merge — führt EINEN ODER MEHRERE `mergedIds` in `survivorId`
   * zusammen (Spec 20 §1.8 [K], §9.2 Massen-Dedup). Analog `mergePlace`, aber ohne
   * automatischen Nachlauf (der ist nur für Dorf-Merges definiert, ADR-v9-45).
   */
  mergeHof(survivorId: HofId, mergedIds: HofId | readonly HofId[]): void;
  /**
   * Gleicht die Ereignistexte an das kuratierte Ortswissen an (ADR-v9-224) — der
   * Autoritäts-Satz aus Spec 11 §3: wo ein Ereignis an kuratiertem Wissen hängt, IST der
   * Dateitext die Projektion; wo es an einem Seed-Objekt hängt, bleibt die Quelle stehen.
   * Läuft nach jedem Laden und nach jedem orte.json-Import automatisch, ist aber ein
   * gewöhnliches Kommando: rücknehmbar, und die Schale zeigt seine Zahl.
   */
  alignPlaceTexts(): { geaendert: number; luecken: number };
  /**
   * Kommando: ersetzt placeObjects/hofObjects durch das Ergebnis eines orte.json-Datei-
   * Imports (ADR-v9-70, Spec 14 §6) UND reklassifiziert im selben Zug ALLE Events der
   * aktuell geladenen Genealogie gegen den neuen Orts-/Hof-Bestand (`applyPlaceResolution`,
   * dieselbe volle `resolveEvents()`-Reklassifikation wie beim GEDCOM-(Re-)Import über
   * `load-gedcom-text.ts` — Spec 11 §3 "Mechanismus 1": ein Massen-Wechsel der Orts-
   * Identität rechtfertigt einen vollen Lade-Pass). Ohne diesen Schritt würden importierte,
   * kuratierte Orte nie zur Interpretation der bereits geladenen Events herangezogen —
   * genau der Zweck des Imports (Nachtrag, gefunden nach Auslieferung: die erste Fassung
   * ersetzte nur die Registrierung, ohne sie auf die geladenen Events anzuwenden).
   * `applyPlaceResolution` mutiert Person-/Family-Events IN-PLACE (wie `mergePlace`/
   * `mergeHof` es bereits mit `event.hofId`/`event.placeId` tun) — die Reaktivität kommt
   * ausschließlich aus der `db`-Neuzuweisung unten (`$state.raw`).
   *
   * `resetUncuratedLinks: true` (ADR-v9-74, Nachtrag nach Nutzerrückfrage): ohne diese
   * Option greift der reguläre „bereits gelinkt"-Kurzschluss in `resolveEvents`
   * (Pfad REPROJECT) für JEDES Event, das schon irgendeine — und sei es nur automatisch
   * geratene — `placeId`/`hofId` trägt, und verhindert eine Neuzuordnung selbst dann,
   * wenn gerade reichhaltigere, kuratierte Orte importiert wurden (reiner Re-Resolve ohne
   * frischen `parseGedcom()`-Aufruf, anders als beim GEDCOM-Reload). Mit der Option werden
   * vor der Auflösung genau die Events zurückgesetzt, deren AKTUELLES Ziel nicht kuratiert
   * ist (`isEnrichedPlace`/`isEnrichedHof`) — kuratierte, ggf. bewusst per
   * `linkEventToPlace` bestätigte Ziele bleiben unangetastet.
   *
   * Persistenz-Reihenfolge: der Aufrufer (ui/shell/places-file-import.ts) hat den
   * importierten/gemergten Orts-Stand bereits über `PlacesPersister.persist()` gegen den
   * IDB-Spiegel abgeglichen UND gespeichert, bevor er dieses Kommando aufruft — deshalb
   * löst dieses Kommando `persistPlaces()` NUR aus, wenn die Reklassifikation selbst den
   * Bestand weiter wachsen ließ (Village-Seed/Hof-Bootstrap, `placeObjectsGrew`/
   * `hofObjectsGrew`), nicht unbedingt (kein doppeltes Schreiben mit veralteter baseRev,
   * Ein-Invalidierungspfad-Prinzip). `persistWorkingCopy` läuft dagegen immer (falls eine
   * Datei geladen ist) — die Reklassifikation kann `event.place`/`event.addr` ändern,
   * GEDCOM-relevante Felder, die der bestehende Write-Back kennt.
   */
  replacePlacesAndHofs(placeObjects: Database['placeObjects'], hofObjects: Database['hofObjects']): void;
  /**
   * Kommando: verknüpft EIN Ereignis mit einem PlaceObject (Sofort-Reprojektion von
   * `ev.place`, ADR-v9-19/-42). `event` muss das echte, in Person/Family lebende Objekt
   * sein — der Copy-on-Write-Draft findet darüber seinen Owner (ADR-v9-92).
   *
   * Ersetzt den früheren Ablauf „`linkEventToPlace(event, …)` im Aufrufer + `touch()`":
   * der mutierte das Ereignis IN-PLACE und schrieb damit auch in jeden zurückgehaltenen
   * Undo-Snapshot — `ev.place` ist ein persistiertes Feld (write-back-emit.ts).
   *
   * Gibt `false` zurück, wenn das Ereignis in der Datenbank nicht gefunden wurde (der
   * Aufrufer hat ein losgelöstes Event übergeben) — kein stiller Abbruch, Spec 21.
   */
  linkEventToPlace(event: Event, placeId: PlaceId): boolean;
  /**
   * Kommando: verknüpft EIN Ereignis mit einem HofObject. Analog `linkEventToPlace`,
   * füllt zusätzlich `ev.addr` (nur wenn leer, ADR-v9-47) — ebenfalls ein persistiertes
   * Feld (ADDR), deshalb genauso copy-on-write-pflichtig.
   */
  linkEventToHof(event: Event, hofId: HofId, villageId?: PlaceId): boolean;
  // --- Undo/Redo (Spec 20 §1.2, ADR-v9-92) ---------------------------------------
  //
  // `touch()` gab es hier bis BL-01: ein Kommando, das nach einer In-Place-Mutation von
  // außen bloß die Reaktivität anstieß. Mit Copy-on-Write ist dieses Muster nicht mehr
  // zulässig — jede Änderung liefert einen neuen Zustand — und `touch()` wäre die
  // verbliebene Hintertür daran vorbei. Es ist deshalb entfernt, nicht nur ungenutzt.
  /** true, wenn ein Schritt zurückgenommen werden kann (für die Aktivierung der Schaltfläche). */
  readonly canUndo: boolean;
  /** true, wenn ein zurückgenommener Schritt wiederherstellbar ist. */
  readonly canRedo: boolean;
  /**
   * Kommando: nimmt das letzte Editier-Kommando zurück. Gibt `false` zurück, wenn der
   * Stack leer ist — dann bietet die Schale „Zum gespeicherten Stand zurück"
   * (`revertToSaved`) als Fallback an (Spec 20 §1.2).
   */
  undo(): boolean;
  /** Kommando: stellt einen zurückgenommenen Schritt wieder her. `false`, wenn nichts anliegt. */
  redo(): boolean;
  /**
   * Kommando: „Revert to Saved" (Spec 20 §1.2) — verwirft ALLE Änderungen seit dem Laden
   * und stellt den zuletzt geladenen Stand wieder her. Der Fallback bei leerem Stack.
   * `false`, wenn noch nichts geladen wurde (nichts, wohin zurückzukehren wäre).
   *
   * Wirkt wie jedes andere Kommando auf den Speicherzustand; die Auto-Save-Arbeitskopie
   * schreibt den Stand danach fort (ADR-v9-92 Punkt 6, kein Sonderpfad auf Datei-Ebene).
   */
  revertToSaved(): boolean;
  /**
   * Kommando: legt eine neue Aufgabe an einer Person ODER Familie an (Spec 20 §1.11 [K]).
   * `taskId`/`now` werden vom Aufrufer injiziert (TST-3, analog `newTaskId()`/Uhrzeit in
   * TasksView.svelte) — kein Date.now()/Math.random() innerhalb dieses Kommandos selbst.
   */
  addTask(
    kind: TaskEntityKind,
    entityId: PersonId | FamilyId,
    taskId: string,
    text: string,
    category: string,
    now: string,
    sourceRef?: SourceId | '',
  ): void;
  /** Kommando: ersetzt Text/Kategorie/Quellen-Bezug einer bestehenden Aufgabe vollständig. */
  updateTask(
    kind: TaskEntityKind,
    entityId: PersonId | FamilyId,
    taskId: string,
    text: string,
    category: string,
    sourceRef?: SourceId | '',
  ): void;
  /** Kommando: setzt den Kanban-Status einer Aufgabe (hält `done` synchron). */
  setTaskStatus(kind: TaskEntityKind, entityId: PersonId | FamilyId, taskId: string, status: TaskStatus): void;
  /** Kommando: entfernt eine Aufgabe. */
  deleteTask(kind: TaskEntityKind, entityId: PersonId | FamilyId, taskId: string): void;
  /**
   * Kommando: fügt einen Forschungsprotokoll-Eintrag an einer Person ODER Familie an
   * (Spec 12 §2, Spec 20 §1.11 [S]). LogEntry ist index-adressiert (kein `id`) — der
   * Aufrufer übergibt ein vollständiges LogEntry-Objekt (`makeLogEntry`-Muster).
   */
  addLogEntry(kind: TaskEntityKind, entityId: PersonId | FamilyId, entry: LogEntry): void;
  /** Kommando: ersetzt einen Protokoll-Eintrag an `index` vollständig. */
  updateLogEntry(kind: TaskEntityKind, entityId: PersonId | FamilyId, index: number, entry: LogEntry): void;
  /** Kommando: entfernt einen Protokoll-Eintrag an `index`. */
  deleteLogEntry(kind: TaskEntityKind, entityId: PersonId | FamilyId, index: number): void;
  /**
   * Kommando: legt eine neue Hypothese an einer Person ODER Familie an (Spec 12 §4,
   * Spec 20 §1.11 [S]). `id`/`now` werden vom Aufrufer injiziert (TST-3, analog
   * `newHypothesisId()`/Uhrzeit in HypothesesView.svelte).
   */
  addHypothesis(
    kind: TaskEntityKind,
    entityId: PersonId | FamilyId,
    id: string,
    patch: Partial<Omit<Hypothesis, 'id'>>,
    now: string,
  ): void;
  /** Kommando: ersetzt eine bestehende Hypothese vollständig. */
  updateHypothesis(kind: TaskEntityKind, entityId: PersonId | FamilyId, id: string, patch: Partial<Omit<Hypothesis, 'id'>>): void;
  /** Kommando: entfernt eine Hypothese. */
  deleteHypothesis(kind: TaskEntityKind, entityId: PersonId | FamilyId, id: string): void;
}

/**
 * Baut EINEN AppState. Analog zu createViewState() kein Modul-Singleton — main.ts
 * erzeugt eine Instanz, Tests je eine frische (kein geteilter Zustand über Tests hinweg).
 */
export interface CreateAppStateOptions {
  /** Wird nach jeder Orts-/Hof-Mutation (save/delete/merge) aufgerufen — Persistenz nach
   * orte.json (Behebung Befund 1 / task_a82678c1). Fire-and-forget: der Aufrufer kümmert
   * sich um Async + Konflikt-Hinweise (s. ui/shell/places-persister.ts). Fehlt der Callback
   * (z. B. in Kern-Tests), bleiben Edits rein in-memory. Der Import-Pfad persistiert separat
   * (load-gedcom-text) — `loadDatabase` löst deshalb bewusst KEIN persistPlaces aus. */
  persistPlaces?: (placeObjects: Database['placeObjects'], hofObjects: Database['hofObjects']) => void;
  /**
   * Wird nach jedem Person-/Family-/Source-/Repository-Save- ODER Delete-Kommando
   * aufgerufen (den vier Entitätsgruppen, die core/interop/write-back.ts bereits
   * projiziert — Spec 14 §3.1 "stilles Auto-Save"), MIT dem frisch serialisierten Text.
   * AUCH nach `touch()` (Nachtrag 2026-07-07): deckt `linkEventToPlace`-Reprojektionen von
   * `ev.place` ab (PlaceDetail.svelte) — ein GEDCOM-relevantes Person-/Family-Feld, das
   * write-back.ts bereits kennt. Reine `savePlace`/`saveHof`/`mergePlace`-Kommandos lösen
   * es weiterhin NICHT aus (die berühren nur den orte.json-Seitenkanal, s. persistPlaces
   * oben — `applyDatabaseToRoots` projiziert PlaceObject/HofObject selbst nicht, nur
   * Person-/Family-Felder, die davon abgeleitet werden). AUCH nach den vier Aufgaben-
   * Kommandos (`addTask`/`updateTask`/`setTaskStatus`/`deleteTask`, Nachtrag 2026-07-07):
   * `Person.tasks`/`Family.tasks` sind jetzt Teil des Write-Back (`_TASK`-Wire-Format,
   * `core/interop/write-back.ts`/`write-back-emit.ts`) — vorher gingen Aufgaben-Edits beim
   * Reload/Export spurlos verloren, obwohl die UI sie dauerhaft anzeigte. Fire-and-forget, analog
   * persistPlaces: die IDB-Arbeitskopie-Anbindung bleibt außerhalb dieser
   * Datei (App.svelte), damit app-state.svelte.ts frei von FileService/IDB-Wissen bleibt
   * (INV-ARCH-1, Schale -> Dienste, nicht umgekehrt). Bleibt aus, solange keine Datei
   * geladen ist (kein fileName) — s. persistWorkingCopyIfLoaded().
   */
  persistWorkingCopy?: (text: string) => void;
  /**
   * Meldet das Ergebnis der Text-Angleichung an das kuratierte Ortswissen (ADR-v9-224).
   * Die Schale zeigt daraus ihren Hinweis — eine automatische Änderung, die niemand sieht,
   * wäre genau die stille Umschreibung, die ADR-v9-197 abgeschafft hat.
   *
   * Als RÜCKRUF statt als Rückgabewert, weil die Angleichung auf vier Wegen läuft (Datei
   * öffnen, Demo, Arbeitskopie beim Start, orte.json-Import) — ein Rückgabewert müsste
   * durch jeden davon einzeln durchgereicht werden, und der vierte wurde beim ersten
   * Versuch prompt vergessen (der Hinweis stand in `ImportButton` und war nach dem Laden
   * unsichtbar, weil die Datei-Fläche verlassen wird — von der eigenen Browser-Prüfung
   * gefangen, nicht von einem Test).
   */
  onPlaceTextsAligned?: (geaendert: number, luecken: number) => void;
}

export function createAppState(opts: CreateAppStateOptions = {}): AppState {
  let db = $state.raw<Database>(makeDatabase());
  let fileName = $state('');
  // `roots` ist der Passthrough-Baum des zuletzt geladenen/serialisierten Dokuments
  // (core/interop.ParsedGedcom.roots). Bewusst KEIN Svelte-$state: kein View liest roots
  // direkt (nur serialize() intern) — eine reaktive Referenz brächte hier keinen Nutzen,
  // nur unnötigen Proxy-Overhead auf einem potenziell großen Baum (analog `db` selbst,
  // das ebenfalls $state.raw ist statt tief-reaktiv).
  let roots: GedNode[] = [];
  // GRAMPS-Gegenstück zu `roots` (BL-139): der Passthrough-XML-Baum des zuletzt geladenen
  // GRAMPS-Dokuments, oder null bei GEDCOM. `docFormat` ist der explizite Format-Schalter —
  // er entscheidet, welchen Serializer das stille Auto-Save nutzt und ob die Export-Fläche
  // GRAMPS anbietet. Bewusst KEIN $state (analog `roots`): kein View liest den Baum direkt.
  let grampsDoc: XmlDocument | null = null;
  let docFormat: DocFormat = 'gedcom';
  // Undo/Redo (BL-01, ADR-v9-92). Der Stack hält Referenzen auf frühere `db`-Stände;
  // dass diese Stände gültig BLEIBEN, garantiert die Copy-on-Write-Disziplin der
  // Kommandos (core/model/draft.ts, verriegelt in tests/ui/app-state-cow.test.ts).
  const undoStack = createUndoStack();
  // REAKTIVE SPIEGEL der Stack-Verfügbarkeit. Der Stack selbst ist framework-frei
  // (INV-ARCH-1) und hält einfache Arrays — Svelte kann Änderungen daran NICHT bemerken.
  // Ohne diese Spiegel blieben die Undo/Redo-Schaltflächen dauerhaft ausgegraut, obwohl
  // `undoStack.canUndo` längst true ist: am laufenden System gefunden (die Unit-Tests
  // waren grün, weil sie den Getter direkt lesen — außerhalb jedes reaktiven Kontexts).
  // Das ist die Arbeitsteilung aus Spec 02 §3: der Kern/Dienst reagiert nicht selbst,
  // die Schale hält die reaktive Referenz.
  let canUndoFlag = $state(false);
  let canRedoFlag = $state(false);
  // Jeder Stack-Zugriff läuft über diese drei Helfer — direkt auf `undoStack` zugreifen
  // hieße, den Spiegel vergessen zu können.
  const syncUndoFlags = (): void => {
    canUndoFlag = undoStack.canUndo;
    canRedoFlag = undoStack.canRedo;
  };
  const stackPush = (before: Database): void => {
    undoStack.push(before);
    syncUndoFlags();
  };
  const stackClear = (): void => {
    undoStack.clear();
    syncUndoFlags();
  };
  // Bezugspunkt für „Revert to Saved" (Spec 20 §1.2): der zuletzt GELADENE Stand.
  // Bewusst kein $state — kein View liest ihn, er fließt nur über revertToSaved() zurück.
  let savedState: Database | null = null;
  const placeContext = $derived.by<PlaceContext>(() => ({
    places: makePlaceRegistry(db.placeObjects),
    hofs: makeHofRegistry(db.hofObjects),
  }));
  const persistPlaces = (): void => opts.persistPlaces?.(db.placeObjects, db.hofObjects);
  // Serialisiert + persistiert die Arbeitskopie NUR, wenn tatsächlich ein Dokument geladen
  // ist (fileName gesetzt) — sonst würde ein leerer/sinnloser Working-Copy-Save ausgelöst,
  // bevor überhaupt importiert/auto-geladen wurde (Auftrag Teil 2, "kein leeres Save").
  const persistWorkingCopyIfLoaded = (): void => {
    if (!fileName || !opts.persistWorkingCopy) return;
    opts.persistWorkingCopy(serializeInternal());
  };
  // Gemeinsamer Projektions-Kern für serialize()/buildGedcomDoc()/das interne Auto-Save —
  // hält `roots` in allen drei Fällen synchron auf dem projizierten Stand (s.
  // AppState.serialize()-Doku WARUM).
  const projectRoots = (): GedNode[] => {
    roots = applyDatabaseToRoots(db, roots);
    return roots;
  };
  // GRAMPS-Projektion (BL-139), Spiegel zu projectRoots: schreibt den db-Stand in den
  // gehaltenen GRAMPS-Baum zurück und übernimmt das Ergebnis als neuen Baum.
  const projectGramps = (): XmlDocument => {
    grampsDoc = applyDatabaseToXml(db, grampsDoc ?? { prolog: '', root: { tag: 'database', attrs: [], children: [], text: '' } });
    return grampsDoc;
  };
  // Format-bewusster Auto-Save-Text (Arbeitskopie): GRAMPS als ENTPACKTES XML (gzip erst
  // beim Datei-Export), GEDCOM als roher Text.
  const serializeInternal = (): string =>
    docFormat === 'gramps' ? buildXMLText({ db, doc: projectGramps() }) : serializeGedcom({ db, roots: projectRoots() });
  // Zieht die von einem Hof-Merge gemeldete Umhängung (`hofRemap`, Verlierer → Überlebender)
  // auf alle referenzierenden Ereignisse nach — copy-on-write, es werden nur die Owner
  // geklont, deren Ereignisse tatsächlich auf einen Verlierer zeigten (ADR-v9-92). Leerer
  // Remap = kein Durchlauf, der Stand bleibt referenzgleich.
  const applyHofRemap = (base: Database, remap: ReadonlyMap<HofId, HofId>): Database => {
    if (remap.size === 0) return base;
    return mapAllEvents(base, (ev) => {
      const target = ev.hofId != null ? remap.get(ev.hofId) : undefined;
      return target === undefined ? null : { ...ev, hofId: target };
    });
  };
  /**
   * Hat ein Nachlauf tatsächlich Ereignisse angefasst? `editDatabase` lässt die
   * Entitäts-Maps referenzgleich, wenn nichts geändert wurde (draft.ts) — daran erkennbar.
   *
   * Wozu: eine Ortsbearbeitung OHNE Auswirkung auf ein Ereignis (Notiz, Koordinaten, ein
   * Ort ganz ohne Ereignisse) darf die Genealogie-Arbeitskopie nicht anfassen. Sonst
   * serialisierte jeder Klick im Orts-Editor den kompletten Bestand — und die Zusicherung
   * „eine Ortsbearbeitung berührt die Genealogie nicht" gälte nur noch dem Namen nach.
   */
  const ereignisseGeaendert = (vorher: Database, nachher: Database): boolean =>
    vorher.individuals !== nachher.individuals || vorher.families !== nachher.families;

  /**
   * Dasselbe für die vom Orts-Merge gemeldete Umhängung (`placeRemap`, ADR-v9-195). Ohne
   * sie zeigte `event.placeId` nach dem Merge auf den gelöschten Verlierer — sichtbar als
   * „Ort nicht gefunden" hinter dem Ereignis-Link und als Ereignisse, die im Steckbrief des
   * Überlebenden fehlten. Bewusst KEINE Reprojektion von `ev.place`/`ev.addr`: der Text
   * bleibt der eingefrorene Wire-Wert (LP-1), `PLAC` baut der Writer ohnehin live aus der
   * jetzt korrekten `placeId` (`write-back-emit.ts`).
   */
  const applyPlaceRemap = (base: Database, remap: ReadonlyMap<PlaceId, PlaceId>): Database => {
    if (remap.size === 0) return base;
    return mapAllEvents(base, (ev) => {
      const target = ev.placeId != null ? remap.get(ev.placeId) : undefined;
      return target === undefined ? null : { ...ev, placeId: target };
    });
  };
  /**
   * Die zweite, seit ADR-v9-222 nötige Hälfte des Orts-Merges: Ortsnennungen, die zum
   * Merge-Zeitpunkt MEHRDEUTIG waren (`placeId == null`, Review-Klasse P) und deren
   * Leitsegment einen Namen der zusammengeführten Gruppe trägt, an den Überlebenden binden.
   * Die anschließende `reprojectEventsOfPlace` schreibt ihren Text auf dessen Kette um.
   *
   * WARUM DAS DIE FALTUNG ERSETZT. Bis ADR-v9-222 sammelte der Überlebende die Namen und
   * Verwaltungsketten aller Verlierer ein; genau daran dockten diese Nennungen beim nächsten
   * Ladepass wieder an. Ohne Ersatz legte der Seed sie als neue Orte an — am Realbestand
   * kamen 14 von 129 zusammengeführten Orten zurück (59 Ereignisse betroffen). Der Merge
   * löst die Mehrdeutigkeit jetzt dort auf, wo sie steht, statt sie am Objekt zu
   * konservieren.
   *
   * `mentionNames` ist leer, wenn noch ein gleichnamiger Ort außerhalb der Gruppe existiert
   * (Teil-Auswahl im Dedup-Dialog) — dann bleibt jede Nennung unangetastet.
   */
  const bindPlaceMentions = (base: Database, survivorId: PlaceId, mentionNames: readonly string[]): Database => {
    if (mentionNames.length === 0) return base;
    // Bewusst `includes` statt eines Sets: eine Dubletten-Gruppe hat eine Handvoll Namen,
    // und ein Set wäre hier eine reaktive Sonderform (svelte/prefer-svelte-reactivity).
    return mapAllEvents(base, (ev) => {
      if (ev.placeId != null || !ev.place) return null;
      const lead = ev.place.split(',').map((s) => s.trim()).filter(Boolean)[0];
      if (lead === undefined || !mentionNames.includes(normPlaceName(lead))) return null;
      return { ...ev, placeId: survivorId };
    });
  };
  /**
   * DER Chokepoint für jede Zustandsänderung durch ein Editier-Kommando (Spec 02 §3).
   *
   * WARUM ALLES HIER DURCHLÄUFT statt `pushUndoSnapshot()` an ~20 Kommandos daneben:
   * Undo/Redo braucht den Zustand VOR jeder Änderung. Als separater Aufruf wäre das eine
   * Erinnerungspflicht — wer ihn vergisst, baut ein Kommando, das sich stillschweigend
   * nicht zurücknehmen lässt (der Fehler fällt erst auf, wenn ein Nutzer ⌘Z drückt und
   * nichts passiert). Weil die Ablage hier untrennbar an der Zuweisung hängt, kann man
   * sie nicht vergessen, ohne dass die Änderung überhaupt ausbleibt — ein sofort
   * sichtbarer Fehler statt eines stillen. Dieselbe Logik wie `resetKey` (ADR-v9-83):
   * Zwang schlägt Dokumentation.
   *
   * `places`/`workingCopy` steuern die beiden Persistenz-Seitenkanäle (orte.json bzw.
   * GEDCOM-Arbeitskopie) — nicht jedes Kommando berührt beide.
   */
  const commit = (
    next: Database,
    fx: { places?: boolean; workingCopy?: boolean } = {},
  ): void => {
    stackPush(db); // Referenz auf den Vorzustand, keine Kopie (ADR-v9-92)
    db = next;
    if (fx.places) persistPlaces();
    if (fx.workingCopy) persistWorkingCopyIfLoaded();
  };
  /**
   * DIE Zollgrenze zwischen Oberfläche und Kern: macht aus einem Modell, das ein Formular
   * gebaut hat, wieder gewöhnliche Daten.
   *
   * DER BEFUND (2026-08-09). „Heirat bearbeiten → Speichern" funktionierte EINMAL, beim
   * zweiten Mal tat der Knopf nichts. Ursache: `EventEditModal` hält seinen Formular-
   * zustand in `$state`, `fromEditable()` reicht dessen `citations` unverändert zurück —
   * ein tief-reaktiver Proxy. `saveFamily` legte ihn in die Datenbank; der nächste Save
   * lief über `editDatabase`→`thaw`→`structuredClone` und warf an genau diesem Proxy
   * („… bei .marriage.citations[0].media"). Die Ausnahme flog aus dem `onsubmit`-Handler:
   * kein Speichern, keine Meldung, ein Knopf, der aussieht, als sei er tot.
   *
   * WARUM HIER UND NICHT IM MODAL. Das Modal war nur die erste Fundstelle. Jedes Formular,
   * das ein Teilobjekt (nicht bloß Strings) in `$state` hält, hat dasselbe Leck —
   * `PersonForm`/`FamilyForm` teilen sich sogar dasselbe `fromEditable`. Eine Regel „bitte
   * vor dem Speichern entkoppeln" wäre wieder die Erinnerungspflicht, die `commit` oben
   * ausdrücklich vermeidet. Hier liegt die EINE Stelle, an der jedes Oberflächen-Modell
   * in ein Kern-Kommando eintritt — also gehört die Umwandlung hierher (ADR-v9-83-Logik:
   * Zwang schlägt Dokumentation).
   *
   * `$state.snapshot` wirft nie: was es nicht kopieren kann, reicht es unverändert durch
   * (Svelte `clone.js`) — für die flachen Datenmodelle aus Spec 10 ist es eine gewöhnliche
   * Tiefkopie EINER Entität, nicht der Datenbank. Der Kern selbst darf das nicht tun:
   * er ist framework-frei (INV-ARCH-1) und kennt Sveltes Proxys nicht.
   */
  const roh = <T>(model: T): T => $state.snapshot(model) as T;
  // Übernimmt das Ergebnis eines Forschungsdaten-Kommandos. `null` = nicht angewandt
  // (Zielentität fehlt) — dann bleibt der Zustand unberührt, es wird nicht persistiert
  // UND kein Undo-Eintrag erzeugt (ein wirkungsloses Kommando ist kein Schritt).
  const applyEdit = (next: Database | null): void => {
    if (!next) return;
    commit(next, { workingCopy: true });
  };

  return {
    get db() {
      return db;
    },
    get caps() {
      return FULL_PLACES_CAPS;
    },
    get placeContext() {
      return placeContext;
    },
    get fileName() {
      return fileName;
    },
    loadDatabase(nextDb, nextFileName, nextRoots) {
      db = nextDb;
      fileName = nextFileName;
      roots = nextRoots ?? [];
      grampsDoc = null; // GEDCOM-Ladepfad: kein GRAMPS-Baum, kein GRAMPS-Export angeboten
      docFormat = 'gedcom';
      // Ein Undo über eine Dateiöffnung hinweg gibt es nicht (ADR-v9-92 Punkt 5) — die
      // abgelegten Zustände gehören zu einem anderen Dokument. Zugleich wird hier der
      // „Revert to Saved"-Bezugspunkt gesetzt (Spec 20 §1.2, Fallback bei leerem Stack).
      stackClear();
      savedState = nextDb;
    },
    loadGrampsDoc(nextDb, nextFileName, nextDoc) {
      db = nextDb;
      fileName = nextFileName;
      grampsDoc = nextDoc;
      roots = []; // GRAMPS-Ladepfad: kein GEDCOM-Passthrough
      docFormat = 'gramps';
      stackClear();
      savedState = nextDb;
    },
    get docFormat() {
      return docFormat;
    },
    serialize() {
      return serializeInternal();
    },
    buildGedcomDoc() {
      return { db, roots: projectRoots() };
    },
    buildGrampsDoc() {
      return { db, doc: projectGramps() };
    },
    buildCrossFamilyDoc(targetFamily) {
      // Reine Synthese aus `db` — KEIN Bezug auf `roots`/`grampsDoc` (die gehören dem
      // jeweils NATIVEN Passthrough-Pfad, den ein Cross-Export gerade nicht hat).
      return targetFamily === 'gramps'
        ? { grampsDoc: buildGrampsTreeFromModel(db) }
        : { gedcomDoc: { db, roots: buildGedcomTreeFromModel(db) } };
    },
    savePlace(model_) {
      const model = roh(model_);
      // Bewusst eine plain Map, keine SvelteMap: db ist $state.raw (nicht tief reaktiv) —
      // Reaktivität läuft ausschließlich über die db-Referenzänderung unten, nicht über
      // Map-interne Reaktivität. Eine SvelteMap hier wäre unnötiger Overhead ohne Nutzen.
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextPlaces = new Map(db.placeObjects);
      savePlaceObject(nextPlaces, model);
      // Nachlauf (BL-291, ADR-v9-198): die Ereignisse DIESES Ortes ziehen ihre
      // PLAC-Projektion mit. Ohne ihn zeigt der Dateitext nach einer Ketten-KORREKTUR auf
      // eine Zugehörigkeit, die es nicht mehr gibt — und der nächste Ladepass legt eine
      // Dublette an, statt den kuratierten Ort wiederzuerkennen (LP-5: „Re-Derivation ist
      // die Persistenz", der PLAC-Text ist ihre Eingabe). `workingCopy` deshalb Pflicht.
      const basis = { ...db, placeObjects: nextPlaces };
      const next = reprojectEventsOfPlace(basis, model.id);
      commit(next, { places: true, workingCopy: ereignisseGeaendert(basis, next) });
    },
    importGovEntry(placeId, rawText): GovApplyResult | null {
      const entry = parseGovText(rawText);
      if (!entry || !entry.govId) return null;
      // Kopie ziehen, anwenden, EINMAL committen — dieselbe Copy-on-Write-Form wie
      // savePlace/mergePlace. `applyGovEntry` mutiert die übergebene Map (und die darin
      // liegenden Objekte), deshalb müssen auch die berührten Objekte geklont werden:
      // sonst schriebe es in den alten Undo-Zustand hinein.
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextPlaces = new Map(db.placeObjects);
      const target = nextPlaces.get(placeId);
      if (!target) return null;
      // `?? []` ist hier PFLICHT, nicht Vorsicht: `translations` ist ein nachträglich
      // hinzugekommenes, abwärtskompatibles orte.json-Feld (ADR-v9-144) — an einem aus
      // einer älteren Datei geladenen PlaceObject fehlt es. Ein nacktes `[...undefined]`
      // wirft; am echten Bestand genau so passiert (der Testbestand hatte das Feld immer).
      nextPlaces.set(placeId, {
        ...target,
        pnames: [...(target.pnames ?? [])],
        translations: [...(target.translations ?? [])],
        enclosedBy: [...(target.enclosedBy ?? [])],
        govTypes: target.govTypes ? [...target.govTypes] : null,
      });
      const result = applyGovEntry(nextPlaces, placeId, entry);
      if (!result || result.changes === 0) return result;
      // Nachlauf wie bei `savePlace` (BL-291): ein GOV-Import bringt typischerweise genau
      // das mit, was die Projektion ändert — Namensvarianten und datierte Zugehörigkeiten.
      const basis = { ...db, placeObjects: nextPlaces };
      const nextDb = reprojectEventsOfPlace(basis, placeId);
      commit(nextDb, { places: true, workingCopy: ereignisseGeaendert(basis, nextDb) });
      return result;
    },
    deletePlace(id) {
      // deletePlaceCascade (ADR-v9-78 Punkt 1) räumt jede hängende event.placeId-Referenz
      // in individuals/families auf, bevor es das PlaceObject selbst entfernt, und liefert
      // seit ADR-v9-92 einen fertigen neuen Stand (Copy-on-Write — nur Owner mit echter
      // Änderung werden geklont). Sowohl placeObjects (orte.json) als auch
      // individuals/families (Event-Referenzen) haben sich geändert — beide Persistenz-
      // Pfade nötig.
      commit(deletePlaceCascade(db, id), { places: true, workingCopy: true });
    },
    mergePlace(survivorId, mergedIds): MergeResult {
      // Merge berührt BEIDE Maps (pnames-Fold + Referenz-Umhängung in hofObjects.villageId).
      // `events` versorgt NUR die Gewinner-Heuristik des automatischen Hof-Nachlaufs
      // (ADR-v9-45 Nachtrag) und wird dabei nicht verändert — die `event.hofId`-Umhängung
      // meldet der Merge als `hofRemap` und wird hier copy-on-write nachgezogen
      // (ADR-v9-92: die frühere In-Place-Mutation schrieb in gehaltene Undo-Snapshots).
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextPlaces = new Map(db.placeObjects);
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextHofs = new Map(db.hofObjects);
      const result = mergePlaceObjects(nextPlaces, nextHofs, survivorId, mergedIds, collectAllEvents(db));
      // BEIDE gemeldeten Umhängungen nachziehen — Orte (ADR-v9-195) und die Höfe des
      // automatischen Nachlaufs (ADR-v9-92). `workingCopy` ist jetzt nötig: mit der
      // korrigierten `placeId` schreibt der Writer ein anderes `PLAC` (er baut es live aus
      // dem Orts-Bestand), die Arbeitskopie muss also mitziehen.
      const next = bindPlaceMentions(
        applyPlaceRemap(
          applyHofRemap({ ...db, placeObjects: nextPlaces, hofObjects: nextHofs }, result.hofRemap),
          result.placeRemap,
        ),
        survivorId,
        result.mentionNames,
      );
      // Nachlauf wie bei `savePlace` (BL-291): der Überlebende trägt jetzt die vereinigten
      // Namen und Ketten — die Ereignisse, die nach dem Remap an ihm hängen, bekommen die
      // Projektion dieses Standes. Sonst zeigt ihr Dateitext weiter auf den Verlierer, und
      // der nächste Ladepass legt ihn neu an.
      // Anders als bei `savePlace`: der Remap oben hat die Ereignis-Referenzen bereits
      // angefasst, die Arbeitskopie muss also in jedem Fall mit.
      commit(reprojectEventsOfPlace(next, survivorId), { places: true, workingCopy: true });
      return result;
    },
    saveHof(model_) {
      const model = roh(model_);
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextHofs = new Map(db.hofObjects);
      saveHofObject(nextHofs, model);
      // Nachlauf wie bei `savePlace` (ADR-v9-223): dieses Kommando speichert das GANZE
      // Hof-Objekt, also auch seine `addrs` — `HofDetail` legt darüber Adressvarianten an
      // und entfernt sie. Fällt die Variante weg, die der Ereignistext trägt, zeigte die
      // Datei bis dahin weiter die alte Adresse, während die Anzeige längst die neue baute.
      // (Der dedizierte Umbenenn-Pfad `updateHofAddr` hatte seinen Nachlauf seit ADR-v9-81
      // — die Geschwister-Stelle daneben nicht.)
      //
      // ZWEI Repräsentationen, deshalb zwei Schritte: `ev.addr` ist der eingefrorene
      // Wire-Wert (ADR-v9-47/-81) und wird nur dort ersetzt, wo er einen ENTFALLENEN
      // Adresswert trägt; `ev.place` baut der Nachlauf danach ohnehin neu.
      const vorher = db.hofObjects.get(model.id);
      // `includes` statt eines Sets: eine Handvoll Adressvarianten je Hof, und ein Set wäre
      // hier die reaktive Sonderform (svelte/prefer-svelte-reactivity).
      const behalten = model.addrs.map((a) => normHofAddr(a.value));
      const entfallen = (vorher?.addrs ?? [])
        .map((a) => a.value)
        .filter((v) => !behalten.includes(normHofAddr(v)));
      const basis = reprojectHofAddrInEvents({ ...db, hofObjects: nextHofs }, model.id, entfallen);
      const next = reprojectEventsOf(basis, { hofs: [model.id] });
      commit(next, { places: true, workingCopy: ereignisseGeaendert(basis, next) });
    },
    updateHofAddr(hofId, index, value, from, to) {
      const hof = db.hofObjects.get(hofId);
      if (!hof) return;
      const oldValue = hof.addrs[index]?.value;
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextHofs = new Map(db.hofObjects);
      saveHofObject(nextHofs, withUpdatedHofAddr(hof, index, value, from, to));
      let nextDb: Database = { ...db, hofObjects: nextHofs };
      const newValue = value.trim();
      // Nur bei tatsächlichem Namenswechsel propagieren — reine from/to-Änderungen
      // (Wert bleibt gleich) lösen KEINE Event-Umbenennung aus.
      if (oldValue !== undefined && newValue !== '' && oldValue !== newValue) {
        nextDb = renameHofAddrInEvents(nextDb, hofId, oldValue, newValue);
      }
      commit(nextDb, { places: true, workingCopy: true });
    },
    moveHof(hofId, villageId) {
      // Zwei Nachläufe, beide mit Präzedenz (ADR-v9-172): Kollisions-Konsolidierung im
      // Zieldorf (wie nach einem Dorf-Merge) und der `event.placeId`-Dorfanker der
      // referenzierenden Ereignisse (wie bei der Hof-Umbenennung, ADR-v9-81). Beide
      // Persistenz-Pfade nötig: Höfe (orte.json) UND Event-Referenzen (Arbeitskopie).
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextHofs = new Map(db.hofObjects);
      const result = moveHofToVillage(nextHofs, hofId, villageId, collectAllEvents(db));
      commit(relinkHofVillageInEvents({ ...db, hofObjects: nextHofs }, hofId, villageId, result.remap), {
        places: true,
        workingCopy: true,
      });
      return result;
    },
    deleteHof(id) {
      // deleteHofCascade (ADR-v9-78 Punkt 1) — analog deletePlace oben, aber für den
      // Hof-Pfad (event.hofId statt event.placeId).
      commit(deleteHofCascade(db, id), { places: true, workingCopy: true });
    },
    mergeHof(survivorId, mergedIds) {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextHofs = new Map(db.hofObjects);
      const remap = mergeHofObjects(nextHofs, survivorId, mergedIds);
      // Nachlauf (ADR-v9-223): die umgehängten Ereignisse hängen jetzt am Überlebenden —
      // der kann eine andere Adressvariante führen UND in einem anderen Dorf liegen. Ohne
      // die Reprojektion nannte der Dateitext weiter das alte Dorf, während die Anzeige
      // schon das neue zeigte. Dasselbe hatte `mergePlace` seit ADR-v9-195, `mergeHof` nicht.
      const basis = applyHofRemap({ ...db, hofObjects: nextHofs }, remap);
      const next = reprojectEventsOf(basis, { hofs: [survivorId] });
      commit(next, { places: true, workingCopy: ereignisseGeaendert(basis, next) || remap.size > 0 });
    },
    alignPlaceTexts() {
      const res = alignCuratedEventTexts(db);
      if (res.geaendert > 0) commit(res.db, { workingCopy: true });
      if (res.geaendert > 0 || res.luecken.length > 0) {
        opts.onPlaceTextsAligned?.(res.geaendert, res.luecken.length);
      }
      return { geaendert: res.geaendert, luecken: res.luecken.length };
    },
    replacePlacesAndHofs(placeObjects, hofObjects) {
      const nextDb = { ...db, placeObjects, hofObjects };
      // Reklassifiziert ALLE Events der aktuell geladenen Genealogie gegen den neuen
      // Orts-/Hof-Bestand (mutiert individuals/families IN-PLACE, wie mergePlace/mergeHof
      // es bereits mit event.hofId/event.placeId tun — s. Interface-Doku oben). Auf einer
      // leeren db (kein Import geladen) ist dies ein no-op (keine Events zu sammeln).
      // resetUncuratedLinks: setzt vor der Auflösung placeId/hofId nicht-kuratierter
      // Ziele zurück, damit sie tatsächlich gegen die neu importierten kuratierten Orte
      // neu geprüft werden (ADR-v9-74) — sonst würde der "bereits gelinkt"-Kurzschluss
      // in resolveEvents jede Verbesserung verhindern.
      const resolution = applyPlaceResolution(nextDb, { resetUncuratedLinks: true });
      // Nachlauf: seit ADR-v9-224 derselbe wie beim Laden — der AUTORITÄTS-Satz, nicht
      // mehr ein Inhaltsvergleich alt/neu (ADR-v9-223). Ein Import ist der Fall, für den
      // der Satz gemacht ist: er bringt genau das kuratierte Wissen mit, dem der Dateitext
      // folgen soll. Der frühere Diff war die halbe Antwort — er heilte nur, was sich in
      // DIESEM Moment änderte, und ließ jede vorher entstandene Abweichung stehen.
      // KEIN Undo-Eintrag, sondern Stack LEEREN (ADR-v9-92 Punkt 5): `applyPlaceResolution`
      // ist der volle Lade-Pass und mutiert Person-/Family-Events in-place — es teilt seine
      // Entitäten also mit zuvor abgelegten Zuständen und würde sie mitverändern. Der ADR
      // ordnet einen vollen Auflösungs-Pass ausdrücklich dem LADEN zu, nicht dem Editieren
      // („ein Undo über eine Dateiöffnung hinweg gibt es nicht"); ein orte.json-Import ist
      // genau so ein Massen-Wechsel der Orts-Identität (Spec 11 §3 „Mechanismus 1").
      // Konsequenz statt stiller Beschädigung: was davor war, ist nicht mehr rücknehmbar.
      stackClear();
      const angleich = alignCuratedEventTexts(nextDb);
      db = angleich.db;
      if (angleich.geaendert > 0 || angleich.luecken.length > 0) {
        opts.onPlaceTextsAligned?.(angleich.geaendert, angleich.luecken.length);
      }
      persistWorkingCopyIfLoaded();
      // Bewusst NICHT unbedingt persistPlaces() — der Aufrufer hat den importierten Stand
      // bereits gespeichert (s. Interface-Doku). Nur bei Wachstum durch die
      // Reklassifikation selbst (Village-Seed/Hof-Bootstrap) erneut speichern.
      if (resolution.hofObjectsGrew || resolution.placeObjectsGrew) persistPlaces();
    },
    savePerson(model) {
      commit({ ...db, individuals: savePersonCmd(db.individuals, roh(model)) }, { workingCopy: true });
    },
    deletePerson(id) {
      // Referenz-auflösend: der Kern hängt die Person aus allen Familien/Assoziationen/
      // Aliassen aus und löscht eine dadurch leer werdende Familie mit — liefert deshalb ein
      // vollständiges neues Database (deletePersonCascade, ADR-v9-…), nicht nur die Map.
      commit(deletePersonCmd(db, id), { workingCopy: true });
    },
    applyImport(imported, matches, selections, sourceConfig) {
      const result = applyImportPatchCmd(db, imported, matches, selections, sourceConfig);
      // Nur committen, wenn tatsächlich etwas passiert ist — ein folgenloser Durchgang
      // soll keinen Undo-Schritt erzeugen (gleiche Haltung wie `applyEdit`).
      if (result.changedPersons > 0 || result.importedPersons > 0) {
        commit(result.db, { workingCopy: true });
      }
      return result;
    },
    mergePerson(winnerId, loserId, selections) {
      // Der Kern liefert einen fertigen neuen Stand (Copy-on-Write, ADR-v9-92) — hier
      // gibt es keine Merge-Logik, nur den Commit. Nur `workingCopy`: Orte/Höfe bleiben
      // unberührt, ein Personen-Merge fasst `placeObjects` nicht an.
      commit(mergePersonsCmd(db, winnerId, loserId, selections), { workingCopy: true });
    },
    saveFamily(model) {
      // saveFamilyCmd führt die INDI-Seite (Person.parentIn/childOf) synchron nach
      // (Spec 10 INV-P3) und liefert deshalb ein vollständiges neues Database zurück —
      // beide betroffenen Maps (individuals + families) kommen fertig daraus.
      commit(saveFamilyCmd(db, roh(model)), { workingCopy: true });
    },
    saveChildLink(personId, link) {
      commit(saveChildLinkCmd(db, personId, roh(link)), { workingCopy: true });
    },
    deleteFamily(id) {
      commit(deleteFamilyCmd(db, id), { workingCopy: true });
    },
    saveSource(model) {
      commit({ ...db, sources: saveSourceCmd(db.sources, roh(model)) }, { workingCopy: true });
    },
    deleteSource(id) {
      // Referenz-auflösend: entfernt alle Zitate auf die Quelle an jeder Träger-Stelle
      // (deleteSourceCascade) → vollständiges neues Database.
      commit(deleteSourceCmd(db, id), { workingCopy: true });
    },
    saveRepository(model) {
      commit({ ...db, repositories: saveRepositoryCmd(db.repositories, roh(model)) }, { workingCopy: true });
    },
    deleteRepository(id) {
      // Referenz-auflösend: löst den repo-Verweis jeder darauf zeigenden Quelle
      // (deleteRepositoryCascade) → vollständiges neues Database.
      commit(deleteRepositoryCmd(db, id), { workingCopy: true });
    },
    saveMedia(model) {
      commit({ ...db, media: saveMediaCmd(db.media, roh(model)) }, { workingCopy: true });
    },
    deleteMedia(id) {
      // Referenz-auflösend (BEWUSST MIT Kaskade, s. core/model/commands.ts) → vollständiges
      // neues Database (Person-/Familien-/Quellen-Referenzen UND db.media selbst).
      commit(deleteMediaCmd(db, id), { workingCopy: true });
    },
    linkEventToPlace(event, placeId) {
      const ctx = placeContext;
      let applied = false;
      const next = editDatabase(db, (d) => {
        const ev = d.event(event);
        if (!ev) return;
        linkEventToPlaceCmd(ev, placeId, ctx);
        applied = true;
      });
      if (!applied) return false;
      commit(next, { workingCopy: true });
      return true;
    },
    linkEventToHof(event, hofId, villageId) {
      const ctx = placeContext;
      let applied = false;
      const next = editDatabase(db, (d) => {
        const ev = d.event(event);
        if (!ev) return;
        // Dorf-Anker VOR der Reprojektion setzen (Klasse D "als Hof anlegen"): war früher
        // ein separates `event.placeId = villageId` im Aufrufer — in derselben Draft-
        // Transaktion bleibt die Verknüpfung atomar (kein Zwischenstand, ADR-v9-19).
        if (villageId !== undefined) ev.placeId = villageId;
        linkEventToHofCmd(ev, hofId, ctx);
        applied = true;
      });
      if (!applied) return false;
      commit(next, { workingCopy: true });
      return true;
    },
    // --- Undo/Redo (Spec 20 §1.2, ADR-v9-92) ---------------------------------------
    get canUndo() {
      return canUndoFlag;
    },
    get canRedo() {
      return canRedoFlag;
    },
    undo() {
      const previous = undoStack.undo(db);
      if (previous === null) return false;
      syncUndoFlags();
      db = previous;
      // NICHT über commit(): das legte den aktuellen Zustand als neuen Undo-Eintrag ab
      // und verwürfe den Redo-Zweig — der Stack führt seine eigene Buchhaltung.
      // Beide Persistenz-Seitenkanäle laufen: ein zurückgenommenes Kommando kann Orte
      // ODER Genealogie betroffen haben, und der Stack weiß nicht mehr welches.
      persistPlaces();
      persistWorkingCopyIfLoaded();
      return true;
    },
    redo() {
      const next = undoStack.redo(db);
      if (next === null) return false;
      syncUndoFlags();
      db = next;
      persistPlaces();
      persistWorkingCopyIfLoaded();
      return true;
    },
    revertToSaved() {
      if (savedState === null) return false;
      // Ein ganz normales Kommando auf den Speicherzustand (ADR-v9-92 Punkt 6) — es ist
      // damit selbst rücknehmbar, falls der Nutzer es versehentlich auslöst.
      commit(savedState, { places: true, workingCopy: true });
      return true;
    },
    // --- Forschungsdaten (Aufgaben/Protokoll/Hypothesen) ---------------------------
    // Alle zehn Kommandos liefern seit ADR-v9-92 einen NEUEN Stand statt in-place zu
    // mutieren; `null` bedeutet „nicht angewandt" (Zielentität fehlt) — dann bleibt der
    // Zustand unverändert und es wird auch nichts persistiert (vorher wurde in diesem
    // Fall ein wirkungsloser Working-Copy-Save ausgelöst).
    addTask(kind, entityId, taskId, text, category, now, sourceRef) {
      applyEdit(addTaskCmd(db, kind, entityId, taskId, text, category, now, sourceRef));
    },
    updateTask(kind, entityId, taskId, text, category, sourceRef) {
      applyEdit(updateTaskCmd(db, kind, entityId, taskId, text, category, sourceRef));
    },
    setTaskStatus(kind, entityId, taskId, status) {
      applyEdit(setTaskStatusById(db, kind, entityId, taskId, status));
    },
    deleteTask(kind, entityId, taskId) {
      applyEdit(deleteTaskCmd(db, kind, entityId, taskId));
    },
    addLogEntry(kind, entityId, entry) {
      applyEdit(addLogEntryCmd(db, kind, entityId, roh(entry)));
    },
    updateLogEntry(kind, entityId, index, entry) {
      applyEdit(updateLogEntryCmd(db, kind, entityId, index, roh(entry)));
    },
    deleteLogEntry(kind, entityId, index) {
      applyEdit(deleteLogEntryCmd(db, kind, entityId, index));
    },
    addHypothesis(kind, entityId, id, patch, now) {
      applyEdit(addHypothesisCmd(db, kind, entityId, id, roh(patch), now));
    },
    updateHypothesis(kind, entityId, id, patch) {
      applyEdit(updateHypothesisCmd(db, kind, entityId, id, roh(patch)));
    },
    deleteHypothesis(kind, entityId, id) {
      applyEdit(deleteHypothesisCmd(db, kind, entityId, id));
    },
  };
}
