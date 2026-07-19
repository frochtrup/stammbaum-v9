// @vitest-environment happy-dom
// tests/ui/EventEditModal.component.test.ts — fokussierter Einzel-Ereignis-Editor
// (Spec 32 §6). Deckt Rendering/Vorbefüllung, Speichern/Abbrechen, Tristate-Dirty-
// Tracking (identisch zu PersonForm/FamilyForm, da über ui/shell/event-edit.ts geteilt)
// UND die Modal-Schale (Backdrop-Klick/Escape schließt, Panel-Klick nicht) ab.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import EventEditModal from '../../ui/shell/EventEditModal.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makeEvent, makeSource, makeCitation } from '../../core/model';
import { place } from '../core/places-fixtures';

describe('EventEditModal — Rendering + Vorbefüllung', () => {
  it('zeigt "<Label> bearbeiten" als Überschrift und vorbefüllte Datums-/Wert-Felder', () => {
    const appState = createAppState();
    const ev = makeEvent('OCCU', { date: '1950', value: 'Bauer' });

    render(EventEditModal, { props: { appState, event: ev, label: 'Beruf', onSave: vi.fn(), onClose: vi.fn() } });

    expect(screen.getByText('Beruf bearbeiten')).toBeTruthy();
    expect((screen.getByLabelText('Jahr') as HTMLInputElement).value).toBe('1950');
    expect((screen.getByLabelText('Wert') as HTMLInputElement).value).toBe('Bauer');
  });

  it('zeigt KEIN Todesursache-Feld, wenn cause nicht übergeben wird', () => {
    const appState = createAppState();
    const ev = makeEvent('OCCU');

    render(EventEditModal, { props: { appState, event: ev, label: 'Beruf', onSave: vi.fn(), onClose: vi.fn() } });

    expect(screen.queryByText('Todesursache')).toBeNull();
  });

  it('zeigt das Todesursache-Feld vorbefüllt, wenn cause übergeben wird (Person + DEAT)', () => {
    const appState = createAppState();
    const ev = makeEvent('DEAT');

    render(EventEditModal, {
      props: { appState, event: ev, label: 'Tod', cause: 'Typhus', onSave: vi.fn(), onClose: vi.fn() },
    });

    const causeInput = screen.getByText('Todesursache').querySelector('input') as HTMLInputElement;
    expect(causeInput.value).toBe('Typhus');
  });

  it('zeigt KEIN Adresse-Feld für nicht-hofrelevante Typen (z. B. BIRT)', () => {
    const appState = createAppState();
    const ev = makeEvent('BIRT');

    render(EventEditModal, { props: { appState, event: ev, label: 'Geburt', onSave: vi.fn(), onClose: vi.fn() } });

    expect(screen.queryByLabelText('Geburt Adresse')).toBeNull();
  });

  it('zeigt das Adresse-Feld für hofrelevante Typen (RESI/PROP/CENS/OCCU)', () => {
    const appState = createAppState();
    const ev = makeEvent('RESI');

    render(EventEditModal, { props: { appState, event: ev, label: 'Wohnort', onSave: vi.fn(), onClose: vi.fn() } });

    expect(screen.getByLabelText('Wohnort Adresse')).toBeTruthy();
  });

  it('zeigt das Typ-Freitextfeld nur bei EVEN/FACT', () => {
    const appState = createAppState();

    const { unmount } = render(EventEditModal, {
      props: { appState, event: makeEvent('EVEN'), label: 'Ereignis', onSave: vi.fn(), onClose: vi.fn() },
    });
    expect(screen.getByText('Typ-Freitext (TYPE)')).toBeTruthy();
    unmount();

    render(EventEditModal, {
      props: { appState, event: makeEvent('OCCU'), label: 'Beruf', onSave: vi.fn(), onClose: vi.fn() },
    });
    expect(screen.queryByText('Typ-Freitext (TYPE)')).toBeNull();
  });
});

describe('EventEditModal — Speichern/Abbrechen', () => {
  it('Speichern ruft onSave mit dem vollständigen, aktualisierten Event-Objekt auf', async () => {
    const appState = createAppState();
    const ev = makeEvent('OCCU', { value: 'Bauer' });
    const onSave = vi.fn();

    render(EventEditModal, { props: { appState, event: ev, label: 'Beruf', onSave, onClose: vi.fn() } });
    await fireEvent.input(screen.getByLabelText('Wert'), { target: { value: 'Landwirt' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(onSave).toHaveBeenCalledTimes(1);
    const [updated, cause] = onSave.mock.calls[0];
    expect(updated.value).toBe('Landwirt');
    expect(updated.type).toBe('OCCU');
    expect(cause).toBe('');
  });

  it('Speichern übergibt die getrimmte Todesursache als zweites Argument', async () => {
    const appState = createAppState();
    const ev = makeEvent('DEAT');
    const onSave = vi.fn();

    render(EventEditModal, { props: { appState, event: ev, label: 'Tod', cause: '', onSave, onClose: vi.fn() } });
    const causeInput = screen.getByText('Todesursache').querySelector('input') as HTMLInputElement;
    await fireEvent.input(causeInput, { target: { value: '  Typhus  ' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(onSave.mock.calls[0][1]).toBe('Typhus');
  });

  it('Abbrechen ruft onClose auf, ohne onSave aufzurufen', async () => {
    const appState = createAppState();
    const ev = makeEvent('OCCU');
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(EventEditModal, { props: { appState, event: ev, label: 'Beruf', onSave, onClose } });
    await fireEvent.click(screen.getByText('Abbrechen'));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('lässt ein unangetastetes date:null unangetastet (Tristate-Erhaltung, ADR-v9-30 Punkt 1)', async () => {
    const appState = createAppState();
    const ev = makeEvent('OCCU', { value: 'Bauer' });
    const onSave = vi.fn();

    render(EventEditModal, { props: { appState, event: ev, label: 'Beruf', onSave, onClose: vi.fn() } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(onSave.mock.calls[0][0].date).toBeNull();
  });

  it('berechnet das Datum neu, sobald ein Datumsfeld tatsächlich geändert wird', async () => {
    const appState = createAppState();
    const ev = makeEvent('OCCU');
    const onSave = vi.fn();

    render(EventEditModal, { props: { appState, event: ev, label: 'Beruf', onSave, onClose: vi.fn() } });
    await fireEvent.change(screen.getByLabelText('Jahr'), { target: { value: '1955' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(onSave.mock.calls[0][0].date).toBe('1955');
  });
});

describe('EventEditModal — Ort-/Hof-Picker (ADR-v9-42, byte-identisch zu PersonForm/FamilyForm)', () => {
  it('wählt einen bestehenden Ort über den Picker, verknüpft placeId und reprojiziert den Freitext', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');
    const ev = makeEvent('OCCU');
    const onSave = vi.fn();

    render(EventEditModal, { props: { appState, event: ev, label: 'Beruf', onSave, onClose: vi.fn() } });
    // EIN Feld (ADR-v9-103): kein 🔍-Knopf und kein zweites Suchfeld mehr — ein Klick
    // ins Ort-Feld öffnet die Vorschläge direkt.
    // EIN Feld (ADR-v9-103): kein 🔍-Knopf und kein zweites Suchfeld mehr — ein Klick
    // ins Ort-Feld öffnet die Vorschläge direkt.
    await fireEvent.click(screen.getByLabelText('Beruf Ort'));
    await fireEvent.click(screen.getByRole('option', { name: 'Ochtrup' }));
    await fireEvent.click(screen.getByText('Speichern'));

    const [updated] = onSave.mock.calls[0];
    expect(updated.placeId).toBe('@P1@');
    expect(updated.place).toBe('Ochtrup');
  });
});

describe('EventEditModal — Quellen-Widget', () => {
  it('fügt eine Quellen-Zitation hinzu und speichert sie mit dem Event', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.sources.set('@S1@', makeSource('@S1@', { abbr: 'KB Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');
    const ev = makeEvent('OCCU');
    const onSave = vi.fn();

    render(EventEditModal, { props: { appState, event: ev, label: 'Beruf', onSave, onClose: vi.fn() } });
    await fireEvent.click(screen.getByText('+ Quelle hinzufügen'));
    const pageInput = screen.getByLabelText('Beruf Seite 1') as HTMLInputElement;
    await fireEvent.change(pageInput, { target: { value: 'fol. 12' } });
    await fireEvent.click(screen.getByText('Speichern'));

    const [updated] = onSave.mock.calls[0];
    expect(updated.citations).toHaveLength(1);
    expect(updated.citations[0].sourceId).toBe('@S1@');
    expect(updated.citations[0].page).toBe('fol. 12');
  });

  it('behält eine bereits vorhandene Zitation beim Speichern, ohne sie anzutasten', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.sources.set('@S1@', makeSource('@S1@', { abbr: 'KB Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');
    const ev = makeEvent('OCCU', { citations: [makeCitation('@S1@', { page: 'p. 3' })] });
    const onSave = vi.fn();

    render(EventEditModal, { props: { appState, event: ev, label: 'Beruf', onSave, onClose: vi.fn() } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(onSave.mock.calls[0][0].citations).toHaveLength(1);
    expect(onSave.mock.calls[0][0].citations[0].page).toBe('p. 3');
  });
});

describe('EventEditModal — Neu-Anlage-Modus (mode="create", ADR-v9-63)', () => {
  it('zeigt "<Label> anlegen" statt "<Label> bearbeiten", wenn mode="create"', () => {
    const appState = createAppState();
    const ev = makeEvent('RESI');

    render(EventEditModal, {
      props: { appState, event: ev, label: 'Wohnort', mode: 'create', onSave: vi.fn(), onClose: vi.fn() },
    });

    expect(screen.getByText('Wohnort anlegen')).toBeTruthy();
    expect(screen.queryByText('Wohnort bearbeiten')).toBeNull();
  });

  it('zeigt weiterhin "<Label> bearbeiten", wenn mode weggelassen wird (Default "edit")', () => {
    const appState = createAppState();
    const ev = makeEvent('OCCU');

    render(EventEditModal, { props: { appState, event: ev, label: 'Beruf', onSave: vi.fn(), onClose: vi.fn() } });

    expect(screen.getByText('Beruf bearbeiten')).toBeTruthy();
  });

  it('speichert ein frisch angelegtes Event (makeEvent(tag)) über denselben onSave-Chokepoint wie beim Editieren', async () => {
    const appState = createAppState();
    const fresh = makeEvent('RESI');
    const onSave = vi.fn();

    render(EventEditModal, {
      props: { appState, event: fresh, label: 'Wohnort', mode: 'create', onSave, onClose: vi.fn() },
    });
    await fireEvent.input(screen.getByLabelText('Wert'), { target: { value: 'Ochtrup 12' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(onSave).toHaveBeenCalledTimes(1);
    const [updated] = onSave.mock.calls[0];
    expect(updated.type).toBe('RESI');
    expect(updated.value).toBe('Ochtrup 12');
  });
});

describe('EventEditModal — Modal-Schale (Backdrop/Escape)', () => {
  it('Klick auf den Backdrop ruft onClose auf', async () => {
    const appState = createAppState();
    const onClose = vi.fn();

    const { container } = render(EventEditModal, {
      props: { appState, event: makeEvent('OCCU'), label: 'Beruf', onSave: vi.fn(), onClose },
    });
    const backdrop = container.querySelector('.stb-modal-backdrop') as HTMLElement;
    await fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('Klick INNERHALB des Panels schließt NICHT (stopPropagation)', async () => {
    const appState = createAppState();
    const onClose = vi.fn();

    const { container } = render(EventEditModal, {
      props: { appState, event: makeEvent('OCCU'), label: 'Beruf', onSave: vi.fn(), onClose },
    });
    const panel = container.querySelector('.event-edit-modal__panel') as HTMLElement;
    await fireEvent.click(panel);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape-Taste ruft onClose auf', async () => {
    const appState = createAppState();
    const onClose = vi.fn();

    render(EventEditModal, { props: { appState, event: makeEvent('OCCU'), label: 'Beruf', onSave: vi.fn(), onClose } });
    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });
});
