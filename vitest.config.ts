import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Kern-/Dienst-Tests laufen mit environment 'node' (INV-ARCH-2: build-frei, DOM-frei).
// Komponenten-Tests (tests/ui/) markieren sich einzeln mit dem Docblock
// `// @vitest-environment happy-dom` (Vitest 4 hat das frühere environmentMatchGlobs
// entfernt — Docblock ist der verbleibende, unterstützte Mechanismus). Svelte 5
// braucht zusätzlich resolve.conditions 'browser', sonst löst Vite den Server-Build
// von svelte auf (mount() wirft lifecycle_function_unavailable) — betrifft nur, wie
// das svelte-Paket aufgelöst wird, nicht die Kern-/Dienst-Tests (die importieren kein
// svelte).
export default defineConfig({
  plugins: [svelte()],
  resolve: {
    conditions: ['browser']
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts']
  }
});
