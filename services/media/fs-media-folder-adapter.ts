// services/media/fs-media-folder-adapter.ts — Tier 1 der Medien-Auflösung: File System
// Access API (Desktop Chrome/Edge, Android). Plattform-API bewusst NUR hier, hinter
// `MediaFolderAdapter` (types.ts) — dasselbe Muster wie services/file/fs-access-adapter.ts.
//
// Auf iOS/Safari gibt es `showDirectoryPicker` nicht; `isSupported()` ist dort false und
// die Einstellungen zeigen statt eines toten Knopfes den Import-Weg (BL-259).
import type { MediaFolderAdapter, MediaFolderEntry } from './types';

interface FsDirectoryHandleLike {
  name: string;
  entries(): AsyncIterableIterator<[string, FsHandleLike]>;
  queryPermission?(opts: { mode: 'read' }): Promise<PermissionState>;
  requestPermission?(opts: { mode: 'read' }): Promise<PermissionState>;
}
interface FsHandleLike {
  kind: 'file' | 'directory';
  name: string;
  getFile?(): Promise<Blob>;
  entries?(): AsyncIterableIterator<[string, FsHandleLike]>;
}

/** Schutz gegen einen versehentlich gewählten Riesen-Ordner (z. B. das Home-Verzeichnis):
 *  die Aufzählung bricht ab, statt den Tab minutenlang zu blockieren. Der Bestand braucht
 *  189 Dateien; 20.000 ist großzügig und trotzdem eine Grenze. */
const MAX_ENTRIES = 20000;
/** Tiefenlimit — dieselbe Begründung, plus Schutz gegen Symlink-Zyklen. */
const MAX_DEPTH = 8;

export class FsMediaFolderAdapter implements MediaFolderAdapter {
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }

  async pick(): Promise<unknown | null> {
    const w = window as unknown as {
      showDirectoryPicker(opts?: { mode?: 'read' }): Promise<FsDirectoryHandleLike>;
    };
    try {
      return await w.showDirectoryPicker({ mode: 'read' });
    } catch {
      return null; // Abbruch durch den Nutzer ist kein Fehler
    }
  }

  async requestPermission(handle: unknown): Promise<boolean> {
    const h = handle as FsDirectoryHandleLike;
    if (!h?.queryPermission || !h.requestPermission) return true; // kein Permission-Modell
    const current = await h.queryPermission({ mode: 'read' });
    if (current === 'granted') return true;
    return (await h.requestPermission({ mode: 'read' })) === 'granted';
  }

  nameOf(handle: unknown): string {
    return (handle as FsDirectoryHandleLike)?.name ?? '';
  }

  async listFiles(handle: unknown): Promise<MediaFolderEntry[]> {
    const out: MediaFolderEntry[] = [];
    await this.#walk(handle as FsDirectoryHandleLike, '', out, 0);
    return out;
  }

  async readFile(entry: MediaFolderEntry): Promise<Blob> {
    const h = entry.handle as FsHandleLike;
    if (!h.getFile) throw new Error(`Kein Dateizugriff auf ${entry.path}`);
    return h.getFile();
  }

  async #walk(
    dir: FsDirectoryHandleLike,
    prefix: string,
    out: MediaFolderEntry[],
    depth: number,
  ): Promise<void> {
    if (depth > MAX_DEPTH || out.length >= MAX_ENTRIES) return;
    for await (const [name, child] of dir.entries()) {
      if (out.length >= MAX_ENTRIES) return;
      const path = prefix ? `${prefix}/${name}` : name;
      if (child.kind === 'directory') {
        await this.#walk(child as unknown as FsDirectoryHandleLike, path, out, depth + 1);
      } else {
        out.push({ path, name, handle: child });
      }
    }
  }
}
