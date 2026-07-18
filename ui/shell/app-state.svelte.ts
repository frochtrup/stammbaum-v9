// ui/shell/app-state.svelte.ts — reaktiver App-Zustand der UI-Schale (Spec 02 §3).
//
// Hält die EINE geladene Datenbank + den daraus abgeleiteten PlaceContext (Chokepoint-
// Zugriff, Spec 11 §5). Reagiert der Kern nicht selbst (er hat keine Stores/Signals,
// Spec 02 §3) — die Schale liest ihn über die definierten Chokepoints und hält eine
// reaktive Referenz. Ein Kommando (hier: Import) → Chokepoints neu lesen → Views
// aktualisieren sich automatisch (ein Pfad, kein zweiter Render-Trigger nötig).
import type {
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
} from '../../core/model/types';
import type { PlaceObject, HofObject } from '../../core/places';
import {
  makeDatabase,
  savePerson as savePersonCmd,
  deletePerson as deletePersonCmd,
  saveFamily as saveFamilyCmd,
  deleteFamily as deleteFamilyCmd,
  saveSource as saveSourceCmd,
  deleteSource as deleteSourceCmd,
  saveRepository as saveRepositoryCmd,
  deleteRepository as deleteRepositoryCmd,
} from '../../core/model';
import {
  makePlaceRegistry,
  makeHofRegistry,
  savePlaceObject,
  saveHofObject,
  mergePlaceObjects,
  mergeHofObjects,
  withUpdatedHofAddr,
  linkEventToPlace as linkEventToPlaceCmd,
  linkEventToHof as linkEventToHofCmd,
  type PlaceContext,
  type MergeResult,
} from '../../core/places';
import { editDatabase, mapAllEvents } from '../../core/model/draft';
import type { GedNode } from '../../core/interop';
import { applyDatabaseToRoots, serializeGedcom } from '../../core/interop';
import { applyPlaceResolution, deletePlaceCascade, deleteHofCascade, renameHofAddrInEvents } from '../../services/places';
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

export interface AppState {
  /** Aktuell geladene Datenbank (leer, bis eine Datei importiert wurde). */
  readonly db: Database;
  /** Abgeleiteter Orts-/Hof-Chokepoint-Kontext, immer zur aktuellen db passend. */
  readonly placeContext: PlaceContext;
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
  /** Kommando: Upsert eines PlaceObject (`savePlaceObject(model)`-Muster, Spec 20 §1.7 [K]). */
  savePlace(model: PlaceObject): void;
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
  /** Kommando: entfernt eine Person (per id, keine Kaskade — analog deletePlace). */
  deletePerson(id: PersonId): void;
  /**
   * Kommando: Upsert einer Familie (`saveFamily(model)`-Muster, Spec 20 §2). ANDERS als
   * savePerson führt der Kern (core/model/commands.ts saveFamily) hier die INDI-Seite
   * (Person.parentIn/childOf) synchron nach (INV-P3) — deshalb mutiert das Kommando BEIDE
   * Maps (individuals + families) in-place und reassigned danach beide, damit Svelte's
   * Reaktivität an beiden betroffenen Aggregaten greift (analog addTask/updateTask unten).
   */
  saveFamily(model: Family): void;
  /** Kommando: entfernt eine Familie (per id, keine Kaskade — analog deleteFamily im Kern). */
  deleteFamily(id: FamilyId): void;
  /**
   * Kommando: Upsert einer Quelle (`saveSource(model)`-Muster, Spec 20 §2). Source ist ein
   * FLACHES Modell ohne Beziehungs-Graph (Spec 10 §4) — reines Whole-Object-Upsert, analog
   * savePlace, KEINE Sync-Logik wie bei saveFamily nötig.
   */
  saveSource(model: Source): void;
  /** Kommando: entfernt eine Quelle (per id, keine Kaskade — analog deletePlace). */
  deleteSource(id: SourceId): void;
  /** Kommando: Upsert eines Archivs (`saveRepository(model)`-Muster, Spec 20 §2). */
  saveRepository(model: Repository): void;
  /** Kommando: entfernt ein Archiv (per id, keine Kaskade). */
  deleteRepository(id: RepoId): void;
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
  /** Kommando: entfernt ein HofObject. */
  deleteHof(id: HofId): void;
  /**
   * Kommando: Hof-Dubletten-Merge — führt EINEN ODER MEHRERE `mergedIds` in `survivorId`
   * zusammen (Spec 20 §1.8 [K], §9.2 Massen-Dedup). Analog `mergePlace`, aber ohne
   * automatischen Nachlauf (der ist nur für Dorf-Merges definiert, ADR-v9-45).
   */
  mergeHof(survivorId: HofId, mergedIds: HofId | readonly HofId[]): void;
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
   * Kommando: erzwingt eine Reaktivitäts-Aktualisierung nach einer In-Place-Mutation an
   * Event-Feldern (z. B. `linkEventToPlace`, das Person-/Family-Events mutiert, die NICHT
   * über eine eigene Map-Struktur laufen wie placeObjects/hofObjects). Ein Kommando →
   * Chokepoints neu lesen → Views aktualisieren sich (Spec 02 §3, EIN Pfad). Löst (falls
   * injiziert) auch `persistWorkingCopy` aus (Nachtrag 2026-07-07): `linkEventToPlace`
   * (PlaceDetail.svelte "Ortszuordnung") reprojiziert `ev.place` sofort im Kommando
   * (ADR-v9-19) — ein GEDCOM-relevantes Feld, das der bestehende Write-Back (ADR-v9-32)
   * bereits über `eventEqual`/`emitPerson`/`emitFamily` abdeckt. Ohne diesen Aufruf ging
   * die Reprojektion beim nächsten Reload/Export verloren, obwohl sie in-memory korrekt
   * war. Die Hof-Review-Aktionen (`hof-review-actions.ts`) rufen `touch()` ebenfalls auf,
   * mutieren aber nur `event.hofId`/`event.placeId` (laufzeit-only, Spec 11 §2 — werden
   * beim nächsten `resolveEvents()` neu abgeleitet, NICHT persistiert) — für sie ist der
   * zusätzliche Aufruf ein no-op (kein `ev.place`/`ev.addr`-Unterschied), aber ein
   * einheitlicher `touch()`-Pfad ist einfacher als zwei Varianten je nach Aufrufer-Kontext
   * zu unterscheiden.
   */
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
  touch(): void;
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
  const serializeInternal = (): string => serializeGedcom({ db, roots: projectRoots() });
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
  // Übernimmt das Ergebnis eines Forschungsdaten-Kommandos. `null` = nicht angewandt
  // (Zielentität fehlt) — dann bleibt der Zustand unberührt und es wird nicht persistiert.
  const applyEdit = (next: Database | null): void => {
    if (!next) return;
    db = next;
    persistWorkingCopyIfLoaded();
  };

  return {
    get db() {
      return db;
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
    },
    serialize() {
      return serializeInternal();
    },
    buildGedcomDoc() {
      return { db, roots: projectRoots() };
    },
    savePlace(model) {
      // Bewusst eine plain Map, keine SvelteMap: db ist $state.raw (nicht tief reaktiv) —
      // Reaktivität läuft ausschließlich über die db-Referenzänderung unten, nicht über
      // Map-interne Reaktivität. Eine SvelteMap hier wäre unnötiger Overhead ohne Nutzen.
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextPlaces = new Map(db.placeObjects);
      savePlaceObject(nextPlaces, model);
      db = { ...db, placeObjects: nextPlaces };
      persistPlaces();
    },
    deletePlace(id) {
      // deletePlaceCascade (ADR-v9-78 Punkt 1) räumt jede hängende event.placeId-Referenz
      // in individuals/families auf, bevor es das PlaceObject selbst entfernt, und liefert
      // seit ADR-v9-92 einen fertigen neuen Stand (Copy-on-Write — nur Owner mit echter
      // Änderung werden geklont). Sowohl placeObjects (orte.json) als auch
      // individuals/families (Event-Referenzen) haben sich geändert — beide Persistenz-
      // Pfade nötig.
      db = deletePlaceCascade(db, id);
      persistPlaces();
      persistWorkingCopyIfLoaded();
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
      db = applyHofRemap({ ...db, placeObjects: nextPlaces, hofObjects: nextHofs }, result.hofRemap);
      persistPlaces();
      return result;
    },
    saveHof(model) {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextHofs = new Map(db.hofObjects);
      saveHofObject(nextHofs, model);
      db = { ...db, hofObjects: nextHofs };
      persistPlaces();
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
      db = nextDb;
      persistPlaces();
      persistWorkingCopyIfLoaded();
    },
    deleteHof(id) {
      // deleteHofCascade (ADR-v9-78 Punkt 1) — analog deletePlace oben, aber für den
      // Hof-Pfad (event.hofId statt event.placeId).
      db = deleteHofCascade(db, id);
      persistPlaces();
      persistWorkingCopyIfLoaded();
    },
    mergeHof(survivorId, mergedIds) {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextHofs = new Map(db.hofObjects);
      const remap = mergeHofObjects(nextHofs, survivorId, mergedIds);
      db = applyHofRemap({ ...db, hofObjects: nextHofs }, remap);
      persistPlaces();
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
      db = nextDb;
      persistWorkingCopyIfLoaded();
      // Bewusst NICHT unbedingt persistPlaces() — der Aufrufer hat den importierten Stand
      // bereits gespeichert (s. Interface-Doku). Nur bei Wachstum durch die
      // Reklassifikation selbst (Village-Seed/Hof-Bootstrap) erneut speichern.
      if (resolution.hofObjectsGrew || resolution.placeObjectsGrew) persistPlaces();
    },
    savePerson(model) {
      db = { ...db, individuals: savePersonCmd(db.individuals, model) };
      persistWorkingCopyIfLoaded();
    },
    deletePerson(id) {
      db = { ...db, individuals: deletePersonCmd(db.individuals, id) };
      persistWorkingCopyIfLoaded();
    },
    saveFamily(model) {
      // saveFamilyCmd führt die INDI-Seite (Person.parentIn/childOf) synchron nach
      // (Spec 10 INV-P3) und liefert deshalb ein vollständiges neues Database zurück —
      // beide betroffenen Maps (individuals + families) kommen fertig daraus.
      db = saveFamilyCmd(db, model);
      persistWorkingCopyIfLoaded();
    },
    deleteFamily(id) {
      db = deleteFamilyCmd(db, id);
      persistWorkingCopyIfLoaded();
    },
    saveSource(model) {
      db = { ...db, sources: saveSourceCmd(db.sources, model) };
      persistWorkingCopyIfLoaded();
    },
    deleteSource(id) {
      db = { ...db, sources: deleteSourceCmd(db.sources, id) };
      persistWorkingCopyIfLoaded();
    },
    saveRepository(model) {
      db = { ...db, repositories: saveRepositoryCmd(db.repositories, model) };
      persistWorkingCopyIfLoaded();
    },
    deleteRepository(id) {
      db = { ...db, repositories: deleteRepositoryCmd(db.repositories, id) };
      persistWorkingCopyIfLoaded();
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
      db = next;
      persistWorkingCopyIfLoaded();
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
      db = next;
      persistWorkingCopyIfLoaded();
      return true;
    },
    touch() {
      // db ist $state.raw — eine flache Kopie reicht, um Svelte's Reaktivität
      // auszulösen (Referenzänderung), ohne die Map-Identitäten (individuals/families/…)
      // unnötig zu klonen.
      db = { ...db };
      persistWorkingCopyIfLoaded();
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
      applyEdit(addLogEntryCmd(db, kind, entityId, entry));
    },
    updateLogEntry(kind, entityId, index, entry) {
      applyEdit(updateLogEntryCmd(db, kind, entityId, index, entry));
    },
    deleteLogEntry(kind, entityId, index) {
      applyEdit(deleteLogEntryCmd(db, kind, entityId, index));
    },
    addHypothesis(kind, entityId, id, patch, now) {
      applyEdit(addHypothesisCmd(db, kind, entityId, id, patch, now));
    },
    updateHypothesis(kind, entityId, id, patch) {
      applyEdit(updateHypothesisCmd(db, kind, entityId, id, patch));
    },
    deleteHypothesis(kind, entityId, id) {
      applyEdit(deleteHypothesisCmd(db, kind, entityId, id));
    },
  };
}
