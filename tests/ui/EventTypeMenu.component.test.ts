// @vitest-environment happy-dom
// tests/ui/EventTypeMenu.component.test.ts — geteiltes "+ Ereignis"-Sammel-Menü
// (ADR-v9-62/63, Spec 20 §2). Deckt die Shell-Mechanik isoliert ab (Trigger öffnet/
// schließt, Gruppen mit Trenner, "andere Typ"-Fallback via natives select+Button) —
// Integrationsverhalten (welche Items PersonDetail/FamilyDetail übergeben) ist bereits
// in deren eigenen Component-Tests abgedeckt (Testpyramide, wenige Komponenten-Tests).
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import EventTypeMenu from '../../ui/shell/EventTypeMenu.svelte';

describe('EventTypeMenu — Trigger + Panel', () => {
  it('zeigt den Trigger-Button, Panel ist standardmäßig geschlossen', () => {
    render(EventTypeMenu, { props: { groups: [[{ tag: 'EVEN', label: 'Ereignis' }]], onSelect: vi.fn() } });

    expect(screen.getByText('+ Ereignis')).toBeTruthy();
    expect(screen.queryByRole('group', { name: '+ Ereignis' })).toBeNull();
  });

  it('Klick auf den Trigger öffnet das Panel mit den Items', async () => {
    render(EventTypeMenu, {
      props: { groups: [[{ tag: 'EVEN', label: 'Ereignis' }, { tag: 'PROP', label: 'Eigentum' }]], onSelect: vi.fn() },
    });

    await fireEvent.click(screen.getByText('+ Ereignis'));

    expect(screen.getByRole('group', { name: '+ Ereignis' })).toBeTruthy();
    expect(screen.getByText('Ereignis', { selector: '.stb-event-menu__item' })).toBeTruthy();
    expect(screen.getByText('Eigentum', { selector: '.stb-event-menu__item' })).toBeTruthy();
  });

  it('Klick auf ein Item ruft onSelect mit dem Tag auf und schließt das Panel', async () => {
    const onSelect = vi.fn();
    render(EventTypeMenu, { props: { groups: [[{ tag: 'EVEN', label: 'Ereignis' }]], onSelect } });

    await fireEvent.click(screen.getByText('+ Ereignis'));
    await fireEvent.click(screen.getByText('Ereignis', { selector: '.stb-event-menu__item' }));

    expect(onSelect).toHaveBeenCalledWith('EVEN');
    expect(screen.queryByRole('group', { name: '+ Ereignis' })).toBeNull();
  });

  it('zeigt einen Trenner zwischen mehreren Gruppen, keinen vor der ersten', async () => {
    render(EventTypeMenu, {
      props: {
        groups: [[{ tag: 'CHR', label: 'Taufe' }], [{ tag: 'EVEN', label: 'Ereignis' }]],
        onSelect: vi.fn(),
      },
    });

    await fireEvent.click(screen.getByText('+ Ereignis'));

    // Bewusst `document` statt des Render-`container`: das Panel hängt seit BL-85 per
    // Portal am <body>, nicht mehr im Teilbaum der Komponente. Genau das IST der Fix —
    // eine Abfrage über den Container würde hier die Abwesenheit des Klipp-Vorfahren
    // als Fehler melden.
    expect(document.querySelectorAll('.stb-event-menu__divider')).toHaveLength(1);
  });

  it('eigener triggerLabel wird übernommen', () => {
    render(EventTypeMenu, { props: { triggerLabel: '+ Sonstiges', groups: [[]], onSelect: vi.fn() } });

    expect(screen.getByText('+ Sonstiges')).toBeTruthy();
  });

  it('Klick auf den Backdrop schließt das Panel wieder', async () => {
    render(EventTypeMenu, { props: { groups: [[{ tag: 'EVEN', label: 'Ereignis' }]], onSelect: vi.fn() } });

    await fireEvent.click(screen.getByText('+ Ereignis'));
    expect(screen.getByRole('group', { name: '+ Ereignis' })).toBeTruthy();

    await fireEvent.click(screen.getByLabelText('Menü schließen'));
    expect(screen.queryByRole('group', { name: '+ Ereignis' })).toBeNull();
  });
});

describe('EventTypeMenu — "andere Typ"-Fallback (otherItems)', () => {
  it('rendert kein Fallback, wenn otherItems weggelassen wird', async () => {
    render(EventTypeMenu, { props: { groups: [[{ tag: 'EVEN', label: 'Ereignis' }]], onSelect: vi.fn() } });

    await fireEvent.click(screen.getByText('+ Ereignis'));
    expect(screen.queryByLabelText('Anderer Ereignistyp')).toBeNull();
  });

  it('"Hinzufügen" ruft onSelect mit dem im <select> gewählten Tag auf (value/onchange, kein bind:value)', async () => {
    const onSelect = vi.fn();
    render(EventTypeMenu, {
      props: {
        groups: [[]],
        otherItems: [
          { tag: 'MILI', label: 'Militärdienst' },
          { tag: 'CENS', label: 'Volkszählung' },
        ],
        onSelect,
      },
    });

    await fireEvent.click(screen.getByText('+ Ereignis'));
    const select = screen.getByLabelText('Anderer Ereignistyp') as HTMLSelectElement;
    await fireEvent.change(select, { target: { value: 'CENS' } });
    await fireEvent.click(screen.getByText('Hinzufügen'));

    expect(onSelect).toHaveBeenCalledWith('CENS');
  });
});
