// @vitest-environment happy-dom
// tests/ui/OfflineIndicator.component.test.ts — Offline-Indikator als Component-Test
// (Spec 32 §6, BL-03).
//
// Warum zusätzlich zu den Unit-Tests in online-status.test.ts: der Zustand lebt in einem
// Modul-Singleton außerhalb des Komponentenbaums. „Der Getter liefert false" ist nicht
// dasselbe wie „das Bauteil rendert den Indikator" — genau die Lücke, die bei den
// Undo-Schaltflächen (BL-01) erst am laufenden System auffiel, obwohl 15 Unit-Tests
// grün waren.
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import OfflineIndicator from '../../ui/shell/OfflineIndicator.svelte';
import { onlineStatus, type OnlineStatusEnv } from '../../ui/shell/online-status.svelte';

function env(online: boolean, cached: boolean): OnlineStatusEnv {
  return {
    isOnline: () => online,
    addListener: () => {},
    removeListener: () => {},
    hasAppCache: async () => cached
  };
}

describe('OfflineIndicator', () => {
  beforeEach(() => onlineStatus.reset());

  it('bleibt unsichtbar, solange die Verbindung steht', () => {
    onlineStatus.start(env(true, true));
    render(OfflineIndicator);
    expect(screen.queryByText(/offline/i)).toBeNull();
  });

  it('erscheint, sobald der Browser offline meldet', () => {
    onlineStatus.start(env(false, true));
    render(OfflineIndicator);
    expect(screen.getByText(/offline/i)).toBeTruthy();
  });

  it('erklärt im Normalfall, dass Bearbeiten weiter funktioniert (offline-first, kein Fehlerton)', () => {
    onlineStatus.start(env(false, true));
    render(OfflineIndicator);
    const el = screen.getByRole('status');
    expect(el.getAttribute('aria-label')).toContain('läuft aus dem Cache');
    expect(el.className).not.toContain('stb-offline--warn');
  });

  it('ist schon VOR start() korrekt — Kinder mounten vor der Wurzel', () => {
    // Regression (beim Bau von BL-03 aufgetreten, TST-4): `online` gab vor `start()`
    // blind `true` zurück. In Svelte läuft das onMount eines KINDES vor dem der
    // Wurzel — `MapLensView` las seinen Offline-Startwert also, bevor `App.svelte`
    // den Zustand verdrahtet hatte, und ein Kaltstart ohne Netz sah fälschlich
    // „online" aus. Zwei MapLensView-Tests deckten es auf; ohne diesen Test hier
    // wäre die Zusicherung nur ein Nebeneffekt jener Tests.
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    try {
      expect(onlineStatus.online).toBe(false); // KEIN start() aufgerufen
    } finally {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    }
  });

  it('erscheint auch, wenn er VOR start() gerendert wurde (echte Mount-Reihenfolge)', async () => {
    // Regression, im Browser gefunden (2026-07-18, TST-4) — alle übrigen Tests hier
    // riefen start() VOR dem Rendern und konnten den Fehler deshalb nicht sehen.
    // Real ist die Reihenfolge umgekehrt: OfflineIndicator ist ein Kind von App.svelte
    // und rendert vor dessen onMount, das start() aufruft. Vorher fror das $derived
    // der Komponente auf dem nicht-reaktiven Vor-start()-Zweig ein und blieb für
    // immer unsichtbar, obwohl der Zustand korrekt umsprang.
    const { rerender } = render(OfflineIndicator);
    expect(screen.queryByText(/offline/i)).toBeNull();

    onlineStatus.start(env(false, true)); // erst JETZT verdrahtet
    await rerender({});

    expect(screen.getByText(/offline/i)).toBeTruthy();
  });

  it('warnt sichtbar anders, wenn zusätzlich der App-Cache fehlt', async () => {
    onlineStatus.start(env(false, false));
    await Promise.resolve();
    await Promise.resolve();
    render(OfflineIndicator);
    const el = screen.getByRole('status');
    expect(el.className).toContain('stb-offline--warn');
    expect(el.getAttribute('aria-label')).toContain('Einmal online öffnen');
  });
});
