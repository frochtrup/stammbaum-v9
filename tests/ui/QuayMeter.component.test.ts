// @vitest-environment happy-dom
// tests/ui/QuayMeter.component.test.ts — Beweiskraft-Meter (Spec 21 §7, ADR-v9-118).
// Kernkontrakt: die QUAY-Stufe wird über die ANZAHL gefüllter Pips kodiert (Position,
// nicht Farbe) — farbenblind-robust und OHNE Alarm-Rot für Stufe 0 (die frühere
// Kollision q0-Rot ≈ --stb-danger, die eine belegte Angabe wie einen Fehler aussehen
// ließ). Farbe ist nur redundante Verstärkung des gefüllten Zustands.
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import QuayMeter from '../../ui/shell/QuayMeter.svelte';

describe('QuayMeter — Beweiskraft als gefüllte Pips 0..3', () => {
  it.each([0, 1, 2, 3] as const)('zeigt immer 3 Pips und füllt bei quay=%s genau %s davon', (q) => {
    const { container } = render(QuayMeter, { props: { quay: q } });
    const meter = container.querySelector('.quay-meter') as HTMLElement;
    expect(meter).not.toBeNull();
    expect(meter.getAttribute('data-quay')).toBe(String(q));
    expect(meter.querySelectorAll('.quay-meter__pip')).toHaveLength(3);
    expect(meter.querySelectorAll('.quay-meter__pip--on')).toHaveLength(q);
  });

  it('trägt ein lesbares aria-label und role=img (Screenreader statt Farbe)', () => {
    const { container } = render(QuayMeter, { props: { quay: 2 } });
    const meter = container.querySelector('.quay-meter') as HTMLElement;
    expect(meter.getAttribute('role')).toBe('img');
    expect(meter.getAttribute('aria-label')).toBe('Beweiskraft 2 von 3');
  });

  it('füllt bei Stufe 0 KEINEN Pip — Stufe 0 braucht keine (Alarm-)Farbe', () => {
    const { container } = render(QuayMeter, { props: { quay: 0 } });
    expect(container.querySelectorAll('.quay-meter__pip--on')).toHaveLength(0);
  });
});
