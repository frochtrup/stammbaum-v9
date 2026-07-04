// ui/shell/app-state.svelte.ts — reaktiver App-Zustand der UI-Schale (Spec 02 §3).
//
// Hält die EINE geladene Datenbank + den daraus abgeleiteten PlaceContext (Chokepoint-
// Zugriff, Spec 11 §5). Reagiert der Kern nicht selbst (er hat keine Stores/Signals,
// Spec 02 §3) — die Schale liest ihn über die definierten Chokepoints und hält eine
// reaktive Referenz. Ein Kommando (hier: Import) → Chokepoints neu lesen → Views
// aktualisieren sich automatisch (ein Pfad, kein zweiter Render-Trigger nötig).
import type { Database } from '../../core/model/types';
import { makeDatabase } from '../../core/model';
import { makePlaceRegistry, makeHofRegistry, type PlaceContext } from '../../core/places';

export interface AppState {
  /** Aktuell geladene Datenbank (leer, bis eine Datei importiert wurde). */
  readonly db: Database;
  /** Abgeleiteter Orts-/Hof-Chokepoint-Kontext, immer zur aktuellen db passend. */
  readonly placeContext: PlaceContext;
  /** Dateiname der zuletzt importierten Datei (leer = noch nichts geladen). */
  readonly fileName: string;
  /** Kommando: ersetzt die Datenbank (z. B. nach parseGedcom) — der EINE Ladepfad. */
  loadDatabase(db: Database, fileName: string): void;
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
  };
}
