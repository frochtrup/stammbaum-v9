// @vitest-environment happy-dom
// tests/ui/RepositoryPicker.component.test.ts — durchsuchbares Archiv-Auswahlfeld
// (ADR-v9-40, generalisiert ADR-v9-30/PersonPicker.svelte, INV-UI-4). Deckt Filtern
// (neu ergänztes matchesSearch in repository-list-model.ts), Auswahl/onChange, allowNone
// sowie die Inline-Neuanlage über RepositoryForm ab.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import RepositoryPicker from '../../ui/shell/RepositoryPicker.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makeRepository } from '../../core/model';

function seedThreeRepositories() {
  const appState = createAppState();
  const db = makeDatabase();
  db.repositories.set('@R1@', makeRepository('@R1@', { name: 'Pfarrarchiv Musterdorf', type: 'Kirchenarchiv' }));
  db.repositories.set('@R2@', makeRepository('@R2@', { name: 'Staatsarchiv Musterstadt', type: 'Staatsarchiv' }));
  db.repositories.set('@R3@', makeRepository('@R3@', { name: 'Stadtarchiv Beispielhausen', type: 'Stadtarchiv' }));
  appState.loadDatabase(db, 'test.ged');
  return appState;
}

describe('RepositoryPicker — Anzeige des Feldes', () => {
  it('zeigt den Platzhalter, solange nichts ausgewählt ist', () => {
    const appState = seedThreeRepositories();
    render(RepositoryPicker, { props: { appState, value: null, onChange: vi.fn(), placeholder: 'Archiv wählen…' } });

    expect(screen.getByText('Archiv wählen…')).toBeTruthy();
  });

  it('zeigt Name + Typ als Sublabel des aktuell gewählten Archivs', () => {
    const appState = seedThreeRepositories();
    render(RepositoryPicker, { props: { appState, value: '@R1@', onChange: vi.fn() } });

    expect(screen.getByText('Pfarrarchiv Musterdorf')).toBeTruthy();
    expect(screen.getByText(/Kirchenarchiv/)).toBeTruthy();
  });
});

describe('RepositoryPicker — Filtern + Auswahl', () => {
  it('filtert Kandidaten per Tippen über matchesSearch', async () => {
    const appState = seedThreeRepositories();
    render(RepositoryPicker, { props: { appState, value: null, onChange: vi.fn(), label: 'Archiv' } });

    await fireEvent.click(screen.getByLabelText('Archiv'));
    expect(screen.getByText('Pfarrarchiv Musterdorf')).toBeTruthy();
    expect(screen.getByText('Staatsarchiv Musterstadt')).toBeTruthy();

    await fireEvent.input(screen.getByLabelText('Archiv durchsuchen'), { target: { value: 'staatsarchiv' } });

    expect(screen.getByText('Staatsarchiv Musterstadt')).toBeTruthy();
    expect(screen.queryByText('Pfarrarchiv Musterdorf')).toBeNull();
  });

  it('ruft onChange mit der gewählten id auf und schließt das Panel', async () => {
    const appState = seedThreeRepositories();
    const onChange = vi.fn();
    render(RepositoryPicker, { props: { appState, value: null, onChange, label: 'Archiv' } });

    await fireEvent.click(screen.getByLabelText('Archiv'));
    await fireEvent.click(screen.getByText('Pfarrarchiv Musterdorf'));

    expect(onChange).toHaveBeenCalledWith('@R1@');
  });

  it('allowNone bietet eine "kein Archiv"-Option, die onChange(null) auslöst', async () => {
    const appState = seedThreeRepositories();
    const onChange = vi.fn();
    render(RepositoryPicker, {
      props: { appState, value: '@R1@', onChange, allowNone: true, noneLabel: '— kein Archiv —', label: 'Archiv' },
    });

    await fireEvent.click(screen.getByLabelText('Archiv'));
    await fireEvent.click(screen.getByText('— kein Archiv —', { selector: '.stb-picker__result--none' }));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});

describe('RepositoryPicker — Inline-Neuanlage ("+ Neues Archiv anlegen …")', () => {
  it('öffnet RepositoryForm inline, speichert das neue Archiv, ruft onChange mit der neuen id auf', async () => {
    const appState = seedThreeRepositories();
    const onChange = vi.fn();
    render(RepositoryPicker, { props: { appState, value: null, onChange, label: 'Archiv' } });

    await fireEvent.click(screen.getByLabelText('Archiv'));
    await fireEvent.click(screen.getByText('+ Neues Archiv anlegen …'));

    expect(screen.getByText('Neues Archiv')).toBeTruthy();
    expect(screen.queryByLabelText('Archiv durchsuchen')).toBeNull();

    await fireEvent.input(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Neues Archiv X' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(onChange).toHaveBeenCalledTimes(1);
    const newId = onChange.mock.calls[0][0] as string;
    expect(appState.db.repositories.get(newId)?.name).toBe('Neues Archiv X');
    expect(screen.queryByText('Neues Archiv')).toBeNull();
  });

  it('Abbrechen der Inline-Neuanlage verwirft das Gerüst wieder (kein onChange-Aufruf)', async () => {
    const appState = seedThreeRepositories();
    const onChange = vi.fn();
    render(RepositoryPicker, { props: { appState, value: null, onChange, label: 'Archiv' } });

    await fireEvent.click(screen.getByLabelText('Archiv'));
    await fireEvent.click(screen.getByText('+ Neues Archiv anlegen …'));
    await fireEvent.click(screen.getByText('Abbrechen'));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText('Neues Archiv')).toBeNull();
  });
});
