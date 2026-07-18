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
    // PFLICHT, nicht Geschmack: der Standard-Reporter unterdrückt console.log aus grünen
    // Tests restlos (verifiziert 2026-07-18, auch mit CI=true) — im CI-Log stünde dann
    // nur "1 passed" und die Messwerte, um die es hier einzig geht, wären unsichtbar.
    // Das Gate wäre ein reiner Rot/Grün-Wecker ohne die Zahl, die seinen Nutzen ausmacht
    // (s. Kopfkommentar von scale.perf.test.ts). Beim Verdrahten in CI (BL-48) zunächst
    // übersehen und erst bei der Frage "wo finde ich die Zahl?" aufgefallen.
    reporters: ['verbose'],
    // Die 20k-Fixture zu erzeugen + zu verarbeiten liegt weit über dem 5s-Default.
    testTimeout: 600_000,
  },
});
