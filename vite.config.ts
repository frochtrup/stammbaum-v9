import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// base: Repo-Pfad für GitHub Pages (31 §5) — Ziel-Repo ist frochtrup/stammbaum-v9
// (Projekt-Pages, keine User-/Org-Pages-Root), daher der Repo-Name als Pfad-Präfix.
// NUR beim Production-Build (`command === 'build'`) gesetzt — im Dev-Server (`vite`/
// `command === 'serve'`) bleibt `base` beim Default `/`, sonst verschiebt sich die lokal
// laufende App unter `/stammbaum-v9/` und lokale Tooling-/Preview-Healthchecks, die die
// Wurzel `/` erwarten, laufen ins Leere (Nachtrag 2026-07-07, Fund: "Vorschau startet
// nicht" — Vite selbst redirected `/` → `/stammbaum-v9/` korrekt, aber der Healthcheck
// des Preview-Tools folgt dem Redirect nicht und meldet den Server nie als "running").
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/stammbaum-v9/' : '/',
  plugins: [svelte({ configFile: fileURLToPath(new URL('./svelte.config.js', import.meta.url)) })],
  root: 'app',
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
}));
