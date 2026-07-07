// services/file/index.ts — öffentliche API des Dateihandlings (Spec 14).

export { FileService } from './file-service';
export { createFileService } from './create-file-service';
export { exportViaOnePipe } from './export-pipe';
export type { ExportFormat, ExportRequest, GzipAdapter } from './export-pipe';
export type {
  WorkingCopy,
  ImportResult,
  SaveResult,
  SaveTier,
  WorkingCopyStore,
  PickedFile,
  PickerAdapter,
  FsHandleAdapter,
  ShareAdapter,
  DownloadAdapter,
  FileServiceAdapters
} from './types';
