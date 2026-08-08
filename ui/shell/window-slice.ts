// ui/shell/window-slice.ts — die Arithmetik des virtuellen Scrollens (BL-311, ADR-v9-234).
//
// Reine Funktion, kein DOM, kein Zustand: aus „wie viele Zeilen, wie hoch ist eine, wo steht
// der Scroll-Balken, wie hoch ist das Fenster" folgt, WELCHE Zeilen gerendert werden und wie
// hoch die Platzhalter darüber und darunter sein müssen. Damit ist der Kern der Sache
// build-frei testbar (INV-ARCH-2) und die Svelte-Seite trägt nur noch Messwerte und Listener.
//
// EINE HÖHE JE ZEILE, GEMESSEN STATT GERATEN. Spec 30 §1 nennt „O(log n)-Positionsbestimmung",
// also die binäre Suche in einer Höhen-Präfixsumme für ungleich hohe Zeilen. Diese Fassung
// nimmt bewusst EINE Höhe für alle Zeilen einer Fläche und lässt sie zur Laufzeit messen (die
// erste gerenderte Zeile). Begründung: die Zeilen einer Index-Fläche sind gleichförmig gebaut
// (Symbol · Name · Zahlenspalte), die Abweichung liegt bei einzelnen Pixeln, und die
// Positionsbestimmung ist damit O(1) statt O(log n) — schneller als die Zusicherung, ohne
// Höhen-Buchhaltung. Wo eine Fläche später WIRKLICH ungleich hohe Zeilen bekommt (etwa
// Gruppen-Kopfzeilen zwischen den Zeilen), trägt `windowSlice` das über `headerHeight`: eine
// zweite Höhe, keine Liste von Höhen.
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

/**
 * Dasselbe für eine Liste mit Kopfzeilen ANDERER Höhe (Buchstaben-Trenner, Gruppen-Header).
 * Die Positionsbestimmung bleibt O(1), weil nur ZWEI Höhen vorkommen und die Zahl der
 * Kopfzeilen vor einem Index als Präfixsumme mitgegeben wird — die Rechnung ist dann eine
 * Division, keine Suche.
 *
 * `headerBefore(i)` liefert, wie viele Kopfzeilen VOR Index `i` liegen. Die Schale baut diese
 * Funktion aus ihrer flachen Zeilenliste (ein `Uint32Array` reicht) — hier bleibt sie ein
 * Parameter, damit dieses Modul DOM- und datenfrei bleibt.
 */
export function windowSliceMixed(
  input: WindowInput & { headerHeight: number; headerCount: number; headerBefore: (i: number) => number },
): WindowSlice {
  const { count, rowHeight, headerHeight, headerCount, headerBefore } = input;
  if (count <= 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 };
  if (!Number.isFinite(rowHeight) || rowHeight <= 0) {
    return { start: 0, end: count, padTop: 0, padBottom: 0 };
  }
  // Mittlere Höhe: aus ihr folgt der Startindex direkt. Der Fehler daraus ist kleiner als das
  // Overscan-Fenster — deshalb genügt sie, statt eine Präfixsumme zu durchsuchen.
  const gesamt = (count - headerCount) * rowHeight + headerCount * headerHeight;
  const mittel = gesamt / count;
  const grob = windowSlice({ ...input, rowHeight: mittel });
  const kopfVorStart = headerBefore(grob.start);
  const kopfVorEnde = headerBefore(grob.end);
  return {
    start: grob.start,
    end: grob.end,
    padTop: (grob.start - kopfVorStart) * rowHeight + kopfVorStart * headerHeight,
    padBottom:
      (count - grob.end - (headerCount - kopfVorEnde)) * rowHeight +
      (headerCount - kopfVorEnde) * headerHeight,
  };
}
