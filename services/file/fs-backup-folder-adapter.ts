// services/file/fs-backup-folder-adapter.ts — der Backup-Ordner (Spec 14 §4.1).
// Plattform-API bewusst NUR hier, hinter `BackupFolderAdapter` (types.ts) — dasselbe
// Muster wie fs-access-adapter.ts und services/media/fs-media-folder-adapter.ts.
//
// WARUM ÜBERHAUPT EIN VERZEICHNIS-HANDLE: Die File System Access API kennt keinen Weg
// von einem `FileSystemFileHandle` zu seinem Ordner. Die App KANN also nicht einfach
// „eine Datei daneben" anlegen, obwohl sie die Originaldatei in der Hand hält. Ohne ein
// eigens gewähltes Verzeichnis-Handle bliebe nur ein Speichern-Dialog je Sicherung —
// bei einem stillen Save die falsche Antwort.
//
// NICHT der Medien-Ordner (services/media): der ist mit `mode: 'read'` verbunden, und
// ein Leserecht für Fotos ist keine Erlaubnis, in denselben Ordner zu schreiben. Zwei
// Zwecke, zwei Handles — dieselbe Trennung wie zwischen Genealogie-Datei und orte.json.
//
// Auf iOS/Safari gibt es `showDirectoryPicker` nicht. Dort ist `isSupported()` false —
// aber dort gibt es auch kein stilles Überschreiben (Tier 1a), also nichts zu sichern:
// jeder Save ist eine Nutzergeste mit eigenem Ziel. Die Fähigkeiten fallen zusammen.

import type { BackupFolderAdapter } from './types';

interface FsWritable {
  write(data: Uint8Array | string): Promise<void>;
  close(): Promise<void>;
}
interface FsFileHandleLike {
  createWritable(): Promise<FsWritable>;
}
interface FsDirectoryHandleLike {
  name: string;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FsFileHandleLike>;
  queryPermission?(opts: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(opts: { mode: 'readwrite' }): Promise<PermissionState>;
}

export class FsBackupFolderAdapter implements BackupFolderAdapter {
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }

  async pick(): Promise<unknown | null> {
    const w = window as unknown as {
      showDirectoryPicker(opts?: { mode?: 'readwrite' }): Promise<FsDirectoryHandleLike>;
    };
    try {
      // `readwrite` schon beim Wählen: der Nutzer soll EINMAL gefragt werden, nicht noch
      // einmal beim ersten Speichern — und nicht in dem Moment, in dem er eine Sicherung
      // erwartet.
      return await w.showDirectoryPicker({ mode: 'readwrite' });
    } catch {
      return null; // Nutzerabbruch ist kein Fehler (Spec 14 §4).
    }
  }

  async requestPermission(handle: unknown): Promise<boolean> {
    const h = handle as FsDirectoryHandleLike;
    if (!h?.queryPermission || !h.requestPermission) return true; // kein Permission-Modell
    const current = await h.queryPermission({ mode: 'readwrite' });
    if (current === 'granted') return true;
    return (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
  }

  nameOf(handle: unknown): string {
    return (handle as FsDirectoryHandleLike)?.name ?? '';
  }

  async writeInto(handle: unknown, filename: string, bytes: Uint8Array | string): Promise<void> {
    const dir = handle as FsDirectoryHandleLike;
    const file = await dir.getFileHandle(filename, { create: true });
    const writable = await file.createWritable();
    await writable.write(bytes);
    await writable.close();
  }
}
