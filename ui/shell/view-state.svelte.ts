// ui/shell/view-state.svelte.ts — ViewState-Kontrakt (Spec 21 §5, INV-VS).
//
// INV-VS: genau EINE zentrale Instanz verwaltet die aktuelle Auswahl je Ziel
// (`setCurrent(target, id)` / `getCurrent(target)`). Kein verstreutes
// `currentX`/`_lastTabSel`-Trio wie in v8 (Spec 21 §9 B3/B4).
//
// Diese Scheibe hält die Auswahl NUR in-memory (Svelte-5-Runes-State). Persistenz
// über App-Resume (Arbeitskopie/Browser-Speicher, Spec 21 §5 "Selektion überlebt
// App-Resume") ist ein FOLGE-SCHRITT — hier bewusst ausgeklammert, s. Entscheidungslog
// ADR-v9-16. Das Change-Event (Subscriptions) ersetzt kein Svelte-`$derived` — Konsumenten
// lesen `getCurrent()` reaktiv über `$derived`/`$effect`, `subscribe` ist für nicht-Svelte-
// bzw. imperative Konsumenten (z. B. künftige SVG-Inseln, Lifecycle-Hooks) gedacht.
//
// Bei fehlender Entität liefert `getCurrent` weiterhin die gesetzte id zurück (die
// Instanz kennt die Entitäten selbst nicht — sie ist reine Auswahl-Verwaltung); der
// definierte Fallback (Spec 21 §5 "nie stiller Abbruch") ist Sache der lesenden View
// (sie prüft, ob die id im aktuellen Datenbestand existiert, und zeigt sonst einen
// Leerzustand statt eines Absturzes — s. PersonDetail.svelte).

/**
 * Navigations-Ziele dieser Scheibe (Rollenmodell Spec 21 §1). Wächst mit dem Bau.
 *
 * `lensFocus` ist bewusst NICHT "tree" genannt: es ist der EINE geteilte Fokus-Begriff
 * (welche Person/welcher Ort ist gerade zentriert) für ALLE Kontext-Fokus-Lenses
 * (Spec 21 §4: "Baum ▸ Karte ▸ Zeitleiste ▸ Story" — "Der Fokus … bleibt beim
 * Lens-Wechsel erhalten"). Baum und die künftige Karte lesen/schreiben DENSELBEN
 * Slot — kein `tree`+`map`-Trio mit eigenem Fokus je Lens (das wäre selbst wieder
 * eine INV-VS-Verletzung, "eine Auswahl-Instanz je Ziel", s. Spec 21 §5/ADR-Log).
 *
 * `lensPlaceFocus` (ADR-v9-78 Punkt 4, Spec 20 §1.9 "Lücke 2") ist bewusst ein
 * EIGENER Slot statt `lensFocus` mitzubenutzen: `lensFocus` ist der dauerhafte
 * Personen-Fokus (bleibt über Lens-Wechsel hinweg bestehen), `lensPlaceFocus` ist ein
 * EINMALIGER Sprung-Auftrag aus einem konkreten Orts-/Hof-Klick-Origin (Ereigniszeilen-
 * Kartenlink/`CoordIndicator`, `PlaceDetail`/`HofDetail`) in den Karte-Lens-Orte-Modus
 * — die konsumierende Seite (`MapLensView.svelte`) liest ihn EINMAL und setzt ihn
 * sofort danach zurück auf `null` (kein Dauerzustand wie `lensFocus`, sonst würde ein
 * späterer, unabhängiger Karte-Besuch erneut auf den alten Ort springen).
 */
export type ViewTarget =
  | 'lensFocus'
  | 'lensPlaceFocus'
  | 'person'
  | 'family'
  | 'source'
  | 'repository'
  | 'place'
  | 'hof'
  | 'search'
  | 'tasks'
  | 'more';

type Listener = (target: ViewTarget, id: string | null) => void;

export interface ViewState {
  /** Aktuelle Auswahl gemäß Ziel setzen; feuert das Change-Event genau einmal. */
  setCurrent(target: ViewTarget, id: string | null): void;
  /** Aktuelle Auswahl gemäß Ziel lesen (reaktiv aus Svelte-Komponenten heraus). */
  getCurrent(target: ViewTarget): string | null;
  /** Imperativer Konsument (nicht-Svelte / Lifecycle-Hooks): auf Änderungen hören. */
  subscribe(fn: Listener): () => void;
}

/**
 * Baut EINE ViewState-Instanz. Der App-Einstieg (main.ts) erzeugt genau eine und
 * reicht sie über Props/Context durch — es gibt keinen implizit geteilten Modul-
 * Singleton, damit Komponenten-Tests jeweils eine frische, isolierte Instanz nutzen
 * (kein Test-Leck über einen globalen Modul-State).
 */
export function createViewState(): ViewState {
  const selection = $state<Record<ViewTarget, string | null>>({
    lensFocus: null,
    lensPlaceFocus: null,
    person: null,
    family: null,
    source: null,
    repository: null,
    place: null,
    hof: null,
    search: null,
    tasks: null,
    more: null,
  });

  // Bewusst ein reines Buchführungs-Set, kein Teil des reaktiven Graphen (wird nie in
  // einem $derived/Template gelesen) — SvelteSet wäre hier unnötiger Overhead.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const listeners = new Set<Listener>();

  return {
    setCurrent(target, id) {
      selection[target] = id;
      for (const fn of listeners) fn(target, id);
    },
    getCurrent(target) {
      return selection[target];
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
