// ui/shell/nav-history.svelte.ts — Zurück/Vorwärts über die EINE Routen-Quelle
// (Spec 20 §1.1 „History-Navigation (Zurück/Vorwärts, herkunftsbewusst)", Spec 21 §2/§3,
// BL-07, ADR-v9-177).
//
// WAS „HERKUNFTSBEWUSST" HEISST: der Rückweg führt dorthin, wo der Nutzer HERKAM — nicht
// auf eine fest verdrahtete Fläche. Bis BL-07 hieß der Knopf im Detail-Kopf „← Zur Liste"
// und tat genau das: wer von Person A über eine Ereigniszeile zu Ort B und von dort zu
// Person C sprang, landete beim Zurück in der Personenliste statt bei Person A.
//
// WARUM DAS ERST JETZT GEHT: ein Stack braucht eine Quelle, die den vollständigen
// Navigationszustand kennt. Bis BL-90 lag der auf drei unabhängige Zustände verteilt
// (App `activeTarget`, EntityTab `activeSegment`, MoreView `openEntry`) — deshalb steht in
// INV-UI-15 ausdrücklich, die eine Routen-Quelle sei „zugleich die Voraussetzung für die
// History-Navigation". Diese Datei ist die Einlösung.
//
// WIE ES SICH VON v8 UNTERSCHEIDET (bewusst, Altlast §10): v8 rief `_beforeDetailNavigate()`
// am Anfang JEDER `show*`-Funktion auf, führte `pushHistory=true/false` durch alle
// Aufrufer und rüstete drei Kopfzeilen (Detail, Zeitleiste, Story) mit je einem eigenen
// Trio ← / ▾ / → aus — neun Bedienelemente für eine Funktion, plus ein
// `_captureCurrentNavState()`, das den Zustand aus CSS-Klassen des DOM zurückrechnete.
// Hier wird stattdessen BEOBACHTET: `record()` verbucht den aktuellen Stand und ist
// idempotent, wenn er dem obersten Punkt entspricht. Damit braucht kein Aufrufer ein
// Flag — nach `back()` ist der wiederhergestellte Punkt bereits der aktuelle, das
// erneute `record()` des beobachtenden Effekts läuft ins Leere.
//
// Bauform wie createRoute()/createViewState(): KEIN Modul-Singleton, damit Tests eine
// frische, isolierte Instanz bekommen.
//
// NICHT PERSISTIERT: der Verlauf ist Sitzungszustand wie der Proband (Spec 30 §2.2
// „Nicht persistiert"). v8 legte ihn in `sessionStorage` ab und stellte beim Start den
// letzten Punkt wieder her — das ist eine zweite, konkurrierende Antwort auf die Frage
// „wo startet die App", neben der Ableitung aus der ViewState-Auswahl (App.svelte
// `initialEntityTarget`). Eine reicht.
import type { RouteTarget } from './nav-model';
import { isEntityTarget, isLensTarget } from './nav-model';
import type { Route } from './route.svelte';
import type { ViewState, ViewTarget } from './view-state.svelte';

/**
 * Ein Punkt im Verlauf: welches Ziel war offen, und was war dort ausgewählt.
 *
 * Die Auswahl gehört dazu, sonst wäre „zurück" innerhalb derselben Fläche wirkungslos —
 * Person A → Person C ist ein Ortswechsel, obwohl das Ziel beide Male 'person' heißt.
 */
export interface NavPoint {
  target: RouteTarget;
  /** Auswahl je zuständigem ViewState-Slot (s. `slotsFor`). */
  sel: Record<string, string | null>;
}

/**
 * Welche ViewState-Slots gehören zu diesem Ziel?
 *
 * - Entitäten: der gleichnamige Slot. **Quellen** führen zwei — das Segment zeigt
 *   wahlweise eine Quelle oder ein Archiv (`RepositoryDetail`), und ein Rückweg, der das
 *   Archiv vergisst, landete auf der Quellenliste statt beim Archiv.
 * - Lenses: der GETEILTE Fokus `lensFocus` (Spec 21 §4) — nicht je Lens ein eigener.
 *   Die lens-eigenen Nebenauswahlen (`mapPerson`, Zeitleisten-Liste, `storyFamily`)
 *   bleiben bewusst außen vor: sie sind Arbeitszustand INNERHALB einer Lens, kein Ort,
 *   an dem man „gewesen" ist.
 * - Alles andere (Suche, Datei, Statistik, Mehr …): kein Slot, das Ziel selbst ist der Ort.
 */
export function slotsFor(target: RouteTarget): ViewTarget[] {
  if (target === 'source') return ['source', 'repository'];
  if (isEntityTarget(target)) return [target as ViewTarget];
  if (isLensTarget(target)) return ['lensFocus'];
  return [];
}

/** Höchstens so viele Rückwege — wie v8 (`_NAV_HISTORY_CAP`). Ein unbegrenzter Stack
 *  wächst über eine lange Sitzung ohne Nutzen: niemand geht 50 Schritte zurück. */
export const NAV_HISTORY_CAP = 50;

function samePoint(a: NavPoint, b: NavPoint): boolean {
  return a.target === b.target && JSON.stringify(a.sel) === JSON.stringify(b.sel);
}

export interface NavHistory {
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  /** Der Punkt, auf den `back()` führen würde — für Beschriftung/Tests. */
  readonly backPoint: NavPoint | null;
  /**
   * Den AKTUELLEN Stand als Besuch verbuchen. Idempotent: entspricht er dem aktuellen
   * Punkt, passiert nichts. Genau ein Aufrufer (ein `$effect` in App.svelte), der
   * Route + Auswahl reaktiv liest — kein `push`-Aufruf an 20 Navigationsstellen.
   */
  record(): void;
  /** Einen Schritt zurück. `false`, wenn es nichts gibt (dann bleibt alles stehen). */
  back(): boolean;
  /** Einen Schritt vorwärts (nur nach einem `back()` möglich). */
  forward(): boolean;
}

export function createNavHistory(route: Route, viewState: ViewState): NavHistory {
  let zurueck = $state<NavPoint[]>([]);
  let jetzt = $state<NavPoint | null>(null);
  let vorwaerts = $state<NavPoint[]>([]);

  function capture(): NavPoint {
    const sel: Record<string, string | null> = {};
    for (const slot of slotsFor(route.target)) sel[slot] = viewState.getCurrent(slot);
    return { target: route.target, sel };
  }

  /** Einen Punkt anfahren. Setzt Ziel UND Auswahl — nur das Ziel zu setzen ließe die
   *  vorherige Auswahl stehen und führte sichtbar an den falschen Ort. */
  function apply(point: NavPoint): void {
    for (const [slot, id] of Object.entries(point.sel)) {
      viewState.setCurrent(slot as ViewTarget, id);
    }
    route.setTarget(point.target);
  }

  return {
    get canGoBack() {
      return zurueck.length > 0;
    },
    get canGoForward() {
      return vorwaerts.length > 0;
    },
    get backPoint() {
      return zurueck.length > 0 ? zurueck[zurueck.length - 1] : null;
    },
    record() {
      const punkt = capture();
      if (jetzt && samePoint(jetzt, punkt)) return;
      if (jetzt) zurueck = [...zurueck, jetzt].slice(-NAV_HISTORY_CAP);
      // Ein neuer Weg verwirft den Vorwärts-Ast — dieselbe Regel wie in jedem Browser.
      vorwaerts = [];
      jetzt = punkt;
    },
    back() {
      if (zurueck.length === 0) return false;
      const ziel = zurueck[zurueck.length - 1];
      zurueck = zurueck.slice(0, -1);
      if (jetzt) vorwaerts = [...vorwaerts, jetzt];
      jetzt = ziel;
      apply(ziel);
      return true;
    },
    forward() {
      if (vorwaerts.length === 0) return false;
      const ziel = vorwaerts[vorwaerts.length - 1];
      vorwaerts = vorwaerts.slice(0, -1);
      if (jetzt) zurueck = [...zurueck, jetzt].slice(-NAV_HISTORY_CAP);
      jetzt = ziel;
      apply(ziel);
      return true;
    },
  };
}
