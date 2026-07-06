// ui/shell/app-state.svelte.ts — reaktiver App-Zustand der UI-Schale (Spec 02 §3).
//
// Hält die EINE geladene Datenbank + den daraus abgeleiteten PlaceContext (Chokepoint-
// Zugriff, Spec 11 §5). Reagiert der Kern nicht selbst (er hat keine Stores/Signals,
// Spec 02 §3) — die Schale liest ihn über die definierten Chokepoints und hält eine
// reaktive Referenz. Ein Kommando (hier: Import) → Chokepoints neu lesen → Views
// aktualisieren sich automatisch (ein Pfad, kein zweiter Render-Trigger nötig).
import type { Database, PlaceId, HofId, PersonId, FamilyId, Person, Family } from '../../core/model/types';
import type { PlaceObject, HofObject } from '../../core/places';
import {
  makeDatabase,
  savePerson as savePersonCmd,
  deletePerson as deletePersonCmd,
  saveFamily as saveFamilyCmd,
  deleteFamily as deleteFamilyCmd,
} from '../../core/model';
import {
  makePlaceRegistry,
  makeHofRegistry,
  savePlaceObject,
  deletePlaceObject,
  saveHofObject,
  deleteHofObject,
  mergePlaceObjects,
  type PlaceContext,
} from '../../core/places';
import type { TaskStatus } from '../../core/research/types';
import type { TaskEntityKind } from '../views/tasks/tasks-model';
import {
  addTask as addTaskCmd,
  updateTask as updateTaskCmd,
  setTaskStatusById,
  deleteTask as deleteTaskCmd,
} from '../views/tasks/tasks-commands';

export interface AppState {
  /** Aktuell geladene Datenbank (leer, bis eine Datei importiert wurde). */
  readonly db: Database;
  /** Abgeleiteter Orts-/Hof-Chokepoint-Kontext, immer zur aktuellen db passend. */
  readonly placeContext: PlaceContext;
  /** Dateiname der zuletzt importierten Datei (leer = noch nichts geladen). */
  readonly fileName: string;
  /** Kommando: ersetzt die Datenbank (z. B. nach parseGedcom) — der EINE Ladepfad. */
  loadDatabase(db: Database, fileName: string): void;
  /** Kommando: Upsert eines PlaceObject (`savePlaceObject(model)`-Muster, Spec 20 §1.7 [K]). */
  savePlace(model: PlaceObject): void;
  /** Kommando: entfernt ein PlaceObject. */
  deletePlace(id: PlaceId): void;
  /**
   * Kommando: Upsert einer Person (`savePerson(model)`-Muster, Spec 20 §2). Bewusst OHNE
   * Relationship-Graph-Seiteneffekte (childOf/parentIn/Family.children/husband/wife) —
   * Beziehungen bearbeiten ist ein separates Folge-Feature (core/model/commands.ts). Auch
   * OHNE persistPlaces-artigen Persistenz-Callback: Genealogie-Arbeitskopie/-Export ist
   * bewusst NICHT Teil dieser Scheibe — Edits bleiben bis zum nächsten Reload in-memory.
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
  /** Kommando: Dubletten-Merge — führt `mergedId` in `survivorId` zusammen (Spec 20 §1.7 [K]). */
  mergePlace(survivorId: PlaceId, mergedId: PlaceId): void;
  /** Kommando: Upsert eines HofObject (Spec 20 §1.8 [K]). */
  saveHof(model: HofObject): void;
  /** Kommando: entfernt ein HofObject. */
  deleteHof(id: HofId): void;
  /**
   * Kommando: erzwingt eine Reaktivitäts-Aktualisierung nach einer In-Place-Mutation an
   * Event-Feldern (z. B. `linkEventToPlace`, das Person-/Family-Events mutiert, die NICHT
   * über eine eigene Map-Struktur laufen wie placeObjects/hofObjects). Ein Kommando →
   * Chokepoints neu lesen → Views aktualisieren sich (Spec 02 §3, EIN Pfad).
   */
  touch(): void;
  /**
   * Kommando: legt eine neue Aufgabe an einer Person ODER Familie an (Spec 20 §1.11 [K]).
   * `taskId`/`now` werden vom Aufrufer injiziert (TST-3, analog `newTaskId()`/Uhrzeit in
   * TasksView.svelte) — kein Date.now()/Math.random() innerhalb dieses Kommandos selbst.
   */
  addTask(kind: TaskEntityKind, entityId: PersonId | FamilyId, taskId: string, text: string, category: string, now: string): void;
  /** Kommando: ersetzt Text/Kategorie einer bestehenden Aufgabe vollständig. */
  updateTask(kind: TaskEntityKind, entityId: PersonId | FamilyId, taskId: string, text: string, category: string): void;
  /** Kommando: setzt den Kanban-Status einer Aufgabe (hält `done` synchron). */
  setTaskStatus(kind: TaskEntityKind, entityId: PersonId | FamilyId, taskId: string, status: TaskStatus): void;
  /** Kommando: entfernt eine Aufgabe. */
  deleteTask(kind: TaskEntityKind, entityId: PersonId | FamilyId, taskId: string): void;
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
}

export function createAppState(opts: CreateAppStateOptions = {}): AppState {
  let db = $state.raw<Database>(makeDatabase());
  let fileName = $state('');
  const placeContext = $derived.by<PlaceContext>(() => ({
    places: makePlaceRegistry(db.placeObjects),
    hofs: makeHofRegistry(db.hofObjects),
  }));
  const persistPlaces = (): void => opts.persistPlaces?.(db.placeObjects, db.hofObjects);

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
    loadDatabase(nextDb, nextFileName) {
      db = nextDb;
      fileName = nextFileName;
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
    mergePlace(survivorId, mergedId) {
      // Merge berührt BEIDE Maps (pnames-Fold + Referenz-Umhängung in hofObjects.villageId).
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextPlaces = new Map(db.placeObjects);
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextHofs = new Map(db.hofObjects);
      mergePlaceObjects(nextPlaces, nextHofs, survivorId, mergedId);
      db = { ...db, placeObjects: nextPlaces, hofObjects: nextHofs };
      persistPlaces();
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
    savePerson(model) {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextIndividuals = new Map(db.individuals);
      savePersonCmd(nextIndividuals, model);
      db = { ...db, individuals: nextIndividuals };
    },
    deletePerson(id) {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextIndividuals = new Map(db.individuals);
      deletePersonCmd(nextIndividuals, id);
      db = { ...db, individuals: nextIndividuals };
    },
    saveFamily(model) {
      // saveFamilyCmd mutiert db.individuals (childOf/parentIn) UND db.families in-place
      // (Spec 10 INV-P3) — die abschließende Reassign-Zeile löst Svelte's Reaktivität an
      // BEIDEN betroffenen Maps aus (analog addTask's "Kommando mutiert ... in-place"-Muster).
      saveFamilyCmd(db, model);
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      db = { ...db, individuals: new Map(db.individuals), families: new Map(db.families) };
    },
    deleteFamily(id) {
      deleteFamilyCmd(db, id);
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      db = { ...db, families: new Map(db.families) };
    },
    touch() {
      // db ist $state.raw — eine flache Kopie reicht, um Svelte's Reaktivität
      // auszulösen (Referenzänderung), ohne die Map-Identitäten (individuals/families/…)
      // unnötig zu klonen.
      db = { ...db };
    },
    addTask(kind, entityId, taskId, text, category, now) {
      // Kommando mutiert Person/Family.tasks[] in-place (analog linkEventToPlace oben) —
      // die abschließende Reassign-Zeile löst Svelte's Reaktivität aus (EIN Pfad, Spec 02 §3).
      addTaskCmd(db, kind, entityId, taskId, text, category, now);
      db = { ...db };
    },
    updateTask(kind, entityId, taskId, text, category) {
      updateTaskCmd(db, kind, entityId, taskId, text, category);
      db = { ...db };
    },
    setTaskStatus(kind, entityId, taskId, status) {
      setTaskStatusById(db, kind, entityId, taskId, status);
      db = { ...db };
    },
    deleteTask(kind, entityId, taskId) {
      deleteTaskCmd(db, kind, entityId, taskId);
      db = { ...db };
    },
  };
}
