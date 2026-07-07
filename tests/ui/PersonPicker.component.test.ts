// @vitest-environment happy-dom
// tests/ui/PersonPicker.component.test.ts — durchsuchbares Personen-Auswahlfeld (ADR-v9-30
// Punkt 2, Spec 20 §2 "Personen-Picker"). Deckt Filtern (matchesSearch), Auswahl/onChange,
// allowNone, excludeIds sowie die Inline-Neuanlage über PersonForm (onSaved -> onChange mit
// der neuen id, kein Kontextverlust) ab. KEIN <select bind:value> mit fireEvent.change
// (bekannter happy-dom-Bug) — PersonPicker rendert ohnehin Buttons/Listen, kein <select>.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PersonPicker from '../../ui/shell/PersonPicker.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makePerson } from '../../core/model';

function seedThreePersons() {
  const appState = createAppState();
  const db = makeDatabase();
  db.individuals.set('@I1@', makePerson('@I1@', { given: 'Otto', surname: 'Bauer' }));
  db.individuals.set('@I2@', makePerson('@I2@', { given: 'Anna', surname: 'Klein' }));
  db.individuals.set('@I3@', makePerson('@I3@', { given: 'Karl', surname: 'Bauer' }));
  appState.loadDatabase(db, 'test.ged');
  return appState;
}

describe('PersonPicker — Anzeige des Feldes', () => {
  it('zeigt den Platzhalter, solange nichts ausgewählt ist', () => {
    const appState = seedThreePersons();
    render(PersonPicker, { props: { appState, value: null, onChange: vi.fn(), placeholder: 'Person wählen…' } });

    expect(screen.getByText('Person wählen…')).toBeTruthy();
  });

  it('zeigt Name + Geburtsjahr/-ort der aktuell gewählten Person', () => {
    const appState = seedThreePersons();
    const p = appState.db.individuals.get('@I1@')!;
    p.birth.date = '1900';
    appState.savePerson(p);

    render(PersonPicker, { props: { appState, value: '@I1@', onChange: vi.fn() } });

    expect(screen.getByText('Otto Bauer')).toBeTruthy();
    expect(screen.getByText('1900')).toBeTruthy();
  });

  it('zeigt noneLabel statt Platzhalter, wenn allowNone und nichts gewählt ist', () => {
    const appState = seedThreePersons();
    render(PersonPicker, {
      props: { appState, value: null, onChange: vi.fn(), allowNone: true, noneLabel: '— kein Elternteil —' },
    });

    expect(screen.getByText('— kein Elternteil —')).toBeTruthy();
  });
});

describe('PersonPicker — Filtern + Auswahl', () => {
  it('filtert Kandidaten per Tippen über matchesSearch (Name)', async () => {
    const appState = seedThreePersons();
    render(PersonPicker, { props: { appState, value: null, onChange: vi.fn(), label: 'Ehemann' } });

    await fireEvent.click(screen.getByLabelText('Ehemann'));
    expect(screen.getByText('Otto Bauer')).toBeTruthy();
    expect(screen.getByText('Anna Klein')).toBeTruthy();
    expect(screen.getByText('Karl Bauer')).toBeTruthy();

    await fireEvent.input(screen.getByLabelText('Ehemann durchsuchen'), { target: { value: 'anna' } });

    expect(screen.getByText('Anna Klein')).toBeTruthy();
    expect(screen.queryByText('Otto Bauer')).toBeNull();
    expect(screen.queryByText('Karl Bauer')).toBeNull();
  });

  it('ruft onChange mit der gewählten id auf und schließt die Ergebnisliste', async () => {
    const appState = seedThreePersons();
    const onChange = vi.fn();
    render(PersonPicker, { props: { appState, value: null, onChange, label: 'Ehemann' } });

    await fireEvent.click(screen.getByLabelText('Ehemann'));
    await fireEvent.click(screen.getByText('Otto Bauer'));

    expect(onChange).toHaveBeenCalledWith('@I1@');
    expect(screen.queryByText('Anna Klein')).toBeNull(); // Panel geschlossen
  });

  it('allowNone bietet eine "keine Auswahl"-Option, die onChange(null) auslöst', async () => {
    const appState = seedThreePersons();
    const onChange = vi.fn();
    render(PersonPicker, {
      props: { appState, value: '@I1@', onChange, allowNone: true, noneLabel: '— kein Elternteil —', label: 'Ehemann' },
    });

    await fireEvent.click(screen.getByLabelText('Ehemann'));
    await fireEvent.click(screen.getByText('— kein Elternteil —', { selector: '.person-picker__result--none' }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('excludeIds entfernt bereits zugeordnete Personen aus den Kandidaten', async () => {
    const appState = seedThreePersons();
    render(PersonPicker, {
      props: { appState, value: null, onChange: vi.fn(), excludeIds: ['@I1@', '@I3@'], label: 'Kind hinzufügen' },
    });

    await fireEvent.click(screen.getByLabelText('Kind hinzufügen'));

    expect(screen.getByText('Anna Klein')).toBeTruthy();
    expect(screen.queryByText('Otto Bauer', { selector: '.person-picker__result-name' })).toBeNull();
    expect(screen.queryByText('Karl Bauer', { selector: '.person-picker__result-name' })).toBeNull();
  });

  it('viele dicht benannte Kandidaten bleiben bedienbar (TST-7 Überlauf-Fall) — Liste wird gekappt, Hinweistext zeigt den Rest', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    for (let i = 0; i < 40; i += 1) {
      const id = `@I${i}@`;
      db.individuals.set(id, makePerson(id, { given: `Person${String(i).padStart(2, '0')}`, surname: 'Meyer' }));
    }
    appState.loadDatabase(db, 'test.ged');

    render(PersonPicker, { props: { appState, value: null, onChange: vi.fn(), label: 'Ehemann' } });
    await fireEvent.click(screen.getByLabelText('Ehemann'));

    const results = document.querySelectorAll('.person-picker__result-name');
    expect(results.length).toBeLessThan(40);
    expect(screen.getByText(/weitere/)).toBeTruthy();

    await fireEvent.input(screen.getByLabelText('Ehemann durchsuchen'), { target: { value: 'person01' } });
    expect(screen.getByText('Person01 Meyer')).toBeTruthy();
  });
});

describe('PersonPicker — Inline-Neuanlage ("+ Neue Person anlegen …")', () => {
  it('ist immer vorhanden, auch ohne Tippen', async () => {
    const appState = seedThreePersons();
    render(PersonPicker, { props: { appState, value: null, onChange: vi.fn(), label: 'Ehemann' } });

    await fireEvent.click(screen.getByLabelText('Ehemann'));
    expect(screen.getByText('+ Neue Person anlegen …')).toBeTruthy();
  });

  it('öffnet PersonForm inline, speichert die neue Person, ruft onChange mit der neuen id auf und schließt den Modus wieder — kein Kontextverlust', async () => {
    const appState = seedThreePersons();
    const onChange = vi.fn();
    render(PersonPicker, { props: { appState, value: null, onChange, label: 'Ehemann' } });

    await fireEvent.click(screen.getByLabelText('Ehemann'));
    await fireEvent.click(screen.getByText('+ Neue Person anlegen …'));

    // Inline-Formular ist da (PersonForm-Feld), das Picker-Suchfeld ist es nicht mehr.
    expect(screen.getByLabelText('Vorname')).toBeTruthy();
    expect(screen.queryByLabelText('Ehemann durchsuchen')).toBeNull();

    await fireEvent.input(screen.getByLabelText('Vorname'), { target: { value: 'Neu' } });
    await fireEvent.input(screen.getByLabelText('Nachname'), { target: { value: 'Person' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(onChange).toHaveBeenCalledTimes(1);
    const newId = onChange.mock.calls[0][0] as string;
    expect(appState.db.individuals.get(newId)?.given).toBe('Neu');
    // Inline-Formular ist wieder zu, Picker zeigt das geschlossene Feld.
    expect(screen.queryByLabelText('Vorname')).toBeNull();
  });

  it('Abbrechen der Inline-Neuanlage verwirft das Gerüst wieder (kein onChange-Aufruf)', async () => {
    const appState = seedThreePersons();
    const onChange = vi.fn();
    render(PersonPicker, { props: { appState, value: null, onChange, label: 'Ehemann' } });

    await fireEvent.click(screen.getByLabelText('Ehemann'));
    await fireEvent.click(screen.getByText('+ Neue Person anlegen …'));
    await fireEvent.click(screen.getByText('Abbrechen'));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Vorname')).toBeNull();
  });
});
