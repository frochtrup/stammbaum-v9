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

describe('linkEventToPlace — String→PlaceObject verknüpfen (Spec 20 §1.7 [K])', () => {
  it('setzt ev.placeId, ohne ev.place selbst umzuschreiben (Reprojektion läuft beim nächsten Laden)', () => {
    const e = ev('BIRT', { place: 'Ochtrup' });
    linkEventToPlace(e, '@P1@');
    expect(e.placeId).toBe('@P1@');
    expect(e.place).toBe('Ochtrup'); // unverändert — keine Parallel-Reprojektion in der UI
  });
});
