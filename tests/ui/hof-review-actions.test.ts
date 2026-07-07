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
