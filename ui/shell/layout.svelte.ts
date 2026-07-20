// ui/shell/layout.svelte.ts — der EINE Formfaktor-Zustand der Schale (Spec 21 §3,
// ADR-v9-101).
//
// Spec 21 §3 nennt zwei Grenzen, bewusst getrennt gehalten:
//
//   640 px — DARSTELLUNG eines Overlays: Bottom-Sheet (darunter) ⇄ Popover am Trigger
//            (darüber). Rein presentational, entschieden im Stylesheet (ADR-v9-99:
//            "Der Breakpoint bleibt im Stylesheet"). Hier steht die Zahl nur als
//            benannte Quelle für den Drift-Wächter, s. u. — KEIN JS-Konsument.
//   900 px — LAYOUT UND NAVIGATION: Bottom-Nav ⇄ Sidebar, ein Pane ⇄ zwei Panes.
//            Das ist keine Stilfrage: es entscheidet, WELCHE Komponenten überhaupt
//            rendern, und muss daher JS bekannt sein.
//
// Ein Tablet im Hochformat (768 px) bekommt damit Popover ohne Sidebar. Das ist die
// beabsichtigte Wirkung der Trennung, keine Nebenwirkung.
//
// Bauform bewusst wie `online-status.svelte.ts` (dasselbe Muster: reaktives
// Plattform-Signal der Schale, injizierbare Umgebung, `start()` gibt die
// Abmeldefunktion zurück) statt eines neuen, dritten Musters — und NICHT wie
// `ui/islands/shared/reduced-motion.ts`, das bewusst ein zustandsloser Einmal-Read ist:
// die Inseln bauen bei jeder Zentrierung komplett neu auf, die Schale nicht. Ein
// Formfaktor-Wechsel (Fenster ziehen, Gerät drehen) muss live durchschlagen.

/** Overlay-Darstellung: darunter Bottom-Sheet, darüber Popover am Trigger. */
export const BREAKPOINT_OVERLAY_PX = 640;

/** Layout und Navigation: darunter Mobile-Modell, ab hier Desktop-Modell. */
export const BREAKPOINT_LAYOUT_PX = 900;

export const LAYOUT_QUERY = `(min-width: ${BREAKPOINT_LAYOUT_PX}px)`;

/**
 * Reine Entscheidungsfunktion — ohne DOM, ohne matchMedia.
 *
 * Die Grenze schließt EIN (`>=`): 900 px ist bereits Desktop. Explizit festgehalten,
 * weil dieselbe Frage bei der Anonymisierungs-Grenze schon einmal offen war
 * (ADR-v9-95) und "~900px" im Spec sie nicht beantwortet.
 */
export function isDesktopLayout(viewportWidthPx: number): boolean {
  return viewportWidthPx >= BREAKPOINT_LAYOUT_PX;
}

/** Injizierbar für Tests — im Browser ist das window.matchMedia. */
export interface LayoutEnv {
  matches: (query: string) => boolean;
  /** Meldet Änderungen an; gibt die Abmeldefunktion zurück. */
  subscribe: (query: string, cb: (matches: boolean) => void) => () => void;
}

const browserEnv: LayoutEnv = {
  matches: (query) => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
  },
  subscribe: (query, cb) => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => cb(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  },
};

class Layout {
  #desktop = $state(false);
  // MUSS `$state` sein, nicht ein einfaches Feld — dieselbe Falle, die `onlineStatus`
  // schon einmal gestellt hat (2026-07-18): der Getter liest `#started` als ERSTES,
  // und Kind-Komponenten rendern VOR dem `onMount` der Wurzel. Als plain field nähme
  // ein `$derived` beim ersten Auswerten den Direktabruf-Zweig und erfasste damit gar
  // keine reaktive Abhängigkeit — danach für immer eingefroren, bei grünen Tests.
  #started = $state(false);
  #env: LayoutEnv = browserEnv;

  /**
   * True ab der Layout-Grenze (Spec 21 §3): Sidebar statt Bottom-Nav, zwei Panes
   * statt einem.
   *
   * VOR `start()` wird die Plattform direkt gefragt, statt einen Default zu behaupten
   * — sonst rendert ein Kind auf einem Desktop-Fenster einen Frame lang das
   * Mobile-Layout (Mount-Reihenfolge Kind vor Wurzel, s. o.).
   */
  get isDesktopLayout(): boolean {
    return this.#started ? this.#desktop : this.#env.matches(LAYOUT_QUERY);
  }

  /** Verdrahtet den Listener; gibt die Abmeldefunktion zurück. */
  start(env: LayoutEnv = browserEnv): () => void {
    this.#env = env;
    this.#started = true;
    this.#desktop = env.matches(LAYOUT_QUERY);
    return env.subscribe(LAYOUT_QUERY, (matches) => {
      this.#desktop = matches;
    });
  }

  /** Nur für Tests. */
  reset(): void {
    this.#desktop = false;
    this.#started = false;
    this.#env = browserEnv;
  }
}

export const layout = new Layout();
