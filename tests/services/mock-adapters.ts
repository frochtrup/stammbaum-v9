// tests/services/mock-adapters.ts — gemockte Adapter-Implementierungen (Spec 32 §5:
// "Plattform-Adapter mockbar"). Keine echte IndexedDB/File-System-Access-API/kein DOM —
// reine In-Memory-Fakes, die dieselben Interfaces wie services/file/types.ts erfüllen.
// Damit ist die FileService-Orchestrierungslogik (Tier-Auswahl, Arbeitskopie-Update)
// headless testbar, ohne jemals eine echte Plattform-API aufzurufen.

import { vi } from 'vitest';
import type {
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
}): FsHandleAdapter & { writeCalls: Array<{ handle: unknown; bytes: Uint8Array | string }> } {
  const writeCalls: Array<{ handle: unknown; bytes: Uint8Array | string }> = [];
  return {
    isSupported: vi.fn(() => opts.supported),
    requestPermission: vi.fn(async () => opts.permissionGranted ?? true),
    write: vi.fn(async (handle: unknown, bytes: Uint8Array | string) => {
      writeCalls.push({ handle, bytes });
    }),
    writeCalls
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
} {
  const downloadCalls: Array<{ filename: string; mimeType: string }> = [];
  return {
    download: vi.fn((_bytes: Uint8Array | string, filename: string, mimeType: string) => {
      downloadCalls.push({ filename, mimeType });
    }),
    downloadCalls
  };
}

export interface MockAdapterSet {
  adapters: FileServiceAdapters;
  workingCopyStore: ReturnType<typeof createMockWorkingCopyStore>;
  picker: PickerAdapter;
  fsHandle: ReturnType<typeof createMockFsHandle>;
  share: ReturnType<typeof createMockShare>;
  download: ReturnType<typeof createMockDownload>;
}

export function createMockAdapterSet(opts: {
  initialWorkingCopy?: WorkingCopy | null;
  pickResult?: PickedFile | null;
  fsHandleSupported?: boolean;
  fsPermissionGranted?: boolean;
  shareSupported?: boolean;
  shareSucceeds?: boolean;
} = {}): MockAdapterSet {
  const workingCopyStore = createMockWorkingCopyStore(opts.initialWorkingCopy ?? null);
  const picker = createMockPicker(opts.pickResult ?? null);
  const fsHandle = createMockFsHandle({
    supported: opts.fsHandleSupported ?? false,
    permissionGranted: opts.fsPermissionGranted ?? true
  });
  const share = createMockShare({
    supported: opts.shareSupported ?? false,
    shareSucceeds: opts.shareSucceeds ?? true
  });
  const download = createMockDownload();

  return {
    adapters: { workingCopyStore, picker, fsHandle, share, download },
    workingCopyStore,
    picker,
    fsHandle,
    share,
    download
  };
}
