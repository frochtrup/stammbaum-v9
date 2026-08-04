// tests/core/place-curation-roundtrip.test.ts — ein VERSPRECHEN-Test, kein Mechanismus-Test
// (ADR-v9-198, BL-291).
//
// Geprüft wird die Zusage aus [01 USP]: „Historisch datierte Ortsdarstellung —
// periodengerechte Auflösung von Ortsnamen, Verwaltungszugehörigkeit und Hofadressen."
// Und zwar als vollständige SEQUENZ, wie der Nutzer sie erlebt:
//
//     laden → Ortskette korrigieren → speichern → neu laden → ist es noch da?
//
// WARUM DIESE EBENE. In derselben Sitzung wurden fünf Tests umgeschrieben, die INV-PLACE
// festhielten — alle prüften den MECHANISMUS („`ev.place` wird überschrieben"). Ein
// Mechanismus-Test überlebt einen Mechanismuswechsel nicht: er wird angepasst, und die
// Eigenschaft, die er schützen sollte, verschwindet unbemerkt. Ein Versprechen-Test kennt
// den Weg nicht, nur das Ziel — er wird rot (ADR-v9-196: die Suite prüft Funktionen,
// nicht Sequenzen).
//
// DIE ERSTE FASSUNG WAR FALSCH KONSTRUIERT, und das ist der Grund für diesen Absatz: sie
// stellte einen kuratierten Bestand neben einen alten Dateitext, ohne dass je ein
// Kurations-Kommando gelaufen wäre — ein Zustand, den der echte Ablauf gar nicht erzeugt.
// Sie war rot und hätte den Fix nie bestätigen können. Ein Versprechen-Test muss die
// Sequenz wirklich durchlaufen, sonst prüft er eine Fiktion.
import { describe, expect, it } from 'vitest';
import { parseGedcom, serializeGedcom, applyDatabaseToRoots } from '../../core/interop';
import { applyPlaceResolution, reprojectEventsOfPlace } from '../../services/places';
import { savePlaceObject } from '../../core/places/index';
import type { Database } from '../../core/model/types';
import type { GedNode } from '../../core/interop';

const SRC = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '1 CHAR UTF-8',
  '0 @I1@ INDI',
  '1 NAME Franz /Ohle/',
  '1 BIRT',
  '2 DATE 10 NOV 1700',
  '2 PLAC Arpke, Amt Meinersen',
  '0 TRLR',
  '',
].join('\n');

/** Öffnen: parsen + voller Auflösungs-Pass — plus optional der geräteweite Orts-Bestand. */
function oeffnen(text: string, bestand?: Database['placeObjects']) {
  const doc = parseGedcom(text);
  if (bestand) doc.db.placeObjects = new Map(bestand);
  applyPlaceResolution(doc.db);
  return doc;
}

/** Speichern: Modell zurück in den Baum + serialisieren. */
const speichern = (db: Database, roots: GedNode[]): string =>
  serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots) });

const geburt = (db: Database) => db.individuals.get('@I1@')!.birth;

describe('Kuratierte Ortszuordnung überlebt den nächsten Ladepass (USP, LP-5)', () => {
  it('Kette KORRIGIEREN → speichern → neu laden: derselbe Ort, keine Dublette', () => {
    // 1. Öffnen — der Seed legt „Arpke" unter „Amt Meinersen" an.
    const erst = oeffnen(SRC);
    const arpkeId = geburt(erst.db).placeId!;
    expect(arpkeId).toBeTruthy();
    const orteVorher = erst.db.placeObjects.size;

    // 2. Der Nutzer korrigiert: es war nicht das Amt, sondern die Vogtei Meinersen.
    const amt = [...erst.db.placeObjects.values()].find((p) => p.title === 'Amt Meinersen')!;
    const nextPlaces = new Map(erst.db.placeObjects);
    savePlaceObject(nextPlaces, { ...amt, title: 'Vogtei Meinersen' });
    // … und das Kommando zieht die Ereignisse dieses Ortes mit (BL-291).
    const nachKuration = reprojectEventsOfPlace({ ...erst.db, placeObjects: nextPlaces }, amt.id);

    // 3. Speichern — die Korrektur steht jetzt auch in der Datei.
    const datei = speichern(nachKuration, erst.roots);
    expect(datei).toContain('Vogtei Meinersen');

    // 4. Neu laden: neue Datei + kuratierter Orts-Bestand (orte.json).
    const zweit = oeffnen(datei, nachKuration.placeObjects);

    // Das Versprechen: derselbe Ort, kein neuer daneben.
    expect(geburt(zweit.db).placeId).toBe(arpkeId);
    expect(zweit.db.placeObjects.size).toBe(orteVorher);
  });

  it('Kette ERGÄNZEN (datierter zweiter Elter): ebenfalls wiedererkannt', () => {
    const erst = oeffnen(SRC);
    const arpkeId = geburt(erst.db).placeId!;
    const arpke = erst.db.placeObjects.get(arpkeId)!;
    const orteVorher = erst.db.placeObjects.size;

    const nextPlaces = new Map(erst.db.placeObjects);
    savePlaceObject(nextPlaces, {
      ...arpke,
      pnames: [...arpke.pnames, { value: 'Arpke im Amt', from: 1650, to: 1750 }],
    });
    const nachKuration = reprojectEventsOfPlace({ ...erst.db, placeObjects: nextPlaces }, arpkeId);

    const zweit = oeffnen(speichern(nachKuration, erst.roots), nachKuration.placeObjects);
    expect(geburt(zweit.db).placeId).toBe(arpkeId);
    expect(zweit.db.placeObjects.size).toBe(orteVorher);
    // Die periodengerechte Namensvariante ist in der Datei angekommen — das ist das USP.
    expect(geburt(zweit.db).place).toContain('Arpke im Amt');
  });
});

describe('Reichweite einer Ketten-Änderung (BL-291)', () => {
  const MIT_GROSSELTER = SRC.replace(
    '2 PLAC Arpke, Amt Meinersen',
    '2 PLAC Arpke, Amt Meinersen, Fuerstentum Lueneburg',
  );

  it('wirkt transitiv: ein GROSSELTER-Name erreicht das Ereignis drei Ebenen tiefer', () => {
    const doc = oeffnen(MIT_GROSSELTER);
    const gross = [...doc.db.placeObjects.values()].find((p) => p.title === 'Fuerstentum Lueneburg')!;
    const next = new Map(doc.db.placeObjects);
    savePlaceObject(next, { ...gross, title: 'Kurfuerstentum Hannover' });
    const nach = reprojectEventsOfPlace({ ...doc.db, placeObjects: next }, gross.id);

    expect(geburt(nach).place).toBe('Arpke, Amt Meinersen, Kurfuerstentum Hannover');
    expect(speichern(nach, doc.roots)).toContain('2 PLAC Arpke, Amt Meinersen, Kurfuerstentum Hannover');
  });

  it('bleibt periodentreu: ein Elter für 1800–1900 lässt ein Ereignis von 1700 unberührt', () => {
    const doc = oeffnen(SRC);
    const arpkeId = geburt(doc.db).placeId!;
    const arpke = doc.db.placeObjects.get(arpkeId)!;
    const amt = [...doc.db.placeObjects.values()].find((p) => p.title === 'Amt Meinersen')!;

    const next = new Map(doc.db.placeObjects);
    savePlaceObject(next, {
      ...arpke,
      enclosedBy: [
        { placeId: amt.id, from: null, to: null },
        { placeId: amt.id, from: 1800, to: 1900 },
      ],
    });
    const basis = { ...doc.db, placeObjects: next };
    const nach = reprojectEventsOfPlace(basis, arpkeId);

    expect(geburt(nach).place).toBe('Arpke, Amt Meinersen');
    // Kein Ereignis angefasst → die Arbeitskopie wird gar nicht erst geschrieben.
    expect(nach.individuals).toBe(basis.individuals);
  });
});
