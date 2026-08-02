// tests/core/place-curation-roundtrip.test.ts — ein VERSPRECHEN-Test, kein Mechanismus-Test
// (ADR-v9-198, BL-291).
//
// Geprüft wird die Zusage aus [01 USP]: „Historisch datierte Ortsdarstellung —
// periodengerechte Auflösung von Ortsnamen, Verwaltungszugehörigkeit und Hofadressen."
// Und zwar so, wie der Nutzer sie erlebt: **kuratieren → speichern → neu laden → ist es
// noch da?** Nicht, ob eine bestimmte Funktion ein bestimmtes Feld setzt.
//
// WARUM DIESE EBENE. In derselben Sitzung wurden fünf Tests umgeschrieben, die INV-PLACE
// festhielten — alle prüften den MECHANISMUS („`ev.place` wird überschrieben"). Ein
// Mechanismus-Test überlebt einen Mechanismuswechsel nicht: er wird angepasst, und die
// Eigenschaft, die er schützen sollte, verschwindet unbemerkt. Ein Versprechen-Test
// überlebt ihn — er kennt den Weg nicht, nur das Ziel. Genau das ist hier passiert
// (ADR-v9-196: die Suite prüft Funktionen, nicht Sequenzen).
import { describe, expect, it } from 'vitest';
import { resolveEvents, makePlaceRegistry } from '../../core/places/index';
import { seedPlacesFromEvents } from '../../core/places/seed';
import { makeHofRegistry } from '../../core/places/hof-registry';
import { place, placeMap, hofMap, ev } from './places-fixtures';

/** Ein voller Ladepass auf einem gegebenen Orts-Bestand (Seed + Auflösung, wie beim Öffnen). */
function ladepass(events: ReturnType<typeof ev>[], bestand: ReturnType<typeof placeMap>) {
  const seeded = seedPlacesFromEvents(events, {
    places: makePlaceRegistry(bestand),
    hofs: makeHofRegistry(hofMap()),
  });
  const nachSeed = new Map(bestand);
  for (const po of seeded) nachSeed.set(po.id, po);
  return { res: resolveEvents(events, nachSeed, hofMap()), neuAngelegt: seeded, bestand: nachSeed };
}

describe('Kuratierte Ortszuordnung überlebt den nächsten Ladepass (USP, LP-5)', () => {
  const amt = place('@AMT@', { title: 'Amt Meinersen' });
  const vogtei = place('@VOGTEI@', { title: 'Vogtei Meinersen' });
  const plac = 'Arpke, Amt Meinersen';

  it('ERGÄNZTE Kette: der kuratierte Ort wird wiedererkannt', () => {
    const kuriert = placeMap(
      place('@ARPKE@', { title: 'Arpke', enclosedBy: [
        { placeId: '@AMT@', from: null, to: null },
        { placeId: '@VOGTEI@', from: null, to: null },
      ] }),
      amt, vogtei,
    );
    const { res, neuAngelegt } = ladepass([ev('BIRT', { place: plac, date: '1700' })], kuriert);
    expect(neuAngelegt).toEqual([]);
    expect(res.events[0].event.placeId).toBe('@ARPKE@');
  });

  // Die eigentliche Zusage — heute NICHT eingelöst (BL-291). Der Nutzer korrigiert die
  // Kette (es war nicht das Amt, sondern die Vogtei); die Datei behält ihren PLAC-Text,
  // weil BL-288 den Ladepass-Reproject abgeschaltet hat und kein Kurations-Kommando ihn
  // ersetzt. Ergebnis: ein NEUER Ort, das Ereignis bindet dorthin, der kuratierte bleibt
  // referenzlos — die Korrektur erzeugt die Dublette, die sie auflösen sollte.
  //
  // Rot-Probe für BL-291: dort `skip` entfernen.
  it.skip('KORRIGIERTE Kette: der kuratierte Ort wird wiedererkannt (BL-291)', () => {
    const kuriert = placeMap(
      place('@ARPKE@', { title: 'Arpke', enclosedBy: [{ placeId: '@VOGTEI@', from: null, to: null }] }),
      amt, vogtei,
    );
    const { res, neuAngelegt, bestand } = ladepass([ev('BIRT', { place: plac, date: '1700' })], kuriert);
    expect(neuAngelegt).toEqual([]);
    expect(res.events[0].event.placeId).toBe('@ARPKE@');
    expect(bestand.size).toBe(3); // kein vierter Ort
  });
});
