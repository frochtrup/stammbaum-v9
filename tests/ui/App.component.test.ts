// @vitest-environment happy-dom
// tests/ui/App.component.test.ts — App-Wurzel: Auto-Load der Arbeitskopie beim Start
// (Spec 20 §1.2 [K], Spec 14 §3.1/§8 Schritt 4) + der explizite "Speichern"-Button
// (Spec 20 §1.2 [K] "Speichern über ein Export-Rohr, zwei Tiers"). Nutzt eine ECHTE
// FileService-Instanz mit gemockten Adaptern (analog tests/services/file-service.test.ts)
// statt der echten IDB/FS-Access-Adapter — App.svelte nimmt dafür `fileService` als
// injizierbaren Prop entgegen (Default: createFileService()).
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import App from '../../app/App.svelte';
import { FileService } from '../../services/file/file-service';
import { createMockAdapterSet } from '../services/mock-adapters';
import { PlacesSyncService } from '../../services/places';
import { createPlacesPersister } from '../../ui/shell/places-persister';
import { createMockPlacesStore, createMockDeviceId, createMockClock } from '../services/mock-places-store';
import { layoutEnvFor } from './layout-harness';
import { layout } from '../../ui/shell/layout.svelte';

function mockPersister() {
  return createPlacesPersister(new PlacesSyncService(createMockPlacesStore(null), createMockDeviceId('device-1'), createMockClock(1000)));
}

const MINI_GED = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '2 FORM LINEAGE-LINKED',
  '1 CHAR UTF-8',
  '0 @I1@ INDI',
  '1 NAME Max /Muster/',
  '1 GIVN Max',
  '1 SURN Muster',
  '1 SEX M',
  '0 TRLR',
  '',
].join('\n');

// Der Dateiname-Indikator (ImportButton) lebt seit dem Nachtrag 2026-07-07 (Spec 21 §2)
// nicht mehr permanent sichtbar in App.svelte, sondern hinter Mehr -> "📁 Datei" (s.
// Kommentar bei der SaveButton-Beschreibung unten). Diese Helper-Funktion navigiert
// genau dorthin, bevor auf den Dateinamen/Speichern-Button zugegriffen wird.
async function openFileMenu() {
  const moreBtn = await waitFor(() => screen.getByRole('button', { name: /Mehr/ }));
  await fireEvent.click(moreBtn);
  const fileBtn = await waitFor(() => screen.getByRole('button', { name: /Datei/ }));
  await fireEvent.click(fileBtn);
}

// Formfaktor explizit: diese Datei prüft die Schale im MOBILEN Modell.
// Begründung s. layout-harness.ts (happy-dom ist standardmäßig 1024px breit).
afterEach(() => layout.reset());

describe('App — Auto-Load der Arbeitskopie beim Start (Spec 14 §3.1)', () => {
  it('lädt eine vorhandene Arbeitskopie automatisch und zeigt den geladenen Dateinamen', async () => {
    const { adapters } = createMockAdapterSet({
      initialWorkingCopy: { text: MINI_GED, name: 'arbeitskopie.ged' },
    });
    const fileService = new FileService(adapters);

    render(App, { props: { fileService, persister: mockPersister(), layoutEnv: layoutEnvFor(false) } });
    await openFileMenu();

    await waitFor(() => {
      expect(screen.getByText('arbeitskopie.ged')).toBeTruthy();
    });
  });

  it('bleibt beim Startzustand (keine Datei geladen), wenn keine Arbeitskopie existiert', async () => {
    const { adapters } = createMockAdapterSet({ initialWorkingCopy: null });
    const fileService = new FileService(adapters);

    render(App, { props: { fileService, persister: mockPersister(), layoutEnv: layoutEnvFor(false) } });

    // Kurz warten, damit ein evtl. asynchrones Auto-Load Zeit zum (Nicht-)Feuern hätte.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/\.ged$/)).toBeNull();
  });
});

describe('App — stilles Auto-Save nach Persistenz-Rundlauf (TST-8, Spec 14 §3.1)', () => {
  it('Arbeitskopie-Text nach Auto-Load "speichern -> neu laden" enthält die Original-Person unverändert (Sanity)', async () => {
    const { adapters, workingCopyStore } = createMockAdapterSet({
      initialWorkingCopy: { text: MINI_GED, name: 'arbeitskopie.ged' },
    });
    const fileService = new FileService(adapters);

    render(App, { props: { fileService, persister: mockPersister(), layoutEnv: layoutEnvFor(false) } });
    await openFileMenu();

    await waitFor(() => {
      expect(screen.getByText('arbeitskopie.ged')).toBeTruthy();
    });

    // Kein Edit ausgelöst -> die Arbeitskopie im Store bleibt die ursprünglich geladene
    // (Auto-Load selbst löst KEIN Auto-Save aus, nur Save-/Delete-Kommandos tun das).
    expect(workingCopyStore._peek()?.text).toBe(MINI_GED);
  });
});

describe('App — SaveButton: expliziter Export über das eine Rohr (Spec 20 §1.2 [K])', () => {
  it('ist nicht sichtbar, solange keine Datei geladen ist', async () => {
    const { adapters } = createMockAdapterSet({ initialWorkingCopy: null });
    const fileService = new FileService(adapters);

    render(App, { props: { fileService, persister: mockPersister(), layoutEnv: layoutEnvFor(false) } });
    await openFileMenu();

    expect(screen.queryByRole('button', { name: /^Speichern$/ })).toBeNull();
  });

  it('exportiert nach Klick über exportToFile mit dem editierten Inhalt (Tier bei fehlendem Handle/Share = download)', async () => {
    const { adapters, download } = createMockAdapterSet({
      initialWorkingCopy: { text: MINI_GED, name: 'arbeitskopie.ged' },
      fsHandleSupported: false,
      shareSupported: false,
    });
    const fileService = new FileService(adapters);

    render(App, { props: { fileService, persister: mockPersister(), layoutEnv: layoutEnvFor(false) } });
    await openFileMenu();

    const saveBtn = await waitFor(() => screen.getByRole('button', { name: /^Speichern$/ }));
    await fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(download.downloadCalls.length).toBe(1);
    });
    expect(download.downloadCalls[0]).toEqual({ filename: 'arbeitskopie.ged', mimeType: 'text/plain' });
  });
});

describe('App — Formfaktor schaltet Navigation UND Layout um (Spec 21 §3, BL-06)', () => {
  it('zeigt auf Mobil die Bottom-Nav und die Entitäts-Segmentreihe', async () => {
    const { adapters } = createMockAdapterSet({ initialWorkingCopy: null });
    const fileService = new FileService(adapters);
    render(App, { props: { fileService, persister: mockPersister(), layoutEnv: layoutEnvFor(false) } });

    await waitFor(() => expect(screen.getByRole('button', { name: /Mehr/ })).toBeTruthy());
    // Segmentreihe (mobile Sub-Navigation) ist da …
    expect(screen.getByRole('tab', { name: 'Orte' })).toBeTruthy();
    // … und die Sidebar-Gruppenüberschriften sind es nicht.
    expect(screen.queryByRole('heading', { level: 2, name: 'Daten' })).toBeNull();
  });

  it('ersetzt auf Desktop die Bottom-Nav durch die Sidebar und lässt die Segmentreihe weg', async () => {
    const { adapters } = createMockAdapterSet({ initialWorkingCopy: null });
    const fileService = new FileService(adapters);
    render(App, { props: { fileService, persister: mockPersister(), layoutEnv: layoutEnvFor(true) } });

    // Sidebar da: die drei Rollen-Gruppen aus Spec 21 §1.
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Daten' })).toBeTruthy());
    expect(screen.getByRole('heading', { level: 2, name: 'Ansichten' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Arbeit' })).toBeTruthy();

    // "Mehr" ist ein reines Mobile-Konstrukt (Hub); auf Desktop trägt die Sidebar
    // Datei/Statistik/… direkt — der Hub-Eintrag darf hier nicht auftauchen.
    expect(screen.queryByRole('button', { name: /^Mehr$/ })).toBeNull();

    // Die Entitäts-Segmentreihe entfällt: sonst wären es zwei Wege zu "Orte" (INV-UI-2).
    expect(screen.queryByRole('tab', { name: 'Orte' })).toBeNull();
    expect(screen.getByRole('button', { name: /Orte/ })).toBeTruthy(); // aber in der Sidebar
  });

  it('lässt einen im Mehr-Hub gestrandeten Zustand auf Desktop nicht ins Leere laufen', async () => {
    // Fenster verbreitern, während der Hub offen ist: auf Desktop gibt es ihn nicht.
    // Spec 21 §5 verlangt einen definierten Fallback statt eines stillen Abbruchs —
    // die Entitäten-Fläche als Einstieg.
    const { adapters } = createMockAdapterSet({ initialWorkingCopy: null });
    const fileService = new FileService(adapters);
    const { rerender } = render(App, {
      props: { fileService, persister: mockPersister(), layoutEnv: layoutEnvFor(false) },
    });

    await fireEvent.click(await waitFor(() => screen.getByRole('button', { name: /Mehr/ })));
    expect(screen.getByRole('button', { name: /Statistik/ })).toBeTruthy();

    layout.reset();
    await rerender({ fileService, persister: mockPersister(), layoutEnv: layoutEnvFor(true) });
    layout.start(layoutEnvFor(true));

    // Kein Leerlauf: die Personenliste (Entitäten-Einstieg) ist da.
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Daten' })).toBeTruthy());
    expect(screen.getByRole('button', { name: /＋ Neue Person/ })).toBeTruthy();
  });
});
