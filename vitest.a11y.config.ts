import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Zweiter Lauf über DIESELBEN Komponententests, diesmal mit dem axe-Hook (Spec 32
// TST-15, BL-66). Zwei Abweichungen von `vitest.config.ts`, beide notwendig:
//
//  1. `sequence.hooks: 'list'` — sonst räumt `@testing-library/svelte` den DOM ab,
//     bevor der Scanner ihn sieht (Begründung + Messwerte in tests/a11y/axe-setup.ts).
//     Deshalb ein eigener Lauf: die Reihenfolge im Hauptlauf umzustellen würde alle
//     1.771 Tests betreffen, um 827 davon zu scannen.
//  2. `include` nur `tests/ui/**` — nur dort entsteht überhaupt DOM. Kern-/Dienst-Tests
//     laufen mit environment 'node' (INV-ARCH-2) und hätten nichts zu prüfen.
//
// Aufruf NUR über `npm run check:a11y` (tools/a11y/run-a11y.mjs) — der Wrapper setzt
// `STB_A11Y_STATS` und prüft danach, dass der Lauf tatsächlich etwas gesehen hat. Ein
// blanker `vitest --config`-Aufruf hier meldet grün, ohne diese Absicherung.
export default defineConfig({
  plugins: [svelte()],
  resolve: {
    conditions: ['browser']
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/ui/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    sequence: { hooks: 'list' },
    setupFiles: ['./tests/a11y/axe-setup.ts']
  }
});
