// @vitest-environment happy-dom
// tests/ui/HofDedupView.component.test.ts — Massen-Dedup-Ansicht für Höfe (Spec 32 §6;
// Spec 20 §1.8 [K], Spec 11 §9.2, ADR-v9-45). Analog PlaceDedupView.component.test.ts.
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import HofDedupView from '../../ui/views/hof/HofDedupView.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase } from '../../core/model';
import { place, hof } from '../core/places-fixtures';

describe('HofDedupView — Gruppen-Vorschlag + Zusammenführen', () => {
  it('zeigt Leerzustand ohne Dubletten', () => {
    const appState = createAppState();
    appState.loadDatabase(makeDatabase(), 'test.ged');

    render(HofDedupView, { props: { appState } });

    expect(screen.getByText('Keine Dubletten-Kandidaten gefunden.')).toBeTruthy();
  });

  it('zeigt eine Gruppe mit Dorf-Anzeige + Gewinner-Vorschlag markiert', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@V@', place('@V@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@V@', { addrs: [{ value: 'Wall 33', from: null, to: null }], lat: 52.2, long: 7.2 }));
    db.hofObjects.set('@H2@', hof('@H2@', '@V@', { addrs: [{ value: 'wall 33', from: null, to: null }] }));
    appState.loadDatabase(db, 'test.ged');

    render(HofDedupView, { props: { appState } });

    expect(screen.getByText(/Ochtrup/)).toBeTruthy();
    expect(screen.getByText('(Vorschlag)')).toBeTruthy();
  });

  it('"Zusammenführen" ruft appState.mergeHof mit dem Vorschlags-Gewinner auf', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@V@', place('@V@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@V@', { addrs: [{ value: 'Wall 33', from: null, to: null }], lat: 52.2, long: 7.2 }));
    db.hofObjects.set('@H2@', hof('@H2@', '@V@', { addrs: [{ value: 'wall 33', from: null, to: null }] }));
    appState.loadDatabase(db, 'test.ged');

    render(HofDedupView, { props: { appState } });
    await fireEvent.click(screen.getByText('Zusammenführen'));

    expect(appState.db.hofObjects.has('@H2@')).toBe(false);
    expect(appState.db.hofObjects.has('@H1@')).toBe(true);
    expect(screen.getByText(/zusammengeführt/)).toBeTruthy();
  });

  it('Nutzer kann einen ANDEREN Gewinner wählen als den Vorschlag', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@V@', place('@V@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@V@', { addrs: [{ value: 'Wall 33', from: null, to: null }], lat: 52.2, long: 7.2 }));
    db.hofObjects.set('@H2@', hof('@H2@', '@V@', { addrs: [{ value: 'wall 33', from: null, to: null }] }));
    appState.loadDatabase(db, 'test.ged');

    render(HofDedupView, { props: { appState } });
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    const h2Radio = radios.find((r) => r.value === '@H2@')!;
    await fireEvent.click(h2Radio);
    await fireEvent.click(screen.getByText('Zusammenführen'));

    expect(appState.db.hofObjects.has('@H1@')).toBe(false);
    expect(appState.db.hofObjects.has('@H2@')).toBe(true);
  });

  it('TST-7 Kapazitätsfall: viele gleichzeitige Gruppen rendern ohne Fehler', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@V@', place('@V@', { title: 'Ochtrup' }));
    for (let i = 0; i < 15; i++) {
      db.hofObjects.set(`@A${i}@`, hof(`@A${i}@`, '@V@', { addrs: [{ value: `Straße ${i}`, from: null, to: null }] }));
      db.hofObjects.set(`@B${i}@`, hof(`@B${i}@`, '@V@', { addrs: [{ value: `straße ${i}`, from: null, to: null }] }));
    }
    appState.loadDatabase(db, 'test.ged');

    render(HofDedupView, { props: { appState } });

    expect(screen.getAllByText('Zusammenführen')).toHaveLength(15);
  });

  it('"Schließen"-Button ruft onClose', async () => {
    const appState = createAppState();
    appState.loadDatabase(makeDatabase(), 'test.ged');
    let closed = false;

    render(HofDedupView, { props: { appState, onClose: () => (closed = true) } });
    await fireEvent.click(screen.getByText('✕ Schließen'));

    expect(closed).toBe(true);
  });
});
