// tests/services/file-service.test.ts — FileService-Orchestrierung (Spec 14 §4,
// Spec 32 §6: "INV-FILE-1/2/3 · Unit (Adapter gemockt)"). Ruft NIE eine echte
// Plattform-API auf — alle Adapter sind In-Memory-Fakes (mock-adapters.ts).

import { describe, expect, it } from 'vitest';
import { FileService } from '../../services/file/file-service';
import { createMockAdapterSet } from './mock-adapters';

describe('INV-FILE-1 — genau eine Arbeitskopie', () => {
  it('pickAndImport ersetzt eine bestehende Arbeitskopie statt einen zweiten Cache anzulegen', async () => {
    const { adapters, workingCopyStore } = createMockAdapterSet({
      initialWorkingCopy: { text: 'ALT', name: 'alt.ged' },
      pickResult: { text: 'NEU', name: 'neu.ged', format: 'gedcom' }
    });
    const svc = new FileService(adapters);

    await svc.pickAndImport();

    // save() wurde genau einmal aufgerufen (kein paralleler zweiter Schreibpfad) …
    expect(workingCopyStore.save).toHaveBeenCalledTimes(1);
    // … und der EINE gespeicherte Slot enthält jetzt die neue Kopie, nicht beide.
    expect(workingCopyStore._peek()).toEqual({ text: 'NEU', name: 'neu.ged', format: 'gedcom', handle: undefined });
  });

  it('saveWorkingCopy überschreibt denselben Slot, statt einen neuen Eintrag anzuhängen', async () => {
    const { adapters, workingCopyStore } = createMockAdapterSet({
      initialWorkingCopy: { text: 'V1', name: 'datei.ged' }
    });
    const svc = new FileService(adapters);

    await svc.saveWorkingCopy('V2');
    await svc.saveWorkingCopy('V3');

    expect(workingCopyStore.save).toHaveBeenCalledTimes(2);
    // Nur EIN aktueller Zustand ist abrufbar — kein Verlauf, kein zweiter Cache.
    expect(workingCopyStore._peek()).toEqual({ text: 'V3', name: 'datei.ged', format: 'gedcom', handle: undefined });
    expect(await svc.loadWorkingCopy()).toEqual({ text: 'V3', name: 'datei.ged', format: 'gedcom', handle: undefined });
  });

  it('loadWorkingCopy liefert null, wenn keine Arbeitskopie existiert (kein impliziter zweiter Speicher)', async () => {
    const { adapters } = createMockAdapterSet({ initialWorkingCopy: null });
    const svc = new FileService(adapters);

    expect(await svc.loadWorkingCopy()).toBeNull();
  });

  it('pickAndImport gibt null zurück und rührt die Arbeitskopie nicht an, wenn der Nutzer abbricht', async () => {
    const { adapters, workingCopyStore } = createMockAdapterSet({
      initialWorkingCopy: { text: 'BESTEHEND', name: 'x.ged' },
      pickResult: null
    });
    const svc = new FileService(adapters);

    const result = await svc.pickAndImport();

    expect(result).toBeNull();
    expect(workingCopyStore.save).not.toHaveBeenCalled();
    expect(workingCopyStore._peek()).toEqual({ text: 'BESTEHEND', name: 'x.ged' });
  });
});

describe('INV-FILE-3 — Tier-Auswahl ist die einzige Plattform-Verzweigung', () => {
  it('wählt Tier 1 (FS-Handle), wenn ein Handle vorliegt UND die Plattform createWritable unterstützt', async () => {
    const { adapters, fsHandle, share, download } = createMockAdapterSet({
      fsHandleSupported: true,
      shareSupported: true // Tier 2 wäre auch verfügbar — Tier 1 hat Vorrang.
    });
    const svc = new FileService(adapters);

    const result = await svc.exportToFile('BYTES', 'datei.ged', 'text/plain', { handle: { id: 1 } });

    expect(result).toEqual({ tier: 'fs-handle', ok: true });
    expect(fsHandle.writeCalls).toEqual([{ handle: { id: 1 }, bytes: 'BYTES' }]);
    expect(share.share).not.toHaveBeenCalled();
    expect(download.download).not.toHaveBeenCalled();
  });

  it('fällt auf Tier 2a (share) zurück, wenn kein Handle vorliegt', async () => {
    const { adapters, fsHandle, share, download } = createMockAdapterSet({
      fsHandleSupported: true, // Plattform könnte, aber ohne handle nicht anwendbar
      shareSupported: true
    });
    const svc = new FileService(adapters);

    const result = await svc.exportToFile('BYTES', 'datei.ged', 'text/plain');

    expect(result).toEqual({ tier: 'share', ok: true });
    expect(fsHandle.write).not.toHaveBeenCalled();
    expect(share.shareCalls).toEqual([{ filename: 'datei.ged', mimeType: 'text/plain' }]);
    expect(download.download).not.toHaveBeenCalled();
  });

  it('fällt auf Tier 2a (share) zurück, wenn Tier-1-Permission verweigert wird', async () => {
    const { adapters, fsHandle, share } = createMockAdapterSet({
      fsHandleSupported: true,
      fsPermissionGranted: false,
      shareSupported: true
    });
    const svc = new FileService(adapters);

    const result = await svc.exportToFile('BYTES', 'datei.ged', 'text/plain', { handle: { id: 1 } });

    expect(result.tier).toBe('share');
    expect(fsHandle.write).not.toHaveBeenCalled();
    expect(share.share).toHaveBeenCalledTimes(1);
  });

  it('fällt auf Tier 2b (download) zurück, wenn weder FS-Handle noch share verfügbar sind', async () => {
    const { adapters, fsHandle, share, download } = createMockAdapterSet({
      fsHandleSupported: false,
      shareSupported: false
    });
    const svc = new FileService(adapters);

    const result = await svc.exportToFile('BYTES', 'datei.ged', 'text/plain');

    expect(result).toEqual({ tier: 'download', ok: true });
    expect(fsHandle.write).not.toHaveBeenCalled();
    expect(share.share).not.toHaveBeenCalled();
    expect(download.downloadCalls).toEqual([{ filename: 'datei.ged', mimeType: 'text/plain' }]);
  });

  it('forceDownload erzwingt Tier 2b, selbst wenn Handle + Tier 1 verfügbar wären (Anon/Strict/GED7-Export)', async () => {
    const { adapters, fsHandle, share, download } = createMockAdapterSet({
      fsHandleSupported: true,
      shareSupported: true
    });
    const svc = new FileService(adapters);

    const result = await svc.exportToFile('BYTES', 'datei_strict.ged', 'text/plain', {
      handle: { id: 1 },
      forceDownload: true
    });

    expect(result).toEqual({ tier: 'download', ok: true });
    expect(fsHandle.write).not.toHaveBeenCalled();
    expect(share.share).not.toHaveBeenCalled();
    expect(download.downloadCalls).toEqual([{ filename: 'datei_strict.ged', mimeType: 'text/plain' }]);
  });

  // ── Tier 1b: „Speichern unter" (ADR-v9-194) ──────────────────────────────────────────
  // Der Fall, der auf dem Mac in eine Sackgasse lief: kein Handle (Reload/Drag-Drop/
  // Arbeitskopie), Plattform kann File System Access — vorher fiel das auf das Share-Sheet.

  it('wählt Tier 1b (Speichern-unter-Dialog), wenn kein Handle vorliegt, die Plattform ihn aber zeigen kann', async () => {
    const { adapters, fsHandle, share, download } = createMockAdapterSet({
      fsHandleSupported: true,
      fsCanPickSaveTarget: true,
      fsSaveTarget: { id: 'neu' },
      shareSupported: true // wäre verfügbar — Tier 1b hat Vorrang.
    });
    const svc = new FileService(adapters);

    const result = await svc.exportToFile('BYTES', 'datei.ged', 'text/plain');

    expect(result).toEqual({ tier: 'fs-picker', ok: true, handle: { id: 'neu' } });
    expect(fsHandle.pickSaveTargetCalls).toEqual([{ filename: 'datei.ged', mimeType: 'text/plain' }]);
    // In die GEWÄHLTE Datei geschrieben, nicht in eine andere.
    expect(fsHandle.writeCalls).toEqual([{ handle: { id: 'neu' }, bytes: 'BYTES' }]);
    expect(share.share).not.toHaveBeenCalled();
    expect(download.download).not.toHaveBeenCalled();
  });

  it('Tier 1a hat Vorrang vor 1b: mit Handle wird still geschrieben, ohne Dialog', async () => {
    const { adapters, fsHandle } = createMockAdapterSet({
      fsHandleSupported: true,
      fsCanPickSaveTarget: true
    });
    const svc = new FileService(adapters);

    const result = await svc.exportToFile('BYTES', 'datei.ged', 'text/plain', { handle: { id: 1 } });

    expect(result.tier).toBe('fs-handle');
    expect(fsHandle.pickSaveTarget).not.toHaveBeenCalled();
  });

  it('meldet ok:false, wenn der Nutzer den Speichern-unter-Dialog abbricht, ohne auf einen anderen Tier auszuweichen', async () => {
    const { adapters, fsHandle, share, download } = createMockAdapterSet({
      fsHandleSupported: true,
      fsCanPickSaveTarget: true,
      fsSaveTarget: null, // Abbruch
      shareSupported: true
    });
    const svc = new FileService(adapters);

    const result = await svc.exportToFile('BYTES', 'datei.ged', 'text/plain');

    expect(result).toEqual({ tier: 'fs-picker', ok: false });
    expect(fsHandle.write).not.toHaveBeenCalled();
    // Dieselbe Regel wie beim Share-Abbruch unten: kein stiller Ausweich-Download.
    expect(share.share).not.toHaveBeenCalled();
    expect(download.download).not.toHaveBeenCalled();
  });

  it('überspringt Tier 1b bei forceDownload — ein Anon/Strict-Export ist eine Ausgabe, keine fortzuschreibende Datei', async () => {
    const { adapters, fsHandle, download } = createMockAdapterSet({
      fsHandleSupported: true,
      fsCanPickSaveTarget: true
    });
    const svc = new FileService(adapters);

    const result = await svc.exportToFile('BYTES', 'datei_anon.ged', 'text/plain', { forceDownload: true });

    expect(result).toEqual({ tier: 'download', ok: true });
    expect(fsHandle.pickSaveTarget).not.toHaveBeenCalled();
    expect(download.downloadCalls).toEqual([{ filename: 'datei_anon.ged', mimeType: 'text/plain' }]);
  });

  it('fällt auf Tier 2b (download) zurück, wenn die Plattform weder Speichern-Dialog noch tauglichen Share-Weg hat (macOS Safari)', async () => {
    const { adapters, share, download } = createMockAdapterSet({
      fsHandleSupported: false,
      fsCanPickSaveTarget: false,
      shareSupported: false // ShareAdapter meldet auf dem Desktop bewusst false
    });
    const svc = new FileService(adapters);

    const result = await svc.exportToFile('BYTES', 'datei.ged', 'text/plain');

    expect(result).toEqual({ tier: 'download', ok: true });
    expect(share.share).not.toHaveBeenCalled();
    expect(download.downloadCalls).toEqual([{ filename: 'datei.ged', mimeType: 'text/plain' }]);
  });

  it('rememberHandle übernimmt das Tier-1b-Handle in die EINE Arbeitskopie — der nächste Save läuft still (Tier 1a)', async () => {
    const { adapters, workingCopyStore } = createMockAdapterSet({
      initialWorkingCopy: { text: 'V1', name: 'datei.ged', format: 'gedcom' }
    });
    const svc = new FileService(adapters);

    await svc.rememberHandle({ id: 'neu' });

    expect(workingCopyStore._peek()).toEqual({ text: 'V1', name: 'datei.ged', format: 'gedcom', handle: { id: 'neu' } });
    // Kein zweiter Slot (INV-FILE-1).
    expect(workingCopyStore.save).toHaveBeenCalledTimes(1);
  });

  it('rememberHandle legt keine Arbeitskopie an, wenn noch keine existiert', async () => {
    const { adapters, workingCopyStore } = createMockAdapterSet({ initialWorkingCopy: null });
    const svc = new FileService(adapters);

    await svc.rememberHandle({ id: 'neu' });

    expect(workingCopyStore.save).not.toHaveBeenCalled();
    expect(workingCopyStore._peek()).toBeNull();
  });

  it('meldet ok:false, wenn der Nutzer das Share-Sheet abbricht, ohne auf einen dritten Pfad auszuweichen', async () => {
    const { adapters, download } = createMockAdapterSet({
      fsHandleSupported: false,
      shareSupported: true,
      shareSucceeds: false
    });
    const svc = new FileService(adapters);

    const result = await svc.exportToFile('BYTES', 'datei.ged', 'text/plain');

    expect(result).toEqual({ tier: 'share', ok: false });
    // Kein automatischer Download-Fallback nach Nutzerabbruch — das wäre eine zweite
    // Verzweigung entgegen INV-FILE-3; der Nutzer hat share bewusst abgebrochen.
    expect(download.download).not.toHaveBeenCalled();
  });
});
