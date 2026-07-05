// @vitest-environment happy-dom
// tests/ui/PlaceBootstrap.component.test.ts — "Orte vorschlagen"-Sichtungsdialog als
// Component-Test (Spec 32 §6; Spec 20 §1.7 [K], ADR-v9-27). Deckt Kandidaten-Anzeige,
// Auswahl-Umschaltbarkeit + Bestätigen legt PlaceObjects an + aktualisiert die Liste ab.
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PlaceBootstrap from '../../ui/views/place/PlaceBootstrap.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makePerson } from '../../core/model';

describe('PlaceBootstrap — Kandidaten-Anzeige', () => {
  it('zeigt Titel, Event-Anzahl und Beispiel-Ereignistyp je Kandidat', () => {
    const appState = createAppState();
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    person.birth.place = 'Ochtrup';
    const db = appState.db;
    db.individuals.set('@I1@', person);
    appState.loadDatabase(db, 'test.ged');

    render(PlaceBootstrap, { props: { appState } });

    expect(screen.getByText('Ochtrup')).toBeTruthy();
    expect(screen.getByText(/1 Ereignis.*BIRT/)).toBeTruthy();
  });

  it('zeigt einen Leerzustand, wenn keine unaufgelösten Orte existieren', () => {
    const appState = createAppState();

    render(PlaceBootstrap, { props: { appState } });

    expect(screen.getByText(/Keine unaufgelösten Orte gefunden/)).toBeTruthy();
  });
});

describe('PlaceBootstrap — Auswahl umschaltbar', () => {
  it('Kandidaten sind standardmäßig ausgewählt; Klick auf die Checkbox schaltet um', async () => {
    const appState = createAppState();
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    person.birth.place = 'Ochtrup';
    const db = appState.db;
    db.individuals.set('@I1@', person);
    appState.loadDatabase(db, 'test.ged');

    render(PlaceBootstrap, { props: { appState } });
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    await fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
  });

  it('"Keine auswählen" / "Alle auswählen" schalten die gesamte Liste um', async () => {
    const appState = createAppState();
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    person.birth.place = 'Ochtrup';
    person.death.place = 'Münster';
    const db = appState.db;
    db.individuals.set('@I1@', person);
    appState.loadDatabase(db, 'test.ged');

    render(PlaceBootstrap, { props: { appState } });
    const checkboxes = () => screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes().every((c) => c.checked)).toBe(true);

    await fireEvent.click(screen.getByText('Keine auswählen'));
    expect(checkboxes().every((c) => !c.checked)).toBe(true);

    await fireEvent.click(screen.getByText('Alle auswählen'));
    expect(checkboxes().every((c) => c.checked)).toBe(true);
  });
});

describe('PlaceBootstrap — Bestätigen legt PlaceObjects an', () => {
  it('legt nur ausgewählte Kandidaten als PlaceObject an + zeigt das Ergebnis', async () => {
    const appState = createAppState();
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    person.birth.place = 'Ochtrup';
    person.death.place = 'Münster';
    const db = appState.db;
    db.individuals.set('@I1@', person);
    appState.loadDatabase(db, 'test.ged');

    render(PlaceBootstrap, { props: { appState } });
    // Münster abwählen, Ochtrup behalten.
    const rows = screen.getAllByRole('checkbox') as HTMLInputElement[];
    const muensterRow = screen.getByText('Münster').closest('label')!;
    await fireEvent.click(muensterRow.querySelector('input')!);
    expect(rows.length).toBe(2);

    await fireEvent.click(screen.getByText('Ausgewählte anlegen'));

    expect(screen.getByText(/1 Ort wurde angelegt/)).toBeTruthy();
    expect(screen.getByText(/erneuten Laden der Datei/)).toBeTruthy();

    const placeTitles = Array.from(appState.db.placeObjects.values()).map((p) => p.title);
    expect(placeTitles).toEqual(['Ochtrup']);
  });

  it('"0 Orte ausgewählt" zeigt einen erklärenden Hinweis statt eines falschen Erfolgs', async () => {
    const appState = createAppState();
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    person.birth.place = 'Ochtrup';
    const db = appState.db;
    db.individuals.set('@I1@', person);
    appState.loadDatabase(db, 'test.ged');

    render(PlaceBootstrap, { props: { appState } });
    await fireEvent.click(screen.getByText('Keine auswählen'));
    await fireEvent.click(screen.getByText('Ausgewählte anlegen'));

    expect(screen.getByText(/es wurde nichts angelegt/)).toBeTruthy();
    expect(appState.db.placeObjects.size).toBe(0);
  });
});

describe('PlaceBootstrap — Schließen-Callback', () => {
  it('ruft onClose beim Klick auf', async () => {
    const appState = createAppState();
    let closed = false;

    render(PlaceBootstrap, { props: { appState, onClose: () => (closed = true) } });
    await fireEvent.click(screen.getByText('✕ Schließen'));

    expect(closed).toBe(true);
  });
});
