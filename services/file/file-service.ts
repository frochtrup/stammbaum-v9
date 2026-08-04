// services/file/file-service.ts — FileService (Spec 14 §4): die einzige Plattform-
// Verzweigung des Dateihandlings.
//
// INV-FILE-1: genau EINE Arbeitskopie (aktueller Text + Name + optionales FS-Handle).
// INV-FILE-2: ein Export-Rohr für alle Formate (siehe export-pipe.ts, das exportToFile
//             hier konsumiert — kein format-spezifischer Sonderpfad).
// INV-FILE-3: die Tier-1/Tier-2-Verzweigung in save() ist die EINZIGE `if (Plattform)`-
//             Stelle des Dateihandlings. Alle Plattform-Zugriffe laufen über injizierte
//             Adapter (types.ts) — dadurch ist genau diese Verzweigungslogik mit
//             gemockten Adaptern headless testbar (Spec 32 §5).
//
// Der FileService kennt kein Genealogie-Wissen (kein parse/serialize hier) — das bleibt
// Sache des Kerns (core/interop) bzw. von export-pipe.ts, das FileService nur benutzt.

import type { FileServiceAdapters, ImportResult, SaveResult, WorkingCopy } from './types';
import type { DocFormat } from './doc-format';

export class FileService {
  constructor(private readonly adapters: FileServiceAdapters) {}

  /**
   * Bytes rein (Import): Picker/Drag-Drop öffnen, Arbeitskopie sofort aktualisieren
   * (INV-FILE-1 — genau eine Arbeitskopie, kein zweiter Text-Cache daneben).
   */
  async pickAndImport(): Promise<ImportResult | null> {
    const picked = await this.adapters.picker.pick();
    if (!picked) return null;
    const copy: WorkingCopy = { text: picked.text, name: picked.name, format: picked.format, handle: picked.handle };
    await this.adapters.workingCopyStore.save(copy);
    return picked;
  }

  /** Auto-Load beim Start (Spec 14 §3.1, §8 Schritt 4). */
  async loadWorkingCopy(): Promise<WorkingCopy | null> {
    return this.adapters.workingCopyStore.load();
  }

  /**
   * Stilles Zwischenspeichern der Arbeitskopie — jederzeit, plattformunabhängig
   * (Absturz-Recovery/Offline). Ändert NICHT die echte Datei auf der Platte.
   */
  async saveWorkingCopy(text: string, name?: string, handle?: unknown, format?: DocFormat): Promise<void> {
    const existing = await this.adapters.workingCopyStore.load();
    const nextName = name ?? existing?.name ?? '';
    const nextHandle = handle !== undefined ? handle : existing?.handle;
    const nextFormat = format ?? existing?.format ?? 'gedcom';
    await this.adapters.workingCopyStore.save({ text, name: nextName, format: nextFormat, handle: nextHandle });
  }

  /**
   * Merkt ein bei Tier 1b („Speichern unter") erworbenes FS-Handle an der EINEN
   * Arbeitskopie (INV-FILE-1), damit der nächste Save still über Tier 1a läuft — auch
   * nach einem Reload. Legt bewusst KEINE Arbeitskopie an, wenn keine existiert: ein
   * Handle ohne Text wäre eine halbe Arbeitskopie, die der Auto-Load nicht laden kann.
   */
  async rememberHandle(handle: unknown): Promise<void> {
    const existing = await this.adapters.workingCopyStore.load();
    if (!existing) return;
    await this.adapters.workingCopyStore.save({ ...existing, handle });
  }

  /**
   * Bytes raus (Export/Save). Die einzige Plattform-Verzweigung (INV-FILE-3):
   *   Tier 1a (Handle vorhanden + Plattform kann createWritable): in-place, still.
   *   Tier 1b (Plattform kann showSaveFilePicker): „Speichern unter"-Dialog.
   *   Tier 2a (Share-Sheet ist hier ein TAUGLICHER Speicherweg): Share-Sheet.
   *   Tier 2b (sonst): <a download>-Fallback.
   *
   * Die Reihenfolge ist inhaltlich, nicht historisch: je weiter oben, desto mehr Kontrolle
   * behält der Nutzer über das Ziel (dieselbe Datei > selbst gewählte Datei > vom System
   * angebotene Ziele > Download-Ordner).
   *
   * `handle` wird NUR für Tier 1a herangezogen; ein anonymisierter/Strict/GED7-Export
   * ruft exportToFile mit forceDownload auf und überspringt damit AUCH Tier 1b — er ist
   * eine Ausgabe, keine fortzuschreibende Datei (Spec 14 §4, letzter Punkt).
   *
   * Ein Nutzerabbruch (Tier 1b oder 2a) liefert `ok:false` und weicht NICHT auf einen
   * weiteren Tier aus — das wäre eine zweite Verzweigung entgegen INV-FILE-3 und gegen
   * die erklärte Absicht des Nutzers.
   */
  async exportToFile(
    bytes: Uint8Array | string,
    filename: string,
    mimeType: string,
    opts: { handle?: unknown; forceDownload?: boolean } = {}
  ): Promise<SaveResult> {
    const { handle, forceDownload = false } = opts;

    if (!forceDownload && handle && this.adapters.fsHandle.isSupported()) {
      const granted = await this.adapters.fsHandle.requestPermission(handle);
      if (granted) {
        await this.adapters.fsHandle.write(handle, bytes);
        return { tier: 'fs-handle', ok: true };
      }
      // Permission verweigert → fällt durch, kein Sonderpfad nötig.
    }

    if (!forceDownload && this.adapters.fsHandle.canPickSaveTarget()) {
      const picked = await this.adapters.fsHandle.pickSaveTarget(filename, mimeType);
      if (!picked) return { tier: 'fs-picker', ok: false };
      await this.adapters.fsHandle.write(picked, bytes);
      // Das Handle geht an den AUFRUFER zurück, nicht in die Arbeitskopie: dasselbe Rohr
      // bedient auch orte.json und den App-Daten-Export mit je eigenem Handle-Speicher.
      return { tier: 'fs-picker', ok: true, handle: picked };
    }

    if (!forceDownload && this.adapters.share.isSupported()) {
      const shared = await this.adapters.share.share(bytes, filename, mimeType);
      return { tier: 'share', ok: shared };
    }

    this.adapters.download.download(bytes, filename, mimeType);
    return { tier: 'download', ok: true };
  }
}
