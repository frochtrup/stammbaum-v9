// @vitest-environment happy-dom
// tests/ui/StoryLensView.component.test.ts — Story-Lens (Spec 21 §4, Spec 20 §1.10 [E]).
// Deckt: Lens-/Fokus-Verdrahtung, Person⇄Familie-Modus-Umschalter (BL-186), Rendern des
// StoryDoc. Die Erzähl-Logik selbst ist in tests/ui/story-*.test.ts abgedeckt.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import StoryLensView from '../../ui/views/story/StoryLensView.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { createRoute } from '../../ui/shell/route.svelte';
import { makeDatabase, makeEvent, makeFamily, makePerson } from '../../core/model';
import type { ChildLink } from '../../core/model/types';
import { pinLayout } from './layout-harness';
import { layout } from '../../ui/shell/layout.svelte';

function childLink(familyId: string): ChildLink {
  return { familyId, pedigree: 'birth', fatherRel: '', motherRel: '', fatherRelSeen: false, motherRelSeen: false, citations: [] };
}

function dbCouple(): ReturnType<typeof makeDatabase> {
  const db = makeDatabase();
  db.individuals.set('I1', makePerson('I1', {
    given: 'Otto', surname: 'Meyer', sex: 'M',
    birth: makeEvent('BIRT', { date: '1850', place: 'Detmold', seen: true }),
    death: makeEvent('DEAT', { date: '1920', place: 'Lemgo', seen: true }),
    parentIn: ['F1'],
  }));
  db.individuals.set('I2', makePerson('I2', {
    given: 'Berta', surname: 'Klein', sex: 'F',
    birth: makeEvent('BIRT', { date: '1855', seen: true }), parentIn: ['F1'],
  }));
  db.individuals.set('I3', makePerson('I3', {
    given: 'Carl', surname: 'Meyer', sex: 'M',
    birth: makeEvent('BIRT', { date: '1880', seen: true }), childOf: [childLink('F1')],
  }));
  db.families.set('F1', makeFamily('F1', {
    husband: 'I1', wife: 'I2', children: ['I3'],
    marriage: makeEvent('MARR', { date: '1878', place: 'Detmold', seen: true }),
  }));
  return db;
}

let unpin: () => void;
beforeEach(() => {
  unpin = pinLayout(false);
});
afterEach(() => {
  unpin();
  layout.reset();
});

describe('StoryLensView — Lens-/Fokus-Verdrahtung + Modus (Spec 21 §4, BL-133/186)', () => {
  it('rendert die Personen-Biografie der Fokus-Person', () => {
    const appState = createAppState();
    const viewState = createViewState();
    appState.loadDatabase(dbCouple(), 'test.ged');
    viewState.setCurrent('lensFocus', 'I1');
    render(StoryLensView, { props: { appState, viewState, route: createRoute(), onNavigateLens: vi.fn() } });

    // Titel der Biografie (kommt aus dem StoryDoc, nicht aus der Kopfzeile).
    expect(screen.getByRole('heading', { level: 1, name: 'Otto Meyer' })).toBeTruthy();
    expect(screen.getByText(/kam 1850 in Detmold zur Welt/)).toBeTruthy();
  });

  it('bindet den EINEN Lens-Umschalter mit "Story" als aktiver Lens ein', () => {
    const appState = createAppState();
    const viewState = createViewState();
    appState.loadDatabase(dbCouple(), 'test.ged');
    viewState.setCurrent('lensFocus', 'I1');
    render(StoryLensView, { props: { appState, viewState, route: createRoute(), onNavigateLens: vi.fn() } });

    const storyTab = screen.getByRole('tab', { name: /Story/ });
    expect(storyTab.getAttribute('aria-current')).toBe('page');
  });

  it('Umschalten auf "Familie" rendert die couple-zentrische Familien-Biografie', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    appState.loadDatabase(dbCouple(), 'test.ged');
    viewState.setCurrent('lensFocus', 'I1');
    render(StoryLensView, { props: { appState, viewState, route: createRoute(), onNavigateLens: vi.fn() } });

    await fireEvent.click(screen.getByRole('button', { name: /wechseln zu .*Familie/ }));

    expect(screen.getByRole('heading', { level: 1, name: 'Familie Otto Meyer & Berta Klein' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Heirat' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Kinder (1)' })).toBeTruthy();
  });

  it('leerer Bestand → Hinweis statt Absturz', () => {
    const appState = createAppState();
    const viewState = createViewState();
    render(StoryLensView, { props: { appState, viewState, route: createRoute(), onNavigateLens: vi.fn() } });
    expect(screen.getByText('Keine Person geladen.')).toBeTruthy();
  });
});
