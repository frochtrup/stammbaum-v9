// tests/core/gramps-places.test.ts — BL-141 (ADR-v9-114 D3, String-Weg): die aus GRAMPS
// projizierten Event-Orts-STRINGS (placeobj → ptitle, BL-140) werden über den bestehenden,
// format-agnostischen `services/places.applyPlaceResolution` an `placeId`/`hofId` gebunden —
// exakt derselbe Dienst und Pfad wie beim GEDCOM-Import (kein zweiter Ortscode). Die volle
// placeobj-Hierarchie (Typ/Koordinaten/placeref) bleibt Passthrough bis BL-143.
//
// Dieselbe Bindung fährt der Ladepfad `ui/shell/load-gramps-text.ts` produktiv; hier wird
// der Kern-Schritt (parseXMLText → applyPlaceResolution) headless festgehalten.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseXMLText } from '../../core/interop';
import { applyPlaceResolution } from '../../services/places';

const grampsXml = readFileSync(join(__dirname, '../fixtures/events-mini.small.gramps'), 'utf8');

describe('BL-141 — GRAMPS-Orts-Strings → placeId (String-Weg)', () => {
  it('bindet den projizierten Event-Ort an eine placeId und legt das PlaceObject an', () => {
    const { db } = parseXMLText(grampsXml);
    const vorher = db.individuals.get('I0001')!.birth;
    expect(vorher.place).toBe('Ochtrup'); // BL-140: ptitle als String
    expect(vorher.placeId).toBeNull(); // noch nicht aufgelöst

    const res = applyPlaceResolution(db);

    const nachher = db.individuals.get('I0001')!.birth;
    expect(nachher.place).toBe('Ochtrup'); // String bleibt
    expect(nachher.placeId).not.toBeNull(); // jetzt gebunden
    expect(db.placeObjects.get(nachher.placeId!)?.title).toBe('Ochtrup');
    expect(res.placeObjectsGrew).toBe(true);
  });

  it('ist derselbe Dienst wie beim GEDCOM-Import — kein zweiter Pfad', () => {
    // Der Beleg, dass BL-141 keine GRAMPS-eigene Auflösung erfindet: applyPlaceResolution
    // kennt das Herkunftsformat nicht, es arbeitet nur auf `event.place`-Strings der db.
    const { db } = parseXMLText(grampsXml);
    applyPlaceResolution(db);
    // Auch das Familien-Ereignis (Heirat ohne place) bleibt unaufgelöst — nichts wird erfunden.
    expect(db.families.get('F0001')!.marriage.placeId).toBeNull();
  });
});
