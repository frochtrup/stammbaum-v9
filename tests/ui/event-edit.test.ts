// tests/ui/event-edit.test.ts — geteilte Ereignis-Formular-Feldlogik (ui/shell/event-edit.ts,
// extrahiert aus PersonForm.svelte/FamilyForm.svelte). Reine Runes-freie Logik — kein DOM
// nötig, läuft mit dem globalen 'node'-Environment (analog tests/ui/app-state.test.ts).
// Deckt Tristate-Dirty-Tracking (ADR-v9-30 Punkt 1) UND Ort-/Hof-Picker-Reprojektion
// (ADR-v9-42) ab — DIE Regeln, die EventEditModal.svelte byte-identisch zu PersonForm/
// FamilyForm reproduzieren MUSS (Bau-Auftrag "Einzel-Ereignis-Modal").
import { describe, expect, it } from 'vitest';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makeEvent, makePerson } from '../../core/model/index';
import { place } from '../core/places-fixtures';
import {
  toEditable,
  fromEditable,
  computeDate,
  liveEventFrom,
  markDateDirty,
  onMonthBlur,
  pickPlaceFor,
  pickHofFor,
  QUALIFIER_OPTIONS,
} from '../../ui/shell/event-edit';

describe('event-edit — toEditable/fromEditable Tristate-Erhaltung (ADR-v9-30 Punkt 1)', () => {
  it('parst ein bestehendes Datum in Qualifier/Tag/Monat/Jahr', () => {
    const appState = createAppState();
    const ev = makeEvent('BIRT', { date: '12 MAR 1890' });

    const editable = toEditable('BIRT', ev, appState.placeContext);

    expect(editable.dateQualifier).toBe('EXACT');
    expect(editable.day).toBe(12);
    expect(editable.month).toBe('MAR');
    expect(editable.year).toBe(1890);
  });

  it('lässt date:"" (Tag vorhanden, leer) unangetastet, solange dateDirty nicht gesetzt wird', () => {
    const appState = createAppState();
    const ev = makeEvent('BIRT', { date: '' });

    const editable = toEditable('BIRT', ev, appState.placeContext);
    const rebuilt = fromEditable(ev, editable);

    expect(rebuilt.date).toBe('');
  });

  it('lässt date:null unangetastet, solange dateDirty nicht gesetzt wird', () => {
    const appState = createAppState();
    const ev = makeEvent('BIRT');

    const editable = toEditable('BIRT', ev, appState.placeContext);
    const rebuilt = fromEditable(ev, editable);

    expect(rebuilt.date).toBeNull();
  });

  it('berechnet das Datum neu, sobald markDateDirty gesetzt wurde', () => {
    const appState = createAppState();
    const ev = makeEvent('BIRT');

    const editable = toEditable('BIRT', ev, appState.placeContext);
    editable.year = 1901;
    markDateDirty(editable);
    const rebuilt = fromEditable(ev, editable);

    expect(rebuilt.date).toBe('1901');
  });

  it('aktives Leeren aller Datumsfelder ergibt null, nie einen leeren String', () => {
    const appState = createAppState();
    const ev = makeEvent('BIRT', { date: '1890' });

    const editable = toEditable('BIRT', ev, appState.placeContext);
    editable.year = null;
    markDateDirty(editable);
    const rebuilt = fromEditable(ev, editable);

    expect(rebuilt.date).toBeNull();
  });

  it('onMonthBlur normalisiert den Monat UND markiert das Datumsformular als angefasst', () => {
    const appState = createAppState();
    const ev = makeEvent('BIRT');
    const editable = toEditable('BIRT', ev, appState.placeContext);

    onMonthBlur(editable, 'month', 'märz');

    expect(editable.month).toBe('MAR');
    expect(editable.dateDirty).toBe(true);
  });

  it('Ort als Freitext setzt place, ohne placeId/hofId anzutasten', () => {
    const appState = createAppState();
    const ev = makeEvent('BIRT', { placeId: '@P1@' });
    const editable = toEditable('BIRT', ev, appState.placeContext);

    editable.place = 'Ochtrup';
    editable.placeDirty = true;
    const rebuilt = fromEditable(ev, editable);

    expect(rebuilt.place).toBe('Ochtrup');
    expect(rebuilt.placeId).toBe('@P1@');
  });

  it('Tristate-Erhaltung: unberührtes Ort-Feld speichert den ROHEN Ursprungswert, nicht den Live-Anzeigewert', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    const person = makePerson('@I1@');
    person.birth.place = 'Ochtrupp'; // veralteter Cache-Rohwert
    person.birth.placeId = '@P1@';
    db.individuals.set('@I1@', person);
    appState.loadDatabase(db, 'test.ged');

    const editable = toEditable('BIRT', person.birth, appState.placeContext);
    // Live-Anfangswert zeigt den aktuellen Titel...
    expect(editable.place).toBe('Ochtrup');
    // ...aber unberührt gespeichert bleibt der ROHE Ursprungswert.
    const rebuilt = fromEditable(person.birth, editable);
    expect(rebuilt.place).toBe('Ochtrupp');
  });

  it('QUALIFIER_OPTIONS enthält alle 8 Datums-Qualifier', () => {
    expect(QUALIFIER_OPTIONS.map((q) => q.value)).toEqual([
      'EXACT', 'ABT', 'CAL', 'EST', 'BEF', 'AFT', 'BET', 'FROM',
    ]);
  });
});

describe('event-edit — Ort-/Hof-Picker-Reprojektion (ADR-v9-42)', () => {
  it('pickPlaceFor verknüpft placeId und reprojiziert den Freitext sofort', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');
    const ev = makeEvent('OCCU');
    const editable = toEditable('ev-0', ev, appState.placeContext);

    pickPlaceFor(appState, editable, '@P1@');

    expect(editable.placeId).toBe('@P1@');
    expect(editable.place).toBe('Ochtrup');
    expect(editable.placeDirty).toBe(true);
  });

  it('pickHofFor verknüpft hofId und reprojiziert place+addr', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');
    const ev = makeEvent('RESI', { placeId: '@P1@' });
    const editable = toEditable('ev-0', ev, appState.placeContext);
    appState.saveHof({
      id: '@H1@', villageId: '@P1@', addrs: [{ value: 'Bauernschaft 5', from: null, to: null }],
      lat: null, long: null, note: '', existsFrom: null, existsTo: null, predecessor: null,
      successor: null, govId: null, govTypes: null, schemaVersion: 1,
    });

    pickHofFor(appState, editable, '@H1@');

    expect(editable.hofId).toBe('@H1@');
    expect(editable.addr).toBe('Bauernschaft 5');
    expect(editable.place).toBe('Bauernschaft 5, Ochtrup');
    expect(editable.placeDirty).toBe(true);
  });
});

describe('event-edit — liveEventFrom', () => {
  it('baut ein Event-Objekt aus dem AKTUELLEN Formularzustand (für die Jahres-Ableitung)', () => {
    const appState = createAppState();
    const ev = makeEvent('OCCU', { value: 'Bauer' });
    const editable = toEditable('ev-0', ev, appState.placeContext);
    editable.year = 1950;
    markDateDirty(editable);

    const live = liveEventFrom(editable);

    expect(live.date).toBe('1950');
    expect(live.value).toBe('Bauer');
    expect(live.type).toBe('OCCU');
  });
});

describe('event-edit — computeDate', () => {
  it('gibt den originalDate zurück, solange dateDirty falsch ist', () => {
    const editable = toEditable('BIRT', makeEvent('BIRT', { date: 'ABT 1900' }), createAppState().placeContext);
    expect(computeDate(editable)).toBe('ABT 1900');
  });
});
