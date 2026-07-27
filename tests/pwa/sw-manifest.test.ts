import { describe, expect, it } from 'vitest';
import {
  buildPrecacheManifest,
  computeCacheVersion,
  injectManifest,
  INJECT_START,
  INJECT_END
} from '../../app/sw-manifest';

// Realistischer Build-Stand (verifiziert an `npm run build`, 2026-07-18):
// eine gehashte JS-Datei, eine gehashte CSS-Datei, index.html + die public/-Dateien.
const FILES = [
  { path: 'index.html', digest: 'aaa1' },
  { path: 'assets/index-CSrp18N3.js', digest: 'bbb2' },
  { path: 'assets/index-BG44d-Ve.css', digest: 'ccc3' },
  { path: 'manifest.webmanifest', digest: 'ddd4' },
  { path: 'icon.svg', digest: 'eee5' },
  { path: 'offline.html', digest: 'fff6' },
  { path: 'demo.ged', digest: '9997' },
  { path: 'sw.js', digest: '8888' }
];

describe('buildPrecacheManifest', () => {
  it('nimmt die Schale (HTML/JS/CSS/Manifest/Icon) atomar in critical auf', () => {
    const m = buildPrecacheManifest(FILES, '/stammbaum-v9/');
    expect(m.critical).toEqual([
      '/stammbaum-v9/assets/index-BG44d-Ve.css',
      '/stammbaum-v9/assets/index-CSrp18N3.js',
      '/stammbaum-v9/icon.svg',
      '/stammbaum-v9/index.html',
      '/stammbaum-v9/manifest.webmanifest',
      '/stammbaum-v9/offline.html'
    ]);
  });

  it('stuft Daten-/Medien-Assets als optional ein (App bleibt ohne sie benutzbar)', () => {
    const m = buildPrecacheManifest(FILES, '/stammbaum-v9/');
    expect(m.optional).toEqual(['/stammbaum-v9/demo.ged']);
  });

  it('nimmt den Service Worker NIE in seinen eigenen Precache auf', () => {
    const m = buildPrecacheManifest(FILES, '/stammbaum-v9/');
    const all = [...m.critical, ...m.optional];
    expect(all.some((u) => u.endsWith('/sw.js'))).toBe(false);
  });

  it('schließt das mit-deployte Benutzerhandbuch (HANDBUCH.html + handbuch-assets/) vom Precache aus', () => {
    // Online-Hilfedoc: gehört NICHT in den (kritischen) Precache, sonst bumpte jede
    // `npm run handbuch`-Änderung die App-Cache-Version und zwänge alle Nutzer zum
    // Voll-Neuladen. Weder critical noch optional.
    const m = buildPrecacheManifest(
      [
        { path: 'index.html', digest: 'a' },
        { path: 'HANDBUCH.html', digest: 'h1' },
        { path: 'handbuch-assets/13b-mediengalerie.png', digest: 'h2' },
      ],
      '/stammbaum-v9/',
    );
    const all = [...m.critical, ...m.optional];
    expect(all.some((u) => u.includes('HANDBUCH.html'))).toBe(false);
    expect(all.some((u) => u.includes('handbuch-assets/'))).toBe(false);
    expect(m.critical).toEqual(['/stammbaum-v9/index.html']);
  });

  it('setzt das Vite-base als absolutes Präfix (GitHub-Pages-Unterpfad)', () => {
    const lokal = buildPrecacheManifest(FILES, '/');
    expect(lokal.critical).toContain('/index.html');
    expect(lokal.critical).not.toContain('/stammbaum-v9/index.html');
  });

  it('ergänzt ein fehlendes Schluss-/ am base', () => {
    const m = buildPrecacheManifest([{ path: 'index.html', digest: 'a' }], '/stammbaum-v9');
    expect(m.critical).toEqual(['/stammbaum-v9/index.html']);
  });
});

describe('computeCacheVersion — die v9-Falle aus Spec 30 NFR-2', () => {
  it('ändert sich, wenn sich ein Datei-Inhalt ändert (auch bei gleichem Namen)', () => {
    // Der Fall, den v8s handgezähltes CACHE_NAME verpasste: public/-Dateien wie
    // offline.html oder icon.svg tragen KEINEN Hash im Namen — nur der Inhalts-Digest
    // unterscheidet sie. Ohne diesen Test wäre die Generierung für genau die Dateien
    // blind, die auch in v8 das Problem waren.
    const vorher = computeCacheVersion([{ path: 'offline.html', digest: 'alt' }]);
    const nachher = computeCacheVersion([{ path: 'offline.html', digest: 'neu' }]);
    expect(nachher).not.toBe(vorher);
  });

  it('ändert sich, wenn eine Datei hinzukommt oder wegfällt', () => {
    const eine = computeCacheVersion([{ path: 'a.js', digest: 'x' }]);
    const zwei = computeCacheVersion([
      { path: 'a.js', digest: 'x' },
      { path: 'b.js', digest: 'y' }
    ]);
    expect(zwei).not.toBe(eine);
  });

  it('ist stabil gegenüber der Reihenfolge (kein Cache-Bruch ohne Inhaltsänderung)', () => {
    const a = computeCacheVersion([
      { path: 'a.js', digest: 'x' },
      { path: 'b.js', digest: 'y' }
    ]);
    const b = computeCacheVersion([
      { path: 'b.js', digest: 'y' },
      { path: 'a.js', digest: 'x' }
    ]);
    expect(a).toBe(b);
  });

  it('ist deterministisch (derselbe Build ⇒ dieselbe Version)', () => {
    expect(computeCacheVersion(FILES)).toBe(computeCacheVersion(FILES));
  });
});

describe('injectManifest', () => {
  const SOURCE = `const x = 1;\n${INJECT_START}\nconst PRECACHE = { version: 'dev', critical: [], optional: [] };\n${INJECT_END}\nconst y = 2;\n`;

  it('ersetzt den markierten Block durch das echte Manifest', () => {
    const out = injectManifest(SOURCE, {
      version: 'cafe1234',
      critical: ['/stammbaum-v9/index.html'],
      optional: []
    });
    expect(out).toContain('"version": "cafe1234"');
    expect(out).toContain('"/stammbaum-v9/index.html"');
    expect(out).not.toContain("version: 'dev'");
    expect(out).toContain('const x = 1;');
    expect(out).toContain('const y = 2;');
  });

  it('bleibt selbst injizierbar (Marker überleben die Injektion)', () => {
    // Sonst wäre nur der erste Build korrekt — ein zweiter Lauf über dieselbe
    // Datei (Watch-Modus, wiederholter Build) fiele still auf den leeren
    // Dev-Precache zurück.
    const once = injectManifest(SOURCE, { version: 'a', critical: ['/a'], optional: [] });
    const twice = injectManifest(once, { version: 'b', critical: ['/b'], optional: [] });
    expect(twice).toContain('"version": "b"');
    expect(twice).not.toContain('"version": "a"');
  });

  it('wirft, wenn die Marker fehlen — statt einen leeren Precache auszuliefern', () => {
    expect(() => injectManifest('const ohneMarker = 1;', { version: 'a', critical: [], optional: [] })).toThrow(
      /Injektions-Marker nicht gefunden/
    );
  });
});
