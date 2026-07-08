import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    // eslint-plugin-svelte's flat/recommended wires svelte-eslint-parser for
    // *.svelte/*.svelte.ts, but leaves the embedded <script>-Parser für Svelte 5
    // + TypeScript ungesetzt (leeres parserOptions) — ohne dies parst es TS-Syntax
    // (Typen, Interfaces, Generics) mit espree und bricht. Standard-Verdrahtung
    // laut eslint-plugin-svelte-Doku.
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser
      }
    }
  },
  {
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly' }
    }
  },
  {
    // Svelte-Komponenten sind die reaktive Schale (Spec 02 §2) — sie dürfen DOM-Refs
    // halten (`bind:this`), anders als der Kern (INV-ARCH-1, gilt nur für core/).
    // Ohne diese Globals meldet der eingebettete <script>-Parser HTMLDivElement/window/
    // document als undefined (base no-undef, DOM-Lib-Typen sind kein Laufzeit-Scope).
    // `navigator`/`setTimeout`/`clearTimeout` ergänzt für die Karten-Lens (ADR-v9-25:
    // Offline-Erkennung + Animations-Takt) — dieselbe Plattform-Erlaubnis wie window/
    // document, weiterhin nur außerhalb von core/ (INV-ARCH-1-Gate prüft das separat).
    // `ResizeObserver` ergänzt für die Zeitleiste-Lens (Spec 20 §1.10: Swim-Lane-Breite
    // folgt der Containerbreite, analog zum Orakel-`window.resize`-Listener).
    // `fetch` ergänzt für den Demo-Ladeweg (Spec 20 §1.2 [S]: `fetch('./demo.ged')`,
    // analog Verhaltens-Orakel legacy-v8/storage.js loadDemo()).
    // `HTMLInputElement` ergänzt für PersonForm (Spec 20 §2: value/onchange-Muster auf
    // <input>-Feldern, analog dem bereits erlaubten HTMLSelectElement).
    files: ['**/*.svelte'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        ResizeObserver: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLInputElement: 'readonly',
        fetch: 'readonly'
      }
    }
  },
  {
    // `<select bind:value>` ist unter happy-dom (Komponenten-Testumgebung, Spec 32 §6)
    // nicht per `fireEvent.change` testbar — happy-dom reflektiert `:checked` auf
    // `<option>` nach einem 'change'-Event nicht zuverlässig zurück in Svelte 5s
    // kompiliertes bind:value, wodurch der gebundene Wert beim nächsten Lesen (z. B.
    // ein Speichern-Klick direkt danach) veraltet bleibt — kein Svelte-/eslint-
    // Compile-Fehler, nur ein stiller Test-/Laufzeit-Bug. Wurde einmal projektweit
    // gefunden+behoben (7 Selects), tauchte aber in der Task/Log/Hypothesis-Session
    // (2026-07-07, ADR-v9-37) in 7 NEUEN Stellen wieder auf, weil die Lehre nur in
    // Kommentaren stand, nicht strukturell erzwungen war. Deshalb jetzt als Lint-Gate:
    // `value={x} onchange={(e) => (x = e.currentTarget.value)}` ist das etablierte
    // Ersatzmuster (s. PersonForm.svelte `sex`-Select als Vorbild).
    files: ['**/*.svelte'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'SvelteElement[name.name="select"] SvelteDirective[kind="Binding"]:has(SvelteDirectiveKey[name.name="value"])',
          message:
            '<select bind:value> ist unter happy-dom nicht zuverlässig testbar (TST-12, Spec 32). Nutze stattdessen value={x} onchange={(e) => (x = e.currentTarget.value)}.'
        }
      ]
    }
  }
);
