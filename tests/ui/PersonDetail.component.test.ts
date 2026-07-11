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
import { makeDatabase, makePerson, makeFamily, makeSource, makeCitation, makeEvent } from '../../core/model';

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

describe('PersonDetail — Ereigniszeile-Inhaltshierarchie (INV-UI-7, ADR-v9-53)', () => {
  it('addr steht vor der Datum/Ort-Summary, in derselben Klasse wie value (kein Dimmen/Kursiv)', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Franz', surname: 'Ransmann' });
    p.events.push(makeEvent('RESI', { date: '1950', place: 'Ochtrup', addr: 'Nienborger Damm 1' }));
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });

    const addr = screen.getByText('Nienborger Damm 1');
    const summary = screen.getByText(/1950, Ochtrup/);
    expect(addr.className).toContain('person-detail__event-value');
    expect(addr.className).not.toContain('event-addr');
    const head = addr.closest('.person-detail__event-head')!;
    const children = Array.from(head.children);
    expect(children.indexOf(addr)).toBeLessThan(children.indexOf(summary));
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

describe('PersonDetail — Einzel-Ereignis bearbeiten (✎-Icon, Bau-Auftrag)', () => {
  it('✎ an einer Sonder-Ereignis-Zeile (Geburt) öffnet das fokussierte Modal statt des gesamten Formulars', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.date = '1 JAN 1900';
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByLabelText('Geburt bearbeiten'));

    expect(screen.getByText('Geburt bearbeiten')).toBeTruthy();
    // Das VOLLE Formular (Identitätsfelder) ist NICHT offen.
    expect(screen.queryByLabelText('Vorname')).toBeNull();
  });

  it('speichert eine Änderung an einem Sonder-Ereignis (Geburt) über savePerson mit dem vollen Objekt', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.date = '1900';
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByLabelText('Geburt bearbeiten'));
    await fireEvent.change(screen.getByLabelText('Jahr'), { target: { value: '1901' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.individuals.get('@I1@')?.birth.date).toBe('1901');
    // Modal schließt sich nach dem Speichern.
    expect(screen.queryByText('Geburt bearbeiten')).toBeNull();
  });

  it('speichert eine Änderung an einem generischen Ereignis (events[i]) am richtigen Index', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.events.push(makeEvent('OCCU', { value: 'Bauer' }));
    p.events.push(makeEvent('RESI', { date: '1950' }));
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });
    // Zweite Zeile (RESI/Wohnort) bearbeiten — der Index MUSS stimmen, nicht der erste
    // gefundene ✎-Button.
    await fireEvent.click(screen.getByLabelText('Wohnort bearbeiten'));
    await fireEvent.input(screen.getByLabelText('Wert'), { target: { value: 'Ochtrup' } });
    await fireEvent.click(screen.getByText('Speichern'));

    const saved = appState.db.individuals.get('@I1@')!;
    expect(saved.events[0].value).toBe('Bauer'); // OCCU unangetastet
    expect(saved.events[1].value).toBe('Ochtrup'); // RESI aktualisiert
  });

  it('Tod-Ereignis: Todesursache wird mit übernommen (person.cause, nicht am Event)', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.death.date = '1950';
    p.cause = 'Altersschwäche';
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByLabelText('Tod bearbeiten'));
    const causeInput = screen.getByText('Todesursache').querySelector('input') as HTMLInputElement;
    expect(causeInput.value).toBe('Altersschwäche');
    await fireEvent.input(causeInput, { target: { value: 'Typhus' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.individuals.get('@I1@')?.cause).toBe('Typhus');
  });

  it('Abbrechen im Modal speichert nichts und schließt es wieder', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.date = '1900';
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByLabelText('Geburt bearbeiten'));
    await fireEvent.change(screen.getByLabelText('Jahr'), { target: { value: '1999' } });
    await fireEvent.click(screen.getByText('Abbrechen'));

    expect(appState.db.individuals.get('@I1@')?.birth.date).toBe('1900');
    expect(screen.queryByText('Geburt bearbeiten')).toBeNull();
  });

  it('viele Ereigniszeilen bleiben unabhängig einzeln editierbar (TST-7 Überlauf-Fall)', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    for (let i = 0; i < 8; i += 1) {
      p.events.push(makeEvent('OCCU', { value: `Beruf ${i}`, date: String(1900 + i) }));
    }
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });
    const editButtons = screen.getAllByLabelText('Beruf bearbeiten');
    expect(editButtons).toHaveLength(8);

    await fireEvent.click(editButtons[5]);
    await fireEvent.input(screen.getByLabelText('Wert'), { target: { value: 'Geändert' } });
    await fireEvent.click(screen.getByText('Speichern'));

    const saved = appState.db.individuals.get('@I1@')!;
    expect(saved.events[5].value).toBe('Geändert');
    expect(saved.events[4].value).toBe('Beruf 4');
    expect(saved.events[6].value).toBe('Beruf 6');
  });
});

describe('PersonDetail — leerer "Familien"-Abschnitt verschwindet vollständig (Spec 21 §10f)', () => {
  it('zeigt WEDER "Familien"-Überschrift NOCH eine "Keine Familienverknüpfung"-Zeile ohne Familienbezug', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Bauer' }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });

    expect(screen.queryByText('Familien')).toBeNull();
    expect(screen.queryByText(/Keine Familienverknüpfung/)).toBeNull();
  });
});

describe('PersonDetail — gemeinsame Detail-Kopfzeile (Spec 21 §6b, INV-UI-4)', () => {
  it('"← Zur Liste" und "✎ Bearbeiten" stehen in derselben Kopfzeile, Titel in eigener Zeile darunter', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Bauer' }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');
    const onBack = vi.fn();

    const { container } = render(PersonDetail, { props: { appState, viewState, onBack } });

    const row = container.querySelector('.detail-header__row');
    const title = container.querySelector('.detail-header__title');
    expect(row?.contains(screen.getByText('← Zur Liste'))).toBe(true);
    expect(row?.contains(screen.getByText('✎ Bearbeiten'))).toBe(true);
    expect(title?.textContent).toBe('Anna Bauer');
    expect(row?.contains(title)).toBe(false);
  });

  it('Klick auf "← Zur Liste" ruft das von EntityTab übergebene onBack auf', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Bauer' }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');
    const onBack = vi.fn();

    render(PersonDetail, { props: { appState, viewState, onBack } });
    await fireEvent.click(screen.getByText('← Zur Liste'));

    expect(onBack).toHaveBeenCalledOnce();
  });
});
