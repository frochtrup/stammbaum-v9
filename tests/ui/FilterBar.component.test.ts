// @vitest-environment happy-dom
// tests/ui/FilterBar.component.test.ts — geteilte Filter-Container-Komponente
// (Spec 21 §10a). Eingeklappt per Default, Trigger zeigt "Filter"/"Filter · N",
// Klick öffnet ein Panel mit dem durchgereichten children-Snippet, Klick auf ✕/Backdrop
// schließt wieder — die Komponente kennt die Filterfelder selbst nicht (Container-only).
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import FilterBarHarness from './fixtures/FilterBarHarness.svelte';

describe('FilterBar — Container-Mechanik (Spec 21 §10a)', () => {
  it('ist per Default eingeklappt: Trigger zeigt "Filter" ohne Zahl, kein Panel im DOM', () => {
    render(FilterBarHarness, { props: {} });

    expect(screen.getByRole('button', { name: 'Filter' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Filter' })).toBeNull();
  });

  it('zeigt "Filter · N", wenn N Filterfelder aktiv sind', () => {
    render(FilterBarHarness, { props: { activeCount: 2 } });

    expect(screen.getByRole('button', { name: 'Filter · 2' })).toBeTruthy();
  });

  it('Klick auf den Trigger öffnet das Panel mit dem durchgereichten Inhalt', async () => {
    render(FilterBarHarness, { props: {} });

    await fireEvent.click(screen.getByRole('button', { name: 'Filter' }));

    expect(screen.getByRole('dialog', { name: 'Filter' })).toBeTruthy();
    expect(screen.getByLabelText('Geburtsjahr von')).toBeTruthy();
    expect(screen.getByText('Filter zurücksetzen')).toBeTruthy();
  });

  it('Klick auf den Trigger schließt das Panel wieder (Toggle)', async () => {
    render(FilterBarHarness, { props: {} });
    const trigger = screen.getByRole('button', { name: 'Filter' });

    await fireEvent.click(trigger);
    expect(screen.queryByRole('dialog', { name: 'Filter' })).toBeTruthy();

    await fireEvent.click(trigger);
    expect(screen.queryByRole('dialog', { name: 'Filter' })).toBeNull();
  });

  it('Klick auf die Panel-eigene ✕ schließt das Panel', async () => {
    render(FilterBarHarness, { props: {} });

    await fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Filter schließen' }));

    expect(screen.queryByRole('dialog', { name: 'Filter' })).toBeNull();
  });
});

describe('FilterBar — Achtungs-Punkt (BL-206, ADR-v9-148)', () => {
  it('ohne attention trägt der Trigger keinen Punkt und keinen Handlungsbedarf-Text', () => {
    const { container } = render(FilterBarHarness, { props: { label: 'Werkzeuge' } });

    // Der Trigger heißt schlicht "Werkzeuge" (kein Zusatz im zugänglichen Namen).
    expect(screen.getByRole('button', { name: 'Werkzeuge' })).toBeTruthy();
    expect(container.querySelector('.stb-filterbar__dot')).toBeNull();
  });

  it('mit attention rendert einen reinen Achtungs-Punkt (Dot, KEINE Zahl außen) + Screenreader-Text', () => {
    const { container } = render(FilterBarHarness, { props: { label: 'Werkzeuge', attention: true } });

    // Reiner Dot, keine sichtbare Zahl am Trigger — der zugängliche Name trägt den
    // Handlungsbedarf, damit der Punkt nicht nur visuell existiert (LP-8/§6i).
    expect(container.querySelector('.stb-filterbar__dot')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Werkzeuge.*Handlungsbedarf/ })).toBeTruthy();
    // Kein "· N" am Trigger (das wäre die verworfene summierte-Zahl-Variante).
    expect(screen.queryByRole('button', { name: /·/ })).toBeNull();
  });
});
