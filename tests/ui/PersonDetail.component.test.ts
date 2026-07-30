// @vitest-environment happy-dom
// tests/ui/PersonDetail.component.test.ts — Personen-Detail als Component-Test
// (Spec 32 §6 [21]; Spec 20 §1.4 [K]: Quellen-Badges §N mit QUAY-Farbindikator,
// Geo-Links). Deckt tatsächliches DOM-Rendering ab (Klassen/Titel/Links), das
// person-detail-model.test.ts (reine Projektion) nicht prüft.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import PersonDetail from '../../ui/views/person/PersonDetail.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeDatabase, makePerson, makeFamily, makeSource, makeCitation, makeEvent, makeAssociation, isEventPresent } from '../../core/model';
// Geteilte Datenfabrik statt Inline-Literal (TST-REUSE, s. app-state.test.ts).
import { place } from '../core/places-fixtures';
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

    // Marke zeigt jetzt den lesbaren Quellennamen (ADR-v9-120), nicht §42.
    const label = screen.getByText('KB Ochtrup');
    const pill = label.closest('.src-badge')!;
    // Beweiskraft steckt im Meter (ADR-v9-118), nicht in der Pillen-Farbklasse.
    expect(pill.querySelector('.quay-meter')?.getAttribute('data-quay')).toBe('3');
    // Tooltip-Text liegt auf aria-label (geteilter tooltip-Action statt nativem title).
    expect(pill.getAttribute('aria-label')).toBe('KB Ochtrup');
  });

  it('zeigt einen CoordIndicator + OpenStreetMap-Link, wenn das Ereignis Koordinaten hat (ADR-v9-80 Punkt 2)', () => {
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

    expect(screen.getByText('◎')).toBeTruthy();
    const link = screen.getByRole('link', { name: /OpenStreetMap/ });
    expect(link.getAttribute('href')).toContain('52.1');
    expect(link.getAttribute('href')).toContain('7.6');
  });

  it('zeigt KEINEN OpenStreetMap-Link, wenn das Ereignis keine Koordinaten hat', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.date = '1 JAN 1900';
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });

    expect(screen.queryByRole('link', { name: /OpenStreetMap/ })).toBeNull();
  });

  it('zeigt einen definierten Leerzustand, wenn die id nicht (mehr) im Datenbestand existiert', () => {
    const appState = createAppState();
    const viewState = createViewState();
    viewState.setCurrent('person', '@I-gone@');

    render(PersonDetail, { props: { appState, viewState } });

    expect(screen.getByText(/nicht gefunden/)).toBeTruthy();
  });

  // BL-60/ADR-v9-153: die vormaligen Einzelknöpfe „⧖ Im Baum anzeigen"/„📖 Story" sind
  // durch DEN EINEN Lens-Umschalter im Absprung-Modus ersetzt (INV-UI-3) — damit sind
  // Karte und Zeitleiste als Ziel überhaupt erst erreichbar.
  it('zeigt den Lens-Absprung nur, wenn onOpenLens übergeben wurde, und ruft ihn mit Person-ID + Lens auf', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Bauer' }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    const { unmount } = render(PersonDetail, { props: { appState, viewState } });
    expect(screen.queryByRole('group', { name: /andere[nr]? Ansicht/i })).toBeNull();
    unmount();

    const onOpenLens = vi.fn();
    render(PersonDetail, { props: { appState, viewState, onOpenLens } });
    const row = screen.getByRole('group', { name: /andere[nr]? Ansicht/i });
    await fireEvent.click(within(row).getByText('Karte'));
    expect(onOpenLens).toHaveBeenCalledWith('@I1@', 'map');
  });

  it('bietet ALLE vier Lenses als Absprung an (Baum · Karte · Zeitleiste · Story) — die vormaligen zwei Knöpfe deckten nur zwei davon ab', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Bauer' }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState, onOpenLens: vi.fn() } });
    const row = screen.getByRole('group', { name: /andere[nr]? Ansicht/i });
    for (const label of ['Baum', 'Karte', 'Zeitleiste', 'Story']) {
      expect(within(row).getByText(label)).toBeTruthy();
    }
    // Kein zweiter, handgebauter Sprung-Knopf daneben (INV-UI-3) — genau das war der
    // Grund, warum die Aktions-Reihe bei 375px auf 3 Zeilen/5 Elemente lief (INV-UI-11).
    expect(screen.queryByText(/Im Baum anzeigen/)).toBeNull();
  });
});

describe('PersonDetail — Ort-Link + CoordIndicator in EINER Ereigniszeile (ADR-v9-80)', () => {
  it('der Ortsname selbst ist der Link (kein separater "Ort ansehen →"-Button mehr) UND CoordIndicator sitzt im selben event-line__head-Container', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.date = '1 JAN 1900';
    p.birth.lati = 52.1;
    p.birth.long = 7.6;
    p.birth.placeId = '@P1@';
    p.birth.place = 'Ochtrup';
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    const onNavigateToPlace = vi.fn();
    render(PersonDetail, { props: { appState, viewState, onNavigateToPlace } });

    // Der alte separate Button ist ersatzlos entfallen (ADR-v9-80 Punkt 1).
    expect(screen.queryByText('Ort ansehen →')).toBeNull();

    const placeLink = screen.getByRole('button', { name: 'Ochtrup' });
    const coordGlyph = screen.getByText('◎');
    expect(placeLink.closest('.event-line__head')).toBe(coordGlyph.closest('.event-line__head'));
  });

  it('Klick auf den Ortsnamen navigiert intern zum Orte-Tab (onNavigateToPlace)', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.date = '1 JAN 1900';
    p.birth.placeId = '@P1@';
    p.birth.place = 'Ochtrup';
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    const onNavigateToPlace = vi.fn();
    render(PersonDetail, { props: { appState, viewState, onNavigateToPlace } });
    await fireEvent.click(screen.getByRole('button', { name: 'Ochtrup' }));

    expect(onNavigateToPlace).toHaveBeenCalledWith('@P1@');
  });

  it('unaufgelöster Freitext-Ort (keine placeId) bleibt unverlinkter Text', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.date = '1 JAN 1900';
    p.birth.place = 'Irgendwo';
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState, onNavigateToPlace: vi.fn() } });

    expect(screen.queryByRole('button', { name: 'Irgendwo' })).toBeNull();
    expect(screen.getByText('Irgendwo')).toBeTruthy();
  });

  it('Klick auf den CoordIndicator-Glyph setzt lensPlaceFocus und ruft onNavigateLens("map") auf', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.date = '1 JAN 1900';
    p.birth.placeId = '@P1@';
    p.birth.lati = 52.1;
    p.birth.long = 7.6;
    db.individuals.set('@I1@', p);
    // Realistische Fixture (Regressionsfund ADR-v9-78/80-Bau-Nachtrag): das
    // PlaceObject muss SELBST Koordinaten tragen, damit die Karte-Insel
    // (placesWithCoords) einen Marker dafür führt — sonst bleibt der Glyph zwar
    // gefüllt (ev.lati/long-Fallback), aber ohne internen Karte-Sprung, s. eigener
    // Regressionstest in EventLine.component.test.ts.
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup', lat: 52.1, long: 7.6 }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');
    const onNavigateLens = vi.fn();

    render(PersonDetail, { props: { appState, viewState, onNavigateLens } });
    await fireEvent.click(screen.getByText('◎'));

    expect(viewState.getCurrent('lensPlaceFocus')).toBe('@P1@');
    expect(onNavigateLens).toHaveBeenCalledWith('map');
  });

  it('Quellen-Badge läuft im selben Flex-Fluss wie event-line__head statt in einem separaten Container', () => {
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

    const badge = screen.getByText('KB Ochtrup');
    expect(badge.closest('.event-line__head')).toBeTruthy();
  });
});

describe('PersonDetail — Ereigniszeile-Inhaltshierarchie (INV-UI-7, ADR-v9-53)', () => {
  it('addr steht vor der Datum/Ort-Zeile, in derselben Klasse wie value (kein Dimmen/Kursiv)', () => {
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
    const dateLine = screen.getByText(/1950/);
    expect(addr.className).toContain('event-line__value');
    expect(addr.className).not.toContain('event-addr');
    const head = addr.closest('.event-line__head')!;
    const children = Array.from(head.children);
    expect(children.indexOf(addr)).toBeLessThan(children.indexOf(dateLine));
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

  it('das Rollen-Label navigiert zur Familien-Detailseite (INV-UI-12); kein separater "Familie ansehen"-Link', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Otto', surname: 'Bauer' }));
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Lisa', surname: 'Klein' }));
    const fam = makeFamily('@F1@', { husband: '@I1@', wife: '@I2@' });
    db.families.set('@F1@', fam);
    db.individuals.get('@I1@')!.parentIn.push('@F1@');
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    const onNavigateToFamily = vi.fn();
    render(PersonDetail, { props: { appState, viewState, onNavigateToFamily } });

    // kein separater "Familie ansehen →"-Text mehr (INV-UI-12)
    expect(screen.queryByText(/Familie ansehen/)).toBeNull();

    // das Rollen-Label selbst ist der Link
    const roleLink = screen.getByRole('button', { name: 'Eigene Familie' });
    await fireEvent.click(roleLink);
    expect(onNavigateToFamily).toHaveBeenCalledWith('@F1@');
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

describe('PersonDetail — Tod: zweistufig (ADR-v9-62/63)', () => {
  it('zeigt "☠ Verstorben markieren", solange death nicht vorhanden ist; Klick setzt seen/value SOFORT, kein Modal', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Bauer' }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });

    expect(screen.getByText('☠ Verstorben markieren')).toBeTruthy();
    await fireEvent.click(screen.getByText('☠ Verstorben markieren'));

    const saved = appState.db.individuals.get('@I1@')!;
    expect(saved.death.seen).toBe(true);
    expect(saved.death.value).toBe('Y');
    // Kein Modal geöffnet — Direkt-Kommando, kein Umweg.
    expect(screen.queryByText('Tod bearbeiten')).toBeNull();
    expect(screen.queryByText('Tod anlegen')).toBeNull();
  });

  it('zeigt nach "Verstorben markieren" die kompakte "✓ Verstorben"-Zeile mit "+ Datum/Ort ergänzen"-Pill statt der vollen Struktur', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Bauer' }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('☠ Verstorben markieren'));

    expect(screen.getByText('✓ Verstorben')).toBeTruthy();
    expect(screen.queryByText('☠ Verstorben markieren')).toBeNull();
    expect(screen.getByText('+ Datum/Ort ergänzen')).toBeTruthy();
  });

  it('"+ Datum/Ort ergänzen" öffnet EventEditModal im Edit-Modus für das bestehende death-Event', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.death.seen = true;
    p.death.value = 'Y';
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('+ Datum/Ort ergänzen'));
    expect(screen.getByText('Tod bearbeiten')).toBeTruthy();

    await fireEvent.change(screen.getByLabelText('Jahr'), { target: { value: '1955' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.individuals.get('@I1@')?.death.date).toBe('1955');
  });

  it('zeigt die volle Ereigniszeile (kein kompakter Modus) sobald ein echtes Sterbedatum/-ort vorliegt', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.death.date = '1950';
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });

    expect(screen.queryByText('✓ Verstorben')).toBeNull();
    expect(screen.queryByText('+ Datum/Ort ergänzen')).toBeNull();
    expect(screen.getByLabelText('Tod bearbeiten')).toBeTruthy();
  });

  it('zeigt das "✕ Zurücknehmen"-Control NUR solange death das bloße Flag trägt (kompakter Modus) — nicht bei echtem Datum/Ort/Todesursache/Quellen', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();

    // Fall A: bloßes Flag (kompakt) — Control MUSS da sein.
    const flagOnly = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    flagOnly.death.seen = true;
    flagOnly.death.value = 'Y';
    db.individuals.set('@I1@', flagOnly);

    // Fall B: echtes Datum — Control DARF NICHT da sein.
    const withDate = makePerson('@I2@', { given: 'Otto', surname: 'Bauer' });
    withDate.death.date = '1950';
    db.individuals.set('@I2@', withDate);

    // Fall C: nur Todesursache (kein Datum/Ort) — zählt als "echte Daten", Control
    // DARF NICHT da sein (deathHasDetails prüft explizit auch person.cause).
    const withCause = makePerson('@I3@', { given: 'Elsa', surname: 'Bauer' });
    withCause.death.seen = true;
    withCause.death.value = 'Y';
    withCause.cause = 'Typhus';
    db.individuals.set('@I3@', withCause);

    appState.loadDatabase(db, 'test.ged');

    viewState.setCurrent('person', '@I1@');
    const { unmount: unmount1 } = render(PersonDetail, { props: { appState, viewState } });
    expect(screen.getByLabelText('Verstorben-Markierung zurücknehmen')).toBeTruthy();
    unmount1();

    viewState.setCurrent('person', '@I2@');
    const { unmount: unmount2 } = render(PersonDetail, { props: { appState, viewState } });
    expect(screen.queryByLabelText('Verstorben-Markierung zurücknehmen')).toBeNull();
    unmount2();

    viewState.setCurrent('person', '@I3@');
    render(PersonDetail, { props: { appState, viewState } });
    expect(screen.queryByLabelText('Verstorben-Markierung zurücknehmen')).toBeNull();
  });

  it('"✕ Zurücknehmen" setzt death SOFORT (kein Modal) auf den unbefüllten Ausgangszustand zurück — Pill-Reihe zeigt danach wieder "☠ Verstorben markieren"', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.death.seen = true;
    p.death.value = 'Y';
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByLabelText('Verstorben-Markierung zurücknehmen'));

    const saved = appState.db.individuals.get('@I1@')!;
    expect(isEventPresent(saved.death)).toBe(false);
    expect(saved.death.seen).toBe(false);
    expect(saved.death.value).toBe('');
    expect(saved.death.date).toBeNull();

    // Reaktiv, kein Reload: Pill-Reihe zeigt wieder den Ausgangs-Button.
    expect(screen.getByText('☠ Verstorben markieren')).toBeTruthy();
    expect(screen.queryByText('✓ Verstorben')).toBeNull();
    // Kein Modal geöffnet — Direkt-Kommando, gleiches Muster wie "Verstorben markieren".
    expect(screen.queryByText('Tod bearbeiten')).toBeNull();
  });
});

describe('PersonDetail — Wohnort-Standing-Pill (ADR-v9-62/63)', () => {
  it('"+ Wohnort" ist IMMER sichtbar (Standing-Pill) — Klick legt sofort ein RESI-Event an und öffnet den Neu-Modus', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.events.push({
      type: 'RESI', value: '', eventType: '', date: null, datePhrase: '', place: null, placeId: null,
      hofId: null, lati: null, long: null, addr: '', note: '', citations: [], media: [], seen: true, grampsId: null,
    });
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });

    // Bleibt sichtbar, obwohl bereits ein RESI-Event existiert (Standing-Pill, kein
    // "gefüllt schlägt selten"-Ausblenden wie bei Taufe/Bestattung).
    expect(screen.getByText('+ Wohnort')).toBeTruthy();

    await fireEvent.click(screen.getByText('+ Wohnort'));
    expect(screen.getByText('Wohnort anlegen')).toBeTruthy();

    await fireEvent.input(screen.getByLabelText('Wert'), { target: { value: 'Ochtrup 12' } });
    await fireEvent.click(screen.getByText('Speichern'));

    const saved = appState.db.individuals.get('@I1@')!;
    expect(saved.events).toHaveLength(2);
    expect(saved.events[1].type).toBe('RESI');
    expect(saved.events[1].value).toBe('Ochtrup 12');
  });
});

describe('PersonDetail — "+ Ereignis"-Sammel-Menü (ADR-v9-62/63)', () => {
  it('zeigt Taufe/Beruf/Bestattung zuerst, dann Ereignis/Eigentum/Auswanderung/Abschluss/Ausbildung', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Bauer' }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('+ Ereignis'));

    const items = Array.from(document.querySelectorAll('.stb-event-menu__item')).map((el) => el.textContent?.trim());
    expect(items).toEqual(['Taufe', 'Beruf', 'Bestattung', 'Ereignis', 'Eigentum', 'Auswanderung', 'Abschluss', 'Ausbildung']);
  });

  it('Klick auf "Taufe" legt das CHR-Sonderereignis an (Neu-Modus) und verschwindet danach aus dem Menü', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Bauer' }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('+ Ereignis'));
    await fireEvent.click(screen.getByText('Taufe', { selector: '.stb-event-menu__item' }));

    expect(screen.getByText('Taufe anlegen')).toBeTruthy();
    await fireEvent.change(screen.getByLabelText('Jahr'), { target: { value: '1901' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.individuals.get('@I1@')?.chr.date).toBe('1901');
    await fireEvent.click(screen.getByText('+ Ereignis'));
    expect(screen.queryByText('Taufe', { selector: '.stb-event-menu__item' })).toBeNull();
  });

  it('IMMI/MILI/CENS/NATU/ADOP/FACT bleiben über den "Anderer Ereignistyp"-Fallback erreichbar, ohne eigenen Menüplatz', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Bauer' }));
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('+ Ereignis'));

    expect(screen.queryByText('Militärdienst', { selector: '.stb-event-menu__item' })).toBeNull();
    await fireEvent.change(screen.getByLabelText('Anderer Ereignistyp'), { target: { value: 'MILI' } });
    await fireEvent.click(screen.getByText('Hinzufügen'));

    expect(screen.getByText('Militärdienst anlegen')).toBeTruthy();
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.individuals.get('@I1@')?.events.map((e) => e.type)).toEqual(['MILI']);
  });

  it('legt ein zweites OCCU-Event über den "Anderer Typ"-Fallback an, obwohl bereits ein OCCU existiert (Berufswechsel)', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.events.push({
      type: 'OCCU', value: 'Bauer', eventType: '', date: null, datePhrase: '', place: null, placeId: null,
      hofId: null, lati: null, long: null, addr: '', note: '', citations: [], media: [], seen: true, grampsId: null,
    });
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('+ Ereignis'));
    // "Beruf" (OCCU) ist schon vorhanden -> kein eigener Menüplatz mehr.
    expect(screen.queryByText('Beruf', { selector: '.stb-event-menu__item' })).toBeNull();

    await fireEvent.change(screen.getByLabelText('Anderer Ereignistyp'), { target: { value: 'OCCU' } });
    await fireEvent.click(screen.getByText('Hinzufügen'));
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.individuals.get('@I1@')?.events.map((e) => e.type)).toEqual(['OCCU', 'OCCU']);
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

describe('PersonDetail — generalisierte ✕-Rücknahme (Nachtrag 2026-07-12, Spec 20 §2 „Generalisiert")', () => {
  it('Taufe (CHR) — nur `seen`-Flag, keine echten Daten: ✕ ist sichtbar; Klick setzt chr zurück, Pill "Taufe" erscheint wieder im Menü', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.chr.seen = true; // z. B. importiertes `1 CHR` ohne Sub-Tags, ODER via ✎ wieder geleert
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });
    expect(screen.getByLabelText('Taufe zurücknehmen')).toBeTruthy();

    await fireEvent.click(screen.getByLabelText('Taufe zurücknehmen'));

    const saved = appState.db.individuals.get('@I1@')!;
    expect(isEventPresent(saved.chr)).toBe(false);
    expect(saved.chr.seen).toBe(false);
    // Reaktiv, kein Reload: Zeile ist weg, "Taufe" ist wieder im Sammel-Menü erreichbar.
    expect(screen.queryByLabelText('Taufe zurücknehmen')).toBeNull();
    await fireEvent.click(screen.getByText('+ Ereignis'));
    expect(screen.getByText('Taufe', { selector: '.stb-event-menu__item' })).toBeTruthy();
  });

  it('Taufe (CHR) mit echtem Datum: KEIN ✕-Control', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.chr.date = '1901';
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });
    expect(screen.queryByLabelText('Taufe zurücknehmen')).toBeNull();
  });

  it('Bestattung (BURI) — nur `seen`-Flag: ✕ setzt buri direkt (kein Modal) zurück', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.buri.seen = true;
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByLabelText('Bestattung zurücknehmen'));

    const saved = appState.db.individuals.get('@I1@')!;
    expect(isEventPresent(saved.buri)).toBe(false);
    // Kein Modal geöffnet — Direkt-Kommando, gleiches Muster wie bei Tod/Taufe.
    expect(screen.queryByText('Bestattung bearbeiten')).toBeNull();
  });

  it('ein leer angelegtes generisches Ereignis (events[]) verschwindet NICHT unsichtbar, sondern zeigt sich mit ✕ — Klick entfernt GENAU diesen Eintrag aus events[]', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    // Echtes OCCU-Event UND ein "leer gespeichertes" EVEN-Event (der ursprüngliche
    // Bug-Befund: per Pill/"+ Ereignis" angelegt, dann ohne Eingabe gespeichert).
    p.events.push(makeEvent('OCCU', { value: 'Landwirt', date: '1920', seen: true }));
    p.events.push(makeEvent('EVEN'));
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });

    // Das leere Ereignis ist sichtbar (nicht länger unsichtbar-aber-persistiert) UND
    // zeigt genau EIN ✕-Control; das echte OCCU-Event zeigt keins.
    const retractButtons = screen.getAllByRole('button', { name: /zurücknehmen/i });
    expect(retractButtons).toHaveLength(1);

    await fireEvent.click(retractButtons[0]);

    const saved = appState.db.individuals.get('@I1@')!;
    expect(saved.events).toHaveLength(1);
    expect(saved.events[0].type).toBe('OCCU');
    expect(saved.events[0].value).toBe('Landwirt'); // unangetastet
  });

  it('ein generisches Ereignis mit NUR Typ-Freitext (eventType) gilt NICHT als leer — kein ✕ (Datenverlust-Vermeidung)', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.events.push(makeEvent('EVEN', { eventType: 'Hochzeitsreise' }));
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });
    expect(screen.queryByRole('button', { name: /zurücknehmen/i })).toBeNull();
  });

  it('Tod (DEAT) im kompakten Modus zeigt weiterhin NUR sein eigenes "Verstorben-Markierung zurücknehmen"-Control, nicht das generische ✕ zusätzlich', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.death.seen = true;
    p.death.value = 'Y';
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });
    // Genau EIN Rücknahme-Control insgesamt (Tod), nicht zusätzlich noch ein generisches.
    expect(screen.getAllByRole('button', { name: /zurücknehmen/i })).toHaveLength(1);
    expect(screen.getByLabelText('Verstorben-Markierung zurücknehmen')).toBeTruthy();
  });

  it('mehrere dicht liegende leere/gefüllte generische Ereignisse (TST-7 Überlauf-Fall) — jedes ✕ entfernt unabhängig NUR seinen eigenen Index', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    // Abwechselnd leer/gefüllt, 10 Einträge insgesamt (5 leer, 5 gefüllt).
    for (let i = 0; i < 10; i += 1) {
      p.events.push(
        i % 2 === 0
          ? makeEvent('EVEN')
          : makeEvent('CENS', { value: `Zählung ${i}`, date: String(1900 + i), seen: true }),
      );
    }
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });
    expect(screen.getAllByRole('button', { name: /zurücknehmen/i })).toHaveLength(5);

    // Entfernt den ✕ an Index 6 (drittes leeres Event, ursprünglich events[6]).
    await fireEvent.click(screen.getAllByRole('button', { name: /zurücknehmen/i })[2]);

    const saved = appState.db.individuals.get('@I1@')!;
    expect(saved.events).toHaveLength(9);
    expect(saved.events.filter((e) => e.type === 'EVEN')).toHaveLength(4);
    // Alle übrigen Zählung-Werte bleiben erhalten, unverändert.
    expect(saved.events.filter((e) => e.type === 'CENS').map((e) => e.value)).toEqual([
      'Zählung 1', 'Zählung 3', 'Zählung 5', 'Zählung 7', 'Zählung 9',
    ]);
  });
});

describe('PersonDetail — Assoziationen (BL-127, Spec 20 §1.4 [S])', () => {
  function seedAssoc() {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const kind = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    const pate = makePerson('@I2@', { given: 'Josef', surname: 'Meyer' });
    kind.associations.push(makeAssociation('@I2@', { role: 'Taufpate', note: 'aus dem Kirchenbuch' }));
    db.individuals.set('@I1@', kind);
    db.individuals.set('@I2@', pate);
    appState.loadDatabase(db, 'test.ged');
    return { appState, viewState };
  }

  it('zeigt Rolle, klickbaren Namen und Notiz in EINER Zeile (INV-UI-5)', () => {
    const { appState, viewState } = seedAssoc();
    viewState.setCurrent('person', '@I1@');
    render(PersonDetail, { props: { appState, viewState } });

    expect(screen.getByRole('heading', { name: 'Assoziationen' })).toBeTruthy();
    expect(screen.getByText('Taufpate')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Josef Meyer/ })).toBeTruthy();
    expect(screen.getByText('aus dem Kirchenbuch')).toBeTruthy();
  });

  it('die Sektion bleibt bei leerer Liste sichtbar — sonst wäre die erste Assoziation nicht anlegbar', () => {
    const { appState, viewState } = seedAssoc();
    viewState.setCurrent('person', '@I2@'); // der Pate hat selbst keine Assoziationen
    render(PersonDetail, { props: { appState, viewState } });

    expect(screen.getByRole('heading', { name: 'Assoziationen' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Assoziation' })).toBeTruthy();
    // Keine redundante „Keine X erfasst"-Zeile (Spec 21 §10f).
    expect(screen.queryByText(/Keine Assoziationen/i)).toBeNull();
  });

  it('beim Paten erscheint das Patenkind als berechneter Chip — ohne Entfernen-Knopf', () => {
    const { appState, viewState } = seedAssoc();
    viewState.setCurrent('person', '@I2@');
    render(PersonDetail, { props: { appState, viewState } });

    expect(screen.getByText('Patenkinder')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Anna Bauer/ })).toBeTruthy();
    // Die Gegenrichtung ist eine Projektion: hier gibt es nichts zu löschen.
    expect(screen.queryByRole('button', { name: 'Assoziation entfernen' })).toBeNull();
  });

  it('Entfernen schreibt über den Kommando-Chokepoint und lässt andere Felder unberührt', async () => {
    const { appState, viewState } = seedAssoc();
    viewState.setCurrent('person', '@I1@');
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);
    render(PersonDetail, { props: { appState, viewState } });

    await fireEvent.click(screen.getByRole('button', { name: 'Assoziation entfernen' }));

    const saved = appState.db.individuals.get('@I1@')!;
    expect(saved.associations).toEqual([]);
    expect(saved.given).toBe('Anna');
    expect(confirmSpy).toHaveBeenCalledOnce();
  });

  it('eine unauflösbare Referenz wird als Platzhalter gezeigt, nicht verschluckt', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.associations.push(makeAssociation(null, { grampsHandle: '_abc', role: 'Zeuge' }));
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');

    render(PersonDetail, { props: { appState, viewState } });

    expect(screen.getByText('(unbekannte Person)')).toBeTruthy();
    // Kein Navigations-Knopf für etwas, wohin man nicht navigieren kann.
    expect(screen.queryByRole('button', { name: /unbekannte Person/ })).toBeNull();
  });
});
