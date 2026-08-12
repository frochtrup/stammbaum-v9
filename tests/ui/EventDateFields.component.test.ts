// @vitest-environment happy-dom
// tests/ui/EventDateFields.component.test.ts — die Datumszeile, extrahiert aus
// EventEditModal.svelte (BL-352, ADR-v9-264 „die eine echte Baustein-Lücke"). Deckt
// (a) die Komponente selbst über `EditableDate` (kein volles `EditableEvent` nötig) und
// (b) dass EventEditModal SIE konsumiert statt eine zweite Fassung zu tragen (Fertig-
// Zustand von BL-352: „der Nachweis, dass EventEditModal dieselbe Datumskomponente
// rendert").
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import EventDateFields from '../../ui/shell/EventDateFields.svelte';
import EventEditModal from '../../ui/shell/EventEditModal.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeEvent } from '../../core/model';
import { makeEditableDate } from '../../ui/shell/event-edit';
import { reaktiv } from './fixtures/reaktiv.svelte';

describe('EventDateFields — arbeitet auf EditableDate, keine aria-Präfix (EventEditModal-Fall)', () => {
  it('zeigt die vier Basis-Felder mit den unpräfigierten Labels', () => {
    const editable = reaktiv(makeEditableDate());
    render(EventDateFields, { props: { editable } });

    expect(screen.getByLabelText('Datums-Qualifier')).toBeTruthy();
    expect(screen.getByLabelText('Tag')).toBeTruthy();
    expect(screen.getByLabelText('Monat')).toBeTruthy();
    expect(screen.getByLabelText('Jahr')).toBeTruthy();
  });

  it('zeigt die BET/FROM-Zweitgrenze erst, wenn der Qualifier das verlangt', async () => {
    const editable = reaktiv(makeEditableDate());
    render(EventDateFields, { props: { editable } });

    expect(screen.queryByLabelText('Tag (Ende)')).toBeNull();
    await fireEvent.change(screen.getByLabelText('Datums-Qualifier'), { target: { value: 'BET' } });
    expect(screen.getByLabelText('Tag (Ende)')).toBeTruthy();
    expect(screen.getByText('und')).toBeTruthy();
  });

  it('markiert dateDirty und übernimmt Tag/Monat/Jahr auf dem übergebenen Objekt (Mutation per Referenz)', async () => {
    const editable = reaktiv(makeEditableDate());
    render(EventDateFields, { props: { editable } });

    await fireEvent.change(screen.getByLabelText('Jahr'), { target: { value: '1822' } });
    expect(editable.year).toBe(1822);
    expect(editable.dateDirty).toBe(true);
  });

  it('präfigiert die aria-labels, wenn ariaPrefix gesetzt ist (mehrere Datumszeilen gleichzeitig)', () => {
    const editable = reaktiv(makeEditableDate());
    render(EventDateFields, { props: { editable, ariaPrefix: 'Heirat' } });

    expect(screen.getByLabelText('Heirat Datums-Qualifier')).toBeTruthy();
    expect(screen.getByLabelText('Heirat Tag')).toBeTruthy();
    expect(screen.queryByLabelText('Tag')).toBeNull();
  });
});

describe('EventEditModal rendert DIESELBE Datumskomponente (Fertig-Zustand BL-352)', () => {
  it('ein Datums-Edit über die EventDateFields-Felder landet im gespeicherten Event', async () => {
    const appState = createAppState();
    const ev = makeEvent('OCCU');
    let saved: unknown = null;

    render(EventEditModal, {
      props: {
        appState,
        event: ev,
        label: 'Beruf',
        onSave: (updated: unknown) => (saved = updated),
        onClose: () => {},
      },
    });

    // Dieselben aria-labels wie der EventDateFields-eigene Test oben — kein zweites,
    // abweichendes Markup im Modal.
    await fireEvent.change(screen.getByLabelText('Jahr'), { target: { value: '1955' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect((saved as { date: string }).date).toBe('1955');
  });
});
