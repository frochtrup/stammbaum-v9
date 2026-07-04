// @vitest-environment happy-dom
// tests/ui/EntityTab.component.test.ts — Entitäten-Tab-Umbrella (Spec 21 §2 Segment-
// Umschalter, INV-UI-2 "genau ein kanonischer Weg", INV-VS "eine Auswahl-Instanz").
// Deckt Segment-Wechsel + Cross-Entitäts-Navigation (Familie->Person, Quelle->Person/
// Familie/Archiv, Archiv->Quelle) ab: ein Klick wechselt sowohl den aktiven Segment als
// auch die ViewState-Auswahl über denselben Mechanismus.
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import EntityTab from '../../ui/views/EntityTab.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import {
  makeCitation,
  makeDatabase,
  makeFamily,
  makePerson,
  makeRepository,
  makeSource,
} from '../../core/model';

function seedRichDb() {
  const db = makeDatabase();
  const husband = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
  husband.birth.citations.push(makeCitation('@S1@', { quay: 2 }));
  husband.birth.date = '1 JAN 1900';
  const wife = makePerson('@I2@', { given: 'Anna', surname: 'Klein' });
  db.individuals.set('@I1@', husband);
  db.individuals.set('@I2@', wife);
  husband.parentIn.push('@F1@');
  wife.parentIn.push('@F1@');
  db.families.set('@F1@', makeFamily('@F1@', { husband: '@I1@', wife: '@I2@' }));
  db.sources.set('@S1@', makeSource('@S1@', { abbr: 'KB Ochtrup', repo: '@R1@' }));
  db.repositories.set('@R1@', makeRepository('@R1@', { name: 'Bistumsarchiv' }));
  return db;
}

describe('EntityTab — Segment-Umschalter + Cross-Entitäts-Navigation', () => {
  it('startet im Personen-Segment und zeigt die Personenliste', () => {
    const appState = createAppState();
    appState.loadDatabase(seedRichDb(), 'test.ged');
    const viewState = createViewState();

    render(EntityTab, { props: { appState, viewState } });

    expect(screen.getByRole('tab', { name: /Personen/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Otto Bauer')).toBeTruthy();
  });

  it('Segment-Klick auf "Familien" wechselt zur Familienliste', async () => {
    const appState = createAppState();
    appState.loadDatabase(seedRichDb(), 'test.ged');
    const viewState = createViewState();

    render(EntityTab, { props: { appState, viewState } });

    await fireEvent.click(screen.getByRole('tab', { name: /Familien/ }));

    expect(screen.getByText('Otto Bauer ⚭ Anna Klein')).toBeTruthy();
  });

  it('nicht-implementierte Segmente (Orte/Höfe) sind deaktiviert und wechseln nichts', async () => {
    const appState = createAppState();
    appState.loadDatabase(seedRichDb(), 'test.ged');
    const viewState = createViewState();

    render(EntityTab, { props: { appState, viewState } });

    const placesTab = screen.getByRole('tab', { name: /Orte/ });
    expect(placesTab).toHaveProperty('disabled', true);
    await fireEvent.click(placesTab);

    // weiterhin Personen-Segment aktiv (kein stiller Wechsel in einen nicht gebauten Bereich).
    expect(screen.getByRole('tab', { name: /Personen/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('Familie -> Person: Klick auf ein Mitglied wechselt Segment UND ViewState-Auswahl auf einen Rutsch', async () => {
    const appState = createAppState();
    appState.loadDatabase(seedRichDb(), 'test.ged');
    const viewState = createViewState();

    render(EntityTab, { props: { appState, viewState } });
    await fireEvent.click(screen.getByRole('tab', { name: /Familien/ }));
    await fireEvent.click(screen.getByText('Otto Bauer ⚭ Anna Klein'));
    await fireEvent.click(screen.getByText('Otto Bauer'));

    expect(screen.getByRole('tab', { name: /Personen/ }).getAttribute('aria-selected')).toBe('true');
    expect(viewState.getCurrent('person')).toBe('@I1@');
  });

  it('Person -> Familie: "Familie ansehen" navigiert zur Familien-Detailseite', async () => {
    const appState = createAppState();
    appState.loadDatabase(seedRichDb(), 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('person', '@I1@');

    render(EntityTab, { props: { appState, viewState } });

    await fireEvent.click(screen.getByText('Familie ansehen →'));

    expect(screen.getByRole('tab', { name: /Familien/ }).getAttribute('aria-selected')).toBe('true');
    expect(viewState.getCurrent('family')).toBe('@F1@');
  });

  it('Person -> Quelle: Klick auf die §N-Badge navigiert zur Quellen-Detailseite', async () => {
    const appState = createAppState();
    appState.loadDatabase(seedRichDb(), 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('person', '@I1@');

    render(EntityTab, { props: { appState, viewState } });

    await fireEvent.click(screen.getByText('§1'));

    const sourceTabs = screen.getAllByRole('tab', { name: 'Quellen' });
    expect(sourceTabs.some((tab) => tab.getAttribute('aria-selected') === 'true')).toBe(true);
    expect(viewState.getCurrent('source')).toBe('@S1@');
  });

  it('Quelle -> Archiv -> Quelle: Rundreise über den Archiv-Link funktioniert', async () => {
    const appState = createAppState();
    appState.loadDatabase(seedRichDb(), 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('source', '@S1@');

    render(EntityTab, { props: { appState, viewState } });

    await fireEvent.click(screen.getByText('Bistumsarchiv'));
    expect(viewState.getCurrent('repository')).toBe('@R1@');
    expect(screen.getByRole('tab', { name: /Archive/ }).getAttribute('aria-selected')).toBe('true');

    await fireEvent.click(screen.getByText('KB Ochtrup'));

    expect(viewState.getCurrent('source')).toBe('@S1@');
    const sourceTabs = screen.getAllByRole('tab', { name: 'Quellen' });
    expect(sourceTabs.some((tab) => tab.getAttribute('aria-selected') === 'true')).toBe(true);
    // Archiv-Auswahl bleibt sauber zurückgesetzt (kein "Geister"-Repository-Fokus nach Rücksprung).
    expect(viewState.getCurrent('repository')).toBeNull();
  });

  it('"Zur Liste" im Quellen-Segment räumt zuerst die Archiv-Auswahl, dann die Quellen-Auswahl ab', async () => {
    const appState = createAppState();
    appState.loadDatabase(seedRichDb(), 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('source', '@S1@');
    viewState.setCurrent('repository', '@R1@');

    render(EntityTab, { props: { appState, viewState } });

    await fireEvent.click(screen.getByText('← Zur Liste'));

    expect(viewState.getCurrent('repository')).toBeNull();
  });
});
