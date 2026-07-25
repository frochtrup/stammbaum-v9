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
   * Bytes raus (Export/Save). Die einzige Plattform-Verzweigung (INV-FILE-3):
   *   Tier 1 (FS-Handle vorhanden + Plattform kann createWritable): in-place, still.
   *   Tier 2a (navigator.share verfügbar): Share-Sheet.
   *   Tier 2b (sonst): <a download>-Fallback.
   *
   * `handle` wird NUR für Tier 1 herangezogen; ein anonymisierter/Strict/GED7-Export
   * ruft exportToFile ohne handle (oder mit forceDownload) auf, damit nie in-place in
   * die Originaldatei geschrieben wird (Spec 14 §4, letzter Punkt).
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
      // Permission verweigert → fällt durch auf Tier 2, kein Sonderpfad nötig.
    }

    if (!forceDownload && this.adapters.share.isSupported()) {
      const shared = await this.adapters.share.share(bytes, filename, mimeType);
      return { tier: 'share', ok: shared };
    }

    this.adapters.download.download(bytes, filename, mimeType);
    return { tier: 'download', ok: true };
  }
}
