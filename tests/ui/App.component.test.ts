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
      // Dateiname jetzt als Speicher-Ziel „→ arbeitskopie.ged" in SICHERN (ADR-v9-128,
      // Kritik-Punkt 2) — Sichtbarkeit unverändert, nur Ort/Wortlaut.
      expect(screen.getByText(/arbeitskopie\.ged/)).toBeTruthy();
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
      // Dateiname jetzt als Speicher-Ziel „→ arbeitskopie.ged" in SICHERN (ADR-v9-128,
      // Kritik-Punkt 2) — Sichtbarkeit unverändert, nur Ort/Wortlaut.
      expect(screen.getByText(/arbeitskopie\.ged/)).toBeTruthy();
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

describe('App — History-Navigation (Spec 20 §1.1 [K], BL-07)', () => {
  // Die Modell-Logik prüft tests/ui/nav-history.test.ts. HIER geht es um die VERDRAHTUNG:
  // dass der beobachtende Effekt in der Schale den Verlauf überhaupt füllt und dass das
  // Tastenkürzel ihn bedient. Ein grünes Modell ohne diesen Nachweis wäre genau die halb
  // gebaute Funktion, die niemand merkt.
  async function appMitPerson() {
    const { adapters } = createMockAdapterSet({
      initialWorkingCopy: { text: MINI_GED, name: 'arbeitskopie.ged' },
    });
    const fileService = new FileService(adapters);
    render(App, { props: { fileService, persister: mockPersister(), layoutEnv: layoutEnvFor(false) } });
    await waitFor(() => expect(screen.getByRole('button', { name: /Muster/ })).toBeTruthy());
  }

  const altPfeil = (key: 'ArrowLeft' | 'ArrowRight') =>
    fireEvent.keyDown(window, { key, altKey: true });

  it('Alt+← kehrt aus einer anderen Fläche auf die zuvor offene Detailseite zurück', async () => {
    await appMitPerson();
    await fireEvent.click(screen.getByRole('button', { name: /Muster/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: '← Zurück' })).toBeTruthy());

    await fireEvent.click(screen.getByRole('button', { name: /Mehr/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Statistik/ })).toBeTruthy());

    await altPfeil('ArrowLeft');
    // Zurück auf der Detailseite — nicht bloß im Personen-Segment: die Auswahl gehört
    // zum Verlaufspunkt.
    await waitFor(() => expect(screen.getByRole('button', { name: '← Zurück' })).toBeTruthy());
  });

  it('Alt+→ führt den zurückgenommenen Schritt wieder aus', async () => {
    await appMitPerson();
    await fireEvent.click(screen.getByRole('button', { name: /Muster/ }));
    await fireEvent.click(screen.getByRole('button', { name: /Mehr/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Statistik/ })).toBeTruthy());

    await altPfeil('ArrowLeft');
    await waitFor(() => expect(screen.getByRole('button', { name: '← Zurück' })).toBeTruthy());

    await altPfeil('ArrowRight');
    await waitFor(() => expect(screen.getByRole('button', { name: /Statistik/ })).toBeTruthy());
  });

  it('„← Zurück" im Detail-Kopf führt zur HERKUNFT, nicht stur zur Liste', async () => {
    await appMitPerson();
    // Dieselbe Detailseite, ZWEIMAL auf verschiedenen Wegen erreicht — der Rückweg ist
    // jedes Mal ein anderer. Genau das konnte „← Zur Liste" nicht (Spec 20 §1.1).
    await fireEvent.click(screen.getByRole('button', { name: /Muster/ }));
    await fireEvent.click(screen.getByRole('button', { name: /Mehr/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Statistik/ })).toBeTruthy());

    // Über den Daten-Slot zurück auf die Fläche: die Auswahl lebt noch, also steht wieder
    // die Detailseite da — diesmal aber mit dem Hub als Herkunft.
    await fireEvent.click(screen.getByRole('button', { name: /Daten/ }));
    const zurueck = await waitFor(() => screen.getByRole('button', { name: '← Zurück' }));

    await fireEvent.click(zurueck);
    await waitFor(() => expect(screen.getByRole('button', { name: /Statistik/ })).toBeTruthy());
  });
});

// ---------------------------------------------------------------------------------------
// Der ganze Weg — echte Navigation, nicht Unmount-Simulation (BL-319, Spec 21 §5).
//
// Die Komponententests der beiden Flächen prüfen „Halter erhält den Zustand"; hier läuft
// der vom Nutzer gemeldete Pfad selbst: Filter setzen -> zur Person mit dem Hinweis
// wechseln -> zurück -> HINSEHEN. Nur dieser Test deckt, dass die App-Wurzel die Halter
// überhaupt durchreicht (ein Halter, der nicht ankommt, rettet nichts).
describe('App — Ansichts-Unterzustand überlebt echte Navigation (BL-319, Spec 21 §5)', () => {
  it('Qualitäts-Dashboard: der Brennpunkte-Filter steht nach dem Abstecher zur Person noch', async () => {
    const { adapters } = createMockAdapterSet({
      initialWorkingCopy: { text: MINI_GED, name: 'arbeitskopie.ged' },
    });
    render(App, {
      props: { fileService: new FileService(adapters), persister: mockPersister(), layoutEnv: layoutEnvFor(false) },
    });

    // Forschung -> Dashboard-Segment.
    await fireEvent.click(await waitFor(() => screen.getByRole('button', { name: /Forschung/ })));
    await fireEvent.click(screen.getByRole('tab', { name: 'Dashboard' }));
    // Max hat nur Hinweise (kein Geburtsdatum, keine Quellen) — die Vorgabe
    // „Handlungsbedarf" zeigt ihn nicht, „Alle" schon.
    expect(screen.queryByRole('button', { name: 'Max Muster' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: /^Filter/ }));
    await fireEvent.click(screen.getByLabelText('Alle (inkl. Hinweise)'));
    const brennpunkt = await waitFor(() => screen.getByRole('button', { name: 'Max Muster' }));

    // Zur Person wechseln (der gemeldete Weg) …
    await fireEvent.click(brennpunkt);
    expect(await waitFor(() => screen.getByRole('heading', { name: /Max Muster/ }))).toBeTruthy();
    // … und zurück in die Forschungsfläche (Merker führt aufs Dashboard, ADR-v9-116).
    await fireEvent.click(screen.getByRole('button', { name: /Forschung/ }));

    // Hinsehen: der Filter ist noch gesetzt, und die Person, die nur er zeigt, steht da.
    expect(screen.getByRole('button', { name: /^Filter · 1/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Max Muster' })).toBeTruthy();
  });

  it('Globale Suche: Anfrage und Trefferliste stehen nach dem Sprung auf einen Treffer noch', async () => {
    const { adapters } = createMockAdapterSet({
      initialWorkingCopy: { text: MINI_GED, name: 'arbeitskopie.ged' },
    });
    render(App, {
      props: { fileService: new FileService(adapters), persister: mockPersister(), layoutEnv: layoutEnvFor(false) },
    });

    await fireEvent.click(await waitFor(() => screen.getByRole('button', { name: /Suche/ })));
    const feld = screen.getByLabelText('Global suchen');
    await fireEvent.input(feld, { target: { value: 'Muster' } });
    const treffer = await waitFor(() => screen.getByText('Max Muster'));

    await fireEvent.click(treffer);
    expect(await waitFor(() => screen.getByRole('heading', { name: /Max Muster/ }))).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: /Suche/ }));

    expect((screen.getByLabelText('Global suchen') as HTMLInputElement).value).toBe('Muster');
    expect(screen.getByText('Max Muster')).toBeTruthy();
  });
});
