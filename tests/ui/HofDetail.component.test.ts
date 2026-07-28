// @vitest-environment happy-dom
// tests/ui/HofDetail.component.test.ts — Hof-Steckbrief + Bearbeitung (Spec 32 §6;
// Spec 20 §1.8 [K]).
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import HofDetail from '../../ui/views/hof/HofDetail.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeDatabase, makePerson, makeEvent } from '../../core/model';
import { place, hof } from '../core/places-fixtures';
import { pinLayout } from './layout-harness';
import { layout } from '../../ui/shell/layout.svelte';

// Formfaktor explizit auf MOBIL: „← Zur Liste" ist eine mobile Navigation und entfällt
// im Desktop-Multi-Pane, wo die Liste daneben stehen bleibt (Spec 21 §3, BL-92). Ohne
// Festlegung liefe die Datei im happy-dom-Standard von 1024px. S. layout-harness.ts.
let unpin: () => void;
beforeEach(() => {
  unpin = pinLayout(false);
});
afterEach(() => {
  unpin();
  layout.reset();
});

describe('HofDetail — Steckbrief (read-only Teile)', () => {
  it('zeigt einen definierten Leerzustand ohne Auswahl', () => {
    const appState = createAppState();
    const viewState = createViewState();

    render(HofDetail, { props: { appState, viewState } });

    expect(screen.getByText('Kein Hof ausgewählt.')).toBeTruthy();
  });

  it('zeigt einen definierten Leerzustand, wenn die id nicht (mehr) existiert', () => {
    const appState = createAppState();
    const viewState = createViewState();
    viewState.setCurrent('hof', '@gone@');

    render(HofDetail, { props: { appState, viewState } });

    expect(screen.getByText(/nicht gefunden/)).toBeTruthy();
  });

  it('zeigt Bewohner chronologisch + verlinkt zur Person', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    person.birth.hofId = '@H1@';
    person.birth.date = '1 JAN 1900';
    db.individuals.set('@I1@', person);
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');
    const onNavigateToPerson = vi.fn();

    render(HofDetail, { props: { appState, viewState, onNavigateToPerson } });

    expect(screen.getAllByText('Wall 33').length).toBeGreaterThan(0);
    expect(screen.getByText('Ochtrup')).toBeTruthy();
    await fireEvent.click(screen.getByText('Otto Bauer'));
    expect(onNavigateToPerson).toHaveBeenCalledWith('@I1@');
  });
});

describe('HofDetail — Mini-Karte (BL-09)', () => {
  it('rendert die Karte, wenn der Hof eigene Koordinaten trägt', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }], lat: 52.2, long: 7.18 }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');

    render(HofDetail, { props: { appState, viewState } });
    expect(screen.getByRole('img', { name: /Karte: Wall 33/ })).toBeTruthy();
  });

  it('rendert KEINE Karte für einen unangereicherten Hof ohne Koordinaten (TST-16)', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] })); // lat/long null
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');

    render(HofDetail, { props: { appState, viewState } });
    expect(screen.queryByRole('img', { name: /^Karte:/ })).toBeNull();
  });
});

describe('HofDetail — Bewohner/Eigentümer zeitlich integriert (Spec 21 §10j, Nachtrag 2026-07-10)', () => {
  it('zeigt Bewohner UND Eigentümer in EINER chronologischen Liste, je Zeile mit Rollen-Label markiert', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));

    const resident = makePerson('@I1@', { given: 'Anna', surname: 'Meyer' });
    resident.events.push(makeEvent('RESI', { date: '1900', hofId: '@H1@' }));
    db.individuals.set('@I1@', resident);

    const owner = makePerson('@I2@', { given: 'Bernd', surname: 'Schulze' });
    owner.events.push(makeEvent('PROP', { date: '1905', hofId: '@H1@' }));
    db.individuals.set('@I2@', owner);

    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');
    const onNavigateToPerson = vi.fn();

    render(HofDetail, { props: { appState, viewState, onNavigateToPerson } });

    // Keine getrennten Gruppen-Überschriften mehr (Nachtrag 2026-07-10) — eine
    // gemeinsame chronologische Liste, Rollen-Differenzierung über das Label je Zeile.
    expect(screen.queryByText('Bewohner (1)')).toBeNull();
    expect(screen.queryByText('Eigentümer (1)')).toBeNull();
    expect(screen.getByText('Bewohner')).toBeTruthy();
    expect(screen.getByText('Eigentümer')).toBeTruthy();
    expect(screen.getByText('Anna Meyer')).toBeTruthy();
    expect(screen.getByText('Bernd Schulze')).toBeTruthy();

    // Optische Differenzierung (Nutzer-Fund 2026-07-10): das Textlabel allein reicht
    // nicht — Eigentümer-Zeilen bekommen einen eigenen Akzent-Klassen-Satz, Bewohner
    // nicht (Gold-Rand + hervorgehobenes Label statt zweier optisch identischer Zeilen).
    const ownerLabel = screen.getByText('Eigentümer');
    expect(ownerLabel.className).toContain('hof-detail__role--owner');
    const residentLabel = screen.getByText('Bewohner');
    expect(residentLabel.className).not.toContain('hof-detail__role--owner');
    const ownerRow = ownerLabel.closest('li')!;
    expect(ownerRow.className).toContain('hof-detail__resident--owner');
    const residentRow = residentLabel.closest('li')!;
    expect(residentRow.className).not.toContain('hof-detail__resident--owner');

    await fireEvent.click(screen.getByText('Bernd Schulze'));
    expect(onNavigateToPerson).toHaveBeenCalledWith('@I2@');
  });
});

describe('HofDetail — Bearbeitung (Adressvarianten, Koordinaten, Notiz, Lebenszyklus)', () => {
  it('speichert Grunddaten über appState.saveHof', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');

    render(HofDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.input(screen.getByLabelText('Breitengrad'), { target: { value: '52.2' } });
    await fireEvent.input(screen.getByLabelText('Notiz'), { target: { value: 'Alter Bauernhof' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.hofObjects.get('@H1@')?.lat).toBe(52.2);
    expect(appState.db.hofObjects.get('@H1@')?.note).toBe('Alter Bauernhof');
  });

  it('fügt eine neue Adressvariante hinzu (nur im Bearbeiten-Modus sichtbar)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@'));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');

    render(HofDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.input(screen.getByLabelText('Neue Adressvariante'), { target: { value: 'Wallstraße 33' } });
    await fireEvent.click(screen.getByText('+ Hinzufügen'));

    expect(appState.db.hofObjects.get('@H1@')?.addrs.map((a) => a.value)).toEqual(['Wall 33', 'Wallstraße 33']);
  });

  it('bearbeitet den Wert einer bestehenden Adressvariante — Detail-Header/Liste zeigen den neuen Namen sofort', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');

    const { container } = render(HofDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.change(screen.getByLabelText('Adresswert Zeile 1'), { target: { value: 'Wallstraße 33' } });

    // Sofortiger Commit (kein globales "Speichern" nötig — Timing analog addAddr/removeAddr).
    expect(appState.db.hofObjects.get('@H1@')?.addrs[0]?.value).toBe('Wallstraße 33');
    // DetailHeader-Titel aktualisiert sich live (addrs[0].value ist der Hof-"Name").
    const title = container.querySelector('.detail-header__title');
    expect(title?.textContent).toBe('Wallstraße 33');
  });

  it('bearbeitet von/bis einer bestehenden Adressvariante und speichert', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@'));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');

    render(HofDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.change(screen.getByLabelText('Gültig von Zeile 1'), { target: { value: '1850' } });
    await fireEvent.change(screen.getByLabelText('Gültig bis Zeile 1'), { target: { value: '1900' } });

    expect(appState.db.hofObjects.get('@H1@')?.addrs[0]).toEqual({ value: 'Wall 33', from: 1850, to: 1900 });
  });

  it('Umbenennen einer Adressvariante propagiert auf referenzierende Events (Nutzer-Wunsch: Name durchgängig verwendet)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    const resi = makeEvent('RESI', { hofId: '@H1@', addr: 'Wall 33', place: 'Wall 33, Ochtrup' });
    person.events.push(resi);
    db.individuals.set('@I1@', person);
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');

    const { container } = render(HofDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.change(screen.getByLabelText('Adresswert Zeile 1'), { target: { value: 'Wallstraße 33' } });

    // Referenzierendes Event zeigt den neuen Namen (addr + reprojiziertes place).
    const updatedEvent = appState.db.individuals.get('@I1@')?.events[0];
    expect(updatedEvent?.addr).toBe('Wallstraße 33');
    expect(updatedEvent?.place).toBe('Wallstraße 33, Ochtrup');
    // DetailHeader-Titel ebenfalls aktuell.
    const title = container.querySelector('.detail-header__title');
    expect(title?.textContent).toBe('Wallstraße 33');
  });

  it('reine von/bis-Änderung einer Adressvariante propagiert NICHT auf referenzierende Events (kein Namenswechsel)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    const resi = makeEvent('RESI', { hofId: '@H1@', addr: 'Wall 33', place: 'Wall 33, Ochtrup' });
    person.events.push(resi);
    db.individuals.set('@I1@', person);
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');

    render(HofDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.change(screen.getByLabelText('Gültig von Zeile 1'), { target: { value: '1850' } });

    const updatedEvent = appState.db.individuals.get('@I1@')?.events[0];
    expect(updatedEvent?.addr).toBe('Wall 33');
    expect(updatedEvent?.place).toBe('Wall 33, Ochtrup');
  });

  it('zeigt bestehende Adressvarianten außerhalb des Bearbeiten-Modus weiterhin als reinen Text (keine Inputs)', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@'));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: 1850, to: 1900 }] }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');

    render(HofDetail, { props: { appState, viewState } });

    expect(screen.getAllByText('Wall 33').length).toBeGreaterThan(0);
    expect(screen.getByText('(1850–1900)')).toBeTruthy();
    expect(screen.queryByLabelText('Adresswert Zeile 1')).toBeNull();
    expect(screen.queryByLabelText('Gültig von Zeile 1')).toBeNull();
    expect(screen.queryByLabelText('Gültig bis Zeile 1')).toBeNull();
  });

  it('setzt Vorgänger-/Nachfolger-Hof über den generischen Picker', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@'));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    db.hofObjects.set('@H2@', hof('@H2@', '@P1@', { addrs: [{ value: 'Oster 5', from: null, to: null }] }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');

    render(HofDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.click(screen.getByLabelText('Vorgänger-Hof'));
    await fireEvent.click(screen.getByText('Oster 5'));
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.hofObjects.get('@H1@')?.predecessor).toBe('@H2@');
  });

  it('legt einen neuen Vorgänger-Hof über "+ neuen Hof anlegen" inline an (ADR-v9-42, ersetzt die ADR-v9-40-Ausnahme)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@'));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');

    render(HofDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.click(screen.getByLabelText('Vorgänger-Hof'));
    await fireEvent.click(screen.getByText('+ neuen Hof anlegen …'));

    await fireEvent.input(screen.getByLabelText('Adresse des neuen Vorgänger-Hofs'), { target: { value: 'Oster 5' } });
    await fireEvent.click(screen.getByText('Anlegen'));
    await fireEvent.click(screen.getByText('Speichern'));

    const created = Array.from(appState.db.hofObjects.values()).find((h) => h.addrs[0]?.value === 'Oster 5');
    expect(created).toBeTruthy();
    expect(created?.villageId).toBe('@P1@');
    expect(appState.db.hofObjects.get('@H1@')?.predecessor).toBe(created!.id);
  });
});

describe('HofDetail — Bearbeitung (govId/govTypes, TST-9 Feld-Vollständigkeit)', () => {
  it('speichert govId/govTypes über appState.saveHof und zeigt sie beim erneuten Öffnen wieder', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');

    render(HofDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.input(screen.getByLabelText('GOV-ID'), { target: { value: 'object_654321' } });
    await fireEvent.input(screen.getByLabelText('GOV-Typen (kommagetrennt)'), { target: { value: 'Hof, Gehöft' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.hofObjects.get('@H1@')?.govId).toBe('object_654321');
    expect(appState.db.hofObjects.get('@H1@')?.govTypes).toEqual(['Hof', 'Gehöft']);

    // Persistenz-Rundlauf (TST-8): erneut öffnen zeigt die gespeicherten Werte wieder.
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    expect((screen.getByLabelText('GOV-ID') as HTMLInputElement).value).toBe('object_654321');
    expect((screen.getByLabelText('GOV-Typen (kommagetrennt)') as HTMLInputElement).value).toBe('Hof, Gehöft');
  });
});

describe('HofDetail — Löschen (ADR-v9-78 Punkt 1)', () => {
  it('löscht das HofObject nach Bestätigung und navigiert per onBack zur Liste', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    person.birth.hofId = '@H1@';
    db.individuals.set('@I1@', person);
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');
    const onBack = vi.fn();
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);

    render(HofDetail, { props: { appState, viewState, onBack } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.click(screen.getByText('Hof löschen'));

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(appState.db.hofObjects.has('@H1@')).toBe(false);
    expect(appState.db.individuals.get('@I1@')?.birth.hofId).toBeNull();
    expect(onBack).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
  });

  it('löscht NICHT, wenn die Bestätigung abgebrochen wird', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');
    const onBack = vi.fn();
    const confirmSpy = vi.fn(() => false);
    vi.stubGlobal('confirm', confirmSpy);

    render(HofDetail, { props: { appState, viewState, onBack } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.click(screen.getByText('Hof löschen'));

    expect(appState.db.hofObjects.has('@H1@')).toBe(true);
    expect(onBack).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('zeigt "Hof löschen" NICHT außerhalb des Bearbeiten-Modus (ADR-v9-30 Punkt 5)', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');

    render(HofDetail, { props: { appState, viewState } });

    expect(screen.queryByText('Hof löschen')).toBeNull();
  });
});

describe('HofDetail — Anzeige/Bearbeitung strukturell getrennt (ADR-v9-30 Punkt 5)', () => {
  it('zeigt Adressvarianten als reine Lese-Darstellung ohne Mutations-Controls außerhalb des Bearbeiten-Modus', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set(
      '@H1@',
      hof('@H1@', '@P1@', {
        addrs: [
          { value: 'Wall 33', from: null, to: null },
          { value: 'Wallstraße 33', from: null, to: null },
        ],
      }),
    );
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');

    const { container } = render(HofDetail, { props: { appState, viewState } });

    // Lese-Darstellung bleibt sichtbar.
    expect(screen.getByText('Wallstraße 33')).toBeTruthy();
    // Aber keine Mutations-Controls außerhalb des Bearbeiten-Modus.
    expect(container.querySelector('.hof-detail__remove-btn')).toBeNull();
    expect(container.querySelector('.hof-detail__add-row')).toBeNull();
    expect(screen.queryByLabelText('Neue Adressvariante')).toBeNull();
    expect(container.querySelector('.hof-detail__form')).toBeNull();
  });

  it('blendet die Mutations-Controls nach Klick auf "✎ Bearbeiten" wieder ein', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');

    const { container } = render(HofDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));

    expect(container.querySelector('.hof-detail__remove-btn')).toBeTruthy();
    expect(screen.getByLabelText('Neue Adressvariante')).toBeTruthy();
  });
});

describe('HofDetail — gemeinsame Detail-Kopfzeile (Spec 21 §6b, INV-UI-4)', () => {
  it('"← Zur Liste" und "✎ Bearbeiten" stehen in derselben Kopfzeile, Titel in eigener Zeile darunter', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');
    const onBack = vi.fn();

    const { container } = render(HofDetail, { props: { appState, viewState, onBack } });

    const row = container.querySelector('.detail-header__row');
    const title = container.querySelector('.detail-header__title');
    expect(row?.contains(screen.getByText('← Zur Liste'))).toBe(true);
    expect(row?.contains(screen.getByText('✎ Bearbeiten'))).toBe(true);
    expect(title?.textContent).toBe('Wall 33');
    expect(row?.contains(title)).toBe(false);

    await fireEvent.click(screen.getByText('← Zur Liste'));
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe('HofDetail — Name & Adressvarianten steht am Anfang (Nutzer-Wunsch)', () => {
  it('"Name & Adressvarianten" erscheint im Bearbeiten-Modus VOR "Grunddaten"', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');

    const { container } = render(HofDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));

    const headings = Array.from(container.querySelectorAll('h3')).map((h) => h.textContent);
    const addrIndex = headings.indexOf('Name & Adressvarianten');
    const grunddatenIndex = headings.indexOf('Grunddaten');
    expect(addrIndex).toBeGreaterThanOrEqual(0);
    expect(grunddatenIndex).toBeGreaterThan(addrIndex);
  });

  it('"Name & Adressvarianten" erscheint auch im Lesemodus als erste Sektion, direkt unter dem Titel', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('hof', '@H1@');

    const { container } = render(HofDetail, { props: { appState, viewState } });

    const headings = Array.from(container.querySelectorAll('h3')).map((h) => h.textContent);
    expect(headings[0]).toBe('Name & Adressvarianten');
  });
});
