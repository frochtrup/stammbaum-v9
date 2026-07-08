import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { injectCspMeta } from './app/csp-plugin';

// CSP-Meta-Tag (LP-8, Spec 30 §NFR-3): GitHub Pages liefert keine eigenen
// Response-Header, daher Meta-Tag statt HTTP-Header (wie im v8-Orakel).
// `enforce: 'post'` läuft nach Vites eigener Asset-Injektion (Script-/Link-Tags).
function cspPlugin(): Plugin {
  return {
    name: 'csp-meta',
    enforce: 'post',
    transformIndexHtml(html, ctx) {
      return injectCspMeta(html, ctx.server ? 'serve' : 'build');
    }
  };
}

// base: Repo-Pfad für GitHub Pages (31 §5) — Ziel-Repo ist frochtrup/stammbaum-v9
// (Projekt-Pages, keine User-/Org-Pages-Root), daher der Repo-Name als Pfad-Präfix.
// Gesetzt bei `vite build` UND `vite preview` — NICHT beim Dev-Server (`vite`,
// echter `command === 'serve'` OHNE `isPreview`), der bei `base: '/'` bleibt, sonst
// verschiebt sich die lokal laufende Dev-App unter `/stammbaum-v9/` und lokale
// Tooling-/Preview-Healthchecks, die die Wurzel `/` erwarten, laufen ins Leere
// (Nachtrag 2026-07-07, Fund: "Vorschau startet nicht").
//
// Vite meldet für `vite preview` INTERN ebenfalls `command === 'serve'` (wie der
// echte Dev-Server) — ein alleiniger `command === 'build'`-Check lässt `vite preview`
// fälschlich auf `base: '/'` zurückfallen, obwohl `dist/index.html` (bereits mit
// `/stammbaum-v9/`-Pfaden gebaut) unter genau diesem Pfad ausgeliefert werden muss.
// Ergebnis ohne Fix: `/stammbaum-v9/assets/*.js` liefert einen HTML-Fallback statt
// des echten Assets (MIME-Mismatch, Modul lädt nicht) — Fund 2026-07-08, ADR-v9-39,
// bis hierhin nur mit einem manuellen `--base`-Override umgangen. Vites `ConfigEnv`
// stellt für genau diesen Fall `isPreview` bereit (ab Vite 4.3, hier verifiziert
// gegen node_modules/vite/dist/node/index.d.ts) — `command === 'build' || isPreview`
// deckt Build UND Preview ab, lässt nur den echten Dev-Server bei `/`.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/stammbaum-v9/' : '/',
  plugins: [
    svelte({ configFile: fileURLToPath(new URL('./svelte.config.js', import.meta.url)) }),
    cspPlugin()
  ],
  root: 'app',
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
}));
