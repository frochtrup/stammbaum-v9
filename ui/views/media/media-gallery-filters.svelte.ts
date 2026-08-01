// ui/views/media/media-gallery-filters.svelte.ts — Facetten- und Suchzustand der
// Medien-Kachelgalerie, gehalten AUSSERHALB der Galerie-Komponente.
//
// Warum außerhalb (Spec 21 §5): seit ADR-v9-192 belegt die Galerie die ganze Fläche und
// wird vom Medium-Detail ERSETZT — sie baut beim Öffnen eines Mediums also ab. Läge der
// Zustand komponenten-lokal, wäre eine mühsam eingegrenzte Auswahl („Weblinks, nur
// Quellen, Suche ‚Matricula'", 641 Kacheln im Realbestand) nach jedem Blick in ein Medium
// weg. Vorher fiel das auf Desktop nicht an: dort stand die Galerie in der dauerhaft
// sichtbaren Listenspalte. Genau der Fall, den §5 meint — „Ansichts-Unterzustand, der eine
// Navigation überleben muss, gehört nicht in komponenten-lokalen Zustand".
//
// Bewusst KEIN Modul-Singleton und KEIN Platz in der ViewState-Instanz: `EntityTab` legt
// eine Instanz an und reicht sie durch (wie `entity-tab-overlays`/`-navigation` daneben) —
// damit ist der Zustand exakt so langlebig wie der Entitäten-Tab, und Komponententests
// bekommen eine frische, isolierte Instanz (dieselbe Begründung wie bei `createViewState`).
// Der ViewState hält AUSWAHLEN je Ziel (INV-VS), keine Filterzustände.
import {
  initialKindSelection,
  toggleFacet,
  type MediaKindFacet,
  type MediaKindSelection,
  type MediaOwnerKind,
  type MediaOwnerSelection,
  type MediaTileRow,
} from './media-gallery-model';

export interface MediaGalleryFilters {
  readonly owner: MediaOwnerSelection;
  readonly kind: MediaKindSelection;
  readonly query: string;
  setQuery(q: string): void;
  toggleOwner(kind: MediaOwnerKind): void;
  clearOwner(): void;
  toggleKind(facet: MediaKindFacet): void;
  clearKind(): void;
  /**
   * Vorauswahl der Art-Facette an den Bestand nachziehen (ADR-v9-187: „Dateien", sobald es
   * beide Arten gibt). Nur bei einem WECHSEL des Bestands — ein einmal vom Nutzer
   * gesetzter Chip darf nicht bei jeder Neuberechnung zurückspringen.
   */
  syncKindDefault(rows: readonly MediaTileRow[]): void;
}

/**
 * Zu den `eslint-disable`-Zeilen unten (`svelte/prefer-svelte-reactivity`): die Regel
 * schützt davor, eine Menge IN PLACE zu verändern und dann auf Reaktivität zu hoffen.
 * Dieser Zustand wird nie mutiert — jede Änderung ERSETZT die Menge (`toggleFacet` gibt
 * eine neue zurück, `clear*` legt eine neue leere an), die Abhängigkeit hängt also an der
 * `$state`-Variablen, nicht an Set-Interna. `SvelteSet` brächte hier nur die
 * Element-Feingranularität, die niemand liest. Der Ersetzungs-Kontrakt ist getestet
 * (`media-gallery-model.test.ts`: „ohne die Vorlage zu verändern"), nicht bloß behauptet.
 */
export function createMediaGalleryFilters(): MediaGalleryFilters {
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  let owner = $state<MediaOwnerSelection>(new Set());
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  let kind = $state<MediaKindSelection>(new Set());
  let query = $state('');
  // Merker für „welcher Bestand liegt der Vorauswahl zugrunde" — `null` = noch keiner.
  let kindKey = $state<string | null>(null);

  return {
    get owner() {
      return owner;
    },
    get kind() {
      return kind;
    },
    get query() {
      return query;
    },
    setQuery(q) {
      query = q;
    },
    toggleOwner(k) {
      owner = toggleFacet(owner, k);
    },
    clearOwner() {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      owner = new Set();
    },
    toggleKind(facet) {
      kind = toggleFacet(kind, facet);
    },
    clearKind() {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      kind = new Set();
    },
    syncKindDefault(rows) {
      const key = `${rows.length}:${initialKindSelection(rows).size}`;
      if (key === kindKey) return;
      kindKey = key;
      kind = initialKindSelection(rows);
    },
  };
}
