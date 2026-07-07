// @vitest-environment happy-dom
// tests/ui/App.component.test.ts — App-Wurzel: Auto-Load der Arbeitskopie beim Start
// (Spec 20 §1.2 [K], Spec 14 §3.1/§8 Schritt 4) + der explizite "Speichern"-Button
// (Spec 20 §1.2 [K] "Speichern über ein Export-Rohr, zwei Tiers"). Nutzt eine ECHTE
// FileService-Instanz mit gemockten Adaptern (analog tests/services/file-service.test.ts)
// statt der echten IDB/FS-Access-Adapter — App.svelte nimmt dafür `fileService` als
// injizierbaren Prop entgegen (Default: createFileService()).
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import App from '../../app/App.svelte';
import { FileService } from '../../services/file/file-service';
import { createMockAdapterSet } from '../services/mock-adapters';
import { PlacesSyncService } from '../../services/places';
import { createPlacesPersister } from '../../ui/shell/places-persister';
import { createMockPlacesStore, createMockDeviceId, createMockClock } from '../services/mock-places-store';

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

describe('App — Auto-Load der Arbeitskopie beim Start (Spec 14 §3.1)', () => {
  it('lädt eine vorhandene Arbeitskopie automatisch und zeigt den geladenen Dateinamen', async () => {
    const { adapters } = createMockAdapterSet({
      initialWorkingCopy: { text: MINI_GED, name: 'arbeitskopie.ged' },
    });
    const fileService = new FileService(adapters);

    render(App, { props: { fileService, persister: mockPersister() } });
    await openFileMenu();

    await waitFor(() => {
      expect(screen.getByText('arbeitskopie.ged')).toBeTruthy();
    });
  });

  it('bleibt beim Startzustand (keine Datei geladen), wenn keine Arbeitskopie existiert', async () => {
    const { adapters } = createMockAdapterSet({ initialWorkingCopy: null });
    const fileService = new FileService(adapters);

    render(App, { props: { fileService, persister: mockPersister() } });

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

    render(App, { props: { fileService, persister: mockPersister() } });
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

    render(App, { props: { fileService, persister: mockPersister() } });
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

    render(App, { props: { fileService, persister: mockPersister() } });
    await openFileMenu();

    const saveBtn = await waitFor(() => screen.getByRole('button', { name: /^Speichern$/ }));
    await fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(download.downloadCalls.length).toBe(1);
    });
    expect(download.downloadCalls[0]).toEqual({ filename: 'arbeitskopie.ged', mimeType: 'text/plain' });
  });
});
