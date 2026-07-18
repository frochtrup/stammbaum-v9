import { defineConfig } from 'vitest/config';

// Eigene Config für das Skalen-/Performance-Gate (tests/perf/), weil die Haupt-Config
// tests/perf/ bewusst AUSSCHLIESST (dort begründet: Pre-Commit-Tauglichkeit).
// Ein `vitest run tests/perf` gegen die Haupt-Config würde durch deren `exclude`
// stillschweigend 0 Tests finden und grün melden — genau die Sorte lautlos wirkungsloses
// Gate, die dieses Projekt an anderer Stelle schon einmal hatte.
//
// Kein svelte-Plugin/browser-Conditions nötig: gemessen wird ausschließlich
// framework-freier Kern-/Dienst-Code plus reine Modell-Funktionen (INV-ARCH-2).
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/perf/**/*.test.ts'],
    // Die 20k-Fixture zu erzeugen + zu verarbeiten liegt weit über dem 5s-Default.
    testTimeout: 600_000,
  },
});
