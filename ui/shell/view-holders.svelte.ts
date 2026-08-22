// ui/shell/view-holders.svelte.ts — die Ansichts-Halter der App-Wurzel, an einer Stelle.
//
// WARUM SIE ALLE HIER LIEGEN. Jede dieser Flächen wird beim Wegnavigieren ABGEBAUT — auf
// Mobil ersetzt das Detail die Liste, der Sprung in eine Lens räumt den ganzen Entitäten-Tab.
// Ihr Ansichts-Zustand (Suche, Filter, Anzeige-Modus, Scroll-Position) muss das überleben
// (Spec 21 §5), und die App-Wurzel ist die einzige Ebene, die JEDEN Navigationsweg
// überdauert. Deshalb: EINMAL hier erzeugt, als Prop durchgereicht — dasselbe Muster wie
// `EventClipboard` und `MediaGalleryFilters` ([ADR-v9-192](../../specs/v9/04-Entscheidungslog.md#adr-v9-192),
// [ADR-v9-229](../../specs/v9/04-Entscheidungslog.md#adr-v9-229)).
//
// Eigene Datei, weil `App.svelte` mit den Scroll-Haltern über die 600-Zeilen-Grenze lief.
// Herausgelöst wurde eine kohäsive Einheit — „was die Wurzel für ihre Flächen hält" — statt
// an der Restdatei zu trimmen.
import {
  createPersonListState,
  createFamilyListState,
  createPlaceListState,
  createHofListState,
  createSourceListState,
  type PersonListState,
  type FamilyListState,
  type PlaceListState,
  type HofListState,
  type SourceListState,
} from '../views/list-view-state.svelte';
import { createQualityDashboardState } from '../views/quality/quality-dashboard-state.svelte';
import { createTreeViewState } from '../views/tree/tree-view-state.svelte';
import { createGlobalSearchState } from '../views/search/global-search-state.svelte';
import {
  createHypothesesViewState,
  createLogViewState,
  createResearchScopeState,
  createTasksViewState,
} from '../views/research-segment-state.svelte';
import { createWindowed, type Windowed } from './windowed.svelte';

/** Die gefensterten Index-Flächen (BL-311). `hof` fehlt bewusst — s. `createViewHolders`. */
export type WindowSlot = 'person' | 'family' | 'source' | 'repository' | 'place' | 'media' | 'search';

export interface ViewHolders {
  quality: ReturnType<typeof createQualityDashboardState>;
  /** Generationenzahl je Baum-Modus (BL-368). Gehört der Wurzel, nicht der Lens: der Weg
   *  in eine andere Lens baut `TreeView` ab. */
  tree: ReturnType<typeof createTreeViewState>;
  search: ReturnType<typeof createGlobalSearchState>;
  tasks: ReturnType<typeof createTasksViewState>;
  log: ReturnType<typeof createLogViewState>;
  hypotheses: ReturnType<typeof createHypothesesViewState>;
  /** Relevanz-Achse der Forschungs-Umbrella (BL-375) — scoped alle vier Segmente. */
  researchScope: ReturnType<typeof createResearchScopeState>;
  lists: {
    person: PersonListState;
    family: FamilyListState;
    source: SourceListState;
    place: PlaceListState;
    hof: HofListState;
  };
  /**
   * Scroll-Position je gefensterter Index-Fläche. Mit einem Fenster ist sie ein OFFSET im
   * Halter, kein DOM-Zustand: die Zeilen, an denen der Browser sie sonst festmachen würde,
   * existieren nach dem Abbau gar nicht mehr.
   */
  windows: Record<WindowSlot, Windowed>;
}

export function createViewHolders(): ViewHolders {
  return {
    quality: createQualityDashboardState(),
    tree: createTreeViewState(),
    search: createGlobalSearchState(),
    tasks: createTasksViewState(),
    log: createLogViewState(),
    hypotheses: createHypothesesViewState(),
    researchScope: createResearchScopeState(),
    lists: {
      person: createPersonListState(),
      family: createFamilyListState(),
      source: createSourceListState(),
      place: createPlaceListState(),
      hof: createHofListState(),
    },
    // `hof` hat keinen Fenster-Halter: die Hof-Liste klappt ihre Dorf-Gruppen automatisch
    // ein ([ADR-v9-78](../../specs/v9/04-Entscheidungslog.md#adr-v9-78)) und rendert schon
    // ohne Fenster O(Gruppen) — ein Halter ohne Fenster wäre ein Slot ohne Inhalt.
    windows: {
      person: createWindowed(),
      family: createWindowed(),
      source: createWindowed(),
      repository: createWindowed(),
      place: createWindowed(),
      media: createWindowed(),
      search: createWindowed(),
    },
  };
}
