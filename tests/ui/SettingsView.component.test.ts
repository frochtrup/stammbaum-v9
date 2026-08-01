// @vitest-environment happy-dom
// tests/ui/SettingsView.component.test.ts — BL-257/ADR-v9-188: die Einstellungen-Fläche.
//
// Zwei Dinge werden hier festgehalten, die man sonst leicht wieder verliert:
//  1. Der Medien-Ordner sagt SELBST, dass er nicht mitreist (Kategorie A) — und die
//     Zuordnungs-Bilanz nennt die drei Zahlen, wegen derer es den Abschnitt gibt.
//  2. Der app-data.json-Transport ist UMGEZOGEN, nicht kopiert: er steht hier und
//     NICHT mehr in der Datei-Fläche (INV-UI-2). Der zweite Teil wird in
//     MoreView.component.test.ts geprüft — hier der erste.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import SettingsView from '../../ui/views/settings/SettingsView.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createMediaResolver } from '../../services/media/media-resolver';
import type { MediaFolderAdapter, MediaFolderEntry } from '../../services/media/types';
import { makeDatabase, makeMedia } from '../../core/model';

function db() {
  const d = makeDatabase();
  d.media.set('Pictures/bardel.jpg', makeMedia('Pictures/bardel.jpg', { title: 'Bardel' }));
  d.media.set('Pictures/weg.jpg', makeMedia('Pictures/weg.jpg', { title: 'Weg' }));
  d.media.set('marianne.jpg', makeMedia('marianne.jpg', { title: 'Marianne' }));
  // Ein Weblink und ein eingebettetes Bild — beide brauchen KEINEN Ordner und dürfen die
  // Bilanz nicht verschlechtern.
  d.media.set('https://data.matricula-online.eu/x/', makeMedia('https://data.matricula-online.eu/x/'));
  d.media.set('data:image/png;base64,AA', makeMedia('data:image/png;base64,AA'));
  return d;
}

function adapter(paths: string[], over: Partial<MediaFolderAdapter> = {}): MediaFolderAdapter {
  const entries: MediaFolderEntry[] = paths.map((p) => ({
    path: p,
    name: p.split('/').pop() ?? p,
    handle: {},
  }));
  return {
    isSupported: () => true,
    pick: async () => ({ name: 'Genealogie' }),
    requestPermission: async () => true,
    nameOf: (h) => (h as { name?: string })?.name ?? '',
    listFiles: async () => entries,
    readFile: async () => new Blob(['x']),
    ...over,
  };
}

function memStore() {
  let v: unknown = null;
  return {
    load: async () => v,
    save: async (h: unknown) => {
      v = h;
    },
    clear: async () => {
      v = null;
    },
  };
}

function resolver(paths: string[], over: Partial<MediaFolderAdapter> = {}) {
  return createMediaResolver({
    adapter: adapter(paths, over),
    store: memStore(),
    createObjectUrl: () => 'blob:x',
    revokeObjectUrl: () => {},
  });
}

function mount(mediaResolver: ReturnType<typeof resolver>) {
  const appState = createAppState();
  appState.loadDatabase(db(), 'test.ged');
  return render(SettingsView, { props: { appState, mediaResolver } });
}

describe('SettingsView — Medien-Ordner', () => {
  it('sagt ohne Ordner, wie viele Verweise dadurch unauflösbar sind', () => {
    mount(resolver([]));
    // Drei Dateipfade im Bestand; Weblink und data:-URI zählen NICHT mit — sonst läse
    // sich die Zeile als „5 fehlen", obwohl zwei davon gar keinen Ordner brauchen.
    expect(screen.getByTestId('media-folder-status').textContent).toContain(
      'Nichts verbunden — 3 Dateiverweise sind daher nicht auflösbar.',
    );
  });

  it('kennzeichnet den Abschnitt als gerätegebunden — er reist NICHT mit', () => {
    mount(resolver([]));
    expect(screen.getByText(/Nur auf diesem Gerät · reist nicht mit/)).toBeTruthy();
  });

  it('nennt nach dem Verbinden gefunden / fehlend / nur-über-Dateinamen', async () => {
    const r = resolver(['Pictures/bardel.jpg', 'Fotos/marianne.jpg']);
    mount(r);

    await fireEvent.click(screen.getByRole('button', { name: 'Ordner wählen' }));
    await waitFor(() =>
      expect(screen.getByTestId('media-folder-status').textContent).toContain('Genealogie'),
    );

    const text = screen.getByTestId('media-folder-status').textContent ?? '';
    expect(text).toContain('2 von 3 Verweisen gefunden');
    expect(text).toContain('1 fehlen');
    // `marianne.jpg` liegt im Ordner unter `Fotos/`, im Bestand ohne Ordner — der Treffer
    // ist unscharf und wird als solcher benannt statt verschwiegen (ADR-v9-187 Punkt 5).
    expect(text).toContain('1 nur über den Dateinamen zugeordnet');
  });

  it('zeigt auf Plattformen ohne Ordner-API keinen toten Knopf', () => {
    mount(resolver([], { isSupported: () => false }));
    expect(screen.queryByRole('button', { name: /Ordner wählen/ })).toBeNull();
    expect(screen.getByText(/kann keine Ordner freigeben/)).toBeTruthy();
  });

  it('ein abgebrochener Ordner-Dialog ändert nichts und sagt es', async () => {
    mount(resolver([], { pick: async () => null }));
    await fireEvent.click(screen.getByRole('button', { name: 'Ordner wählen' }));
    await waitFor(() => expect(screen.getByText('Ordner-Auswahl abgebrochen.')).toBeTruthy());
    expect(screen.getByTestId('media-folder-status').textContent).toContain('Nichts verbunden');
  });
});

describe('SettingsView — was woanders bedient wird', () => {
  it('springt in die Fläche, statt die Bedienelemente zu duplizieren (INV-UI-2)', async () => {
    const onNavigate = vi.fn();
    const appState = createAppState();
    appState.loadDatabase(db(), 'test.ged');
    render(SettingsView, { props: { appState, mediaResolver: resolver([]), onNavigate } });

    await fireEvent.click(screen.getByRole('button', { name: /Prüfregeln/ }));
    expect(onNavigate).toHaveBeenCalledWith('quality');

    await fireEvent.click(screen.getByRole('button', { name: /Export-Vorwahl/ }));
    expect(onNavigate).toHaveBeenCalledWith('file');
  });

  it('rendert KEINE Regel-Konfiguration und KEINE Export-Optionen selbst', () => {
    mount(resolver([]));
    // Die Zusammenfassung nennt sie, bedient sie aber nicht — sonst gäbe es zwei Wege
    // zum selben Ziel. Ein Checkbox-/Schwellenwert-Feld hier wäre genau dieser Bruch.
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });
});

describe('SettingsView — Import-Weg ohne Verzeichnis-Handle (BL-259)', () => {
  function importing(picked: { path: string; blob: Blob }[]) {
    const m = new Map<string, Blob>();
    return createMediaResolver({
      // isSupported=false = iOS/Safari: kein showDirectoryPicker.
      adapter: adapter([], { isSupported: () => false }),
      store: memStore(),
      bytes: {
        put: async (path, blob) => {
          m.set(path.toLowerCase(), blob);
        },
        get: async (path) => m.get(path.toLowerCase()) ?? null,
        keys: async () => [...m.keys()],
        clear: async () => {
          m.clear();
        },
      },
      picker: { pickMany: async () => picked },
      createObjectUrl: () => 'blob:x',
      revokeObjectUrl: () => {},
    });
  }

  it('bietet den Import an, wo kein Ordner gewählt werden kann — und keinen toten Knopf', () => {
    const appState = createAppState();
    appState.loadDatabase(db(), 'test.ged');
    render(SettingsView, { props: { appState, mediaResolver: importing([]) } });

    expect(screen.queryByRole('button', { name: /Ordner wählen/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Medien importieren' })).toBeTruthy();
  });

  it('übernimmt gewählte Dateien und rechnet sie in die Bilanz ein', async () => {
    const appState = createAppState();
    appState.loadDatabase(db(), 'test.ged');
    // `bardel.jpg` liegt im Bestand als `Pictures/bardel.jpg` — der Browser gibt beim
    // Import nur den Dateinamen her, die Zuordnung läuft also darüber.
    const r = importing([
      { path: 'bardel.jpg', blob: new Blob(['x']) },
      { path: 'marianne.jpg', blob: new Blob(['y']) },
    ]);
    render(SettingsView, { props: { appState, mediaResolver: r } });

    await fireEvent.click(screen.getByRole('button', { name: 'Medien importieren' }));
    await waitFor(() => expect(screen.getByText('2 Dateien übernommen.')).toBeTruthy());

    const text = screen.getByTestId('media-folder-status').textContent ?? '';
    expect(text).toContain('2 importierte Dateien');
    // Zwei importierte Dateien treffen zwei der drei Verweise (`Pictures/bardel.jpg`
    // über den Namen, `marianne.jpg` direkt); `Pictures/weg.jpg` fehlt weiter.
    expect(text).toContain('2 von 3 Verweisen gefunden');
    expect(text).toContain('1 fehlen');
    expect(text).toContain('2 nur über den Dateinamen zugeordnet');
  });

  it('sagt es, wenn nichts gewählt wurde', async () => {
    const appState = createAppState();
    appState.loadDatabase(db(), 'test.ged');
    render(SettingsView, { props: { appState, mediaResolver: importing([]) } });
    await fireEvent.click(screen.getByRole('button', { name: 'Medien importieren' }));
    await waitFor(() => expect(screen.getByText('Keine Dateien gewählt.')).toBeTruthy());
  });

  it('„Importierte verwerfen" erscheint erst, wenn es etwas zu verwerfen gibt', async () => {
    const appState = createAppState();
    appState.loadDatabase(db(), 'test.ged');
    const r = importing([{ path: 'bardel.jpg', blob: new Blob(['x']) }]);
    render(SettingsView, { props: { appState, mediaResolver: r } });

    expect(screen.queryByRole('button', { name: /verwerfen/ })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Medien importieren' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /verwerfen/ })).toBeTruthy());
  });
});
