// ui/shell/windowed.svelte.ts — die Schalen-Hälfte des virtuellen Scrollens (BL-311,
// ADR-v9-234). Die Arithmetik liegt daneben in `window-slice.ts` (rein, DOM-frei, getestet);
// hier wohnt genau das, was ohne Browser nicht geht: Scroll-Position, Container-Höhe und die
// GEMESSENE Zeilenhöhe.
//
// EIN HALTER JE FLÄCHE, wie bei den Ansichtszuständen aus ADR-v9-229/230 — und aus demselben
// Grund als Prop durchgereicht statt komponenten-lokal erzeugt: die Scroll-Position ist der
// Zustand, den [21 §5](../../specs/v9/21-UI-UX.md) als „per-Entität-Scroll-State" nennt, und
// mit einem Fenster ist sie ein Offset statt eines DOM-Knotens, den der Browser noch hätte.
// Wer den Halter von außen gibt, bekommt die Position nach der Rückkehr zurück; wer ihn
// weglässt (Komponententest), bekommt eine frische Instanz.
//
// KEINE ABHÄNGIGKEIT, KEIN OBSERVER-ZOO: gemessen wird mit `clientHeight`/`scrollTop` am
// Container und `offsetHeight` an der ersten gerenderten Zeile. Ein `ResizeObserver` kommt
// dazu, wo er vorhanden ist (Fensterwechsel, Ausklappen der Filterleiste); fehlt er (happy-dom
// im Test), bleibt die letzte Messung stehen — die Fläche funktioniert, sie passt sich nur
// nicht an. Das ist der Unterschied zwischen „braucht einen Browser" und „nutzt einen, wenn
// einer da ist".
import { windowSlice, windowSliceOffsets, type WindowSlice } from './window-slice';

/**
 * Eine GRUPPE innerhalb desselben Scroll-Containers (ADR-v9-235 Entscheidung 1: die
 * Suchtreffer behalten ihre fünf `<section>`/`<h2>`, jede bekommt ihr eigenes Fenster mit
 * verschobenem Nullpunkt).
 *
 * HÖHENKLASSEN STATT EINER HÖHE (ADR-v9-236). Eine Trefferzeile ist 34,1px hoch ohne und
 * 51,1px mit Zweitzeile — welche von beiden, steht in den DATEN, nicht im Layout. Die Fläche
 * meldet deshalb je Zeile ihre KLASSE (`probe`), bekommt je Klasse EINE gemessene Musterhöhe
 * zurück (`height`) und baut daraus ihre Präfixsumme.
 */
export interface WindowedSection {
  /**
   * Action für das `<section>`-Element: hält fest, wo die Gruppe im Scroll-Inhalt beginnt.
   * Das ist der verschobene Nullpunkt — ohne ihn rechnen alle Gruppen mit derselben
   * Scroll-Position und vier von fünf stehen dauerhaft am Anschlag.
   */
  frame(node: HTMLElement): { destroy(): void };
  /**
   * Action für JEDE gerenderte Zeile dieser Gruppe, mit ihrer Höhenklasse als Parameter.
   *
   * DER RIEGEL GEGEN DIE SCHAUKEL: übernommen wird nur ein GRÖSSERER Wert. Monotone Schreiber
   * können nicht endlos kreisen — genau daran ist der zweite Anlauf gestorben (Messung an der
   * echten Zeile → neue Höhe → neues Fenster → andere Zeile gemessen → …, bis Svelte mit
   * `effect_update_depth_exceeded` den Effektbaum abbrach und die Fläche einfror). Ein
   * Höchstwert je Klasse terminiert nach höchstens so vielen Takten, wie es verschiedene
   * Höhen gibt, und irrt im Zweifel nach oben — ein etwas zu langer Scrollbalken statt einer
   * toten Fläche.
   */
  probe(node: HTMLElement, klasse: string): { destroy(): void; update(klasse: string): void };
  /** Gemessene Musterhöhe einer Klasse, `0` solange keine Zeile dieser Klasse stand. */
  height(klasse: string): number;
  /** Der Ausschnitt dieser Gruppe aus ihrer Höhen-Präfixsumme (`buildOffsets`). */
  slice(offsets: ArrayLike<number>): WindowSlice;
  /** Position der Gruppe im Scroll-Inhalt (für Tests und die Browser-Prüfung lesbar). */
  readonly top: number;
}

export interface Windowed {
  /**
   * Eine Gruppe im selben Scroll-Container — memoisiert je `key`, damit die zurückgegebenen
   * Actions über die Lebenszeit der Fläche dieselben bleiben.
   */
  section(key: string, klassen: readonly string[]): WindowedSection;
  /**
   * NUR für Tests: die Messwerte einer Gruppe setzen (happy-dom hat kein Layout, 32 TST-24).
   * Die Naht überbrückt genau den Teil, der schiefgehen kann — der Fertig-Zustand verlangt
   * deshalb ZUSÄTZLICH einen Browser-Lauf.
   */
  setSectionMetrics(key: string, werte: { heights?: Record<string, number>; top?: number }): void;
  /** Aktueller Ausschnitt für `count` Zeilen — reaktiv aus dem Template lesbar. */
  slice(count: number): WindowSlice;
  /**
   * Svelte-Action für den SCROLL-CONTAINER. Bindet Scroll- und Größenmessung an und stellt
   * eine gemerkte Scroll-Position wieder her (nach dem Wegnavigieren, Spec 21 §5).
   */
  container(node: HTMLElement): { destroy(): void };
  /**
   * Svelte-Action für die ERSTE gerenderte Zeile. Sie gibt die Zeilenhöhe her — gemessen,
   * nicht geraten (`window-slice.ts` erklärt, warum eine Höhe genügt).
   */
  probe(node: HTMLElement): { destroy(): void };
  /** Die gemerkte Scroll-Position (für Tests und die Wiederherstellung). */
  readonly scrollTop: number;
  /** Die gemessene Zeilenhöhe, `0` solange keine Zeile stand. */
  readonly rowHeight: number;
  /**
   * NUR für Tests: die Messwerte setzen, die im Browser aus dem Layout kommen. happy-dom hat
   * kein Layout (`clientHeight`/`offsetHeight` sind 0) — ohne diese Naht wäre das Fenster
   * ausschließlich im Browser prüfbar, und ein Mechanismus, der nur dort prüfbar ist, ist in
   * der Praxis ungeprüft (Spec 32). Die App ruft das nie.
   */
  setMetrics(werte: { rowHeight?: number; viewportHeight?: number; scrollTop?: number }): void;
}

export interface WindowedOptions {
  /**
   * Zeilen ober- und unterhalb des Fensters. Vorgabe aus `window-slice.ts`; eine Fläche mit
   * sehr flachen Zeilen (Kacheln in einer Reihe) darf mehr verlangen.
   */
  overscan?: number;
}

export function createWindowed(options: WindowedOptions = {}): Windowed {
  let scrollTop = $state(0);
  let viewportHeight = $state(0);
  let rowHeight = $state(0);
  // Nicht reaktiv: nur der Wiederherstellungs-Merker zwischen zwei Mounts derselben Fläche.
  let gemerkt = 0;

  // --- Gruppen im selben Scroll-Container (ADR-v9-235 Entscheidung 1) --------------------
  // Die Schlüssel werden beim ersten `section(key)` vorbelegt, nicht erst beim Messen: ein
  // erst später angelegter Feldname eines `$state`-Objekts ist eine Wette auf das
  // Proxy-Verhalten, und Wetten sind genau das, was diese Zeile zweimal gekostet hat.
  const tops = $state<Record<string, number>>({});
  // Musterhöhe je Gruppe UND Höhenklasse, Schlüssel `gruppe::klasse`.
  const classHeights = $state<Record<string, number>>({});
  // Bewusst KEINE `SvelteMap`: beide halten Identitäten, keine Anzeigewerte — `frames` die
  // DOM-Knoten für die Messung, `sections` die memoisierten Gruppen-Objekte, damit die
  // Actions über die Lebenszeit der Fläche dieselben bleiben. Reaktiv gemacht, würde jedes
  // Registrieren eines Rahmens ein Rendern auslösen, das nichts anderes zeigt. Die
  // reaktiven Werte stehen daneben in den drei `$state`-Objekten.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const frames = new Map<string, HTMLElement>();
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const sections = new Map<string, WindowedSection>();
  let containerNode: HTMLElement | null = null;
  let frameRO: ResizeObserver | null = null;

  /**
   * Misst, wo jede Gruppe im Scroll-Inhalt beginnt. Fünf `getBoundingClientRect` je
   * Scroll-Takt — der Spike hat belegt, dass selbst eine Messung an JEDER Zeile nur einen
   * zusätzlichen Takt kostet. Geschrieben wird nur bei echter Änderung.
   */
  function messeTops() {
    if (!containerNode) return;
    const cTop = containerNode.getBoundingClientRect().top;
    const st = containerNode.scrollTop;
    for (const [key, node] of frames) {
      const t = node.getBoundingClientRect().top - cTop + st;
      if (tops[key] !== t) tops[key] = t;
    }
  }

  return {
    slice(count: number): WindowSlice {
      return windowSlice({ count, rowHeight, scrollTop, viewportHeight, overscan: options.overscan });
    },

    section(key: string, klassen: readonly string[]): WindowedSection {
      const vorhanden = sections.get(key);
      if (vorhanden) return vorhanden;
      if (!(key in tops)) tops[key] = 0;
      for (const k of klassen) {
        const feld = `${key}::${k}`;
        if (!(feld in classHeights)) classHeights[feld] = 0;
      }

      /** Monotone Übernahme — s. `WindowedSection.probe`: nur größer, nie kleiner. */
      const messe = (node: HTMLElement, klasse: string) => {
        // `getBoundingClientRect().height`, nicht `offsetHeight`: letzteres rundet auf ganze
        // Pixel, und 0,1px mal 1.958 Zeilen sind 196px falsche Gesamthöhe — die
        // Platzhalter-Zusicherung (ADR-v9-235 Entscheidung 3) wäre verletzt.
        const h = node.getBoundingClientRect().height;
        const feld = `${key}::${klasse}`;
        if (h > 0 && h > (classHeights[feld] ?? 0)) classHeights[feld] = h;
      };

      const s: WindowedSection = {
        frame(node: HTMLElement) {
          frames.set(key, node);
          frameRO?.observe(node);
          // Erst nach dem Takt messen: beim Anbinden steht das Layout der Geschwister-
          // Gruppen noch nicht.
          queueMicrotask(messeTops);
          return {
            destroy() {
              frames.delete(key);
              frameRO?.unobserve(node);
            },
          };
        },

        probe(node: HTMLElement, klasse: string) {
          messe(node, klasse);
          return {
            update(neu: string) {
              messe(node, neu);
            },
            destroy() {},
          };
        },

        height(klasse: string) {
          return classHeights[`${key}::${klasse}`] ?? 0;
        },

        slice(offsets) {
          return windowSliceOffsets({
            offsets,
            scrollTop: scrollTop - tops[key],
            viewportHeight,
            overscan: options.overscan,
          });
        },

        get top() {
          return tops[key];
        },
      };
      sections.set(key, s);
      return s;
    },

    setSectionMetrics(key, werte) {
      if (!(key in tops)) tops[key] = 0;
      if (werte.top !== undefined) tops[key] = werte.top;
      for (const [klasse, h] of Object.entries(werte.heights ?? {})) {
        classHeights[`${key}::${klasse}`] = h;
      }
    },

    container(node: HTMLElement) {
      containerNode = node;
      frameRO =
        typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => messeTops());
      for (const n of frames.values()) frameRO?.observe(n);
      const messen = () => {
        viewportHeight = node.clientHeight;
        messeTops();
      };
      const onScroll = () => {
        scrollTop = node.scrollTop;
        gemerkt = node.scrollTop;
        messeTops();
      };
      node.addEventListener('scroll', onScroll, { passive: true });
      messen();
      // Gemerkte Position wiederherstellen — erst NACH dem ersten Takt, weil der Container
      // vorher nicht seine volle Höhe hat und der Browser ein `scrollTop` über der Höhe
      // stillschweigend auf das Maximum kürzt (dann wäre die Position verloren).
      if (gemerkt > 0) {
        queueMicrotask(() => {
          node.scrollTop = gemerkt;
          scrollTop = node.scrollTop;
        });
      }
      const ro =
        typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => messen());
      ro?.observe(node);
      return {
        destroy() {
          node.removeEventListener('scroll', onScroll);
          ro?.disconnect();
          frameRO?.disconnect();
          frameRO = null;
          containerNode = null;
        },
      };
    },

    probe(node: HTMLElement) {
      const messen = () => {
        const h = node.offsetHeight;
        // Nur eine echte Messung übernehmen: happy-dom liefert 0, und eine 0 würde das
        // Fenster abschalten (window-slice rendert dann alles — richtig, aber teuer).
        if (h > 0) rowHeight = h;
      };
      messen();
      const ro =
        typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => messen());
      ro?.observe(node);
      return {
        destroy() {
          ro?.disconnect();
        },
      };
    },

    setMetrics(werte) {
      if (werte.rowHeight !== undefined) rowHeight = werte.rowHeight;
      if (werte.viewportHeight !== undefined) viewportHeight = werte.viewportHeight;
      if (werte.scrollTop !== undefined) {
        scrollTop = werte.scrollTop;
        gemerkt = werte.scrollTop;
      }
    },

    get scrollTop() {
      return scrollTop;
    },
    get rowHeight() {
      return rowHeight;
    },
  };
}
