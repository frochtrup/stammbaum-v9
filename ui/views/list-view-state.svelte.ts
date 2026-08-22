// ui/views/list-view-state.svelte.ts — Suche, Filter und Sortier-/Abschnitts-Wahl der fünf
// Entitätslisten, gehalten AUSSERHALB der Listen-Komponenten (BL-320/BL-372, Spec 21 §5).
//
// Warum außerhalb: auf Mobil ERSETZT das Detail die Liste (`EntityTab`, `{#if hasSelection}`)
// — wer aus einer gefilterten Liste eine Person öffnet, kommt in die ungefilterte zurück,
// und eine mühsam eingegrenzte Suche ist nach jedem Blick auf einen Treffer weg. Dieselbe
// Klasse wie das Qualitäts-Dashboard und die globale Suche (BL-319,
// [ADR-v9-229]), nur an der Fläche, die am häufigsten benutzt wird.
//
// Eigentümer ist die App-Wurzel, nicht `EntityTab`: der Sprung in eine Lens (Baum/Karte)
// baut auch den Tab ab. Das ist die Erfahrung aus ADR-v9-229 — die Ebene muss JEDEN
// betroffenen Navigationsweg überdauern, nicht nur den naheliegenden.
//
// FORM: ein typisierter, reaktiver Datensatz statt eines Getter/Setter-Halters wie
// `quality-dashboard-state.svelte.ts`. Grund ist die Fläche selbst: die Filterfelder sind
// `bind:`-gebundene Eingaben (Radios, Zahlen, Häkchen) — ein Setter-Vertrag würde ~40
// Bindungen in `value`/`onchange`-Paare zwingen, ohne einen einzigen Übergang zu kapseln.
// Wo es Übergänge MIT Bedingungen gibt (Bericht auf/zu, Ebene hebt Ast-Auswahl auf),
// bleibt der Getter/Setter-Halter richtig. Ein Muster, zwei Ausprägungen — die Wahl folgt
// dem, was die Fläche braucht, und ist in Spec 21 §5 festgehalten.
//
// Bewusst NICHT hier: `namelessExpanded` (Auf-/Zuklappen der `#`-Gruppe — Spec 20 §1.4
// hält ausdrücklich fest, dass dieser Zustand View-lokal ist) und der Batch-Geocoding-
// Fortschritt der Orte-Liste (Fortschrittsanzeige einer laufenden Aktion, kein
// Ansichtszustand).
import {
  defaultPersonFilters,
  type PersonFilters,
  type PersonSortMode,
} from './person/person-list-model';
import {
  defaultFamilyFilters,
  type FamilyFilters,
  type FamilySortMode,
} from './family/family-list-model';
import { defaultPlaceFilters, type PlaceFilters } from './place/place-list-model';
import { defaultHofFilters, type HofFilters } from './hof/hof-list-model';
import { defaultSourceFilters, type SourceFilters } from './source/source-list-model';

/** Abschnitt der Orte-/Höfe-Liste: referenzierte oder unreferenzierte Objekte. */
export type ListSection = 'referenced' | 'unreferenced';

export interface PersonListState {
  query: string;
  sortMode: PersonSortMode;
  filters: PersonFilters;
}

export interface FamilyListState {
  query: string;
  sortMode: FamilySortMode;
  filters: FamilyFilters;
}

export interface PlaceListState {
  query: string;
  filters: PlaceFilters;
  /**
   * Blendet die pnames-Varianten unter dem Titel ein (Anzeige, kein Filter). Der v8-Name
   * „Gruppen-Modus" trug noch die string-basierte Liste im Rücken; in v9 ist die Liste
   * ID-basiert, die Gruppierung also strukturell schon passiert — sichtbar gemacht werden
   * nur noch die Varianten selbst (ADR-v9-149).
   */
  groupMode: boolean;
  section: ListSection;
}

/** Quellenliste (BL-372/373): Suchanfrage + Gattungs-Filter. Kein Sortier-Modus — die
 *  Liste sortiert alphabetisch nach Anzeigelabel, und eine zweite Ordnung hat niemand
 *  verlangt. */
export interface SourceListState {
  query: string;
  filters: SourceFilters;
}

export interface HofListState {
  query: string;
  filters: HofFilters;
  section: ListSection;
}

export function createPersonListState(): PersonListState {
  const s = $state<PersonListState>({
    query: '',
    sortMode: 'name',
    filters: defaultPersonFilters(),
  });
  return s;
}

export function createFamilyListState(): FamilyListState {
  const s = $state<FamilyListState>({
    query: '',
    sortMode: 'husbandSurname',
    filters: defaultFamilyFilters(),
  });
  return s;
}

export function createPlaceListState(): PlaceListState {
  const s = $state<PlaceListState>({
    query: '',
    filters: defaultPlaceFilters(),
    groupMode: false,
    section: 'referenced',
  });
  return s;
}

export function createSourceListState(): SourceListState {
  const s = $state<SourceListState>({
    query: '',
    filters: defaultSourceFilters(),
  });
  return s;
}

export function createHofListState(): HofListState {
  const s = $state<HofListState>({
    query: '',
    filters: defaultHofFilters(),
    section: 'referenced',
  });
  return s;
}
