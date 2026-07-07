// services/file/create-file-service.ts — verdrahtet FileService mit den ECHTEN
// Plattform-Adaptern (für app/). Tests importieren stattdessen FileService direkt mit
// gemockten Adaptern (types.ts) — sie ziehen diese Datei nie ein.

import { FileService } from './file-service';
import { IdbWorkingCopyStore } from './idb-working-copy-store';
import { InputFilePickerAdapter } from './picker-adapter';
import { FsAccessAdapter } from './fs-access-adapter';
import { NavigatorShareAdapter } from './share-adapter';
import { AnchorDownloadAdapter } from './download-adapter';

export function createFileService(): FileService {
  return new FileService({
    workingCopyStore: new IdbWorkingCopyStore(),
    picker: new InputFilePickerAdapter(),
    fsHandle: new FsAccessAdapter(),
    share: new NavigatorShareAdapter(),
    download: new AnchorDownloadAdapter()
  });
}
