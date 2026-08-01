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
import { buildMediaIndex, type MediaIndex } from './media-index';
import type {
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
}) {
  const { adapter, store } = opts;
  const createObjectUrl = opts.createObjectUrl ?? ((b: Blob) => URL.createObjectURL(b));
  const revokeObjectUrl = opts.revokeObjectUrl ?? ((u: string) => URL.revokeObjectURL(u));

  let handle: unknown = null;
  let index: MediaIndex | null = null;
  let folderName = '';
  /** Pfad → Objekt-URL. Wird beim Ordnerwechsel vollständig freigegeben; ohne das
   *  sammelt ein langlebiger Tab Blobs an, die nie eingesammelt werden. */
  const urlCache = new Map<string, ResolvedMedia>();

  function dropCache(): void {
    for (const r of urlCache.values()) {
      if (r.url.startsWith('blob:')) revokeObjectUrl(r.url);
    }
    urlCache.clear();
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
      return { connected: index !== null, folderName, fileCount: index?.size ?? 0 };
    },

    /**
     * Beim Start: gespeichertes Handle laden und Leserecht bestätigen lassen. Kein
     * Ordner / kein Recht ist KEIN Fehler — die App läuft ohne Medien-Ordner vollständig
     * weiter, nur ohne Vorschauen.
     */
    async restore(): Promise<boolean> {
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

      if (!index) return NOT_RESOLVED;
      const cached = urlCache.get(file);
      if (cached) return cached;

      const hit = index.find(file);
      if (!hit) {
        const miss: ResolvedMedia = { state: 'missing', url: '', match: null };
        urlCache.set(file, miss);
        return miss;
      }
      try {
        const blob = await adapter.readFile(hit.entry);
        const res: ResolvedMedia = { state: 'ok', url: createObjectUrl(blob), match: hit.kind };
        urlCache.set(file, res);
        return res;
      } catch {
        // Im Index, aber nicht lesbar (gelöscht/umbenannt seit dem Einlesen) — für den
        // Nutzer dasselbe wie „nicht gefunden", nur ohne Absturz.
        const miss: ResolvedMedia = { state: 'missing', url: '', match: null };
        urlCache.set(file, miss);
        return miss;
      }
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
        if (!hit) missing++;
        else {
          found++;
          if (hit.kind === 'basename') byBasename++;
        }
      }
      return { total, found, missing, byBasename };
    },

    /** Für den Test-Teardown und den Ordnerwechsel. */
    releaseAll: dropCache,
  };
}

export type MediaResolver = ReturnType<typeof createMediaResolver>;
