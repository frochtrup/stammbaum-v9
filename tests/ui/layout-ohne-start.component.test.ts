// @vitest-environment happy-dom
// tests/ui/layout-ohne-start.component.test.ts — der Formfaktor wirkt auch in einer
// Schale, die `layout.start()` nie ruft (ADR-v9-171).
//
// WARUM ALS KOMPONENTENTEST UND NICHT ALS LESETEST: Der Fehler war KEIN falscher Wert,
// sondern eine fehlende reaktive Abhängigkeit. Der alte Getter las vor `start()`
// `matchMedia` DIREKT — wer ihn imperativ zweimal aufruft, bekommt beide Male die
// Wahrheit und sieht nichts. Erst ein gerendertes Markup zeigt den Unterschied: ohne
// Signal-Abhängigkeit rendert Svelte nicht neu, und die Oberfläche bleibt auf dem Stand
// des ersten Frames stehen.
//
// Der erste Anlauf dieses Wächters war genau so ein Lesetest — er blieb grün, als der
// alte Zustand zur Gegenprobe wiederhergestellt wurde. Er steht hier deshalb bewusst in
// der Form, die den Rot-Fall tatsächlich sieht.
//
// Gegenstand ist der reale Fall: `DetailHeader` blendet „← Zurück" oberhalb der
// Layout-Grenze aus (im Multi-Pane steht die Liste daneben). Im Standalone-Orte-Editor
// verschwand der Knopf nach dem Verkleinern des Fensters und kam nie zurück.
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import DetailHeader from '../../ui/shell/DetailHeader.svelte';
import { layout } from '../../ui/shell/layout.svelte';

/** Steuerbares `window.matchMedia` — der Weg, den `browserEnv` nimmt. */
function stubMatchMedia(initial: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  let matches = initial;
  const echt = window.matchMedia;
  window.matchMedia = ((): MediaQueryList =>
    ({
      get matches() {
        return matches;
      },
      addEventListener: (_t: string, cb: (e: { matches: boolean }) => void) => listeners.add(cb),
      removeEventListener: (_t: string, cb: (e: { matches: boolean }) => void) => listeners.delete(cb),
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
  return {
    resizeTo(next: boolean) {
      matches = next;
      for (const cb of listeners) cb({ matches: next });
    },
    restore() {
      window.matchMedia = echt;
    },
  };
}

afterEach(() => layout.reset());

describe('Formfaktor ohne start() (ADR-v9-171)', () => {
  it('zeigt „← Zurück" wieder an, wenn das Fenster unter die Grenze schrumpft', async () => {
    const mm = stubMatchMedia(true); // Start: Desktop-Breite
    try {
      layout.reset(); // verbindet mit der Plattform-Umgebung — KEIN start(), wie im Editor
      render(DetailHeader, { props: { title: 'Albersloh', onBack: () => {} } });

      // Oberhalb der Grenze: kein Rückweg nötig, die Liste stünde daneben.
      expect(screen.queryByText('← Zurück')).toBeNull();

      mm.resizeTo(false); // Fenster verkleinern
      await Promise.resolve();

      // Genau hier blieb die alte Fassung stehen: Wert stimmte, das Markup nicht.
      expect(screen.getByText('← Zurück')).toBeTruthy();
    } finally {
      mm.restore();
    }
  });

  it('nimmt ihn wieder weg, wenn das Fenster wieder wächst', async () => {
    const mm = stubMatchMedia(false);
    try {
      layout.reset();
      render(DetailHeader, { props: { title: 'Albersloh', onBack: () => {} } });
      expect(screen.getByText('← Zurück')).toBeTruthy();

      mm.resizeTo(true);
      await Promise.resolve();
      expect(screen.queryByText('← Zurück')).toBeNull();
    } finally {
      mm.restore();
    }
  });
});
