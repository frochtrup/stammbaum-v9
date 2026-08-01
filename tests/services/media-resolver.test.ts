// tests/services/media-resolver.test.ts — BL-257/BL-258, ADR-v9-187: Ordner-Anbindung
// und Zuordnung. Der Adapter ist eine Attrappe (TST-3) — der schwierige Teil (unscharfe
// Zuordnung) ist damit ohne Browser prüfbar.
//
// Die Beispiel-Dateinamen sind die des Realbestands: `Pictures/`/`Documents/`, BMP mal
// groß mal klein geschrieben, ein Backslash-Pfad, ein absoluter Pfad, zwei Namen ohne
// Ordner.
import { describe, it, expect, vi } from 'vitest';
import { createMediaResolver } from '../../services/media/media-resolver';
import { buildMediaIndex } from '../../services/media/media-index';
import type { MediaFolderAdapter, MediaFolderEntry, MediaFolderHandleStore } from '../../services/media/types';

function fakeFolder(paths: string[]) {
  const entries: MediaFolderEntry[] = paths.map((p) => ({
    path: p,
    name: p.split('/').pop() ?? p,
    handle: { path: p },
  }));
  return entries;
}

function fakeAdapter(paths: string[], over: Partial<MediaFolderAdapter> = {}): MediaFolderAdapter {
  return {
    isSupported: () => true,
    pick: async () => ({ name: 'Genealogie' }),
    requestPermission: async () => true,
    nameOf: (h) => (h as { name?: string })?.name ?? '',
    listFiles: async () => fakeFolder(paths),
    readFile: async (e) => new Blob([`bytes:${e.path}`]),
    ...over,
  };
}

function fakeStore(initial: unknown = null): MediaFolderHandleStore {
  let value = initial;
  return {
    load: async () => value,
    save: async (h) => {
      value = h;
    },
    clear: async () => {
      value = null;
    },
  };
}

function makeResolver(paths: string[], over: Partial<MediaFolderAdapter> = {}, store = fakeStore()) {
  let n = 0;
  return createMediaResolver({
    adapter: fakeAdapter(paths, over),
    store,
    createObjectUrl: () => `blob:fake/${++n}`,
    revokeObjectUrl: () => {},
  });
}

const REAL_PATHS = [
  'Pictures/bardel.jpg',
  'Pictures/FranzDecker1.bmp',
  'Pictures/Marianne_Ransmann_Danzig.jpg',
  'Documents/Urkunde.pdf',
  'Documents/Unterordner/tief.jpg',
];

describe('Ordner verbinden', () => {
  it('ohne Ordner ist nichts auflösbar — und das ist ein eigener Zustand, kein Fehler', async () => {
    const r = makeResolver(REAL_PATHS);
    expect(r.status().connected).toBe(false);
    expect(await r.resolve('Pictures/bardel.jpg')).toEqual({
      state: 'no-folder',
      url: '',
      match: null,
    });
  });

  it('connect() speichert den Handle und zählt die Dateien', async () => {
    const store = fakeStore();
    const r = makeResolver(REAL_PATHS, {}, store);
    expect(await r.connect()).toBe(true);
    expect(r.status()).toEqual({ connected: true, folderName: 'Genealogie', fileCount: 5 });
    expect(await store.load()).toEqual({ name: 'Genealogie' });
  });

  it('ein Abbruch der Ordner-Auswahl ändert nichts', async () => {
    const r = makeResolver(REAL_PATHS, { pick: async () => null });
    expect(await r.connect()).toBe(false);
    expect(r.status().connected).toBe(false);
  });

  it('restore() stellt den Ordner nach einem Reload wieder her', async () => {
    const r = makeResolver(REAL_PATHS, {}, fakeStore({ name: 'Genealogie' }));
    expect(await r.restore()).toBe(true);
    expect(r.status().fileCount).toBe(5);
  });

  it('restore() ohne erneut erteiltes Leserecht verbindet NICHT (Reload-Fall)', async () => {
    const r = makeResolver(REAL_PATHS, { requestPermission: async () => false }, fakeStore({ name: 'X' }));
    expect(await r.restore()).toBe(false);
    expect(r.status().connected).toBe(false);
  });

  it('disconnect() gibt die Objekt-URLs frei', async () => {
    const revoke = vi.fn();
    const r = createMediaResolver({
      adapter: fakeAdapter(REAL_PATHS),
      store: fakeStore(),
      createObjectUrl: () => 'blob:x',
      revokeObjectUrl: revoke,
    });
    await r.connect();
    await r.resolve('Pictures/bardel.jpg');
    await r.disconnect();
    expect(revoke).toHaveBeenCalledWith('blob:x');
    expect(r.status().connected).toBe(false);
  });
});

describe('resolve — die drei Arten', () => {
  it('ein Weblink wird NIE aufgelöst, sondern als extern gemeldet', async () => {
    const readFile = vi.fn();
    const r = makeResolver(REAL_PATHS, { readFile });
    await r.connect();
    expect(await r.resolve('https://data.matricula-online.eu/x/')).toEqual({
      state: 'external',
      url: '',
      match: null,
    });
    expect(readFile).not.toHaveBeenCalled();
  });

  it('ein eingebettetes Bild braucht keinen Ordner', async () => {
    const r = makeResolver([]);
    const res = await r.resolve('data:image/png;base64,AA');
    expect(res.state).toBe('ok');
    expect(res.url).toBe('data:image/png;base64,AA');
  });

  it('ein leerer Wert ist „empty", nicht „missing"', async () => {
    const r = makeResolver(REAL_PATHS);
    await r.connect();
    expect((await r.resolve('  ')).state).toBe('empty');
  });

  it('eine gefundene Datei liefert eine Objekt-URL', async () => {
    const r = makeResolver(REAL_PATHS);
    await r.connect();
    const res = await r.resolve('Pictures/bardel.jpg');
    expect(res.state).toBe('ok');
    expect(res.url).toMatch(/^blob:/);
    expect(res.match).toBe('exact');
  });

  it('liest dieselbe Datei nur EINMAL (Cache)', async () => {
    const readFile = vi.fn(async () => new Blob(['x']));
    const r = makeResolver(REAL_PATHS, { readFile });
    await r.connect();
    await r.resolve('Pictures/bardel.jpg');
    await r.resolve('Pictures/bardel.jpg');
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  it('eine im Index gelistete, aber nicht mehr lesbare Datei gilt als fehlend (kein Absturz)', async () => {
    const r = makeResolver(REAL_PATHS, {
      readFile: async () => {
        throw new Error('NotFoundError');
      },
    });
    await r.connect();
    expect((await r.resolve('Pictures/bardel.jpg')).state).toBe('missing');
  });
});

describe('unscharfe Zuordnung — und ihre Sichtbarkeit', () => {
  it('findet trotz abweichender Groß-/Kleinschreibung — als „normalized" markiert', async () => {
    const r = makeResolver(REAL_PATHS);
    await r.connect();
    const res = await r.resolve('pictures/franzdecker1.BMP');
    expect(res.state).toBe('ok');
    expect(res.match).toBe('normalized');
  });

  it('findet trotz Backslash-Trennern', async () => {
    const r = makeResolver(REAL_PATHS);
    await r.connect();
    expect((await r.resolve('Pictures\\bardel.jpg')).match).toBe('normalized');
  });

  it('findet über die Endstrecke eines absoluten Pfads', async () => {
    const r = makeResolver(REAL_PATHS);
    await r.connect();
    expect((await r.resolve('/Users/x/Genealogie/Documents/Urkunde.pdf')).match).toBe('normalized');
  });

  it('findet einen Namen OHNE Ordner — und markiert ihn als Dateinamen-Treffer', async () => {
    const r = makeResolver(REAL_PATHS);
    await r.connect();
    const res = await r.resolve('bardel.jpg');
    expect(res.state).toBe('ok');
    expect(res.match).toBe('basename');
  });

  it('rät NICHT, wenn derselbe Dateiname mehrfach vorkommt', async () => {
    // Der gefährliche Fall: zwei `portrait.jpg` in verschiedenen Ordnern. Ein Rückfall
    // auf den Namen zeigte hier mit 50 % Wahrscheinlichkeit das falsche Bild — lieber
    // „nicht gefunden" als „vielleicht richtig".
    const r = makeResolver(['A/portrait.jpg', 'B/portrait.jpg']);
    await r.connect();
    expect((await r.resolve('C/portrait.jpg')).state).toBe('missing');
  });

  it('meldet eine wirklich fehlende Datei als fehlend', async () => {
    const r = makeResolver(REAL_PATHS);
    await r.connect();
    expect((await r.resolve('Pictures/gibtsnicht.jpg')).state).toBe('missing');
  });
});

describe('matchReport — die Zahl, die in den Einstellungen steht', () => {
  it('zählt gefunden/fehlend/nur-über-Dateinamen und ignoriert Weblinks', async () => {
    const r = makeResolver(REAL_PATHS);
    await r.connect();
    const report = r.matchReport([
      'Pictures/bardel.jpg', // exakt
      'pictures/FRANZDECKER1.bmp', // normalisiert
      'Marianne_Ransmann_Danzig.jpg', // nur Dateiname
      'Pictures/weg.jpg', // fehlt
      'https://data.matricula-online.eu/x/', // zählt gar nicht mit
      'data:image/png;base64,AA', // zählt gar nicht mit
    ]);
    expect(report).toEqual({ total: 4, found: 3, missing: 1, byBasename: 1 });
  });

  it('ohne Ordner ist alles „fehlt" — die Zahl sagt dann nichts über die Datei aus', async () => {
    const r = makeResolver(REAL_PATHS);
    expect(r.matchReport(['Pictures/bardel.jpg'])).toEqual({
      total: 1,
      found: 0,
      missing: 1,
      byBasename: 0,
    });
  });
});

describe('WÄCHTER: die Auflösung schreibt nichts zurück (LP-1)', () => {
  it('resolve() gibt den Eingabewert unverändert zurück in die Hand des Aufrufers', async () => {
    // Der Dienst kennt die Datenbank gar nicht — er sieht nur Strings, und Strings sind
    // unveränderlich. Dieser Test hält die ARCHITEKTUR-Entscheidung fest: sobald jemand
    // dem Resolver ein `Media`-Objekt (oder die `Database`) hineinreicht, damit er
    // „gleich den richtigen Pfad einträgt", bricht diese Signatur — und der Test hier.
    const r = makeResolver(REAL_PATHS);
    await r.connect();
    const before = 'pictures/FRANZDECKER1.bmp';
    const res = await r.resolve(before);
    expect(res.state).toBe('ok');
    expect(before).toBe('pictures/FRANZDECKER1.bmp');
    // Auch der Index bleibt unangetastet: ein zweiter Aufruf findet dieselbe Form.
    expect((await r.resolve('pictures/FRANZDECKER1.bmp')).match).toBe('normalized');
  });
});

describe('buildMediaIndex — direkt', () => {
  it('zählt die aufgezählten Dateien', () => {
    expect(buildMediaIndex(fakeFolder(REAL_PATHS)).size).toBe(5);
  });

  it('findet eine tief liegende Datei über ihren vollen Pfad', () => {
    const idx = buildMediaIndex(fakeFolder(REAL_PATHS));
    expect(idx.find('Documents/Unterordner/tief.jpg')?.kind).toBe('exact');
  });

  it('liefert null für einen leeren Wert', () => {
    expect(buildMediaIndex(fakeFolder(REAL_PATHS)).find('')).toBeNull();
  });
});
