// @vitest-environment happy-dom
// tests/ui/SourcePicker.component.test.ts — durchsuchbares Quellen-Auswahlfeld
// (ADR-v9-40, generalisiert ADR-v9-30/PersonPicker.svelte, INV-UI-4). Deckt Filtern
// (matchesSearch), Auswahl/onChange, allowNone sowie die Inline-Neuanlage über
// SourceForm ab (onSaved -> onChange mit der neuen id, kein Kontextverlust).
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import SourcePicker from '../../ui/shell/SourcePicker.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makeSource } from '../../core/model';

function seedThreeSources() {
  const appState = createAppState();
  const db = makeDatabase();
  db.sources.set('@S1@', makeSource('@S1@', { abbr: 'KB Musterdorf', author: 'Pfarrer Müller' }));
  db.sources.set('@S2@', makeSource('@S2@', { abbr: 'StA Musterstadt', author: 'Standesamt' }));
  db.sources.set('@S3@', makeSource('@S3@', { title: 'Ohne Kurzname', author: 'Anna' }));
  appState.loadDatabase(db, 'test.ged');
  return appState;
}

describe('SourcePicker — Anzeige des Feldes', () => {
  it('zeigt den Platzhalter, solange nichts ausgewählt ist', () => {
    const appState = seedThreeSources();
    render(SourcePicker, { props: { appState, value: null, onChange: vi.fn(), placeholder: 'Quelle wählen…' } });

    expect(screen.getByText('Quelle wählen…')).toBeTruthy();
  });

  it('zeigt Kurzname/Titel + Autor als Sublabel der aktuell gewählten Quelle', () => {
    const appState = seedThreeSources();
    render(SourcePicker, { props: { appState, value: '@S1@', onChange: vi.fn() } });

    expect(screen.getByText('KB Musterdorf')).toBeTruthy();
    expect(screen.getByText(/Pfarrer Müller/)).toBeTruthy();
  });

  it('zeigt title als Label, wenn abbr fehlt', () => {
    const appState = seedThreeSources();
    render(SourcePicker, { props: { appState, value: '@S3@', onChange: vi.fn() } });

    expect(screen.getByText('Ohne Kurzname')).toBeTruthy();
  });
});

describe('SourcePicker — Filtern + Auswahl', () => {
  it('filtert Kandidaten per Tippen über matchesSearch', async () => {
    const appState = seedThreeSources();
    render(SourcePicker, { props: { appState, value: null, onChange: vi.fn(), label: 'Quelle' } });

    await fireEvent.click(screen.getByLabelText('Quelle'));
    expect(screen.getByText('KB Musterdorf')).toBeTruthy();
    expect(screen.getByText('StA Musterstadt')).toBeTruthy();

    await fireEvent.input(screen.getByLabelText('Quelle durchsuchen'), { target: { value: 'musterdorf' } });

    expect(screen.getByText('KB Musterdorf')).toBeTruthy();
    expect(screen.queryByText('StA Musterstadt')).toBeNull();
  });

  it('ruft onChange mit der gewählten id auf und schließt das Panel', async () => {
    const appState = seedThreeSources();
    const onChange = vi.fn();
    render(SourcePicker, { props: { appState, value: null, onChange, label: 'Quelle' } });

    await fireEvent.click(screen.getByLabelText('Quelle'));
    await fireEvent.click(screen.getByText('KB Musterdorf'));

    expect(onChange).toHaveBeenCalledWith('@S1@');
  });

  it('allowNone bietet eine "keine Quelle"-Option, die onChange(null) auslöst', async () => {
    const appState = seedThreeSources();
    const onChange = vi.fn();
    render(SourcePicker, {
      props: { appState, value: '@S1@', onChange, allowNone: true, noneLabel: '– keine Quelle –', label: 'Quelle' },
    });

    await fireEvent.click(screen.getByLabelText('Quelle'));
    await fireEvent.click(screen.getByText('– keine Quelle –', { selector: '.stb-picker__result--none' }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('viele dicht benannte Quellen bleiben bedienbar (TST-7 Überlauf-Fall)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    for (let i = 0; i < 40; i += 1) {
      const id = `@S${i}@`;
      db.sources.set(id, makeSource(id, { abbr: `Quelle${String(i).padStart(2, '0')}` }));
    }
    appState.loadDatabase(db, 'test.ged');

    render(SourcePicker, { props: { appState, value: null, onChange: vi.fn(), label: 'Quelle' } });
    await fireEvent.click(screen.getByLabelText('Quelle'));

    const results = document.querySelectorAll('.stb-picker__result-name');
    expect(results.length).toBeLessThan(40);
    expect(screen.getByText(/weitere/)).toBeTruthy();
  });
});

describe('SourcePicker — Inline-Neuanlage ("+ Neue Quelle anlegen …")', () => {
  it('öffnet SourceForm inline, speichert die neue Quelle, ruft onChange mit der neuen id auf', async () => {
    const appState = seedThreeSources();
    const onChange = vi.fn();
    render(SourcePicker, { props: { appState, value: null, onChange, label: 'Quelle' } });

    await fireEvent.click(screen.getByLabelText('Quelle'));
    await fireEvent.click(screen.getByText('+ Neue Quelle anlegen …'));

    expect(screen.getByText('Neue Quelle')).toBeTruthy();
    expect(screen.queryByLabelText('Quelle durchsuchen')).toBeNull();

    await fireEvent.input(screen.getByRole('textbox', { name: 'Kurzname' }), { target: { value: 'Neue Quelle X' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(onChange).toHaveBeenCalledTimes(1);
    const newId = onChange.mock.calls[0][0] as string;
    expect(appState.db.sources.get(newId)?.abbr).toBe('Neue Quelle X');
    expect(screen.queryByText('Neue Quelle')).toBeNull();
  });

  it('Abbrechen der Inline-Neuanlage verwirft das Gerüst wieder (kein onChange-Aufruf)', async () => {
    const appState = seedThreeSources();
    const onChange = vi.fn();
    render(SourcePicker, { props: { appState, value: null, onChange, label: 'Quelle' } });

    await fireEvent.click(screen.getByLabelText('Quelle'));
    await fireEvent.click(screen.getByText('+ Neue Quelle anlegen …'));
    await fireEvent.click(screen.getByText('Abbrechen'));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText('Neue Quelle')).toBeNull();
  });
});
