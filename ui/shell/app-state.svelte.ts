// ui/shell/app-state.svelte.ts — reaktiver App-Zustand der UI-Schale (Spec 02 §3).
//
// Hält die EINE geladene Datenbank + den daraus abgeleiteten PlaceContext (Chokepoint-
// Zugriff, Spec 11 §5). Reagiert der Kern nicht selbst (er hat keine Stores/Signals,
// Spec 02 §3) — die Schale liest ihn über die definierten Chokepoints und hält eine
// reaktive Referenz. Ein Kommando (hier: Import) → Chokepoints neu lesen → Views
// aktualisieren sich automatisch (ein Pfad, kein zweiter Render-Trigger nötig).
import type {
  Database,
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
  deletePlaceObject,
  saveHofObject,
  deleteHofObject,
  mergePlaceObjects,
  mergeHofObjects,
  type PlaceContext,
  type MergeResult,
} from '../../core/places';
import type { GedNode } from '../../core/interop';
import { applyDatabaseToRoots, serializeGedcom } from '../../core/interop';
import { applyPlaceResolution } from '../../services/places';
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
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextPlaces = new Map(db.placeObjects);
      deletePlaceObject(nextPlaces, id);
      db = { ...db, placeObjects: nextPlaces };
      persistPlaces();
    },
    mergePlace(survivorId, mergedIds): MergeResult {
      // Merge berührt BEIDE Maps (pnames-Fold + Referenz-Umhängung in hofObjects.villageId).
      // `events` versorgt NUR die Gewinner-Heuristik des automatischen Hof-Nachlaufs
      // (ADR-v9-45 Nachtrag) — die Events selbst werden in-place mutiert (event.hofId
      // umgehängt), sie leben unverändert in db.individuals/db.families weiter.
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextPlaces = new Map(db.placeObjects);
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextHofs = new Map(db.hofObjects);
      const events = collectAllEvents(db);
      const result = mergePlaceObjects(nextPlaces, nextHofs, survivorId, mergedIds, events);
      db = { ...db, placeObjects: nextPlaces, hofObjects: nextHofs };
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
    deleteHof(id) {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextHofs = new Map(db.hofObjects);
      deleteHofObject(nextHofs, id);
      db = { ...db, hofObjects: nextHofs };
      persistPlaces();
    },
    mergeHof(survivorId, mergedIds) {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextHofs = new Map(db.hofObjects);
      const events = collectAllEvents(db);
      mergeHofObjects(nextHofs, survivorId, mergedIds, events);
      db = { ...db, hofObjects: nextHofs };
      persistPlaces();
    },
    replacePlacesAndHofs(placeObjects, hofObjects) {
      const nextDb = { ...db, placeObjects, hofObjects };
      // Reklassifiziert ALLE Events der aktuell geladenen Genealogie gegen den neuen
      // Orts-/Hof-Bestand (mutiert individuals/families IN-PLACE, wie mergePlace/mergeHof
      // es bereits mit event.hofId/event.placeId tun — s. Interface-Doku oben). Auf einer
      // leeren db (kein Import geladen) ist dies ein no-op (keine Events zu sammeln).
      const resolution = applyPlaceResolution(nextDb);
      db = nextDb;
      persistWorkingCopyIfLoaded();
      // Bewusst NICHT unbedingt persistPlaces() — der Aufrufer hat den importierten Stand
      // bereits gespeichert (s. Interface-Doku). Nur bei Wachstum durch die
      // Reklassifikation selbst (Village-Seed/Hof-Bootstrap) erneut speichern.
      if (resolution.hofObjectsGrew || resolution.placeObjectsGrew) persistPlaces();
    },
    savePerson(model) {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextIndividuals = new Map(db.individuals);
      savePersonCmd(nextIndividuals, model);
      db = { ...db, individuals: nextIndividuals };
      persistWorkingCopyIfLoaded();
    },
    deletePerson(id) {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextIndividuals = new Map(db.individuals);
      deletePersonCmd(nextIndividuals, id);
      db = { ...db, individuals: nextIndividuals };
      persistWorkingCopyIfLoaded();
    },
    saveFamily(model) {
      // saveFamilyCmd mutiert db.individuals (childOf/parentIn) UND db.families in-place
      // (Spec 10 INV-P3) — die abschließende Reassign-Zeile löst Svelte's Reaktivität an
      // BEIDEN betroffenen Maps aus (analog addTask's "Kommando mutiert ... in-place"-Muster).
      saveFamilyCmd(db, model);
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      db = { ...db, individuals: new Map(db.individuals), families: new Map(db.families) };
      persistWorkingCopyIfLoaded();
    },
    deleteFamily(id) {
      deleteFamilyCmd(db, id);
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      db = { ...db, families: new Map(db.families) };
      persistWorkingCopyIfLoaded();
    },
    saveSource(model) {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextSources = new Map(db.sources);
      saveSourceCmd(nextSources, model);
      db = { ...db, sources: nextSources };
      persistWorkingCopyIfLoaded();
    },
    deleteSource(id) {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextSources = new Map(db.sources);
      deleteSourceCmd(nextSources, id);
      db = { ...db, sources: nextSources };
      persistWorkingCopyIfLoaded();
    },
    saveRepository(model) {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextRepositories = new Map(db.repositories);
      saveRepositoryCmd(nextRepositories, model);
      db = { ...db, repositories: nextRepositories };
      persistWorkingCopyIfLoaded();
    },
    deleteRepository(id) {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextRepositories = new Map(db.repositories);
      deleteRepositoryCmd(nextRepositories, id);
      db = { ...db, repositories: nextRepositories };
      persistWorkingCopyIfLoaded();
    },
    touch() {
      // db ist $state.raw — eine flache Kopie reicht, um Svelte's Reaktivität
      // auszulösen (Referenzänderung), ohne die Map-Identitäten (individuals/families/…)
      // unnötig zu klonen.
      db = { ...db };
      persistWorkingCopyIfLoaded();
    },
    addTask(kind, entityId, taskId, text, category, now, sourceRef) {
      // Kommando mutiert Person/Family.tasks[] in-place (analog linkEventToPlace oben) —
      // die abschließende Reassign-Zeile löst Svelte's Reaktivität aus (EIN Pfad, Spec 02 §3).
      addTaskCmd(db, kind, entityId, taskId, text, category, now, sourceRef);
      db = { ...db };
      persistWorkingCopyIfLoaded();
    },
    updateTask(kind, entityId, taskId, text, category, sourceRef) {
      updateTaskCmd(db, kind, entityId, taskId, text, category, sourceRef);
      db = { ...db };
      persistWorkingCopyIfLoaded();
    },
    setTaskStatus(kind, entityId, taskId, status) {
      setTaskStatusById(db, kind, entityId, taskId, status);
      db = { ...db };
      persistWorkingCopyIfLoaded();
    },
    deleteTask(kind, entityId, taskId) {
      deleteTaskCmd(db, kind, entityId, taskId);
      db = { ...db };
      persistWorkingCopyIfLoaded();
    },
    addLogEntry(kind, entityId, entry) {
      addLogEntryCmd(db, kind, entityId, entry);
      db = { ...db };
      persistWorkingCopyIfLoaded();
    },
    updateLogEntry(kind, entityId, index, entry) {
      updateLogEntryCmd(db, kind, entityId, index, entry);
      db = { ...db };
      persistWorkingCopyIfLoaded();
    },
    deleteLogEntry(kind, entityId, index) {
      deleteLogEntryCmd(db, kind, entityId, index);
      db = { ...db };
      persistWorkingCopyIfLoaded();
    },
    addHypothesis(kind, entityId, id, patch, now) {
      addHypothesisCmd(db, kind, entityId, id, patch, now);
      db = { ...db };
      persistWorkingCopyIfLoaded();
    },
    updateHypothesis(kind, entityId, id, patch) {
      updateHypothesisCmd(db, kind, entityId, id, patch);
      db = { ...db };
      persistWorkingCopyIfLoaded();
    },
    deleteHypothesis(kind, entityId, id) {
      deleteHypothesisCmd(db, kind, entityId, id);
      db = { ...db };
      persistWorkingCopyIfLoaded();
    },
  };
}
