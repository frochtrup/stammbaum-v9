// @vitest-environment happy-dom
// tests/ui/overlay-portal.test.ts — der Portal-Mechanismus für Overlays (BL-85,
// Spec 21 §6).
//
// Zwei Ebenen, bewusst getrennt:
//  1. `anchorPosition` — reine Rechnung, vollständig prüfbar (happy-dom hat keine
//     Layout-Engine; „liegt A über B?" ist dort prinzipiell nicht beantwortbar, s.
//     overlay-z-index.test.ts).
//  2. Die Actions — prüfbar ist, WO der Knoten hängt. Genau das ist der Fix: nicht mehr
//     im klippenden/stapelnden Vorfahren. Dass daraus im echten Browser auch
//     Klickbarkeit folgt, wurde per `elementFromPoint` verifiziert (ADR-v9-99), nicht
//     hier behauptet.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { anchorPosition } from '../../ui/shell/anchor-position';
import { portal, anchoredTo } from '../../ui/shell/portal';
import EventTypeMenu from '../../ui/shell/EventTypeMenu.svelte';
import Picker from '../../ui/shell/Picker.svelte';
import EventEditModal from '../../ui/shell/EventEditModal.svelte';
import ValConfigSheet from '../../ui/views/validation/ValConfigSheet.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makeEvent } from '../../core/model';
import { defaultConfig } from '../../core/validate/index';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const VIEWPORT = { width: 375, height: 812 };

/** Trigger-Box mit sinnvollen Defaults — die Tests setzen nur, worum es ihnen geht. */
function trigger(patch: Partial<{ top: number; left: number; width: number; height: number }> = {}) {
  return { top: 100, left: 20, width: 90, height: 30, ...patch };
}

describe('anchorPosition — Platzierung', () => {
  it('setzt das Overlay standardmäßig unter den Trigger', () => {
    const r = anchorPosition({
      trigger: trigger(),
      panel: { width: 200, height: 150 },
      viewport: VIEWPORT,
      gap: 4,
    });
    expect(r.placement).toBe('below');
    expect(r.top).toBe(134); // 100 + 30 + 4
    expect(r.left).toBe(20);
  });

  it('klappt nach oben, wenn unten zu wenig Platz ist und oben mehr', () => {
    // Trigger weit unten: unter ihm bleiben 62px, über ihm 700.
    const r = anchorPosition({
      trigger: trigger({ top: 712 }),
      panel: { width: 200, height: 300 },
      viewport: VIEWPORT,
      gap: 4,
    });
    expect(r.placement).toBe('above');
    expect(r.top).toBe(408); // 712 - 4 - 300
  });

  it('bleibt unten, wenn unten zwar knapp, aber immer noch mehr Platz ist als oben', () => {
    // Der Regressionsfall zur Regel darüber: ein Overlay, das nach oben klappt, obwohl
    // unten mehr Platz war, wirkt wie ein Fehler.
    const r = anchorPosition({
      trigger: trigger({ top: 40 }),
      panel: { width: 200, height: 900 },
      viewport: VIEWPORT,
      gap: 4,
    });
    expect(r.placement).toBe('below');
  });

  it('begrenzt nach unten, statt aus dem Viewport zu laufen', () => {
    const r = anchorPosition({
      trigger: trigger({ top: 600 }),
      panel: { width: 200, height: 100 },
      viewport: VIEWPORT,
      gap: 4,
      margin: 8,
    });
    expect(r.top + 100).toBeLessThanOrEqual(VIEWPORT.height - 8);
  });

  it('lässt bei einem Overlay höher als der Viewport den oberen Rand gewinnen', () => {
    // Der Kopf einer Liste ist wichtiger als ihr Ende — scrollen kann sie selbst.
    const r = anchorPosition({
      trigger: trigger({ top: 400 }),
      panel: { width: 200, height: 2000 },
      viewport: VIEWPORT,
      margin: 8,
    });
    expect(r.top).toBe(8);
  });

  it('zieht ein rechts überstehendes Overlay an den rechten Rand', () => {
    const r = anchorPosition({
      trigger: trigger({ left: 300 }),
      panel: { width: 200, height: 100 },
      viewport: VIEWPORT,
      margin: 8,
    });
    expect(r.left).toBe(167); // 375 - 8 - 200
    expect(r.left + 200).toBeLessThanOrEqual(VIEWPORT.width - 8);
  });

  it('erzwingt den linken Mindestabstand, wenn das Overlay breiter ist als der Viewport', () => {
    const r = anchorPosition({
      trigger: trigger({ left: 0 }),
      panel: { width: 1000, height: 100 },
      viewport: VIEWPORT,
      margin: 8,
    });
    expect(r.left).toBe(8);
  });
});

describe('portal — der eigentliche Fix (BL-85)', () => {
  let klipper: HTMLElement;
  let overlay: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    // Der reale Vorfahre, an dem es scheiterte: `.person-detail`, `overflow: auto`.
    klipper = document.createElement('div');
    klipper.style.overflow = 'auto';
    overlay = document.createElement('div');
    klipper.appendChild(overlay);
    document.body.appendChild(klipper);
  });

  it('hängt das Overlay aus dem klippenden Vorfahren an den <body>', () => {
    expect(overlay.parentElement).toBe(klipper);
    portal(overlay);
    expect(overlay.parentElement).toBe(document.body);
    expect(klipper.contains(overlay)).toBe(false);
  });

  it('räumt das Overlay beim Zerstören weg — sonst sammeln sich klickfangende Backdrops', () => {
    // Svelte entfernt beim Unmount nur, was es selbst im Baum hält; ein umgehängter
    // Knoten bliebe ohne diese Zeile für immer über dem Dokument liegen.
    const handle = portal(overlay);
    handle.destroy();
    expect(document.body.contains(overlay)).toBe(false);
  });

  it('anchoredTo portaliert ebenfalls und schreibt die Position als CSS-Variablen', () => {
    const t = document.createElement('button');
    t.textContent = 'Bezug'; // zugänglicher Name — sonst schlägt der a11y-Scanner an (BL-66)
    document.body.appendChild(t);
    const handle = anchoredTo(overlay, t);
    expect(overlay.parentElement).toBe(document.body);
    expect(overlay.style.getPropertyValue('--stb-anchor-top')).toMatch(/px$/);
    expect(overlay.style.getPropertyValue('--stb-anchor-left')).toMatch(/px$/);
    expect(overlay.dataset.placement).toMatch(/^(above|below)$/);
    handle.destroy();
  });

  it('anchoredTo hängt seine Fenster-Listener beim Zerstören wieder ab', () => {
    // Ein zurückgebliebener Scroll-Listener misst einen längst entfernten Knoten neu —
    // bei einem Menü, das oft auf- und zugeht, summiert sich das still.
    const t = document.createElement('button');
    t.textContent = 'Bezug'; // zugänglicher Name — sonst schlägt der a11y-Scanner an (BL-66)
    document.body.appendChild(t);
    const original = window.addEventListener.bind(window);
    let zugefuegt = 0;
    let entfernt = 0;
    window.addEventListener = ((...args: Parameters<typeof original>) => {
      zugefuegt++;
      return original(...args);
    }) as typeof window.addEventListener;
    const originalRemove = window.removeEventListener.bind(window);
    window.removeEventListener = ((...args: Parameters<typeof originalRemove>) => {
      entfernt++;
      return originalRemove(...args);
    }) as typeof window.removeEventListener;

    const handle = anchoredTo(overlay, t);
    handle.destroy();

    window.addEventListener = original as typeof window.addEventListener;
    window.removeEventListener = originalRemove as typeof window.removeEventListener;
    expect(zugefuegt).toBeGreaterThan(0);
    expect(entfernt).toBe(zugefuegt);
  });

  it('überlebt einen fehlenden Trigger, statt beim Öffnen zu werfen', () => {
    const handle = anchoredTo(overlay, undefined);
    expect(overlay.parentElement).toBe(document.body);
    handle.destroy();
  });
});

describe('die Komponenten nutzen den Mechanismus auch wirklich', () => {
  // Ohne diesen Block wäre der Schutz nur indirekt: `portal`/`anchoredTo` könnten
  // tadellos funktionieren und trotzdem von niemandem verwendet werden. Genau so
  // verschwindet ein Fix wieder — nicht durch einen Fehler in der Primitive, sondern
  // dadurch, dass jemand die eine Zeile am Aufrufer entfernt.

  it('EventTypeMenu hängt Panel UND Backdrop an den <body>', async () => {
    const { container } = render(EventTypeMenu, {
      props: { groups: [[{ tag: 'CHR', label: 'Taufe' }]], onSelect: vi.fn() },
    });
    await fireEvent.click(screen.getByText('+ Ereignis'));

    const panel = document.querySelector('.stb-event-menu__panel');
    const backdrop = document.querySelector('.stb-event-menu__backdrop');
    expect(panel?.parentElement).toBe(document.body);
    expect(backdrop?.parentElement).toBe(document.body);
    // Der Klipp-Vorfahre (`.person-detail`, `overflow: auto`) ist im echten Baum genau
    // dieser Teilbaum — nichts vom Overlay darf mehr darin liegen.
    expect(container.querySelector('.stb-event-menu__panel')).toBeNull();
  });

  it('EventTypeMenu räumt beide Knoten beim Schließen wieder ab', async () => {
    render(EventTypeMenu, {
      props: { groups: [[{ tag: 'CHR', label: 'Taufe' }]], onSelect: vi.fn() },
    });
    await fireEvent.click(screen.getByText('+ Ereignis'));
    await fireEvent.click(screen.getByLabelText('Menü schließen'));

    expect(document.querySelector('.stb-event-menu__panel')).toBeNull();
    expect(document.querySelector('.stb-event-menu__backdrop')).toBeNull();
  });

  it('Picker hängt seine Trefferliste an den <body>', async () => {
    // Der zweite reale Klipp-Fall (BL-110): JEDER Picker sitzt in einem Scroll-Container.
    // Gemessen an FamilyDetails "Kind hinzufügen": `.family-detail` (`overflow-y: auto`)
    // endete bei y=333, das Panel reichte bis 568 — die Liste war angeschnitten und die
    // Treffer unerreichbar.
    const { container } = render(Picker, {
      props: {
        items: [{ id: 'p1', name: 'Anna' }],
        getId: (x: { id: string }) => x.id,
        getLabel: (x: { name: string }) => x.name,
        matches: () => true,
        value: null,
        onChange: vi.fn(),
        label: 'Kind hinzufügen',
      },
    });
    await fireEvent.focus(screen.getByLabelText('Kind hinzufügen'));

    const panel = document.querySelector('.stb-picker__panel');
    expect(panel?.parentElement).toBe(document.body);
    expect(container.querySelector('.stb-picker__panel')).toBeNull();
  });

  it('Picker räumt die Trefferliste beim Schließen wieder ab', async () => {
    render(Picker, {
      props: {
        items: [{ id: 'p1', name: 'Anna' }],
        getId: (x: { id: string }) => x.id,
        getLabel: (x: { name: string }) => x.name,
        matches: () => true,
        value: null,
        onChange: vi.fn(),
        label: 'Kind hinzufügen',
      },
    });
    const feld = screen.getByLabelText('Kind hinzufügen');
    await fireEvent.focus(feld);
    await fireEvent.keyDown(feld, { key: 'Escape' });

    expect(document.querySelector('.stb-picker__panel')).toBeNull();
  });

  it('Picker bleibt offen, wenn der Fokus vom Feld in die portalierte Liste wandert', async () => {
    // Die Kehrseite des Portals: `focusout` am Feld sieht als relatedTarget einen Knoten,
    // der KEIN Nachfahre der Komponentenwurzel mehr ist. Ohne die zweite Zugehörigkeits-
    // Hälfte (`panelEl.contains`) schlösse der eigene Mausklick die Liste, bevor der
    // `click` den Treffer erreicht — der Picker wäre wieder nicht bedienbar, nur aus einem
    // anderen Grund.
    const onChange = vi.fn();
    render(Picker, {
      props: {
        items: [{ id: 'p1', name: 'Anna' }],
        getId: (x: { id: string }) => x.id,
        getLabel: (x: { name: string }) => x.name,
        matches: () => true,
        value: null,
        onChange,
        label: 'Kind hinzufügen',
      },
    });
    const feld = screen.getByLabelText('Kind hinzufügen');
    await fireEvent.focus(feld);
    const treffer = screen.getByText('Anna');

    await fireEvent.focusOut(feld, { relatedTarget: treffer });
    expect(document.querySelector('.stb-picker__panel')).not.toBeNull();

    await fireEvent.click(treffer);
    expect(onChange).toHaveBeenCalledWith('p1');
  });
});

describe('BL-278 — die Modal-Backdrops verlassen ihren Teilbaum (INV-UI-13)', () => {
  // WARUM ALS GERECHNETE POPULATION, nicht als Namensliste: die vier Konsumenten waren
  // bis BL-278 die einzige Gruppe, die §6k namentlich nennt und die den Mechanismus
  // trotzdem nicht benutzte — und sie ist genau deshalb entstanden, weil ein fünfter
  // Backdrop einfach dazugeschrieben werden kann. Eine Namensliste hätte den fünften
  // nicht gesehen; `.stb-modal-backdrop` im Markup ist das Merkmal, an dem er hängt.
  const UI_DIR = resolve(process.cwd(), 'ui');

  function svelteFiles(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) out.push(...svelteFiles(p));
      else if (name.endsWith('.svelte')) out.push(p);
    }
    return out;
  }

  /** Jede Datei, die einen Modal-Backdrop RENDERT (Kommentare zählen nicht mit). */
  function backdropKonsumenten(): { pfad: string; zeile: string }[] {
    const out: { pfad: string; zeile: string }[] = [];
    for (const pfad of svelteFiles(UI_DIR)) {
      const src = readFileSync(pfad, 'utf8')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      for (const zeile of src.split('\n')) {
        if (/<div[^>]*class="stb-modal-backdrop"/.test(zeile)) out.push({ pfad, zeile });
      }
    }
    return out;
  }

  it('es gibt überhaupt Backdrops zu prüfen', () => {
    expect(backdropKonsumenten().length).toBeGreaterThanOrEqual(4);
  });

  it('jeder Backdrop trägt `use:portal`', () => {
    const verstoesse = backdropKonsumenten()
      .filter(({ zeile }) => !/use:portal/.test(zeile))
      .map(({ pfad }) => pfad.replace(UI_DIR, 'ui'));
    expect(
      verstoesse,
      'Backdrop ohne Portal — §6k nennt Modal-Backdrops namentlich unter „Wer portaliert"',
    ).toEqual([]);
  });

  // Und die Wirkung, an zwei der vier durchgespielt: einer aus `ui/shell` (tief in der
  // Detailfläche gerendert), einer aus `ui/views` (eigene Fläche).
  it('EventEditModal hängt seinen Backdrop an den <body> und räumt ihn wieder ab', async () => {
    const appState = createAppState();
    appState.loadDatabase(makeDatabase(), 'test.ged');
    const { container, unmount } = render(EventEditModal, {
      props: {
        appState,
        event: makeEvent('BIRT'),
        label: 'Geburt',
        onSave: vi.fn(),
        onClose: vi.fn(),
      },
    });

    const backdrop = document.querySelector('.stb-modal-backdrop');
    expect(backdrop?.parentElement).toBe(document.body);
    expect(container.querySelector('.stb-modal-backdrop')).toBeNull();

    unmount();
    expect(document.querySelector('.stb-modal-backdrop')).toBeNull();
  });

  it('ValConfigSheet ebenso — ein liegengebliebener Backdrop fängt jeden Klick', async () => {
    const { container, unmount } = render(ValConfigSheet, {
      props: { config: defaultConfig(), onSave: vi.fn(), onClose: vi.fn() },
    });

    expect(document.querySelector('.stb-modal-backdrop')?.parentElement).toBe(document.body);
    expect(container.querySelector('.stb-modal-backdrop')).toBeNull();

    unmount();
    expect(document.querySelector('.stb-modal-backdrop')).toBeNull();
  });
});
