// @vitest-environment happy-dom
// tests/ui/PlaceEnclosureEditModal.component.test.ts — Bearbeitungs-Modal für die
// direkte Verwaltungszugehörigkeit (Bau-Auftrag "Orts-Detailansicht": "die direkte
// Zuordnung … wandert in den Bearbeiten-Modal"). Deckt Rendering der bestehenden
// enclosedBy-Einträge, Hinzufügen/Entfernen (appState.savePlace-Chokepoint) UND die
// Modal-Schale (Backdrop-Klick/Escape schließt, Panel-Klick nicht — analog
// EventEditModal.component.test.ts, INV-UI-4-Muster) ab.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import PlaceEnclosureEditModal from '../../ui/views/place/PlaceEnclosureEditModal.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase } from '../../core/model';
import { place } from '../core/places-fixtures';

function setup() {
  const appState = createAppState();
  const db = makeDatabase();
  db.placeObjects.set('@KREIS@', place('@KREIS@', { title: 'Kreis Steinfurt' }));
  db.placeObjects.set(
    '@P1@',
    place('@P1@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@KREIS@', from: 1816, to: 1974 }] }),
  );
  appState.loadDatabase(db, 'test.ged');
  return appState;
}

describe('PlaceEnclosureEditModal — Rendering bestehender Zugehörigkeiten', () => {
  it('zeigt die bestehenden enclosedBy-Einträge mit Zeitraum', () => {
    const appState = setup();

    render(PlaceEnclosureEditModal, { props: { appState, placeId: '@P1@', onClose: vi.fn() } });

    expect(screen.getByText('Kreis Steinfurt')).toBeTruthy();
    expect(screen.getByText('(1816–1974)')).toBeTruthy();
  });

  it('sortiert die Liste nach Beginn-Jahr, undatierte Einträge ans Ende (v8-Vorbild)', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@A@', place('@A@', { title: 'Amt Ochtrup' }));
    db.placeObjects.set('@B@', place('@B@', { title: 'Grafschaft Steinfurt' }));
    db.placeObjects.set('@C@', place('@C@', { title: 'Kreis Steinfurt (undatiert)' }));
    db.placeObjects.set(
      '@P1@',
      place('@P1@', {
        title: 'Ochtrup',
        // Bewusst NICHT chronologisch im Array (wie ein Import/Merge es hinterlassen kann).
        enclosedBy: [
          { placeId: '@A@', from: 1816, to: 1934 },
          { placeId: '@C@', from: null, to: null },
          { placeId: '@B@', from: 1300, to: 1813 },
        ],
      }),
    );
    appState.loadDatabase(db, 'test.ged');

    const { container } = render(PlaceEnclosureEditModal, { props: { appState, placeId: '@P1@', onClose: vi.fn() } });

    const labels = Array.from(container.querySelectorAll('.place-enclosure-modal__list > li > span:first-child')).map(
      (el) => el.textContent,
    );
    expect(labels).toEqual(['Grafschaft Steinfurt', 'Amt Ochtrup', 'Kreis Steinfurt (undatiert)']);
  });

  it('entfernt trotz sortierter Anzeige die RICHTIGE (rohe Array-Index-)Zugehörigkeit', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@A@', place('@A@', { title: 'Amt Ochtrup' }));
    db.placeObjects.set('@B@', place('@B@', { title: 'Grafschaft Steinfurt' }));
    db.placeObjects.set(
      '@P1@',
      place('@P1@', {
        title: 'Ochtrup',
        // @A@ (1816) steht im rohen Array VOR @B@ (1300), aber @B@ erscheint sortiert
        // zuerst in der Anzeige -- ein Klick auf @B@s Entfernen-Button darf NICHT
        // fälschlich den rohen Index 0 (@A@) treffen.
        enclosedBy: [
          { placeId: '@A@', from: 1816, to: 1934 },
          { placeId: '@B@', from: 1300, to: 1813 },
        ],
      }),
    );
    appState.loadDatabase(db, 'test.ged');

    render(PlaceEnclosureEditModal, { props: { appState, placeId: '@P1@', onClose: vi.fn() } });
    const removeButtons = screen.getAllByLabelText('Zugehörigkeit entfernen');
    await fireEvent.click(removeButtons[0]!); // erste ANGEZEIGTE Zeile = Grafschaft Steinfurt

    expect(appState.db.placeObjects.get('@P1@')?.enclosedBy.map((e) => e.placeId)).toEqual(['@A@']);
  });

  it('zeigt einen Leer-Hinweis, wenn noch keine Zugehörigkeit erfasst ist', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');

    render(PlaceEnclosureEditModal, { props: { appState, placeId: '@P1@', onClose: vi.fn() } });

    expect(screen.getByText('Noch keine Verwaltungszugehörigkeit erfasst.')).toBeTruthy();
  });

  it('zeigt einen Fallback-Hinweis, wenn der Ort nicht (mehr) existiert', () => {
    const appState = createAppState();

    render(PlaceEnclosureEditModal, { props: { appState, placeId: '@FEHLT@', onClose: vi.fn() } });

    expect(screen.getByText('Ort nicht (mehr) gefunden.')).toBeTruthy();
  });
});

describe('PlaceEnclosureEditModal — Hinzufügen/Entfernen über appState.savePlace', () => {
  it('entfernt eine bestehende Zugehörigkeit per ✕-Button', async () => {
    const appState = setup();

    render(PlaceEnclosureEditModal, { props: { appState, placeId: '@P1@', onClose: vi.fn() } });
    await fireEvent.click(screen.getByLabelText('Zugehörigkeit entfernen'));

    expect(appState.db.placeObjects.get('@P1@')?.enclosedBy).toEqual([]);
  });

  it('fügt eine neue Zugehörigkeit über den Picker + Von/Bis-Jahr hinzu', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    db.placeObjects.set('@P2@', place('@P2@', { title: 'Kreis Steinfurt' }));
    appState.loadDatabase(db, 'test.ged');

    render(PlaceEnclosureEditModal, { props: { appState, placeId: '@P1@', onClose: vi.fn() } });
    await fireEvent.click(screen.getByLabelText('Übergeordneter Ort'));
    await fireEvent.click(screen.getByText('Kreis Steinfurt'));
    await fireEvent.input(screen.getByLabelText('Gültig von (Jahr)'), { target: { value: '1816' } });
    await fireEvent.click(screen.getByText('+ Hinzufügen'));

    expect(appState.db.placeObjects.get('@P1@')?.enclosedBy).toEqual([{ placeId: '@P2@', from: 1816, to: null }]);
  });

  it('bietet "+ neuen Ort anlegen" im Picker an (ADR-v9-42)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');

    render(PlaceEnclosureEditModal, { props: { appState, placeId: '@P1@', onClose: vi.fn() } });
    await fireEvent.click(screen.getByLabelText('Übergeordneter Ort'));
    await fireEvent.click(screen.getByText('+ neuen Ort anlegen …'));

    const placeFormEl = screen.getByText('Neuer Ort').closest('.place-form') as HTMLElement;
    expect(placeFormEl).toBeTruthy();
    await fireEvent.input(screen.getByLabelText('Name (neuer Ort)'), { target: { value: 'Kreis Steinfurt' } });
    await fireEvent.click(within(placeFormEl).getByText('Speichern'));

    const created = Array.from(appState.db.placeObjects.values()).find((p) => p.title === 'Kreis Steinfurt');
    expect(created).toBeTruthy();
    await fireEvent.click(screen.getByText('+ Hinzufügen'));

    expect(appState.db.placeObjects.get('@P1@')?.enclosedBy.map((e) => e.placeId)).toEqual([created!.id]);
  });
});

describe('PlaceEnclosureEditModal — Modal-Schale (Backdrop/Escape, INV-UI-4)', () => {
  it('Klick auf den Backdrop ruft onClose auf', async () => {
    const appState = setup();
    const onClose = vi.fn();

    const { container } = render(PlaceEnclosureEditModal, { props: { appState, placeId: '@P1@', onClose } });
    const backdrop = container.querySelector('.stb-modal-backdrop') as HTMLElement;
    await fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('Klick INNERHALB des Panels schließt NICHT (stopPropagation)', async () => {
    const appState = setup();
    const onClose = vi.fn();

    const { container } = render(PlaceEnclosureEditModal, { props: { appState, placeId: '@P1@', onClose } });
    const panel = container.querySelector('.place-enclosure-modal__panel') as HTMLElement;
    await fireEvent.click(panel);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape-Taste ruft onClose auf', async () => {
    const appState = setup();
    const onClose = vi.fn();

    render(PlaceEnclosureEditModal, { props: { appState, placeId: '@P1@', onClose } });
    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('"Fertig"-Button ruft onClose auf', async () => {
    const appState = setup();
    const onClose = vi.fn();

    render(PlaceEnclosureEditModal, { props: { appState, placeId: '@P1@', onClose } });
    await fireEvent.click(screen.getByText('Fertig'));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
