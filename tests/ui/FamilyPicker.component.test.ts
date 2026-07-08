// @vitest-environment happy-dom
// tests/ui/FamilyPicker.component.test.ts — durchsuchbares Familien-Auswahlfeld
// (ADR-v9-40, generalisiert ADR-v9-30/PersonPicker.svelte, INV-UI-4). Deckt Filtern
// (matchesSearch aus family-list-model.ts), Auswahl/onChange, allowNone sowie die
// Inline-Neuanlage über FamilyForm ab (onSaved -> onChange mit der neuen id).
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import FamilyPicker from '../../ui/shell/FamilyPicker.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makePerson, makeFamily } from '../../core/model';

function seedTwoFamilies() {
  const appState = createAppState();
  const db = makeDatabase();
  db.individuals.set('@I1@', makePerson('@I1@', { given: 'Otto', surname: 'Bauer' }));
  db.individuals.set('@I2@', makePerson('@I2@', { given: 'Anna', surname: 'Klein' }));
  db.individuals.set('@I3@', makePerson('@I3@', { given: 'Karl', surname: 'Meyer' }));
  db.individuals.set('@I4@', makePerson('@I4@', { given: 'Grete', surname: 'Schulz' }));
  db.families.set('@F1@', makeFamily('@F1@', { husband: '@I1@', wife: '@I2@' }));
  db.families.set('@F2@', makeFamily('@F2@', { husband: '@I3@', wife: '@I4@' }));
  appState.loadDatabase(db, 'test.ged');
  return appState;
}

describe('FamilyPicker — Anzeige des Feldes', () => {
  it('zeigt den Platzhalter, solange nichts ausgewählt ist', () => {
    const appState = seedTwoFamilies();
    render(FamilyPicker, { props: { appState, value: null, onChange: vi.fn(), placeholder: 'Familie wählen…' } });

    expect(screen.getByText('Familie wählen…')).toBeTruthy();
  });

  it('zeigt das Elternpaar-Label (familyLabelFor) der aktuell gewählten Familie', () => {
    const appState = seedTwoFamilies();
    render(FamilyPicker, { props: { appState, value: '@F1@', onChange: vi.fn() } });

    expect(screen.getByText('Otto Bauer ⚭ Anna Klein')).toBeTruthy();
  });
});

describe('FamilyPicker — Filtern + Auswahl', () => {
  it('filtert Kandidaten per Tippen über matchesSearch (Ehepartnernamen)', async () => {
    const appState = seedTwoFamilies();
    render(FamilyPicker, { props: { appState, value: null, onChange: vi.fn(), label: 'Familie' } });

    await fireEvent.click(screen.getByLabelText('Familie'));
    expect(screen.getByText('Otto Bauer ⚭ Anna Klein')).toBeTruthy();
    expect(screen.getByText('Karl Meyer ⚭ Grete Schulz')).toBeTruthy();

    await fireEvent.input(screen.getByLabelText('Familie durchsuchen'), { target: { value: 'Meyer' } });

    expect(screen.getByText('Karl Meyer ⚭ Grete Schulz')).toBeTruthy();
    expect(screen.queryByText('Otto Bauer ⚭ Anna Klein')).toBeNull();
  });

  it('ruft onChange mit der gewählten id auf und schließt das Panel', async () => {
    const appState = seedTwoFamilies();
    const onChange = vi.fn();
    render(FamilyPicker, { props: { appState, value: null, onChange, label: 'Familie' } });

    await fireEvent.click(screen.getByLabelText('Familie'));
    await fireEvent.click(screen.getByText('Otto Bauer ⚭ Anna Klein'));

    expect(onChange).toHaveBeenCalledWith('@F1@');
  });

  it('allowNone bietet eine "keine Familie"-Option, die onChange(null) auslöst', async () => {
    const appState = seedTwoFamilies();
    const onChange = vi.fn();
    render(FamilyPicker, {
      props: { appState, value: '@F1@', onChange, allowNone: true, noneLabel: '— keine Familie —', label: 'Familie' },
    });

    await fireEvent.click(screen.getByLabelText('Familie'));
    await fireEvent.click(screen.getByText('— keine Familie —', { selector: '.stb-picker__result--none' }));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});

describe('FamilyPicker — Inline-Neuanlage ("+ Neue Familie anlegen …")', () => {
  it('öffnet FamilyForm inline, speichert die neue Familie, ruft onChange mit der neuen id auf', async () => {
    const appState = seedTwoFamilies();
    const onChange = vi.fn();
    render(FamilyPicker, { props: { appState, value: null, onChange, label: 'Familie' } });

    await fireEvent.click(screen.getByLabelText('Familie'));
    await fireEvent.click(screen.getByText('+ Neue Familie anlegen …'));

    // Inline-Formular ist da (FamilyForm-Feld), das Picker-Suchfeld ist es nicht mehr.
    expect(screen.getByText('Neue Familie')).toBeTruthy();
    expect(screen.queryByLabelText('Familie durchsuchen')).toBeNull();

    await fireEvent.click(screen.getByText('Speichern'));

    expect(onChange).toHaveBeenCalledTimes(1);
    const newId = onChange.mock.calls[0][0] as string;
    expect(appState.db.families.has(newId)).toBe(true);
    expect(screen.queryByText('Neue Familie')).toBeNull();
  });

  it('Abbrechen der Inline-Neuanlage verwirft das Gerüst wieder (kein onChange-Aufruf)', async () => {
    const appState = seedTwoFamilies();
    const onChange = vi.fn();
    render(FamilyPicker, { props: { appState, value: null, onChange, label: 'Familie' } });

    await fireEvent.click(screen.getByLabelText('Familie'));
    await fireEvent.click(screen.getByText('+ Neue Familie anlegen …'));
    await fireEvent.click(screen.getByText('Abbrechen'));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText('Neue Familie')).toBeNull();
  });
});
