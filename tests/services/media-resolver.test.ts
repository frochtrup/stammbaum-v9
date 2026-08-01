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
    expect(r.status()).toEqual({ connected: true, folderName: 'Genealogie', fileCount: 5, importedCount: 0 });
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

describe('Unicode-Normalisierung — der Umlaut-Fall (eigene Verifikation an echten Dateien)', () => {
  // BEFUND, nicht Theorie: mit einem echten, verbundenen Ordner (419 Dateien) fanden sich
  // 183 von 189 Verweisen — und die sechs Fehlschläge trugen ALLE einen Umlaut
  // (`AugusteScho_übrarb.bmp`, `TodesanzeigeCläreScho.BMP`, `Totenzettel_AnnaFlügge…`,
  // `totenzettel_ÄnneZurloh…`, `…ElisabtehBöcker…`, `…Rückseite.bmp`).
  //
  // Ursache: macOS/APFS gibt Dateinamen in NFD zurück (`u` + kombinierendes Trema),
  // GEDCOM-Dateien tragen sie in NFC (ein Zeichen `ü`). Beide sehen identisch AUS und
  // sind als Zeichenketten verschieden — auch nach `toLowerCase()`.
  const NFC = 'Documents/Totenzettel_AnnaFl\u00fcgge.jpg'; // ü als ein Zeichen (Datei)
  const NFD = 'Documents/Totenzettel_AnnaFlu\u0308gge.jpg'; // u + Trema (Ordner, macOS)

  it('die zwei Formen sind wirklich verschieden — sonst prüfte dieser Test nichts', () => {
    expect(NFC).not.toBe(NFD);
    expect(NFC.normalize('NFC')).toBe(NFD.normalize('NFC'));
  });

  it('findet eine NFD-Datei über einen NFC-Verweis', async () => {
    const r = makeResolver([NFD]);
    await r.connect();
    expect((await r.resolve(NFC)).state).toBe('ok');
  });

  it('findet auch umgekehrt (NFC-Datei, NFD-Verweis)', async () => {
    const r = makeResolver([NFC]);
    await r.connect();
    expect((await r.resolve(NFD)).state).toBe('ok');
  });

  it('greift auch im Basisnamen-Rückfall', async () => {
    const r = makeResolver(['Fotos/Cl\u00e4reScho.bmp']);
    await r.connect();
    expect((await r.resolve('Bilder/Cla\u0308reScho.bmp')).match).toBe('basename');
  });

  it('zählt die Umlaut-Fälle in der Bilanz als gefunden', async () => {
    const r = makeResolver([NFD]);
    await r.connect();
    expect(r.matchReport([NFC])).toEqual({ total: 1, found: 1, missing: 0, byBasename: 0 });
  });
});

describe('Import ohne Verzeichnis-Handle (BL-259) — der zweite Zugangsweg', () => {
  function memBytes() {
    const m = new Map<string, Blob>();
    return {
      store: {
        put: async (path: string, blob: Blob) => {
          m.set('img:' + path.trim().replace(/\\/g, '/').normalize('NFC').toLowerCase(), blob);
        },
        get: async (path: string) =>
          m.get('img:' + path.trim().replace(/\\/g, '/').normalize('NFC').toLowerCase()) ?? null,
        keys: async () => [...m.keys()].map((k) => k.slice(4)),
        clear: async () => {
          m.clear();
        },
      },
      map: m,
    };
  }

  function importing(picked: { path: string; blob: Blob }[], folderPaths: string[] = []) {
    const b = memBytes();
    let n = 0;
    const r = createMediaResolver({
      adapter: fakeAdapter(folderPaths, { isSupported: () => false }),
      store: fakeStore(),
      bytes: b.store,
      picker: { pickMany: async () => picked },
      createObjectUrl: () => `blob:import/${++n}`,
      revokeObjectUrl: () => {},
    });
    return { r, bytes: b };
  }

  it('meldet die Import-Fähigkeit getrennt von der Ordner-Fähigkeit', () => {
    const { r } = importing([]);
    expect(r.isSupported()).toBe(false); // kein showDirectoryPicker (iOS/Safari)
    expect(r.canImport()).toBe(true);
  });

  it('importierte Dateien werden über den Dateinamen gefunden — und als solche markiert', async () => {
    const { r } = importing([{ path: 'bardel.jpg', blob: new Blob(['x']) }]);
    expect(await r.importFiles()).toBe(1);

    // Der Verweis trägt einen Ordner, die importierte Datei nur ihren Namen — genau der
    // Fall, den der Browser beim Import erzwingt.
    const res = await r.resolve('Pictures/bardel.jpg');
    expect(res.state).toBe('ok');
    expect(res.url).toMatch(/^blob:/);
    expect(res.match).toBe('basename');
  });

  it('ein abgebrochener Import ändert nichts', async () => {
    const { r } = importing([]);
    expect(await r.importFiles()).toBe(0);
    expect(r.status().importedCount).toBe(0);
  });

  it('zählt importierte Dateien im Status', async () => {
    const { r } = importing([
      { path: 'a.jpg', blob: new Blob(['a']) },
      { path: 'b.jpg', blob: new Blob(['b']) },
    ]);
    await r.importFiles();
    expect(r.status().importedCount).toBe(2);
    expect(r.status().connected).toBe(false); // kein Ordner — trotzdem auflösbar
  });

  it('zählt sie auch in der Bilanz der Einstellungen — als Dateinamen-Treffer', async () => {
    const { r } = importing([{ path: 'bardel.jpg', blob: new Blob(['x']) }]);
    await r.importFiles();
    expect(r.matchReport(['Pictures/bardel.jpg', 'Pictures/fehlt.jpg'])).toEqual({
      total: 2,
      found: 1,
      missing: 1,
      byBasename: 1,
    });
  });

  it('findet auch Umlaut-Namen (dieselbe NFC-Form wie der Ordner-Index)', async () => {
    const { r } = importing([{ path: 'Totenzettel_AnnaFlu\u0308gge.jpg', blob: new Blob(['x']) }]);
    await r.importFiles();
    expect((await r.resolve('Documents/Totenzettel_AnnaFl\u00fcgge.jpg')).state).toBe('ok');
  });

  it('der Ordner hat Vorrang vor dem Import — er kennt den echten Pfad', async () => {
    const { r } = importing([{ path: 'bardel.jpg', blob: new Blob(['import']) }], ['Pictures/bardel.jpg']);
    await r.connect();
    await r.importFiles();
    expect((await r.resolve('Pictures/bardel.jpg')).match).toBe('exact');
  });

  it('ohne Ordner UND ohne Import bleibt es bei „no-folder", nicht „missing"', async () => {
    const { r } = importing([]);
    expect((await r.resolve('Pictures/x.jpg')).state).toBe('no-folder');
  });

  it('MIT Import ist eine unbekannte Datei „missing" — jetzt IST etwas bekannt', async () => {
    const { r } = importing([{ path: 'a.jpg', blob: new Blob(['a']) }]);
    await r.importFiles();
    expect((await r.resolve('Pictures/x.jpg')).state).toBe('missing');
  });

  it('clearImported() verwirft die Bytes wieder', async () => {
    const { r } = importing([{ path: 'a.jpg', blob: new Blob(['a']) }]);
    await r.importFiles();
    await r.clearImported();
    expect(r.status().importedCount).toBe(0);
    expect((await r.resolve('a.jpg')).state).toBe('no-folder');
  });
});
