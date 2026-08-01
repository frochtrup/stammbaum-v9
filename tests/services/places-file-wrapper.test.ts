// tests/services/places-file-wrapper.test.ts — Parsen/Validieren des orte.json-Wire-
// Formats aus einer importierten Datei (ADR-v9-70, Spec 14 §6). Reine Funktion, kein
// Plattform-Zugriff.

import { describe, expect, it } from 'vitest';
import { parsePlacesFileWrapper, serializePlacesFileWrapper } from '../../services/places/places-file-wrapper';
import { PLACES_SCHEMA_VERSION } from '../../services/places/types';
import { isReviewed } from '../../core/places';
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
