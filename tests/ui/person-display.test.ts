// tests/ui/person-display.test.ts — reine Darstellungs-Helfer (ui/shell/person-display.ts).
// Fokus hier: fullDateLabel/dateSummary (Spec 21 §6f INV-UI-9, ADR-v9-64) — Eigene-
// Ereignis-Kontext zeigt das VOLLE, lokalisierte Datum statt Jahr-only. Die bestehende
// yearPlaceSummary()/eventYearLabel()-Disambiguierungs-Form bleibt unverändert (siehe
// person-detail-model.test.ts/family-detail-model.test.ts für deren Abdeckung).
import { describe, expect, it } from 'vitest';
import { makeEvent } from '../../core/model';
import { makePlaceRegistry, makeHofRegistry, buildPlacForGedcom, eventSpanne, type PlaceContext } from '../../core/places';
import { fullDateLabel, dateSummary, sexSymbol, pedigreeLabel, ageAtEvent, eventPlaceLabel } from '../../ui/shell/person-display';
import { place, placeMap, hofMap } from '../core/places-fixtures';

function emptyContext(): PlaceContext {
  return { places: makePlaceRegistry(new Map()), hofs: makeHofRegistry(new Map()) };
}

describe('fullDateLabel — volles, lokalisiertes Datum (INV-UI-9)', () => {
  it('Tag+Monat+Jahr → deutscher Monatsname', () => {
    const ev = makeEvent('BIRT', { date: '12 MAR 1890' });
    expect(fullDateLabel(ev)).toBe('12. März 1890');
  });

  it('Qualifier-Präfix wird durchgereicht (ABT → "ca.")', () => {
    const ev = makeEvent('BIRT', { date: 'ABT 1875' });
    expect(fullDateLabel(ev)).toBe('ca. 1875');
  });

  it('kein Datum → leerer String', () => {
    const ev = makeEvent('BIRT', { date: null });
    expect(fullDateLabel(ev)).toBe('');
  });
});

describe('dateSummary — kombiniert volles Datum + Ort (analog yearPlaceSummary, aber Datums-Tiefe voll)', () => {
  it('Datum + Ort → "12. März 1890, Ochtrup"', () => {
    const ev = makeEvent('BIRT', { date: '12 MAR 1890', place: 'Ochtrup' });
    expect(dateSummary(ev, emptyContext())).toBe('12. März 1890, Ochtrup');
  });

  it('nur Datum, kein Ort → nur das Datum', () => {
    const ev = makeEvent('BIRT', { date: '12 MAR 1890' });
    expect(dateSummary(ev, emptyContext())).toBe('12. März 1890');
  });

  it('nur Ort, kein Datum → nur der Ort', () => {
    const ev = makeEvent('BIRT', { date: null, place: 'Ochtrup' });
    expect(dateSummary(ev, emptyContext())).toBe('Ochtrup');
  });

  it('weder Datum noch Ort → leerer String', () => {
    const ev = makeEvent('BIRT', {});
    expect(dateSummary(ev, emptyContext())).toBe('');
  });

  it('Qualifier + Ort kombiniert', () => {
    const ev = makeEvent('DEAT', { date: 'BEF 1900', place: 'Ochtrup' });
    expect(dateSummary(ev, emptyContext())).toBe('vor 1900, Ochtrup');
  });
});

describe('sexSymbol — ♂/♀/◇ (BL-195/198/211, INV-UI-4)', () => {
  it('M → ♂, F → ♀, U → ◇', () => {
    expect(sexSymbol('M')).toBe('♂');
    expect(sexSymbol('F')).toBe('♀');
    expect(sexSymbol('U')).toBe('◇');
  });
});

describe('pedigreeLabel — Kind-Verhältnis (BL-199)', () => {
  it('leiblich/leer → kein Marker (Regelfall, kein Rauschen)', () => {
    expect(pedigreeLabel('birth')).toBe('');
    expect(pedigreeLabel('')).toBe('');
  });
  it('abweichende Verhältnisse → Klartext', () => {
    expect(pedigreeLabel('adopted')).toBe('adoptiert');
    expect(pedigreeLabel('foster')).toBe('Pflegekind');
    expect(pedigreeLabel('sealing')).toBe('gesiegelt');
  });
});

describe('ageAtEvent — Alter bei Ereignis (BL-196)', () => {
  it('exakte Daten → "N J."', () => {
    const birth = makeEvent('BIRT', { date: '1 JAN 1850' });
    const ev = makeEvent('DEAT', { date: '1 JAN 1920' });
    expect(ageAtEvent(birth, ev)).toBe('70 J.');
  });
  it('unscharfes Datum (ABT) → "~N J."', () => {
    const birth = makeEvent('BIRT', { date: 'ABT 1850' });
    const ev = makeEvent('DEAT', { date: '1920' });
    expect(ageAtEvent(birth, ev)).toBe('~70 J.');
  });
  it('fehlendes Jahr → leer', () => {
    expect(ageAtEvent(makeEvent('BIRT'), makeEvent('DEAT', { date: '1920' }))).toBe('');
  });
  it('unplausibel (negativ / > 130) → leer', () => {
    const birth = makeEvent('BIRT', { date: '1920' });
    const ev = makeEvent('DEAT', { date: '1850' });
    expect(ageAtEvent(birth, ev)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Der Stichtag gilt auch für die ANZEIGE (Nutzer-Befund 2026-08-28, BL-…/ADR-v9-…).
//
// `eventPlaceLabel` löste die Kette mit `eventYear(ev)` auf — einer ganzen JAHRES-Spanne —
// während die Projektion (`buildPlacForGedcom`/`platzhalterText` im Ereignis-Editor,
// `alignCuratedEventTexts`, der Writer) seit BL-324/[ADR-v9-243] `eventSpanne(ev)` nimmt.
// Genau an einem Grenzjahr, für das die Tagesauflösung gebaut wurde, fallen beide
// auseinander: das breite Jahres-Intervall trifft BEIDE Perioden, und der Tie-Break
// „spätester Beginn" entscheidet statt der Daten. Der Nutzer sah im Editor die neue,
// periodengerechte Kette, übernahm sie, speicherte — und die Ereigniszeile im
// Personen-Steckbrief zeigte weiter die alte. Sie konnte gar nicht folgen: sie liest
// `ev.place` nie, sie rechnet live, nur mit dem falschen Zeitbezug.
//
// AM REALBESTAND GEMESSEN (`Unsere Familie 2026-4.ged` × `orte-5.json`/`orte-7.json`,
// beide gleich): 19 von 5.213 ortsgebundenen Ereignissen wichen ab — u. a. Vechta 1813
// („Département de l'Ems-Supérieur, Kaiserreich Frankreich" vs. „Amt Vechta, Herzogtum
// Oldenburg, Rheinbund") und Ochtrup 1806.
describe('eventPlaceLabel — derselbe Stichtag wie die Projektion (BL-324/[ADR-v9-243])', () => {
  /** Vechta am gemessenen Grenzjahr 1813: bis zum 31.12.1813 französisch, ab 1813
   *  oldenburgisch — beide Perioden teilen sich das Jahr, nur der TAG trennt sie. */
  function grenzjahrContext(): PlaceContext {
    const vechta = place('_po_vechta', {
      title: 'Vechta',
      enclosedBy: [
        { placeId: '_po_ems', from: 1810, to: 1813, fromDate: '1 JAN 1810', toDate: '31 DEC 1813' },
        { placeId: '_po_amt', from: 1813, to: null, fromDate: '31 DEC 1813', toDate: null },
      ],
    });
    const ems = place('_po_ems', { title: "Département de l'Ems-Supérieur" });
    const amt = place('_po_amt', { title: 'Amt Vechta' });
    return {
      places: makePlaceRegistry(placeMap(vechta, ems, amt)),
      hofs: makeHofRegistry(hofMap()),
    };
  }

  it('tagegenaues Ereignis VOR dem Stichtag → die frühere Kette', () => {
    const ev = makeEvent('BIRT', { date: '26 JUN 1813', placeId: '_po_vechta' });
    expect(eventPlaceLabel(ev, grenzjahrContext())).toBe("Vechta, Département de l'Ems-Supérieur");
  });

  it('tagegenaues Ereignis AM Stichtag → die neue Kette (der Fall des Nutzer-Befunds)', () => {
    const ev = makeEvent('BIRT', { date: '31 DEC 1813', placeId: '_po_vechta' });
    expect(eventPlaceLabel(ev, grenzjahrContext())).toBe('Vechta, Amt Vechta');
  });

  it('die Anzeige stimmt mit der Projektion überein, die der Editor anbietet', () => {
    const ctx = grenzjahrContext();
    for (const date of ['26 JUN 1813', '31 DEC 1813', '5 MAR 1815']) {
      const ev = makeEvent('BIRT', { date, placeId: '_po_vechta' });
      expect(eventPlaceLabel(ev, ctx)).toBe(buildPlacForGedcom(ev, eventSpanne(ev), ctx));
    }
  });

  it('nur jahrgenaues Ereignis bleibt unverändert — keine erfundene Genauigkeit', () => {
    const ev = makeEvent('BIRT', { date: '1813', placeId: '_po_vechta' });
    // Ganzes Jahr trifft beide Perioden; der Tie-Break „spätester Beginn" gewinnt.
    expect(eventPlaceLabel(ev, grenzjahrContext())).toBe('Vechta, Amt Vechta');
  });
});
