// @vitest-environment happy-dom
// tests/ui/DetailHeader.component.test.ts — DIE EINE Kopfzeile für Entitäten-Detail-
// ansichten (Spec 21 §6b, INV-UI-4). Konsolidiert die vormals getrennten Zeilen
// (EntityTab's `.entity-tab__detail-header` mit "← Zur Liste" + der jeweiligen Detail-
// Komponente eigener `__hero`/`__head`-Zeile mit Titel+Aktionen) zu EINER Kopfzeile:
// Zeile 1 = "Zur Liste" + Aktionen (flex-wrap, INV-UI-5), Zeile 2 = Titel.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import DetailHeader from '../../ui/shell/DetailHeader.svelte';
import DetailHeaderActionsHarness from './fixtures/DetailHeaderActionsHarness.svelte';

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
