// @vitest-environment happy-dom
// tests/ui/EventsByType.component.test.ts — DIE EINE gruppierte/paginierte/
// einklappbare Listen-Darstellung (Spec 21 §10b, ADR-v9-78 Punkt 6, INV-UI-4).
// Deckt das Einklapp-/Paginierungs-Verhalten am generischen Renderer selbst ab (statt
// nur indirekt über einen einzelnen Konsumenten wie SourceDetail/PlaceDetail/HofList).
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import EventsByTypeHarness from './fixtures/EventsByTypeHarness.svelte';
import type { HarnessRow } from './fixtures/events-by-type-harness-types';
import type { EventGroup } from '../../ui/shell/event-grouping';

function group(type: string, count: number, offset = 0): EventGroup<HarnessRow> {
  return {
    type,
    rows: Array.from({ length: count }, (_, i) => ({ key: `${type}-${offset + i}`, label: `${type} ${offset + i}` })),
  };
}

describe('EventsByType — Grundverhalten (Gruppen-Header, Zeilen)', () => {
  it('rendert je Gruppe einen "Typ (N)"-Header und die Zeilen darunter, per Default aufgeklappt', () => {
    render(EventsByTypeHarness, { props: { groups: [group('RESI', 2)] } });

    expect(screen.getByText('RESI (2)')).toBeTruthy();
    expect(screen.getByText('RESI 0')).toBeTruthy();
    expect(screen.getByText('RESI 1')).toBeTruthy();
  });

  it('Gruppen-Header ist ein Button mit aria-expanded=true im Default-(aufgeklappt)-Zustand', () => {
    render(EventsByTypeHarness, { props: { groups: [group('RESI', 2)] } });

    const header = screen.getByText('RESI (2)');
    expect(header.tagName).toBe('BUTTON');
    expect(header.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('EventsByType — Auto-Einklappen ab >30 Zeilen (Spec 21 §10b, ADR-v9-78 Punkt 6a)', () => {
  it('eine Gruppe mit genau 30 Zeilen bleibt aufgeklappt (Grenzfall: >30, nicht >=30)', () => {
    render(EventsByTypeHarness, { props: { groups: [group('RESI', 30)] } });

    const header = screen.getByText('RESI (30)');
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('RESI 0')).toBeTruthy();
  });

  it('eine Gruppe mit 35 Zeilen startet automatisch eingeklappt — Header zeigt trotzdem die volle Anzahl (Statistik bleibt sichtbar)', () => {
    render(EventsByTypeHarness, { props: { groups: [group('RESI', 35)] } });

    const header = screen.getByText('RESI (35)');
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('RESI 0')).toBeNull();
  });

  it('Klick auf den Header einer automatisch eingeklappten Gruppe klappt sie auf (30 sichtbar + "5 weitere laden")', async () => {
    render(EventsByTypeHarness, { props: { groups: [group('RESI', 35)] } });

    const header = screen.getByText('RESI (35)');
    await fireEvent.click(header);

    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('RESI 0')).toBeTruthy();
    expect(screen.getByText('RESI 29')).toBeTruthy();
    expect(screen.queryByText('RESI 30')).toBeNull();
    const loadMore = screen.getByText('5 weitere laden');
    expect(loadMore).toBeTruthy();

    await fireEvent.click(loadMore);

    expect(screen.getByText('RESI 34')).toBeTruthy();
    expect(screen.queryByText(/weitere laden/)).toBeNull();
  });
});

describe('EventsByType — manuelles Ein-/Ausklappen überschreibt die Auto-Regel in beide Richtungen', () => {
  it('eine kleine Gruppe (<=30) kann manuell eingeklappt und wieder aufgeklappt werden', async () => {
    render(EventsByTypeHarness, { props: { groups: [group('RESI', 2)] } });

    const header = screen.getByText('RESI (2)');
    expect(header.getAttribute('aria-expanded')).toBe('true');

    await fireEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('RESI 0')).toBeNull();

    await fireEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('RESI 0')).toBeTruthy();
  });

  it('eine automatisch eingeklappte Gruppe (>30) kann manuell aufgeklappt bleiben, auch nach erneutem Klick auf eine ANDERE Gruppe', async () => {
    render(EventsByTypeHarness, { props: { groups: [group('RESI', 35), group('CENS', 2)] } });

    const resiHeader = screen.getByText('RESI (35)');
    const censHeader = screen.getByText('CENS (2)');
    await fireEvent.click(resiHeader);
    expect(resiHeader.getAttribute('aria-expanded')).toBe('true');

    await fireEvent.click(censHeader);
    expect(censHeader.getAttribute('aria-expanded')).toBe('false');
    // RESI bleibt vom CENS-Klick unberührt.
    expect(resiHeader.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('EventsByType — "Alle auf-/einklappen"-Toggle ab drei eingeklappten Gruppen (Spec 21 §10b, ADR-v9-78 Punkt 6b)', () => {
  it('erscheint NICHT, solange weniger als drei Gruppen eingeklappt sind', async () => {
    render(EventsByTypeHarness, {
      props: { groups: [group('A', 1), group('B', 1), group('C', 1), group('D', 1)] },
    });

    await fireEvent.click(screen.getByText('A (1)'));
    await fireEvent.click(screen.getByText('B (1)'));

    expect(screen.queryByText(/Alle (auf|ein)klappen/)).toBeNull();
  });

  it('erscheint ab drei eingeklappten Gruppen und klappt per Klick alle verbleibenden zu, danach alle wieder auf', async () => {
    render(EventsByTypeHarness, {
      props: { groups: [group('A', 1), group('B', 1), group('C', 1), group('D', 1)] },
    });

    const headerA = screen.getByText('A (1)');
    const headerB = screen.getByText('B (1)');
    const headerC = screen.getByText('C (1)');
    const headerD = screen.getByText('D (1)');

    await fireEvent.click(headerA);
    await fireEvent.click(headerB);
    await fireEvent.click(headerC);
    // D bleibt aufgeklappt — Toggle muss "Alle einklappen" anbieten (nicht "aufklappen").
    const toggle = screen.getByText('Alle einklappen');
    expect(toggle).toBeTruthy();

    await fireEvent.click(toggle);
    expect(headerD.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('Alle aufklappen')).toBeTruthy();

    await fireEvent.click(screen.getByText('Alle aufklappen'));
    expect(headerA.getAttribute('aria-expanded')).toBe('true');
    expect(headerB.getAttribute('aria-expanded')).toBe('true');
    expect(headerC.getAttribute('aria-expanded')).toBe('true');
    expect(headerD.getAttribute('aria-expanded')).toBe('true');
    // Wieder unter drei eingeklappt (0) — Toggle verschwindet.
    expect(screen.queryByText(/Alle (auf|ein)klappen/)).toBeNull();
  });
});

describe('EventsByType — resetKey verhindert hängende Zähler/Klapp-Zustände nach Gegenstandswechsel', () => {
  it('Paginierungs- UND Einklapp-Zustand starten frisch, sobald resetKey wechselt (z. B. anderer Ort/andere Quelle)', async () => {
    const { rerender } = render(EventsByTypeHarness, {
      props: { groups: [group('RESI', 35)], resetKey: 'subject-A' },
    });

    // Gegenstand A: Gruppe aufklappen + "weitere laden" auf 35 Zeilen ziehen.
    await fireEvent.click(screen.getByText('RESI (35)'));
    await fireEvent.click(screen.getByText('5 weitere laden'));
    expect(screen.getByText('RESI 34')).toBeTruthy();

    // Wechsel zu Gegenstand B: gleicher Gruppen-Typ, aber "frisch" — kein hängender
    // Aufklapp-/Seitenzustand vom vorherigen Gegenstand.
    await rerender({ groups: [group('RESI', 35)], resetKey: 'subject-B' });

    const header = screen.getByText('RESI (35)');
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('RESI 0')).toBeNull();
  });
});

describe('EventsByType — Barrierefreiheit (aria-controls verweist auf ein tatsächlich existierendes Element)', () => {
  it('aria-controls des Headers referenziert die id der zugehörigen Zeilen-Liste', () => {
    const { container } = render(EventsByTypeHarness, { props: { groups: [group('RESI', 2)] } });

    const header = screen.getByText('RESI (2)');
    const controlsId = header.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();
    const controlled = container.querySelector(`#${CSS.escape(controlsId!)}`);
    expect(controlled).toBeTruthy();
    expect(within(controlled as HTMLElement).getByText('RESI 0')).toBeTruthy();
  });
});
