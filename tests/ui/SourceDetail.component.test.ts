// @vitest-environment happy-dom
// tests/ui/SourceDetail.component.test.ts — Quellen-Detail als Component-Test
// (Spec 32 §6; Spec 20 §1.6 [K]: "Detail mit allen referenzierenden Personen/Familien
// inkl. PAGE/QUAY"). Deckt tatsächliches DOM-Rendering + Cross-Navigation ab.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import SourceDetail from '../../ui/views/source/SourceDetail.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeCitation, makeDatabase, makePerson, makeRepository, makeSource } from '../../core/model';

function baseProps() {
  return {
    onNavigateToPerson: vi.fn(),
    onNavigateToFamily: vi.fn(),
    onNavigateToRepository: vi.fn(),
  };
}

describe('SourceDetail — Referenzen inkl. PAGE/QUAY (Component)', () => {
  it('rendert eine referenzierende Person mit Kontext, Seite und QUAY', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.citations.push(makeCitation('@S1@', { page: '12', quay: 3 }));
    db.individuals.set('@I1@', p);
    db.sources.set('@S1@', makeSource('@S1@', { abbr: 'KB' }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('source', '@S1@');

    render(SourceDetail, { props: { appState, viewState, ...baseProps() } });

    expect(screen.getByText('Anna Bauer')).toBeTruthy();
    // #2 (2026-07-25): der Kontext ("Geburt") steht NUR im Gruppen-Header, nicht mehr
    // zusätzlich je Zeile — deshalb hier gegen den Header "Geburt (1)" geprüft.
    expect(screen.getByText('Geburt (1)')).toBeTruthy();
    expect(screen.getByText('S. 12')).toBeTruthy();
    expect(screen.getByText('QUAY 3')).toBeTruthy();
  });

  it('Klick auf eine referenzierende Person ruft onNavigateToPerson auf', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.citations.push(makeCitation('@S1@'));
    db.individuals.set('@I1@', p);
    db.sources.set('@S1@', makeSource('@S1@'));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('source', '@S1@');
    const props = baseProps();

    render(SourceDetail, { props: { appState, viewState, ...props } });

    await fireEvent.click(screen.getByText('Anna Bauer'));

    expect(props.onNavigateToPerson).toHaveBeenCalledWith('@I1@');
  });

  it('zeigt das verlinkte Archiv und ruft onNavigateToRepository bei Klick auf', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.repositories.set('@R1@', makeRepository('@R1@', { name: 'Bistumsarchiv' }));
    db.sources.set('@S1@', makeSource('@S1@', { repo: '@R1@' }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('source', '@S1@');
    const props = baseProps();

    render(SourceDetail, { props: { appState, viewState, ...props } });

    await fireEvent.click(screen.getByText('Bistumsarchiv'));

    expect(props.onNavigateToRepository).toHaveBeenCalledWith('@R1@');
  });

  it('zeigt einen definierten Leerzustand, wenn die id nicht (mehr) im Datenbestand existiert', () => {
    const appState = createAppState();
    const viewState = createViewState();
    viewState.setCurrent('source', '@S-gone@');

    render(SourceDetail, { props: { appState, viewState, ...baseProps() } });

    expect(screen.getByText(/nicht gefunden/)).toBeTruthy();
  });
});

describe('SourceDetail — Anzeige-Härtung (#2, 2026-07-25)', () => {
  it('rendert KEIN "S. )" für eine Seitenangabe ohne bezeichnenden Inhalt (Anonymisierungs-Rest "2 PAGE )")', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.citations.push(makeCitation('@S1@', { page: ')', quay: 3 }));
    db.individuals.set('@I1@', p);
    db.sources.set('@S1@', makeSource('@S1@', { abbr: 'KB' }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('source', '@S1@');

    render(SourceDetail, { props: { appState, viewState, ...baseProps() } });

    // Zeile erscheint (Person + QUAY), aber ohne die sinnlose Seitenangabe.
    expect(screen.getByText('Anna Bauer')).toBeTruthy();
    expect(screen.getByText('QUAY 3')).toBeTruthy();
    expect(screen.queryByText(/S\./)).toBeNull();
  });

  it('wiederholt den Kontext NICHT je Zeile (steht nur im Gruppen-Header)', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.citations.push(makeCitation('@S1@', { page: '12' }));
    db.individuals.set('@I1@', p);
    db.sources.set('@S1@', makeSource('@S1@'));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('source', '@S1@');

    render(SourceDetail, { props: { appState, viewState, ...baseProps() } });

    // "Geburt" erscheint GENAU einmal — als Gruppen-Header "Geburt (1)", nicht zusätzlich
    // als nackter Kontext-Text in der Zeile (früher doppelt).
    expect(screen.getByText('Geburt (1)')).toBeTruthy();
    expect(screen.queryByText('Geburt')).toBeNull();
  });
});

describe('SourceDetail — Online-Fundort ↗ je Referenz (ADR-v9-86)', () => {
  it('rendert ein klickbares ↗ mit korrektem href für eine Referenz mit Weblink', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.citations.push(
      makeCitation('@S1@', { page: '12', quay: 3, deepLinkUrl: 'https://data.matricula-online.eu/de/x/' }),
    );
    db.individuals.set('@I1@', p);
    db.sources.set('@S1@', makeSource('@S1@', { abbr: 'KB' }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('source', '@S1@');

    render(SourceDetail, { props: { appState, viewState, ...baseProps() } });

    const link = screen.getByRole('link', { name: /Online-Fundort öffnen/ });
    expect(link.getAttribute('href')).toBe('https://data.matricula-online.eu/de/x/');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener');
  });

  it('rendert KEIN ↗ für eine Referenz ohne Weblink', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.citations.push(makeCitation('@S1@', { page: '12', quay: 3 }));
    db.individuals.set('@I1@', p);
    db.sources.set('@S1@', makeSource('@S1@', { abbr: 'KB' }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('source', '@S1@');

    render(SourceDetail, { props: { appState, viewState, ...baseProps() } });

    expect(screen.getByText('Anna Bauer')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Online-Fundort öffnen/ })).toBeNull();
  });
});

describe('SourceDetail — Referenzen gruppiert + paginiert (Spec 21 §10b)', () => {
  it('gruppiert Referenzen nach Kontext-Typ mit "Typ (N)"-Untertitel', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const anna = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    anna.birth.citations.push(makeCitation('@S1@'));
    anna.death.citations.push(makeCitation('@S1@'));
    db.individuals.set('@I1@', anna);
    db.sources.set('@S1@', makeSource('@S1@'));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('source', '@S1@');

    render(SourceDetail, { props: { appState, viewState, ...baseProps() } });

    expect(screen.getByText('Geburt (1)')).toBeTruthy();
    expect(screen.getByText('Tod (1)')).toBeTruthy();
  });

  it('TST-7 Kapazitäts-Fall: mehr als 30 Referenzen desselben Typs zeigen zunächst nur 30 + "N weitere laden" (Gruppe mit >30 Zeilen startet automatisch eingeklappt, Spec 21 §10b/ADR-v9-78 Punkt 6 — erst aufklappen)', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    for (let i = 0; i < 45; i++) {
      const p = makePerson(`@I${i}@`, { given: `Person${i}`, surname: 'Bauer' });
      p.birth.citations.push(makeCitation('@S1@'));
      db.individuals.set(`@I${i}@`, p);
    }
    db.sources.set('@S1@', makeSource('@S1@'));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('source', '@S1@');

    render(SourceDetail, { props: { appState, viewState, ...baseProps() } });

    const groupHeader = screen.getByText('Geburt (45)');
    expect(groupHeader).toBeTruthy();
    expect(groupHeader.getAttribute('aria-expanded')).toBe('false');
    // #2 (2026-07-25): sichtbare Zeilen werden über die Eigentümer-Buttons gezählt (der
    // frühere Zähl-Anker, die je Zeile wiederholte Kontext-Beschriftung "Geburt", ist als
    // Redundanz entfallen — der Kontext steht jetzt nur im Gruppen-Header).
    const ownerRows = () => screen.queryAllByRole('button', { name: /Person\d+ Bauer/ });
    expect(ownerRows()).toHaveLength(0);

    await fireEvent.click(groupHeader);

    expect(groupHeader.getAttribute('aria-expanded')).toBe('true');
    expect(ownerRows()).toHaveLength(30);
    const loadMoreBtn = screen.getByText('15 weitere laden');
    expect(loadMoreBtn).toBeTruthy();

    await fireEvent.click(loadMoreBtn);

    expect(ownerRows()).toHaveLength(45);
    expect(screen.queryByText(/weitere laden/)).toBeNull();
  });
});
