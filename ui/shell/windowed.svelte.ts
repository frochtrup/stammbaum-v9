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
/** Was die Fläche über eine gerenderte Zeile meldet: ihre Höhenklasse und ihr Index. */
export interface ZeilenMass {
  klasse: string;
  index: number;
}

export interface WindowedSection {
  /**
   * Action für das `<section>`-Element: hält fest, wo die Gruppe im Scroll-Inhalt beginnt.
   * Das ist der verschobene Nullpunkt — ohne ihn rechnen alle Gruppen mit derselben
   * Scroll-Position und vier von fünf stehen dauerhaft am Anschlag.
   */
  frame(node: HTMLElement): { destroy(): void };
  /**
   * Action für JEDE gerenderte Zeile dieser Gruppe, mit ihrer Höhenklasse UND ihrem Index in
   * der Gesamtliste.
   *
   * ZWEI SPEICHER, ZWEI ZWECKE. Die gemessene Höhe wird (a) unter ihrem Index abgelegt — das
   * ist die WAHRHEIT für diese eine Zeile — und (b) als Höchstwert ihrer Klasse gemerkt — das
   * ist die SCHÄTZUNG für alle Zeilen, die noch nie gerendert wurden. Eine Klassenschätzung
   * allein genügt nicht: bricht EIN langer Name um, sind Zeilen derselben Klasse verschieden
   * hoch, und ein Höchstwert legt die Höhe der umgebrochenen Zeile unter jede andere ihrer
   * Klasse (Fehler = Höhendifferenz × Zeilenzahl der Klasse — bei 1.958 Personenzeilen
   * ~31.000px, kein Rundungsproblem).
   *
   * DER RIEGEL GEGEN DIE SCHAUKEL bleibt und wirkt in beiden Speichern: die Klassenschätzung
   * wächst monoton, die Zeilenhöhe wird nur bei echter Änderung geschrieben und ist bei
   * gegebener Breite konstant. Beide Folgen sind endlich — daran war der zweite Anlauf
   * gestorben (Messung → neues Fenster → andere Zeile gemessen → …, bis Svelte mit
   * `effect_update_depth_exceeded` den Effektbaum abbrach und die Fläche einfror).
   */
  probe(node: HTMLElement, zeile: ZeilenMass): { destroy(): void; update(zeile: ZeilenMass): void };
  /** Gemessene Musterhöhe einer Klasse, `0` solange keine Zeile dieser Klasse stand. */
  height(klasse: string): number;
  /**
   * Die Höhen-Präfixsumme dieser Gruppe: gemessene Höhe je Zeile, wo vorhanden, sonst die
   * Klassenschätzung. `klasseVon(i)` liefert die Höhenklasse der Zeile `i`.
   */
  offsets(count: number, klasseVon: (i: number) => string): Float64Array;
  /** Der Ausschnitt dieser Gruppe aus ihrer Höhen-Präfixsumme. */
  slice(offsets: ArrayLike<number>): WindowSlice;
  /** Position der Gruppe im Scroll-Inhalt (für Tests und die Browser-Prüfung lesbar). */
  readonly top: number;
}

export interface Windowed {
  /**
   * Eine Gruppe im selben Scroll-Container — memoisiert je `key`, damit die zurückgegebenen
   * Actions über die Lebenszeit der Fläche dieselben bleiben. Schlüssel dürfen zur Laufzeit
   * entstehen (eine nach Buchstaben gruppierte Liste kennt ihre Gruppen erst dann).
   */
  section(key: string): WindowedSection;
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
  /** Sperre, solange die gemerkte Position gesetzt wird — s. `onScroll` im Container. */
  let stelltWiederHer = false;

  // --- Gruppen im selben Scroll-Container (ADR-v9-235 Entscheidung 1) --------------------
  // KEIN `$state`-Objekt mit dynamischen Feldnamen, sondern schlichte Maps plus ZWEI Zähler
  // als Reaktivitäts-Quelle. Grund: eine nach Buchstaben gruppierte Liste legt ihre Gruppen
  // erst zur Laufzeit an; ein `$state`-Objekt müsste dafür entweder Felder WÄHREND des
  // Renderns anlegen (unsichere Mutation) oder auf das Proxy-Verhalten bei noch nicht
  // existierenden Feldern wetten. Zwei Zähler sind gröber — jede Messung invalidiert alle
  // Fenster — aber jedes Fenster ist ohnehin eine Division und eine binäre Suche.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const tops = new Map<string, number>();
  /** Musterhöhe je Gruppe UND Höhenklasse (`gruppe::klasse`) — Schätzung fürs Ungerenderte. */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const classHeights = new Map<string, number>();
  /** Zählt jede geänderte Gruppen-Position; `slice` hängt daran. */
  let geometrie = $state(0);

  // --- DER KASKADEN-RIEGEL ----------------------------------------------------------------
  // Eine Messung läuft in einer Svelte-ACTION, also INNERHALB des Render-Takts. Schreibt sie
  // direkt in den reaktiven Zähler, rendert Svelte im selben Takt erneut, misst erneut,
  // schreibt erneut — eine Kette, die Svelte nach ~100 Runden mit
  // `effect_update_depth_exceeded` abbricht. Zweimal real passiert (Listen mit ungleich hohen
  // Zeilen, danach das Kachelraster).
  //
  // Monotonie allein schützt NICHT davor. Sie verhindert die Oszillation (A→B→A), nicht die
  // KASKADE (A→B→C→…, jeder Schritt korrekt und endgültig, aber die Kette ist lang). Bis
  // hierher hing der Schutz allein daran, dass die Schätzung nahe an der Wahrheit liegt — eine
  // Näherung, kein Riegel.
  //
  // Der Riegel: Messungen landen sofort in den Maps (nicht reaktiv), aber der ZÄHLER wird
  // höchstens EINMAL JE FRAME erhöht. Damit ist die Zahl der reaktiven Runden je Render-Takt
  // strukturell auf eins begrenzt — eine lange Korrektur-Folge kostet Frames, nicht Tiefe,
  // und kann den Effektbaum nicht mehr sprengen. Terminierung bleibt wie zuvor: je Zeile eine
  // Höhe, je Klasse ein Höchstwert, beides endlich.
  let ungemeldet = false;
  let meldungGeplant = false;
  function messungMelden() {
    ungemeldet = true;
    if (meldungGeplant) return;
    meldungGeplant = true;
    const melden = () => {
      meldungGeplant = false;
      if (!ungemeldet) return;
      ungemeldet = false;
      messungen++;
    };
    // `requestAnimationFrame`, wo es ihn gibt (Browser) — sonst ein Makrotask (Node im Test).
    // Beides erfüllt den Zweck: den laufenden Render-Takt beenden, bevor neu gerechnet wird.
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(melden);
    else setTimeout(melden, 0);
  }
  // Gemessene Höhe je Zeile, ein `Float64Array` je Gruppe (0 = noch nie gerendert) — die
  // WAHRHEIT. Bewusst kein `$state`: ein Proxy über 20.000 Zahlen wäre teuer und brächte
  // nichts, weil ohnehin die ganze Präfixsumme neu gebaut wird. Die Reaktivität trägt
  // stattdessen `messungen`, ein Zähler.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const rowHeights = new Map<string, Float64Array>();
  let messungen = $state(0);
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
      if (tops.get(key) !== t) {
        tops.set(key, t);
        geometrie++;
      }
    }
  }

  return {
    slice(count: number): WindowSlice {
      return windowSlice({ count, rowHeight, scrollTop, viewportHeight, overscan: options.overscan });
    },

    section(key: string): WindowedSection {
      const vorhanden = sections.get(key);
      if (vorhanden) return vorhanden;

      const messe = (node: HTMLElement, zeile: ZeilenMass) => {
        // `getBoundingClientRect().height`, nicht `offsetHeight`: letzteres rundet auf ganze
        // Pixel, und 0,1px mal 1.958 Zeilen sind 196px falsche Gesamthöhe — die
        // Platzhalter-Zusicherung (ADR-v9-235 Entscheidung 3) wäre verletzt.
        const h = node.getBoundingClientRect().height;
        if (h <= 0) return; // happy-dom/kein Layout: keine Messung ist besser als eine 0
        // (a) Schätzung für ungerenderte Zeilen — monoton, damit die Folge endlich bleibt.
        const feld = `${key}::${zeile.klasse}`;
        if (h > (classHeights.get(feld) ?? 0)) {
          classHeights.set(feld, h);
          messungMelden();
        }
        // (b) Wahrheit für diese eine Zeile. Bei gegebener Breite konstant, die Folge endet
        // also nach dem ersten Schreiben; ein Breitenwechsel schreibt einmal neu.
        const arr = rowHeights.get(key);
        if (arr && zeile.index >= 0 && zeile.index < arr.length && arr[zeile.index] !== h) {
          arr[zeile.index] = h;
          messungMelden();
        }
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

        probe(node: HTMLElement, zeile: ZeilenMass) {
          messe(node, zeile);
          return {
            update(neu: ZeilenMass) {
              messe(node, neu);
            },
            destroy() {},
          };
        },

        height(klasse: string) {
          void messungen;
          return classHeights.get(`${key}::${klasse}`) ?? 0;
        },

        offsets(count: number, klasseVon: (i: number) => string): Float64Array {
          void messungen; // Abhängigkeit von der Messung — sonst friert die Präfixsumme ein
          let arr = rowHeights.get(key);
          if (!arr || arr.length !== count) {
            // Andere Zeilenzahl heißt andere Zeilen: die alten Höhen gehören nicht mehr zu
            // diesen Indizes. Verwerfen ist richtig, die Klassenschätzung trägt derweil.
            arr = new Float64Array(count);
            rowHeights.set(key, arr);
          }
          // Klassenhöhen einmal auflösen statt je Zeile: `classHeights` ist ein
          // `$state`-Proxy, und 20.000 Proxy-Zugriffe wären der teuerste Teil der Schleife.
          const schaetzung: Record<string, number> = {};
          const out = new Float64Array(count + 1);
          for (let i = 0; i < count; i++) {
            let h = arr[i];
            if (h <= 0) {
              const k = klasseVon(i);
              h = schaetzung[k] ?? (schaetzung[k] = classHeights.get(`${key}::${k}`) ?? 0);
            }
            out[i + 1] = out[i] + h;
          }
          return out;
        },

        slice(offsets) {
          void geometrie;
          return windowSliceOffsets({
            offsets,
            scrollTop: scrollTop - (tops.get(key) ?? 0),
            viewportHeight,
            overscan: options.overscan,
          });
        },

        get top() {
          void geometrie;
          return tops.get(key) ?? 0;
        },
      };
      sections.set(key, s);
      return s;
    },

    setSectionMetrics(key, werte) {
      if (werte.top !== undefined) {
        tops.set(key, werte.top);
        geometrie++;
      }
      for (const [klasse, h] of Object.entries(werte.heights ?? {})) {
        classHeights.set(`${key}::${klasse}`, h);
        messungen++;
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
        // WÄHREND der Wiederherstellung NICHT merken: das Setzen von `scrollTop` löst selbst
        // ein Scroll-Ereignis aus, und solange der Inhalt noch nicht seine volle Höhe hat,
        // kürzt der Browser den Wert stillschweigend. Ohne diese Sperre überschriebe die
        // Wiederherstellung ihr eigenes Ziel mit dem gekürzten Wert — und zwar genau einmal,
        // unbemerkt, mit dem Ergebnis „Position fast wiederhergestellt".
        if (!stelltWiederHer) gemerkt = node.scrollTop;
        messeTops();
      };
      node.addEventListener('scroll', onScroll, { passive: true });
      messen();
      // Gemerkte Position wiederherstellen (Spec 21 §5). Das geht NICHT in einem Zug: beim
      // ersten Takt kennt die Fläche noch keine Zeilenhöhe und rendert nur ihr Anfangsfenster
      // (ADR-v9-236 Entscheidung 4) — der Inhalt ist dann zu kurz, und der Browser kürzt ein
      // `scrollTop` über der Höhe auf das Maximum. Deshalb wird es wiederholt versucht, bis
      // der Inhalt hoch genug ist; die Obergrenze verhindert eine Endlosschleife, wenn die
      // Position schlicht nicht mehr erreichbar ist (Liste ist kürzer geworden).
      if (gemerkt > 0) {
        const ziel = gemerkt;
        let versuche = 0;
        const wiederherstellen = () => {
          stelltWiederHer = true;
          node.scrollTop = ziel;
          stelltWiederHer = false;
          scrollTop = node.scrollTop;
          if (node.scrollTop < ziel - 1 && versuche++ < 20) {
            // `requestAnimationFrame` gibt es nicht überall (Node-Umgebung im Test) — dann
            // reicht ein Makrotask: es geht nur darum, dem nächsten Render-Takt Vortritt zu
            // lassen, nicht um Bildsynchronität.
            if (typeof requestAnimationFrame === 'function') requestAnimationFrame(wiederherstellen);
            else setTimeout(wiederherstellen, 0);
          } else {
            gemerkt = node.scrollTop;
          }
        };
        queueMicrotask(wiederherstellen);
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
