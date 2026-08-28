// services/file/create-file-service.ts — verdrahtet FileService mit den ECHTEN
// Plattform-Adaptern (für app/). Tests importieren stattdessen FileService direkt mit
// gemockten Adaptern (types.ts) — sie ziehen diese Datei nie ein.

import { FileService } from './file-service';
import { IdbWorkingCopyStore } from './idb-working-copy-store';
import { InputFilePickerAdapter } from './picker-adapter';
import { FsAccessAdapter } from './fs-access-adapter';
import { NavigatorShareAdapter } from './share-adapter';
import { AnchorDownloadAdapter } from './download-adapter';
import { CompressionStreamGzipCodec } from './gzip-codec';
import { FsBackupFolderAdapter } from './fs-backup-folder-adapter';
import { IdbBackupFolderHandleStore } from './idb-backup-folder-handle-store';

/** Eine gzip-Codec-Instanz für die App: der Picker entpackt damit GRAMPS-Importe, der
 *  Export-Pfad (save-action) verpackt damit GRAMPS-Ausgaben (BL-139). Zustandslos. */
export const gzipCodec = new CompressionStreamGzipCodec();

export function createFileService(): FileService {
  return new FileService({
    workingCopyStore: new IdbWorkingCopyStore(),
    picker: new InputFilePickerAdapter(gzipCodec),
    fsHandle: new FsAccessAdapter(),
    share: new NavigatorShareAdapter(),
    download: new AnchorDownloadAdapter(),
    // Sicherung vor dem Überschreiben (Spec 14 §4.1). Kein `now` — die App nimmt die
    // Vorgabe (`new Date()`); injiziert wird er nur in Tests (TST-3).
    backupFolder: new FsBackupFolderAdapter(),
    backupFolderStore: new IdbBackupFolderHandleStore()
  });
}
