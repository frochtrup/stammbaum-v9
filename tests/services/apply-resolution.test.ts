// tests/services/apply-resolution.test.ts — Event-Sammel- + Rückschreib-Logik für den
// Import-Pfad (Spec 11 §4). Prüft, dass ALLE Event-Fundstellen einer Person/Familie
// (birth/chr/death/buri/events[] bzw. marriage/engagement/events[]) in EINEN
// resolveEvents()-Aufruf eingehen und die aufgelösten Kopien an der RICHTIGEN Stelle
// zurückgeschrieben werden — kein Event-Typ wird übersehen, keine Verwechslung der Slots.

import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, makeFamily, makeEvent } from '../../core/model';
import { applyPlaceResolution } from '../../services/places/apply-resolution';
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
