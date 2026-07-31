// app-orte/orte-state.svelte.ts — der Zustand des Orte-Editors (OE-3, Spec 22 §3/§4).
//
// Erfüllt `PlacesHost` (ui/shell/places-host.ts) und ist damit für die geteilten
// Orts-/Hof-Views austauschbar mit der Schale des Hauptprogramms — dieselben Komponenten,
// zwei Wirte, keine Kopie (INV-ORTE-1).
//
// Was hier ANDERS ist als im Hauptprogramm, und warum:
//   - `db` ist eine leere `makeDatabase()` plus die geladenen Orts-/Hofmengen. Ohne
//     Kontextdatei gibt es keine Personen/Familien und damit keine Ereignisse — genau der
//     Zustand, für den `caps.hasEventContext` steht (D1–D4, Spec 22 §3.1).
//   - Persistiert wird NICHTS im Hintergrund (INV-ORTE-3): kein orte.json-Spiegel, keine
//     Arbeitskopie. Jedes Kommando markiert das Dokument als geändert und schreibt einen
//     Absturz-Entwurf; gespeichert wird nur auf ausdrückliche Nutzeraktion.
//   - Die Kommando-Rümpfe sind bewusst dieselben wie in `ui/shell/app-state.svelte.ts`
//     (Copy-on-Write über `core/places`-Kommandos). Sie werden hier nicht neu erfunden,
//     nur ohne die Persistenz-Seitenkanäle des Hauptprogramms aufgerufen.

import type { Database, Event, HofId, PlaceId } from '../core/model/types';
import { makeDatabase } from '../core/model/factory';
import { editDatabase, mapAllEvents } from '../core/model/draft';
import {
  applyGovEntry,
  linkEventToHof as linkEventToHofCmd,
  linkEventToPlace as linkEventToPlaceCmd,
  makeHofRegistry,
  makePlaceRegistry,
  mergeHofObjects,
  mergePlaceObjects,
  moveHofToVillage,
  parseGovText,
  saveHofObject,
  savePlaceObject,
  withUpdatedHofAddr,
  type GovApplyResult,
  type HofObject,
  type MergeResult,
  type MoveHofResult,
  type PlaceContext,
  type PlaceObject
} from '../core/places';
import {
  deleteHofCascade,
  deletePlaceCascade,
  relinkHofVillageInEvents,
  renameHofAddrInEvents
} from '../services/places';
import { createUndoStack } from '../services/undo';
import { collectAllEvents } from '../ui/shell/all-events';
import type { PlacesHost, PlacesHostCaps } from '../ui/shell/places-host';
import type { OrteContent } from './orte-doc';

/**
 * Fähigkeiten des Editors. `canEditEvents`/`canNavigateToLens` sind KONSTANT falsch — er
 * schreibt keine Genealogie-Datei und hat keine Linsen. `hasEventContext` folgt der
 * optional geladenen Kontextdatei (Spec 22 §5).
 */
function capsFor(hasEventContext: boolean): PlacesHostCaps {
  return { hasEventContext, canEditEvents: false, canNavigateToLens: false };
}

export interface OrteHost extends PlacesHost {
  /** Ungespeicherte Änderungen seit dem letzten Speichern/Laden. */
  readonly dirty: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Setzt den Bestand — Laden einer Datei oder ein frisch angelegtes Dokument. */
  loadContent(content: OrteContent): void;
  /** Übernimmt Personen/Familien einer NUR LESEND geladenen Kontextdatei (Spec 22 §5). */
  setEventContext(source: Database | null): void;
  /** Der aktuelle Bestand als Dokument-Inhalt — die Form, die gespeichert wird. */
  content(): OrteContent;
  /** Nach erfolgreichem Speichern: das Dokument gilt wieder als unverändert. */
  markSaved(): void;
  undo(): boolean;
  redo(): boolean;
}

export interface OrteHostOptions {
  /** Wird nach jeder Änderung gerufen — der Aufrufer schreibt daraus den Entwurf (OE-4). */
  onChanged?: (content: OrteContent) => void;
}

export function createOrteHost(opts: OrteHostOptions = {}): OrteHost {
  let db = $state.raw<Database>(makeDatabase());
  let dirty = $state(false);
  let hasEventContext = $state(false);
  let canUndo = $state(false);
  let canRedo = $state(false);

  const undoStack = createUndoStack();
  const syncUndoFlags = () => {
    canUndo = undoStack.canUndo;
    canRedo = undoStack.canRedo;
  };

  const placeContext = $derived<PlaceContext>({
    places: makePlaceRegistry(db.placeObjects),
    hofs: makeHofRegistry(db.hofObjects)
  });

  const content = (): OrteContent => ({ placeObjects: db.placeObjects, hofObjects: db.hofObjects });

  /**
   * DER Chokepoint jeder Änderung — dieselbe Rolle wie `commit` im Hauptprogramm: Undo
   * ablegen, Zustand ersetzen, Folgewirkung auslösen. Dass die Ablage untrennbar an der
   * Zuweisung hängt, ist Absicht: ein Kommando, das sie vergisst, ließe sich stillschweigend
   * nicht zurücknehmen.
   */
  const commit = (next: Database): void => {
    undoStack.push(db);
    syncUndoFlags();
    db = next;
    dirty = true;
    opts.onChanged?.(content());
  };

  const applyHofRemap = (base: Database, remap: ReadonlyMap<HofId, HofId>): Database => {
    if (remap.size === 0) return base;
    return mapAllEvents(base, (ev) => {
      const target = ev.hofId != null ? remap.get(ev.hofId) : undefined;
      return target === undefined ? null : { ...ev, hofId: target };
    });
  };

  return {
    get db() {
      return db;
    },
    get placeContext() {
      return placeContext;
    },
    get caps() {
      return capsFor(hasEventContext);
    },
    get dirty() {
      return dirty;
    },
    get canUndo() {
      return canUndo;
    },
    get canRedo() {
      return canRedo;
    },

    loadContent(next) {
      db = { ...db, placeObjects: next.placeObjects, hofObjects: next.hofObjects };
      undoStack.clear();
      syncUndoFlags();
      dirty = false;
    },

    setEventContext(source) {
      // NUR LESEND (INV-ORTE-2): übernommen werden Personen/Familien der Kontextdatei,
      // das Dokument (placeObjects/hofObjects) bleibt unangetastet. Ein `null` entfernt
      // den Kontext wieder — die ereignisabhängigen Flächen verschwinden dann.
      db = {
        ...db,
        // Plain Map, keine SvelteMap: `db` ist $state.raw — die Reaktivität läuft über die
        // db-Referenzänderung in commit(), nicht über Map-Interna. Gleiche Wahl und gleiche
        // Begründung wie in ui/shell/app-state.svelte.ts.
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        individuals: source ? source.individuals : new Map(),
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        families: source ? source.families : new Map()
      };
      hasEventContext = source !== null;
    },

    content,
    markSaved() {
      dirty = false;
    },

    savePlace(model: PlaceObject) {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextPlaces = new Map(db.placeObjects);
      savePlaceObject(nextPlaces, model);
      commit({ ...db, placeObjects: nextPlaces });
    },

    importGovEntry(placeId: PlaceId, rawText: string): GovApplyResult | null {
      const entry = parseGovText(rawText);
      if (!entry || !entry.govId) return null;
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextPlaces = new Map(db.placeObjects);
      const target = nextPlaces.get(placeId);
      if (!target) return null;
      // `?? []`: `translations` ist ein nachträglich hinzugekommenes, abwärtskompatibles
      // orte.json-Feld — an einem aus einer älteren Datei geladenen Objekt fehlt es, und
      // ein nacktes `[...undefined]` wirft. Genau der Fall, den ein Datei-Editor häufiger
      // sieht als das Hauptprogramm: er bekommt fremde Dateien beliebigen Alters.
      nextPlaces.set(placeId, {
        ...target,
        pnames: [...(target.pnames ?? [])],
        translations: [...(target.translations ?? [])],
        enclosedBy: [...(target.enclosedBy ?? [])],
        govTypes: target.govTypes ? [...target.govTypes] : null
      });
      const result = applyGovEntry(nextPlaces, placeId, entry);
      if (!result || result.changes === 0) return result;
      commit({ ...db, placeObjects: nextPlaces });
      return result;
    },

    deletePlace(id: PlaceId) {
      commit(deletePlaceCascade(db, id));
    },

    mergePlace(survivorId: PlaceId, mergedIds: PlaceId | readonly PlaceId[]): MergeResult {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextPlaces = new Map(db.placeObjects);
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextHofs = new Map(db.hofObjects);
      const result = mergePlaceObjects(nextPlaces, nextHofs, survivorId, mergedIds, collectAllEvents(db));
      commit(applyHofRemap({ ...db, placeObjects: nextPlaces, hofObjects: nextHofs }, result.hofRemap));
      return result;
    },

    saveHof(model: HofObject) {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextHofs = new Map(db.hofObjects);
      saveHofObject(nextHofs, model);
      commit({ ...db, hofObjects: nextHofs });
    },

    updateHofAddr(hofId: HofId, index: number, value: string, from: number | null, to: number | null) {
      const hof = db.hofObjects.get(hofId);
      if (!hof) return;
      const oldValue = hof.addrs[index]?.value;
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextHofs = new Map(db.hofObjects);
      saveHofObject(nextHofs, withUpdatedHofAddr(hof, index, value, from, to));
      let nextDb: Database = { ...db, hofObjects: nextHofs };
      const newValue = value.trim();
      // Nur ein tatsächlicher Namenswechsel ist eine Umbenennung; reine from/to-Änderungen
      // propagieren nicht (ADR-v9-81). Ohne Kontextdatei ist der Nachlauf ein No-op — es
      // gibt keine Ereignisse, die den alten Wert tragen.
      if (oldValue !== undefined && newValue !== '' && oldValue !== newValue) {
        nextDb = renameHofAddrInEvents(nextDb, hofId, oldValue, newValue);
      }
      commit(nextDb);
    },

    moveHof(hofId: HofId, villageId: PlaceId): MoveHofResult {
      // Identisch zum Hauptprogramm — nur ohne dessen Persistenz-Seitenkanäle. Ohne
      // Kontextdatei ist der Ereignis-Nachlauf ein No-op (es gibt keine Ereignisse);
      // die Kollisions-Konsolidierung im Zieldorf greift trotzdem, denn sie ist eine
      // Aussage über den Bestand, nicht über die Ereignisse.
      // Plain Map, keine SvelteMap: s. Begründung oben.
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextHofs = new Map(db.hofObjects);
      const result = moveHofToVillage(nextHofs, hofId, villageId, collectAllEvents(db));
      commit(relinkHofVillageInEvents({ ...db, hofObjects: nextHofs }, hofId, villageId, result.remap));
      return result;
    },

    deleteHof(id: HofId) {
      commit(deleteHofCascade(db, id));
    },

    mergeHof(survivorId: HofId, mergedIds: HofId | readonly HofId[]) {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const nextHofs = new Map(db.hofObjects);
      const remap = mergeHofObjects(nextHofs, survivorId, mergedIds);
      commit(applyHofRemap({ ...db, hofObjects: nextHofs }, remap));
    },

    linkEventToPlace(event: Event, placeId: PlaceId): boolean {
      const ctx = placeContext;
      let applied = false;
      const next = editDatabase(db, (d) => {
        const ev = d.event(event);
        if (!ev) return;
        linkEventToPlaceCmd(ev, placeId, ctx);
        applied = true;
      });
      if (!applied) return false;
      commit(next);
      return true;
    },

    linkEventToHof(event: Event, hofId: HofId, villageId?: PlaceId): boolean {
      const ctx = placeContext;
      let applied = false;
      const next = editDatabase(db, (d) => {
        const ev = d.event(event);
        if (!ev) return;
        // Dorf-Anker VOR der Reprojektion setzen — in derselben Draft-Transaktion bleibt
        // die Verknüpfung atomar (ADR-v9-19), wie im Hauptprogramm.
        if (villageId !== undefined) ev.placeId = villageId;
        linkEventToHofCmd(ev, hofId, ctx);
        applied = true;
      });
      if (!applied) return false;
      commit(next);
      return true;
    },

    undo() {
      const previous = undoStack.undo(db);
      if (previous === null) return false;
      syncUndoFlags();
      db = previous;
      dirty = true;
      opts.onChanged?.(content());
      return true;
    },

    redo() {
      const next = undoStack.redo(db);
      if (next === null) return false;
      syncUndoFlags();
      db = next;
      dirty = true;
      opts.onChanged?.(content());
      return true;
    }
  };
}
