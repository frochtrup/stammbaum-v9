// @vitest-environment happy-dom
// tests/ui/DetailHeader.component.test.ts — DIE EINE Kopfzeile für Entitäten-Detail-
// ansichten (Spec 21 §6b, INV-UI-4). Konsolidiert die vormals getrennten Zeilen
// (EntityTab's `.entity-tab__detail-header` mit "← Zur Liste" + der jeweiligen Detail-
// Komponente eigener `__hero`/`__head`-Zeile mit Titel+Aktionen) zu EINER Kopfzeile:
// Zeile 1 = "Zur Liste" + Aktionen (flex-wrap, INV-UI-5), Zeile 2 = Titel.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import DetailHeader from '../../ui/shell/DetailHeader.svelte';
import DetailHeaderActionsHarness from './fixtures/DetailHeaderActionsHarness.svelte';
import { pinLayout } from './layout-harness';
import { layout } from '../../ui/shell/layout.svelte';

// Formfaktor explizit auf MOBIL: „← Zur Liste" ist eine mobile Navigation und entfällt
// im Desktop-Multi-Pane, wo die Liste daneben stehen bleibt (Spec 21 §3, BL-92). Ohne
// Festlegung liefe die Datei im happy-dom-Standard von 1024px. S. layout-harness.ts.
let unpin: () => void;
beforeEach(() => {
  unpin = pinLayout(false);
});
afterEach(() => {
  unpin();
  layout.reset();
});

describe('DetailHeader — eine gemeinsame Kopfzeile (Spec 21 §6b, INV-UI-4)', () => {
  it('rendert "← Zur Liste" und den Titel in derselben Komponente, Titel in eigener Zeile darunter', () => {
    const { container } = render(DetailHeader, { props: { title: 'Anna Bauer', onBack: vi.fn() } });

    const row = container.querySelector('.detail-header__row');
    const title = container.querySelector('.detail-header__title');
    expect(row).toBeTruthy();
    expect(title?.textContent).toBe('Anna Bauer');
    // Titel-Zeile ist NICHT Teil der Navigations-/Aktionen-Zeile (eigene Zeile darunter).
    expect(row?.contains(title)).toBe(false);
  });

  it('Klick auf "← Zur Liste" ruft onBack auf', async () => {
    const onBack = vi.fn();
    render(DetailHeader, { props: { title: 'Anna Bauer', onBack } });

    await fireEvent.click(screen.getByText('← Zur Liste'));

    expect(onBack).toHaveBeenCalledOnce();
  });

  it('ohne actions-Snippet gibt es keinen Aktionen-Bereich im DOM', () => {
    const { container } = render(DetailHeader, { props: { title: 'Anna Bauer', onBack: vi.fn() } });

    expect(container.querySelector('.detail-header__actions')).toBeNull();
  });

  it('mit actions-Snippet stehen "Zur Liste" UND die Aktionen in EINER gemeinsamen Zeile (INV-UI-5)', () => {
    const { container } = render(DetailHeaderActionsHarness, {
      props: { title: 'Anna Bauer', onBack: vi.fn() },
    });

    const row = container.querySelector('.detail-header__row');
    const back = screen.getByText('← Zur Liste');
    const editBtn = screen.getByText('✎ Bearbeiten');
    const treeBtn = screen.getByText('⧖ Im Baum anzeigen');

    expect(row?.contains(back)).toBe(true);
    expect(row?.contains(editBtn)).toBe(true);
    expect(row?.contains(treeBtn)).toBe(true);
  });
});

describe('DetailHeader — compact-Modus (Spec 21 §10e)', () => {
  it('rendert den Titel klein IN der Kopfzeile statt als eigene große zweite Zeile', () => {
    const { container } = render(DetailHeader, { props: { title: 'Otto Bauer ⚭ Anna Klein', onBack: vi.fn(), compact: true } });

    expect(container.querySelector('.detail-header__title')).toBeNull();
    const row = container.querySelector('.detail-header__row');
    const compactTitle = container.querySelector('.detail-header__compact-title');
    expect(compactTitle?.textContent).toBe('Otto Bauer ⚭ Anna Klein');
    expect(row?.contains(compactTitle)).toBe(true);
  });

  it('ohne compact bleibt das bisherige Verhalten (große Titelzeile, kein compact-title)', () => {
    const { container } = render(DetailHeader, { props: { title: 'Anna Bauer', onBack: vi.fn() } });

    expect(container.querySelector('.detail-header__compact-title')).toBeNull();
    expect(container.querySelector('.detail-header__title')?.textContent).toBe('Anna Bauer');
  });
});
