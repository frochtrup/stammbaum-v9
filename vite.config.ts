import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// base: Repo-Pfad für GitHub Pages (31 §5) — Ziel-Repo ist frochtrup/stammbaum-v9
// (Projekt-Pages, keine User-/Org-Pages-Root), daher der Repo-Name als Pfad-Präfix.
export default defineConfig({
  base: '/stammbaum-v9/',
  plugins: [svelte({ configFile: fileURLToPath(new URL('./svelte.config.js', import.meta.url)) })],
  root: 'app',
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
});
