// tests/core/places-commands.test.ts — Mutations-Kommandos für PlaceObject/HofObject
// (Spec 20 §1.7/§1.8 [K] "Bearbeitung"). Reine Funktionen, deshalb Unit- statt
// Component-Test (TST-5) — analog core/model/integrity.ts-Kommandos.
import { describe, expect, it } from 'vitest';
import {
  savePlaceObject,
  deletePlaceObject,
  saveHofObject,
  deleteHofObject,
  withAddedPname,
  withRemovedPname,
  withAddedEnclosedBy,
  withRemovedEnclosedBy,
  withAddedHofAddr,
  withRemovedHofAddr,
  linkEventToPlace,
} from '../../core/places/commands';
import { makePlaceRegistry, makeHofRegistry } from '../../core/places/index';
import { place, hof, placeMap, hofMap, ev } from './places-fixtures';

describe('savePlaceObject/deletePlaceObject — Upsert per id', () => {
  it('legt ein neues PlaceObject an', () => {
    const places = placeMap();
    savePlaceObject(places, place('@P1@', { title: 'Ochtrup' }));
    expect(places.get('@P1@')?.title).toBe('Ochtrup');
  });

  it('ersetzt ein bestehendes PlaceObject vollständig (kein Merge)', () => {
    const places = placeMap(place('@P1@', { title: 'Alt', type: 'Village', note: 'alte Notiz' }));
    savePlaceObject(places, place('@P1@', { title: 'Neu' }));
    expect(places.get('@P1@')).toEqual(place('@P1@', { title: 'Neu' }));
  });

  it('deletePlaceObject entfernt per id', () => {
    const places = placeMap(place('@P1@'));
    deletePlaceObject(places, '@P1@');
    expect(places.has('@P1@')).toBe(false);
  });
});

describe('saveHofObject/deleteHofObject — Upsert per id', () => {
  it('legt einen neuen Hof an', () => {
    const hofs = hofMap();
    saveHofObject(hofs, hof('@H1@', '@P1@', { note: 'Hof am Bach' }));
    expect(hofs.get('@H1@')?.note).toBe('Hof am Bach');
  });

  it('deleteHofObject entfernt per id', () => {
    const hofs = hofMap(hof('@H1@', '@P1@'));
    deleteHofObject(hofs, '@H1@');
    expect(hofs.has('@H1@')).toBe(false);
  });
});

describe('withAddedPname/withRemovedPname — pnames-Zeitachse (Formular-Pfad)', () => {
  it('hängt eine datierte Namensvariante an, ohne das Original zu mutieren', () => {
    const pl = place('@P1@', { title: 'Sassenberg' });
    const next = withAddedPname(pl, 'Sassenbergk', 1600, 1750);
    expect(next.pnames).toEqual([{ value: 'Sassenbergk', from: 1600, to: 1750 }]);
    expect(pl.pnames).toEqual([]); // Original unangetastet
  });

  it('ignoriert leere Werte (kein leerer pnames-Eintrag)', () => {
    const pl = place('@P1@');
    const next = withAddedPname(pl, '   ', null, null);
    expect(next).toBe(pl);
  });

  it('entfernt eine pnames-Variante am Index', () => {
    const pl = place('@P1@', {
      pnames: [
        { value: 'A', from: null, to: null },
        { value: 'B', from: null, to: null },
      ],
    });
    const next = withRemovedPname(pl, 0);
    expect(next.pnames).toEqual([{ value: 'B', from: null, to: null }]);
  });
});

describe('withAddedEnclosedBy/withRemovedEnclosedBy — Verwaltungs-Zeitachse', () => {
  it('hängt eine datierte enclosedBy-Zugehörigkeit an', () => {
    const pl = place('@P1@');
    const next = withAddedEnclosedBy(pl, '@KREIS@', 1900, null);
    expect(next.enclosedBy).toEqual([{ placeId: '@KREIS@', from: 1900, to: null }]);
  });

  it('ignoriert leere parentId', () => {
    const pl = place('@P1@');
    const next = withAddedEnclosedBy(pl, '', null, null);
    expect(next).toBe(pl);
  });

  it('entfernt eine enclosedBy-Zugehörigkeit am Index', () => {
    const pl = place('@P1@', { enclosedBy: [{ placeId: '@A@', from: null, to: null }, { placeId: '@B@', from: null, to: null }] });
    const next = withRemovedEnclosedBy(pl, 1);
    expect(next.enclosedBy).toEqual([{ placeId: '@A@', from: null, to: null }]);
  });
});

describe('withAddedHofAddr/withRemovedHofAddr — Adressvarianten (Formular-Pfad)', () => {
  it('hängt eine Adressvariante an, ohne Dedup (expliziter Nutzer-Intent)', () => {
    const h = hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] });
    const next = withAddedHofAddr(h, 'Wall 33 neu', 1950, null);
    expect(next.addrs).toEqual([
      { value: 'Wall 33', from: null, to: null },
      { value: 'Wall 33 neu', from: 1950, to: null },
    ]);
  });

  it('ignoriert leere Werte', () => {
    const h = hof('@H1@', '@P1@');
    const next = withAddedHofAddr(h, '', null, null);
    expect(next).toBe(h);
  });

  it('entfernt eine Adressvariante am Index', () => {
    const h = hof('@H1@', '@P1@', {
      addrs: [
        { value: 'A', from: null, to: null },
        { value: 'B', from: null, to: null },
      ],
    });
    const next = withRemovedHofAddr(h, 0);
    expect(next.addrs).toEqual([{ value: 'B', from: null, to: null }]);
  });
});

describe('linkEventToPlace — String→PlaceObject verknüpfen (Spec 20 §1.7 [K], ADR-v9-19)', () => {
  it('setzt ev.placeId UND reprojiziert ev.place sofort (INV-PLACE, Sofort-Reprojektion)', () => {
    const places = placeMap(
      place('@P1@', {
        title: 'Ochtrup',
        type: 'Town',
        enclosedBy: [{ placeId: '@DE@', from: null, to: null }],
      }),
      place('@DE@', { title: 'Deutschland', type: 'Country' }),
    );
    const ctx = { places: makePlaceRegistry(places), hofs: makeHofRegistry(hofMap()) };
    const e = ev('BIRT', { place: 'irgendein roher String', date: '1900' });
    linkEventToPlace(e, '@P1@', ctx);
    expect(e.placeId).toBe('@P1@');
    // ev.place ist ab sofort die Projektion aus dem Modell, nicht mehr der Rohstring.
    expect(e.place).toBe('Ochtrup, Deutschland');
  });

  it('reprojiziert periodengerecht auf die im Jahr gültige pname', () => {
    const places = placeMap(
      place('@S@', {
        title: 'Sassenberg',
        type: 'Town',
        pnames: [{ value: 'Sassenbergk', from: 1600, to: 1750 }],
      }),
    );
    const ctx = { places: makePlaceRegistry(places), hofs: makeHofRegistry(hofMap()) };
    const e = ev('BIRT', { place: 'Sassenberg', date: '1700' });
    linkEventToPlace(e, '@S@', ctx);
    expect(e.place).toBe('Sassenbergk');
  });

  it('unbekannte placeId (kein PO) → ev.place bleibt Rohstring (kein Overwrite mit null)', () => {
    const ctx = { places: makePlaceRegistry(placeMap()), hofs: makeHofRegistry(hofMap()) };
    const e = ev('BIRT', { place: 'Ochtrup' });
    linkEventToPlace(e, '@NOPE@', ctx);
    expect(e.placeId).toBe('@NOPE@');
    expect(e.place).toBe('Ochtrup');
  });
});
