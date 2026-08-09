// ui/views/entity-tab-panes.svelte.ts — welche Fläche zeigt EntityTab gerade?
//
// Dritte Einheit neben `entity-tab-overlays.svelte.ts` (welches Werkzeug ist offen) und
// `entity-tab-navigation.svelte.ts` (welcher Sprung führt wohin): die Auswahl je Segment
// und die drei daraus abgeleiteten Fragen — hat das aktive Segment eine Auswahl, belegt ein
// Werkzeug die ganze Breite, ist die ÜBERSICHT selbst eine Fläche statt einer Spalte.
//
// Herausgelöst beim Bau von BL-320: die Datei lag mit den durchgereichten Listen-Haltern
// über der 600-Zeilen-Grenze. Kein Trimmen, sondern eine kohäsive Einheit, sodass die
// Restdatei komfortabel darunter liegt — dieselbe Wahl wie bei den zwei Geschwister-Dateien.
// Die Fragen gehören zusammen, weil sie ALLE dieselben drei Eingaben lesen (Segment,
// Auswahl, Werkzeug-Zustand) und einander bedingen.
import type { ViewState } from '../shell/view-state.svelte';
import type { EntityTargetId } from '../shell/nav-model';
import type { EntityTabOverlays } from './entity-tab-overlays.svelte';
import type { SourceSubView } from './entity-tab-navigation.svelte';

export interface EntityTabPanes {
  readonly selectedPersonId: string | null;
  readonly selectedFamilyId: string | null;
  readonly selectedSourceId: string | null;
  readonly selectedRepositoryId: string | null;
  readonly selectedPlaceId: string | null;
  readonly selectedHofId: string | null;
  readonly selectedMediaId: string | null;
  /**
   * Hat das aktive Segment gerade eine Auswahl? Entscheidet mobil Liste-ODER-Detail und auf
   * Desktop, ob der Detail-Pane Inhalt oder Leerzustand zeigt.
   */
  readonly hasSelection: boolean;
  /**
   * Review-/Dedup-Werkzeuge sind breite Arbeitsflächen, keine Listen: sie belegen in BEIDEN
   * Formfaktoren die volle Breite statt des schmalen Listen-Panes. Sonst quetschte man eine
   * Kandidaten-Tabelle in ~22rem (Spec 11 §6/§9.2).
   */
  readonly overlayActive: boolean;
  /**
   * Segmente, deren ÜBERSICHT eine Fläche ist statt einer Spalte (ADR-v9-192) — heute genau
   * die Medien-Kachelgalerie. Sie folgen dem Entweder-oder-Modell in BEIDEN Formfaktoren:
   * Übersicht über die ganze Fläche, Auswahl schaltet auf das Detail um.
   *
   * Warum das Multi-Pane hier nicht trägt: die Listenspalte ist 22rem breit und für einen
   * Index zum Überfliegen ausgelegt (INV-UI-14-Kurznamen). Ein Kachelraster (`auto-fill`,
   * 11rem-Kacheln) bekommt darin genau EINE Spalte — am Realbestand standen 641 Kacheln
   * untereinander in einem Drittel des Fensters, während zwei Drittel den Leerzustand
   * „Kein Eintrag ausgewählt" trugen. Das ist derselbe Gedanke, aus dem `overlayActive` die
   * Review-/Dedup-Werkzeuge ganzflächig zeigt (Spec 21 §10n): eine Arbeitsfläche ist keine
   * zweite Detailansicht neben einer Liste — nur hier gilt er für die Übersicht selbst,
   * nicht für ein Werkzeug daneben.
   *
   * Folge, die mitgezogen werden MUSS: ohne dauerhaft sichtbare Übersicht braucht das
   * Detail auch auf Desktop den Rückweg (`DetailHeader backAlways`, dort begründet).
   */
  readonly areaOverview: boolean;
}

export interface EntityTabPanesDeps {
  viewState: ViewState;
  overlays: EntityTabOverlays;
  /** Das offene Entitäts-Segment (aus der Routen-Quelle) — als Funktion, damit es reaktiv bleibt. */
  activeSegment: () => EntityTargetId;
  /** Quellen/Archive-Unteransicht (aus `entity-tab-navigation`) — ebenfalls als Funktion. */
  sourceSubView: () => SourceSubView;
}

export function createEntityTabPanes(deps: EntityTabPanesDeps): EntityTabPanes {
  const { viewState, overlays, activeSegment, sourceSubView } = deps;

  const selectedPersonId = $derived(viewState.getCurrent('person'));
  const selectedFamilyId = $derived(viewState.getCurrent('family'));
  const selectedSourceId = $derived(viewState.getCurrent('source'));
  const selectedRepositoryId = $derived(viewState.getCurrent('repository'));
  const selectedPlaceId = $derived(viewState.getCurrent('place'));
  const selectedHofId = $derived(viewState.getCurrent('hof'));
  const selectedMediaId = $derived(viewState.getCurrent('media'));

  const hasSelection = $derived.by(() => {
    const seg = activeSegment();
    if (seg === 'person') return !!selectedPersonId;
    if (seg === 'family') return !!selectedFamilyId;
    if (seg === 'source')
      return sourceSubView() === 'repositories' ? !!selectedRepositoryId : !!selectedSourceId;
    if (seg === 'place') return !!selectedPlaceId;
    if (seg === 'media') return !!selectedMediaId;
    return !!selectedHofId;
  });

  const overlayActive = $derived.by(() => {
    const seg = activeSegment();
    if (seg === 'person')
      return (overlays.personDedup || overlays.relationshipTool) && !selectedPersonId;
    if (seg === 'place') return (overlays.placeReview || overlays.placeDedup) && !selectedPlaceId;
    if (seg === 'hof') return (overlays.hofReview || overlays.hofDedup) && !selectedHofId;
    return false;
  });

  const areaOverview = $derived(activeSegment() === 'media');

  return {
    get selectedPersonId() {
      return selectedPersonId;
    },
    get selectedFamilyId() {
      return selectedFamilyId;
    },
    get selectedSourceId() {
      return selectedSourceId;
    },
    get selectedRepositoryId() {
      return selectedRepositoryId;
    },
    get selectedPlaceId() {
      return selectedPlaceId;
    },
    get selectedHofId() {
      return selectedHofId;
    },
    get selectedMediaId() {
      return selectedMediaId;
    },
    get hasSelection() {
      return hasSelection;
    },
    get overlayActive() {
      return overlayActive;
    },
    get areaOverview() {
      return areaOverview;
    },
  };
}
