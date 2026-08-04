// @vitest-environment happy-dom
// tests/ui/entity-create-cancel.test.ts — die Rücknahme der Sofort-Anlage
// (BL-275, INV-UI-10, [21 §6g]).
//
// WAS GEHALTEN WIRD. „＋ Neue Person"/„＋ Neue Quelle"/„＋ Neues Archiv" legen den
// Datensatz SOFORT an und öffnen den Editor. Verlässt der Nutzer diese Anlage, ohne
// etwas eingetragen zu haben, verschwindet sie wieder — auf einem BESTEHENDEN Datensatz
// passiert dasselbe nie, auch wenn er zufällig leer ist. Beides wird hier geprüft, sonst
// wäre der Fix ein Datenverlust-Risiko statt einer Rücknahme.
//
// Zwei Ausgänge, beide geprüft: „Fertig" (der Schalter, der den Modus geöffnet hat) und
// „← Zurück". BEWUSSTE GRENZE: wer die Anlage stehenlässt und über Bottom-Nav/⌘K
// woanders hin springt, behält sie — dort hat er nichts entschieden, und die Auswahl
// bleibt auf dem Datensatz stehen, zu dem er zurückkehrt.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PersonDetail from '../../ui/views/person/PersonDetail.svelte';
import SourceDetail from '../../ui/views/source/SourceDetail.svelte';
import RepositoryDetail from '../../ui/views/repository/RepositoryDetail.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import {
  makeDatabase,
  makePerson,
  makeSource,
  makeRepository,
  isPersonEmpty,
  isSourceEmpty,
  isRepositoryEmpty,
} from '../../core/model';
import { pinLayout } from './layout-harness';
import { layout } from '../../ui/shell/layout.svelte';

let unpin: () => void;
beforeEach(() => {
  unpin = pinLayout(false);
});
afterEach(() => {
  unpin();
  layout.reset();
});

describe('BL-275 — das Leer-Prädikat des Kerns', () => {
  it('eine frisch gebaute Entität ist leer, eine mit irgendeinem Wert nicht', () => {
    expect(isPersonEmpty(makePerson('@I1@'))).toBe(true);
    expect(isPersonEmpty(makePerson('@I1@', { given: 'Otto' }))).toBe(false);
    expect(isSourceEmpty(makeSource('@S1@'))).toBe(true);
    expect(isSourceEmpty(makeSource('@S1@', { title: 'KB Ochtrup' }))).toBe(false);
    expect(isRepositoryEmpty(makeRepository('@R1@'))).toBe(true);
    expect(isRepositoryEmpty(makeRepository('@R1@', { name: 'Bistumsarchiv' }))).toBe(false);
  });

  it('auch was KEIN Formularfeld ist, zählt — ein angehängtes Ereignis macht die Person nicht leer', () => {
    const p = makePerson('@I1@');
    p.death.seen = true;
    p.death.value = 'Y';
    expect(isPersonEmpty(p)).toBe(false);
  });

  it('die id selbst zählt nicht (sonst wäre nie etwas leer)', () => {
    expect(isPersonEmpty(makePerson('@I999@'))).toBe(true);
  });

  it('ein `Set`-Feld wird mitverglichen — sonst meldete es „leer" für einen Datensatz mit Inhalt', () => {
    const p = makePerson('@I1@');
    p.noEvents.add('BIRT');
    expect(isPersonEmpty(p)).toBe(false);
  });
});

describe('BL-275 — Person: „＋ Neu" und wieder weg', () => {
  function neueAnlage() {
    const appState = createAppState();
    appState.loadDatabase(makeDatabase(), 'test.ged');
    appState.savePerson(makePerson('@I1@'));
    const viewState = createViewState();
    viewState.setCurrent('person', '@I1@');
    return { appState, viewState, onBack: vi.fn() };
  }

  it('„Fertig" auf einer leer gebliebenen Neuanlage entfernt sie wieder und geht zurück', async () => {
    const { appState, viewState, onBack } = neueAnlage();
    render(PersonDetail, { props: { appState, viewState, onBack, startInEdit: true } });

    await fireEvent.click(screen.getByText('Fertig'));

    expect(appState.db.individuals.has('@I1@')).toBe(false);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('„← Zurück" tut dasselbe — der Weg, den der zweifelnde Nutzer am ehesten nimmt', async () => {
    const { appState, viewState, onBack } = neueAnlage();
    render(PersonDetail, { props: { appState, viewState, onBack, startInEdit: true } });

    await fireEvent.click(screen.getByText('← Zurück'));

    expect(appState.db.individuals.has('@I1@')).toBe(false);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('etwas eingetragen und gespeichert: die Person bleibt', async () => {
    const { appState, viewState, onBack } = neueAnlage();
    render(PersonDetail, { props: { appState, viewState, onBack, startInEdit: true } });

    await fireEvent.input(screen.getByLabelText('Vorname'), { target: { value: 'Otto' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.individuals.get('@I1@')?.given).toBe('Otto');
    // Der Editor ist zu; ein weiterer Ausgang darf die bestätigte Anlage nicht mitnehmen.
    await fireEvent.click(screen.getByText('← Zurück'));
    expect(appState.db.individuals.has('@I1@')).toBe(true);
  });

  it('„Speichern" ist eine Bestätigung — auch eine leer gebliebene Person bleibt danach', async () => {
    const { appState, viewState, onBack } = neueAnlage();
    render(PersonDetail, { props: { appState, viewState, onBack, startInEdit: true } });

    await fireEvent.click(screen.getByText('Speichern'));
    await fireEvent.click(screen.getByText('← Zurück'));

    expect(appState.db.individuals.has('@I1@')).toBe(true);
  });

  it('eine BESTEHENDE, zufällig leere Person wird nie angefasst (kein `startInEdit`)', async () => {
    const { appState, viewState, onBack } = neueAnlage();
    render(PersonDetail, { props: { appState, viewState, onBack } });

    await fireEvent.click(screen.getByText('✎ Identität'));
    await fireEvent.click(screen.getByText('Fertig'));
    await fireEvent.click(screen.getByText('← Zurück'));

    expect(appState.db.individuals.has('@I1@')).toBe(true);
  });
});

describe('BL-275 — Quelle und Archiv folgen derselben Regel', () => {
  it('Quelle: leer gebliebene Neuanlage verschwindet mit „Fertig"', async () => {
    const appState = createAppState();
    appState.loadDatabase(makeDatabase(), 'test.ged');
    appState.saveSource(makeSource('@S1@'));
    const viewState = createViewState();
    viewState.setCurrent('source', '@S1@');
    const onBack = vi.fn();

    render(SourceDetail, {
      props: {
        appState,
        viewState,
        onNavigateToPerson: vi.fn(),
        onNavigateToFamily: vi.fn(),
        onNavigateToRepository: vi.fn(),
        onBack,
        startInEdit: true,
      },
    });

    await fireEvent.click(screen.getByText('Fertig'));

    expect(appState.db.sources.has('@S1@')).toBe(false);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('Quelle: mit Titel bleibt sie stehen', async () => {
    const appState = createAppState();
    appState.loadDatabase(makeDatabase(), 'test.ged');
    appState.saveSource(makeSource('@S1@'));
    const viewState = createViewState();
    viewState.setCurrent('source', '@S1@');

    render(SourceDetail, {
      props: {
        appState,
        viewState,
        onNavigateToPerson: vi.fn(),
        onNavigateToFamily: vi.fn(),
        onNavigateToRepository: vi.fn(),
        onBack: vi.fn(),
        startInEdit: true,
      },
    });

    await fireEvent.input(screen.getByLabelText('Titel'), { target: { value: 'KB Ochtrup' } });
    await fireEvent.click(screen.getByText('Speichern'));
    await fireEvent.click(screen.getByText('← Zurück'));

    expect(appState.db.sources.get('@S1@')?.title).toBe('KB Ochtrup');
  });

  it('Archiv: leer gebliebene Neuanlage verschwindet mit „Fertig"', async () => {
    const appState = createAppState();
    appState.loadDatabase(makeDatabase(), 'test.ged');
    appState.saveRepository(makeRepository('@R1@'));
    const viewState = createViewState();
    viewState.setCurrent('repository', '@R1@');
    const onBack = vi.fn();

    render(RepositoryDetail, {
      props: { appState, viewState, onNavigateToSource: vi.fn(), onBack, startInEdit: true },
    });

    await fireEvent.click(screen.getByText('Fertig'));

    expect(appState.db.repositories.has('@R1@')).toBe(false);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('Archiv: mit Namen bleibt es stehen', async () => {
    const appState = createAppState();
    appState.loadDatabase(makeDatabase(), 'test.ged');
    appState.saveRepository(makeRepository('@R1@'));
    const viewState = createViewState();
    viewState.setCurrent('repository', '@R1@');

    render(RepositoryDetail, {
      props: { appState, viewState, onNavigateToSource: vi.fn(), onBack: vi.fn(), startInEdit: true },
    });

    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Bistumsarchiv' } });
    await fireEvent.click(screen.getByText('Speichern'));
    await fireEvent.click(screen.getByText('← Zurück'));

    expect(appState.db.repositories.get('@R1@')?.name).toBe('Bistumsarchiv');
  });
});
