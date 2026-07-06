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
import { makeDatabase, makePerson, makeFamily, makeSource, makeCitation } from '../../core/model';

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

describe('PersonDetail — kompakte Ereigniszeile (ADR-v9-30 Nachtrag 2026-07-06 Befund 1, INV-UI-5)', () => {
  it('Kartenlink UND Ortslink liegen im selben event-head-Container, wenn beide existieren', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.date = '1 JAN 1900';
    p.birth.lati = 52.1;
    p.birth.long = 7.6;
    p.birth.placeId = '@P1@';
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    const onNavigateToPlace = vi.fn();
    render(PersonDetail, { props: { appState, viewState, onNavigateToPlace } });

    const link = screen.getByRole('link', { name: /Karte/ });
    const placeLink = screen.getByText('Ort ansehen →');
    expect(link.closest('.person-detail__event-head')).toBe(placeLink.closest('.person-detail__event-head'));
    // Kartenlink ist nicht mehr unbedingt margin-left:auto (nur :last-child) — Ortslink
    // folgt im selben Flex-Fluss statt in eine eigene Zeile zu brechen.
    expect(link.className).toContain('person-detail__geo-link');
  });

  it('Quellen-Badge läuft im selben Flex-Fluss wie event-head statt in einem separaten Container', () => {
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
    expect(badge.closest('.person-detail__event-head')).toBeTruthy();
  });
});

describe('PersonDetail — wesentliche Beziehungen (ADR-v9-30 Punkt 6/Nachtrag)', () => {
  it('zeigt bei der eigenen Familie Ehepartner UND Kinder an, jeder Name anklickbar', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Otto', surname: 'Bauer' }));
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Lisa', surname: 'Klein' }));
    db.individuals.set('@I3@', makePerson('@I3@', { given: 'Julius', surname: 'Bauer' }));
    const fam = makeFamily('@F1@', { husband: '@I1@', wife: '@I2@', children: ['@I3@'] });
    db.families.set('@F1@', fam);
    db.individuals.get('@I1@')!.parentIn.push('@F1@');
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });

    expect(screen.getByText('Lisa Klein')).toBeTruthy();
    expect(screen.getByText('Kinder:')).toBeTruthy();
    const childLink = screen.getByText('Julius Bauer');
    await fireEvent.click(childLink);
    expect(viewState.getCurrent('person')).toBe('@I3@');
  });
});

describe('PersonDetail — Bearbeiten (Spec 20 §2)', () => {
  it('"✎ Bearbeiten" öffnet den Editor; Speichern zeigt die Änderung wieder im Steckbrief', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Bauer' }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.input(screen.getByLabelText('Vorname'), { target: { value: 'Anna Maria' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(screen.getByText('Anna Maria Bauer')).toBeTruthy();
  });

  it('"Abbrechen" verwirft Änderungen und kehrt zum read-only Steckbrief zurück', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Bauer' }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.input(screen.getByLabelText('Vorname'), { target: { value: 'Geändert' } });
    await fireEvent.click(screen.getByText('Abbrechen'));

    expect(screen.getByText('Anna Bauer')).toBeTruthy();
    expect(appState.db.individuals.get('@I1@')?.given).toBe('Anna');
  });

  it('startInEdit öffnet den Editor sofort beim Mount (Fluss "＋ Neue Person")', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState, startInEdit: true } });

    expect(screen.getByText('Neue Person')).toBeTruthy();
  });
});
