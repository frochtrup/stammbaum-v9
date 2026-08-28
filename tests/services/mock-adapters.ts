// tests/services/mock-adapters.ts — gemockte Adapter-Implementierungen (Spec 32 §5:
// "Plattform-Adapter mockbar"). Keine echte IndexedDB/File-System-Access-API/kein DOM —
// reine In-Memory-Fakes, die dieselben Interfaces wie services/file/types.ts erfüllen.
// Damit ist die FileService-Orchestrierungslogik (Tier-Auswahl, Arbeitskopie-Update)
// headless testbar, ohne jemals eine echte Plattform-API aufzurufen.

import { vi } from 'vitest';
import type {
  BackupFolderAdapter,
  BackupFolderHandleStore,
  DownloadAdapter,
  FileServiceAdapters,
  FsHandleAdapter,
  PickedFile,
  PickerAdapter,
  ShareAdapter,
  WorkingCopy,
  WorkingCopyStore
} from '../../services/file/types';

/** In-Memory-WorkingCopyStore: hält höchstens EINEN Eintrag (spiegelt INV-FILE-1). */
export function createMockWorkingCopyStore(initial: WorkingCopy | null = null): WorkingCopyStore & {
  _peek(): WorkingCopy | null;
} {
  let current: WorkingCopy | null = initial;
  return {
    load: vi.fn(async () => current),
    save: vi.fn(async (copy: WorkingCopy) => {
      current = copy; // Überschreiben, nie Hinzufügen — es gibt nur einen Slot.
    }),
    clear: vi.fn(async () => {
      current = null;
    }),
    _peek: () => current
  };
}

export function createMockPicker(result: PickedFile | null): PickerAdapter {
  return { pick: vi.fn(async () => result) };
}

export function createMockFsHandle(opts: {
  supported: boolean;
  permissionGranted?: boolean;
  /** Tier 1b: kann die Plattform „Speichern unter"? Default: wie `supported`. */
  canPickSaveTarget?: boolean;
  /** Was der Dialog liefert. `null` = Nutzerabbruch. */
  saveTarget?: unknown | null;
  /** Was auf der Platte steht — die Vorlage der Sicherung (Spec 14 §4.1). */
  diskContent?: Uint8Array | null;
  /** Name hinter einem Handle; bei „Speichern unter" der im Dialog gewählte. */
  handleName?: string;
}): FsHandleAdapter & {
  writeCalls: Array<{ handle: unknown; bytes: Uint8Array | string }>;
  pickSaveTargetCalls: Array<{ filename: string; mimeType: string }>;
} {
  const writeCalls: Array<{ handle: unknown; bytes: Uint8Array | string }> = [];
  const pickSaveTargetCalls: Array<{ filename: string; mimeType: string }> = [];
  return {
    isSupported: vi.fn(() => opts.supported),
    requestPermission: vi.fn(async () => opts.permissionGranted ?? true),
    write: vi.fn(async (handle: unknown, bytes: Uint8Array | string) => {
      writeCalls.push({ handle, bytes });
    }),
    canPickSaveTarget: vi.fn(() => opts.canPickSaveTarget ?? opts.supported),
    pickSaveTarget: vi.fn(async (filename: string, mimeType: string) => {
      pickSaveTargetCalls.push({ filename, mimeType });
      return 'saveTarget' in opts ? opts.saveTarget : { id: 'gewählt' };
    }),
    read: vi.fn(async () => opts.diskContent ?? null),
    nameOf: vi.fn(() => opts.handleName ?? ''),
    writeCalls,
    pickSaveTargetCalls
  };
}

/**
 * Backup-Ordner (Spec 14 §4.1). `connected:false` bildet die Vorgabe ab — kein Ordner
 * verbunden; die bestehenden Tier-Tests laufen damit unverändert weiter und melden
 * `backup:'kein-ordner'` statt einer Sicherung.
 */
export function createMockBackupFolder(opts: {
  supported?: boolean;
  connected?: boolean;
  permissionGranted?: boolean;
  /** Wirft beim Schreiben — für den Fall „Sicherung schlägt fehl, also nicht überschreiben". */
  writeFails?: string;
  pickResult?: unknown | null;
} = {}): {
  adapter: BackupFolderAdapter;
  store: BackupFolderHandleStore & { _peek(): unknown | null };
  writes: Array<{ filename: string; bytes: Uint8Array | string }>;
} {
  const writes: Array<{ filename: string; bytes: Uint8Array | string }> = [];
  let current: unknown | null = opts.connected ? { id: 'backup-ordner', name: 'Backups' } : null;
  return {
    adapter: {
      isSupported: vi.fn(() => opts.supported ?? true),
      pick: vi.fn(async () => ('pickResult' in opts ? opts.pickResult : { id: 'gewählt', name: 'Backups' })),
      requestPermission: vi.fn(async () => opts.permissionGranted ?? true),
      nameOf: vi.fn((h: unknown) => (h as { name?: string })?.name ?? ''),
      writeInto: vi.fn(async (_h: unknown, filename: string, bytes: Uint8Array | string) => {
        if (opts.writeFails) throw new Error(opts.writeFails);
        writes.push({ filename, bytes });
      })
    },
    store: {
      load: vi.fn(async () => current),
      save: vi.fn(async (h: unknown) => {
        current = h;
      }),
      clear: vi.fn(async () => {
        current = null;
      }),
      _peek: () => current
    },
    writes
  };
}

export function createMockShare(opts: {
  supported: boolean;
  shareSucceeds?: boolean;
}): ShareAdapter & { shareCalls: Array<{ filename: string; mimeType: string }> } {
  const shareCalls: Array<{ filename: string; mimeType: string }> = [];
  return {
    isSupported: vi.fn(() => opts.supported),
    share: vi.fn(async (_bytes: Uint8Array | string, filename: string, mimeType: string) => {
      shareCalls.push({ filename, mimeType });
      return opts.shareSucceeds ?? true;
    }),
    shareCalls
  };
}

export function createMockDownload(): DownloadAdapter & {
  downloadCalls: Array<{ filename: string; mimeType: string }>;
  /** Die geschriebenen Bytes, separat von downloadCalls — dessen Form prüfen mehrere
   * Tests per toEqual, und ein zusätzliches Feld dort bräche sie. */
  downloadBytes: Array<Uint8Array | string>;
} {
  const downloadCalls: Array<{ filename: string; mimeType: string }> = [];
  const downloadBytes: Array<Uint8Array | string> = [];
  return {
    download: vi.fn((bytes: Uint8Array | string, filename: string, mimeType: string) => {
      downloadCalls.push({ filename, mimeType });
      downloadBytes.push(bytes);
    }),
    downloadCalls,
    downloadBytes
  };
}

export interface MockAdapterSet {
  adapters: FileServiceAdapters;
  workingCopyStore: ReturnType<typeof createMockWorkingCopyStore>;
  picker: PickerAdapter;
  fsHandle: ReturnType<typeof createMockFsHandle>;
  share: ReturnType<typeof createMockShare>;
  download: ReturnType<typeof createMockDownload>;
  backup: ReturnType<typeof createMockBackupFolder>;
}

export function createMockAdapterSet(opts: {
  initialWorkingCopy?: WorkingCopy | null;
  pickResult?: PickedFile | null;
  fsHandleSupported?: boolean;
  fsPermissionGranted?: boolean;
  fsCanPickSaveTarget?: boolean;
  fsSaveTarget?: unknown | null;
  shareSupported?: boolean;
  shareSucceeds?: boolean;
  /** Was auf der Platte steht (Sicherungs-Vorlage, Spec 14 §4.1). */
  diskContent?: Uint8Array | null;
  /** Name hinter dem gewählten Handle (Tier 1b, „Speichern unter"). */
  handleName?: string;
  /** Backup-Ordner verbunden? Vorgabe `false` — wie beim Nutzer vor der ersten Wahl. */
  backupConnected?: boolean;
  backupPermissionGranted?: boolean;
  backupWriteFails?: string;
  /** Fester Zeitstempel für den Sicherungsnamen (TST-3). */
  now?: () => Date;
} = {}): MockAdapterSet {
  const workingCopyStore = createMockWorkingCopyStore(opts.initialWorkingCopy ?? null);
  const picker = createMockPicker(opts.pickResult ?? null);
  const fsHandle = createMockFsHandle({
    supported: opts.fsHandleSupported ?? false,
    permissionGranted: opts.fsPermissionGranted ?? true,
    // Default bewusst `false`: die bestehenden Tier-Tests wurden geschrieben, als es Tier 1b
    // noch nicht gab — sie sollen weiter genau den Tier prüfen, den sie benennen.
    canPickSaveTarget: opts.fsCanPickSaveTarget ?? false,
    ...('fsSaveTarget' in opts ? { saveTarget: opts.fsSaveTarget } : {}),
    ...('diskContent' in opts ? { diskContent: opts.diskContent } : {}),
    ...(opts.handleName ? { handleName: opts.handleName } : {})
  });
  const share = createMockShare({
    supported: opts.shareSupported ?? false,
    shareSucceeds: opts.shareSucceeds ?? true
  });
  const download = createMockDownload();
  const backup = createMockBackupFolder({
    connected: opts.backupConnected ?? false,
    permissionGranted: opts.backupPermissionGranted ?? true,
    ...(opts.backupWriteFails ? { writeFails: opts.backupWriteFails } : {})
  });

  return {
    adapters: {
      workingCopyStore,
      picker,
      fsHandle,
      share,
      download,
      backupFolder: backup.adapter,
      backupFolderStore: backup.store,
      ...(opts.now ? { now: opts.now } : {})
    },
    workingCopyStore,
    picker,
    fsHandle,
    share,
    download,
    backup
  };
}
