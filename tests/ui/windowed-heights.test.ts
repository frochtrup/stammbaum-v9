// tests/ui/windowed-heights.test.ts — das Höhenmodell des virtuellen Scrollens (BL-311,
// ADR-v9-236). Kein DOM nötig: `probe` bekommt Attrappen mit gestellter Höhe, alles Weitere
// ist Arithmetik (TST-5: Logik so tief wie möglich testen).
//
// WARUM ES DIESE DATEI GIBT. Der Fehler, an dem diese Zeile zweimal gescheitert ist, saß
// NICHT im Layout, sondern in der RÜCKKOPPLUNG: die Messung speiste den Zustand, aus dem sie
// folgte, und schaukelte sich auf, bis Svelte den Effektbaum abbrach. [32 TST-24] hat daraus
// „braucht einen Browser-Beleg" gemacht — richtig für die Messung selbst, aber irreführend
// für die Instabilität: eine Naht, die einen Wert EINMAL stellt, lehrt nichts; eine, die eine
// FOLGE von Werten stellt, reproduziert den Bug ohne jedes Layout. Genau das tut der erste
// Block hier.
//
// Kein Realbestand, nirgends: die Höhen stehen als Zahlen in der Datei (TST-23 — der
// Realbestand ist Finder, nicht Zeuge; er hat die KLASSE gezeigt, festgenagelt wird sie hier).
import { describe, expect, it } from 'vitest';
import { createWindowed } from '../../ui/shell/windowed.svelte';

/** Eine Zeilen-Attrappe, die genau eine Höhe hergibt — mehr braucht `probe` nicht. */
function zeile(hoehe: number): HTMLElement {
  return { getBoundingClientRect: () => ({ height: hoehe }) } as unknown as HTMLElement;
}

describe('Höhenmessung terminiert (der Riegel gegen die Schaukel, ADR-v9-236 Entscheidung 3)', () => {
  it('nimmt den größten Wert und hört dann auf, sich zu ändern', () => {
    const w = createWindowed();
    const sec = w.section('g');

    // Die Folge, die im Browser entstand: das Fenster wandert, mal steht eine flache, mal
    // eine hohe Zeile an erster Stelle. Eine Übernahme „bei jeder Abweichung" schreibt hier
    // ewig weiter — und genau das hat Svelte mit `effect_update_depth_exceeded` beendet.
    const folge = [34.1, 51.1, 34.1, 51.1, 34.1, 51.1, 34.1, 51.1];
    const werte: number[] = [];
    for (const h of folge) {
      sec.probe(zeile(h), { klasse: 'eins', index: 0 });
      werte.push(sec.height('eins'));
    }

    expect(werte).toEqual([34.1, 51.1, 51.1, 51.1, 51.1, 51.1, 51.1, 51.1]);
    // Die eigentliche Zusicherung: ab dem Maximum ändert sich nichts mehr. Eine monotone
    // Folge kann nicht kreisen — das ist der Terminierungsbeweis, nicht eine Beobachtung.
    const abMaximum = werte.slice(werte.indexOf(51.1));
    expect(new Set(abMaximum).size).toBe(1);
  });

  it('ignoriert eine 0-Messung (happy-dom/kein Layout) statt das Fenster abzuschalten', () => {
    const w = createWindowed();
    const sec = w.section('g');
    sec.probe(zeile(51.1), { klasse: 'eins', index: 0 });
    sec.probe(zeile(0), { klasse: 'eins', index: 0 });
    expect(sec.height('eins')).toBe(51.1);
  });

  it('hält die Klassen einer Gruppe auseinander und die Gruppen voneinander', () => {
    const w = createWindowed();
    const a = w.section('a');
    const b = w.section('b');
    a.probe(zeile(34.1), { klasse: 'eins', index: 0 });
    a.probe(zeile(51.1), { klasse: 'zwei', index: 1 });
    b.probe(zeile(80), { klasse: 'eins', index: 0 });
    expect(a.height('eins')).toBe(34.1);
    expect(a.height('zwei')).toBe(51.1);
    expect(b.height('eins')).toBe(80);
    expect(b.height('zwei')).toBe(0);
  });
});

describe('Das Höhenmodell bildet die echten Zeilenhöhen ab (ADR-v9-236, offene Flanke)', () => {
  /**
   * DER KONSTRUKT-FALL, den der Realbestand nur SICHTBAR gemacht hat: innerhalb EINER Klasse
   * sind die Zeilen verschieden hoch, weil ein langer Name umbricht. Das ist keine
   * Eigenschaft einer Datei — es folgt aus (Namenslänge × verfügbare Breite) und kann in
   * jedem Bestand auftreten. Deshalb steht der Fall hier als Zahlenreihe, nicht als Auszählung.
   *
   * Die Zusicherung ist die aus [ADR-v9-235](specs/v9/04-Entscheidungslog.md) Entscheidung 3:
   * die modellierte Gesamthöhe ist die echte. Ist sie es nicht, lügt der Scrollbalken über
   * die Datenmenge — und zwar um (höchste − niedrigste Höhe) × Zeilenzahl der Klasse.
   */
  const ECHTE_HOEHEN = [
    ...Array.from({ length: 97 }, () => 51.1), // normale Zeilen mit Zweitzeile
    ...Array.from({ length: 3 }, () => 66.6), // drei davon brechen um
  ];
  const ECHTE_GESAMTHOEHE = ECHTE_HOEHEN.reduce((a, b) => a + b, 0);

  it('die modellierte Gesamthöhe ist die echte, auch bei ungleichen Höhen INNERHALB einer Klasse', () => {
    const w = createWindowed();
    const sec = w.section('g');
    // Jede Zeile wird einmal gemessen — im Browser passiert genau das, sobald sie ins
    // Fenster wandert.
    // Die Präfixsumme einmal anfordern, damit die Gruppe ihre Zeilenzahl kennt …
    sec.offsets(ECHTE_HOEHEN.length, () => 'zwei');
    // … dann jede Zeile messen, wie es im Browser geschieht, sobald sie ins Fenster wandert.
    ECHTE_HOEHEN.forEach((h, i) => sec.probe(zeile(h), { klasse: 'zwei', index: i }));

    const modell = sec.offsets(ECHTE_HOEHEN.length, () => 'zwei');
    expect(modell[modell.length - 1]).toBeCloseTo(ECHTE_GESAMTHOEHE, 3);
  });
});
