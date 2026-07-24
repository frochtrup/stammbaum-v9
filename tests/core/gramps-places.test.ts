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

describe('BL-141/143 — GRAMPS-Orts-Bindung', () => {
  it('bindet den Event-Ort NATIV beim Parsen an das placeobj (BL-143, ersetzt den String-Weg)', () => {
    const { db } = parseXMLText(grampsXml);
    const birth = db.individuals.get('I0001')!.birth;
    // BL-143: der `<place hlink>` bindet direkt ans native placeobj (P0001) — schon beim
    // Parsen, ohne String-Resolution. `event.place` behält den ptitle-String (Anzeige).
    expect(birth.place).toBe('Ochtrup');
    expect(birth.placeId).toBe('P0001');
    expect(db.placeObjects.get('P0001')?.title).toBe('Ochtrup');

    // applyPlaceResolution ist idempotent: die native Bindung bleibt, kein Duplikat-Seed.
    const res = applyPlaceResolution(db);
    const nachher = db.individuals.get('I0001')!.birth;
    expect(nachher.placeId).toBe('P0001');
    expect(db.placeObjects.size).toBe(1); // kein zweiter „Ochtrup"
    expect(res.placeObjectsGrew).toBe(false);
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
