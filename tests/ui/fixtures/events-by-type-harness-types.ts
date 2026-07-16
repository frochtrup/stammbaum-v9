// tests/ui/fixtures/events-by-type-harness-types.ts — Zeilen-Typ für
// EventsByTypeHarness.svelte, ausgelagert in eine reine .ts-Datei statt als
// TS-Interface aus einer .svelte-Datei zu exportieren (Svelte-Komponentenexporte sind
// für Laufzeit-Props gedacht, nicht für reine Typdeklarationen).
export interface HarnessRow {
  key: string;
  label: string;
}
