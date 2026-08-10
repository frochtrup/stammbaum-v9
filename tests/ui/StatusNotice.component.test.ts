// @vitest-environment happy-dom
// tests/ui/StatusNotice.component.test.ts — die Statuszeile hat eine Frist und einen
// Sofort-Weg (BL-333, ADR-v9-247).
//
// Der Nutzer-Befund, der die Komponente ausgelöst hat: „der Toast verschwindet nicht mehr".
// Er war nie einer — ein `<p role="status">` ohne Timer und ohne Schließen, das stehen
// blieb, bis eine andere Meldung denselben Kanal überschrieb. Beide Wege hinaus werden
// hier geprüft, sonst wäre die Frist eine Behauptung.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import StatusNotice from '../../ui/shell/StatusNotice.svelte';

afterEach(() => {
  vi.useRealTimers();
});

describe('StatusNotice', () => {
  it('zeigt den Text und meldet das Schließen über ✕', async () => {
    const onDismiss = vi.fn();
    render(StatusNotice, { props: { text: '8 Ortsangaben angeglichen.', onDismiss } });

    expect(screen.getByText('8 Ortsangaben angeglichen.')).toBeTruthy();
    await fireEvent.click(screen.getByLabelText('Hinweis schließen'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('meldet das Schließen nach Ablauf der Frist von selbst', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(StatusNotice, { props: { text: 'Hinweis', onDismiss, dauerMs: 5000 } });

    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4999);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('rendert ohne Text gar nichts — und startet dann auch keine Frist', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const { container } = render(StatusNotice, { props: { text: '', onDismiss } });

    expect(container.querySelector('p')).toBeNull();
    vi.advanceTimersByTime(60_000);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
