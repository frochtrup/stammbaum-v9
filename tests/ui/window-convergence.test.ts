// tests/ui/window-convergence.test.ts — der Wächter für den GEMESSENEN Pfad (BL-311).
//
// WAS HIER ANDERS IST ALS IN JEDEM ANDEREN TEST DIESER ZEILE. Die vorhandenen Tests stellen
// Messwerte über die Naht (`setSectionMetrics`) und prüfen die Arithmetik darüber — sie
// ÜBERBRÜCKEN damit genau den Teil, der zweimal kaputt war ([32 TST-24](../../specs/v9/32-Testframework.md)).
// Der Perf-Wächter misst die Spitze im Anfangsfenster, also den Zustand OHNE Layout. Für den
// eingeschwungenen, gemessenen Zustand gab es bisher nur den menschlichen Browser-Lauf.
//
// DIE EINSICHT, DIE DIESEN TEST MÖGLICH MACHT: untestbar ist das LAYOUT, nicht die
// RÜCKKOPPLUNG. Was die Fläche im Browser tut, ist ein Kreis — Fenster berechnen, die Zeilen
// darin messen, aus den Messwerten das Fenster neu berechnen. Der Kreis braucht kein echtes
// Layout, nur HÖHEN; und die dürfen aus einer Tabelle kommen, solange sie so ungleich sind
// wie die echten. Genau daran ist der Mechanismus zweimal gestorben:
//   * Listen: 34,1px ohne Zweitzeile, 51,1px mit, 66,6px umgebrochen
//   * Kachelraster: 82,4 / 97,4 / 97,9 / 204,9 / 220,4px nebeneinander
// (beides im Browser an `Testdateien/Unsere Familie 2026.ged` gemessen, ADR-v9-236/238).
//
// Der Test fährt diesen Kreis synchron und prüft an JEDER Scroll-Position drei Zusagen:
// Konvergenz (er endet), Deckung (kein Loch im Sichtbereich) und die Platzhalter-Zusicherung
// (ADR-v9-235 Entscheidung 3). Was er NICHT ersetzt: dass der Browser die Höhen so misst, wie
// hier angenommen — dafür bleibt der Browser-Lauf. Er ersetzt aber die Hoffnung, dass der
// Kreis bei ungleichen Höhen konvergiert.
import { describe, expect, it } from 'vitest';
import { createWindowed } from '../../ui/shell/windowed.svelte';

/** Zeilen-Attrappe mit gestellter Höhe — mehr braucht `probe` nicht. */
function zeile(hoehe: number): HTMLElement {
  return { getBoundingClientRect: () => ({ height: hoehe }) } as unknown as HTMLElement;
}

/** Wie oft der Kreis je Scroll-Position umlaufen darf, bevor er als „dreht sich" gilt. */
const RATSCHE_RUNDEN = 6;

interface Fall {
  name: string;
  hoehen: number[];
  klasseVon: (i: number) => string;
}

/**
 * Fährt den echten Kreis: Fenster holen → jede Zeile DARIN messen → wiederholen, bis sich
 * nichts mehr ändert. Genau das tut die Fläche im Browser, nur dass dort Svelte das Rendern
 * dazwischenschiebt.
 */
function einschwingen(sec: ReturnType<ReturnType<typeof createWindowed>['section']>, fall: Fall) {
  let runden = 0;
  let vorher = '';
  for (;;) {
    const offsets = sec.offsets(fall.hoehen.length, fall.klasseVon);
    const win = sec.slice(offsets);
    const kennung = `${win.start}:${win.end}:${offsets[fall.hoehen.length]}`;
    if (kennung === vorher) return { runden, offsets, win };
    vorher = kennung;
    for (let i = win.start; i < win.end; i++) {
      sec.probe(zeile(fall.hoehen[i]), { klasse: fall.klasseVon(i), index: i });
    }
    if (++runden > 50) return { runden, offsets, win, gedreht: true };
  }
}

const FAELLE: Fall[] = [
  {
    // Trefferliste: zwei Datenklassen, dazu jede elfte Zeile umgebrochen — der Fall, an dem
    // die Klassenhöhe allein gescheitert ist (eine umgebrochene Zeile vergiftet ihre Klasse).
    name: 'Liste, zwei Klassen plus Umbrüche',
    hoehen: Array.from({ length: 1_200 }, (_, i) => (i % 11 === 0 ? 66.6 : i % 3 === 0 ? 34.1 : 51.1)),
    klasseVon: (i) => (i % 3 === 0 ? 'eins' : 'zwei'),
  },
  {
    // Kachelraster: Reihen mit Miniatur sind mehr als doppelt so hoch. Die Schätzung liegt
    // deshalb weit neben der Wahrheit — die Konstellation, die die Kaskade ausgelöst hat.
    name: 'Raster, Reihen mit und ohne Miniatur',
    hoehen: Array.from({ length: 400 }, (_, i) =>
      i % 5 === 0 ? 220.4 : i % 5 === 1 ? 204.9 : i % 5 === 2 ? 97.9 : i % 5 === 3 ? 97.4 : 82.4,
    ),
    klasseVon: (i) => (i % 5 <= 1 ? 'bild' : 'text'),
  },
  {
    // Der bösartige Fall: EINE sehr hohe Zeile ganz hinten. Ihre Klasse wird dadurch für alle
    // anderen überschätzt — der Fehler, der auf der Personen-Gruppe ~31.000px betrug.
    name: 'eine Ausreißer-Zeile am Ende',
    hoehen: Array.from({ length: 800 }, (_, i) => (i === 799 ? 300 : 51.1)),
    klasseVon: () => 'zeile',
  },
];

describe('Wiederholte Sprünge zwischen weit entfernten Stellen enden (ADR-v9-236)', () => {
  // Zwischen zwei weit auseinanderliegenden Stellen liegt eine große NIE GERENDERTE Mitte —
  // dort trägt allein die Klassen-Schätzung, und die sieht abwechselnd flache und hohe Zeilen.
  //
  // BEFUND BEIM ROT-TESTEN DIESES FALLS (2026-08-09): dieser Test bleibt auch dann grün, wenn
  // man die MONOTONIE der Klassen-Schätzung entfernt. Seit jede gerenderte Zeile ihre eigene
  // Höhe trägt, ist die Monotonie nicht mehr die tragende Zusicherung — das sind
  // Zeilen-Stabilität (eine Höhe je Zeile, bei gegebener Breite konstant) und die Bündelung
  // je Frame (ADR-v9-238). Die monotone Übernahme bleibt trotzdem stehen: sie kostet nichts,
  // und „mein Test hat es nicht gefangen" ist kein Beleg für Entbehrlichkeit — genau dieser
  // Umkehrschluss hat den Browser-Spike dieser Zeile entwertet.
  const hoehen = Array.from({ length: 2_000 }, (_, i) => (i < 1_000 ? 34.1 : 90));
  const klasseVon = () => 'zeile'; // EINE Klasse, absichtlich: sie muss beide Höhen tragen

  it('Sprünge zwischen zwei weit entfernten Stellen enden trotzdem', () => {
    const w = createWindowed();
    const sec = w.section('s');
    w.setMetrics({ viewportHeight: 800 });
    const fall: Fall = { name: 'sprung', hoehen, klasseVon };

    let maxRunden = 0;
    for (let n = 0; n < 12; n++) {
      w.setMetrics({ scrollTop: n % 2 === 0 ? 2_000 : 100_000 });
      const { runden, gedreht } = einschwingen(sec, fall);
      expect(gedreht, `dreht sich beim ${n}. Sprung`).toBeUndefined();
      maxRunden = Math.max(maxRunden, runden);
    }
    expect(maxRunden, 'Runden je Sprung über der Ratsche').toBeLessThanOrEqual(RATSCHE_RUNDEN);
  });
});

describe('Der gemessene Pfad konvergiert und deckt (BL-311, ADR-v9-236/238)', () => {
  for (const fall of FAELLE) {
    const gesamt = fall.hoehen.reduce((a, b) => a + b, 0);
    const VIEWPORT = 800;

    it(`${fall.name}: der Kreis endet an jeder Position`, () => {
      const w = createWindowed();
      const sec = w.section('s');
      w.setMetrics({ viewportHeight: VIEWPORT });

      let maxRunden = 0;
      for (let scrollTop = 0; scrollTop < gesamt; scrollTop += 733) {
        w.setMetrics({ scrollTop });
        const { runden, gedreht } = einschwingen(sec, fall);
        expect(gedreht, `dreht sich bei scrollTop=${scrollTop}`).toBeUndefined();
        maxRunden = Math.max(maxRunden, runden);
      }
      expect(maxRunden, 'Runden je Position über der Ratsche').toBeLessThanOrEqual(RATSCHE_RUNDEN);
    });

    it(`${fall.name}: kein Loch im Sichtbereich, Platzhalter tragen den Rest`, () => {
      const w = createWindowed();
      const sec = w.section('s');
      w.setMetrics({ viewportHeight: VIEWPORT });

      let geprueft = 0;
      for (let scrollTop = 0; scrollTop < gesamt - VIEWPORT; scrollTop += 733) {
        w.setMetrics({ scrollTop });
        const { offsets, win } = einschwingen(sec, fall);
        const modell = offsets[fall.hoehen.length];

        // (a) Deckung: das Fenster reicht über den Sichtbereich hinaus — sonst sähe der
        //     Nutzer eine Lücke, und genau das war der ursprüngliche Befund dieser Zeile.
        expect(offsets[win.start], `oben, scrollTop=${scrollTop}`).toBeLessThanOrEqual(scrollTop);
        expect(offsets[win.end], `unten, scrollTop=${scrollTop}`).toBeGreaterThanOrEqual(scrollTop + VIEWPORT);

        // (b) Platzhalter-Zusicherung (ADR-v9-235 Entscheidung 3): Platzhalter plus Fenster
        //     ergeben die modellierte Gesamthöhe — sonst lügt der Scroll-Weg über die Menge.
        const fenster = offsets[win.end] - offsets[win.start];
        expect(win.padTop + fenster + win.padBottom, `Summe, scrollTop=${scrollTop}`).toBeCloseTo(modell, 6);
        geprueft++;
      }
      expect(geprueft, 'es wurde überhaupt geprüft').toBeGreaterThan(5); // ADR-v9-200
    });

    it(`${fall.name}: nach einem Durchlauf ist das Modell die Wahrheit`, () => {
      const w = createWindowed();
      const sec = w.section('s');
      w.setMetrics({ viewportHeight: VIEWPORT });

      // Einmal durchscrollen — danach war jede Zeile mindestens einmal im Fenster und trägt
      // ihre GEMESSENE Höhe. Die Klassenschätzung ist dann nirgends mehr im Spiel.
      for (let scrollTop = 0; scrollTop <= gesamt; scrollTop += VIEWPORT / 2) {
        w.setMetrics({ scrollTop });
        einschwingen(sec, fall);
      }
      const offsets = sec.offsets(fall.hoehen.length, fall.klasseVon);
      expect(offsets[fall.hoehen.length]).toBeCloseTo(gesamt, 6);
    });
  }
});
