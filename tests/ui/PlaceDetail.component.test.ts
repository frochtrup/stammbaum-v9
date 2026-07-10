// @vitest-environment happy-dom
// tests/ui/PlaceDetail.component.test.ts — Orts-Steckbrief + Bearbeitung (Spec 32 §6;
// Spec 20 §1.7 [K]). Deckt Ereignis-Gruppierung, Bearbeitung, pnames/enclosedBy-Pflege,
// String→PlaceObject-Verknüpfung als tatsächliches DOM-Rendering ab.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import PlaceDetail from '../../ui/views/place/PlaceDetail.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeDatabase, makePerson, makeCitation, makeSource } from '../../core/model';
import { place } from '../core/places-fixtures';

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

describe('PlaceDetail — Verwaltungszugehörigkeit (enclosedBy) Pflege', () => {
  it('fügt eine neue enclosedBy-Zugehörigkeit über den generischen Picker hinzu', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Kreis Steinfurt' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));

    await fireEvent.click(screen.getByLabelText('Übergeordneter Ort'));
    await fireEvent.click(screen.getByText('Kreis Steinfurt'));

    // Zwei "Gültig von (Jahr)"-Felder existieren (enclosedBy + pnames) — enclosedBy
    // steht als Sektion zuerst im DOM.
    const addRow = screen.getAllByLabelText('Gültig von (Jahr)')[0]!.closest('.place-detail__add-row') as HTMLElement;
    await fireEvent.click(within(addRow).getByText('+ Hinzufügen'));

    expect(appState.db.placeObjects.get('@P1@')?.enclosedBy.map((e) => e.placeId)).toEqual(['@P2@']);
  });

  it('bietet "+ neuen Ort anlegen" im enclosedBy-Picker an (ADR-v9-42, ersetzt die ADR-v9-40-Ausnahme)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Bearbeiten'));
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

    const addRow = screen.getAllByLabelText('Gültig von (Jahr)')[0]!.closest('.place-detail__add-row') as HTMLElement;
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
    const pill = screen.getByText('Ochtrup'); // gefaltete Variante als Pille
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

    expect(person.death.placeId).toBe('@P1@');
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

    // Lese-Darstellung bleibt sichtbar: Verwaltungskette + Namens-Pille (ohne Remove).
    expect(screen.getByText('Kreis Steinfurt')).toBeTruthy();
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

    expect(container.querySelector('.place-detail__remove-btn')).toBeTruthy();
    expect(container.querySelector('.stb-pill__remove')).toBeTruthy();
    expect(screen.getByLabelText('Neue Namensvariante')).toBeTruthy();
    expect(screen.getByLabelText('Übergeordneter Ort')).toBeTruthy();
    expect(screen.getByLabelText('Ziel-Ort für Merge')).toBeTruthy();
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
      place('@P1@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@KREIS@', from: null, to: null }] }),
    );
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('place', '@P1@');

    render(PlaceDetail, { props: { appState, viewState } });

    expect(screen.getByText('Volle Kette:')).toBeTruthy();
    expect(screen.getByText('Direkt zugeordnet:')).toBeTruthy();
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
    expect(infoIcon?.getAttribute('title')).toContain('berechnet aus den Zugehörigkeiten');
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

    render(PlaceDetail, { props: { appState, viewState } });

    expect(screen.getByText('1900')).toBeTruthy();
    expect(screen.queryByText(/1900, Ochtrup/)).toBeNull();
    // "Kreis Steinfurt" darf nur einmal auftauchen (in der Verwaltungszugehörigkeit oben),
    // nicht ein zweites Mal in der Ereigniszeile.
    expect(screen.getAllByText('Kreis Steinfurt')).toHaveLength(1);
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
    const badge = within(citationsSection).getByText('§42');
    expect(badge.className).toContain('src-badge--q3');
  });
});

describe('PlaceDetail — gemeinsame Detail-Kopfzeile (Spec 21 §6b, INV-UI-4)', () => {
  it('"← Zur Liste" und "✎ Bearbeiten" stehen in derselben Kopfzeile, Titel in eigener Zeile darunter', async () => {
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
    expect(row?.contains(screen.getByText('← Zur Liste'))).toBe(true);
    expect(row?.contains(screen.getByText('✎ Bearbeiten'))).toBe(true);
    expect(title?.textContent).toBe('Ochtrup');
    expect(row?.contains(title)).toBe(false);

    await fireEvent.click(screen.getByText('← Zur Liste'));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
