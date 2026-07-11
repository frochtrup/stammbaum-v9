// @vitest-environment happy-dom
// tests/ui/FamilyDetail.component.test.ts — Familien-Detail als Component-Test
// (Spec 32 §6; Spec 20 §1.5 [K]: anklickbare Mitglieder). Deckt tatsächliches
// DOM-Rendering + Cross-Navigation zu Personen ab.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import FamilyDetail from '../../ui/views/family/FamilyDetail.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeCitation, makeDatabase, makeEvent, makeFamily, makePerson, makeSource } from '../../core/model';

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

  it('zeigt Kartenlink UND Ortslink nebeneinander im selben event-head (ADR-v9-30 Nachtrag Befund 1)', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const f = makeFamily('@F1@');
    f.marriage.date = '1 JUN 1920';
    f.marriage.placeId = '@P1@';
    f.marriage.lati = 52.1;
    f.marriage.long = 7.1;
    db.families.set('@F1@', f);
    db.placeObjects.set('@P1@', {
      id: '@P1@',
      title: 'Ochtrup',
      type: 'village',
      pnames: [],
      enclosedBy: [],
      lat: null,
      long: null,
      note: '',
      existsFrom: null,
      existsTo: null,
      govId: null,
      govTypes: null,
    });
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('family', '@F1@');
    const onNavigateToPlace = vi.fn();

    render(FamilyDetail, { props: { appState, viewState, onNavigateToPerson: vi.fn(), onNavigateToPlace } });

    const head = screen.getByText('Heirat').closest('.family-detail__event-head') as HTMLElement;
    expect(head.querySelector('.family-detail__geo-link')).toBeTruthy();
    const placeLink = Array.from(head.querySelectorAll('.family-detail__place-link')).find((el) =>
      el.textContent?.includes('Ort ansehen'),
    );
    expect(placeLink).toBeTruthy();
  });

  it('reiht Quellen-Badges im selben event-head-Flex-Fluss ein, nicht in einem separaten Container darunter', () => {
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

    const head = screen.getByText('Heirat').closest('.family-detail__event-head') as HTMLElement;
    expect(head.querySelector('.src-badge, [class*="src-badge"]')).toBeTruthy();
  });

  it('zeigt Eltern als informative Boxen mit Name+Geburtsjahr+Ort (Nachtrag 2026-07-06 [20 §1.5])', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const husband = makePerson('@I1@', { given: 'Heinrich', surname: 'Winkelmann' });
    husband.birth.date = '1 JAN 1880';
    husband.birth.place = 'Ochtrup';
    const wife = makePerson('@I2@', { given: 'Margarete', surname: 'Winkelmann' });
    wife.birth.date = '1 JAN 1885';
    wife.birth.place = 'Ochtrup';
    db.individuals.set('@I1@', husband);
    db.individuals.set('@I2@', wife);
    db.families.set('@F1@', makeFamily('@F1@', { husband: '@I1@', wife: '@I2@' }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('family', '@F1@');

    render(FamilyDetail, { props: { appState, viewState, onNavigateToPerson: vi.fn() } });

    const boxes = screen.getAllByRole('button', { name: /Winkelmann/ });
    expect(boxes).toHaveLength(2);
    expect(screen.getAllByText('1880, Ochtrup')).toHaveLength(1);
    expect(screen.getAllByText('1885, Ochtrup')).toHaveLength(1);
    for (const box of boxes) {
      expect(box.className).toContain('stb-person-box');
    }
  });

  it('zeigt bei Kindern zusätzlich das Geburtsjahr zur eindeutigen Identifikation (Nachtrag 2026-07-06 [20 §1.5])', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const child1 = makePerson('@I3@', { given: 'Julius', surname: 'Winkelmann' });
    child1.birth.date = '1 JAN 1955';
    const child2 = makePerson('@I4@', { given: 'Julius', surname: 'Winkelmann' });
    child2.birth.date = '1 JAN 1958';
    db.individuals.set('@I3@', child1);
    db.individuals.set('@I4@', child2);
    db.families.set('@F1@', makeFamily('@F1@', { children: ['@I3@', '@I4@'] }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('family', '@F1@');

    render(FamilyDetail, { props: { appState, viewState, onNavigateToPerson: vi.fn() } });

    expect(screen.getByText('(1955)')).toBeTruthy();
    expect(screen.getByText('(1958)')).toBeTruthy();
  });

  it('zeigt die Heirat direkt nach den Eltern-Boxen, vor den Kindern (DOM-Reihenfolge)', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Heinrich', surname: 'Winkelmann' }));
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Margarete', surname: 'Winkelmann' }));
    const child = makePerson('@I3@', { given: 'Julius', surname: 'Winkelmann' });
    child.birth.date = '1 JAN 1955';
    db.individuals.set('@I3@', child);
    const f = makeFamily('@F1@', { husband: '@I1@', wife: '@I2@', children: ['@I3@'] });
    f.marriage.date = '1 JUN 1920';
    db.families.set('@F1@', f);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('family', '@F1@');

    const { container } = render(FamilyDetail, { props: { appState, viewState, onNavigateToPerson: vi.fn() } });

    const sections = Array.from(container.querySelectorAll('.family-detail__section'));
    const parentsIdx = sections.findIndex((s) => s.textContent?.includes('Heinrich Winkelmann'));
    const marriageIdx = sections.findIndex((s) => s.textContent?.includes('Heirat'));
    const childrenIdx = sections.findIndex((s) => s.textContent?.includes('Julius Winkelmann'));

    expect(parentsIdx).toBeGreaterThanOrEqual(0);
    expect(marriageIdx).toBeGreaterThan(parentsIdx);
    expect(childrenIdx).toBeGreaterThan(marriageIdx);
  });

  it('zeigt einen definierten Leerzustand, wenn die id nicht (mehr) im Datenbestand existiert', () => {
    const appState = createAppState();
    const viewState = createViewState();
    viewState.setCurrent('family', '@F-gone@');

    render(FamilyDetail, { props: { appState, viewState, onNavigateToPerson: vi.fn() } });

    expect(screen.getByText(/nicht gefunden/)).toBeTruthy();
  });
});

describe('FamilyDetail — leere optionale Abschnitte verschwinden vollständig (Spec 21 §10f)', () => {
  it('zeigt WEDER "Kinder"-Überschrift NOCH eine "Keine Kinder"-Zeile, wenn die Familie keine Kinder hat', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Otto', surname: 'Bauer' }));
    db.families.set('@F1@', makeFamily('@F1@', { husband: '@I1@' }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('family', '@F1@');

    render(FamilyDetail, { props: { appState, viewState, onNavigateToPerson: vi.fn() } });

    expect(screen.queryByText('Kinder')).toBeNull();
    expect(screen.queryByText(/Keine Kinder/)).toBeNull();
  });

  it('zeigt WEDER "Weitere Ereignisse"-Überschrift NOCH eine "Keine weiteren Ereignisse"-Zeile, wenn keine vorhanden sind', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Otto', surname: 'Bauer' }));
    db.families.set('@F1@', makeFamily('@F1@', { husband: '@I1@' }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('family', '@F1@');

    render(FamilyDetail, { props: { appState, viewState, onNavigateToPerson: vi.fn() } });

    expect(screen.queryByText('Weitere Ereignisse')).toBeNull();
    expect(screen.queryByText(/Keine weiteren Ereignisse/)).toBeNull();
  });

  it('zeigt "Kinder" wieder, sobald welche vorhanden sind', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.individuals.set('@I3@', makePerson('@I3@', { given: 'Julius', surname: 'Bauer' }));
    db.families.set('@F1@', makeFamily('@F1@', { children: ['@I3@'] }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('family', '@F1@');

    render(FamilyDetail, { props: { appState, viewState, onNavigateToPerson: vi.fn() } });

    expect(screen.getByText('Kinder')).toBeTruthy();
    expect(screen.getByText('Julius Bauer')).toBeTruthy();
  });
});

describe('FamilyDetail — gemeinsame Detail-Kopfzeile (Spec 21 §6b, INV-UI-4)', () => {
  it('"← Zur Liste" und "✎ Bearbeiten" stehen in derselben Kopfzeile; der Titel läuft kompakt in DERSELBEN Zeile statt als große zweite Zeile (Spec 21 §10e — redundant zu den Eltern-Boxen darunter)', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Otto', surname: 'Bauer' }));
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Anna', surname: 'Klein' }));
    db.families.set('@F1@', makeFamily('@F1@', { husband: '@I1@', wife: '@I2@' }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('family', '@F1@');
    const onBack = vi.fn();

    const { container } = render(FamilyDetail, { props: { appState, viewState, onNavigateToPerson: vi.fn(), onBack } });

    const row = container.querySelector('.detail-header__row');
    // Keine große eigene Titelzeile mehr (Spec 21 §10e) — nur der kompakte Titel IN der
    // Kopfzeile selbst.
    expect(container.querySelector('.detail-header__title')).toBeNull();
    const compactTitle = container.querySelector('.detail-header__compact-title');
    expect(compactTitle?.textContent).toBe('Otto Bauer ⚭ Anna Klein');
    expect(row?.contains(compactTitle)).toBe(true);
    expect(row?.contains(screen.getByText('← Zur Liste'))).toBe(true);
    expect(row?.contains(screen.getByText('✎ Bearbeiten'))).toBe(true);

    await fireEvent.click(screen.getByText('← Zur Liste'));
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe('FamilyDetail — Einzel-Ereignis bearbeiten (✎-Icon, Bau-Auftrag)', () => {
  it('✎ an der Heirats-Zeile öffnet das fokussierte Modal statt des gesamten Formulars', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const f = makeFamily('@F1@');
    f.marriage.date = '1 JUN 1920';
    db.families.set('@F1@', f);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('family', '@F1@');

    render(FamilyDetail, { props: { appState, viewState, onNavigateToPerson: vi.fn() } });
    await fireEvent.click(screen.getByLabelText('Heirat bearbeiten'));

    expect(screen.getByText('Heirat bearbeiten')).toBeTruthy();
    // Das volle Formular (Eltern-Picker) ist NICHT offen.
    expect(screen.queryByLabelText('Ehemann')).toBeNull();
  });

  it('speichert eine Änderung an der Heirat über saveFamily mit dem vollen Objekt', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const f = makeFamily('@F1@');
    f.marriage.date = '1920';
    db.families.set('@F1@', f);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('family', '@F1@');

    render(FamilyDetail, { props: { appState, viewState, onNavigateToPerson: vi.fn() } });
    await fireEvent.click(screen.getByLabelText('Heirat bearbeiten'));
    await fireEvent.change(screen.getByLabelText('Jahr'), { target: { value: '1921' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.families.get('@F1@')?.marriage.date).toBe('1921');
    expect(screen.queryByText('Heirat bearbeiten')).toBeNull();
  });

  it('speichert eine Änderung an einem generischen Ereignis (events[i]) am richtigen Index', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const f = makeFamily('@F1@');
    f.events.push(makeEvent('CENS', { value: 'Zählung 1900', date: '1900' }));
    f.events.push(makeEvent('PROP', { value: 'Hof', date: '1905' }));
    db.families.set('@F1@', f);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('family', '@F1@');

    render(FamilyDetail, { props: { appState, viewState, onNavigateToPerson: vi.fn() } });
    await fireEvent.click(screen.getByLabelText('Eigentum bearbeiten'));
    await fireEvent.input(screen.getByLabelText('Wert'), { target: { value: 'Geändert' } });
    await fireEvent.click(screen.getByText('Speichern'));

    const saved = appState.db.families.get('@F1@')!;
    expect(saved.events[0].value).toBe('Zählung 1900'); // CENS unangetastet
    expect(saved.events[1].value).toBe('Geändert'); // PROP aktualisiert
  });

  it('Verlobung (ENGA) lässt sich unabhängig von der Heirat bearbeiten', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const f = makeFamily('@F1@');
    f.engagement.date = '1919';
    f.marriage.date = '1920';
    db.families.set('@F1@', f);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('family', '@F1@');

    render(FamilyDetail, { props: { appState, viewState, onNavigateToPerson: vi.fn() } });
    await fireEvent.click(screen.getByLabelText('Verlobung bearbeiten'));
    await fireEvent.change(screen.getByLabelText('Jahr'), { target: { value: '1918' } });
    await fireEvent.click(screen.getByText('Speichern'));

    const saved = appState.db.families.get('@F1@')!;
    expect(saved.engagement.date).toBe('1918');
    expect(saved.marriage.date).toBe('1920'); // unangetastet
  });

  it('Abbrechen im Modal speichert nichts und schließt es wieder', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const f = makeFamily('@F1@');
    f.marriage.date = '1920';
    db.families.set('@F1@', f);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('family', '@F1@');

    render(FamilyDetail, { props: { appState, viewState, onNavigateToPerson: vi.fn() } });
    await fireEvent.click(screen.getByLabelText('Heirat bearbeiten'));
    await fireEvent.change(screen.getByLabelText('Jahr'), { target: { value: '1999' } });
    await fireEvent.click(screen.getByText('Abbrechen'));

    expect(appState.db.families.get('@F1@')?.marriage.date).toBe('1920');
    expect(screen.queryByText('Heirat bearbeiten')).toBeNull();
  });

  it('viele generische Ereigniszeilen bleiben unabhängig einzeln editierbar (TST-7 Überlauf-Fall)', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const f = makeFamily('@F1@');
    for (let i = 0; i < 8; i += 1) {
      f.events.push(makeEvent('CENS', { value: `Zählung ${i}`, date: String(1900 + i) }));
    }
    db.families.set('@F1@', f);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('family', '@F1@');

    render(FamilyDetail, { props: { appState, viewState, onNavigateToPerson: vi.fn() } });
    const editButtons = screen.getAllByLabelText('Volkszählung bearbeiten');
    expect(editButtons).toHaveLength(8);

    await fireEvent.click(editButtons[5]);
    await fireEvent.input(screen.getByLabelText('Wert'), { target: { value: 'Geändert' } });
    await fireEvent.click(screen.getByText('Speichern'));

    const saved = appState.db.families.get('@F1@')!;
    expect(saved.events[5].value).toBe('Geändert');
    expect(saved.events[4].value).toBe('Zählung 4');
    expect(saved.events[6].value).toBe('Zählung 6');
  });
});
