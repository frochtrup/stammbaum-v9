// services/app-data/export-app-data-file.ts — `app-data.json` raus und rein
// (Spec 30 §2.3, Spec 14 §6, BL-180).
//
// Läuft durch DASSELBE Export-Rohr wie die Genealogie-Datei und wie `orte.json`
// (`FileService.exportToFile`, INV-FILE-2/INV-FILE-3) — kein Sonderpfad, kein neuer
// Adapter-Typ, keine neue Plattform-Verzweigung. Der Export liest den Spiegel nur, er
// verändert ihn nicht (kein `rev`-Bump).
import type { FileService } from '../file/file-service';
import type { SaveResult } from '../file/types';
import type { PickerAdapter } from '../file/types';
import type { AppDataStore, AppDataSections, AppDataWarning } from './types';
import { APP_DATA_SCHEMA_VERSION } from './types';
import { serializeAppDataWrapper, parseAppDataWrapper } from './app-data-wrapper';
import type { AppDataSyncService, AppDataBase } from './app-data-sync-service';

export const APP_DATA_FILENAME = 'app-data.json';
const MIME_TYPE = 'application/json';

/**
 * Bytes raus. Kein gespeicherter Stand → ein leerer Wrapper (gültig, wenn auch
 * uninteressant) statt eines Fehlers — dieselbe Haltung wie bei `orte.json`.
 */
export async function exportAppDataFile(
  fileService: FileService,
  store: AppDataStore
): Promise<SaveResult> {
  const wrapper = (await store.load()) ?? {
    schemaVersion: APP_DATA_SCHEMA_VERSION,
    rev: 0,
    device: '',
    ts: 0,
    sections: {},
  };
  return fileService.exportToFile(serializeAppDataWrapper(wrapper), APP_DATA_FILENAME, MIME_TYPE, {});
}

export interface ImportAppDataResult {
  /** false = Nutzer hat den Picker abgebrochen (kein Fehler, kein Import). */
  imported: boolean;
  sections?: AppDataSections;
  warning?: AppDataWarning | null;
}

/**
 * Bytes rein. Die importierte Datei verhält sich „wie ein Stand von einem anderen
 * Gerät" (dieselbe Konstruktion wie beim `orte.json`-Import, ADR-v9-70): ihr INHALT
 * geht als lokale Fassung in denselben `reconcileAndSave`-Pfad, der gespeicherte
 * Spiegel ist die Gegenseite. Damit gibt es keinen zweiten, abweichenden Merge-Weg.
 *
 * Bei einem Abschnitts-Konflikt gewinnt die importierte Datei — der Import ist eine
 * ausdrückliche Nutzerhandlung, und der Hinweis benennt die betroffenen Abschnitte.
 */
export async function importAppDataFile(
  picker: PickerAdapter,
  sync: AppDataSyncService,
  base: AppDataBase
): Promise<ImportAppDataResult> {
  const picked = await picker.pick();
  if (!picked) return { imported: false };

  const wrapper = parseAppDataWrapper(picked.text);
  const result = await sync.reconcileAndSave(wrapper.sections, base);
  return { imported: true, sections: result.sections, warning: result.warning };
}
