// tests/services/places-file-wrapper.test.ts — Parsen/Validieren des orte.json-Wire-
// Formats aus einer importierten Datei (ADR-v9-70, Spec 14 §6). Reine Funktion, kein
// Plattform-Zugriff.

import { describe, expect, it } from 'vitest';
import { parsePlacesFileWrapper, serializePlacesFileWrapper } from '../../services/places/places-file-wrapper';
import { PLACES_SCHEMA_VERSION } from '../../services/places/types';
import { isReviewed, placeYear, tagesOrdinal } from '../../core/places';
import { place, hof } from '../core/places-fixtures';

describe('parsePlacesFileWrapper', () => {
  it('parst einen gültigen Wrapper-Text zu einem typisierten PlacesFileWrapper', () => {
    const wrapper = {
      schemaVersion: PLACES_SCHEMA_VERSION,
      rev: 3,
      device: 'dev-A',
      ts: 5000,
      placeObjects: [place('P1', { title: 'Ochtrup' })],
      hofObjects: [hof('H1', 'P1')]
    };
    const parsed = parsePlacesFileWrapper(JSON.stringify(wrapper));

    expect(parsed).toEqual(wrapper);
  });

  it('wirft einen klaren Fehler bei kaputtem JSON (kein stiller Absturz)', () => {
    expect(() => parsePlacesFileWrapper('{ nicht: valides json')).toThrow(/kein gültiges JSON/);
  });

  it('wirft einen klaren Fehler bei fremdem/unerwartetem JSON-Format (kein orte.json-Wrapper)', () => {
    expect(() => parsePlacesFileWrapper(JSON.stringify({ foo: 'bar' }))).toThrow(/unerwartetes Dateiformat/);
  });

  it('wirft einen klaren Fehler, wenn placeObjects/hofObjects fehlen oder keine Arrays sind', () => {
    const bad = { schemaVersion: 1, rev: 1, device: 'x', ts: 1, placeObjects: 'nicht-array', hofObjects: [] };
    expect(() => parsePlacesFileWrapper(JSON.stringify(bad))).toThrow(/unerwartetes Dateiformat/);
  });

  it('wirft bei einem GEDCOM-Text (fremde Datei, gültiges-aussehendes-aber-falsches Format) statt still zu importieren', () => {
    expect(() => parsePlacesFileWrapper('0 HEAD\n1 GEDC\n0 TRLR\n')).toThrow(/kein gültiges JSON/);
  });
});

describe('serializePlacesFileWrapper', () => {
  it('roundtrip: serialize -> parse liefert einen inhaltsgleichen Wrapper (Grundlage für Export/Import)', () => {
    const wrapper = {
      schemaVersion: PLACES_SCHEMA_VERSION,
      rev: 2,
      device: 'dev-B',
      ts: 1234,
      placeObjects: [place('P1', { title: 'Wettringen' })],
      hofObjects: [hof('H1', 'P1', { addrs: [{ value: 'Wall 33', from: null, to: null }] })]
    };

    const text = serializePlacesFileWrapper(wrapper);
    const parsed = parsePlacesFileWrapper(text);

    expect(parsed).toEqual(wrapper);
  });
});

// ADR-v9-191 / BL-266 — der Prüf-Marker reist in orte.json mit, OHNE Schema-Bump.
describe('reviewedAt im orte.json-Wire-Format (ADR-v9-191)', () => {
  it('überlebt Serialisieren + Parsen', () => {
    const wrapper = {
      schemaVersion: PLACES_SCHEMA_VERSION,
      rev: 1,
      device: 'dev-A',
      ts: 1,
      placeObjects: [place('P1', { title: 'Ochtrup', reviewedAt: 1_700_000_000_000 })],
      hofObjects: [hof('H1', 'P1', { reviewedAt: 1_700_000_000_001 })],
    };

    const parsed = parsePlacesFileWrapper(serializePlacesFileWrapper(wrapper));

    expect(parsed.placeObjects[0].reviewedAt).toBe(1_700_000_000_000);
    expect(parsed.hofObjects[0].reviewedAt).toBe(1_700_000_000_001);
  });

  it('nimmt eine ÄLTERE Datei ohne das Feld unverändert an (kein Schema-Bump nötig)', () => {
    // Die Bedingung, unter der das Feld ohne PLACES_SCHEMA_VERSION-Bump auskommt: eine
    // Datei aus einer App-Version vor ADR-v9-191 muss weiter laden, und ihr fehlendes Feld
    // heißt schlicht „nie geprüft".
    const alt = {
      schemaVersion: PLACES_SCHEMA_VERSION,
      rev: 1,
      device: 'dev-A',
      ts: 1,
      placeObjects: [{ ...place('P1', { title: 'Ochtrup' }) }],
      hofObjects: [],
    };
    delete (alt.placeObjects[0] as { reviewedAt?: unknown }).reviewedAt;

    const parsed = parsePlacesFileWrapper(JSON.stringify(alt));

    expect(parsed.placeObjects[0].reviewedAt).toBeUndefined();
    expect(isReviewed(parsed.placeObjects[0])).toBe(false);
  });
});

// BL-332 / [ADR-v9-248] — die erste der zwei Türen, durch die fremde Bytes zu Orten
// werden. Eine von Hand bearbeitete orte.json ist der EINZIGE Weg, auf dem eine
// inkongruente Grenze überhaupt entstehen kann: die vier `with…`-Kommandos und die
// GOV-Anreicherung setzen beide Hälften aus EINER Quelle (bewacht in
// tests/core/grenzen-kongruenz.test.ts). Deshalb wird hier abgeleitet, nicht geprüft.
describe('Grenzjahr-Ableitung beim Laden einer Datei (BL-332)', () => {
  /** Der Realfall aus [ADR-v9-246] E3, als Dateitext — Jahr auf der alten Randberührung,
   *  Stichtag bereits entzerrt. Bewusst als roher JSON-Text, nicht als Objekt: das ist
   *  die Form, in der das Problem tatsächlich ins Programm kommt. */
  const inkongruenteDatei = JSON.stringify({
    schemaVersion: PLACES_SCHEMA_VERSION,
    rev: 314,
    device: 'dev-A',
    ts: 1,
    placeObjects: [
      place('P1', {
        title: 'Vechta',
        pnames: [{ value: 'Herzogtum Oldenburg', from: 1774, to: 1815, fromDate: null, toDate: '31 DEC 1814' }],
        enclosedBy: [{ placeId: '@P9@', from: 1811, to: null, fromDate: '1 JAN 1810', toDate: null }],
      }),
    ],
    hofObjects: [
      hof('H1', 'P1', {
        addrs: [{ value: 'Hof Meyer 1', from: 1800, to: 1976, fromDate: null, toDate: '31 DEC 1975' }],
      }),
    ],
  });

  it('zieht Jahr an Stichtag — auf allen drei datierten Achsen', () => {
    const parsed = parsePlacesFileWrapper(inkongruenteDatei);

    expect(parsed.placeObjects[0].pnames[0].to).toBe(1814);
    expect(parsed.placeObjects[0].enclosedBy[0].from).toBe(1810);
    expect(parsed.hofObjects[0].addrs[0].to).toBe(1975);
  });

  it('der Stichtag selbst bleibt unangetastet — abgeleitet wird das Jahr, nicht der Tag', () => {
    const parsed = parsePlacesFileWrapper(inkongruenteDatei);

    expect(parsed.placeObjects[0].pnames[0].toDate).toBe('31 DEC 1814');
    expect(parsed.placeObjects[0].enclosedBy[0].fromDate).toBe('1 JAN 1810');
  });

  it('was die Datei mitbringt, kommt danach durch KEINEN Weg mehr inkongruent heraus', () => {
    // Der eigentliche Gewinn: die Auflösung liest den Tag (`spanneVonDatiert`), Anzeige,
    // Prüfregeln und Sortierung lesen das Jahr direkt. Nach dieser Tür antworten beide
    // Hälften gleich — das ist die „doppelte Wahrheit", die [ADR-v9-246] E3 von Hand
    // aufgelöst hat.
    const parsed = parsePlacesFileWrapper(inkongruenteDatei);
    const angaben = [
      ...parsed.placeObjects.flatMap((p) => [...p.pnames, ...p.enclosedBy]),
      ...parsed.hofObjects.flatMap((h) => h.addrs),
    ];
    expect(angaben.length, 'sonst prüft dieser Fall nichts (TST-26)').toBeGreaterThan(0);
    for (const a of angaben) {
      const von = tagesOrdinal(a.fromDate);
      const bis = tagesOrdinal(a.toDate);
      if (von != null) expect(placeYear(a.fromDate), JSON.stringify(a)).toBe(a.from);
      if (bis != null) expect(placeYear(a.toDate), JSON.stringify(a)).toBe(a.to);
    }
  });

  it('lässt eine kongruente Datei Byte für Byte, wie sie ist', () => {
    // Gegenprobe: die Ableitung darf keinen Bestand anfassen, der nichts falsch macht —
    // sonst brächte jedes Laden eine neue Revision hervor.
    const gut = {
      schemaVersion: PLACES_SCHEMA_VERSION,
      rev: 1,
      device: 'dev-A',
      ts: 1,
      placeObjects: [
        place('P1', {
          title: 'Ochtrup',
          pnames: [{ value: 'Stadt', from: 1969, to: null, fromDate: '1 JUL 1969', toDate: null }],
          enclosedBy: [{ placeId: '@P9@', from: 1803, to: 1969, fromDate: null, toDate: null }],
        }),
      ],
      hofObjects: [hof('H1', 'P1')],
    };

    expect(parsePlacesFileWrapper(JSON.stringify(gut))).toEqual(gut);
  });

  it('erhebt eine UNGENAUE Tagesangabe nicht zum Stichtag', () => {
    // `ABT 1700` trägt ein Jahr, aber keine Tagesgenauigkeit. Ohne diese Grenze schriebe
    // die Ableitung Scheingenauigkeit in fremde Bestände.
    const ungenau = {
      schemaVersion: PLACES_SCHEMA_VERSION,
      rev: 1,
      device: 'dev-A',
      ts: 1,
      placeObjects: [
        place('P1', { pnames: [{ value: 'Alt', from: 1750, to: null, fromDate: 'ABT 1700', toDate: null }] }),
      ],
      hofObjects: [],
    };

    expect(parsePlacesFileWrapper(JSON.stringify(ungenau)).placeObjects[0].pnames[0].from).toBe(1750);
  });
});
