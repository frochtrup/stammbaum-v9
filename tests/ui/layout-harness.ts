// tests/ui/layout-harness.ts — Formfaktor in Komponententests explizit festlegen.
//
// Warum das nötig ist (und keine Bequemlichkeit): `layout` (ui/shell/layout.svelte.ts)
// ist ein Modul-Singleton und fragt vor `start()` die Plattform direkt. In happy-dom
// ist der Viewport standardmäßig 1024px breit — jeder Komponententest lief damit
// stillschweigend im DESKTOP-Layout, sobald BL-06 die erste formfaktor-abhängige
// Verzweigung einführte. Vierzehn bestehende Tests kippten dadurch auf einen Schlag,
// obwohl sie das Mobile-Modell prüfen wollten und ihr Gegenstand sich nicht geändert
// hatte.
//
// Ein Test, der eine formfaktor-abhängige Oberfläche prüft, MUSS seinen Formfaktor
// daher benennen — auf einen happy-dom-Standardwert zu vertrauen heißt, ihn zu raten.
// Deshalb EIN geteiltes Hilfsmittel statt einer kopierten Fake-Umgebung je Datei.
import { layout, type LayoutEnv } from '../../ui/shell/layout.svelte';

/**
 * Feste Formfaktor-Umgebung zum Injizieren (App.svelte `layoutEnv`-Prop).
 *
 * Für Tests, die App.svelte SELBST rendern: die Komponente ruft im onMount
 * `layout.start()` und überschriebe damit ein vorher gesetztes `pinLayout` — der
 * Formfaktor muss dort also hinein, nicht daneben.
 */
export function layoutEnvFor(desktop: boolean): LayoutEnv {
  return { matches: () => desktop, subscribe: () => () => {} };
}

/**
 * Legt den Formfaktor für die Dauer eines Tests fest.
 *
 * Rückgabe ist die Aufräumfunktion; `layout.reset()` gehört in ein `afterEach`, damit
 * der Singleton nicht in den nächsten Test leckt.
 */
export function pinLayout(desktop: boolean): () => void {
  return layout.start(layoutEnvFor(desktop));
}
