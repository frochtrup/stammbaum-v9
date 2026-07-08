// tests/ui/hof-review-actions.test.ts — die drei Review-Aktionstypen (Spec 11 §6):
// "Hof anlegen", "Variante zum Hof", "Hof wählen". Jede Aktion mutiert am korrekten Ort
// (hofObjects via AppState-Kommando bzw. das Event direkt + AppState.touch()).
import { describe, expect, it } from 'vitest';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeEvent } from '../../core/model';
import { place } from '../core/places-fixtures';
import { applyCreateHof, applyAddVariant, applyChooseHof } from '../../ui/views/hof/hof-review-actions';

function seedAppStateWithVillage() {
  const appState = createAppState();
  appState.savePlace(place('@OCHTRUP@', { title: 'Ochtrup', type: 'Town' }));
  return appState;
}

describe('applyCreateHof — "Hof anlegen" (Klasse A/D)', () => {
  it('legt einen neuen Hof an und verknüpft das Event', () => {
    const appState = seedAppStateWithVillage();
    const ev = makeEvent('DEAT', { addr: 'Wall 33' });

    const result = applyCreateHof(appState, ev, '@OCHTRUP@');

    expect(result.ok).toBe(true);
    expect(ev.hofId).toBeTruthy();
    expect(ev.placeId).toBe('@OCHTRUP@');
    const created = appState.db.hofObjects.get(ev.hofId!);
    expect(created?.villageId).toBe('@OCHTRUP@');
    expect(created?.addrs[0]?.value).toBe('Wall 33');
  });

  it('findet einen bereits existierenden Hof wieder (idempotent), statt zu duplizieren', () => {
    const appState = seedAppStateWithVillage();
    const ev1 = makeEvent('DEAT', { addr: 'Wall 33' });
    applyCreateHof(appState, ev1, '@OCHTRUP@');
    const countAfterFirst = appState.db.hofObjects.size;

    const ev2 = makeEvent('DEAT', { addr: 'Wall 33' });
    applyCreateHof(appState, ev2, '@OCHTRUP@');

    expect(appState.db.hofObjects.size).toBe(countAfterFirst);
    expect(ev2.hofId).toBe(ev1.hofId);
  });

  it('meldet einen Fehler ohne Dorf-Scope', () => {
    const appState = seedAppStateWithVillage();
    const ev = makeEvent('DEAT', { addr: 'Wall 33' });

    const result = applyCreateHof(appState, ev, '');

    expect(result.ok).toBe(false);
  });
});

describe('applyAddVariant — "Variante zum Hof" (Klasse D)', () => {
  it('hängt die Adresse als neue Variante an einen bestehenden Hof + verknüpft das Event', () => {
    const appState = seedAppStateWithVillage();
    const seedEv = makeEvent('RESI', { addr: 'Wall 33' });
    applyCreateHof(appState, seedEv, '@OCHTRUP@');
    const hofId = seedEv.hofId!;

    const driftEv = makeEvent('DEAT', { addr: 'Wal 33' }); // Tippfehler-Variante
    const result = applyAddVariant(appState, driftEv, hofId);

    expect(result.ok).toBe(true);
    expect(driftEv.hofId).toBe(hofId);
    expect(appState.db.hofObjects.get(hofId)?.addrs.map((a) => a.value)).toContain('Wal 33');
  });

  it('meldet einen Fehler, wenn der Ziel-Hof nicht existiert', () => {
    const appState = seedAppStateWithVillage();
    const ev = makeEvent('DEAT', { addr: 'Wall 33' });

    const result = applyAddVariant(appState, ev, '@gone@');

    expect(result.ok).toBe(false);
  });
});

describe('applyChooseHof — "Hof wählen" (Klasse C, mehrdeutig)', () => {
  it('verknüpft das Event direkt mit dem gewählten Hof', () => {
    const appState = seedAppStateWithVillage();
    const ev = makeEvent('RESI', { addr: 'Wall 33' });

    applyChooseHof(appState, ev, '_hof_a');

    expect(ev.hofId).toBe('_hof_a');
  });
});

// Drift-Fix (ADR-v9-42): die drei Aktionen reprojizieren ev.place/ev.addr SOFORT über
// linkEventToHof — NICHT erst "beim nächsten Laden". Kein Zwischenzustand mit gesetztem
// hofId und veraltetem/leerem ev.place.
describe('Sofort-Reprojektion (ADR-v9-42, INV-PLACE) — kein "erst beim nächsten Laden"', () => {
  it('applyCreateHof reprojiziert ev.place sofort (Hof-Blatt + Dorf), nicht erst beim Laden', () => {
    const appState = seedAppStateWithVillage();
    const ev = makeEvent('DEAT', { addr: 'Wall 33', place: '' });

    applyCreateHof(appState, ev, '@OCHTRUP@');

    // Ohne erneutes resolveEvents(): ev.place trägt bereits die Projektion.
    expect(ev.place).toBe('Wall 33, Ochtrup');
  });

  it('applyAddVariant reprojiziert ev.place sofort auf den Ziel-Hof', () => {
    const appState = seedAppStateWithVillage();
    const seedEv = makeEvent('RESI', { addr: 'Wall 33' });
    applyCreateHof(appState, seedEv, '@OCHTRUP@');
    const hofId = seedEv.hofId!;

    const driftEv = makeEvent('DEAT', { addr: 'Wal 33', place: '' });
    applyAddVariant(appState, driftEv, hofId);

    // Sofort projiziert (Konvention α: Hof-Blatt vor dem Dorf). ev.place trägt die
    // KANONISCHE Hof-Adresse aus dem Modell (resolveAddrAsOf), nicht die rohe Drift-
    // Variante — genau das ist der Sinn der Reprojektion (ev.place = Modell-Wahrheit).
    expect(driftEv.place).toBe('Wall 33, Ochtrup');
    // Die explizit gesetzte ev.addr bleibt byte-identisch (Wire-ADDR-Roundtrip).
    expect(driftEv.addr).toBe('Wal 33');
  });

  it('applyChooseHof reprojiziert ev.place sofort auf den gewählten, existierenden Hof', () => {
    const appState = seedAppStateWithVillage();
    const seedEv = makeEvent('RESI', { addr: 'Wall 33' });
    applyCreateHof(appState, seedEv, '@OCHTRUP@');
    const hofId = seedEv.hofId!;

    const target = makeEvent('RESI', { addr: '', place: 'roher String' });
    applyChooseHof(appState, target, hofId);

    expect(target.hofId).toBe(hofId);
    expect(target.place).toBe('Wall 33, Ochtrup');
    // ev.addr wird sofort aus dem Hof gefüllt (war leer).
    expect(target.addr).toBe('Wall 33');
  });
});
