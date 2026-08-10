// @vitest-environment happy-dom
// tests/ui/StatusNotice.component.test.ts — die Statuszeile hat eine Frist und einen
// Sofort-Weg (BL-333, ADR-v9-247).
//
// Der Nutzer-Befund, der die Komponente ausgelöst hat: „der Toast verschwindet nicht mehr".
// Er war nie einer — ein `<p role="status">` ohne Timer und ohne Schließen, das stehen
// blieb, bis eine andere Meldung denselben Kanal überschrieb. Beide Wege hinaus werden
// hier geprüft, sonst wäre die Frist eine Behauptung.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import StatusNotice from '../../ui/shell/StatusNotice.svelte';

// ECHTE Timer mit kurzer Frist, KEINE Fake-Timer: der a11y-Lauf (TST-15) hängt ein
// `afterEach` an jeden Komponententest, das axe-core über den DOM schickt — und axe
// braucht echte Timer. Mit `vi.useFakeTimers()` lief dieser Test dort in den 10-s-Timeout
// und riss `npm run check:a11y` mit, während `npm test` grün blieb (gefangen vom
// Pre-Push-Hook, der die acht CI-Schritte lokal fährt).

describe('StatusNotice', () => {
  it('zeigt den Text und meldet das Schließen über ✕', async () => {
    const onDismiss = vi.fn();
    render(StatusNotice, { props: { text: '8 Ortsangaben angeglichen.', onDismiss } });

    expect(screen.getByText('8 Ortsangaben angeglichen.')).toBeTruthy();
    await fireEvent.click(screen.getByLabelText('Hinweis schließen'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('meldet das Schließen nach Ablauf der Frist von selbst', async () => {
    const onDismiss = vi.fn();
    render(StatusNotice, { props: { text: 'Hinweis', onDismiss, dauerMs: 20 } });

    expect(onDismiss).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
  });

  it('rendert ohne Text gar nichts — und startet dann auch keine Frist', async () => {
    const onDismiss = vi.fn();
    const { container } = render(StatusNotice, { props: { text: '', onDismiss, dauerMs: 10 } });

    expect(container.querySelector('p')).toBeNull();
    await new Promise((r) => setTimeout(r, 40));
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
