// @vitest-environment happy-dom
// tests/ui/SourceListSucheFilter.component.test.ts — Suchfeld (BL-372) und Gattungs-Filter
// (BL-373) der Quellenliste, Spec 20 §1.6 [K]/[S].
//
// WARUM EIGENE DATEI und nicht in `SourceList.component.test.ts`: die dortigen Fälle
// prüfen die Zeile (Zähler, Badges, Navigation). Hier geht es um die Toolbar und um den
// Zustand DAHINTER — der Halter ist ein eigener Vertrag (Spec 21 §5 Heimat ③) und wird
// von außen gestellt, damit der Test ihn nach dem Abbau der Komponente noch befragen kann.
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import SourceList from '../../ui/views/source/SourceList.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { createSourceListState } from '../../ui/views/list-view-state.svelte';
import { makeDatabase, makeSource } from '../../core/model';

function seed() {
  const appState = createAppState();
  const db = makeDatabase();
  db.sources.set('@S1@', makeSource('@S1@', { abbr: 'KB Ochtrup', author: 'Pfarramt' }));
  db.sources.set('@S2@', makeSource('@S2@', { abbr: 'Totenzettel Meier', author: '' }));
  db.sources.set('@S3@', makeSource('@S3@', { abbr: 'StA Geburten Vechta', author: '' }));
  appState.loadDatabase(db, 'test.ged');
  return appState;
}

const suchfeld = () => screen.getByLabelText('Quellen durchsuchen') as HTMLInputElement;

describe('Quellenliste — Suche (BL-372)', () => {
  it('grenzt die Liste auf die Treffer ein', async () => {
    render(SourceList, { props: { appState: seed(), viewState: createViewState() } });

    expect(screen.getByText('Totenzettel Meier')).toBeTruthy();
    await fireEvent.input(suchfeld(), { target: { value: 'ochtrup' } });

    expect(screen.getByText('KB Ochtrup')).toBeTruthy();
    expect(screen.queryByText('Totenzettel Meier')).toBeNull();
  });

  it('sagt bei leerem Ergebnis, dass die FILTER greifen — nicht, dass es keine Quellen gibt', async () => {
    render(SourceList, { props: { appState: seed(), viewState: createViewState() } });

    await fireEvent.input(suchfeld(), { target: { value: 'gibtesnicht' } });

    expect(screen.getByText(/passt zu Suche und Filter/)).toBeTruthy();
    expect(screen.queryByText(/Keine Quellen geladen/)).toBeNull();
  });

  it('leert das Feld über ✕', async () => {
    render(SourceList, { props: { appState: seed(), viewState: createViewState() } });

    await fireEvent.input(suchfeld(), { target: { value: 'ochtrup' } });
    await fireEvent.click(screen.getByLabelText('Suche löschen'));

    expect(suchfeld().value).toBe('');
    expect(screen.getByText('Totenzettel Meier')).toBeTruthy();
  });

  it('überlebt den Abbau der Fläche — der Zustand gehört dem Halter, nicht der Komponente', async () => {
    const list = createSourceListState();
    const erste = render(SourceList, {
      props: { appState: seed(), viewState: createViewState(), list },
    });

    await fireEvent.input(suchfeld(), { target: { value: 'ochtrup' } });
    expect(list.query).toBe('ochtrup');

    // Der Weg des Nutzers: Quelle öffnen (auf Mobil ERSETZT der Steckbrief die Liste),
    // dann zurück. Für die Liste ist das ein Abbau samt Neuaufbau.
    erste.unmount();
    render(SourceList, { props: { appState: seed(), viewState: createViewState(), list } });

    expect(suchfeld().value).toBe('ochtrup');
    expect(screen.queryByText('Totenzettel Meier')).toBeNull();
  });
});

describe('Quellenliste — Gattungs-Filter (BL-373)', () => {
  const gattungsFeld = async () => {
    await fireEvent.click(screen.getByRole('button', { name: /^Filter/ }));
    return screen.getByLabelText('Gattung') as HTMLSelectElement;
  };

  it('grenzt auf eine Gattung ein', async () => {
    render(SourceList, { props: { appState: seed(), viewState: createViewState() } });

    await fireEvent.change(await gattungsFeld(), { target: { value: 'kirchenbuch' } });

    expect(screen.getByText('KB Ochtrup')).toBeTruthy();
    expect(screen.queryByText('Totenzettel Meier')).toBeNull();
    expect(screen.queryByText('StA Geburten Vechta')).toBeNull();
  });

  it('zählt am Trigger mit, sobald er von der Vorgabe abweicht', async () => {
    render(SourceList, { props: { appState: seed(), viewState: createViewState() } });

    await fireEvent.change(await gattungsFeld(), { target: { value: 'grab' } });

    expect(screen.getByRole('button', { name: 'Filter · 1' })).toBeTruthy();
  });

  it('führt „ohne erkennbare Gattung" als eigene Stufe', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.sources.set('@S1@', makeSource('@S1@', { abbr: 'KB Ochtrup' }));
    db.sources.set('@S2@', makeSource('@S2@', { abbr: 'Wegener' }));
    appState.loadDatabase(db, 'test.ged');
    render(SourceList, { props: { appState, viewState: createViewState() } });

    await fireEvent.change(await gattungsFeld(), { target: { value: 'sonstiges' } });

    expect(screen.getByText('Wegener')).toBeTruthy();
    expect(screen.queryByText('KB Ochtrup')).toBeNull();
  });
});
