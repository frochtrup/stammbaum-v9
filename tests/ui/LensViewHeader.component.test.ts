// @vitest-environment happy-dom
// tests/ui/LensViewHeader.component.test.ts — die EINE Kopfzeile für jede Lens-
// Ansicht (Spec 21 §4, INV-UI-3). Konsolidiert die vormals pro View duplizierten
// `__topbar`-Zeilen (Baum/Karte hatten je einen eigenen Titel-Text ÜBER dem
// Lens-Umschalter — redundant, weil der Umschalter die aktive Lens bereits über
// das hervorgehobene Tab zeigt). Diese Komponente ist jetzt die einzige Quelle für
// Höhe/Padding/Ausrichtung der Lens-Kopfzeile.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import LensViewHeader from '../../ui/shell/LensViewHeader.svelte';
import { pinLayout } from './layout-harness';
import { layout } from '../../ui/shell/layout.svelte';

// Formfaktor explizit auf MOBIL: diese Datei prüft den Lens-Umschalter bzw. das
// Hub-Menü — beides ist laut Spec 21 §4/§2 das mobile Gegenstück zur Sidebar und
// entfällt oberhalb der Layout-Grenze (INV-UI-2/3). Ohne Festlegung liefe die Datei im
// happy-dom-Standard von 1024px, also im Desktop-Modell. S. layout-harness.ts.
let unpin: () => void;
beforeEach(() => {
  unpin = pinLayout(false);
});
afterEach(() => {
  unpin();
  layout.reset();
});

describe('LensViewHeader — die eine Kopfzeile für Lens-Ansichten (Spec 21 §4, INV-UI-3)', () => {
  it('rendert NUR den Lens-Umschalter, keinen separaten Titel-Text', () => {
    const { container } = render(LensViewHeader, { props: { active: 'tree', onNavigate: vi.fn() } });

    expect(container.querySelector('.lens-switcher')).toBeTruthy();
    // Es darf keinen zusätzlichen reinen Titel-Text-Knoten geben (der Befund: die
    // alte `__topbar`-Zeile duplizierte, was das aktive Tab bereits zeigt) — "Baum"
    // darf NUR EINMAL vorkommen (als Umschalter-Tab-Label), nicht ein zweites Mal
    // als separater Titel darüber.
    expect(container.querySelector('.lens-view-header__title')).toBeNull();
    expect(screen.getAllByText(/Baum/)).toHaveLength(1);
  });

  it('markiert die aktive Lens über den eingebetteten Umschalter (aria-current)', () => {
    render(LensViewHeader, { props: { active: 'map', onNavigate: vi.fn() } });

    const mapTab = screen.getByRole('tab', { name: /Karte/ });
    expect(mapTab.getAttribute('aria-current')).toBe('page');
  });

  it('Klick auf eine andere implementierte Lens ruft onNavigate mit deren id auf', async () => {
    const onNavigate = vi.fn();
    render(LensViewHeader, { props: { active: 'tree', onNavigate } });

    await fireEvent.click(screen.getByRole('tab', { name: /Karte/ }));

    expect(onNavigate).toHaveBeenCalledWith('map');
  });

  it('trägt KEINEN Aktions-Bereich mehr — die Reihe gehört dem Umschalter allein (BL-95)', () => {
    // Der Aktions-Bereich war der Vektor des Defekts, nicht sein Opfer: der einzige
    // jemals dort platzierte Knopf (Baum-Vollbild) nahm der Reihe 79 px und schob „Story"
    // bei 375 px vollständig aus dem Bild. Er sitzt jetzt in der Baum-Insel, wo er auch
    // im Vollbild erreichbar bleibt. Eine künftige Lens-Aktion gehört ebenfalls dorthin
    // oder in eine eigene Zeile — nicht wieder neben die Segmente.
    const { container } = render(LensViewHeader, { props: { active: 'tree', onNavigate: vi.fn() } });

    expect(container.querySelector('.lens-view-header__actions')).toBeNull();
  });
});

describe('LensViewHeader — auf Desktop trägt die Sidebar die Lenses (Spec 21 §4)', () => {
  it('blendet den Umschalter oberhalb der Layout-Grenze aus', () => {
    unpin();
    const unpinDesktop = pinLayout(true);
    try {
      render(LensViewHeader, { props: { active: 'tree', onNavigate: vi.fn() } });
      // Spec 21 §4 nennt beide Formen als Entweder-Oder ("Segment-Control (Mobile) bzw.
      // Sidebar-Abschnitt Ansichten (Desktop)"): zwei gleichzeitige Umschalter wären
      // ein zweiter Mechanismus für denselben Wechsel (INV-UI-3).
      expect(screen.queryByRole('button', { name: /Karte/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /Baum/ })).toBeNull();
    } finally {
      unpinDesktop();
    }
  });

});
