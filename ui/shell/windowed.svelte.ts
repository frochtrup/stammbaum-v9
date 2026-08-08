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
import { windowSlice, type WindowSlice } from './window-slice';

export interface Windowed {
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

  return {
    slice(count: number): WindowSlice {
      return windowSlice({ count, rowHeight, scrollTop, viewportHeight, overscan: options.overscan });
    },

    container(node: HTMLElement) {
      const messen = () => {
        viewportHeight = node.clientHeight;
      };
      const onScroll = () => {
        scrollTop = node.scrollTop;
        gemerkt = node.scrollTop;
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
