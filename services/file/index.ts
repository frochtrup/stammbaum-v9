// services/file/index.ts — öffentliche API des Dateihandlings (Spec 14).

export { FileService } from './file-service';
export { createFileService } from './create-file-service';
export { exportViaOnePipe, exportFileName } from './export-pipe';
// InputFilePickerAdapter (universal <input type="file"> / showOpenFilePicker) ist
// generisch (Bytes/Text, kein GEDCOM-Wissen) — wird auch von services/places für einen
// zweiten, unabhängigen orte.json-Datei-Öffnen-Vorgang wiederverwendet (ADR-v9-70,
// "kein neuer Adapter-Typ").
export { InputFilePickerAdapter } from './picker-adapter';
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
