// ui/views/search/global-search-state.svelte.ts — Eingabe- und Filterzustand der
// globalen Suche, gehalten AUSSERHALB der Suchfläche (Spec 21 §5).
//
// Warum außerhalb: die Suche ist ein Bottom-Nav-Ziel und wird beim Sprung auf einen
// Treffer abgebaut (App.svelte rendert die Ziele über `{:else if}`). Lag der Zustand
// komponenten-lokal, war die Trefferliste nach dem Blick auf den ersten Treffer weg —
// wer fünf Namensvarianten durchsehen will, tippt die Anfrage fünfmal neu. Genau der
// Fall aus §5: „Ansichts-Unterzustand, der eine Navigation überleben muss, gehört …
// nicht in komponenten-lokalen Zustand."
//
// Dasselbe Muster und derselbe Eigentümer wie `quality-dashboard-state.svelte.ts`
// (BL-319) und `media-gallery-filters.svelte.ts` (ADR-v9-192): ein eigener Halter je
// Fläche, angelegt von der App-Wurzel, als Prop durchgereicht — KEIN Platz in der
// ViewState-Instanz (die hält Auswahlen je Ziel, INV-VS, keine Filter-/Eingabezustände)
// und kein Modul-Singleton (Komponententests bekommen eine frische Instanz).
//
// Die Treffer selbst werden NICHT gehalten: `globalSearch(db, …)` ist eine reine
// Kern-Funktion über dem aktuellen Bestand — aus der erhaltenen Anfrage rechnet die
// Fläche dieselbe Liste neu, und zwar auf dem Stand NACH einer zwischenzeitlichen
// Bearbeitung. Ein eingefrorenes Ergebnis wäre ein zweiter Wahrheitsstand.

/** Entitätstypen der Treffer-Filterung (ADR-v9-130). */
export type SearchKind = 'persons' | 'families' | 'sources' | 'places' | 'hofs';
/** Gewählter Typ-Filter; `'all'` = keine Einschränkung. */
export type SearchFilter = 'all' | SearchKind;

export interface GlobalSearchState {
  readonly query: string;
  setQuery(q: string): void;
  clearQuery(): void;
  /** Soundex-Umschalter der globalen Suche (ADR-v9-159) — eigener Zustand, kein
   *  gemeinsamer Topf mit `PersonFilters.soundex` (INV-VS). */
  readonly soundex: boolean;
  toggleSoundex(): void;
  readonly filter: SearchFilter;
  setFilter(next: SearchFilter): void;
}

export function createGlobalSearchState(): GlobalSearchState {
  let query = $state('');
  let soundex = $state(false);
  let filter = $state<SearchFilter>('all');

  return {
    get query() {
      return query;
    },
    setQuery(q) {
      query = q;
    },
    clearQuery() {
      query = '';
    },
    get soundex() {
      return soundex;
    },
    toggleSoundex() {
      soundex = !soundex;
    },
    get filter() {
      return filter;
    },
    setFilter(next) {
      filter = next;
    },
  };
}
