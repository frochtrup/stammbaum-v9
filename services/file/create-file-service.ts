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

/** Eine gzip-Codec-Instanz für die App: der Picker entpackt damit GRAMPS-Importe, der
 *  Export-Pfad (save-action) verpackt damit GRAMPS-Ausgaben (BL-139). Zustandslos. */
export const gzipCodec = new CompressionStreamGzipCodec();

export function createFileService(): FileService {
  return new FileService({
    workingCopyStore: new IdbWorkingCopyStore(),
    picker: new InputFilePickerAdapter(gzipCodec),
    fsHandle: new FsAccessAdapter(),
    share: new NavigatorShareAdapter(),
    download: new AnchorDownloadAdapter()
  });
}
