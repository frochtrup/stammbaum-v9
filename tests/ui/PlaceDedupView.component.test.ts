// @vitest-environment happy-dom
// tests/ui/PlaceDedupView.component.test.ts — Massen-Dedup-Ansicht für Orte (Spec 32 §6;
// Spec 20 §1.7 [K], Spec 11 §9.2, ADR-v9-45). Deckt Gruppen-Anzeige, Gewinner-Wahl,
// "Zusammenführen"-Kommando + Hof-Nachlauf-Statusmeldung, TST-7-Kapazitätsfall.
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PlaceDedupView from '../../ui/views/place/PlaceDedupView.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase } from '../../core/model';
import { place, hof } from '../core/places-fixtures';

describe('PlaceDedupView — Gruppen-Vorschlag + Zusammenführen', () => {
  it('zeigt Leerzustand ohne Dubletten', () => {
    const appState = createAppState();
    appState.loadDatabase(makeDatabase(), 'test.ged');

    render(PlaceDedupView, { props: { appState } });

    expect(screen.getByText('Keine Dubletten-Kandidaten gefunden.')).toBeTruthy();
  });

  it('ADR-v9-50: widersprüchliche Elternketten → Konflikt-Badge + volle, unterscheidbare Namensketten statt bloßem Titel', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@A@', place('@A@', { title: 'Arpke', enclosedBy: [{ placeId: '@BURGDORF@', from: null, to: null }] }));
    db.placeObjects.set('@B@', place('@B@', { title: 'Arpke', enclosedBy: [{ placeId: '@UETZE@', from: null, to: null }] }));
    db.placeObjects.set('@BURGDORF@', place('@BURGDORF@', { title: 'Burgdorf', enclosedBy: [{ placeId: '@REGION@', from: null, to: null }] }));
    db.placeObjects.set('@UETZE@', place('@UETZE@', { title: 'Uetze', enclosedBy: [{ placeId: '@REGION@', from: null, to: null }] }));
    db.placeObjects.set('@REGION@', place('@REGION@', { title: 'Region Hannover' }));
    appState.loadDatabase(db, 'test.ged');

    render(PlaceDedupView, { props: { appState } });

    expect(screen.getByText(/abweichende Verwaltungszugehörigkeit/)).toBeTruthy();
    expect(screen.getByText(/Arpke, Burgdorf, Region Hannover/)).toBeTruthy();
    expect(screen.getByText(/Arpke, Uetze, Region Hannover/)).toBeTruthy();
  });

  it('zeigt eine Gruppe mit Gewinner-Vorschlag markiert', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@A@', place('@A@', { title: 'Ochtrup', lat: 52.2, long: 7.2 }));
    db.placeObjects.set('@B@', place('@B@', { title: 'Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');

    render(PlaceDedupView, { props: { appState } });

    expect(screen.getAllByText('Ochtrup')).toHaveLength(2);
    expect(screen.getByText('(Vorschlag)')).toBeTruthy();
  });

  it('"Zusammenführen" ruft appState.mergePlace mit dem Vorschlags-Gewinner auf und zeigt eine Statusmeldung', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@A@', place('@A@', { title: 'Ochtrup', lat: 52.2, long: 7.2 }));
    db.placeObjects.set('@B@', place('@B@', { title: 'Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');

    render(PlaceDedupView, { props: { appState } });
    await fireEvent.click(screen.getByText('Zusammenführen'));

    expect(appState.db.placeObjects.has('@B@')).toBe(false);
    expect(appState.db.placeObjects.has('@A@')).toBe(true);
    expect(screen.getByText(/zusammengeführt/)).toBeTruthy();
  });

  it('Nutzer kann einen ANDEREN Gewinner wählen als den Vorschlag', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@A@', place('@A@', { title: 'Ochtrup', lat: 52.2, long: 7.2 }));
    db.placeObjects.set('@B@', place('@B@', { title: 'Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');

    render(PlaceDedupView, { props: { appState } });
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    const bRadio = radios.find((r) => r.value === '@B@')!;
    await fireEvent.click(bRadio);
    await fireEvent.click(screen.getByText('Zusammenführen'));

    // @B@ wurde gewählt -> @A@ (der eigentliche Vorschlag) wird jetzt in @B@ gefaltet.
    expect(appState.db.placeObjects.has('@A@')).toBe(false);
    expect(appState.db.placeObjects.has('@B@')).toBe(true);
  });

  it('meldet den automatischen Hof-Nachlauf im Status (ADR-v9-45 Nachtrag 2026-07-10)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@A@', place('@A@', { title: 'Ochtrup' }));
    db.placeObjects.set('@B@', place('@B@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@A@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    db.hofObjects.set('@H2@', hof('@H2@', '@B@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    appState.loadDatabase(db, 'test.ged');

    render(PlaceDedupView, { props: { appState } });
    await fireEvent.click(screen.getByText('Zusammenführen'));

    expect(screen.getByText(/Hof-Dubletten/)).toBeTruthy();
    expect(appState.db.hofObjects.size).toBe(1);
  });

  it('A1: kuratierte vs. blanke Mitglieder erkennbar — „ohne Zusatzangaben"-Pille nur am Seed-Rohzustand', () => {
    const appState = createAppState();
    const db = makeDatabase();
    // @A@ kuratiert (Koordinaten) → keine Pille; @B@ blank → Pille.
    db.placeObjects.set('@A@', place('@A@', { title: 'Ochtrup', lat: 52.2, long: 7.2 }));
    db.placeObjects.set('@B@', place('@B@', { title: 'Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');

    render(PlaceDedupView, { props: { appState } });

    // Genau eine Pille (für den blanken @B@), nicht zwei.
    expect(screen.getAllByText('ohne Zusatzangaben')).toHaveLength(1);
  });

  it('A3: abgewähltes Mitglied wird NICHT mitgemergt (bleibt im Bestand)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    // Drei Dubletten: @A@ (Gewinner-Vorschlag via Koordinaten), @B@, @C@.
    db.placeObjects.set('@A@', place('@A@', { title: 'Ochtrup', lat: 52.2, long: 7.2 }));
    db.placeObjects.set('@B@', place('@B@', { title: 'Ochtrup' }));
    db.placeObjects.set('@C@', place('@C@', { title: 'Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');

    render(PlaceDedupView, { props: { appState } });

    // Eine aktive (nicht-Gewinner) „einbeziehen"-Checkbox abwählen — das Ziel @A@ bleibt disabled.
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    const activeBox = checkboxes.find((c) => !c.disabled && c.checked);
    await fireEvent.click(activeBox!);
    await fireEvent.click(screen.getByText('Zusammenführen'));

    // Gewinner @A@ überlebt; das abgewählte Mitglied bleibt zusätzlich erhalten → 2 Orte.
    expect(appState.db.placeObjects.has('@A@')).toBe(true);
    expect(appState.db.placeObjects.size).toBe(2);
  });

  it('A3: ohne Abwahl wird die GESAMTE Gruppe gemergt (Standard: alle ausgewählt)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@A@', place('@A@', { title: 'Ochtrup', lat: 52.2, long: 7.2 }));
    db.placeObjects.set('@B@', place('@B@', { title: 'Ochtrup' }));
    db.placeObjects.set('@C@', place('@C@', { title: 'Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');

    render(PlaceDedupView, { props: { appState } });
    await fireEvent.click(screen.getByText('Zusammenführen'));

    expect(appState.db.placeObjects.size).toBe(1);
    expect(appState.db.placeObjects.has('@A@')).toBe(true);
  });

  it('A3: Gewinner-Checkbox ist deaktiviert (Ziel, nicht abwählbar)', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@A@', place('@A@', { title: 'Ochtrup', lat: 52.2, long: 7.2 }));
    db.placeObjects.set('@B@', place('@B@', { title: 'Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');

    render(PlaceDedupView, { props: { appState } });

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    const disabled = checkboxes.filter((c) => c.disabled);
    // Genau ein Ziel (Gewinner) ist deaktiviert.
    expect(disabled).toHaveLength(1);
  });

  it('TST-7 Kapazitätsfall: viele gleichzeitige Gruppen rendern ohne Fehler', () => {
    const appState = createAppState();
    const db = makeDatabase();
    for (let i = 0; i < 15; i++) {
      db.placeObjects.set(`@A${i}@`, place(`@A${i}@`, { title: `Ort${i}` }));
      db.placeObjects.set(`@B${i}@`, place(`@B${i}@`, { title: `Ort${i}` }));
    }
    appState.loadDatabase(db, 'test.ged');

    render(PlaceDedupView, { props: { appState } });

    expect(screen.getAllByText('Zusammenführen')).toHaveLength(15);
  });

  it('"Schließen"-Button ruft onClose', async () => {
    const appState = createAppState();
    appState.loadDatabase(makeDatabase(), 'test.ged');
    let closed = false;

    render(PlaceDedupView, { props: { appState, onClose: () => (closed = true) } });
    await fireEvent.click(screen.getByText('✕ Schließen'));

    expect(closed).toBe(true);
  });
});
