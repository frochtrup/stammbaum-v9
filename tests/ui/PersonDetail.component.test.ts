// @vitest-environment happy-dom
// tests/ui/PersonDetail.component.test.ts — Personen-Detail als Component-Test
// (Spec 32 §6 [21]; Spec 20 §1.4 [K]: Quellen-Badges §N mit QUAY-Farbindikator,
// Geo-Links). Deckt tatsächliches DOM-Rendering ab (Klassen/Titel/Links), das
// person-detail-model.test.ts (reine Projektion) nicht prüft.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PersonDetail from '../../ui/views/person/PersonDetail.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeDatabase, makePerson, makeSource, makeCitation } from '../../core/model';

describe('PersonDetail — Quellen-Badge + Geo-Link (Component)', () => {
  it('rendert eine §N-Badge mit QUAY-Farbklasse und Quellentitel als Tooltip', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.date = '1 JAN 1900';
    p.birth.citations.push(makeCitation('@S42@', { quay: 3 }));
    db.individuals.set('@I1@', p);
    db.sources.set('@S42@', makeSource('@S42@', { abbr: 'KB Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });

    const badge = screen.getByText('§42');
    expect(badge.className).toContain('src-badge--q3');
    expect(badge.getAttribute('title')).toBe('KB Ochtrup');
  });

  it('zeigt einen Geo-Link, wenn das Ereignis Koordinaten hat', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.date = '1 JAN 1900';
    p.birth.lati = 52.1;
    p.birth.long = 7.6;
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });

    const link = screen.getByRole('link', { name: /Karte/ });
    expect(link.getAttribute('href')).toContain('52.1');
    expect(link.getAttribute('href')).toContain('7.6');
  });

  it('zeigt KEINEN Geo-Link, wenn das Ereignis keine Koordinaten hat', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.date = '1 JAN 1900';
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });

    expect(screen.queryByRole('link', { name: /Karte/ })).toBeNull();
  });

  it('zeigt einen definierten Leerzustand, wenn die id nicht (mehr) im Datenbestand existiert', () => {
    const appState = createAppState();
    const viewState = createViewState();
    viewState.setCurrent('person', '@I-gone@');

    render(PersonDetail, { props: { appState, viewState } });

    expect(screen.getByText(/nicht gefunden/)).toBeTruthy();
  });

  it('zeigt "Im Baum anzeigen" nur, wenn onNavigateToTree übergeben wurde, und ruft es mit der Person-ID auf', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Bauer' }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    const { unmount } = render(PersonDetail, { props: { appState, viewState } });
    expect(screen.queryByText(/Im Baum anzeigen/)).toBeNull();
    unmount();

    const onNavigateToTree = vi.fn();
    render(PersonDetail, { props: { appState, viewState, onNavigateToTree } });
    await fireEvent.click(screen.getByText(/Im Baum anzeigen/));
    expect(onNavigateToTree).toHaveBeenCalledWith('@I1@');
  });
});
