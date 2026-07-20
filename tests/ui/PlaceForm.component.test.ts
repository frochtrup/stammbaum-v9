// @vitest-environment happy-dom
// tests/ui/PlaceForm.component.test.ts — Orts-NEUANLAGE (ADR-v9-42 Punkt 4, Spec 20
// §"Ort"). Minimalfelder Titel (Pflicht) + Typ (optional); ID-Vergabe deterministisch
// (`_plac_<slug>`, Kollisions-Suffix). Bewusst KEIN Editier-Fall (s. PlaceForm.svelte
// Kopfkommentar) — nur die Erstanlage wird hier getestet, Bearbeitung ist
// PlaceDetail.component.test.ts vorbehalten.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PlaceForm from '../../ui/views/place/PlaceForm.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase } from '../../core/model';
import { place } from '../core/places-fixtures';

describe('PlaceForm — Neuanlage', () => {
  it('Speichern ist deaktiviert, solange kein Name eingegeben ist', () => {
    const appState = createAppState();
    render(PlaceForm, { props: { appState } });

    const saveBtn = screen.getByText('Speichern') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it('legt einen neuen Ort mit deterministischer, slug-basierter id an', async () => {
    const appState = createAppState();
    const onSaved = vi.fn();
    render(PlaceForm, { props: { appState, onSaved } });

    await fireEvent.input(screen.getByLabelText('Name (neuer Ort)'), { target: { value: 'Kreis Steinfurt' } });
    await fireEvent.input(screen.getByLabelText('Typ (neuer Ort)'), { target: { value: 'County' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(onSaved).toHaveBeenCalledTimes(1);
    const id = onSaved.mock.calls[0][0] as string;
    expect(id).toBe('_plac_kreis_steinfurt');
    const saved = appState.db.placeObjects.get(id);
    expect(saved?.title).toBe('Kreis Steinfurt');
    expect(saved?.type).toBe('County');
    // Erstanlage-Minimalfelder — Rest bleibt PlaceDetail-Bearbeitung vorbehalten.
    expect(saved?.pnames).toEqual([]);
    expect(saved?.enclosedBy).toEqual([]);
    expect(saved?.lat).toBeNull();
  });

  it('löst id-Kollisionen deterministisch mit einem Suffix auf', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('_plac_ochtrup', place('_plac_ochtrup', { title: 'Ochtrup (alt)' }));
    appState.loadDatabase(db, 'test.ged');
    const onSaved = vi.fn();

    render(PlaceForm, { props: { appState, onSaved } });
    await fireEvent.input(screen.getByLabelText('Name (neuer Ort)'), { target: { value: 'Ochtrup' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(onSaved).toHaveBeenCalledWith('_plac_ochtrup_2');
  });

  it('Abbrechen legt nichts an', async () => {
    const appState = createAppState();
    const onCancel = vi.fn();
    render(PlaceForm, { props: { appState, onCancel } });

    await fireEvent.input(screen.getByLabelText('Name (neuer Ort)'), { target: { value: 'Irgendwo' } });
    await fireEvent.click(screen.getByText('Abbrechen'));

    expect(appState.db.placeObjects.size).toBe(0);
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
