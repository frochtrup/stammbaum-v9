import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Kern-/Dienst-Tests laufen mit environment 'node' (INV-ARCH-2: build-frei, DOM-frei).
// Komponenten-Tests (ui/) markieren sich einzeln mit `// @vitest-environment happy-dom`.
export default defineConfig({
  plugins: [svelte()],
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts']
  }
});
