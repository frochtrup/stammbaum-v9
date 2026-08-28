// tests/core/anzeige-vs-datei.test.ts — „gespeichert wird, was angezeigt wird — oder es
// steht im Dashboard" (Nutzer-Vorgabe 2026-08-28, [ADR-v9-304]).
//
// WARUM ES DIESEN ZUSTAND GIBT, und warum ihn keine der beiden Seiten allein sieht:
// Der Writer schreibt `ev.place` ([ADR-v9-197] — die Live-Projektion schrieb sonst bei
// JEDEM Speichern 668 Werte um), die Anzeige rechnet die periodengerechte Kette. Beide
// Entscheidungen sind für sich richtig. Läuft `alignCuratedEventTexts` beim Laden in seine
// Sperre, bleiben sie auseinander — und bis hierher sagte das niemand.
//
// Gemessen am Bestand des Nutzers (`…2026-4-2-2-7.ged` × `orte-24.json`, 6.149 verankerte
// Ereignisse): 33 Fälle, 32 davon ohne jeden Hinweis.
import { describe, expect, it } from 'vitest';
import { anzeigeAbweichung } from '../../core/places';
import { makeDatabase, makeEvent } from '../../core/model';
import { buildContext } from '../../core/validate/context';
import { defaultConfig } from '../../core/validate';
import { place } from './places-fixtures';

/** Ein Ort mit Kette: Vechta liegt im Amt Vechta, das im Herzogtum Oldenburg liegt. */
function bestandMitKette() {
  const db = makeDatabase();
  const herzogtum = place('P3', { title: 'Herzogtum Oldenburg' });
  const amt = place('P2', { title: 'Amt Vechta', enclosedBy: [{ placeId: 'P3', from: null, to: null, fromDate: null, toDate: null }] });
  const vechta = place('P1', { title: 'Vechta', enclosedBy: [{ placeId: 'P2', from: null, to: null, fromDate: null, toDate: null }] });
  db.placeObjects = new Map([
    ['P1', vechta],
    ['P2', amt],
    ['P3', herzogtum],
  ]);
  return db;
}

function ctxVon(db: ReturnType<typeof makeDatabase>) {
  return buildContext(db, defaultConfig()).places;
}

describe('anzeigeAbweichung — sagt, wenn die Datei etwas anderes trägt als der Schirm', () => {
  it('meldet den Unterschied und nennt BEIDE Seiten', () => {
    const db = bestandMitKette();
    const ctx = ctxVon(db);
    const ev = makeEvent('MARR', {
      date: '31 JAN 1815',
      place: 'Vechta, Amt Vechta, Herzogtum Oldenburg, Deutschland',
      placeId: 'P1',
    });

    const ab = anzeigeAbweichung(ev, ctx);

    // Der gemeldete Fall: die Datei nennt eine Ebene mehr, die Anzeige zeigt die Kette.
    expect(ab).not.toBeNull();
    expect(ab!.gespeichert).toBe('Vechta, Amt Vechta, Herzogtum Oldenburg, Deutschland');
    expect(ab!.angezeigt).not.toContain('Deutschland');
    // Beide Seiten, nicht nur ein `true`: wer nur ein boolean bekäme, müsste die zweite
    // Hälfte selbst rechnen — und zwei Rechenwege sind zwei Wahrheiten.
    expect(ab!.angezeigt).toBe('Vechta, Amt Vechta, Herzogtum Oldenburg');
  });

  it('schweigt, wenn Datei und Anzeige übereinstimmen', () => {
    const db = bestandMitKette();
    const ev = makeEvent('MARR', {
      date: '31 JAN 1815',
      place: 'Vechta, Amt Vechta, Herzogtum Oldenburg',
      placeId: 'P1',
    });

    expect(anzeigeAbweichung(ev, ctxVon(db))).toBeNull();
  });

  it('schweigt ohne Verankerung — dort zeigt die Oberfläche ohnehin den Dateitext', () => {
    const db = bestandMitKette();
    const ev = makeEvent('MARR', { date: '31 JAN 1815', place: 'Irgendwo, Nirgendland' });

    expect(anzeigeAbweichung(ev, ctxVon(db))).toBeNull();
  });

  it('erfasst auch den reinen FORM-Unterschied — leere Segmente aus dem Export', () => {
    // 27 der 33 gemessenen Fälle sehen so aus: inhaltlich gleich, in der Datei mit
    // Leerfeldern. Auch das wird anders gespeichert als angezeigt, also wird es gemeldet
    // — welche der beiden Klassen vorliegt, entscheidet der Nutzer am Wortlaut.
    const db = makeDatabase();
    db.placeObjects = new Map([['P1', place('P1', { title: 'Mainz' })]]);
    const ev = makeEvent('RESI', { place: ', Mainz, , , , ', placeId: 'P1' });

    const ab = anzeigeAbweichung(ev, ctxVon(db));

    expect(ab).not.toBeNull();
    expect(ab!.angezeigt).toBe('Mainz');
    expect(ab!.gespeichert).toBe(', Mainz, , , , ');
  });
});
