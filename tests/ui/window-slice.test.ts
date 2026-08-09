// tests/ui/window-slice.test.ts — die Arithmetik des virtuellen Scrollens (BL-311,
// ADR-v9-234). Reine Funktion, deshalb ohne DOM: environment 'node' (INV-ARCH-2).
//
// Geprüft werden die Fälle, die im Betrieb wirklich vorkommen — nicht die schönen: Container
// noch nicht gemessen, Zeilenhöhe noch unbekannt, Scroll-Position hinter dem Listenende,
// leere Liste. Ein Fenster, das in einem dieser Fälle „nichts" liefert, zeigt eine leere
// Liste, und das wäre schlimmer als ein zu großes Fenster.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OVERSCAN,
  ERSTES_FENSTER,
  buildOffsets,
  windowSlice,
  windowSliceOffsets,
} from '../../ui/shell/window-slice';

describe('windowSlice — Grundfall', () => {
  it('rendert bei 20.000 Zeilen nur das Fenster plus Overscan', () => {
    const s = windowSlice({ count: 20_000, rowHeight: 40, scrollTop: 0, viewportHeight: 800 });
    // 800/40 = 20 sichtbare Zeilen, +1 halbe, + 2×8 Overscan → 37; oben keine (start 0).
    expect(s.start).toBe(0);
    expect(s.end).toBe(37);
    expect(s.padTop).toBe(0);
    expect(s.padBottom).toBe((20_000 - 37) * 40);
  });

  it('die Summe aus Platzhaltern und Fenster ergibt IMMER die Gesamthöhe', () => {
    for (const scrollTop of [0, 40, 1_000, 399_000, 799_960]) {
      const s = windowSlice({ count: 20_000, rowHeight: 40, scrollTop, viewportHeight: 800 });
      const gesamt = s.padTop + (s.end - s.start) * 40 + s.padBottom;
      expect(gesamt, `scrollTop=${scrollTop}`).toBe(20_000 * 40);
    }
  });

  it('scrollt mit: das Fenster wandert, die GERENDERTE ZEILENZAHL bleibt konstant', () => {
    const oben = windowSlice({ count: 10_000, rowHeight: 50, scrollTop: 0, viewportHeight: 500 });
    const mitte = windowSlice({ count: 10_000, rowHeight: 50, scrollTop: 250_000, viewportHeight: 500 });
    expect(mitte.start).toBeGreaterThan(oben.end);
    // 500/50 = 10 sichtbare Zeilen, +1 für die halben oben/unten, + 2×8 Overscan = 27.
    // Am Listenanfang wird das obere Overscan NICHT eingespart, sondern unten angehängt:
    // `end` hängt an `start + Fenster + 2×overscan`, nicht an der Scroll-Position. Absicht —
    // eine konstante Knotenzahl erspart dem Browser das Auf- und Abbauen von Zeilen bei
    // jedem Scroll-Takt, und sie ist die Zahl, die der Wächter (list-render.perf) misst.
    expect(mitte.end - mitte.start).toBe(27);
    expect(oben.end - oben.start).toBe(27);
  });

  it('overscan ist einstellbar und wirkt nach oben UND unten', () => {
    const s = windowSlice({ count: 1_000, rowHeight: 20, scrollTop: 2_000, viewportHeight: 200, overscan: 2 });
    expect(s.start).toBe(100 - 2);
    expect(s.end).toBe(s.start + Math.ceil(200 / 20) + 1 + 4);
    expect(DEFAULT_OVERSCAN).toBe(8);
  });
});

describe('windowSlice — die Fälle, die im Betrieb auftreten', () => {
  it('leere Liste: nichts zu rendern, keine Platzhalter', () => {
    expect(windowSlice({ count: 0, rowHeight: 40, scrollTop: 0, viewportHeight: 800 })).toEqual({
      start: 0,
      end: 0,
      padTop: 0,
      padBottom: 0,
    });
  });

  it('Zeilenhöhe noch nicht gemessen: ALLES rendern, nicht nichts', () => {
    // Der Fall beim ersten Takt: die Schale kennt die Zeilenhöhe erst, wenn eine Zeile steht.
    for (const rowHeight of [0, -1, Number.NaN]) {
      const s = windowSlice({ count: 500, rowHeight, scrollTop: 0, viewportHeight: 800 });
      expect(s, `rowHeight=${rowHeight}`).toEqual({ start: 0, end: 500, padTop: 0, padBottom: 0 });
    }
  });

  it('Container noch nicht gemessen (Höhe 0): mindestens eine Zeile rendern', () => {
    const s = windowSlice({ count: 500, rowHeight: 40, scrollTop: 0, viewportHeight: 0 });
    expect(s.end).toBeGreaterThan(s.start);
  });

  it('Scroll-Position hinter dem Listenende: Fenster bleibt in der Liste', () => {
    const s = windowSlice({ count: 100, rowHeight: 40, scrollTop: 999_999, viewportHeight: 800 });
    expect(s.start).toBeLessThan(100);
    expect(s.end).toBe(100);
    expect(s.padBottom).toBe(0);
  });

  it('negative Scroll-Position (iOS-Überdehnung) verhält sich wie 0', () => {
    const a = windowSlice({ count: 100, rowHeight: 40, scrollTop: -120, viewportHeight: 400 });
    const b = windowSlice({ count: 100, rowHeight: 40, scrollTop: 0, viewportHeight: 400 });
    expect(a).toEqual(b);
  });

  it('kurze Liste: alles im Fenster, keine Platzhalter', () => {
    const s = windowSlice({ count: 5, rowHeight: 40, scrollTop: 0, viewportHeight: 800 });
    expect(s).toEqual({ start: 0, end: 5, padTop: 0, padBottom: 0 });
  });
});

describe('windowSliceOffsets — ungleich hohe Zeilen (die Fassung, die NFR-1 woertlich erfuellt)', () => {
  /** 1.000 Zeilen im echten Mischungsverhaeltnis der Suchtreffer: mal mit, mal ohne Zweitzeile. */
  const hoehen = Array.from({ length: 1_000 }, (_, i) => (i % 3 === 0 ? 34.1 : 51.1));
  const offsets = buildOffsets(hoehen);
  const gesamt = hoehen.reduce((a, b) => a + b, 0);

  it('buildOffsets liefert die Oberkanten und als letzten Eintrag die Gesamthoehe', () => {
    expect(offsets.length).toBe(hoehen.length + 1);
    expect(offsets[0]).toBe(0);
    expect(offsets[1]).toBeCloseTo(34.1, 6);
    expect(offsets[1_000]).toBeCloseTo(gesamt, 6);
  });

  it('Platzhalter und Fenster ergeben an JEDER Position exakt die Gesamthoehe', () => {
    for (const scrollTop of [0, 1_000, 12_345, 30_000, gesamt]) {
      const s = windowSliceOffsets({ offsets, scrollTop, viewportHeight: 800 });
      const fenster = offsets[s.end] - offsets[s.start];
      expect(s.padTop + fenster + s.padBottom, `scrollTop=${scrollTop}`).toBeCloseTo(gesamt, 6);
    }
  });

  it('das Fenster deckt den sichtbaren Bereich wirklich ab — an keiner Position ein Loch', () => {
    for (let scrollTop = 0; scrollTop < gesamt - 800; scrollTop += 997) {
      const s = windowSliceOffsets({ offsets, scrollTop, viewportHeight: 800 });
      expect(s.padTop, `oben, scrollTop=${scrollTop}`).toBeLessThanOrEqual(scrollTop);
      expect(offsets[s.end], `unten, scrollTop=${scrollTop}`).toBeGreaterThanOrEqual(scrollTop + 800);
    }
  });

  it('Overscan wirkt: das Fenster beginnt frueher und endet spaeter als der Sichtbereich', () => {
    const s = windowSliceOffsets({ offsets, scrollTop: 20_000, viewportHeight: 800 });
    const ohne = windowSliceOffsets({ offsets, scrollTop: 20_000, viewportHeight: 800, overscan: 0 });
    expect(ohne.start - s.start).toBe(DEFAULT_OVERSCAN);
    expect(s.end - ohne.end).toBe(DEFAULT_OVERSCAN);
  });

  it('noch keine Hoehe gemessen: ein ANFANGSFENSTER — nicht nichts und nicht alles', () => {
    // Nicht nichts: eine leere Liste sieht aus wie Datenverlust. Nicht alles: das waren am
    // Realbestand 3.203 Zeilen im ersten Takt und bei der 20.000er-Zusicherung ~140.000
    // Knoten, also genau die Spitze, gegen die es das Fenster gibt (ADR-v9-236).
    const leer = buildOffsets(new Array(500).fill(0));
    const s = windowSliceOffsets({ offsets: leer, scrollTop: 0, viewportHeight: 800 });
    expect(s.start).toBe(0);
    expect(s.end).toBe(ERSTES_FENSTER);
    expect(s.padTop + s.padBottom).toBe(0); // ohne Hoehen gibt es nichts zu polstern
  });

  it('kuerzere Liste als das Anfangsfenster: alles, aber nicht mehr als da ist', () => {
    const leer = buildOffsets(new Array(12).fill(0));
    const s = windowSliceOffsets({ offsets: leer, scrollTop: 0, viewportHeight: 800 });
    expect(s.end).toBe(12);
  });

  it('leere Liste: nichts zu rendern, keine Platzhalter', () => {
    const s = windowSliceOffsets({ offsets: buildOffsets([]), scrollTop: 0, viewportHeight: 800 });
    expect(s).toEqual({ start: 0, end: 0, padTop: 0, padBottom: 0 });
  });

  it('Scroll-Position hinter dem Listenende und negativ: Fenster bleibt in der Liste', () => {
    const hinten = windowSliceOffsets({ offsets, scrollTop: gesamt * 2, viewportHeight: 800 });
    expect(hinten.end).toBe(1_000);
    expect(hinten.padBottom).toBe(0);
    const vorn = windowSliceOffsets({ offsets, scrollTop: -400, viewportHeight: 800 });
    expect(vorn.start).toBe(0);
    expect(vorn.padTop).toBe(0);
  });

  it('Container noch nicht gemessen (Hoehe 0): mindestens eine Zeile rendern', () => {
    const s = windowSliceOffsets({ offsets, scrollTop: 0, viewportHeight: 0 });
    expect(s.end).toBeGreaterThan(s.start);
  });
});
