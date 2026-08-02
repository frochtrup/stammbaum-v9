// services/file/fs-access-adapter.ts — Tier 1a/1b (Spec 14 §4): File System Access API.
// Desktop Chrome/Edge. Plattform-API bewusst NUR hier hinter FsHandleAdapter.
//
// Tier 1b (`showSaveFilePicker`, ADR-v9-194) ist das Gegenstück zum Öffnen-Dialog im
// PickerAdapter: dieselbe API-Familie, dieselbe Kapselung. Es liefert obendrein das
// Handle, mit dem jeder WEITERE Save derselben Datei still über Tier 1a läuft.

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

/** Endung eines Dateinamens inkl. Punkt (`datei.ged` → `.ged`); leer, wenn keine da ist. */
function extensionOf(filename: string): string {
  const match = /\.[^./\\]+$/.exec(filename);
  return match ? match[0] : '';
}

export class FsAccessAdapter implements FsHandleAdapter {
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
  }

  canPickSaveTarget(): boolean {
    return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
  }

  async pickSaveTarget(filename: string, mimeType: string): Promise<unknown | null> {
    try {
      const w = window as unknown as {
        showSaveFilePicker(opts: {
          suggestedName: string;
          types?: Array<{ accept: Record<string, string[]> }>;
        }): Promise<FsFileHandleLike>;
      };
      const ext = extensionOf(filename);
      // `types` nur, wenn es eine Endung gibt — ein leeres accept-Muster lässt den Dialog
      // mit einem TypeError abbrechen statt einfach alle Dateitypen zu erlauben.
      return await w.showSaveFilePicker({
        suggestedName: filename,
        ...(ext ? { types: [{ accept: { [mimeType]: [ext] } }] } : {})
      });
    } catch {
      return null; // Nutzerabbruch (AbortError) — kein Ausweich-Tier (Spec 14 §4).
    }
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
