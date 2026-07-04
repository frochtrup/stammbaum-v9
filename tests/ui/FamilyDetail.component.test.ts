// @vitest-environment happy-dom
// tests/ui/FamilyDetail.component.test.ts — Familien-Detail als Component-Test
// (Spec 32 §6; Spec 20 §1.5 [K]: anklickbare Mitglieder). Deckt tatsächliches
// DOM-Rendering + Cross-Navigation zu Personen ab.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import FamilyDetail from '../../ui/views/family/FamilyDetail.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeCitation, makeDatabase, makeFamily, makePerson, makeSource } from '../../core/model';

describe('FamilyDetail — anklickbare Mitglieder + Quellen-Badges (Component)', () => {
  it('rendert Mitgliederzeilen, die per Klick onNavigateToPerson mit der Person-Id aufrufen', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Otto', surname: 'Bauer' }));
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Anna', surname: 'Klein' }));
    db.families.set('@F1@', makeFamily('@F1@', { husband: '@I1@', wife: '@I2@' }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('family', '@F1@');
    const onNavigateToPerson = vi.fn();

    render(FamilyDetail, { props: { appState, viewState, onNavigateToPerson } });

    await fireEvent.click(screen.getByText('Otto Bauer'));

    expect(onNavigateToPerson).toHaveBeenCalledWith('@I1@');
  });

  it('rendert eine §N-Quellen-Badge für ein Heirats-Zitat', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const f = makeFamily('@F1@');
    f.marriage.date = '1 JUN 1920';
    f.marriage.citations.push(makeCitation('@S7@', { quay: 2 }));
    db.families.set('@F1@', f);
    db.sources.set('@S7@', makeSource('@S7@', { abbr: 'KB Trauung' }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('family', '@F1@');

    render(FamilyDetail, { props: { appState, viewState, onNavigateToPerson: vi.fn() } });

    const badge = screen.getByText('§7');
    expect(badge.className).toContain('src-badge--q2');
  });

  it('zeigt einen definierten Leerzustand, wenn die id nicht (mehr) im Datenbestand existiert', () => {
    const appState = createAppState();
    const viewState = createViewState();
    viewState.setCurrent('family', '@F-gone@');

    render(FamilyDetail, { props: { appState, viewState, onNavigateToPerson: vi.fn() } });

    expect(screen.getByText(/nicht gefunden/)).toBeTruthy();
  });
});
