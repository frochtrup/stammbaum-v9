// tests/ui/hof-review-actions.test.ts — die drei Review-Aktionstypen (Spec 11 §6):
// "Hof anlegen", "Variante zum Hof", "Hof wählen".
//
// Seit ADR-v9-92 (Copy-on-Write) laufen die Aktionen über AppState-Kommandos, die den
// Owner des Ereignisses klonen, statt das Ereignis in-place zu mutieren. Zwei Folgen für
// diese Tests:
//   (a) Das Ereignis muss ECHT in der Datenbank leben — die Aktion adressiert seinen
//       Owner über die Objekt-Identität. Das war schon vorher der dokumentierte Kontrakt
//       ("`event` MUSS das echte, in Person/Family lebende Objekt sein",
//       place-review-model.ts); vorher konnte ein losgelöstes Ereignis den Test aber
//       trotzdem grün machen. Jetzt wird der Kontrakt erzwungen — und ein losgelöstes
//       Ereignis gemeldet statt still übergangen (Spec 21).
//   (b) Geprüft wird der Stand in `appState.db`, nicht die vor der Aktion gehaltene
//       Objekt-Referenz — die ist nach dem Kommando bewusst veraltet.
import { describe, expect, it } from 'vitest';
import { createAppState, type AppState } from '../../ui/shell/app-state.svelte';
import { makeEvent, makePerson } from '../../core/model';
import type { Event } from '../../core/model/types';
import { place } from '../core/places-fixtures';
import { applyCreateHof, applyAddVariant, applyChooseHof } from '../../ui/views/hof/hof-review-actions';

function seedAppStateWithVillage() {
  const appState = createAppState();
  appState.savePlace(place('@OCHTRUP@', { title: 'Ochtrup', type: 'Town' }));
  return appState;
}

let nextId = 0;

/** Hängt `ev` als Sterbe-Ereignis an eine frische Person in der db und liefert das
 *  db-ansässige Ereignis zurück (Objekt-Identität bleibt erhalten: savePerson ist ein
 *  Whole-Object-Upsert). */
function inDb(appState: AppState, ev: Event): Event {
  const id = `@I${++nextId}@`;
  appState.savePerson(makePerson(id, { death: ev }));
  return appState.db.individuals.get(id)!.death;
}

/** Das Ereignis im AKTUELLEN Stand — nach einem Kommando ist die alte Referenz veraltet. */
function current(appState: AppState, personIndex: number): Event {
  return appState.db.individuals.get(`@I${personIndex}@`)!.death;
}

describe('applyCreateHof — "Hof anlegen" (Klasse A/D)', () => {
  it('legt einen neuen Hof an und verknüpft das Event', () => {
    const appState = seedAppStateWithVillage();
    const ev = inDb(appState, makeEvent('DEAT', { addr: 'Wall 33' }));
    const idx = nextId;

    const result = applyCreateHof(appState, ev, '@OCHTRUP@');

    expect(result.ok).toBe(true);
    const linked = current(appState, idx);
    expect(linked.hofId).toBeTruthy();
    expect(linked.placeId).toBe('@OCHTRUP@');
    const created = appState.db.hofObjects.get(linked.hofId!);
    expect(created?.villageId).toBe('@OCHTRUP@');
    expect(created?.addrs[0]?.value).toBe('Wall 33');
  });

  it('findet einen bereits existierenden Hof wieder (idempotent), statt zu duplizieren', () => {
    const appState = seedAppStateWithVillage();
    const ev1 = inDb(appState, makeEvent('DEAT', { addr: 'Wall 33' }));
    const idx1 = nextId;
    applyCreateHof(appState, ev1, '@OCHTRUP@');
    const countAfterFirst = appState.db.hofObjects.size;

    const ev2 = inDb(appState, makeEvent('DEAT', { addr: 'Wall 33' }));
    const idx2 = nextId;
    applyCreateHof(appState, ev2, '@OCHTRUP@');

    expect(appState.db.hofObjects.size).toBe(countAfterFirst);
    expect(current(appState, idx2).hofId).toBe(current(appState, idx1).hofId);
  });

  it('meldet einen Fehler ohne Dorf-Scope', () => {
    const appState = seedAppStateWithVillage();
    const ev = inDb(appState, makeEvent('DEAT', { addr: 'Wall 33' }));

    const result = applyCreateHof(appState, ev, '');

    expect(result.ok).toBe(false);
  });

  it('meldet einen Fehler, wenn das Ereignis nicht in der db lebt (kein stiller No-Op)', () => {
    const appState = seedAppStateWithVillage();
    const losgeloest = makeEvent('DEAT', { addr: 'Wall 33' });

    const result = applyCreateHof(appState, losgeloest, '@OCHTRUP@');

    expect(result.ok).toBe(false);
  });
});

describe('applyAddVariant — "Variante zum Hof" (Klasse D)', () => {
  it('hängt die Adresse als neue Variante an einen bestehenden Hof + verknüpft das Event', () => {
    const appState = seedAppStateWithVillage();
    const seedEv = inDb(appState, makeEvent('RESI', { addr: 'Wall 33' }));
    const seedIdx = nextId;
    applyCreateHof(appState, seedEv, '@OCHTRUP@');
    const hofId = current(appState, seedIdx).hofId!;

    const driftEv = inDb(appState, makeEvent('DEAT', { addr: 'Wal 33' })); // Tippfehler-Variante
    const driftIdx = nextId;
    const result = applyAddVariant(appState, driftEv, hofId);

    expect(result.ok).toBe(true);
    expect(current(appState, driftIdx).hofId).toBe(hofId);
    expect(appState.db.hofObjects.get(hofId)?.addrs.map((a) => a.value)).toContain('Wal 33');
  });

  it('meldet einen Fehler, wenn der Ziel-Hof nicht existiert', () => {
    const appState = seedAppStateWithVillage();
    const ev = inDb(appState, makeEvent('DEAT', { addr: 'Wall 33' }));

    const result = applyAddVariant(appState, ev, '@gone@');

    expect(result.ok).toBe(false);
  });
});

describe('applyChooseHof — "Hof wählen" (Klasse C, mehrdeutig)', () => {
  it('verknüpft das Event direkt mit dem gewählten Hof', () => {
    const appState = seedAppStateWithVillage();
    const seedEv = inDb(appState, makeEvent('RESI', { addr: 'Wall 33' }));
    const seedIdx = nextId;
    applyCreateHof(appState, seedEv, '@OCHTRUP@');
    const hofId = current(appState, seedIdx).hofId!;

    const ev = inDb(appState, makeEvent('RESI', { addr: 'Wall 33' }));
    const idx = nextId;
    applyChooseHof(appState, ev, hofId);

    expect(current(appState, idx).hofId).toBe(hofId);
  });
});

// Drift-Fix (ADR-v9-42): die drei Aktionen reprojizieren ev.place/ev.addr SOFORT über
// linkEventToHof — NICHT erst "beim nächsten Laden". Kein Zwischenzustand mit gesetztem
// hofId und veraltetem/leerem ev.place.
describe('Sofort-Reprojektion (ADR-v9-42, INV-PLACE) — kein "erst beim nächsten Laden"', () => {
  it('applyCreateHof reprojiziert ev.place sofort (Hof-Blatt + Dorf), nicht erst beim Laden', () => {
    const appState = seedAppStateWithVillage();
    const ev = inDb(appState, makeEvent('DEAT', { addr: 'Wall 33', place: '' }));
    const idx = nextId;

    applyCreateHof(appState, ev, '@OCHTRUP@');

    // Ohne erneutes resolveEvents(): ev.place trägt bereits die Projektion.
    expect(current(appState, idx).place).toBe('Wall 33, Ochtrup');
  });

  it('applyAddVariant reprojiziert ev.place sofort auf den Ziel-Hof', () => {
    const appState = seedAppStateWithVillage();
    const seedEv = inDb(appState, makeEvent('RESI', { addr: 'Wall 33' }));
    const seedIdx = nextId;
    applyCreateHof(appState, seedEv, '@OCHTRUP@');
    const hofId = current(appState, seedIdx).hofId!;

    const driftEv = inDb(appState, makeEvent('DEAT', { addr: 'Wal 33', place: '' }));
    const driftIdx = nextId;
    applyAddVariant(appState, driftEv, hofId);

    // Sofort projiziert (Konvention α: Hof-Blatt vor dem Dorf). ev.place trägt die
    // KANONISCHE Hof-Adresse aus dem Modell (resolveAddrAsOf), nicht die rohe Drift-
    // Variante — genau das ist der Sinn der Reprojektion (ev.place = Modell-Wahrheit).
    expect(current(appState, driftIdx).place).toBe('Wall 33, Ochtrup');
    // Die explizit gesetzte ev.addr bleibt byte-identisch (Wire-ADDR-Roundtrip).
    expect(current(appState, driftIdx).addr).toBe('Wal 33');
  });

  it('applyChooseHof reprojiziert ev.place sofort auf den gewählten, existierenden Hof', () => {
    const appState = seedAppStateWithVillage();
    const seedEv = inDb(appState, makeEvent('RESI', { addr: 'Wall 33' }));
    const seedIdx = nextId;
    applyCreateHof(appState, seedEv, '@OCHTRUP@');
    const hofId = current(appState, seedIdx).hofId!;

    const target = inDb(appState, makeEvent('RESI', { addr: '', place: 'roher String' }));
    const idx = nextId;
    applyChooseHof(appState, target, hofId);

    expect(current(appState, idx).hofId).toBe(hofId);
    expect(current(appState, idx).place).toBe('Wall 33, Ochtrup');
    // ev.addr wird sofort aus dem Hof gefüllt (war leer).
    expect(current(appState, idx).addr).toBe('Wall 33');
  });
});
