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

import {
  isEntityTarget,
  isLensTarget,
  isResearchTarget,
  type EntityTargetId,
  type LensTargetId,
  type MapModeId,
  type ResearchSegmentId,
  type TimelineModeId,
  type RouteTarget,
} from './nav-model';

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
  /**
   * Zuletzt offene Lens — welche Ansicht der Baum-Slot zeigt.
   *
   * Exakt derselbe Merker-Gedanke wie `entityTarget` eine Ebene darüber, für die zweite
   * Gruppe von Zielen, die sich EINEN Bottom-Nav-Slot teilen (Baum/Karte/Zeitleiste,
   * `LENS_SLOT_TARGETS`). Ohne ihn führte der Baum-Slot stur auf den Baum zurück, auch
   * wenn der Nutzer zuletzt in der Karte war — ein Vor-/Zurückspringen zwischen zwei
   * Ansichten war damit unmöglich, und die Lens-Gruppe verhielt sich anders als die
   * Entitäts-Gruppe direkt daneben (ADR-v9-102).
   */
  readonly lensTarget: LensTargetId;
  /**
   * Zuletzt offenes Forschungsziel — welche Fläche die Forschungs-Gruppe zeigt.
   *
   * Dritte Ausprägung desselben Merkers (Aufgaben · Protokoll · Hypothesen · Dashboard),
   * exakt parallel zu `entityTarget`/`lensTarget`: seit ADR-v9-116 sind die vier Flächen
   * erstklassige Nav-Ziele der Rolle 'research', und dieser Merker wird — wie
   * `entityTarget` — ausschließlich über `setTarget()` gepflegt (kein Sonder-Setter mehr).
   * Lag bis ADR-v9-102 als komponenten-lokales `$state` in ResearchTab.svelte und fiel
   * deshalb bei jedem Verlassen der Fläche auf "Aufgaben" zurück.
   */
  readonly researchTarget: ResearchSegmentId;
  /**
   * Anzeige-Modus der Karte- bzw. Zeitleiste-Lens.
   *
   * Vierte und fünfte Ausprägung desselben Merkers. Ohne sie fiel die Karte bei jeder
   * Rückkehr auf "Orte" zurück — was die (inzwischen erhaltene) Personenauswahl der
   * Karte unsichtbar machte, weil sie nur im Personen-Modus gezeigt wird. Ein halb
   * erhaltener Zustand ist aus Nutzersicht kein erhaltener Zustand.
   */
  readonly mapMode: MapModeId;
  readonly timelineMode: TimelineModeId;
  /** Ziel setzen; ist es ein Entitäts-/Lens-Ziel, zieht der jeweilige Merker mit. */
  setTarget(target: RouteTarget): void;
  /** Zurück in die Entitäten-Fläche, auf das zuletzt dort offene Segment. */
  openEntities(): void;
  /** Zurück in die Lens-Fläche, auf die zuletzt dort offene Ansicht. */
  openLens(): void;
  /** Zurück in die Forschungs-Fläche, auf das zuletzt dort offene Ziel. */
  openResearch(): void;
  /** Anzeige-Modus der Karte-Lens wechseln (merkt ihn sich für den Rückweg). */
  setMapMode(mode: MapModeId): void;
  /** Anzeige-Modus der Zeitleiste-Lens wechseln (merkt ihn sich für den Rückweg). */
  setTimelineMode(mode: TimelineModeId): void;
}

export interface RouteOptions {
  /** Startziel (Default 'person' — Spec 21 §2: Personen ist der Einstieg). */
  target?: RouteTarget;
  /** Start-Segment der Entitäten-Fläche, falls es vom Startziel abweicht. */
  entityTarget?: EntityTargetId;
  /** Start-Lens, falls sie vom Startziel abweicht. */
  lensTarget?: LensTargetId;
  /** Start-Segment der Aufgaben-/Forschungsfläche. */
  researchTarget?: ResearchSegmentId;
  /** Start-Modus der Karte-Lens. */
  mapMode?: MapModeId;
  /** Start-Modus der Zeitleiste-Lens. */
  timelineMode?: TimelineModeId;
}

export function createRoute(options: RouteOptions = {}): Route {
  const initialTarget: RouteTarget = options.target ?? 'person';
  let target = $state<RouteTarget>(initialTarget);
  let entityTarget = $state<EntityTargetId>(
    options.entityTarget ?? (isEntityTarget(initialTarget) ? initialTarget : 'person'),
  );
  let lensTarget = $state<LensTargetId>(
    options.lensTarget ?? (isLensTarget(initialTarget) ? initialTarget : 'tree'),
  );
  let researchTarget = $state<ResearchSegmentId>(
    options.researchTarget ?? (isResearchTarget(initialTarget) ? initialTarget : 'tasks'),
  );
  let mapMode = $state<MapModeId>(options.mapMode ?? 'orte');
  let timelineMode = $state<TimelineModeId>(options.timelineMode ?? 'swim');

  return {
    get target() {
      return target;
    },
    get entityTarget() {
      return entityTarget;
    },
    get lensTarget() {
      return lensTarget;
    },
    get researchTarget() {
      return researchTarget;
    },
    get mapMode() {
      return mapMode;
    },
    get timelineMode() {
      return timelineMode;
    },
    setTarget(next) {
      if (isEntityTarget(next)) entityTarget = next;
      if (isLensTarget(next)) lensTarget = next;
      if (isResearchTarget(next)) researchTarget = next;
      target = next;
    },
    openEntities() {
      target = entityTarget;
    },
    openLens() {
      target = lensTarget;
    },
    openResearch() {
      target = researchTarget;
    },
    setMapMode(next) {
      mapMode = next;
    },
    setTimelineMode(next) {
      timelineMode = next;
    },
  };
}
