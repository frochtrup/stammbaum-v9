// services/file/fs-access-adapter.ts — Tier 1 (Spec 14 §4): File System Access API.
// Desktop Chrome/Edge, Android. Plattform-API bewusst NUR hier hinter FsHandleAdapter.

import type { FsHandleAdapter } from './types';

interface FsWritable {
  write(data: Uint8Array | string): Promise<void>;
  close(): Promise<void>;
}
interface FsFileHandleLike {
  createWritable(): Promise<FsWritable>;
  queryPermission?(opts: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(opts: { mode: 'readwrite' }): Promise<PermissionState>;
}

export class FsAccessAdapter implements FsHandleAdapter {
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
  }

  async requestPermission(handle: unknown): Promise<boolean> {
    const h = handle as FsFileHandleLike;
    if (!h?.queryPermission || !h.requestPermission) return true; // kein Permission-Modell → optimistisch
    const current = await h.queryPermission({ mode: 'readwrite' });
    if (current === 'granted') return true;
    const requested = await h.requestPermission({ mode: 'readwrite' });
    return requested === 'granted';
  }

  async write(handle: unknown, bytes: Uint8Array | string): Promise<void> {
    const h = handle as FsFileHandleLike;
    const writable = await h.createWritable();
    await writable.write(bytes);
    await writable.close();
  }
}
