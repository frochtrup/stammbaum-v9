// tests/services/backup-before-overwrite.test.ts — INV-FILE-4: ein In-place-Save
// überschreibt nie, ohne dass der vorherige Stand gesichert ODER der Verzicht benannt ist
// (Spec 14 §4.1, [ADR-v9-302]).
//
// WAS HIER GEHALTEN WIRD, und warum es nicht selbstverständlich ist: Tier 1a ist der
// EINZIGE Weg, auf dem diese App fremde Bytes vernichtet. Jeder andere Tier legt etwas
// Neues an oder fragt vorher. Die drei Zusicherungen, die das tragen, sind
//   (a) gesichert wird der Stand VON DER PLATTE (nicht der neue aus dem Speicher),
//   (b) die Reihenfolge ist sichern → überschreiben, nicht umgekehrt,
//   (c) scheitert die Sicherung, unterbleibt das Überschreiben.
// (b) und (c) sind dieselbe Sache aus zwei Blickwinkeln: „erst schreiben, dann sichern"
// würde jeden Fehlschlag meldbar und den Verlust trotzdem endgültig machen.
import { describe, expect, it } from 'vitest';
import { FileService } from '../../services/file/file-service';
import { backupFileName } from '../../services/file/backup-name';
import { createMockAdapterSet } from './mock-adapters';

const ALT = new TextEncoder().encode('0 HEAD\n0 @I1@ INDI\n0 TRLR\n');
const FEST = () => new Date(2026, 7, 28, 14, 32, 5); // 2026-08-28 14:32:05, lokal

/** Die Lage am Desktop nach dem Öffnen: Handle vorhanden, Plattform kann in-place. */
function inPlaceUmgebung(extra: Parameters<typeof createMockAdapterSet>[0] = {}) {
  return createMockAdapterSet({
    fsHandleSupported: true,
    diskContent: ALT,
    now: FEST,
    ...extra,
  });
}

describe('backupFileName — der Name der Sicherung', () => {
  it('hängt den Stempel an den Basisnamen und behält die Endung', () => {
    expect(backupFileName('Meine Familie.ged', FEST())).toBe(
      'Meine Familie (Backup 2026-08-28 14-32-05).ged',
    );
  });

  it('trägt Sekunden — zwei Saves derselben Minute dürfen sich nicht überschreiben', () => {
    const a = backupFileName('x.ged', new Date(2026, 7, 28, 14, 32, 5));
    const b = backupFileName('x.ged', new Date(2026, 7, 28, 14, 32, 41));
    expect(a).not.toBe(b);
  });

  it('kommt auch ohne Endung zurecht', () => {
    expect(backupFileName('stammbaum', FEST())).toBe('stammbaum (Backup 2026-08-28 14-32-05)');
  });
});

describe('INV-FILE-4 — Tier 1a sichert, bevor es überschreibt', () => {
  it('schreibt den Stand VON DER PLATTE als datierte Kopie, dann erst die neuen Bytes', async () => {
    const { adapters, fsHandle, backup } = inPlaceUmgebung({ backupConnected: true });
    const svc = new FileService(adapters);

    const result = await svc.exportToFile('NEU', 'Meine Familie.ged', 'text/plain', {
      handle: { id: 1 },
    });

    expect(result).toMatchObject({
      tier: 'fs-handle',
      ok: true,
      backup: 'geschrieben',
      backupName: 'Meine Familie (Backup 2026-08-28 14-32-05).ged',
    });
    // (a) Gesichert wurde der ALTE Inhalt — nicht die neuen Bytes. Ein aus dem Modell
    // erzeugter „alter" Stand wäre bereits die Projektion des neuen.
    expect(backup.writes).toHaveLength(1);
    expect(backup.writes[0].bytes).toEqual(ALT);
    expect(backup.writes[0].filename).toBe('Meine Familie (Backup 2026-08-28 14-32-05).ged');
    // Und die Datei selbst trägt danach den neuen Stand.
    expect(fsHandle.writeCalls).toEqual([{ handle: { id: 1 }, bytes: 'NEU' }]);
  });

  it('überschreibt NICHT, wenn die Sicherung fehlschlägt — die Datei bleibt, wie sie war', async () => {
    const { adapters, fsHandle } = inPlaceUmgebung({
      backupConnected: true,
      backupWriteFails: 'Kein Platz auf dem Gerät',
    });
    const svc = new FileService(adapters);

    const result = await svc.exportToFile('NEU', 'Meine Familie.ged', 'text/plain', {
      handle: { id: 1 },
    });

    expect(result.ok).toBe(false);
    expect(result.backup).toBe('fehlgeschlagen');
    expect(result.backupError).toContain('Kein Platz');
    // Der eigentliche Punkt: KEIN Schreibversuch auf die Originaldatei.
    expect(fsHandle.writeCalls).toEqual([]);
  });

  it('behandelt ein verweigertes Schreibrecht am Ordner wie einen Fehlschlag, nicht wie „kein Ordner"', async () => {
    const { adapters, fsHandle } = inPlaceUmgebung({
      backupConnected: true,
      backupPermissionGranted: false,
    });
    const svc = new FileService(adapters);

    const result = await svc.exportToFile('NEU', 'x.ged', 'text/plain', { handle: { id: 1 } });

    expect(result.ok).toBe(false);
    expect(result.backup).toBe('fehlgeschlagen');
    expect(fsHandle.writeCalls).toEqual([]);
  });

  it('überschreibt NICHT, solange kein Ordner verbunden ist — die Zusage gilt ab dem ersten Save', async () => {
    const { adapters, fsHandle, backup } = inPlaceUmgebung(); // backupConnected: false
    const svc = new FileService(adapters);

    const result = await svc.exportToFile('NEU', 'x.ged', 'text/plain', { handle: { id: 1 } });

    // DIE KORREKTUR AUS DEM NUTZER-BEFUND (2026-08-28): Die erste Fassung ließ hier
    // durchschreiben und meldete den Verzicht nur — womit ausgerechnet die Lage direkt
    // nach dem Update, in der noch niemand einen Ordner gewählt hat, ungeschützt blieb.
    // Ein „kein Ordner" ist eine offene ENTSCHEIDUNG, kein Grund, sie zu übergehen.
    expect(result).toMatchObject({ tier: 'fs-handle', ok: false, backup: 'kein-ordner' });
    expect(fsHandle.writeCalls).toEqual([]);
    expect(backup.writes).toEqual([]);
  });

  it('speichert dennoch, wo die Plattform gar keinen Ordner freigeben kann (iOS/Safari)', async () => {
    const { adapters, fsHandle, backup } = inPlaceUmgebung();
    // Kein `showDirectoryPicker`: hier gibt es keine Wahl, die der Nutzer treffen könnte.
    // Ein Abbruch machte die App dauerhaft speicher-unfähig, statt sie zu schützen.
    backup.adapter.isSupported = () => false;
    const svc = new FileService(adapters);

    const result = await svc.exportToFile('NEU', 'x.ged', 'text/plain', { handle: { id: 1 } });

    expect(result).toMatchObject({ tier: 'fs-handle', ok: true, backup: 'nicht-moeglich' });
    expect(fsHandle.writeCalls).toHaveLength(1);
    expect(backup.writes).toEqual([]);
  });

  it('unterscheidet „nichts zu sichern" von „Sicherung gescheitert"', async () => {
    const { adapters, fsHandle, backup } = inPlaceUmgebung({
      backupConnected: true,
      diskContent: new Uint8Array(0),
    });
    const svc = new FileService(adapters);

    const result = await svc.exportToFile('NEU', 'x.ged', 'text/plain', { handle: { id: 1 } });

    // Eine leere Datei trägt keinen Stand, den das Überschreiben vernichtet — der Save
    // läuft, und die Meldung sagt etwas anderes als bei einem Fehlschlag.
    expect(result).toMatchObject({ ok: true, backup: 'leer' });
    expect(backup.writes).toEqual([]);
    expect(fsHandle.writeCalls).toHaveLength(1);
  });

  it('überspringt den Vorlauf bei „Ohne Sicherung speichern" — und sagt es', async () => {
    const { adapters, fsHandle, backup } = inPlaceUmgebung({ backupConnected: true });
    const svc = new FileService(adapters);

    const result = await svc.exportToFile('NEU', 'x.ged', 'text/plain', {
      handle: { id: 1 },
      skipBackup: true,
    });

    expect(result).toMatchObject({ ok: true, backup: 'uebersprungen' });
    expect(backup.writes).toEqual([]);
    expect(fsHandle.writeCalls).toHaveLength(1);
  });

  it('sichert NUR bei Tier 1a — ein Download überschreibt nichts', async () => {
    const { adapters, backup, download } = createMockAdapterSet({
      fsHandleSupported: false,
      backupConnected: true,
      now: FEST,
    });
    const svc = new FileService(adapters);

    const result = await svc.exportToFile('NEU', 'x.ged', 'text/plain', {});

    expect(result.tier).toBe('download');
    expect(result.backup).toBeUndefined();
    expect(backup.writes).toEqual([]);
    expect(download.downloadCalls).toHaveLength(1);
  });
});

describe('„Speichern unter …" (forcePicker) — Tier 1a bewusst übersprungen', () => {
  it('öffnet den Dialog, obwohl ein Handle vorliegt, und meldet den gewählten Namen', async () => {
    const { adapters, fsHandle, backup } = createMockAdapterSet({
      fsHandleSupported: true,
      fsCanPickSaveTarget: true,
      fsSaveTarget: { id: 'neu' },
      handleName: 'Kopie.ged',
      diskContent: ALT,
      backupConnected: true,
      now: FEST,
    });
    const svc = new FileService(adapters);

    const result = await svc.exportToFile('NEU', 'Meine Familie.ged', 'text/plain', {
      handle: { id: 'alt' },
      forcePicker: true,
    });

    expect(result).toMatchObject({ tier: 'fs-picker', ok: true, handle: { id: 'neu' }, name: 'Kopie.ged' });
    // Kein Vorlauf: geschrieben wird in eine ANDERE Datei, es geht nichts verloren.
    expect(backup.writes).toEqual([]);
    expect(fsHandle.writeCalls).toEqual([{ handle: { id: 'neu' }, bytes: 'NEU' }]);
  });

  it('behält bei Abbruch die alte Datei — kein Ausweich-Tier (INV-FILE-3)', async () => {
    const { adapters, fsHandle, download } = createMockAdapterSet({
      fsHandleSupported: true,
      fsCanPickSaveTarget: true,
      fsSaveTarget: null,
      diskContent: ALT,
    });
    const svc = new FileService(adapters);

    const result = await svc.exportToFile('NEU', 'x.ged', 'text/plain', {
      handle: { id: 'alt' },
      forcePicker: true,
    });

    expect(result).toEqual({ tier: 'fs-picker', ok: false });
    expect(fsHandle.writeCalls).toEqual([]);
    expect(download.downloadCalls).toEqual([]);
  });
});

describe('Backup-Ordner verbinden/trennen', () => {
  it('merkt das gewählte Handle und meldet den Ordnernamen', async () => {
    const { adapters, backup } = createMockAdapterSet({});
    const svc = new FileService(adapters);

    expect(await svc.backupFolderStatus()).toEqual({ supported: true, connected: false, name: '' });

    const name = await svc.connectBackupFolder();

    expect(name).toBe('Backups');
    expect(backup.store._peek()).toEqual({ id: 'gewählt', name: 'Backups' });
    expect(await svc.backupFolderStatus()).toEqual({ supported: true, connected: true, name: 'Backups' });
  });

  it('trennt wieder — der nächste Save meldet dann „kein Ordner"', async () => {
    const { adapters } = createMockAdapterSet({ backupConnected: true, fsHandleSupported: true, diskContent: ALT });
    const svc = new FileService(adapters);

    await svc.disconnectBackupFolder();

    const result = await svc.exportToFile('NEU', 'x.ged', 'text/plain', { handle: { id: 1 } });
    expect(result.backup).toBe('kein-ordner');
  });
});
