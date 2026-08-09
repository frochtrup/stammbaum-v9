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
    place('@P1@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@KREIS@', from: 1816, to: 1974 , fromDate: null, toDate: null }] }),
  );
  appState.loadDatabase(db, 'test.ged');
  return appState;
}

describe('PlaceEnclosureEditModal — Rendering bestehender Zugehörigkeiten', () => {
  it('zeigt die bestehenden enclosedBy-Einträge mit Zeitraum — als Eingabefelder (ADR-v9-183)', () => {
    const appState = setup();

    render(PlaceEnclosureEditModal, { props: { appState, placeId: '@P1@', onClose: vi.fn() } });

    expect(screen.getByText('Kreis Steinfurt')).toBeTruthy();
    // Der Zeitraum steht nicht mehr als Text in Klammern da, sondern editierbar: er ist
    // Auswertungsgrundlage (enclosureWinnerAsOf), nicht bloß Beschriftung.
    expect((screen.getByLabelText('Kreis Steinfurt — gültig von (Jahr oder Stichtag)') as HTMLInputElement).value).toBe('1816');
    expect((screen.getByLabelText('Kreis Steinfurt — gültig bis (Jahr oder Stichtag)') as HTMLInputElement).value).toBe('1974');
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
          { placeId: '@A@', from: 1816, to: 1934 , fromDate: null, toDate: null },
          { placeId: '@C@', from: null, to: null , fromDate: null, toDate: null },
          { placeId: '@B@', from: 1300, to: 1813 , fromDate: null, toDate: null },
        ],
      }),
    );
    appState.loadDatabase(db, 'test.ged');

    render(PlaceEnclosureEditModal, { props: { appState, placeId: '@P1@', onClose: vi.fn() } });

    // `document` statt `container` (BL-278/§6k): der Backdrop hängt seit dem Portal am
    // <body> — dass die eingegrenzte Abfrage ihn NICHT mehr findet, ist der Nachweis,
    // dass der Vorfahre verlassen wurde, kein Fehler.
    const labels = Array.from(document.querySelectorAll('.place-enclosure-modal__list > li > span:first-child')).map(
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
          { placeId: '@A@', from: 1816, to: 1934 , fromDate: null, toDate: null },
          { placeId: '@B@', from: 1300, to: 1813 , fromDate: null, toDate: null },
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
    await fireEvent.input(screen.getByLabelText('Gültig von (Jahr oder Stichtag)'), { target: { value: '1816' } });
    await fireEvent.click(screen.getByText('+ Hinzufügen'));

    expect(appState.db.placeObjects.get('@P1@')?.enclosedBy).toEqual([{ placeId: '@P2@', from: 1816, to: null , fromDate: null, toDate: null }]);
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

    render(PlaceEnclosureEditModal, { props: { appState, placeId: '@P1@', onClose } });
    // `document` statt `container` (BL-278/§6k): der Backdrop hängt seit dem Portal am
    // <body> — dass die eingegrenzte Abfrage ihn NICHT mehr findet, ist der Nachweis,
    // dass der Vorfahre verlassen wurde, kein Fehler.
    const backdrop = document.querySelector('.stb-modal-backdrop') as HTMLElement;
    await fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('Klick INNERHALB des Panels schließt NICHT (stopPropagation)', async () => {
    const appState = setup();
    const onClose = vi.fn();

    render(PlaceEnclosureEditModal, { props: { appState, placeId: '@P1@', onClose } });
    // `document` statt `container` (BL-278/§6k): der Backdrop hängt seit dem Portal am
    // <body> — dass die eingegrenzte Abfrage ihn NICHT mehr findet, ist der Nachweis,
    // dass der Vorfahre verlassen wurde, kein Fehler.
    const panel = document.querySelector('.place-enclosure-modal__panel') as HTMLElement;
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

// ADR-v9-181 / BL-249 — die dritte Fundstelle desselben Befunds: das v8-Vorbild sortierte
// mit `from ?? 9999` und warf „nach unten offen" mit „undatiert" in einen Topf.
describe('PlaceEnclosureEditModal — drei Datierungs-Zustände in der Sortierung (ADR-v9-181)', () => {
  function ochtrup() {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@FUERST@', place('@FUERST@', { title: 'Fürstbistum Münster' }));
    db.placeObjects.set('@KREIS@', place('@KREIS@', { title: 'Kreis Steinfurt' }));
    db.placeObjects.set('@EGAL@', place('@EGAL@', { title: 'Ohne Datum' }));
    db.placeObjects.set(
      '@P1@',
      place('@P1@', {
        title: 'Ochtrup',
        enclosedBy: [
          { placeId: '@KREIS@', from: 1816, to: null , fromDate: null, toDate: null },
          { placeId: '@EGAL@', from: null, to: null , fromDate: null, toDate: null },
          { placeId: '@FUERST@', from: null, to: 1806 , fromDate: null, toDate: null },
        ],
      }),
    );
    appState.loadDatabase(db, 'test.ged');
    return appState;
  }

  it('stellt die nach unten offene Zuordnung an den ANFANG, die undatierte ans Ende', () => {
    const appState = ochtrup();

    render(PlaceEnclosureEditModal, {
      props: { appState, placeId: '@P1@', onClose: vi.fn() },
    });

    // `document` statt `container` (BL-278/§6k): der Backdrop hängt seit dem Portal am
    // <body> — dass die eingegrenzte Abfrage ihn NICHT mehr findet, ist der Nachweis,
    // dass der Vorfahre verlassen wurde, kein Fehler.
    const labels = Array.from(document.querySelectorAll('.place-enclosure-modal__parent')).map(
      (el) => el.textContent,
    );
    // Vorher stand „Fürstbistum Münster (…–1806)" UNTER „Kreis Steinfurt (1816–…)".
    expect(labels).toEqual(['Fürstbistum Münster', 'Kreis Steinfurt', 'Ohne Datum']);
  });
});

// ADR-v9-183 / BL-252 — der Zeitraum ist Auswertungsgrundlage, nicht Beschriftung.
describe('PlaceEnclosureEditModal — bestehende Zeiträume änderbar (ADR-v9-183)', () => {
  it('schreibt ein korrigiertes Von-Jahr über appState.savePlace, ohne die Position zu verlieren', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@A@', place('@A@', { title: 'Amt Ochtrup' }));
    db.placeObjects.set('@B@', place('@B@', { title: 'Kreis Steinfurt' }));
    db.placeObjects.set(
      '@P1@',
      place('@P1@', {
        title: 'Ochtrup',
        enclosedBy: [
          { placeId: '@A@', from: 1700, to: 1815 , fromDate: null, toDate: null },
          { placeId: '@B@', from: 1861, to: null , fromDate: null, toDate: null }, // Zahlendreher: soll 1816 heißen
        ],
      }),
    );
    appState.loadDatabase(db, 'test.ged');

    render(PlaceEnclosureEditModal, { props: { appState, placeId: '@P1@', onClose: vi.fn() } });
    await fireEvent.change(screen.getByLabelText('Kreis Steinfurt — gültig von (Jahr oder Stichtag)'), {
      target: { value: '1816' },
    });

    expect(appState.db.placeObjects.get('@P1@')?.enclosedBy).toEqual([
      { placeId: '@A@', from: 1700, to: 1815 , fromDate: null, toDate: null },
      { placeId: '@B@', from: 1816, to: null , fromDate: null, toDate: null },
    ]);
  });

  it('macht die Zuordnung nach unten offen, wenn das Von-Feld GELEERT wird (nicht Jahr 0)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@FUERST@', place('@FUERST@', { title: 'Fürstbistum Münster' }));
    db.placeObjects.set(
      '@P1@',
      place('@P1@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@FUERST@', from: 1500, to: 1806 , fromDate: null, toDate: null }] }),
    );
    appState.loadDatabase(db, 'test.ged');

    render(PlaceEnclosureEditModal, { props: { appState, placeId: '@P1@', onClose: vi.fn() } });
    await fireEvent.change(screen.getByLabelText('Fürstbistum Münster — gültig von (Jahr oder Stichtag)'), {
      target: { value: '' },
    });

    expect(appState.db.placeObjects.get('@P1@')?.enclosedBy).toEqual([
      { placeId: '@FUERST@', from: null, to: 1806 , fromDate: null, toDate: null },
    ]);
  });

  it('trifft trotz sortierter Anzeige die RICHTIGE (rohe Array-Index-)Zugehörigkeit', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.placeObjects.set('@A@', place('@A@', { title: 'Amt Ochtrup' }));
    db.placeObjects.set('@B@', place('@B@', { title: 'Grafschaft Steinfurt' }));
    db.placeObjects.set(
      '@P1@',
      place('@P1@', {
        title: 'Ochtrup',
        // @A@ (1816) steht im ROHEN Array vor @B@ (…–1300), angezeigt wird @B@ zuerst.
        enclosedBy: [
          { placeId: '@A@', from: 1816, to: null , fromDate: null, toDate: null },
          { placeId: '@B@', from: null, to: 1300 , fromDate: null, toDate: null },
        ],
      }),
    );
    appState.loadDatabase(db, 'test.ged');

    render(PlaceEnclosureEditModal, { props: { appState, placeId: '@P1@', onClose: vi.fn() } });
    await fireEvent.change(screen.getByLabelText('Grafschaft Steinfurt — gültig bis (Jahr oder Stichtag)'), {
      target: { value: '1350' },
    });

    expect(appState.db.placeObjects.get('@P1@')?.enclosedBy).toEqual([
      { placeId: '@A@', from: 1816, to: null , fromDate: null, toDate: null },
      { placeId: '@B@', from: null, to: 1350 , fromDate: null, toDate: null },
    ]);
  });
});
