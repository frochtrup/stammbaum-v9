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
import { backupFileName } from './backup-name';

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
  async rememberHandle(handle: unknown, name?: string): Promise<void> {
    const existing = await this.adapters.workingCopyStore.load();
    if (!existing) return;
    // Der Name kommt bei „Speichern unter" mit (Spec 14 §4.1): Handle und Name beschreiben
    // DIESELBE Datei. Getrennt fortgeschrieben wären sie beim nächsten Auto-Load zwei
    // Wahrheiten — der Titel zeigte den alten Namen, das Handle schriebe in die neue Datei.
    await this.adapters.workingCopyStore.save({ ...existing, handle, ...(name ? { name } : {}) });
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
   *
   * `forcePicker` überspringt Tier 1a bei vorhandenem Handle („Speichern unter …" als
   * bewusste Wahl statt als Notfall-Ausweg) — anders als `forceDownload`, das auch 1b
   * überspringt.
   */
  async exportToFile(
    bytes: Uint8Array | string,
    filename: string,
    mimeType: string,
    opts: { handle?: unknown; forceDownload?: boolean; forcePicker?: boolean; skipBackup?: boolean } = {}
  ): Promise<SaveResult> {
    const { handle, forceDownload = false, forcePicker = false, skipBackup = false } = opts;

    if (!forceDownload && !forcePicker && handle && this.adapters.fsHandle.isSupported()) {
      const granted = await this.adapters.fsHandle.requestPermission(handle);
      if (granted) {
        // DER EINZIGE PUNKT, AN DEM DIE APP FREMDE BYTES VERNICHTET (Spec 14 §4.1): jeder
        // andere Tier legt etwas Neues an oder fragt vorher. Deshalb hängt der Vorlauf
        // genau hier — und deshalb wird bei einem FEHLSCHLAG nicht geschrieben. Die
        // umgekehrte Reihenfolge (erst schreiben, dann sichern) machte den Fehlschlag
        // meldbar und den Verlust trotzdem endgültig (INV-FILE-4).
        const sicherung = skipBackup
          ? ({ backup: 'uebersprungen' } as const)
          : await this.#sichereVorherigenStand(handle, filename);
        // Beide Ausgänge halten das Überschreiben an: eine gescheiterte Sicherung UND
        // eine, die gar nicht erst versucht wurde, weil kein Ordner verbunden ist. Der
        // zweite Fall war in der ersten Fassung eine Ausnahme („speichern, aber melden") —
        // sie hat die Zusage für jeden ausgehöhlt, der noch keinen Ordner gewählt hatte,
        // also für genau die Lage direkt nach dem Update (Nutzer-Befund 2026-08-28).
        if (sicherung.backup === 'fehlgeschlagen' || sicherung.backup === 'kein-ordner') {
          return { tier: 'fs-handle', ok: false, ...sicherung };
        }
        await this.adapters.fsHandle.write(handle, bytes);
        return { tier: 'fs-handle', ok: true, ...sicherung };
      }
      // Permission verweigert → fällt durch, kein Sonderpfad nötig.
    }

    if (!forceDownload && this.adapters.fsHandle.canPickSaveTarget()) {
      const picked = await this.adapters.fsHandle.pickSaveTarget(filename, mimeType);
      if (!picked) return { tier: 'fs-picker', ok: false };
      await this.adapters.fsHandle.write(picked, bytes);
      // Das Handle geht an den AUFRUFER zurück, nicht in die Arbeitskopie: dasselbe Rohr
      // bedient auch orte.json und den App-Daten-Export mit je eigenem Handle-Speicher.
      // Der NAME kommt mit: im „Speichern unter"-Dialog ist das Umbenennen der Regelfall,
      // und ohne ihn führte die App danach den alten Namen weiter.
      const gewaehlt = this.adapters.fsHandle.nameOf(picked);
      return { tier: 'fs-picker', ok: true, handle: picked, ...(gewaehlt ? { name: gewaehlt } : {}) };
    }

    if (!forceDownload && this.adapters.share.isSupported()) {
      const shared = await this.adapters.share.share(bytes, filename, mimeType);
      return { tier: 'share', ok: shared };
    }

    this.adapters.download.download(bytes, filename, mimeType);
    return { tier: 'download', ok: true };
  }

  /**
   * Der Vorlauf von Tier 1a (Spec 14 §4.1): den Stand VON DER PLATTE lesen und als
   * datierte Kopie in den Backup-Ordner schreiben.
   *
   * Vier der fünf Ausgänge sind kein Fehler, sondern ein zu MELDENDER Zustand — nur so
   * kann INV-FILE-4 („nie stillschweigend ohne Sicherung überschreiben") von der
   * Oberfläche eingehalten werden, ohne dass sie die Ordner-Lage selbst nachrechnet.
   */
  async #sichereVorherigenStand(
    handle: unknown,
    filename: string
  ): Promise<Pick<SaveResult, 'backup' | 'backupName' | 'backupError'>> {
    const ordner = await this.adapters.backupFolderStore.load();
    if (!ordner) {
      // ZWEI VERSCHIEDENE LAGEN, und nur eine davon darf das Überschreiben durchlassen
      // (Nutzer-Befund 2026-08-28 — die erste Fassung ließ beide durch):
      //
      //   `kein-ordner`    — die Plattform KÖNNTE einen Ordner verbinden, der Nutzer hat
      //                      es (noch) nicht getan. Das ist eine offene Entscheidung, kein
      //                      Grund, ungeschützt zu überschreiben: der Aufrufer bricht ab.
      //   `nicht-moeglich` — die Plattform kann es gar nicht. Hier gibt es keine Wahl, die
      //                      der Nutzer treffen könnte; ein Abbruch machte die App
      //                      dauerhaft speicher-unfähig, statt ihn zu schützen.
      return this.adapters.backupFolder.isSupported()
        ? { backup: 'kein-ordner' }
        : { backup: 'nicht-moeglich' };
    }

    try {
      const erlaubt = await this.adapters.backupFolder.requestPermission(ordner);
      if (!erlaubt) {
        return { backup: 'fehlgeschlagen', backupError: 'Kein Schreibrecht für den Backup-Ordner.' };
      }
      const vorher = await this.adapters.fsHandle.read(handle);
      // Nichts zu sichern ist etwas anderes als eine gescheiterte Sicherung: eine leere
      // oder nicht lesbare Datei trägt keinen Stand, den das Überschreiben vernichtet.
      if (!vorher || vorher.byteLength === 0) return { backup: 'leer' };

      const name = backupFileName(filename, (this.adapters.now ?? (() => new Date()))());
      await this.adapters.backupFolder.writeInto(ordner, name, vorher);
      return { backup: 'geschrieben', backupName: name };
    } catch (err) {
      return {
        backup: 'fehlgeschlagen',
        backupError: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Backup-Ordner verbinden (Einstellungen). Liefert den Anzeigenamen oder `null` bei
   * Abbruch. Das Handle liegt danach im EIGENEN Store — nicht in der Arbeitskopie: es
   * gehört zum Gerät, nicht zum geladenen Dokument, und überlebt jeden Dateiwechsel.
   */
  async connectBackupFolder(): Promise<string | null> {
    const gewaehlt = await this.adapters.backupFolder.pick();
    if (!gewaehlt) return null;
    await this.adapters.backupFolderStore.save(gewaehlt);
    return this.adapters.backupFolder.nameOf(gewaehlt);
  }

  /** Verbindung lösen — ab dann speichert Tier 1a mit der Meldung „ohne Sicherung". */
  async disconnectBackupFolder(): Promise<void> {
    await this.adapters.backupFolderStore.clear();
  }

  /**
   * Lage des Backup-Ordners für die Oberfläche. `supported:false` heißt: diese Plattform
   * kennt keinen Ordner-Zugriff — dort gibt es aber auch kein stilles Überschreiben, also
   * nichts zu sichern (die Einstellungen zeigen dann keinen toten Knopf).
   */
  async backupFolderStatus(): Promise<{ supported: boolean; connected: boolean; name: string }> {
    const supported = this.adapters.backupFolder.isSupported();
    const handle = await this.adapters.backupFolderStore.load();
    return {
      supported,
      connected: handle != null,
      name: handle ? this.adapters.backupFolder.nameOf(handle) : '',
    };
  }
}
