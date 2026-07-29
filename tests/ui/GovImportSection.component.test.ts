// @vitest-environment happy-dom
// tests/ui/GovImportSection.component.test.ts — GOV-Import im Ort-Bearbeiten-Modus
// (BL-131, Spec 20 §1.7). Der Parser selbst ist in tests/core/gov.test.ts abgedeckt;
// hier geht es um die Verdrahtung: committet der Knopf wirklich in den AppState, und
// meldet er ehrlich, wenn nichts passiert ist?
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import GovImportSection from '../../ui/views/place/GovImportSection.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase } from '../../core/model';
import { savePlaceObject, countUnresolvedGovPlaceholders } from '../../core/places';
import { place } from '../core/places-fixtures';

const GOV_TEXT = ['object_162795', 'heißt (auf deu) Ochtrup', 'gehört ab 1969 zu object_190334'].join('\n');

function stateWithPlace(): ReturnType<typeof createAppState> {
  const db = makeDatabase();
  savePlaceObject(db.placeObjects, place('P1', { title: '' }));
  const appState = createAppState();
  appState.loadDatabase(db, 'test.ged');
  return appState;
}

async function openAndPaste(appState: ReturnType<typeof createAppState>, text: string): Promise<void> {
  render(GovImportSection, { props: { appState, placeId: 'P1' } });
  await fireEvent.click(screen.getByText('GOV-Import öffnen'));
  await fireEvent.input(screen.getByLabelText('GOV-Textzusammenfassung einfügen'), { target: { value: text } });
  await fireEvent.click(screen.getByText('Übernehmen'));
}

describe('GovImportSection (BL-131)', () => {
  it('ist zugeklappt, bis der Nutzer sie öffnet (Kurations-Werkzeug, kein Dauer-Formular)', () => {
    render(GovImportSection, { props: { appState: stateWithPlace(), placeId: 'P1' } });
    expect(screen.queryByLabelText('GOV-Textzusammenfassung einfügen')).toBeNull();
  });

  it('übernimmt eine eingefügte Zusammenfassung in den AppState und legt Eltern-Platzhalter an', async () => {
    const appState = stateWithPlace();
    await openAndPaste(appState, GOV_TEXT);

    const pl = appState.db.placeObjects.get('P1')!;
    expect(pl.title).toBe('Ochtrup');
    expect(pl.govId).toBe('object_162795');
    expect(pl.enclosedBy).toHaveLength(1);
    expect(countUnresolvedGovPlaceholders(appState.db.placeObjects)).toBe(1);
    expect(screen.getByRole('status').textContent).toMatch(/Übernommen/);
  });

  it('meldet unbrauchbaren Text, ohne etwas zu ändern (kein erfundener Kennungs-Eintrag)', async () => {
    const appState = stateWithPlace();
    await openAndPaste(appState, 'Mein Notizzettel\nnoch eine Zeile');
    expect(appState.db.placeObjects.get('P1')!.title).toBe('');
    expect(appState.db.placeObjects.get('P1')!.govId).toBeNull();
    expect(screen.getByRole('status').textContent).toMatch(/Keine GOV-Kennung/);
  });

  it('meldet ehrlich „nichts zu ergänzen", wenn derselbe Text zweimal eingefügt wird', async () => {
    const appState = stateWithPlace();
    await openAndPaste(appState, GOV_TEXT);
    await fireEvent.input(screen.getByLabelText('GOV-Textzusammenfassung einfügen'), { target: { value: GOV_TEXT } });
    await fireEvent.click(screen.getByText('Übernehmen'));
    expect(screen.getByRole('status').textContent).toMatch(/Nichts zu ergänzen/);
  });

  // Der Import committet über den regulären Kommando-Pfad — also muss er auch
  // rückgängig zu machen sein (kein Sonderweg an `commit` vorbei).
  it('ist rückgängig zu machen (regulärer Undo-Stack)', async () => {
    const appState = stateWithPlace();
    await openAndPaste(appState, GOV_TEXT);
    expect(appState.db.placeObjects.get('P1')!.title).toBe('Ochtrup');

    appState.undo();
    expect(appState.db.placeObjects.get('P1')!.title).toBe('');
    expect(countUnresolvedGovPlaceholders(appState.db.placeObjects)).toBe(0);
  });
});
