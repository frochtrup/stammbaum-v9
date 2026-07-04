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
  }
);
