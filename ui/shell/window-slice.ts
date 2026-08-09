// ui/shell/window-slice.ts — die Arithmetik des virtuellen Scrollens (BL-311, ADR-v9-234).
//
// Reine Funktion, kein DOM, kein Zustand: aus „wie viele Zeilen, wie hoch ist eine, wo steht
// der Scroll-Balken, wie hoch ist das Fenster" folgt, WELCHE Zeilen gerendert werden und wie
// hoch die Platzhalter darüber und darunter sein müssen. Damit ist der Kern der Sache
// build-frei testbar (INV-ARCH-2) und die Svelte-Seite trägt nur noch Messwerte und Listener.
//
// ZWEI FASSUNGEN, WEIL DIE ZEILEN NICHT GLEICH HOCH SIND. `windowSlice` rechnet mit EINER
// Höhe (O(1), eine Division) und passt für Flächen, deren Zeilen wirklich gleichförmig sind.
// `windowSliceOffsets` rechnet mit einer PRÄFIXSUMME der Zeilen-Oberkanten und einer binären
// Suche — das ist wörtlich, was Spec 30 §1 NFR-1 unter „O(log n)-Positionsbestimmung" fordert.
//
// Warum die Präfixsumme doch gebraucht wird (ADR-v9-235 Entscheidung 2 nahm das Gegenteil an,
// am Realbestand widerlegt, s. ADR-v9-236): eine Suchtreffer-Zeile ist 34,1px hoch, wenn die
// Person keine Datumszeile hat, und 51,1px, wenn sie eine hat — 50% Unterschied, nicht
// „einzelne Pixel". Mit einer einzigen Höhe war die modellierte Gesamthöhe 16% zu kurz, und
// die Messung an den echten Zeilen schaukelte sich auf, bis Svelte den Effektbaum abbrach
// (`effect_update_depth_exceeded`). Die Klasse einer Zeile steht in den DATEN (hat sie eine
// Zweitzeile?), gemessen wird nur EINE Musterhöhe je Klasse — daraus die Präfixsumme.
//
// Was hier NICHT steht: Scroll-Listener, ResizeObserver, `scrollTop`-Wiederherstellung. Das
// ist Sache der Schale (`ui/shell/windowed.svelte.ts`).

export interface WindowSlice {
  /** Erster zu rendernder Index (inklusive). */
  start: number;
  /** Erster NICHT mehr zu rendernder Index (exklusive) — wie bei `Array.slice`. */
  end: number;
  /** Höhe des Platzhalters ÜBER dem Fenster in Pixel. */
  padTop: number;
  /** Höhe des Platzhalters UNTER dem Fenster in Pixel. */
  padBottom: number;
}

export interface WindowInput {
  /** Zeilenzahl der ganzen Liste. */
  count: number;
  /** Gemessene Höhe einer Zeile in Pixel (> 0). */
  rowHeight: number;
  /** Aktuelle Scroll-Position des Containers. */
  scrollTop: number;
  /** Sichtbare Höhe des Containers. */
  viewportHeight: number;
  /**
   * Zusätzliche Zeilen ober- und unterhalb des Fensters. Sie sind der Grund, warum beim
   * Scrollen kein weißer Streifen auftaucht: der Browser rendert den nächsten Bereich schon,
   * bevor er sichtbar wird. 8 ist die Vorgabe — mehr kostet Knoten, weniger flackert.
   */
  overscan?: number;
}

export const DEFAULT_OVERSCAN = 8;

/**
 * Wie viele Zeilen gerendert werden, solange keine einzige Höhe gemessen ist — der erste
 * Takt, und nur er.
 *
 * Die Zahl ist bewusst KEINE Höhenschätzung: sie beantwortet nur „wie viele Zeilen müssen
 * dastehen, damit (a) der Sichtbereich für einen Takt plausibel gefüllt ist und (b) die
 * Messsonden überhaupt etwas zu messen haben". Selbst wenn sie zu klein wäre, ist die Folge
 * ein einziger Takt mit zu wenig Inhalt, kein falsches Ergebnis — die Korrektheit hängt
 * nicht an ihr. 60 Zeilen decken auch bei einer sehr flachen Zeile (24px) einen 1.400px
 * hohen Sichtbereich ab.
 */
export const ERSTES_FENSTER = 60;

/**
 * Berechnet das zu rendernde Fenster. Robust gegen die Werte, die im echten Betrieb
 * vorkommen: `viewportHeight === 0` (Container noch nicht gemessen — dann wird ein
 * Mindestfenster gerendert, damit die erste Zeile ihre Höhe überhaupt hergeben kann),
 * `scrollTop` jenseits des Endes (nach dem Kürzen der Liste), `rowHeight <= 0` (noch nicht
 * gemessen — dann rendert die Fläche ALLES, was ohne Messung die einzige richtige Antwort
 * ist: lieber kurz teuer als leer).
 */
export function windowSlice(input: WindowInput): WindowSlice {
  const { count, rowHeight, scrollTop, viewportHeight } = input;
  const overscan = input.overscan ?? DEFAULT_OVERSCAN;

  if (count <= 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 };
  if (!Number.isFinite(rowHeight) || rowHeight <= 0) {
    // Ohne gemessene Zeilenhöhe gibt es kein Fenster — alles rendern, die Schale misst
    // beim nächsten Takt und schneidet dann zu.
    return { start: 0, end: count, padTop: 0, padBottom: 0 };
  }

  const sichtbar = Math.max(viewportHeight, rowHeight); // mind. eine Zeile, s. Docstring
  const ersteSichtbare = Math.floor(Math.max(scrollTop, 0) / rowHeight);
  const zeilenImFenster = Math.ceil(sichtbar / rowHeight) + 1; // +1: halbe Zeile oben/unten

  const start = Math.max(0, Math.min(count - 1, ersteSichtbare - overscan));
  const end = Math.min(count, start + zeilenImFenster + 2 * overscan);

  return {
    start,
    end,
    padTop: start * rowHeight,
    padBottom: (count - end) * rowHeight,
  };
}

export interface OffsetWindowInput {
  /**
   * Oberkante jeder Zeile als Präfixsumme: `offsets[i]` ist der Abstand der Zeile `i` vom
   * Listenanfang, `offsets[count]` die Gesamthöhe. Die Länge ist also `count + 1`. Die
   * aufrufende Fläche baut sie aus ihren Daten (welche Zeile hat welche Höhenklasse) und
   * EINER gemessenen Musterhöhe je Klasse — ein `Float64Array` reicht, auch bei 20.000
   * Zeilen (160 KB, einmal je Anfrage gebaut).
   */
  offsets: ArrayLike<number>;
  scrollTop: number;
  viewportHeight: number;
  overscan?: number;
}

/**
 * Das Fenster über UNGLEICH hohen Zeilen — die Fassung, die NFR-1 wörtlich erfüllt:
 * binäre Suche in der Höhen-Präfixsumme, O(log n).
 *
 * Sie ist der Präzisions-Gewinn gegenüber `windowSlice`: die Platzhalter sind hier nicht
 * gerechnet, sondern ABGELESEN (`padTop = offsets[start]`), also exakt — was immer die
 * Fläche in die Präfixsumme geschrieben hat, steht danach auch im Scrollbalken.
 */
export function windowSliceOffsets(input: OffsetWindowInput): WindowSlice {
  const { offsets, scrollTop, viewportHeight } = input;
  const overscan = input.overscan ?? DEFAULT_OVERSCAN;
  const count = offsets.length - 1;

  if (count <= 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 };
  const gesamt = offsets[count];
  if (!Number.isFinite(gesamt) || gesamt <= 0) {
    // Noch keine Höhe gemessen. NICHT nichts rendern (das sähe aus wie Datenverlust) — aber
    // auch nicht alles: „alles" hieß am Realbestand 3.203 Zeilen im ersten Takt und bei der
    // 20.000er-Zusicherung ~140.000 Knoten, also genau die Spitze, gegen die es das Fenster
    // gibt. Ein ANFANGSFENSTER löst beides: es füllt den Sichtbereich, gibt den Messsonden
    // etwas zu messen, und im nächsten Takt steht die echte Höhe.
    return { start: 0, end: Math.min(count, ERSTES_FENSTER), padTop: 0, padBottom: 0 };
  }

  const oben = Math.min(Math.max(scrollTop, 0), gesamt);
  const unten = oben + Math.max(viewportHeight, 0);
  const ersteSichtbare = letzteZeileOberhalb(offsets, count, oben);
  const letzteSichtbare = letzteZeileOberhalb(offsets, count, unten);

  const start = Math.max(0, ersteSichtbare - overscan);
  const end = Math.max(start + 1, Math.min(count, letzteSichtbare + 1 + overscan));

  return {
    start,
    end,
    padTop: offsets[start],
    padBottom: gesamt - offsets[end],
  };
}

/** Größter Index `i` mit `offsets[i] <= ziel` — die binäre Suche hinter NFR-1s O(log n). */
function letzteZeileOberhalb(offsets: ArrayLike<number>, count: number, ziel: number): number {
  let lo = 0;
  let hi = count;
  while (lo < hi) {
    const mitte = (lo + hi + 1) >> 1;
    if (offsets[mitte] <= ziel) lo = mitte;
    else hi = mitte - 1;
  }
  return lo;
}

/**
 * Baut die Präfixsumme aus den Höhen der einzelnen Zeilen. Steht hier statt in der Fläche,
 * damit jede Fläche dieselbe Rechnung benutzt (INV-UI-4) — und damit sie build-frei geprüft
 * ist: eine falsche Präfixsumme wäre eine Lüge über die Datenmenge, die niemand sieht.
 */
export function buildOffsets(heights: ArrayLike<number>): Float64Array {
  const offsets = new Float64Array(heights.length + 1);
  for (let i = 0; i < heights.length; i++) {
    const h = heights[i];
    offsets[i + 1] = offsets[i] + (Number.isFinite(h) && h > 0 ? h : 0);
  }
  return offsets;
}
