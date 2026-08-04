// @vitest-environment happy-dom
// tests/ui/PlaceDetail.component.test.ts — Orts-Steckbrief + Bearbeitung (Spec 32 §6;
// Spec 20 §1.7 [K]). Deckt Ereignis-Gruppierung, Bearbeitung, pnames/enclosedBy-Pflege,
// String→PlaceObject-Verknüpfung als tatsächliches DOM-Rendering ab.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import PlaceDetail from '../../ui/views/place/PlaceDetail.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { onlineStatus, type OnlineStatusEnv } from '../../ui/shell/online-status.svelte';
import { makeDatabase, makePerson, makeCitation, makeSource } from '../../core/model';
import { place, hof } from '../core/places-fixtures';
import { pinLayout } from './layout-harness';
import { layout } from '../../ui/shell/layout.svelte';

// Formfaktor explizit auf MOBIL: „← Zurück" ist eine mobile Navigation und entfällt
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

describe('PlaceDetail — Steckbrief (read-only Teile)', () => {
  it('zeigt einen definierten Leerzustand, wenn kein Ort ausgewählt ist', () => {
    const appState = createAppState();
    const viewState = createViewState();

    render(PlaceDetail, { props: { appState, viewState } });

    expect(screen.getByText('Kein Ort ausgewählt.')).toBeTruthy();
  });

  it('zeigt einen definierten Leerzustand, wenn die id nicht (mehr) existiert', () => {
    const appState = createAppState();
    const viewState = createViewState();
    viewState.setCurrent('place', '@gone@');

    render(PlaceDetail, { props: { appState, viewState } });

    expect(screen.getByText(/nicht gefunden/)).toBeTruthy();
  });

  it('gruppiert Ereignisse nach Typ und verlinkt die referenzierende Person', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    person.birth.placeId = '@P1@';
    db.individuals.set('@I1@', person);
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');
    const onNavigateToPerson = vi.fn();

    render(PlaceDetail, { props: { appState, viewState, onNavigateToPerson } });

    // Gruppen-Header deutsch übersetzt (event-labels.ts, Nutzer-Fund 2026-07-10).
    expect(screen.getByText('Geburt (1)')).toBeTruthy();
    await fireEvent.click(screen.getByText('Otto Bauer'));
    expect(onNavigateToPerson).toHaveBeenCalledWith('@I1@');
  });
});

describe('PlaceDetail — Typ-Badge im Kopfbereich (B7-Regression, ADR-v9-149)', () => {
  it('zeigt den Ortstyp deutsch statt als rohen GRAMPS-Wert', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Bayern', type: 'State' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });

    expect(screen.getByText('Bundesland')).toBeTruthy();
    expect(screen.queryByText('State')).toBeNull();
  });

  it('zeigt bei type="Unknown" KEIN Badge — der gemeldete Fund (Burgsteinfurt)', () => {
    // Nutzer-Fund 2026-07-29 (Design-Kritik): der Steckbrief-Kopf trug einen prominenten
    // „Unknown"-Chip. Doppelt falsch — englisch in deutscher UI (Altlast B7, bereits
    // einmal gefixt) UND ein Dauer-Signal auf einem Zustand, den ADR-v9-77 ausdrücklich
    // als „normalen, unauffälligen Fall" führt.
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Burgsteinfurt', type: 'Unknown' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    const { container } = render(PlaceDetail, { props: { appState, viewState } });

    expect(screen.getByText('Burgsteinfurt')).toBeTruthy();
    expect(screen.queryByText('Unknown')).toBeNull();
    expect(screen.queryByText('Unbekannt')).toBeNull();
    expect(container.querySelector('.place-detail__type-badge')).toBeNull();
  });
});

describe('PlaceDetail — Bearbeitung (Name, Koordinaten, Typ)', () => {
  it('speichert Grunddaten über appState.savePlace', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup', type: 'Village' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Ochtrup (neu)' } });
    await fireEvent.input(screen.getByLabelText('Breitengrad'), { target: { value: '52.2' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.placeObjects.get('@P1@')?.title).toBe('Ochtrup (neu)');
    expect(appState.db.placeObjects.get('@P1@')?.lat).toBe(52.2);
  });
});

describe('PlaceDetail — Bearbeitung (existsFrom/existsTo/govId/govTypes, TST-9 Feld-Vollständigkeit)', () => {
  it('speichert existsFrom/existsTo/govId/govTypes über appState.savePlace und zeigt sie beim erneuten Öffnen wieder', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.input(screen.getByLabelText('Existiert von (Jahr)'), { target: { value: '1200' } });
    await fireEvent.input(screen.getByLabelText('Existiert bis (Jahr)'), { target: { value: '1975' } });
    await fireEvent.input(screen.getByLabelText('GOV-ID'), { target: { value: 'object_123456' } });
    await fireEvent.input(screen.getByLabelText('GOV-Typen (kommagetrennt)'), { target: { value: 'Stadt, Kreis' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.placeObjects.get('@P1@')?.existsFrom).toBe(1200);
    expect(appState.db.placeObjects.get('@P1@')?.existsTo).toBe(1975);
    expect(appState.db.placeObjects.get('@P1@')?.govId).toBe('object_123456');
    expect(appState.db.placeObjects.get('@P1@')?.govTypes).toEqual(['Stadt', 'Kreis']);

    // Persistenz-Rundlauf (TST-8): erneut öffnen zeigt die gespeicherten Werte wieder.
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    expect((screen.getByLabelText('Existiert von (Jahr)') as HTMLInputElement).value).toBe('1200');
    expect((screen.getByLabelText('Existiert bis (Jahr)') as HTMLInputElement).value).toBe('1975');
    expect((screen.getByLabelText('GOV-ID') as HTMLInputElement).value).toBe('object_123456');
    expect((screen.getByLabelText('GOV-Typen (kommagetrennt)') as HTMLInputElement).value).toBe('Stadt, Kreis');
  });

  it('leere GOV-Typen werden zu null statt einer leeren Liste', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup', govTypes: ['Stadt'] }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.input(screen.getByLabelText('GOV-Typen (kommagetrennt)'), { target: { value: '' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.placeObjects.get('@P1@')?.govTypes).toBeNull();
  });
});

describe('PlaceDetail — Löschen (ADR-v9-78 Punkt 1)', () => {
  it('löscht das PlaceObject nach Bestätigung und navigiert per onBack zur Liste', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    person.birth.placeId = '@P1@';
    db.individuals.set('@I1@', person);
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');
    const onBack = vi.fn();
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);

    render(PlaceDetail, { props: { appState, viewState, onBack } });
    await fireEvent.click(screen.getByText('Ort löschen'));

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(appState.db.placeObjects.has('@P1@')).toBe(false);
    // Kaskadierende Referenz-Bereinigung (deletePlaceCascade) — keine hängende placeId.
    expect(appState.db.individuals.get('@I1@')?.birth.placeId).toBeNull();
    expect(onBack).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
  });

  it('löscht NICHT, wenn die Bestätigung abgebrochen wird', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');
    const onBack = vi.fn();
    const confirmSpy = vi.fn(() => false);
    vi.stubGlobal('confirm', confirmSpy);

    render(PlaceDetail, { props: { appState, viewState, onBack } });
    await fireEvent.click(screen.getByText('Ort löschen'));

    expect(appState.db.placeObjects.has('@P1@')).toBe(true);
    expect(onBack).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  // GEDREHT mit BL-277/ADR-v9-217 (vorher: „zeigt Ort löschen NICHT außerhalb des
  // Bearbeiten-Modus"). Das Gate aus ADR-v9-30 Punkt 5 hält Feld- und Beziehungs-Controls
  // von der Lesefläche fern; ein Record-Löschen bringt mit dem Bestätigungsdialog sein
  // eigenes, stärkeres Gate mit — und die fünf übrigen Entitäten führen es längst so
  // (`DeleteEntityButton`, INV-UI-4). Die zweite Hälfte des alten Befunds bleibt geprüft:
  // in der Knopfreihe des Formulars steht es NICHT mehr.
  it('zeigt "Ort löschen" in der abgesetzten Danger-Zone — auch ohne Bearbeiten-Modus (ADR-v9-217)', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });

    const knopf = screen.getByText('Ort löschen');
    expect(knopf.closest('.delete-entity')).not.toBeNull();
    expect(knopf.closest('.place-edit-form')).toBeNull();
  });
});

describe('PlaceDetail — Namens-Varianten (pnames) Pflege', () => {
  it('fügt eine neue pnames-Variante hinzu (nur im Bearbeiten-Modus sichtbar)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Sassenberg' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.input(screen.getByLabelText('Neue Namensvariante'), { target: { value: 'Sassenbergk' } });
    // Zwei "+ Hinzufügen"-Buttons existieren jetzt (enclosedBy + pnames, ADR-v9-42: die
    // enclosedBy-Zeile ist nicht mehr an otherPlaces.length>0 gebunden) — auf die
    // pnames-add-row scopen statt den ersten Treffer blind zu nehmen.
    const pnamesRow = screen.getByLabelText('Neue Namensvariante').closest('.place-detail__add-row') as HTMLElement;
    await fireEvent.click(within(pnamesRow).getByText('+ Hinzufügen'));

    expect(appState.db.placeObjects.get('@P1@')?.pnames.map((p) => p.value)).toEqual(['Sassenbergk']);
  });

  it('entfernt eine bestehende pnames-Variante (nur im Bearbeiten-Modus sichtbar)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set(
      '@P1@',
      place('@P1@', { title: 'Sassenberg', pnames: [{ value: 'Sassenbergk', from: null, to: null }] }),
    );
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.click(screen.getByLabelText('Namensvariante „Sassenbergk" entfernen'));

    expect(appState.db.placeObjects.get('@P1@')?.pnames).toEqual([]);
  });
});

describe('PlaceDetail — Übersetzungen (Sprachachse, BL-59)', () => {
  it('fügt eine Übersetzung hinzu (Sprachkürzel + Name, nur im Bearbeiten-Modus)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Breslau' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.input(screen.getByLabelText('Sprachkürzel'), { target: { value: 'pl' } });
    await fireEvent.input(screen.getByLabelText('Übersetzter Ortsname'), { target: { value: 'Wrocław' } });
    await fireEvent.click(screen.getByText('+ Übersetzung'));

    expect(appState.db.placeObjects.get('@P1@')?.translations).toEqual([{ lang: 'pl', value: 'Wrocław' }]);
  });

  it('entfernt eine bestehende Übersetzung (nur im Bearbeiten-Modus)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Breslau', translations: [{ lang: 'pl', value: 'Wrocław' }] }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.click(screen.getByLabelText('Übersetzung „Wrocław" entfernen'));

    expect(appState.db.placeObjects.get('@P1@')?.translations).toEqual([]);
  });

  it('zeigt Übersetzungen außerhalb des Bearbeiten-Modus als Pille', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Breslau', translations: [{ lang: 'pl', value: 'Wrocław' }] }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });
    expect(screen.getByText('Wrocław')).toBeTruthy();
    expect(screen.queryByLabelText('Übersetzter Ortsname')).toBeNull(); // kein Add-Feld ohne editing
  });
});

describe('PlaceDetail — Mini-Karte (BL-09/BL-214)', () => {
  // Offline-Pfad erzwingen: dann rendert der deterministische Vektor-SVG-Renderer
  // (App-online würde Leaflet-Kacheln mounten, in happy-dom nicht sinnvoll prüfbar).
  // Die online/offline-Umschaltung selbst ist Unit-getestet (mini-map/mini-map-bounds).
  const offlineEnv: OnlineStatusEnv = {
    isOnline: () => false,
    addListener: () => {},
    removeListener: () => {},
    hasAppCache: async () => true,
  };
  beforeEach(() => onlineStatus.start(offlineEnv));
  afterEach(() => onlineStatus.reset());

  it('rendert die Karte-Sektion, wenn der Ort Koordinaten trägt', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup', lat: 52.2073, long: 7.1845 }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });
    expect(screen.getByRole('heading', { name: 'Karte' })).toBeTruthy();
    expect(screen.getByRole('img', { name: /Karte: Ochtrup/ })).toBeTruthy();
  });

  it('rendert KEINE Karte für einen unangereicherten Ort ohne Koordinaten (TST-16)', () => {
    // Der Regelfall direkt nach Import: Village-Seed ohne eigene Koordinaten — die Mini-Karte
    // muss dann schweigen (kein leerer Rahmen, kein Absturz), nicht ein naheliegend kuratiertes
    // Beispiel testen.
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' })); // lat/long null
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });
    expect(screen.queryByRole('heading', { name: 'Karte' })).toBeNull();
    expect(screen.queryByRole('img', { name: /^Karte:/ })).toBeNull();
  });
});

describe('PlaceDetail — Verwaltungszugehörigkeit (enclosedBy) Pflege (jetzt im PlaceEnclosureEditModal)', () => {
  it('fügt eine neue enclosedBy-Zugehörigkeit über den generischen Picker im Bearbeiten-Modal hinzu', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Kreis Steinfurt' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('Zugehörigkeit bearbeiten'));

    await fireEvent.click(screen.getByLabelText('Übergeordneter Ort'));
    await fireEvent.click(screen.getByText('Kreis Steinfurt'));

    const addRow = screen.getByLabelText('Gültig von (Jahr)').closest('.place-enclosure-modal__add-row') as HTMLElement;
    await fireEvent.click(within(addRow).getByText('+ Hinzufügen'));

    expect(appState.db.placeObjects.get('@P1@')?.enclosedBy.map((e) => e.placeId)).toEqual(['@P2@']);
  });

  it('bietet "+ neuen Ort anlegen" im enclosedBy-Picker im Bearbeiten-Modal an (ADR-v9-42, ersetzt die ADR-v9-40-Ausnahme)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('Zugehörigkeit bearbeiten'));
    await fireEvent.click(screen.getByLabelText('Übergeordneter Ort'));
    await fireEvent.click(screen.getByText('+ neuen Ort anlegen …'));

    // PlaceDetails eigenes Bearbeiten-Formular hat ebenfalls einen "Speichern"-Button —
    // auf den PlaceForm-Container scopen (analog SourcePicker.component.test.ts-Muster).
    const placeFormEl = screen.getByText('Neuer Ort').closest('.place-form') as HTMLElement;
    expect(placeFormEl).toBeTruthy();
    await fireEvent.input(screen.getByLabelText('Name (neuer Ort)'), { target: { value: 'Kreis Steinfurt' } });
    await fireEvent.click(within(placeFormEl).getByText('Speichern'));

    // Neu angelegter Ort ist sofort persistiert UND im Picker als Auswahl übernommen.
    const created = Array.from(appState.db.placeObjects.values()).find((p) => p.title === 'Kreis Steinfurt');
    expect(created).toBeTruthy();
    expect(screen.queryByText('Neuer Ort')).toBeNull();

    const addRow = screen.getByLabelText('Gültig von (Jahr)').closest('.place-enclosure-modal__add-row') as HTMLElement;
    await fireEvent.click(within(addRow).getByText('+ Hinzufügen'));

    expect(appState.db.placeObjects.get('@P1@')?.enclosedBy.map((e) => e.placeId)).toEqual([created!.id]);
  });
});

describe('PlaceDetail — Dubletten-Merge (verlustfrei, Herkunfts-Pille)', () => {
  it('bietet die übrigen Orte als Ziel-Auswahl an (nicht sich selbst)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Ochtrupp (Schreibvariante)' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.click(screen.getByLabelText('Ziel-Ort für Merge'));

    expect(screen.getByText('Ochtrupp (Schreibvariante)')).toBeTruthy();
    expect(screen.queryByText('Ochtrup', { selector: '.stb-picker__result-name' })).toBeNull();
  });

  it('führt den aktuellen Ort per appState.mergePlace in den gewählten Ziel-Ort zusammen und navigiert dorthin', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Ochtrupp' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.click(screen.getByLabelText('Ziel-Ort für Merge'));
    await fireEvent.click(screen.getByText('Ochtrupp'));
    await fireEvent.click(screen.getByText('In Ziel-Ort zusammenführen'));

    // Dublette ist verschwunden, Überlebender hat die Variante aufgenommen (verlustfrei).
    expect(appState.db.placeObjects.get('@P1@')).toBeUndefined();
    expect(appState.db.placeObjects.get('@P2@')?.pnames.map((p) => p.value)).toContain('Ochtrup');
    // Navigation zum Ziel-Ort (der jetzt die Varianten hält).
    expect(viewState.getCurrent('place')).toBe('@P2@');
  });

  it('zeigt die gefaltete Variante nach dem Merge als Herkunfts-Pille beim Ziel-Ort', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Ochtrupp' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.click(screen.getByLabelText('Ziel-Ort für Merge'));
    await fireEvent.click(screen.getByText('Ochtrupp'));
    await fireEvent.click(screen.getByText('In Ziel-Ort zusammenführen'));

    expect(screen.getByText('Ochtrupp')).toBeTruthy(); // Ziel-Titel im Steckbrief
    // Im Bearbeiten-Modus sind bestehende Varianten seit ADR-v9-183 änderbare ZEILEN,
    // keine Pillen — die gefaltete Variante steht dort als Feldwert.
    expect((screen.getByLabelText('Namensvariante 1') as HTMLInputElement).value).toBe('Ochtrup');
    // Auf der LESEFLÄCHE bleibt sie die Herkunfts-Pille (Verlustfreiheit sichtbar).
    // „Fertig" statt vormals „Abbrechen" (INV-UI-16, ADR-v9-193): der Modus wird von dem
    // Schalter geschlossen, der ihn geöffnet hat. Dieser Test ist selbst ein Beleg für den
    // behobenen Defekt — der Merge oben ist längst geschrieben, und trotzdem stand hier
    // „Abbrechen".
    await fireEvent.click(screen.getByText('Fertig'));
    const pill = screen.getByText('Ochtrup', { selector: '.stb-pill' });
    expect(pill.closest('.stb-pill')).toBeTruthy();
  });

  it('schließt Selbst-Merge aus (kein appState.mergePlace-Aufruf, Fehlermeldung)', async () => {
    const appState = createAppState();
    const mergeSpy = vi.spyOn(appState, 'mergePlace');
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));

    // Kein weiterer Ort vorhanden -> die Aktion bietet gar keine Auswahl an (kanonischer
    // Ausschluss von Selbst-Merge structurell, nicht nur per Laufzeit-Check).
    expect(screen.getByText(/Kein weiterer Ort vorhanden/)).toBeTruthy();
    expect(mergeSpy).not.toHaveBeenCalled();
  });

  it('meldet einen Fehler statt appState.mergePlace aufzurufen, wenn kein Ziel gewählt ist', async () => {
    const appState = createAppState();
    const mergeSpy = vi.spyOn(appState, 'mergePlace');
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Ochtrupp' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    const mergeBtn = screen.getByText('In Ziel-Ort zusammenführen') as HTMLButtonElement;

    // Kein Ziel gewählt -> Button ist deaktiviert (kanonischer Weg, kein zweiter Pfad).
    expect(mergeBtn.disabled).toBe(true);
    expect(mergeSpy).not.toHaveBeenCalled();
  });

  it('bietet auch bei sehr vielen übrigen Orten alle als Ziel-Kandidaten an (TST-7 Überlauf-Fall)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P0@', place('@P0@', { title: 'Ochtrup' }));
    for (let i = 1; i <= 60; i += 1) {
      db.placeObjects.set(`@P${i}@`, place(`@P${i}@`, { title: `Ort ${i}` }));
    }
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P0@');

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.click(screen.getByLabelText('Ziel-Ort für Merge'));

    // Ergebnisliste ist gekappt (MAX_VISIBLE_RESULTS), Hinweistext zeigt den Rest —
    // der aktuelle Ort selbst ist unter den sichtbaren Kandidaten nicht dabei.
    const results = document.querySelectorAll('.stb-picker__result-name');
    expect(results.length).toBeLessThan(60);
    expect(screen.getByText(/weitere/)).toBeTruthy();
    expect(screen.queryByText('Ochtrup', { selector: '.stb-picker__result-name' })).toBeNull();
  });
});

describe('PlaceDetail — String→PlaceObject verknüpfen', () => {
  it('verknüpft ein Event per Klick auf "Verknüpfen" und aktualisiert die Ansicht', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    person.death.place = 'Ochtrup';
    db.individuals.set('@I1@', person);
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });
    expect(screen.getByText(/Nicht verknüpfte Ereignisse/)).toBeTruthy();

    await fireEvent.click(screen.getByText('Verknüpfen'));

    // Copy-on-Write (ADR-v9-92): das Kommando ersetzt den Owner, die beim Seeding
    // gehaltene Referenz ist danach veraltet — im AKTUELLEN Stand nachsehen.
    expect(appState.db.individuals.get('@I1@')!.death.placeId).toBe('@P1@');
    expect(screen.queryByText(/Nicht verknüpfte Ereignisse/)).toBeNull();
  });
});

describe('PlaceDetail — Anzeige/Bearbeitung strukturell getrennt (ADR-v9-30 Punkt 5)', () => {
  it('zeigt Namensvarianten/Verwaltungszugehörigkeit als reine Lese-Darstellung ohne Mutations-Controls außerhalb des Bearbeiten-Modus', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Kreis Steinfurt' }));
    db.placeObjects.set(
      '@P1@',
      place('@P1@', {
        title: 'Ochtrup',
        pnames: [{ value: 'Ochtrupp', from: null, to: null }],
        enclosedBy: [{ placeId: '@P2@', from: null, to: null }],
      }),
    );
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    const { container } = render(PlaceDetail, { props: { appState, viewState } });

    // Lese-Darstellung bleibt sichtbar: Verwaltungskette (jetzt Segmente, ADR-v9-78 Punkt
    // 3 — der eigene Ort bleibt reiner Text, der Elternteil ist ein Link) + Namens-Pille
    // (ohne Remove).
    const chainEl = container.querySelector('.place-detail__chain') as HTMLElement;
    expect(chainEl.textContent).toContain('Ochtrup');
    expect(chainEl.textContent).toContain('Kreis Steinfurt');
    expect(within(chainEl).getByText('Ochtrup').tagName).toBe('SPAN');
    expect(within(chainEl).getByText('Kreis Steinfurt').tagName).toBe('BUTTON');
    expect(screen.getByText('Ochtrupp')).toBeTruthy();
    // Aber keine Mutations-Controls außerhalb des Bearbeiten-Modus.
    expect(container.querySelector('.place-detail__remove-btn')).toBeNull();
    expect(container.querySelector('.stb-pill__remove')).toBeNull();
    expect(container.querySelector('.place-detail__add-row')).toBeNull();
    expect(screen.queryByLabelText('Neue Namensvariante')).toBeNull();
    expect(screen.queryByLabelText('Übergeordneter Ort')).toBeNull();
    expect(screen.queryByLabelText('Ziel-Ort für Merge')).toBeNull();

    expect(container.querySelector('.place-detail__form')).toBeNull();
  });

  it('blendet die Mutations-Controls nach Klick auf "✎ Bearbeiten" wieder ein', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Kreis Steinfurt' }));
    db.placeObjects.set(
      '@P1@',
      place('@P1@', {
        title: 'Ochtrup',
        pnames: [{ value: 'Ochtrupp', from: null, to: null }],
        enclosedBy: [{ placeId: '@P2@', from: null, to: null }],
      }),
    );
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    const { container } = render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));

    // Namens-Varianten/Merge bleiben im bestehenden inline-Bearbeiten-Toggle. Die
    // bestehende Variante ist dort seit ADR-v9-183 eine änderbare Zeile mit Entfernen-
    // Knopf (vorher: Pille mit `.stb-pill__remove`).
    expect(container.querySelector('.place-detail__edit-remove')).toBeTruthy();
    expect((screen.getByLabelText('Namensvariante 1') as HTMLInputElement).value).toBe('Ochtrupp');
    expect(screen.getByLabelText('Neue Namensvariante')).toBeTruthy();
    expect(screen.getByLabelText('Ziel-Ort für Merge')).toBeTruthy();
  });

  it('"Zugehörigkeit bearbeiten" öffnet das PlaceEnclosureEditModal unabhängig vom inline-Bearbeiten-Toggle (direkte Zuordnung wandert ins Modal)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Kreis Steinfurt' }));
    db.placeObjects.set(
      '@P1@',
      place('@P1@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@P2@', from: null, to: null }] }),
    );
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });

    // Kein inline-Bearbeiten nötig — der Modal-Öffner steht unabhängig davon bereit.
    expect(screen.queryByLabelText('Übergeordneter Ort')).toBeNull();
    await fireEvent.click(screen.getByText('Zugehörigkeit bearbeiten'));

    expect(screen.getByLabelText('Übergeordneter Ort')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Verwaltungszugehörigkeit bearbeiten' })).toBeTruthy();
  });
});

describe('PlaceDetail — leere Namens-Varianten verschwinden vollständig (Spec 21 §10f/g)', () => {
  it('zeigt WEDER "Namens-Varianten"-Überschrift NOCH eine "Keine Namensvarianten"-Zeile ohne pnames, außerhalb des Bearbeiten-Modus', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });

    expect(screen.queryByText('Namens-Varianten')).toBeNull();
    expect(screen.queryByText(/Keine Namensvarianten/)).toBeNull();
  });

  it('nennt die Überschrift nur noch "Namens-Varianten", ohne "(Herkunfts-Pillen)"-Jargon', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set(
      '@P1@',
      place('@P1@', { title: 'Sassenberg', pnames: [{ value: 'Sassenbergk', from: null, to: null }] }),
    );
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });

    expect(screen.getByText('Namens-Varianten')).toBeTruthy();
    expect(screen.queryByText(/Herkunfts-Pillen/)).toBeNull();
  });
});

describe('PlaceDetail — Verwaltungszugehörigkeit: kompakte Labels + Info-Affordance (Spec 21 §10g)', () => {
  it('zeigt kompakte Labels statt der früheren Fließtext-Sätze', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@KREIS@', place('@KREIS@', { title: 'Kreis Steinfurt' }));
    db.placeObjects.set(
      '@P1@',
      place('@P1@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@KREIS@', from: 1816, to: null }] }),
    );
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });

    expect(screen.getByText('Aktuell:')).toBeTruthy();
    expect(screen.getByText('Zugehörigkeit nach Jahr (volle Kette):')).toBeTruthy();
    // Die zunächst zusätzlich gebaute, nur-direkter-Elternteil-Zeitraum-Ansicht wurde
    // als redundant zur vollen Kette wieder entfernt (Nachtrag ADR-v9-75).
    expect(screen.queryByText('Verwaltungsgeschichte:')).toBeNull();
    expect(screen.queryByText('Direkt zugeordnet:')).toBeNull();
    expect(screen.queryByText(/berechnet aus den Zugehörigkeiten unten/)).toBeNull();
    expect(screen.queryByText(/ihre eigene weitere Zugehörigkeit wird bei ihnen selbst gepflegt/)).toBeNull();
  });

  it('bietet ein ⓘ-Affordance neben der Überschrift mit der vollen Erklärung', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    const { container } = render(PlaceDetail, { props: { appState, viewState } });

    const infoIcon = container.querySelector('.place-detail__info-icon');
    expect(infoIcon).toBeTruthy();
    // Tooltip-Text liegt jetzt auf aria-label (geteilte tooltip-Action statt nativem title).
    expect(infoIcon?.getAttribute('aria-label')).toContain('volle Verwaltungskette');
  });
});

describe('PlaceDetail — Ereigniszeilen zeigen NICHT die eigene Ortskette (Spec 21 §10h)', () => {
  it('zeigt bei "Ereignisse nach Typ" nur Name + Jahr, nicht die volle enclosedBy-Kette dieser Seite', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@KREIS@', place('@KREIS@', { title: 'Kreis Steinfurt' }));
    db.placeObjects.set(
      '@P1@',
      place('@P1@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@KREIS@', from: null, to: null }] }),
    );
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    person.birth.placeId = '@P1@';
    person.birth.date = '1 JAN 1900';
    db.individuals.set('@I1@', person);
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    const { container } = render(PlaceDetail, { props: { appState, viewState } });

    expect(screen.getByText('1900')).toBeTruthy();
    expect(screen.queryByText(/1900, Ochtrup/)).toBeNull();
    // "Kreis Steinfurt" darf nur einmal auftauchen (in der Verwaltungszugehörigkeit oben,
    // als Teil der Ketten-Anzeige), nicht ein zweites Mal in der Ereigniszeile.
    const chainEl = container.querySelector('.place-detail__chain') as HTMLElement;
    expect(chainEl.textContent).toContain('Ochtrup');
    expect(chainEl.textContent).toContain('Kreis Steinfurt');
    const eventSection = screen.getByText('Ereignisse nach Typ').closest('section');
    expect(eventSection?.textContent).not.toContain('Kreis Steinfurt');
  });
});

describe('PlaceDetail — Quellen als §N-Badges (Spec 21 §10i, INV-UI-4)', () => {
  it('rendert die Quellen als SourceBadge (§N + QUAY-Farbklasse) statt als reinen Text', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@'));
    const person = makePerson('@I1@');
    person.birth.placeId = '@P1@';
    person.birth.citations.push(makeCitation('@S42@', { quay: 3 }));
    db.individuals.set('@I1@', person);
    db.sources.set('@S42@', makeSource('@S42@', { abbr: 'KB Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    const { container } = render(PlaceDetail, { props: { appState, viewState } });

    // Das Zitat erscheint zweimal (Spec 21 §10h: pro Ereigniszeile UND — dedupliziert —
    // in der zusammenfassenden Quellen-Sektion). Auf die Quellen-Sektion scopen.
    const citationsSection = container.querySelector('.place-detail__citations') as HTMLElement;
    const label = within(citationsSection).getByText('KB Ochtrup');
    expect(label.closest('.src-badge')?.querySelector('.quay-meter')?.getAttribute('data-quay')).toBe('3');
  });
});

describe('PlaceDetail — gemeinsame Detail-Kopfzeile (Spec 21 §6b, INV-UI-4)', () => {
  it('"← Zurück" und "✎ Bearbeiten" stehen in derselben Kopfzeile, Titel in eigener Zeile darunter', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup', type: 'Village' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');
    const onBack = vi.fn();

    const { container } = render(PlaceDetail, { props: { appState, viewState, onBack } });

    const row = container.querySelector('.detail-header__row');
    const title = container.querySelector('.detail-header__title');
    expect(row?.contains(screen.getByText('← Zurück'))).toBe(true);
    expect(row?.contains(screen.getByText('✎ Bearbeiten'))).toBe(true);
    expect(title?.textContent).toBe('Ochtrup');
    expect(row?.contains(title)).toBe(false);

    await fireEvent.click(screen.getByText('← Zurück'));
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe('PlaceDetail — Kettenglieder klickbar (ADR-v9-78 Punkt 3)', () => {
  it('navigiert per Klick auf ein Kettenglied der "Aktuell:"-Kette zum jeweiligen Vorfahr-Ort', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@KREIS@', place('@KREIS@', { title: 'Kreis Steinfurt' }));
    db.placeObjects.set(
      '@P1@',
      place('@P1@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@KREIS@', from: null, to: null }] }),
    );
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('Kreis Steinfurt'));

    expect(viewState.getCurrent('place')).toBe('@KREIS@');
  });

  it('rendert das Segment, das auf den GERADE ANGEZEIGTEN Ort zeigt, als reinen Text (kein Selbst-Link)', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@KREIS@', place('@KREIS@', { title: 'Kreis Steinfurt' }));
    db.placeObjects.set(
      '@P1@',
      place('@P1@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@KREIS@', from: null, to: null }] }),
    );
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    const { container } = render(PlaceDetail, { props: { appState, viewState } });

    const chainEl = container.querySelector('.place-detail__chain') as HTMLElement;
    const selfSeg = within(chainEl).getByText('Ochtrup');
    expect(selfSeg.tagName).toBe('SPAN');
    expect(selfSeg.className).toContain('place-detail__chain-seg--self');
    const parentSeg = within(chainEl).getByText('Kreis Steinfurt');
    expect(parentSeg.tagName).toBe('BUTTON');
  });

  it('zeigt eine echte Verwaltungslücke weiterhin als "unbekannt"-Zeile (keine Segmente, kein Button)', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set(
      '@GRAF@',
      place('@GRAF@', {
        title: 'Grafschaft Steinfurt',
        pnames: [{ value: 'Grafschaft Steinfurt (Spätform)', from: 1814, to: null }],
      }),
    );
    db.placeObjects.set('@AMT@', place('@AMT@', { title: 'Amt Ochtrup' }));
    db.placeObjects.set(
      '@P1@',
      place('@P1@', {
        title: 'Ochtrup',
        enclosedBy: [
          { placeId: '@GRAF@', from: 1300, to: 1813 },
          { placeId: '@AMT@', from: 1816, to: null },
        ],
      }),
    );
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });

    expect(screen.getByText('unbekannt')).toBeTruthy();
  });

  it('zeigt den Abschnitts-Hinweis "?" für eine an einer höheren Ebene abgeschnittene Kette (truncated)', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@LAND1@', place('@LAND1@', { title: 'Preußen' }));
    db.placeObjects.set('@LAND2@', place('@LAND2@', { title: 'Nordrhein-Westfalen' }));
    db.placeObjects.set(
      '@KREIS@',
      place('@KREIS@', {
        title: 'Kreis Steinfurt',
        // Echte Lücke in der KREIS-eigenen Zugehörigkeit (1851–1852) — die eigene
        // Zuordnung von Ochtrup zum KREIS bleibt davon unberührt (durchgängig offen).
        enclosedBy: [
          { placeId: '@LAND1@', from: 1816, to: 1850 },
          { placeId: '@LAND2@', from: 1853, to: null },
        ],
        // Erzeugt ein Schlüsseljahr GENAU in der Lücke, damit eine Zeile dort entsteht.
        pnames: [{ value: 'Kreis Steinfurt (Var)', from: 1851, to: null }],
      }),
    );
    db.placeObjects.set(
      '@P1@',
      place('@P1@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@KREIS@', from: 1816, to: null }] }),
    );
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    const { container } = render(PlaceDetail, { props: { appState, viewState } });

    const timelineList = container.querySelector('.place-detail__timeline-list') as HTMLElement;
    expect(timelineList).toBeTruthy();
    expect(within(timelineList).getByText('?')).toBeTruthy();
  });
});

describe('PlaceDetail — Gruppen-Zustand beim Ortswechsel (ADR-v9-78 Punkte 3+6, Integrationslücke)', () => {
  // Regression: Punkt 3 (klickbare Kettenglieder) und Punkt 6 (einklappbare/paginierte
  // Gruppen in EventsByType) wurden von zwei parallelen Agenten gebaut, jeder für sich
  // grün. Erst zusammen entsteht der Fall: ein Kettenglied-Klick wechselt den Ort, OHNE
  // dass PlaceDetail (und damit die EventsByType-Instanz) neu gemountet wird — ohne
  // `resetKey` trüge der neue Ort den Einklapp-/Paginierungs-Zustand des vorherigen
  // weiter (gleicher Gruppenschlüssel, z. B. "Geburt"). Genau der Fall, vor dem
  // CLAUDE.md warnt: zwei Hälften einer Schnittstelle, jede isoliert korrekt.
  it('setzt den Einklapp-Zustand beim Wechsel zu einem anderen Ort zurück (resetKey)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Rheine' }));
    // Je EIN Geburts-Ereignis pro Ort — dieselbe Gruppe ("Geburt (1)") an beiden Orten.
    const a = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    a.birth.placeId = '@P1@';
    db.individuals.set('@I1@', a);
    const b = makePerson('@I2@', { given: 'Emma', surname: 'Meier' });
    b.birth.placeId = '@P2@';
    db.individuals.set('@I2@', b);
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });

    // Am ersten Ort die Gruppe explizit einklappen (Header ist das Klick-Ziel).
    await fireEvent.click(screen.getByText('Geburt (1)'));
    expect(screen.queryByText('Otto Bauer')).toBeNull();

    // Ortswechsel OHNE Unmount (exakt das, was ein Kettenglied-Klick auslöst).
    viewState.setCurrent('place', '@P2@');
    await tick();

    // Der neue Ort startet mit aufgeklappter Gruppe — kein Zustands-Leck vom Vorgänger.
    expect(screen.getByText('Geburt (1)')).toBeTruthy();
    expect(screen.getByText('Emma Meier')).toBeTruthy();
  });
});

describe('PlaceDetail — Ortszeitgenossen (Spec 20 §1.7 [S], ADR-v9-78 Punkt 5)', () => {
  function dbWithPlaceHofAndPeople() {
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.hofObjects.set('@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));

    const direct = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    direct.birth.placeId = '@P1@';
    direct.birth.date = '1 JAN 1900';
    db.individuals.set('@I1@', direct);

    const onHof = makePerson('@I2@', { given: 'Anna', surname: 'Meyer' });
    onHof.birth.hofId = '@H1@';
    onHof.birth.placeId = '@P1@';
    onHof.birth.date = '1 JAN 1905';
    db.individuals.set('@I2@', onHof);

    return db;
  }

  /** Scopt Queries auf die Ortszeitgenossen-Sektion — "Otto Bauer"/"Anna Meyer" tauchen
   *  ABSICHTLICH auch in "Ereignisse nach Typ" auf (dieselben Events sind Teil von
   *  buildPlaceDetail.eventsByType); ein globales `screen.getByText` wäre daher mehrdeutig. */
  function contemporariesSection(container: HTMLElement): HTMLElement {
    const heading = within(container).getByText('Ortszeitgenossen');
    return heading.closest('section') as HTMLElement;
  }

  it('ist VOR dem Öffnen weder berechnet noch gerendert (On-Demand, kein Hof-Bezug sichtbar)', () => {
    const appState = createAppState();
    const db = dbWithPlaceHofAndPeople();
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    const { container } = render(PlaceDetail, { props: { appState, viewState } });
    const section = contemporariesSection(container);

    expect(within(section).getByText('Ortszeitgenossen anzeigen')).toBeTruthy();
    // "Wall 33" (der Hof-Name) taucht NIRGENDS außer in der Ortszeitgenossen-Sektion auf —
    // ein sicherer Beleg, dass vor dem Öffnen nichts aus buildPlaceContemporaries gerendert
    // wurde (nicht nur "keine Personen sichtbar", sondern: die Berechnung lief nicht).
    expect(within(section).queryByText('Wall 33')).toBeNull();
    expect(screen.queryByText('Wall 33')).toBeNull();
  });

  it('öffnet die Sektion per Klick und zeigt sowohl das direkte Orts-Ereignis als auch das Hof-Ereignis', async () => {
    const appState = createAppState();
    const db = dbWithPlaceHofAndPeople();
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    const { container } = render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(within(contemporariesSection(container)).getByText('Ortszeitgenossen anzeigen'));

    const section = contemporariesSection(container);
    expect(within(section).getByText('Otto Bauer')).toBeTruthy();
    expect(within(section).getByText('Anna Meyer')).toBeTruthy();
    // Hof-Zuordnung über villageId sichtbar (Rollen-Label-Stil, INV-UI-4).
    expect(within(section).getByText('Wall 33')).toBeTruthy();
    expect(within(section).getByText('Ortszeitgenossen ausblenden')).toBeTruthy();
  });

  it('Klick auf einen Personennamen navigiert (Cross-Tab, wie überall sonst)', async () => {
    const onNavigateToPerson = vi.fn();
    const appState = createAppState();
    const db = dbWithPlaceHofAndPeople();
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    const { container } = render(PlaceDetail, { props: { appState, viewState, onNavigateToPerson } });
    await fireEvent.click(within(contemporariesSection(container)).getByText('Ortszeitgenossen anzeigen'));
    const section = contemporariesSection(container);
    await fireEvent.click(within(section).getByText('Otto Bauer'));

    expect(onNavigateToPerson).toHaveBeenCalledWith('@I1@');
  });

  it('Moduswechsel (Jahrzehnt/Hof/Chronologisch) gruppiert um', async () => {
    const appState = createAppState();
    const db = dbWithPlaceHofAndPeople();
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    const { container } = render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(within(contemporariesSection(container)).getByText('Ortszeitgenossen anzeigen'));
    const section = contemporariesSection(container);

    // Default: nach Jahrzehnt.
    expect(within(section).getByText('1900er (2)')).toBeTruthy();

    await fireEvent.click(within(section).getByText('Nach Hof'));
    expect(within(section).getByText('Direkt am Ort (1)')).toBeTruthy();
    expect(within(section).getByText('Wall 33 (1)')).toBeTruthy();
    expect(within(section).queryByText(/1900er/)).toBeNull();

    await fireEvent.click(within(section).getByText('Chronologisch'));
    expect(within(section).getByText('Chronologisch (2)')).toBeTruthy();
    expect(within(section).queryByText(/Direkt am Ort/)).toBeNull();
  });

  it('resetKey umfasst Ort UND Modus (nicht nur Ort) — jeder Modus bekommt einen eigenen Einklapp-/Paginierungs-Namensraum', async () => {
    // Direkter Beleg statt eines konstruierten Auto-Einklapp-Grenzfalls: EventsByType
    // schlüsselt seinen internen Zustand über `${resetKey}::${type}` in die
    // `aria-controls`-id des Gruppen-Headers ein (event-grouping.ts/EventsByType.svelte,
    // ADR-v9-78 Punkt 6) — die id muss daher SOWOHL placeId ALS AUCH den aktuellen Modus
    // enthalten, sonst kollidiert der Zustands-Namensraum zweier Modi mit gleichnamigen
    // Gruppen (genau der Integrationsfehler, den PlaceDetail beim Kettenglied-Klick schon
    // einmal für den Ort-Wechsel selbst hatte).
    const appState = createAppState();
    const db = dbWithPlaceHofAndPeople();
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    const { container } = render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(within(contemporariesSection(container)).getByText('Ortszeitgenossen anzeigen'));
    let section = contemporariesSection(container);

    const decadeHeader = within(section).getByText('1900er (2)');
    const decadeControls = decadeHeader.getAttribute('aria-controls')!;
    expect(decadeControls).toContain('P1');
    expect(decadeControls).toContain('decade');

    await fireEvent.click(within(section).getByText('Chronologisch'));
    section = contemporariesSection(container);
    const chronoHeader = within(section).getByText('Chronologisch (2)');
    const chronoControls = chronoHeader.getAttribute('aria-controls')!;
    expect(chronoControls).toContain('P1');
    expect(chronoControls).toContain('chrono');
    // Zwei verschiedene Modi desselben Orts erzeugen zwei verschiedene Zustands-ids.
    expect(chronoControls).not.toBe(decadeControls);
  });

  it('Zeitgenossen-Filter ist per Default AUS — alle Personen sichtbar, auch weit auseinanderliegende Jahre', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    const early = makePerson('@I1@', { given: 'Früh', surname: 'Person' });
    early.birth.placeId = '@P1@';
    early.birth.date = '1 JAN 1800';
    db.individuals.set('@I1@', early);
    const late = makePerson('@I2@', { given: 'Spät', surname: 'Person' });
    late.birth.placeId = '@P1@';
    late.birth.date = '1 JAN 1980';
    db.individuals.set('@I2@', late);
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    const { container } = render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(within(contemporariesSection(container)).getByText('Ortszeitgenossen anzeigen'));
    const section = contemporariesSection(container);
    await fireEvent.click(within(section).getByText('Chronologisch')); // eine Gruppe, einfacher zu prüfen

    expect(within(section).getByText('Früh Person')).toBeTruthy();
    expect(within(section).getByText('Spät Person')).toBeTruthy();
  });

  it('aktivierter Zeitgenossen-Filter grenzt auf das Jahresfenster ein und wirft undatierte Zeilen raus', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    const inWindow = makePerson('@I1@', { given: 'Im', surname: 'Fenster' });
    inWindow.birth.placeId = '@P1@';
    inWindow.birth.date = '1 JAN 1900';
    db.individuals.set('@I1@', inWindow);
    const outWindow = makePerson('@I2@', { given: 'Außerhalb', surname: 'Fenster' });
    outWindow.birth.placeId = '@P1@';
    outWindow.birth.date = '1 JAN 1980';
    db.individuals.set('@I2@', outWindow);
    const undated = makePerson('@I3@', { given: 'Undatierte', surname: 'Person' });
    undated.birth.placeId = '@P1@';
    db.individuals.set('@I3@', undated);
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    const { container } = render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(within(contemporariesSection(container)).getByText('Ortszeitgenossen anzeigen'));
    let section = contemporariesSection(container);
    await fireEvent.click(within(section).getByText('Chronologisch'));

    // Alle drei zunächst sichtbar (Filter aus).
    section = contemporariesSection(container);
    expect(within(section).getByText('Im Fenster')).toBeTruthy();
    expect(within(section).getByText('Außerhalb Fenster')).toBeTruthy();
    expect(within(section).getByText('Undatierte Person')).toBeTruthy();

    await fireEvent.click(within(section).getByText('Filter'));
    // Der Trigger sitzt in der Sektion, das Panel dahinter hängt seit BL-85 per Portal
    // am <body> — die Feld-Abfrage geht deshalb über `screen`, nicht über die Sektion.
    await fireEvent.click(screen.getByLabelText('Zeitgenossen-Filter aktivieren'));
    await fireEvent.input(screen.getByLabelText('Referenzjahr'), { target: { value: '1900' } });
    await fireEvent.input(screen.getByLabelText('Fensterbreite in Jahren'), { target: { value: '10' } });

    section = contemporariesSection(container);
    expect(within(section).getByText('Im Fenster')).toBeTruthy();
    expect(within(section).queryByText('Außerhalb Fenster')).toBeNull();
    expect(within(section).queryByText('Undatierte Person')).toBeNull();
  });
  // Befund der eigenen Browser-Verifikation 2026-07-16 (Screenshot, 375px): im Hof-Modus
  // trug JEDE der 8 Zeilen unter dem Header "Altmetelener Weg 46 (8)" nochmal die Pille
  // "Altmetelener Weg 46" — achtmal dieselbe Information, die der Gruppen-Header bereits
  // sagt, und genau dadurch brachen die Zeilen auf der mobilen Zielbreite um. Spec 21
  // §10h ("eine Zeile wiederholt niemals die Identität, die der Kontext schon trägt"),
  // hier auf Gruppen- statt Seitenebene. In den ANDEREN Modi (Jahrzehnt/Chronologisch)
  // ist die Hof-Pille dagegen die einzige Quelle dieser Information — dort MUSS sie
  // bleiben; genau diese Asymmetrie sichert dieser Test in beide Richtungen ab.
  it('zeigt die Hof-Pille im Jahrzehnt-Modus, unterdrueckt sie aber im Hof-Modus', async () => {
    const appState = createAppState();
    const db = dbWithPlaceHofAndPeople();
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    const { container } = render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(within(contemporariesSection(container)).getByText('Ortszeitgenossen anzeigen'));
    const section = contemporariesSection(container);

    // Jahrzehnt-Modus: die Zeile ist der EINZIGE Ort, der den Hof nennt — Pille da.
    const pillsInDecadeMode = section.querySelectorAll('.stb-pill');
    expect(pillsInDecadeMode.length).toBe(1);
    expect(pillsInDecadeMode[0].textContent).toContain('Wall 33');

    // Hof-Modus: der Gruppen-Header nennt den Hof bereits — keine Pille je Zeile mehr.
    await fireEvent.click(within(section).getByText('Nach Hof'));
    expect(within(section).getByText('Wall 33 (1)')).toBeTruthy(); // Header traegt die Identitaet
    expect(section.querySelectorAll('.stb-pill').length).toBe(0);
  });
});

// ADR-v9-183 / BL-251 — Nutzerbefund „die zeitliche Gültigkeit von Ortsnamen wird weder
// angezeigt noch ist sie editierbar". Die Datierung stand ausschließlich in einem
// `use:tooltip` — auf einem Touchgerät gibt es sie damit gar nicht.
describe('PlaceDetail — Gültigkeit der Namensvarianten (ADR-v9-183)', () => {
  function ochtrup() {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set(
      '@P1@',
      place('@P1@', {
        title: 'Ochtrup',
        pnames: [
          { value: 'Ochtorpe', from: null, to: 1400 },
          { value: 'Ochtrup', from: 1400, to: null },
        ],
      }),
    );
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');
    return { appState, viewState };
  }

  it('zeigt den Zeitraum im SICHTBAREN Text der Pille, nicht nur im Tooltip', () => {
    const { appState, viewState } = ochtrup();

    const { container } = render(PlaceDetail, { props: { appState, viewState } });

    const pillen = Array.from(container.querySelectorAll('.stb-pill')).map((el) =>
      el.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(pillen).toEqual(['Ochtorpe bis 1400', 'Ochtrup ab 1400']);
  });

  it('macht eine bestehende Variante im Bearbeiten-Modus änderbar (Wert)', async () => {
    const { appState, viewState } = ochtrup();

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.change(screen.getByLabelText('Namensvariante 1'), { target: { value: 'Ochtorp' } });

    expect(appState.db.placeObjects.get('@P1@')?.pnames[0]).toEqual({
      value: 'Ochtorp',
      from: null,
      to: 1400,
    });
  });

  it('macht den Zeitraum einer bestehenden Variante änderbar, ohne den Wert zu verlieren', async () => {
    const { appState, viewState } = ochtrup();

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.change(screen.getByLabelText('Namensvariante 1 — gültig bis (Jahr)'), {
      target: { value: '1380' },
    });

    expect(appState.db.placeObjects.get('@P1@')?.pnames[0]).toEqual({
      value: 'Ochtorpe',
      from: null,
      to: 1380,
    });
  });

  it('lässt ein geleertes Jahresfeld als „offen" durch (null, nicht 0)', async () => {
    const { appState, viewState } = ochtrup();

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.change(screen.getByLabelText('Namensvariante 2 — gültig von (Jahr)'), {
      target: { value: '' },
    });

    expect(appState.db.placeObjects.get('@P1@')?.pnames[1].from).toBeNull();
  });

  it('behält die Reihenfolge — die Änderung ersetzt den Eintrag, sie hängt keinen neuen an', async () => {
    const { appState, viewState } = ochtrup();

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.change(screen.getByLabelText('Namensvariante 1'), { target: { value: 'Ochtorp' } });

    expect(appState.db.placeObjects.get('@P1@')?.pnames.map((p) => p.value)).toEqual([
      'Ochtorp',
      'Ochtrup',
    ]);
  });
});

// ADR-v9-191 / BL-265 — die geerbte Verwaltungshistorie steht unter ihrem eigenen Namen.
describe('PlaceDetail — geerbte Verwaltungshistorie gehört dem Elternort (ADR-v9-191)', () => {
  /** Realfall (Erkelsdorf): der Ort hängt undatiert an einem Elter, dessen eigene
   *  Geschichte alle Schlüsseljahre stellt. */
  function renderErkelsdorf(): void {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@HRR@', place('@HRR@', { title: 'Heiliges Römisches Reich' }));
    db.placeObjects.set('@REICH@', place('@REICH@', { title: 'Deutsches Reich' }));
    db.placeObjects.set(
      '@BAYERN@',
      place('@BAYERN@', {
        title: 'Bayern',
        enclosedBy: [
          { placeId: '@HRR@', from: 1180, to: 1805 },
          { placeId: '@REICH@', from: 1871, to: null },
        ],
      }),
    );
    db.placeObjects.set(
      '@OPF@',
      place('@OPF@', { title: 'Oberpfalz', enclosedBy: [{ placeId: '@BAYERN@', from: 1180, to: null }] }),
    );
    db.placeObjects.set(
      '@ERK@',
      place('@ERK@', { title: 'Erkelsdorf', enclosedBy: [{ placeId: '@OPF@', from: null, to: null }] }),
    );
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@ERK@');
    render(PlaceDetail, { props: { appState, viewState } });
  }

  it('setzt die geerbten Jahres-Zeilen unter eine eigene Überschrift, nicht unter „Zugehörigkeit nach Jahr"', () => {
    renderErkelsdorf();

    expect(screen.getByText('Geschichte der übergeordneten Ebenen')).toBeTruthy();
    // Die Jahres-Überschrift, unter der dieselben Zeilen bis ADR-v9-191 als Historie
    // DIESES Orts standen, darf hier nicht auftauchen.
    expect(screen.queryByText('Zugehörigkeit nach Jahr (volle Kette):')).toBeNull();
    // Die Information selbst bleibt sichtbar (verworfene Alternative (f)).
    expect(screen.getByText('ab 1180')).toBeTruthy();
    expect(screen.getByText('ab 1871')).toBeTruthy();
  });

  it('behauptet für einen undatiert zugeordneten Ort keine eigene Datierung', () => {
    renderErkelsdorf();

    const eigene = screen.getByText('Eigene Zugehörigkeit:').parentElement!;
    const zeile = within(eigene).getByText('undatiert').parentElement!;
    expect(zeile.textContent).toContain('Oberpfalz');
    expect(zeile.textContent).not.toMatch(/\d{3,4}/);
  });

  it('meldet NICHT „Keine übergeordnete Zugehörigkeit erfasst", wenn eine undatierte erfasst ist', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@KREIS@', place('@KREIS@', { title: 'Kreis Steinfurt' }));
    db.placeObjects.set(
      '@P1@',
      place('@P1@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@KREIS@', from: null, to: null }] }),
    );
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });

    // Die Zeitleiste bleibt hier bewusst leer (sie verdoppelte sonst nur die „Aktuell:"-
    // Kette) — der frühere Else-Zweig log dabei: erfasst IST eine Zuordnung, nur ohne Datum.
    expect(screen.queryByText('Keine übergeordnete Zugehörigkeit erfasst.')).toBeNull();
    expect(screen.getByText('Aktuell:')).toBeTruthy();
  });

  it('sagt „Keine übergeordnete Zugehörigkeit erfasst", wenn wirklich keine erfasst ist', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });

    expect(screen.getByText('Keine übergeordnete Zugehörigkeit erfasst.')).toBeTruthy();
  });
});

// ADR-v9-191 / BL-266 — der „geprüft"-Schalter ist der EINZIGE Weg zum Marker.
describe('PlaceDetail — Prüf-Marker (ADR-v9-191)', () => {
  function setup(reviewedAt?: number | null) {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup', reviewedAt }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');
    render(PlaceDetail, { props: { appState, viewState } });
    return appState;
  }

  it('setzt den Marker per Klick und beschriftet beide Zustände mit eigenem TEXT (nicht nur Farbe)', async () => {
    const appState = setup();

    const knopf = screen.getByText('Geprüft markieren');
    expect(knopf.getAttribute('aria-pressed')).toBe('false');
    await fireEvent.click(knopf);

    const pl = appState.db.placeObjects.get('@P1@')!;
    expect(pl.reviewedAt).toBeTypeOf('number');
    // Zweiter Zustand trägt sein eigenes Wort samt Datum — auf dem Telefon ist eine
    // Füllung allein kein Kanal (Spec 21 §2).
    const heute = new Date(pl.reviewedAt as number).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
    expect(screen.getByText(`✓ Geprüft ${heute}`)).toBeTruthy();
    expect(screen.queryByText('Geprüft markieren')).toBeNull();
  });

  it('nimmt den Marker beim zweiten Klick zurück (INV-UI-10: ebenso leichte Rücknahme)', async () => {
    const appState = setup(1_700_000_000_000);

    const heute = new Date(1_700_000_000_000).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
    await fireEvent.click(screen.getByText(`✓ Geprüft ${heute}`));

    expect(appState.db.placeObjects.get('@P1@')!.reviewedAt).toBeNull();
    expect(screen.getByText('Geprüft markieren')).toBeTruthy();
  });

  it('ist ohne den Editor erreichbar — „angesehen, nichts zu ergänzen" öffnet kein Formular', () => {
    setup();

    // Der Knopf steht neben „✎ Bearbeiten", nicht darin: genau der Fall, der den Marker
    // nötig macht, ist der, in dem niemand den Editor öffnet.
    expect(screen.getByText('Geprüft markieren')).toBeTruthy();
    expect(screen.getByText('✎ Bearbeiten')).toBeTruthy();
  });
});

// --- INV-UI-16: „Verwerfen" betrifft die Feldwerte, nicht die Sitzung ----------------
// (Spec 21 §6m, ADR-v9-193, BL-270). Die zweite Zusicherung ist die eigentliche: sie
// unterscheidet ein ehrliches „Verwerfen" vom alten „Abbrechen", das eine Rücknahme
// suggerierte, die es nie leistete — die Namensvariante daneben ist längst geschrieben.
describe('PlaceDetail — Transaktionsgrenze (INV-UI-16)', () => {
  it('„Verwerfen" setzt das Feld zurück, hält den Modus offen und lässt die sofort committete Namensvariante stehen', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));

    await fireEvent.input(screen.getByLabelText('Neue Namensvariante'), { target: { value: 'Ochtorp' } });
    await fireEvent.click(screen.getByText('+ Hinzufügen'));
    expect(appState.db.placeObjects.get('@P1@')?.pnames.some((p) => p.value === 'Ochtorp')).toBe(true);

    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'FALSCH' } });
    await fireEvent.click(screen.getByText('Verwerfen'));

    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Ochtrup');
    expect(screen.getByText('Fertig')).toBeTruthy();
    expect(screen.queryByText('✎ Bearbeiten')).toBeNull();
    expect(appState.db.placeObjects.get('@P1@')?.pnames.some((p) => p.value === 'Ochtorp')).toBe(true);
  });

  it('„Fertig" schließt den Bearbeiten-Modus', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
    await fireEvent.click(screen.getByText('Fertig'));

    expect(screen.getByText('✎ Bearbeiten')).toBeTruthy();
    expect(screen.queryByText('Speichern')).toBeNull();
  });
});
