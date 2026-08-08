import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Eigene Config für das Skalen-/Performance-Gate (tests/perf/), weil die Haupt-Config
// tests/perf/ bewusst AUSSCHLIESST (dort begründet: Pre-Commit-Tauglichkeit).
// Ein `vitest run tests/perf` gegen die Haupt-Config würde durch deren `exclude`
// stillschweigend 0 Tests finden und grün melden — genau die Sorte lautlos wirkungsloses
// Gate, die dieses Projekt an anderer Stelle schon einmal hatte.
//
// Svelte-Plugin + browser-Conditions seit BL-311 (ADR-v9-234): die Skalen-Ebene misst nicht
// mehr nur framework-freien Kern-Code, sondern auch, WIE VIELE DOM-KNOTEN eine Index-Fläche
// bei 20.000 Einträgen erzeugt (`list-render.perf.test.ts`). Das ist der eine Messwert
// dieser Frage, der hardware-unabhängig ist — headless gemessen deckt er sich mit der
// Browser-Messung (22.272 vs. 22.613 Knoten, unter 2 % Abweichung). Der frühere Kopfsatz
// „kein svelte-Plugin nötig, gemessen wird ausschließlich framework-freier Kern-Code" gilt
// damit nicht mehr; die Kern-/Dienst-Messungen bleiben davon unberührt (sie laufen weiter
// in 'node' und importieren kein svelte, nur die Render-Datei trägt den happy-dom-Docblock).
export default defineConfig({
  plugins: [svelte()],
  resolve: {
    conditions: ['browser'],
  },
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
    // `--expose-gc` (für undo-memory.perf.test.ts, ADR-v9-92) kommt über NODE_OPTIONS im
    // npm-Skript `test:perf`, NICHT über `poolOptions.*.execArgv`. Letzteres wurde
    // zuerst versucht und am echten Lauf verworfen: Vitest 4 ERSETZT das execArgv der
    // Worker (geprüft — `process.execArgv` enthielt danach nur Vitest-eigene Flags,
    // `globalThis.gc` blieb undefined). Wer das Gate direkt per `vitest run --config …`
    // aufruft, muss NODE_OPTIONS also selbst setzen; der Test meldet das Fehlen laut,
    // statt ohne erzwungene Sammlung eine bedeutungslose Zahl grün zu melden.
  },
});
