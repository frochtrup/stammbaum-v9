// tests/ui/app-state-cow.test.ts — die Zusicherung, auf der Undo/Redo steht (ADR-v9-92,
// BL-01): KEIN AppState-Editier-Kommando darf einen zurückgehaltenen Snapshot verändern.
//
// Warum als eigener Test und nicht implizit über die Kommando-Tests: Copy-on-Write ist
// eine Eigenschaft, die man nur sieht, wenn man den VORZUSTAND festhält und nach dem
// Kommando erneut prüft. Genau diese Prüfung fehlte vor BL-01 — die Kommandos waren alle
// grün getestet und mutierten trotzdem in-place (am Code gemessen: `addTask` und
// `saveFamily` schrieben in einen nach ADR-Definition gebauten Snapshot hinein).
//
// Der Test ist damit auch die Sperre gegen einen Rückfall: wer ein neues Editier-Kommando
// baut, das wieder in-place mutiert, macht hier eine Zeile rot.
import { describe, expect, it } from 'vitest';
import { createAppState, type AppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makePerson, makeFamily, makeEvent, makeSource } from '../../core/model';
import type { Database } from '../../core/model/types';
import { place, hof } from '../core/places-fixtures';

/** Snapshot nach ADR-v9-92: neues Database, Entitäts-Maps FLACH kopiert (keine Tiefkopie). */
function snapshot(db: Database): Database {
  return {
    ...db,
    individuals: new Map(db.individuals),
    families: new Map(db.families),
    sources: new Map(db.sources),
    placeObjects: new Map(db.placeObjects),
    hofObjects: new Map(db.hofObjects),
  };
}

function seeded(): AppState {
  const appState = createAppState();
  const db = makeDatabase();
  db.individuals.set(
    '@I1@',
    makePerson('@I1@', {
      given: 'Otto',
      death: makeEvent('DEAT', { addr: 'Wall 33', place: 'Ochtrup' }),
    }),
  );
  db.individuals.set('@I2@', makePerson('@I2@', { given: 'Anna' }));
  db.families.set('@F1@', makeFamily('@F1@'));
  db.sources.set('@S1@', makeSource('@S1@', { title: 'Kirchenbuch' }));
  appState.loadDatabase(db, 'test.ged');
  appState.savePlace(place('@OCHTRUP@', { title: 'Ochtrup', type: 'Town' }));
  return appState;
}

const person = (db: Database, id = '@I1@') => db.individuals.get(id)!;

describe('AppState — kein Kommando verändert einen gehaltenen Snapshot (ADR-v9-92)', () => {
  it('savePerson', () => {
    const appState = seeded();
    const before = snapshot(appState.db);

    appState.savePerson({ ...person(appState.db), given: 'Geändert' });

    expect(person(before).given).toBe('Otto');
    expect(person(appState.db).given).toBe('Geändert');
  });

  it('saveFamily — auch die synchron nachgeführte INDI-Seite (INV-P3)', () => {
    const appState = seeded();
    const before = snapshot(appState.db);

    appState.saveFamily({ ...appState.db.families.get('@F1@')!, children: ['@I1@'] });

    expect(before.families.get('@F1@')!.children).toHaveLength(0);
    expect(person(before).childOf).toHaveLength(0);
    expect(appState.db.families.get('@F1@')!.children).toEqual(['@I1@']);
    expect(person(appState.db).childOf).toHaveLength(1);
  });

  it('addTask — verschachteltes Array am Owner', () => {
    const appState = seeded();
    const before = snapshot(appState.db);

    appState.addTask('person', '@I1@', 't1', 'Kirchenbuch prüfen', 'Kirchenbuch', '2026-07-18');

    expect(person(before).tasks).toHaveLength(0);
    expect(person(appState.db).tasks).toHaveLength(1);
  });

  it('addLogEntry / addHypothesis', () => {
    const appState = seeded();
    const before = snapshot(appState.db);

    appState.addLogEntry('person', '@I1@', {
      date: '2026-07-18',
      repoRef: '',
      sourceRef: '',
      query: 'Taufregister 1820',
      result: 'notfound',
      note: '',
      taskId: '',
    });
    appState.addHypothesis('person', '@I1@', 'h1', { text: 'Vermutung' }, '2026-07-18');

    expect(person(before).researchLog).toHaveLength(0);
    expect(person(before).hypotheses).toHaveLength(0);
    expect(person(appState.db).researchLog).toHaveLength(1);
    expect(person(appState.db).hypotheses).toHaveLength(1);
  });

  it('saveSource', () => {
    const appState = seeded();
    const before = snapshot(appState.db);

    appState.saveSource({ ...appState.db.sources.get('@S1@')!, title: 'Neu' });

    expect(before.sources.get('@S1@')!.title).toBe('Kirchenbuch');
  });

  it('linkEventToHof — berührt ev.addr/ev.place, beide persistiert', () => {
    const appState = seeded();
    appState.saveHof(hof('_hof_a', '@OCHTRUP@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    const before = snapshot(appState.db);
    const target = person(appState.db).death;

    expect(appState.linkEventToHof(target, '_hof_a')).toBe(true);

    expect(person(before).death.hofId).toBeNull();
    expect(person(appState.db).death.hofId).toBe('_hof_a');
  });

  it('updateHofAddr — Umbenennung zieht auf referenzierende Ereignisse durch', () => {
    const appState = seeded();
    appState.saveHof(hof('_hof_a', '@OCHTRUP@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    appState.linkEventToHof(person(appState.db).death, '_hof_a');
    const before = snapshot(appState.db);

    appState.updateHofAddr('_hof_a', 0, 'Wall 99', null, null);

    // Der Vorzustand behält den alten Namen — sowohl am Hof als auch am Ereignis.
    expect(before.hofObjects.get('_hof_a')!.addrs[0]!.value).toBe('Wall 33');
    expect(person(before).death.addr).toBe('Wall 33');
    expect(appState.db.hofObjects.get('_hof_a')!.addrs[0]!.value).toBe('Wall 99');
    expect(person(appState.db).death.addr).toBe('Wall 99');
  });

  it('mergeHof — die gemeldete Umhängung wird nachgezogen, ohne den Vorzustand zu berühren', () => {
    const appState = seeded();
    appState.saveHof(hof('_hof_a', '@OCHTRUP@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    appState.saveHof(hof('_hof_b', '@OCHTRUP@', { addrs: [{ value: 'Wall 33a', from: null, to: null }] }));
    appState.linkEventToHof(person(appState.db).death, '_hof_b');
    const before = snapshot(appState.db);

    appState.mergeHof('_hof_a', ['_hof_b']);

    // Neuer Stand: Verlierer weg, Ereignis hängt am Überlebenden.
    expect(appState.db.hofObjects.has('_hof_b')).toBe(false);
    expect(person(appState.db).death.hofId).toBe('_hof_a');
    // Vorzustand: unberührt — genau das macht den Merge umkehrbar (ADR-v9-92 Punkt 4).
    expect(before.hofObjects.has('_hof_b')).toBe(true);
    expect(person(before).death.hofId).toBe('_hof_b');
  });

  // Das Geschwister zum `mergeHof`-Test darüber (ADR-v9-195). Es fehlte — und mit ihm der
  // Nachlauf: `mergePlace` zog nur `hofRemap` nach, `event.placeId` blieb auf dem gelöschten
  // Verlierer stehen. Am Realbestand sichtbar als „Ort nicht gefunden" beim Klick auf den
  // Ereignis-Ort und als Ereignisse, die im Steckbrief des Überlebenden fehlen.
  it('mergePlace — die gemeldete Umhängung wird nachgezogen, ohne den Vorzustand zu berühren', () => {
    const appState = seeded();
    appState.savePlace(place('@OCHTORP@', { title: 'Ochtorp', type: 'Town' }));
    appState.linkEventToPlace(person(appState.db).death, '@OCHTORP@');
    expect(person(appState.db).death.placeId).toBe('@OCHTORP@');
    const before = snapshot(appState.db);

    appState.mergePlace('@OCHTRUP@', ['@OCHTORP@']);

    // Neuer Stand: Verlierer weg, Ereignis hängt am Überlebenden — keine tote Referenz.
    expect(appState.db.placeObjects.has('@OCHTORP@')).toBe(false);
    expect(person(appState.db).death.placeId).toBe('@OCHTRUP@');
    // Vorzustand: unberührt — genau das macht den Merge umkehrbar (ADR-v9-92 Punkt 4).
    expect(before.placeObjects.has('@OCHTORP@')).toBe(true);
    expect(person(before).death.placeId).toBe('@OCHTORP@');
  });

  it('deleteHof — Kaskade räumt Referenzen nur im neuen Stand auf', () => {
    const appState = seeded();
    appState.saveHof(hof('_hof_a', '@OCHTRUP@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    appState.linkEventToHof(person(appState.db).death, '_hof_a');
    const before = snapshot(appState.db);

    appState.deleteHof('_hof_a');

    expect(person(before).death.hofId).toBe('_hof_a');
    expect(person(appState.db).death.hofId).toBeNull();
  });

  it('teilt unveränderte Entitäten mit dem Vorzustand (Snapshot bleibt billig)', () => {
    const appState = seeded();
    const before = snapshot(appState.db);

    appState.savePerson({ ...person(appState.db), given: 'Geändert' });

    // Nur die bearbeitete Person ist ein neues Objekt — alles andere wird geteilt.
    // Ohne diese Hälfte wäre jeder Snapshot wieder eine Tiefkopie (1,3 GiB statt 12,8 MiB).
    expect(appState.db.individuals.get('@I2@')).toBe(before.individuals.get('@I2@'));
    expect(appState.db.families.get('@F1@')).toBe(before.families.get('@F1@'));
    expect(appState.db.sources.get('@S1@')).toBe(before.sources.get('@S1@'));
  });
});
