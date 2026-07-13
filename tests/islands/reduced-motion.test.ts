// @vitest-environment happy-dom
// tests/islands/reduced-motion.test.ts — zentraler prefers-reduced-motion-Check
// (Spec 21 §6i: "EIN zentraler Check ..., von allen Inseln gemeinsam gelesen
// (INV-UI-4), nicht pro Insel neu abgefragt"). Braucht `window.matchMedia`, daher
// happy-dom statt des node-Environments der übrigen Insel-Modell-Tests.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prefersReducedMotion } from '../../ui/islands/shared/reduced-motion';

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

describe('prefersReducedMotion', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('liefert true, wenn die Systemeinstellung "Bewegung reduzieren" aktiv ist', () => {
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
  });

  it('liefert false, wenn die Systemeinstellung inaktiv ist', () => {
    stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('fragt exakt die Media-Query "(prefers-reduced-motion: reduce)" ab', () => {
    const spy = vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
    vi.stubGlobal('matchMedia', spy);

    prefersReducedMotion();

    expect(spy).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });

  it('liefert false statt zu werfen, wenn window.matchMedia fehlt (kein Crash außerhalb des Browsers)', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersReducedMotion()).toBe(false);
  });
});
