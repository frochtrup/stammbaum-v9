// Vite-Plugin: injiziert das echte Precache-Manifest in den gebauten Service Worker
// (BL-02, Spec 30 NFR-2). Die Entscheidungslogik liegt in `app/sw-manifest.ts` und ist
// dort build-frei getestet (TST-1) — hier nur Datei-I/O und die Vite-Anbindung.
//
// Warum `writeBundle` und nicht `generateBundle`: `sw.js` liegt in `app/public/` und
// wird von Vite VERBATIM kopiert, nicht gebündelt — im Rollup-Bundle taucht es damit
// gar nicht auf. Erst nach dem Schreiben liegt der vollständige `dist/`-Stand auf der
// Platte, und genau den braucht das Manifest: die gehashten Asset-Namen UND die
// public/-Dateien, die kein Bundle-Eintrag sind.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
import { buildPrecacheManifest, injectManifest, type PrecacheInput } from './sw-manifest';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function digestOf(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16);
}

export function serviceWorkerPlugin(): Plugin {
  let outDir = 'dist';
  let base = '/';

  return {
    name: 'stammbaum-sw-precache',
    apply: 'build',
    configResolved(config) {
      // `build.outDir` ist relativ zu `root` (hier: 'app' + '../dist'), nicht zum cwd.
      // `resolve` lässt einen bereits absoluten outDir unangetastet.
      outDir = resolve(config.root, config.build.outDir);
      base = config.base;
    },
    writeBundle() {
      const root = outDir;
      const swPath = join(root, 'sw.js');

      const files: PrecacheInput[] = walk(root).map((full) => ({
        path: relative(root, full).split(sep).join('/'),
        digest: digestOf(full)
      }));

      const manifest = buildPrecacheManifest(files, base);
      const source = readFileSync(swPath, 'utf8');
      writeFileSync(swPath, injectManifest(source, manifest), 'utf8');

      // Die Zahl ist der eigentliche Nutzen (dieselbe Lehre wie beim Perf-Gate,
      // ADR-v9-91): ohne sie sieht ein Build mit LEEREM Precache identisch aus wie
      // ein korrekter. Wer die Ausgabe liest, sieht sofort, ob die Schale drin ist.
      this.info(
        `Service Worker: Cache-Version ${manifest.version} — ` +
          `${manifest.critical.length} kritische, ${manifest.optional.length} optionale Datei(en)`
      );
    }
  };
}
