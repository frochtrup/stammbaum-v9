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
  #stop: () => void = () => {};

  /**
   * MELDET SICH SELBST AN — es gibt keinen Zustand „noch nicht gestartet" mehr.
   *
   * Vorher fragte der Getter vor `start()` die Plattform DIREKT. Dieser Zweig war als
   * Überbrückung für den ersten Frame gedacht (Kind-Komponenten rendern vor dem
   * `onMount` der Wurzel) und setzte voraus, dass `start()` unmittelbar folgt. Genau
   * diese Voraussetzung ist eine Erinnerungspflicht — und der Standalone-Orte-Editor
   * (Spec 22) hat sie nicht erfüllt: `start()` wurde dort nie gerufen, der Direktabruf
   * ist NICHT reaktiv, und der Formfaktor blieb auf dem Wert des ersten Renderns
   * stehen. Sichtbare Folge: „← Zur Liste" verschwand nach dem Verkleinern des
   * Fensters und kam nie zurück — der einzige Rückweg aus dem Steckbrief
   * (ADR-v9-171).
   *
   * Der Konstruktor läuft beim Import des Moduls. `browserEnv` ist gegen fehlendes
   * `window`/`matchMedia` abgesichert (Node-Testumgebung: `false` + No-op-Abmeldung),
   * ein Nebeneffekt beim Import ist hier also folgenlos — und der Singleton lebt
   * ohnehin so lange wie die Seite.
   */
  constructor() {
    this.#connect(browserEnv);
  }

  /**
   * True ab der Layout-Grenze (Spec 21 §3): Sidebar statt Bottom-Nav, zwei Panes
   * statt einem.
   *
   * Immer der ANGEMELDETE Wert — es gibt keinen un-angemeldeten Zustand mehr (s.
   * Konstruktor). Ein Formfaktor-Wechsel schlägt damit durch, unabhängig davon, ob eine
   * Schale `start()` gerufen hat.
   */
  get isDesktopLayout(): boolean {
    return this.#desktop;
  }

  /**
   * Verbindet den Zustand mit einer Umgebung: Startwert lesen, Listener setzen, den
   * vorherigen abmelden.
   */
  #connect(env: LayoutEnv): void {
    this.#stop();
    this.#desktop = env.matches(LAYOUT_QUERY);
    this.#stop = env.subscribe(LAYOUT_QUERY, (matches) => {
      this.#desktop = matches;
    });
  }

  /**
   * Verdrahtet eine EIGENE Umgebung (Test-Injektion, `App.svelte`s `layoutEnv`-Prop) und
   * gibt die Abmeldefunktion zurück.
   *
   * Nicht mehr nötig, damit der Zustand überhaupt funktioniert — nur, um ihn zu
   * ÜBERSTEUERN. Das ist der Unterschied zu vorher (ADR-v9-171).
   */
  start(env: LayoutEnv = browserEnv): () => void {
    this.#connect(env);
    return () => {
      this.#stop();
      this.#stop = () => {};
    };
  }

  /** Nur für Tests: zurück auf die Plattform-Umgebung. */
  reset(): void {
    this.#connect(browserEnv);
  }
}

export const layout = new Layout();
