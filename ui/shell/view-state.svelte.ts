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
 * `mapPerson` ist die EIGENE Personenauswahl der Karte-Lens — bewusst getrennt von
 * `lensFocus` (ADR-v9-102). `lensFocus` ist der geteilte, lens-übergreifende Fokus, den
 * der Baum setzt; `mapPerson` ist das, was der Nutzer IN der Karte gewählt hat. Bis
 * ADR-v9-102 lag diese Auswahl als komponenten-lokales `$state` in `MapLensView.svelte`
 * und war beim ersten Wegnavigieren verloren — ein Vor-/Zurückspringen zwischen Karte
 * und einer anderen Ansicht war damit unmöglich. Die Vorbelegung aus `lensFocus` greift
 * NUR, solange die Karte noch gar keine eigene Auswahl hat (Nutzer-Entscheidung
 * 2026-07-19: "ausser wenn die jeweilige sicht noch keine personenauswahl hat, dann
 * sollte sie vorbelegt sein") — eine spätere Baum-Rezentrierung überschreibt eine
 * getroffene Karten-Auswahl NICHT.
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
  | 'mapPerson'
  | 'person'
  | 'family'
  | 'source'
  | 'repository'
  | 'place'
  | 'hof'
  | 'media'
  | 'search'
  | 'tasks'
  | 'more';

type Listener = (target: ViewTarget, id: string | null) => void;

/**
 * Roh-Koordinaten-Sprunganweisung für die Karte-Lens (ADR-v9-78-Nachtrag, 2026-07-14
 * — Nutzer-Korrektur nach Ansicht des ersten `lensPlaceFocus`-Ergebnisses: „wenn ein
 * event koordinaten hat, sollten diese über das map symbol erreichbar sein (sind
 * eigentlich wichtiger und relevanter als ortskoordinaten - könnten z. B. ein
 * geburtshaus statt eines geburtsortes sein)"). `lensPlaceFocus` (oben) trägt eine
 * ENTITÄTS-ID für den Fall, dass ein PlaceObject/HofObject SELBST einen kuratierten
 * Marker hat (Highlight-Zweck). Eine Koordinate ist aber KEINE Entitäts-Auswahl —
 * ein Event kann präzisere Koordinaten tragen als der Ort/Hof, dem es zugeordnet ist
 * (Fallback-Kette, `eventCoords`, Spec 11 §5), sogar OHNE dass ein PlaceObject mit
 * eigenen Koordinaten existiert. Deshalb ein eigenes, expliziten typisiertes
 * Methodenpaar statt einer Zweckentfremdung von `setCurrent`/`getCurrent` (deren
 * `string | null`-Vertrag für Entitäts-IDs gedacht ist, INV-VS) — bewusst NICHT Teil
 * des generischen `ViewTarget`-Registers.
 */
export interface MapCoordFocus {
  lat: number;
  long: number;
}

export interface ViewState {
  /** Aktuelle Auswahl gemäß Ziel setzen; feuert das Change-Event genau einmal. */
  setCurrent(target: ViewTarget, id: string | null): void;
  /** Aktuelle Auswahl gemäß Ziel lesen (reaktiv aus Svelte-Komponenten heraus). */
  getCurrent(target: ViewTarget): string | null;
  /** Imperativer Konsument (nicht-Svelte / Lifecycle-Hooks): auf Änderungen hören. */
  subscribe(fn: Listener): () => void;
  /** Einmalige Roh-Koordinaten-Sprunganweisung für die Karte-Lens setzen/löschen. */
  setMapCoordFocus(coords: MapCoordFocus | null): void;
  /** Reaktiv lesen (aus Svelte-Komponenten heraus). */
  getMapCoordFocus(): MapCoordFocus | null;
  /**
   * Eigene Personen-Vergleichsliste der Zeitleiste-Lens (bis 5, Spec 20 §1.10).
   *
   * Wie `setMapCoordFocus` ein explizit typisiertes Methodenpaar statt einer
   * Zweckentfremdung des generischen Registers: dessen `string | null`-Vertrag trägt
   * EINE Entitäts-Id, hier geht es um eine geordnete LISTE (INV-VS). Das Gegenstück der
   * Karte ist einwertig und liegt deshalb regulär als Ziel `mapPerson` im Register.
   */
  setTimelinePersons(ids: readonly string[]): void;
  /** Reaktiv lesen (aus Svelte-Komponenten heraus). */
  getTimelinePersons(): readonly string[];
  /**
   * Der **Proband** der Sitzung (BL-120, ADR-v9-135): transienter Session-Zustand — hier
   * in-memory gehalten, NIE persistiert (weder Datei noch IndexedDB noch Sync). `null` =
   * nichts explizit gesetzt; die effektive Referenzperson (Default = kleinste ID) berechnet
   * `resolveProband(db, viewState)` in `ui/shell/proband.ts`. Bewusst ein eigenes Methodenpaar
   * statt eines `ViewTarget`-Registereintrags: der Proband ist KEIN Navigationsziel (es gibt
   * keine „Proband"-View), sondern eine sitzungsweite Referenz.
   */
  setProband(id: string | null): void;
  /** Reaktiv lesen — die roh gesetzte Proband-Id (nicht der aufgelöste Default). */
  getProband(): string | null;
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
    mapPerson: null,
    person: null,
    family: null,
    source: null,
    repository: null,
    place: null,
    hof: null,
    media: null,
    search: null,
    tasks: null,
    more: null,
  });
  let mapCoordFocus = $state<MapCoordFocus | null>(null);
  let timelinePersons = $state<readonly string[]>([]);
  let probandId = $state<string | null>(null);

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
    setMapCoordFocus(coords) {
      mapCoordFocus = coords;
    },
    getMapCoordFocus() {
      return mapCoordFocus;
    },
    setTimelinePersons(ids) {
      timelinePersons = [...ids];
    },
    getTimelinePersons() {
      return timelinePersons;
    },
    setProband(id) {
      probandId = id;
    },
    getProband() {
      return probandId;
    },
  };
}
