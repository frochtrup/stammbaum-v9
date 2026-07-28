// tests/services/apply-resolution.test.ts — Event-Sammel- + Rückschreib-Logik für den
// Import-Pfad (Spec 11 §4). Prüft, dass ALLE Event-Fundstellen einer Person/Familie
// (birth/chr/death/buri/events[] bzw. marriage/engagement/events[]) in EINEN
// resolveEvents()-Aufruf eingehen und die aufgelösten Kopien an der RICHTIGEN Stelle
// zurückgeschrieben werden — kein Event-Typ wird übersehen, keine Verwechslung der Slots.

import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, makeFamily, makeEvent } from '../../core/model';
import {
  applyPlaceResolution,
  deletePlaceCascade,
  deleteHofCascade,
  renameHofAddrInEvents,
} from '../../services/places/apply-resolution';
import { place, hof } from '../core/places-fixtures';

describe('applyPlaceResolution — sammelt alle Event-Fundstellen', () => {
  it('löst birth/chr/death/buri/events[] einer Person und schreibt sie an die richtige Stelle zurück', () => {
    const db = makeDatabase();
    db.placeObjects.set('P1', place('P1', { title: 'Ochtrup' }));

    const p = makePerson('I1', {
      birth: makeEvent('BIRT', { place: 'Ochtrup' }),
      chr: makeEvent('CHR', { place: 'Ochtrup' }),
      death: makeEvent('DEAT', { place: 'Andernorts' }),
      buri: makeEvent('BURI', { place: 'Ochtrup' }),
      events: [makeEvent('RESI', { place: 'Ochtrup' })]
    });
    db.individuals.set(p.id, p);

    const result = applyPlaceResolution(db);

    const updated = db.individuals.get('I1')!;
    expect(updated.birth.placeId).toBe('P1');
    expect(updated.chr.placeId).toBe('P1');
    expect(updated.buri.placeId).toBe('P1');
    expect(updated.events[0].placeId).toBe('P1');
    // "Andernorts" matcht kein bestehendes PlaceObject → wird jetzt automatisch geseedet
    // (ADR-v9-28) und verlinkt; der Slot ist NICHT mit einem falschen Event vertauscht
    // (place bleibt "Andernorts", placeId ist der neue Seed-Ort, nicht P1).
    expect(updated.death.placeId).not.toBeNull();
    expect(updated.death.placeId).not.toBe('P1');
    expect(updated.death.place).toBe('Andernorts');
    expect(result.placeObjectsGrew).toBe(true);
    expect(result.review).toEqual([]);
  });

  it('unaufgelöster Ort wird automatisch geseedet und verlinkt (ADR-v9-28) → placeObjectsGrew=true', () => {
    const db = makeDatabase(); // KEINE bestehenden placeObjects
    const p = makePerson('I1', { birth: makeEvent('BIRT', { place: 'Wettringen, Kreis Steinfurt' }) });
    db.individuals.set(p.id, p);

    const result = applyPlaceResolution(db);

    expect(result.placeObjectsGrew).toBe(true);
    const birth = db.individuals.get('I1')!.birth;
    expect(birth.placeId).not.toBeNull();
    expect(db.placeObjects.get(birth.placeId!)?.title).toBe('Wettringen');
  });

  it('löst marriage/engagement/events[] einer Familie und schreibt sie an die richtige Stelle zurück', () => {
    const db = makeDatabase();
    db.placeObjects.set('P1', place('P1', { title: 'Ochtrup' }));

    const f = makeFamily('F1', {
      engagement: makeEvent('ENGA', { place: 'Ochtrup' }),
      marriage: makeEvent('MARR', { place: 'Ochtrup' }),
      events: [makeEvent('EVEN', { place: 'Ochtrup' })]
    });
    db.families.set(f.id, f);

    applyPlaceResolution(db);

    const updated = db.families.get('F1')!;
    expect(updated.engagement.placeId).toBe('P1');
    expect(updated.marriage.placeId).toBe('P1');
    expect(updated.events[0].placeId).toBe('P1');
  });

  it('mehrere Personen/Familien mit mehreren events[]-Einträgen werden nicht vertauscht', () => {
    const db = makeDatabase();
    db.placeObjects.set('P1', place('P1', { title: 'Ochtrup' }));
    db.placeObjects.set('P2', place('P2', { title: 'Wall' }));

    const p1 = makePerson('I1', { events: [makeEvent('RESI', { place: 'Ochtrup' }), makeEvent('OCCU', { place: 'Wall' })] });
    const p2 = makePerson('I2', { events: [makeEvent('RESI', { place: 'Wall' })] });
    db.individuals.set(p1.id, p1);
    db.individuals.set(p2.id, p2);

    applyPlaceResolution(db);

    expect(db.individuals.get('I1')!.events[0].placeId).toBe('P1');
    expect(db.individuals.get('I1')!.events[1].placeId).toBe('P2');
    expect(db.individuals.get('I2')!.events[0].placeId).toBe('P2');
  });

  it('Hof-Bootstrap (Pfad C) lässt db.hofObjects wachsen und wird als hofObjectsGrew=true gemeldet', () => {
    const db = makeDatabase();
    db.placeObjects.set('P1', place('P1', { title: 'Ochtrup' }));

    const p = makePerson('I1', {
      events: [makeEvent('RESI', { place: 'Wall 33, Ochtrup' })]
    });
    db.individuals.set(p.id, p);

    expect(db.hofObjects.size).toBe(0);
    const result = applyPlaceResolution(db);

    expect(result.hofObjectsGrew).toBe(true);
    expect(db.hofObjects.size).toBe(1);
    expect(db.individuals.get('I1')!.events[0].hofId).not.toBeNull();
  });

  it('OCCU (Arbeitsstätte) bindet KEINEN Hof — Arbeitsstätte ≠ Hof (ADR-v9-143)', () => {
    // Struktur identisch zum Pfad-C-Test oben, nur OCCU statt RESI. Vor ADR-v9-143 hätte
    // „Linden, Hannover" an einem Berufs-Ereignis einen Phantom-Hof „Linden" gebootstrappt
    // (an Realdaten gemessen: Berkeley/Kalifornien, Rothenburg/Oberlausitz). OCCU ist aus
    // HOF_EVENT_TYPES entfernt → kein Hof, der Ort bleibt dem PLAC-Pfad überlassen.
    const db = makeDatabase();
    db.placeObjects.set('P1', place('P1', { title: 'Hannover' }));
    const p = makePerson('I1', {
      events: [makeEvent('OCCU', { place: 'Linden, Hannover', value: 'Schlossergeselle' })],
    });
    db.individuals.set(p.id, p);

    const result = applyPlaceResolution(db);

    expect(result.hofObjectsGrew).toBe(false);
    expect(db.hofObjects.size).toBe(0);
    expect(db.individuals.get('I1')!.events[0].hofId).toBeNull();
  });

  it('ohne Bootstrap bleibt hofObjectsGrew=false und db.hofObjects unverändert in der Größe', () => {
    const db = makeDatabase();
    db.placeObjects.set('P1', place('P1', { title: 'Ochtrup' }));
    const p = makePerson('I1', { birth: makeEvent('BIRT', { place: 'Ochtrup' }) });
    db.individuals.set(p.id, p);

    const result = applyPlaceResolution(db);

    expect(result.hofObjectsGrew).toBe(false);
    expect(db.hofObjects.size).toBe(0);
  });

  it('Non-Hof-Event mit ADDR ohne Hof-Match erzeugt ein Review-Item (Klasse A)', () => {
    const db = makeDatabase();
    db.placeObjects.set('P1', place('P1', { title: 'Ochtrup' }));
    const p = makePerson('I1', { death: makeEvent('DEAT', { place: 'Ochtrup', addr: 'Wall 33' }) });
    db.individuals.set(p.id, p);

    const result = applyPlaceResolution(db);

    expect(result.review).toHaveLength(1);
    expect(result.review[0].klass).toBe('A');
  });
});

describe('applyPlaceResolution({ resetUncuratedLinks: true }) — ADR-v9-74: nachträglicher orte.json-Import macht bestehende, unkuratierte Zuordnungen wieder prüfbar', () => {
  it('Event zeigt auf einen NICHT kuratierten (bare Seed-) Ort, gleichnamiger kuratierter Ort kommt hinzu -> wird zurückgesetzt und landet korrekt in Review-Klasse P (ADR-v9-29 bleibt bindend, kein stilles Raten)', () => {
    const db = makeDatabase();
    // Bare Seed-Ort (kein type/pnames/note/... -> isEnrichedPlace = false), wie er beim
    // ersten, dünnen Laden automatisch entstanden wäre.
    db.placeObjects.set('SEED1', place('SEED1', { title: 'Ochtrup' }));
    const p = makePerson('I1', { birth: makeEvent('BIRT', { place: 'Ochtrup', placeId: 'SEED1' }) });
    db.individuals.set(p.id, p);

    // Ohne die Option: "bereits gelinkt" -> bleibt stur bei SEED1, obwohl jetzt ein
    // kuratierter Ort mit demselben Namen existiert (reiner Reproject, kein Re-Match).
    const dbWithoutOption = makeDatabase();
    dbWithoutOption.placeObjects.set('SEED1', place('SEED1', { title: 'Ochtrup' }));
    dbWithoutOption.placeObjects.set('CURATED1', place('CURATED1', { title: 'Ochtrup', type: 'Town', note: 'kuratiert' }));
    const p2 = makePerson('I1', { birth: makeEvent('BIRT', { place: 'Ochtrup', placeId: 'SEED1' }) });
    dbWithoutOption.individuals.set(p2.id, p2);
    applyPlaceResolution(dbWithoutOption);
    expect(dbWithoutOption.individuals.get('I1')!.birth.placeId).toBe('SEED1');

    // Jetzt kommt der frisch importierte kuratierte Ort dazu (gleicher Titel, wie es ein
    // Massen-Dedup-Kandidat wäre). MIT der Option wird SEED1 zurückgesetzt und neu
    // geprüft -- aber da SEED1 UND CURATED1 jetzt gleichnamig als Kandidaten dastehen,
    // ist das GENUINE Mehrdeutigkeit (Spec 11 §4.2 Pfad 3a) -- kein stilles Raten
    // zugunsten des kuratierten Orts, sondern korrekt Review-Klasse P mit beiden
    // Kandidaten. Der eigentliche "Ersatz" passiert danach über den Dedup-Merge
    // (SEED1 -> CURATED1, §9.2) -- das ist die vom Nutzer bestätigte Ausbaustufe.
    db.placeObjects.set('CURATED1', place('CURATED1', { title: 'Ochtrup', type: 'Town', note: 'kuratiert' }));
    const result = applyPlaceResolution(db, { resetUncuratedLinks: true });

    expect(db.individuals.get('I1')!.birth.placeId).toBeNull();
    expect(result.review).toHaveLength(1);
    expect(result.review[0].klass).toBe('P');
    expect(result.review[0].candidates?.slice().sort()).toEqual(['CURATED1', 'SEED1']);
  });

  it('Event zeigt bereits auf einen kuratierten Ort -> bleibt unangetastet (schützt bewusste Verknüpfungen)', () => {
    const db = makeDatabase();
    db.placeObjects.set('CURATED1', place('CURATED1', { title: 'Ochtrup', type: 'Town', note: 'kuratiert' }));
    db.placeObjects.set('CURATED2', place('CURATED2', { title: 'Ochtrup', type: 'Village', note: 'anderer kuratierter Ort, gleicher Name' }));
    const p = makePerson('I1', { birth: makeEvent('BIRT', { place: 'Ochtrup', placeId: 'CURATED1' }) });
    db.individuals.set(p.id, p);

    applyPlaceResolution(db, { resetUncuratedLinks: true });

    // Bleibt bei CURATED1 -- wird NICHT auf CURATED2 umgehängt, obwohl beide "Ochtrup"
    // heißen und CURATED2 zufällig zuerst in der Map steht.
    expect(db.individuals.get('I1')!.birth.placeId).toBe('CURATED1');
  });

  it('Event zeigt auf einen NICHT kuratierten Hof, gleichwertiger kuratierter Hof kommt hinzu -> wird zurückgesetzt und landet korrekt in Review-Klasse C (Hof-Adresse mehrdeutig), Dorf-Zuordnung bleibt erhalten', () => {
    const db = makeDatabase();
    db.placeObjects.set('V1', place('V1', { title: 'Ochtrup' }));
    // Bare Seed-Hof (genau 1 addrs-Eintrag, keine Daten -> isEnrichedHof = false).
    db.hofObjects.set('SEEDHOF', hof('SEEDHOF', 'V1', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    const p = makePerson('I1', {
      events: [makeEvent('RESI', { place: 'Ochtrup', addr: 'Wall 33', placeId: 'V1', hofId: 'SEEDHOF' })],
    });
    db.individuals.set(p.id, p);

    // Kuratierter Hof mit angereicherten Daten kommt hinzu (z. B. aus orte.json-Import) —
    // gleiche Adresse/Dorf wie SEEDHOF, also strukturell dieselbe Hof-Identität, aber ein
    // eigenes Objekt (Union-Merge legt bei einem Import nichts zusammen, das übernimmt der
    // Dedup-Merge). Zwei Kandidaten für dieselbe Adresse -> Review-Klasse C, kein stilles
    // Raten -- die Dorf-Zuordnung (placeId) bleibt davon unberührt, nur der Hof wird strittig.
    db.hofObjects.set('CURATEDHOF', hof('CURATEDHOF', 'V1', { addrs: [{ value: 'Wall 33', from: null, to: null }], note: 'kuratiert' }));

    const result = applyPlaceResolution(db, { resetUncuratedLinks: true });

    expect(db.individuals.get('I1')!.events[0].hofId).toBeNull();
    expect(db.individuals.get('I1')!.events[0].placeId).toBe('V1');
    expect(result.review).toHaveLength(1);
    expect(result.review[0].klass).toBe('C');
    expect(result.review[0].candidates?.slice().sort()).toEqual(['CURATEDHOF', 'SEEDHOF']);
  });
});

describe('deletePlaceCascade — ADR-v9-78 Punkt 1: Ort löschen ohne hängende event.placeId-Referenzen', () => {
  it('setzt event.placeId auf null, wenn es auf den gelöschten Ort zeigt, und entfernt das PlaceObject', () => {
    let db = makeDatabase();
    db.placeObjects.set('P1', place('P1', { title: 'Ochtrup' }));
    const p = makePerson('I1', { birth: makeEvent('BIRT', { place: 'Ochtrup', placeId: 'P1' }) });
    db.individuals.set(p.id, p);

    db = deletePlaceCascade(db, 'P1');

    expect(db.individuals.get('I1')!.birth.placeId).toBeNull();
    expect(db.placeObjects.has('P1')).toBe(false);
  });

  it('lässt event.placeId unangetastet, wenn es auf einen ANDEREN Ort zeigt', () => {
    let db = makeDatabase();
    db.placeObjects.set('P1', place('P1', { title: 'Ochtrup' }));
    db.placeObjects.set('P2', place('P2', { title: 'Wall' }));
    const p = makePerson('I1', { birth: makeEvent('BIRT', { place: 'Wall', placeId: 'P2' }) });
    db.individuals.set(p.id, p);

    db = deletePlaceCascade(db, 'P1');

    expect(db.individuals.get('I1')!.birth.placeId).toBe('P2');
    expect(db.placeObjects.has('P2')).toBe(true);
  });

  it('Event ganz ohne placeId/hofId bleibt unangetastet (kein Crash)', () => {
    const db = makeDatabase();
    db.placeObjects.set('P1', place('P1', { title: 'Ochtrup' }));
    const p = makePerson('I1', { birth: makeEvent('BIRT', { place: '' }) });
    db.individuals.set(p.id, p);

    expect(() => deletePlaceCascade(db, 'P1')).not.toThrow();
    expect(db.individuals.get('I1')!.birth.placeId).toBeNull();
  });

  it('deckt ALLE Event-Slots ab: chr/death/buri/events[] bei Person, engagement/marriage/events[] bei Family', () => {
    let db = makeDatabase();
    db.placeObjects.set('P1', place('P1', { title: 'Ochtrup' }));

    const p = makePerson('I1', {
      chr: makeEvent('CHR', { place: 'Ochtrup', placeId: 'P1' }),
      death: makeEvent('DEAT', { place: 'Ochtrup', placeId: 'P1' }),
      buri: makeEvent('BURI', { place: 'Ochtrup', placeId: 'P1' }),
      events: [makeEvent('RESI', { place: 'Ochtrup', placeId: 'P1' })],
    });
    db.individuals.set(p.id, p);

    const f = makeFamily('F1', {
      engagement: makeEvent('ENGA', { place: 'Ochtrup', placeId: 'P1' }),
      marriage: makeEvent('MARR', { place: 'Ochtrup', placeId: 'P1' }),
      events: [makeEvent('EVEN', { place: 'Ochtrup', placeId: 'P1' })],
    });
    db.families.set(f.id, f);

    db = deletePlaceCascade(db, 'P1');

    const updatedP = db.individuals.get('I1')!;
    expect(updatedP.chr.placeId).toBeNull();
    expect(updatedP.death.placeId).toBeNull();
    expect(updatedP.buri.placeId).toBeNull();
    expect(updatedP.events[0].placeId).toBeNull();

    const updatedF = db.families.get('F1')!;
    expect(updatedF.engagement.placeId).toBeNull();
    expect(updatedF.marriage.placeId).toBeNull();
    expect(updatedF.events[0].placeId).toBeNull();

    expect(db.placeObjects.has('P1')).toBe(false);
  });
});

describe('deleteHofCascade — ADR-v9-78 Punkt 1: Hof löschen ohne hängende event.hofId-Referenzen', () => {
  it('setzt event.hofId auf null, wenn es auf den gelöschten Hof zeigt, und entfernt das HofObject', () => {
    let db = makeDatabase();
    db.placeObjects.set('V1', place('V1', { title: 'Ochtrup' }));
    db.hofObjects.set('H1', hof('H1', 'V1', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    const p = makePerson('I1', {
      events: [makeEvent('RESI', { place: 'Ochtrup', addr: 'Wall 33', placeId: 'V1', hofId: 'H1' })],
    });
    db.individuals.set(p.id, p);

    db = deleteHofCascade(db, 'H1');

    expect(db.individuals.get('I1')!.events[0].hofId).toBeNull();
    // placeId (Dorf) bleibt unberührt -- nur der Hof wird gelöscht.
    expect(db.individuals.get('I1')!.events[0].placeId).toBe('V1');
    expect(db.hofObjects.has('H1')).toBe(false);
  });

  it('lässt event.hofId unangetastet, wenn es auf einen ANDEREN Hof zeigt', () => {
    let db = makeDatabase();
    db.placeObjects.set('V1', place('V1', { title: 'Ochtrup' }));
    db.hofObjects.set('H1', hof('H1', 'V1', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    db.hofObjects.set('H2', hof('H2', 'V1', { addrs: [{ value: 'Kirchplatz 1', from: null, to: null }] }));
    const p = makePerson('I1', {
      events: [makeEvent('RESI', { place: 'Ochtrup', addr: 'Kirchplatz 1', placeId: 'V1', hofId: 'H2' })],
    });
    db.individuals.set(p.id, p);

    db = deleteHofCascade(db, 'H1');

    expect(db.individuals.get('I1')!.events[0].hofId).toBe('H2');
    expect(db.hofObjects.has('H2')).toBe(true);
  });

  it('Event ganz ohne placeId/hofId bleibt unangetastet (kein Crash)', () => {
    const db = makeDatabase();
    db.hofObjects.set('H1', hof('H1', 'V1', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    const p = makePerson('I1', { birth: makeEvent('BIRT', { place: '' }) });
    db.individuals.set(p.id, p);

    expect(() => deleteHofCascade(db, 'H1')).not.toThrow();
    expect(db.individuals.get('I1')!.birth.hofId).toBeNull();
  });

  it('deckt ALLE Event-Slots ab: birth/chr/death/buri/events[] bei Person, engagement/marriage/events[] bei Family', () => {
    let db = makeDatabase();
    db.placeObjects.set('V1', place('V1', { title: 'Ochtrup' }));
    db.hofObjects.set('H1', hof('H1', 'V1', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));

    const p = makePerson('I1', {
      birth: makeEvent('BIRT', { place: 'Ochtrup', addr: 'Wall 33', placeId: 'V1', hofId: 'H1' }),
      chr: makeEvent('CHR', { place: 'Ochtrup', addr: 'Wall 33', placeId: 'V1', hofId: 'H1' }),
      death: makeEvent('DEAT', { place: 'Ochtrup', addr: 'Wall 33', placeId: 'V1', hofId: 'H1' }),
      buri: makeEvent('BURI', { place: 'Ochtrup', addr: 'Wall 33', placeId: 'V1', hofId: 'H1' }),
      events: [makeEvent('RESI', { place: 'Ochtrup', addr: 'Wall 33', placeId: 'V1', hofId: 'H1' })],
    });
    db.individuals.set(p.id, p);

    const f = makeFamily('F1', {
      engagement: makeEvent('ENGA', { place: 'Ochtrup', addr: 'Wall 33', placeId: 'V1', hofId: 'H1' }),
      marriage: makeEvent('MARR', { place: 'Ochtrup', addr: 'Wall 33', placeId: 'V1', hofId: 'H1' }),
      events: [makeEvent('EVEN', { place: 'Ochtrup', addr: 'Wall 33', placeId: 'V1', hofId: 'H1' })],
    });
    db.families.set(f.id, f);

    db = deleteHofCascade(db, 'H1');

    const updatedP = db.individuals.get('I1')!;
    expect(updatedP.birth.hofId).toBeNull();
    expect(updatedP.chr.hofId).toBeNull();
    expect(updatedP.death.hofId).toBeNull();
    expect(updatedP.buri.hofId).toBeNull();
    expect(updatedP.events[0].hofId).toBeNull();

    const updatedF = db.families.get('F1')!;
    expect(updatedF.engagement.hofId).toBeNull();
    expect(updatedF.marriage.hofId).toBeNull();
    expect(updatedF.events[0].hofId).toBeNull();

    expect(db.hofObjects.has('H1')).toBe(false);
  });
});

describe('renameHofAddrInEvents — explizite Hof-Umbenennung zieht referenzierende event.addr mit (Nutzeraktion, ADR-v9-47 gilt hier NICHT)', () => {
  it('Event mit passendem hofId UND addr===oldValue: addr wird neu, place wird neu berechnet (zeigt den neuen Namen)', () => {
    let db = makeDatabase();
    db.placeObjects.set('V1', place('V1', { title: 'Ochtrup' }));
    // Aufrufer hat die Umbenennung bereits in db.hofObjects gespeichert, BEVOR die
    // Funktion gerufen wird (Vorbedingung laut Auftrag).
    db.hofObjects.set('H1', hof('H1', 'V1', { addrs: [{ value: 'Wall 99', from: null, to: null }] }));
    const p = makePerson('I1', {
      birth: makeEvent('BIRT', { place: 'Wall 33, Ochtrup', addr: 'Wall 33', placeId: 'V1', hofId: 'H1' }),
    });
    db.individuals.set(p.id, p);

    db = renameHofAddrInEvents(db, 'H1', 'Wall 33', 'Wall 99');

    const updated = db.individuals.get('I1')!.birth;
    expect(updated.addr).toBe('Wall 99');
    expect(updated.place).toBe('Wall 99, Ochtrup');
  });

  it('Event mit passendem hofId, aber abweichendem addr (nicht oldValue): bleibt komplett unangetastet (LP-1-Guard)', () => {
    let db = makeDatabase();
    db.placeObjects.set('V1', place('V1', { title: 'Ochtrup' }));
    db.hofObjects.set('H1', hof('H1', 'V1', { addrs: [{ value: 'Wall 99', from: null, to: null }] }));
    const p = makePerson('I1', {
      birth: makeEvent('BIRT', { place: 'Oster 82a, Wester 141, Ochtrup', addr: 'Oster 82a, Wester 141', placeId: 'V1', hofId: 'H1' }),
    });
    db.individuals.set(p.id, p);

    db = renameHofAddrInEvents(db, 'H1', 'Wall 33', 'Wall 99');

    const updated = db.individuals.get('I1')!.birth;
    expect(updated.addr).toBe('Oster 82a, Wester 141');
    expect(updated.place).toBe('Oster 82a, Wester 141, Ochtrup');
  });

  it('Event mit passendem hofId, aber addr==="" (leer): bleibt unangetastet', () => {
    let db = makeDatabase();
    db.placeObjects.set('V1', place('V1', { title: 'Ochtrup' }));
    db.hofObjects.set('H1', hof('H1', 'V1', { addrs: [{ value: 'Wall 99', from: null, to: null }] }));
    const p = makePerson('I1', {
      birth: makeEvent('BIRT', { place: 'Wall 33, Ochtrup', addr: '', placeId: 'V1', hofId: 'H1' }),
    });
    db.individuals.set(p.id, p);

    db = renameHofAddrInEvents(db, 'H1', 'Wall 33', 'Wall 99');

    const updated = db.individuals.get('I1')!.birth;
    expect(updated.addr).toBe('');
    expect(updated.place).toBe('Wall 33, Ochtrup');
  });

  it('Event mit ANDEREM hofId (zufällig addr===oldValue): bleibt unangetastet', () => {
    let db = makeDatabase();
    db.placeObjects.set('V1', place('V1', { title: 'Ochtrup' }));
    db.hofObjects.set('H1', hof('H1', 'V1', { addrs: [{ value: 'Wall 99', from: null, to: null }] }));
    db.hofObjects.set('H2', hof('H2', 'V1', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    const p = makePerson('I1', {
      birth: makeEvent('BIRT', { place: 'Wall 33, Ochtrup', addr: 'Wall 33', placeId: 'V1', hofId: 'H2' }),
    });
    db.individuals.set(p.id, p);

    db = renameHofAddrInEvents(db, 'H1', 'Wall 33', 'Wall 99');

    const updated = db.individuals.get('I1')!.birth;
    expect(updated.addr).toBe('Wall 33');
    expect(updated.hofId).toBe('H2');
    expect(updated.place).toBe('Wall 33, Ochtrup');
  });

  it('Event mit hofId===null (aber addr===oldValue): bleibt unangetastet (nicht verlinkt)', () => {
    let db = makeDatabase();
    db.placeObjects.set('V1', place('V1', { title: 'Ochtrup' }));
    db.hofObjects.set('H1', hof('H1', 'V1', { addrs: [{ value: 'Wall 99', from: null, to: null }] }));
    const p = makePerson('I1', {
      birth: makeEvent('BIRT', { place: 'Wall 33, Ochtrup', addr: 'Wall 33', placeId: 'V1', hofId: null }),
    });
    db.individuals.set(p.id, p);

    db = renameHofAddrInEvents(db, 'H1', 'Wall 33', 'Wall 99');

    const updated = db.individuals.get('I1')!.birth;
    expect(updated.addr).toBe('Wall 33');
    expect(updated.hofId).toBeNull();
    expect(updated.place).toBe('Wall 33, Ochtrup');
  });

  it('Slot-Abdeckung: trifft sowohl einen Person-events[]-Eintrag als auch einen Family-Slot (marriage), nicht nur birth', () => {
    let db = makeDatabase();
    db.placeObjects.set('V1', place('V1', { title: 'Ochtrup' }));
    db.hofObjects.set('H1', hof('H1', 'V1', { addrs: [{ value: 'Wall 99', from: null, to: null }] }));
    const p = makePerson('I1', {
      events: [makeEvent('RESI', { place: 'Wall 33, Ochtrup', addr: 'Wall 33', placeId: 'V1', hofId: 'H1' })],
    });
    db.individuals.set(p.id, p);
    const f = makeFamily('F1', {
      marriage: makeEvent('MARR', { place: 'Wall 33, Ochtrup', addr: 'Wall 33', placeId: 'V1', hofId: 'H1' }),
    });
    db.families.set(f.id, f);

    db = renameHofAddrInEvents(db, 'H1', 'Wall 33', 'Wall 99');

    expect(db.individuals.get('I1')!.events[0].addr).toBe('Wall 99');
    expect(db.individuals.get('I1')!.events[0].place).toBe('Wall 99, Ochtrup');
    expect(db.families.get('F1')!.marriage.addr).toBe('Wall 99');
    expect(db.families.get('F1')!.marriage.place).toBe('Wall 99, Ochtrup');
  });

  it('datierter Hof mit zwei Adressvarianten: ein Event mit der NICHT umbenannten periodengerechten Adresse bleibt unangetastet (Guard greift automatisch)', () => {
    let db = makeDatabase();
    db.placeObjects.set('V1', place('V1', { title: 'Ochtrup' }));
    // Nach der Umbenennung: die alte Variante "Wall 33" (bis 1950) bleibt bestehen,
    // die spätere Variante wurde von "Wall 33 neu" (ab 1951) auf "Wall 99" umbenannt.
    db.hofObjects.set('H1', hof('H1', 'V1', {
      addrs: [
        { value: 'Wall 33', from: null, to: 1950 },
        { value: 'Wall 99', from: 1951, to: null },
      ],
    }));
    const pOld = makePerson('I1', {
      birth: makeEvent('BIRT', { date: '1940', place: 'Wall 33, Ochtrup', addr: 'Wall 33', placeId: 'V1', hofId: 'H1' }),
    });
    db.individuals.set(pOld.id, pOld);

    // Umbenennung betraf nur die ab-1951-Variante ("Wall 33 neu" -> "Wall 99").
    db = renameHofAddrInEvents(db, 'H1', 'Wall 33 neu', 'Wall 99');

    const updated = db.individuals.get('I1')!.birth;
    expect(updated.addr).toBe('Wall 33');
    expect(updated.place).toBe('Wall 33, Ochtrup');
  });
});
