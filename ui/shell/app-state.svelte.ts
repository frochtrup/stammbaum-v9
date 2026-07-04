// ui/shell/app-state.svelte.ts — reaktiver App-Zustand der UI-Schale (Spec 02 §3).
//
// Hält die EINE geladene Datenbank + den daraus abgeleiteten PlaceContext (Chokepoint-
// Zugriff, Spec 11 §5). Reagiert der Kern nicht selbst (er hat keine Stores/Signals,
// Spec 02 §3) — die Schale liest ihn über die definierten Chokepoints und hält eine
// reaktive Referenz. Ein Kommando (hier: Import) → Chokepoints neu lesen → Views
// aktualisieren sich automatisch (ein Pfad, kein zweiter Render-Trigger nötig).
import type { Database, PlaceId, HofId, PersonId, FamilyId } from '../../core/model/types';
import type { PlaceObject, HofObject } from '../../core/places';
import { makeDatabase } from '../../core/model';
import {
  makePlaceRegistry,
  makeHofRegistry,
  savePlaceObject,
  deletePlaceObject,
  saveHofObject,
  deleteHofObject,
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
export function createAppState(): AppState {
  let db = $state.raw<Database>(makeDatabase());
  let fileName = $state('');
  const placeContext = $derived.by<PlaceContext>(() => ({
    places: makePlaceRegistry(db.placeObjects),
    hofs: makeHofRegistry(db.hofObjects),
  }));

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
    },
    deletePlace(id) {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextPlaces = new Map(db.placeObjects);
      deletePlaceObject(nextPlaces, id);
      db = { ...db, placeObjects: nextPlaces };
    },
    saveHof(model) {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextHofs = new Map(db.hofObjects);
      saveHofObject(nextHofs, model);
      db = { ...db, hofObjects: nextHofs };
    },
    deleteHof(id) {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextHofs = new Map(db.hofObjects);
      deleteHofObject(nextHofs, id);
      db = { ...db, hofObjects: nextHofs };
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
