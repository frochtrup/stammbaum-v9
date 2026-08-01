// services/media/media-resolver.ts — Medien-Ordner verbinden und Pfade auflösen
// (Spec 14 §7, Spec 20 §1.14, ADR-v9-187).
//
// Der Dienst hält den verbundenen Ordner, seinen Index und einen Objekt-URL-Cache. Die
// Plattform-API steckt vollständig im injizierten `MediaFolderAdapter` — dieser Dienst
// ist damit mit einer Attrappe ohne Browser testbar (TST-3).
//
// ZWEI REGELN, die nicht verhandelbar sind:
//  1. `Media.file` wird NIE zurückgeschrieben. Ein gefundener Pfad korrigiert den Wert in
//     der Datei nicht, auch nicht „aufräumend" (LP-1). Dieser Dienst kennt die Datenbank
//     deshalb gar nicht — er sieht nur Strings.
//  2. Ein Weblink wird hier nicht angefasst. Für `weblink` liefert `resolve` sofort den
//     Zustand „extern"; es gibt keinen Fetch-Pfad, den man versehentlich aktivieren
//     könnte (LP-2/CSP).
import { classifyMediaFile } from '../../core/model/media-kind';
import { blobToDataUrl } from './blob-data-url';
import { buildMediaIndex, basenameOf, type MediaIndex } from './media-index';
import type { MediaBytesStore } from './media-bytes-store';
import type {
  MediaFilePicker,
  MediaFolderAdapter,
  MediaFolderHandleStore,
  MediaMatchKind,
} from './types';

export type MediaResolutionState =
  /** Bytes liegen vor (aus dem Ordner gelesen oder eingebettet). */
  | 'ok'
  /** Es ist ein Weblink — nichts aufzulösen, nur zu verlinken. */
  | 'external'
  /** Kein Ordner verbunden — die Datei KÖNNTE es geben, wir kommen nur nicht heran. */
  | 'no-folder'
  /** Ordner verbunden, Datei nicht darin gefunden. */
  | 'missing'
  /** Kein Dateiwert vorhanden. */
  | 'empty';

export interface ResolvedMedia {
  state: MediaResolutionState;
  /** Anzeigbare Quelle (`blob:` bzw. der `data:`-URI); '' wenn nichts anzuzeigen ist. */
  url: string;
  /** Wie der Treffer zustande kam — `basename` macht die UI sichtbar (ADR-v9-187 Punkt 5). */
  match: MediaMatchKind | null;
}

const NOT_RESOLVED: ResolvedMedia = { state: 'no-folder', url: '', match: null };

export interface MediaFolderStatus {
  connected: boolean;
  folderName: string;
  /** Anzahl der im Ordner gefundenen Dateien. */
  fileCount: number;
  /** Anzahl einzeln importierter Dateien (BL-259) — der zweite Zugangsweg. */
  importedCount: number;
}

/**
 * Erzeugt den Dienst. `createObjectUrl`/`revokeObjectUrl` sind injizierbar, weil `URL`
 * unter happy-dom keine echten Blob-URLs erzeugt — der Test braucht eine Attrappe, der
 * Produktivpfad den Browser (TST-3).
 */
export function createMediaResolver(opts: {
  adapter: MediaFolderAdapter;
  store: MediaFolderHandleStore;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  /**
   * Verkleinert ein Bild für die Kachelansicht. Injizierbar, weil `createImageBitmap`/
   * `OffscreenCanvas` unter happy-dom fehlen — und weil das Verkleinern eine
   * Plattform-Fähigkeit ist, keine Logik. Fehlt sie, wird das Original angezeigt.
   *
   * Warum überhaupt: 126 der 189 Bilddateien des Realbestands sind unkomprimierte BMP.
   * Ein Kachelraster, das sie in Originalgröße dekodiert, ist ein echter Speicherfehler.
   */
  makeThumbnail?: (blob: Blob, maxEdge: number, reencode?: boolean) => Promise<Blob>;
  /**
   * Der ZWEITE Zugangsweg (BL-259): einzeln importierte Mediendateien. Ohne ihn bleibt
   * die Medien-Anzeige auf Plattformen ohne File-System-Access-API (iOS/Safari) blind —
   * also auf genau dem Formfaktor, den Spec 01 als primäre Feldarbeits-Plattform nennt.
   * Optional, damit bestehende Tests unverändert laufen.
   */
  bytes?: MediaBytesStore;
  picker?: MediaFilePicker;
}) {
  const { adapter, store, makeThumbnail, bytes, picker } = opts;
  const createObjectUrl = opts.createObjectUrl ?? ((b: Blob) => URL.createObjectURL(b));
  const revokeObjectUrl = opts.revokeObjectUrl ?? ((u: string) => URL.revokeObjectURL(u));

  let handle: unknown = null;
  let index: MediaIndex | null = null;
  let folderName = '';
  /** Basisname → gespeicherter Schlüssel der importierten Dateien. Beim Start einmal
   *  gelesen; der Browser gibt beim Import nur den Dateinamen her (s. media-bytes-store). */
  let importedByName = new Map<string, string>();
  /** Pfad → Objekt-URL. Wird beim Ordnerwechsel vollständig freigegeben; ohne das
   *  sammelt ein langlebiger Tab Blobs an, die nie eingesammelt werden. */
  const urlCache = new Map<string, ResolvedMedia>();
  /** Dasselbe für die verkleinerten Kachelbilder — getrennt, weil dieselbe Datei in
   *  beiden Größen gebraucht wird (Kachel + Detailvorschau). */
  const thumbCache = new Map<string, ResolvedMedia>();

  function dropCache(): void {
    for (const c of [urlCache, thumbCache]) {
      for (const r of c.values()) {
        if (r.url.startsWith('blob:')) revokeObjectUrl(r.url);
      }
      c.clear();
    }
  }

  async function loadImportedIndex(): Promise<void> {
    if (!bytes) return;
    const next = new Map<string, string>();
    for (const key of await bytes.keys()) next.set(basenameOf(key).toLowerCase(), key);
    importedByName = next;
  }

  /** Bytes aus dem Import-Speicher, wenn der Ordner nichts hat. Zuordnung über den
   *  Dateinamen — mehr gibt der Browser beim Import nicht her, und der Treffer wird
   *  entsprechend als `basename` gemeldet (ADR-v9-187 Punkt 5). */
  async function fromImported(file: string): Promise<Blob | null> {
    if (!bytes) return null;
    const key = importedByName.get(basenameOf(file).toLowerCase());
    return key ? bytes.get(key) : null;
  }

  async function indexFolder(): Promise<void> {
    if (!handle) {
      index = null;
      folderName = '';
      return;
    }
    folderName = adapter.nameOf(handle);
    index = buildMediaIndex(await adapter.listFiles(handle));
  }

  return {
    isSupported: () => adapter.isSupported(),

    status(): MediaFolderStatus {
      return {
        connected: index !== null,
        folderName,
        fileCount: index?.size ?? 0,
        importedCount: importedByName.size,
      };
    },

    /**
     * Beim Start: gespeichertes Handle laden und Leserecht bestätigen lassen. Kein
     * Ordner / kein Recht ist KEIN Fehler — die App läuft ohne Medien-Ordner vollständig
     * weiter, nur ohne Vorschauen.
     */
    async restore(): Promise<boolean> {
      // Importierte Dateien überleben den Reload unabhängig vom Ordner-Handle — sie
      // werden deshalb IMMER geladen, auch wenn kein Ordner (mehr) verbunden ist.
      await loadImportedIndex();
      const saved = await store.load();
      if (!saved) return false;
      if (!(await adapter.requestPermission(saved))) return false;
      handle = saved;
      await indexFolder();
      return true;
    },

    /** Ordner-Auswahl durch den Nutzer (Einstellungen). false = abgebrochen. */
    async connect(): Promise<boolean> {
      const picked = await adapter.pick();
      if (!picked) return false;
      dropCache();
      handle = picked;
      await store.save(picked);
      await indexFolder();
      return true;
    },

    async disconnect(): Promise<void> {
      dropCache();
      handle = null;
      index = null;
      folderName = '';
      await store.clear();
    },

    /** Neu einlesen, wenn im Ordner Dateien dazugekommen sind. */
    async rescan(): Promise<void> {
      dropCache();
      await indexFolder();
    },

    /**
     * Die eine Auflösungsfrage. Reine Lesefunktion — sie verändert `file` nicht und
     * kennt die Datenbank nicht.
     */
    async resolve(file: string): Promise<ResolvedMedia> {
      const kind = classifyMediaFile(file);
      if (kind === 'empty') return { state: 'empty', url: '', match: null };
      if (kind === 'weblink') return { state: 'external', url: '', match: null };
      if (kind === 'embedded') return { state: 'ok', url: file.trim(), match: 'exact' };

      const cached = urlCache.get(file);
      if (cached) return cached;

      // ZWEI ZUGANGSWEGE, ein Ergebnis (BL-259): erst der verbundene Ordner, dann die
      // einzeln importierten Bytes. Die Reihenfolge ist bewusst — ein Ordner liefert den
      // ECHTEN Pfad, ein Import nur den Dateinamen.
      const hit = index?.find(file) ?? null;
      const remember = (r: ResolvedMedia) => {
        urlCache.set(file, r);
        return r;
      };
      if (hit) {
        try {
          const blob = await adapter.readFile(hit.entry);
          return remember({ state: 'ok', url: createObjectUrl(blob), match: hit.kind });
        } catch {
          // Im Index, aber nicht lesbar (gelöscht/umbenannt seit dem Einlesen) — fällt
          // unten auf den Import-Speicher durch, statt sofort aufzugeben.
        }
      }

      const imported = await fromImported(file);
      if (imported) return remember({ state: 'ok', url: createObjectUrl(imported), match: 'basename' });

      // Kein Ordner UND kein Import: über die Datei ist nichts bekannt. Das ist ein
      // anderer Zustand als „Ordner verbunden, Datei nicht darin" — die UI zeigt nur den
      // zweiten als ⚠ (sonst leuchtete die Warnung auf jeder Kachel, s. MediaThumb).
      if (!index && importedByName.size === 0) return NOT_RESOLVED;
      return remember({ state: 'missing', url: '', match: null });
    },

    /**
     * Mediendateien einzeln importieren (BL-259) — der Weg ohne Verzeichnis-Handle.
     * Liefert die Zahl der übernommenen Dateien; 0 heißt abgebrochen.
     */
    async importFiles(): Promise<number> {
      if (!picker || !bytes) return 0;
      const picked = await picker.pickMany();
      for (const f of picked) await bytes.put(f.path, f.blob);
      if (picked.length > 0) {
        dropCache();
        await loadImportedIndex();
      }
      return picked.length;
    },

    /** Kann dieses Gerät überhaupt einzeln importieren? */
    canImport: () => Boolean(picker && bytes),

    /** Alle importierten Bytes verwerfen. */
    async clearImported(): Promise<void> {
      if (!bytes) return;
      dropCache();
      await bytes.clear();
      await loadImportedIndex();
    },

    /**
     * Wie `resolve`, aber für die Kachelansicht: liefert eine VERKLEINERTE Fassung,
     * sofern die Plattform das kann. Ohne `makeThumbnail` (oder bei einem Fehlschlag —
     * ein Format, das der Browser nicht dekodiert) fällt es auf das Original zurück:
     * ein kleineres Bild ist eine Optimierung, kein Anzeige-Vorbehalt.
     */
    async resolveThumbnail(file: string, maxEdge = 320): Promise<ResolvedMedia> {
      const full = await this.resolve(file);
      if (full.state !== 'ok' || !makeThumbnail) return full;
      if (classifyMediaFile(file) !== 'file') return full; // eingebettet: schon klein genug

      const cached = thumbCache.get(file);
      if (cached) return cached;

      const hit = index?.find(file);
      if (!hit) return full;
      try {
        const small = await makeThumbnail(await adapter.readFile(hit.entry), maxEdge);
        const res: ResolvedMedia = { state: 'ok', url: createObjectUrl(small), match: hit.kind };
        thumbCache.set(file, res);
        return res;
      } catch {
        return full;
      }
    },

    /**
     * Eine Datei als `data:`-URI — für SELBST-ENTHALTENE Ausgaben (Story-Download,
     * §4-Reports). Ein `blob:`-URL taugt dort nicht: er lebt nur, solange der Tab lebt,
     * und ein heruntergeladenes HTML soll auch morgen noch Bilder zeigen.
     *
     * '' wenn nichts vorliegt — der Aufrufer lässt das Bild dann weg, statt einen toten
     * Verweis in die Ausgabe zu schreiben.
     */
    async resolveDataUrl(file: string): Promise<string> {
      const kind = classifyMediaFile(file);
      if (kind === 'embedded') return file.trim();
      if (kind !== 'file') return '';

      const hit = index?.find(file) ?? null;
      let blob: Blob | null = null;
      if (hit) {
        try {
          blob = await adapter.readFile(hit.entry);
        } catch {
          blob = null;
        }
      }
      blob ??= await fromImported(file);
      if (!blob) return '';

      // Verkleinert UND neu kodiert einbetten: eine Ausgabe mit 30 Fotos in
      // Originalgröße wäre zweistellig megabytegroß. `reencode` ist dabei der
      // entscheidende Teil — am Realbestand sind zwei Drittel der Bilder unkomprimierte
      // BMP UNTER der Kantenschwelle; ohne Neukodierung griffe die Verkleinerung bei
      // ihnen gar nicht (gemessen: drei Story-Fotos = 1,7 MB).
      const small = makeThumbnail ? await makeThumbnail(blob, 900, true).catch(() => blob) : blob;
      return blobToDataUrl(small);
    },

    /**
     * Der VORLAUF (ADR-v9-187 Punkt 7): löst eine Menge Dateien auf einmal auf, damit die
     * synchronen Report-Builder eine fertige Map bekommen. Ohne ihn müsste ein Builder
     * `async` werden — und wäre nicht mehr goldfile-testbar (ADR-v9-138).
     */
    async dataUrls(files: readonly string[]): Promise<Map<string, string>> {
      const out = new Map<string, string>();
      for (const f of new Set(files)) {
        const url = await this.resolveDataUrl(f);
        if (url) out.set(f, url);
      }
      return out;
    },

    /**
     * Zuordnungs-Bilanz über eine Menge von Dateiwerten — das, was die Einstellungen
     * anzeigen („N gefunden · N fehlen · N nur über den Dateinamen"). Ohne Bytes zu
     * lesen: der Index allein beantwortet die Frage.
     */
    matchReport(files: readonly string[]): {
      total: number;
      found: number;
      missing: number;
      byBasename: number;
    } {
      let found = 0;
      let missing = 0;
      let byBasename = 0;
      let total = 0;
      for (const f of files) {
        if (classifyMediaFile(f) !== 'file') continue;
        total++;
        const hit = index?.find(f) ?? null;
        if (hit) {
          found++;
          if (hit.kind === 'basename') byBasename++;
        } else if (importedByName.has(basenameOf(f).toLowerCase())) {
          // Importierte Dateien zählen als gefunden — und zwar als Dateinamen-Treffer,
          // denn mehr gibt der Browser beim Import nicht her.
          found++;
          byBasename++;
        } else {
          missing++;
        }
      }
      return { total, found, missing, byBasename };
    },

    /** Für den Test-Teardown und den Ordnerwechsel. */
    releaseAll: dropCache,
  };
}

export type MediaResolver = ReturnType<typeof createMediaResolver>;
