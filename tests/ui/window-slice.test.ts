// tests/ui/window-slice.test.ts — die Arithmetik des virtuellen Scrollens (BL-311,
// ADR-v9-234). Reine Funktion, deshalb ohne DOM: environment 'node' (INV-ARCH-2).
//
// Geprüft werden die Fälle, die im Betrieb wirklich vorkommen — nicht die schönen: Container
// noch nicht gemessen, Zeilenhöhe noch unbekannt, Scroll-Position hinter dem Listenende,
// leere Liste. Ein Fenster, das in einem dieser Fälle „nichts" liefert, zeigt eine leere
// Liste, und das wäre schlimmer als ein zu großes Fenster.
import { describe, expect, it } from 'vitest';
import { DEFAULT_OVERSCAN, windowSlice, windowSliceMixed } from '../../ui/shell/window-slice';

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

describe('windowSliceMixed — zwei Höhen (Zeilen + Kopfzeilen)', () => {
  /** 1.000 Einträge, jede zehnte eine Kopfzeile (Buchstaben-Trenner). */
  const count = 1_000;
  const headerCount = 100;
  const headerBefore = (i: number) => Math.min(headerCount, Math.ceil(i / 10));

  it('Platzhalter und Fenster ergeben die Gesamthöhe (beide Höhen berücksichtigt)', () => {
    const gesamt = (count - headerCount) * 40 + headerCount * 24;
    for (const scrollTop of [0, 5_000, 20_000, 37_000]) {
      const s = windowSliceMixed({
        count,
        rowHeight: 40,
        headerHeight: 24,
        headerCount,
        headerBefore,
        scrollTop,
        viewportHeight: 800,
      });
      const kopfImFenster = headerBefore(s.end) - headerBefore(s.start);
      const fenster = (s.end - s.start - kopfImFenster) * 40 + kopfImFenster * 24;
      expect(s.padTop + fenster + s.padBottom, `scrollTop=${scrollTop}`).toBe(gesamt);
    }
  });

  it('ohne gemessene Zeilenhöhe: alles rendern', () => {
    const s = windowSliceMixed({
      count,
      rowHeight: 0,
      headerHeight: 24,
      headerCount,
      headerBefore,
      scrollTop: 0,
      viewportHeight: 800,
    });
    expect(s.end).toBe(count);
  });
});
