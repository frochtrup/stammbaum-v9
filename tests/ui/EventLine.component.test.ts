// @vitest-environment happy-dom
// tests/ui/EventLine.component.test.ts — geteilte Ereigniszeile (ADR-v9-80, Spec 32 §6).
// Ersetzt die vorher byte-identisch duplizierten `{#snippet eventRow}`-Kopien in
// PersonDetail.svelte/FamilyDetail.svelte — hier isoliert getestet (INV-UI-4).
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import EventLine from '../../ui/shell/EventLine.svelte';
import { dedupeAddrNote, displayEventValue, type EventLineRow } from '../../ui/shell/event-line-row';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeCitation, makeDatabase, makeSource } from '../../core/model';
// Geteilte Datenfabrik statt Inline-Literal (TST-REUSE, s. app-state.test.ts).
import { place } from '../core/places-fixtures';

function row(patch: Partial<EventLineRow> = {}): EventLineRow {
  return {
    key: 'BIRT',
    label: 'Geburt',
    dateLabel: '',
    placeLabel: '',
    value: '',
    addr: '',
    note: '',
    citations: [],
    coords: null,
    placeId: null,
    hofId: null,
    empty: false,
    ...patch,
  };
}

describe('EventLine — Datum + klickbarer Ort (ADR-v9-80 Punkt 1)', () => {
  it('rendert "Datum, Ort" mit dem Ort als klickbarem Link, wenn placeId + onNavigateToPlace vorhanden sind', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const onNavigateToPlace = vi.fn();

    render(EventLine, {
      props: {
        ev: row({ dateLabel: '12. März 1890', placeLabel: 'Ochtrup', placeId: '@P1@' }),
        appState,
        viewState,
        onNavigateToPlace,
        onEdit: vi.fn(),
      },
    });

    expect(screen.getByText(/12\. März 1890/)).toBeTruthy();
    const link = screen.getByRole('button', { name: 'Ochtrup' });
    await fireEvent.click(link);
    expect(onNavigateToPlace).toHaveBeenCalledWith('@P1@');
  });

  it('Hof hat Priorität vor Ort, wenn beide gesetzt sind (hofId > placeId)', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const onNavigateToPlace = vi.fn();
    const onNavigateToHof = vi.fn();

    render(EventLine, {
      props: {
        ev: row({ dateLabel: '1950', placeLabel: 'Wall 33', placeId: '@P1@', hofId: '@H1@' }),
        appState,
        viewState,
        onNavigateToPlace,
        onNavigateToHof,
        onEdit: vi.fn(),
      },
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Wall 33' }));

    expect(onNavigateToHof).toHaveBeenCalledWith('@H1@');
    expect(onNavigateToPlace).not.toHaveBeenCalled();
  });

  it('unaufgelöster Freitext-Ort (keine placeId/hofId) bleibt unverlinkter Text — kein Link ohne Ziel', () => {
    const appState = createAppState();
    const viewState = createViewState();

    render(EventLine, {
      props: {
        ev: row({ dateLabel: '1950', placeLabel: 'Irgendwo' }),
        appState,
        viewState,
        onNavigateToPlace: vi.fn(),
        onEdit: vi.fn(),
      },
    });

    expect(screen.queryByRole('button', { name: 'Irgendwo' })).toBeNull();
    expect(screen.getByText('Irgendwo')).toBeTruthy();
  });

  it('placeId gesetzt, aber KEIN onNavigateToPlace-Callback übergeben: bleibt unverlinkter Text', () => {
    const appState = createAppState();
    const viewState = createViewState();

    render(EventLine, {
      props: {
        ev: row({ dateLabel: '1950', placeLabel: 'Ochtrup', placeId: '@P1@' }),
        appState,
        viewState,
        onEdit: vi.fn(),
      },
    });

    expect(screen.queryByRole('button', { name: 'Ochtrup' })).toBeNull();
    expect(screen.getByText('Ochtrup')).toBeTruthy();
  });

  // Regression: das Trennzeichen stand als literales `, ` im `{#if}`-Block, dessen
  // nachlaufendes Leerzeichen Svelte beim Kompilieren wegtrimmt → "1930,Ochtrup".
  // Deshalb jetzt als Ausdruck `{', '}`, den der Whitespace-Trim nicht anfasst.
  it('trennt Datum und Ort mit Komma UND Leerzeichen', () => {
    const appState = createAppState();
    const viewState = createViewState();

    const { container } = render(EventLine, {
      props: {
        ev: row({ dateLabel: '1930', placeLabel: 'Ochtrup', placeId: '@P1@' }),
        appState,
        viewState,
        onNavigateToPlace: vi.fn(),
        onEdit: vi.fn(),
      },
    });

    expect(container.querySelector('.event-line__date')?.textContent).toBe('1930, Ochtrup');
  });

  // Der Orts-Link ist bewusst ein `role="button"`-Span statt eines <button>: ein
  // Button ist ein atomarer Inline-Block und kann lange Ortsketten nicht über
  // Zeilen umbrechen (Begründung am CSS in EventLine.svelte). happy-dom kennt kein
  // Layout — geprüft wird deshalb das Element, das den Umbruch überhaupt zulässt.
  it('rendert den Orts-Link als umbruchfähiges Inline-Element, nicht als <button>', () => {
    const appState = createAppState();
    const viewState = createViewState();

    render(EventLine, {
      props: {
        ev: row({ dateLabel: '1930', placeLabel: 'Ochtrup', placeId: '@P1@' }),
        appState,
        viewState,
        onNavigateToPlace: vi.fn(),
        onEdit: vi.fn(),
      },
    });

    expect(screen.getByRole('button', { name: 'Ochtrup' }).tagName).toBe('SPAN');
  });

  it('Orts-Link ist per Tastatur bedienbar (Enter), da kein natives <button> mehr', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const onNavigateToPlace = vi.fn();

    render(EventLine, {
      props: {
        ev: row({ dateLabel: '1930', placeLabel: 'Ochtrup', placeId: '@P1@' }),
        appState,
        viewState,
        onNavigateToPlace,
        onEdit: vi.fn(),
      },
    });

    const link = screen.getByRole('button', { name: 'Ochtrup' });
    expect(link.getAttribute('tabindex')).toBe('0');
    await fireEvent.keyDown(link, { key: 'Enter' });
    expect(onNavigateToPlace).toHaveBeenCalledWith('@P1@');
  });
});

describe('EventLine — CoordIndicator statt "Karte ↗"-Text-Link (ADR-v9-80 Punkt 2)', () => {
  it('zeigt den CoordIndicator (gefüllter Glyph), wenn das Ereignis Koordinaten hat', () => {
    const appState = createAppState();
    const viewState = createViewState();

    render(EventLine, {
      props: {
        ev: row({ dateLabel: '1950', coords: { lat: 52.1, long: 7.6 } }),
        appState,
        viewState,
        onEdit: vi.fn(),
      },
    });

    expect(screen.getByText('◎')).toBeTruthy();
    expect(screen.queryByText('Karte ↗')).toBeNull();
  });

  it('zeigt KEINEN CoordIndicator, wenn die Zeile weder Koordinaten noch einen Ort hat', () => {
    const appState = createAppState();
    const viewState = createViewState();

    render(EventLine, {
      props: { ev: row({ value: 'Bauer' }), appState, viewState, onEdit: vi.fn() },
    });

    expect(screen.queryByText('◎')).toBeNull();
    expect(screen.queryByText('◌')).toBeNull();
  });

  it('Klick auf den Glyph setzt lensPlaceFocus (hofId > placeId) und ruft onNavigateLens("map") auf — Hof trägt eigene Koordinaten', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const onNavigateLens = vi.fn();
    appState.db.hofObjects.set('@H1@', {
      id: '@H1@',
      villageId: '@P1@',
      addrs: [],
      lat: 52.1,
      long: 7.6,
      note: '',
      existsFrom: null,
      existsTo: null,
      predecessor: null,
      successor: null,
      govId: null,
      govTypes: null,
      schemaVersion: 1,
    });

    render(EventLine, {
      props: {
        ev: row({ dateLabel: '1950', coords: { lat: 52.1, long: 7.6 }, placeId: '@P1@', hofId: '@H1@' }),
        appState,
        viewState,
        onNavigateLens,
        onEdit: vi.fn(),
      },
    });

    await fireEvent.click(screen.getByText('◎'));

    expect(viewState.getCurrent('lensPlaceFocus')).toBe('@H1@');
    expect(onNavigateLens).toHaveBeenCalledWith('map');
  });

  it('Ereignis mit NUR Fallback-Koordinaten (ev.lati/long, PlaceObject selbst ohne eigene lat/long) zentriert TROTZDEM über setMapCoordFocus, unabhängig von einem kuratierten Marker — ADR-v9-78-Nachtrag: Event-Koordinaten sind oft präziser als Orts-Koordinaten (z. B. ein Geburtshaus)', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const onNavigateLens = vi.fn();
    // Realistischer Fall: frisch geseedetes PlaceObject (ADR-v9-28/44) OHNE eigene
    // Koordinaten — `ev.coords` kommt hier ausschließlich aus dem `ev.lati/long`-
    // Fallback (eventCoords-Chokepoint, Spec 11 §5), NICHT vom PlaceObject selbst.
    appState.db.placeObjects.set('@P1@', place('@P1@', { title: 'Rheine' }));

    render(EventLine, {
      props: {
        ev: row({ dateLabel: '1930', placeLabel: 'Rheine', coords: { lat: 52.28, long: 7.43 }, placeId: '@P1@' }),
        appState,
        viewState,
        onNavigateLens,
        onEdit: vi.fn(),
      },
    });

    await fireEvent.click(screen.getByText('◎'));

    // Zentriert auf die exakten Event-Koordinaten (Karte-Insel zeichnet dafür einen
    // Ad-hoc-Marker, s. leaflet-map.ts/svg-fallback-map.ts) — das ist jetzt der
    // primäre, IMMER wirksame Sprung. `lensPlaceFocus` wird trotzdem auf `@P1@`
    // gesetzt (EventLine reicht jede aufgelöste placeId/hofId unconditional durch,
    // s. dortiger Kommentar) — harmlos: die Karte-Insel findet dafür keinen
    // kuratierten Marker (kein eigenes `lat`/`long` auf `@P1@`) und hebt schlicht
    // nichts zusätzlich hervor, zentriert aber trotzdem korrekt über die Koordinate.
    expect(viewState.getMapCoordFocus()).toEqual({ lat: 52.28, long: 7.43 });
    expect(viewState.getCurrent('lensPlaceFocus')).toBe('@P1@');
    expect(onNavigateLens).toHaveBeenCalledWith('map');
  });
});

describe('EventLine — Quellen-Badges (unverändert übernommen)', () => {
  it('rendert eine §N-Badge je Zitat', () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.sources.set('@S42@', makeSource('@S42@', { abbr: 'KB Ochtrup' }));
    appState.loadDatabase(db, 'test.ged');

    render(EventLine, {
      props: {
        ev: row({ citations: [makeCitation('@S42@', { quay: 3 })] }),
        appState,
        viewState,
        onEdit: vi.fn(),
      },
    });

    const badge = screen.getByText('§42');
    expect(badge.querySelector('.quay-meter')?.getAttribute('data-quay')).toBe('3');
  });
});

describe('EventLine — ✕-Rücknahme + ✎-Bearbeiten', () => {
  it('zeigt das ✕-Control nur, wenn empty=true UND onRetract übergeben wurde', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const onRetract = vi.fn();

    const { unmount } = render(EventLine, {
      props: { ev: row({ empty: true }), appState, viewState, onRetract, onEdit: vi.fn() },
    });
    await fireEvent.click(screen.getByLabelText('Geburt zurücknehmen'));
    expect(onRetract).toHaveBeenCalledWith('BIRT');
    unmount();

    render(EventLine, { props: { ev: row({ empty: true }), appState, viewState, onEdit: vi.fn() } });
    expect(screen.queryByLabelText('Geburt zurücknehmen')).toBeNull();
  });

  it('ruft onEdit mit dem Zeilen-Key auf', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const onEdit = vi.fn();

    render(EventLine, { props: { ev: row({ key: 'ev-2' }), appState, viewState, onEdit } });
    await fireEvent.click(screen.getByLabelText('Geburt bearbeiten'));

    expect(onEdit).toHaveBeenCalledWith('ev-2');
  });
});

describe('EventLine — Note/Addr/Value', () => {
  it('rendert addr, value und note, wenn gesetzt', () => {
    const appState = createAppState();
    const viewState = createViewState();

    render(EventLine, {
      props: {
        ev: row({ value: 'Bauer', addr: 'Wall 33', note: 'Anmerkung' }),
        appState,
        viewState,
        onEdit: vi.fn(),
      },
    });

    expect(screen.getByText('Bauer')).toBeTruthy();
    expect(screen.getByText('Wall 33')).toBeTruthy();
    expect(screen.getByText('Anmerkung')).toBeTruthy();
  });

  // §10k/BL-71 (ADR-v9-53 Punkt 12): addr==note (Franz Ransmanns GRAD-Ereignis) darf
  // nicht doppelt erscheinen — der Notiz-Absatz entfällt, addr bleibt in der Kopfzeile.
  it('unterdrückt den Notiz-Absatz, wenn note zeichengleich zu addr ist (kein Doppel)', () => {
    const appState = createAppState();
    const viewState = createViewState();

    const { container } = render(EventLine, {
      props: {
        ev: row({ addr: 'Gronauer Str. 30', note: 'Gronauer Str. 30' }),
        appState,
        viewState,
        onEdit: vi.fn(),
      },
    });

    // addr steht weiter in der Kopfzeile …
    expect(container.querySelector('.event-line__value')?.textContent).toBe('Gronauer Str. 30');
    // … der redundante Notiz-Absatz ist weg (genau EIN Vorkommen des Textes).
    expect(container.querySelector('.event-line__note')).toBeNull();
    expect(screen.getAllByText('Gronauer Str. 30')).toHaveLength(1);
  });

  it('behält den Notiz-Absatz, wenn note etwas Anderes trägt als addr/value', () => {
    const appState = createAppState();
    const viewState = createViewState();

    const { container } = render(EventLine, {
      props: {
        ev: row({ addr: 'Wall 33', note: 'zusätzliche Anmerkung' }),
        appState,
        viewState,
        onEdit: vi.fn(),
      },
    });

    expect(container.querySelector('.event-line__note')?.textContent).toBe('zusätzliche Anmerkung');
  });
});

// #1 (2026-07-25): GEDCOM-Struktur-Flag `value='Y'` ("Ereignis fand statt, keine
// Details") darf NICHT als nackter Wert erscheinen — die auslösende Beobachtung war
// "Heirat Y" im Familien-Detail. Zentral in der geteilten Ereigniszeile gefiltert, damit
// die strukturgleiche Geschwister-Stelle zur längst gelösten Todes-Sonderbehandlung
// mitzieht (INV-UI-4).
describe('EventLine — GEDCOM-Flag value="Y" wird nicht als Wert angezeigt (#1)', () => {
  it('zeigt für eine Heirat mit value="Y" KEINEN Wert-Text', () => {
    const appState = createAppState();
    const viewState = createViewState();

    const { container } = render(EventLine, {
      props: {
        ev: row({ key: 'MARR', label: 'Heirat', value: 'Y' }),
        appState,
        viewState,
        onEdit: vi.fn(),
      },
    });

    expect(screen.getByText('Heirat')).toBeTruthy();
    expect(screen.queryByText('Y')).toBeNull();
    expect(container.querySelector('.event-line__value')).toBeNull();
  });

  it('lässt einen echten Wert (z. B. Beruf) unverändert stehen', () => {
    const appState = createAppState();
    const viewState = createViewState();

    const { container } = render(EventLine, {
      props: { ev: row({ label: 'Beruf', value: 'Lehrer' }), appState, viewState, onEdit: vi.fn() },
    });

    expect(container.querySelector('.event-line__value')?.textContent).toBe('Lehrer');
  });
});

describe('displayEventValue (#1, reine Logik)', () => {
  it('blankt den GEDCOM-Flag-Wert "Y"', () => {
    expect(displayEventValue('Y')).toBe('');
  });

  it('blankt "Y" auch mit umgebendem Whitespace', () => {
    expect(displayEventValue('  Y ')).toBe('');
  });

  it('lässt echte Werte unverändert (inkl. ungetrimmt)', () => {
    expect(displayEventValue('Lehrer')).toBe('Lehrer');
    expect(displayEventValue('  Bauer ')).toBe('  Bauer ');
  });

  it('trifft NUR das exakte Großbuchstaben-Token, nicht "Yes"/"y"/enthaltenes Y', () => {
    expect(displayEventValue('Yes')).toBe('Yes');
    expect(displayEventValue('y')).toBe('y');
    expect(displayEventValue('Y2')).toBe('Y2');
  });
});

describe('dedupeAddrNote (§10k/BL-71, reine Logik)', () => {
  it('blankt note, wenn zeichengleich zu addr', () => {
    expect(dedupeAddrNote({ note: 'Gronauer Str. 30', addr: 'Gronauer Str. 30', value: '' })).toBe('');
  });

  it('blankt note, wenn zeichengleich zu value', () => {
    expect(dedupeAddrNote({ note: 'Bauer', addr: '', value: 'Bauer' })).toBe('');
  });

  it('vergleicht getrimmt, gibt aber den ungetrimmten Originalwert zurück', () => {
    expect(dedupeAddrNote({ note: '  Wall 33 ', addr: 'Wall 33', value: '' })).toBe('');
    expect(dedupeAddrNote({ note: 'Wall 33', addr: '', value: 'etwas Anderes' })).toBe('Wall 33');
  });

  it('leere Notiz bleibt leer, kollidiert nicht mit leerem addr/value', () => {
    expect(dedupeAddrNote({ note: '', addr: '', value: '' })).toBe('');
    expect(dedupeAddrNote({ note: '   ', addr: '', value: '' })).toBe('   ');
  });

  // REALER Fall (Franz Ransmanns GRAD, MeineDaten_ancestris.ged L819/821): `2 ADDR` trägt
  // eine `3 CONT`-Fortsetzung, die collectText mit `\n` in addr faltet — note gleicht nur
  // der ERSTEN Adresszeile, nicht dem ganzen addr. Muss trotzdem entdedupt werden.
  it('blankt note, wenn sie der ersten Adresszeile entspricht (ADDR mit CONT-Fortsetzung)', () => {
    expect(
      dedupeAddrNote({
        note: 'Staatl. Ing,. Schule für Bauwesen',
        addr: 'Staatl. Ing,. Schule für Bauwesen\nMünster',
        value: '',
      }),
    ).toBe('');
  });

  // Kein Teilstring-Schlucken: eine note, die nur ein Präfix EINER Adresszeile ist (keine
  // ganze Zeile), bleibt erhalten — „Bauer" ist nicht dasselbe wie „Bauernhof".
  it('lässt eine note stehen, die bloß Teilstring (nicht ganze Zeile) von addr ist', () => {
    expect(dedupeAddrNote({ note: 'Bauer', addr: 'Bauernhof', value: '' })).toBe('Bauer');
  });
});
