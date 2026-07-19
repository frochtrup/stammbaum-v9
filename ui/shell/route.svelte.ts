// ui/shell/route.svelte.ts — die EINE Routen-Quelle (Spec 21 §3, INV-UI-15).
//
// Welches Navigationsziel ist gerade aktiv? Vor BL-90 beantworteten das DREI
// unabhängige Zustände: `activeTarget` in App.svelte, `activeSegment` in
// EntityTab.svelte und `openEntry` in MoreView.svelte. Keiner kannte die anderen —
// weshalb die Desktop-Sidebar (Spec 21 §3), die alle drei Ebenen in EINER flachen
// Liste zeigt, ohne eine zweite Navigationsquelle nicht baubar war (ADR-v9-101).
//
// Verhältnis zu ViewState (view-state.svelte.ts, INV-VS): das sind zwei verschiedene
// Fragen, bewusst getrennt. ViewState beantwortet "WELCHE Person/welcher Ort ist
// ausgewählt" (Auswahl je Ziel), Route beantwortet "WELCHES Ziel ist offen". Die
// Personenliste ohne ausgewählte Person ist Route='person' + ViewState.person=null —
// eine Zusammenlegung würde genau diesen Zustand unausdrückbar machen.
//
// Analog zu createViewState() KEIN Modul-Singleton: der App-Einstieg erzeugt genau eine
// Instanz und reicht sie durch, damit Komponententests eine frische, isolierte Instanz
// bekommen (kein Test-Leck über globalen Modul-State).

import { isEntityTarget, type EntityTargetId, type RouteTarget } from './nav-model';

export interface Route {
  /** Aktuell offenes Ziel (reaktiv aus Svelte-Komponenten heraus lesbar). */
  readonly target: RouteTarget;
  /**
   * Zuletzt offenes Entitäts-Ziel — welches Segment die Entitäten-Fläche zeigt.
   *
   * Eigener Merker statt "aus target ableiten", weil `target` beim Sprung in Baum/
   * Karte/Mehr das Entitäts-Ziel verlässt: ohne ihn landete der Rückweg über den
   * Personen-Slot immer auf "Personen", auch wenn der Nutzer aus "Orte" kam. Vor BL-90
   * leistete das die Neuableitung aus der ViewState-Auswahl beim Remount von
   * EntityTab (`initialSegment()`) — die aber nur griff, wenn dort auch etwas
   * AUSGEWÄHLT war: wer die Orte-LISTE ohne Auswahl durchblätterte und einmal in den
   * Baum sprang, kam auf "Personen" zurück. Der Merker behebt das nebenbei.
   */
  readonly entityTarget: EntityTargetId;
  /** Ziel setzen; ist es ein Entitäts-Ziel, zieht `entityTarget` mit. */
  setTarget(target: RouteTarget): void;
  /** Zurück in die Entitäten-Fläche, auf das zuletzt dort offene Segment. */
  openEntities(): void;
}

export interface RouteOptions {
  /** Startziel (Default 'person' — Spec 21 §2: Personen ist der Einstieg). */
  target?: RouteTarget;
  /** Start-Segment der Entitäten-Fläche, falls es vom Startziel abweicht. */
  entityTarget?: EntityTargetId;
}

export function createRoute(options: RouteOptions = {}): Route {
  const initialTarget: RouteTarget = options.target ?? 'person';
  let target = $state<RouteTarget>(initialTarget);
  let entityTarget = $state<EntityTargetId>(
    options.entityTarget ?? (isEntityTarget(initialTarget) ? initialTarget : 'person'),
  );

  return {
    get target() {
      return target;
    },
    get entityTarget() {
      return entityTarget;
    },
    setTarget(next) {
      if (isEntityTarget(next)) entityTarget = next;
      target = next;
    },
    openEntities() {
      target = entityTarget;
    },
  };
}
