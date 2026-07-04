import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// base: Repo-Pfad für GitHub Pages setzen, sobald das Ziel-Repo feststeht (31 §5).
export default defineConfig({
  plugins: [svelte({ configFile: fileURLToPath(new URL('./svelte.config.js', import.meta.url)) })],
  root: 'app',
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
});
