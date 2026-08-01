// ui/views/entity-tab-navigation.svelte.ts — Cross-Entitäts-Navigation INNERHALB des
// Entitäten-Tabs (Familie → Person, Quelle → Person/Familie/Archiv, Archiv → Quelle).
//
// Jeder Sprung wechselt ZWEI Dinge zugleich: das Entitäts-Segment (Routen-Quelle,
// INV-UI-15) und die ViewState-Auswahl des Zielsegments (INV-VS) — plus, wo nötig, das
// Räumen eines offenen Werkzeug-Overlays. Genau EIN kanonischer Weg (INV-UI-2), statt
// verstreuter Ad-hoc-Sprünge in den einzelnen Detail-Komponenten.
//
// Eigene Datei aus demselben Grund wie `entity-tab-overlays.svelte.ts` daneben:
// `EntityTab.svelte` lief sonst über die 600-Zeilen-Schwelle (BL-54). Und wie dort ist es
// eine kohäsive Einheit, die sich sauber herauslöst — die Sprünge selbst plus die drei
// „gerade neu angelegt"-Merker und die Quellen/Archive-Unteransicht, die nur von ihnen
// gesetzt werden. Was in `EntityTab.svelte` BLEIBT, ist die Entscheidung, WELCHE
// Komponente rendert; hier liegt nur, WOHIN gesprungen wird.
import type { ViewState } from '../shell/view-state.svelte';
import type { Route } from '../shell/route.svelte';
import type { EntityTabOverlays } from './entity-tab-overlays.svelte';

export type SourceSubView = 'sources' | 'repositories';

export interface EntityTabNavigation {
  /** Quellen ⇄ Archive — KEIN Navigationsziel, sondern eine Unteransicht des
   *  Quellen-Ziels (Spec 20 §1.6), deshalb hier statt in der Routen-Quelle. */
  readonly sourceSubView: SourceSubView;
  setSourceSubView(view: SourceSubView): void;
  /**
   * „Gerade angelegt" — die drei Listen legen den Datensatz selbst per
   * `appState.save*` an (Spec 20 §2); diese Merker sagen der Detailansicht nur, dass sie
   * direkt im Editor starten soll. Familien brauchen ihn nicht (ADR-v9-63: `FamilyDetail`
   * ist ohne Toggle-Formular direkt editierbar).
   */
  readonly createdPersonId: string | null;
  readonly createdSourceId: string | null;
  readonly createdRepositoryId: string | null;
  toPerson(id: string): void;
  createPerson(id: string): void;
  toFamily(id: string): void;
  createFamily(id: string): void;
  toSource(id: string): void;
  createSource(id: string): void;
  toRepository(id: string): void;
  createRepository(id: string): void;
  toPlace(id: string): void;
  toHof(id: string): void;
  /** Auswahl des AKTIVEN Segments aufheben — der Boden unter „← Zurück", wenn der
   *  Verlauf leer ist (BL-07/ADR-v9-177). */
  backToList(): void;
}

export function createEntityTabNavigation(deps: {
  route: Route;
  viewState: ViewState;
  overlays: EntityTabOverlays;
}): EntityTabNavigation {
  const { route, viewState, overlays } = deps;

  let sourceSubView = $state<SourceSubView>(viewState.getCurrent('repository') ? 'repositories' : 'sources');
  let createdPersonId = $state<string | null>(null);
  let createdSourceId = $state<string | null>(null);
  let createdRepositoryId = $state<string | null>(null);

  return {
    get sourceSubView() {
      return sourceSubView;
    },
    setSourceSubView(view) {
      sourceSubView = view;
    },
    get createdPersonId() {
      return createdPersonId;
    },
    get createdSourceId() {
      return createdSourceId;
    },
    get createdRepositoryId() {
      return createdRepositoryId;
    },

    toPerson(id) {
      route.setTarget('person');
      overlays.closeForPerson();
      viewState.setCurrent('person', id);
    },
    createPerson(id) {
      createdPersonId = id;
      this.toPerson(id);
    },

    toFamily(id) {
      route.setTarget('family');
      overlays.closeForPerson();
      viewState.setCurrent('family', id);
    },
    createFamily(id) {
      this.toFamily(id);
    },

    toSource(id) {
      route.setTarget('source');
      sourceSubView = 'sources';
      viewState.setCurrent('repository', null);
      viewState.setCurrent('source', id);
    },
    createSource(id) {
      createdSourceId = id;
      this.toSource(id);
    },

    toRepository(id) {
      route.setTarget('source');
      sourceSubView = 'repositories';
      viewState.setCurrent('repository', id);
    },
    createRepository(id) {
      createdRepositoryId = id;
      this.toRepository(id);
    },

    toPlace(id) {
      route.setTarget('place');
      overlays.closeForPlace();
      viewState.setCurrent('place', id);
    },

    toHof(id) {
      route.setTarget('hof');
      overlays.closeForHof();
      viewState.setCurrent('hof', id);
    },

    backToList() {
      const segment = route.entityTarget;
      if (segment === 'source') {
        // Archive sind eine Unteransicht: aus einem Archiv führt der Weg zur Archivliste,
        // nicht zur Quellenliste.
        if (viewState.getCurrent('repository')) viewState.setCurrent('repository', null);
        else viewState.setCurrent('source', null);
        return;
      }
      if (segment === 'person' || segment === 'family' || segment === 'place' || segment === 'hof' || segment === 'media') {
        viewState.setCurrent(segment, null);
      }
    },
  };
}
