// @vitest-environment happy-dom
// tests/ui/CommandPalette.component.test.ts — Befehlspalette als Overlay (Spec 21 §3,
// §6i/§6k, BL-93).
//
// Das Modell (Inhalt, Reihenfolge, Auswahl-Arithmetik) ist nebenan geprüft. Hier geht es
// um genau das, was ein Modelltest NICHT sieht und was bei Overlays im Projekt schon
// zweimal schiefging: das Verlassen des Vorfahren-Teilbaums (INV-UI-13, ADR-v9-99), das
// Aufräumen danach, und die Tastaturbedienung ohne Falle (LP-8).
//
// Abfragen laufen über `screen`/`document`, nicht über den Render-Container: dass der
// Container die Palette NICHT enthält, ist hier der Nachweis, nicht der Fehler.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import CommandPalette from '../../ui/shell/CommandPalette.svelte';
import { makeDatabase, makePerson } from '../../core/model';
import type { PlaceContext } from '../../core/places';

const ctx: PlaceContext = { places: new Map(), hofs: new Map() } as unknown as PlaceContext;

function db() {
  const d = makeDatabase();
  d.individuals.set('@I1@', makePerson('@I1@', { given: 'Otto', surname: 'Bauer' }));
  d.individuals.set('@I2@', makePerson('@I2@', { given: 'Anna', surname: 'Bauer' }));
  return d;
}

function open(overrides: Partial<{ onClose: () => void; onRun: (c: unknown) => void }> = {}) {
  const onClose = overrides.onClose ?? vi.fn();
  const onRun = overrides.onRun ?? vi.fn();
  const result = render(CommandPalette, { props: { db: db(), ctx, onClose, onRun } });
  return { ...result, onClose, onRun };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('CommandPalette — Overlay-Pflichten (INV-UI-13)', () => {
  it('hängt sich an den <body> statt in den Teilbaum des Aufrufers', () => {
    const { container } = open();

    // Im Render-Container ist nichts — das IST der Nachweis (Spec 21 §6k).
    expect(container.querySelector('.cmdp')).toBeNull();
    expect(document.body.querySelector('.cmdp')).toBeTruthy();
    expect(document.body.querySelector('.cmdp__backdrop')).toBeTruthy();
  });

  it('räumt Panel UND Backdrop beim Zerstören weg', () => {
    const { unmount } = open();
    expect(document.querySelectorAll('.cmdp, .cmdp__backdrop').length).toBe(2);

    unmount();

    // Ein zurückbleibender Backdrop wäre unsichtbar und würde trotzdem jeden Klick
    // schlucken — der teuerste Fehler dieses Mechanismus (Spec 21 §6k).
    expect(document.querySelectorAll('.cmdp, .cmdp__backdrop').length).toBe(0);
  });

  it('schließt bei Klick auf den Backdrop', async () => {
    const { onClose } = open();
    await fireEvent.click(document.querySelector('.cmdp__backdrop') as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it('ist als Dialog ausgezeichnet und trägt einen zugänglichen Namen (LP-8)', () => {
    open();
    expect(screen.getByRole('dialog', { name: 'Befehlspalette' })).toBeTruthy();
  });
});

describe('CommandPalette — Tastaturführung', () => {
  it('setzt den Fokus ins Eingabefeld', async () => {
    open();
    const input = screen.getByRole('textbox', { name: /Befehl oder Suchbegriff/ });
    await vi.waitFor(() => expect(document.activeElement).toBe(input));
  });

  it('markiert anfangs den ersten Befehl', () => {
    open();
    const items = screen.getAllByRole('button');
    expect(items[0].getAttribute('aria-current')).toBe('true');
  });

  it('bewegt die Auswahl mit den Pfeiltasten', async () => {
    open();
    const input = screen.getByRole('textbox', { name: /Befehl oder Suchbegriff/ });

    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    let items = screen.getAllByRole('button');
    expect(items[1].getAttribute('aria-current')).toBe('true');
    expect(items[0].getAttribute('aria-current')).toBeNull();

    await fireEvent.keyDown(input, { key: 'ArrowUp' });
    items = screen.getAllByRole('button');
    expect(items[0].getAttribute('aria-current')).toBe('true');
  });

  it('führt den markierten Befehl mit Enter aus und schließt danach', async () => {
    const { onRun, onClose } = open();
    const input = screen.getByRole('textbox', { name: /Befehl oder Suchbegriff/ });

    await fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRun).toHaveBeenCalledTimes(1);
    expect((onRun as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ kind: 'nav' });
    expect(onClose).toHaveBeenCalled();
  });

  it('führt einen Entitäts-Treffer aus, wenn danach gesucht wurde', async () => {
    const { onRun } = open();
    const input = screen.getByRole('textbox', { name: /Befehl oder Suchbegriff/ });

    await fireEvent.input(input, { target: { value: 'bauer' } });
    const treffer = screen.getByRole('button', { name: /Otto Bauer/ });
    await fireEvent.click(treffer);

    expect((onRun as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({
      kind: 'person',
      id: '@I1@',
    });
  });

  it('lässt die Auswahl nicht hinter einer schrumpfenden Liste zurückbleiben', async () => {
    // Weitertippen verkürzt die Liste; ein Index von vorher zeigte sonst ins Leere oder
    // auf einen ganz anderen Befehl als den markierten.
    open();
    const input = screen.getByRole('textbox', { name: /Befehl oder Suchbegriff/ });

    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    await fireEvent.input(input, { target: { value: 'orte' } });

    const items = screen.getAllByRole('button');
    expect(items.length).toBe(1);
    expect(items[0].getAttribute('aria-current')).toBe('true');
  });

  it('zeigt einen Leerzustand statt einer leeren Fläche', async () => {
    open();
    const input = screen.getByRole('textbox', { name: /Befehl oder Suchbegriff/ });
    await fireEvent.input(input, { target: { value: 'zzzznichts' } });

    expect(screen.getByText('Keine Treffer.')).toBeTruthy();
  });
});
