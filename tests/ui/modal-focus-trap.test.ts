// @vitest-environment happy-dom
// tests/ui/modal-focus-trap.test.ts — der Tastaturfokus bleibt im offenen Dialog
// (LP-8, [21 §6i], [32 TST-15]).
//
// WAS GEHALTEN WIRD: `aria-modal="true"` ist eine Zusage — außerhalb ist gerade nichts
// erreichbar. Sie war an allen vier Modalen abgegeben und an keinem eingelöst: der Fokus
// blieb nach dem Öffnen auf dem Auslöser HINTER dem Backdrop (gemessen 2026-08-03: 15
// Tab-Stopps durch die verdeckte Seite bis ins Modal). Hier steht, dass der Ring
// existiert, dass er einen AUSGANG hat (Escape — ohne ihn wäre er der von WCAG 2.1.2
// verbotene Trap) und dass ihn jedes Modal benutzt.
//
// GRENZE: happy-dom bewegt den Fokus bei einem echten Tab-Tastendruck nicht selbst — es
// gibt keine native Tab-Reihenfolge. Geprüft wird deshalb die UMLENKUNG (der Handler
// fängt Tab an den Rändern ab und setzt den Fokus), nicht der Browser-Default dazwischen.
// Der Ring als Ganzes ist im Browser gegengeprüft, s. Commit.
import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import EventEditModal from '../../ui/shell/EventEditModal.svelte';
import ValConfigSheet from '../../ui/views/validation/ValConfigSheet.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makeEvent } from '../../core/model';
import { defaultConfig } from '../../core/validate/index';

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

/** Dieselbe gerechnete Population wie beim Portal (BL-278): jede Datei, die einen
 *  Modal-Backdrop RENDERT. Ein fünftes Modal ist damit automatisch mitgeprüft — eine
 *  Namensliste hätte genau das nicht getan. */
function backdropZeilen(): { pfad: string; zeile: string; src: string }[] {
  const out: { pfad: string; zeile: string; src: string }[] = [];
  for (const pfad of svelteFiles(UI_DIR)) {
    const src = readFileSync(pfad, 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const zeile of src.split('\n')) {
      if (/<div[^>]*class="stb-modal-backdrop"/.test(zeile)) out.push({ pfad, zeile, src });
    }
  }
  return out;
}

const kurz = (p: string) => p.replace(UI_DIR, 'ui');

describe('Modal-Fokus — der Ring und sein Ausgang (LP-8, §6i)', () => {
  it('es gibt überhaupt Modale zu prüfen', () => {
    expect(backdropZeilen().length).toBeGreaterThanOrEqual(4);
  });

  it('jedes Modal fängt den Fokus (`use:focusTrap`)', () => {
    const verstoesse = backdropZeilen()
      .filter(({ zeile }) => !/use:focusTrap/.test(zeile))
      .map(({ pfad }) => kurz(pfad));
    expect(
      verstoesse,
      'Modal ohne Fokus-Ring — `aria-modal` sagt zu, was der Code nicht hält',
    ).toEqual([]);
  });

  // Die Bedingung, unter der der Ring überhaupt zulässig ist (WCAG 2.1.2). Ohne diese
  // Prüfung baut die Zeile darüber irgendwann den verbotenen Trap.
  it('jedes Modal hat einen Escape-Ausgang — sonst wäre der Ring der Verstoß', () => {
    const verstoesse = backdropZeilen()
      .filter(({ src }) => !/['"]Escape['"]/.test(src))
      .map(({ pfad }) => kurz(pfad));
    expect(verstoesse, 'Fokus-Ring ohne Ausgang = Keyboard-Trap (WCAG 2.1.2)').toEqual([]);
  });
});

describe('Modal-Fokus — die Wirkung, an zwei Modalen durchgespielt', () => {
  function eventModal() {
    const appState = createAppState();
    appState.loadDatabase(makeDatabase(), 'test.ged');
    return render(EventEditModal, {
      props: {
        appState,
        event: makeEvent('BIRT'),
        label: 'Geburt',
        onSave: vi.fn(),
        onClose: vi.fn(),
      },
    });
  }

  it('der Fokus landet beim Öffnen im Dialog, nicht auf dem Auslöser dahinter', async () => {
    const ausloeser = document.createElement('button');
    document.body.appendChild(ausloeser);
    ausloeser.focus();
    expect(document.activeElement).toBe(ausloeser);

    eventModal();
    await Promise.resolve(); // die Action setzt den Fokus im Microtask (s. focus-trap.ts)

    expect(document.activeElement?.getAttribute('role')).toBe('dialog');
    ausloeser.remove();
  });

  it('Tab vom letzten Bedienelement springt zurück ans erste, statt hinauszulaufen', async () => {
    eventModal();
    await Promise.resolve();

    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const felder = Array.from(
      dialog.querySelectorAll<HTMLElement>('button, input, select, textarea'),
    ).filter((e) => !e.hasAttribute('disabled'));
    const erstes = felder[0];
    const letztes = felder[felder.length - 1];
    expect(felder.length).toBeGreaterThan(1);

    letztes.focus();
    await fireEvent.keyDown(letztes, { key: 'Tab' });
    expect(document.activeElement).toBe(erstes);
  });

  it('Shift+Tab vom ersten springt ans letzte', async () => {
    eventModal();
    await Promise.resolve();

    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const felder = Array.from(
      dialog.querySelectorAll<HTMLElement>('button, input, select, textarea'),
    ).filter((e) => !e.hasAttribute('disabled'));

    felder[0].focus();
    await fireEvent.keyDown(felder[0], { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(felder[felder.length - 1]);
  });

  it('Tab aus dem Dialog-Container heraus führt ins erste Feld, nicht nach draußen', async () => {
    eventModal();
    await Promise.resolve();

    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(document.activeElement).toBe(dialog);

    await fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('beim Schließen kehrt der Fokus zum Auslöser zurück', async () => {
    const ausloeser = document.createElement('button');
    document.body.appendChild(ausloeser);
    ausloeser.focus();

    const { unmount } = eventModal();
    await Promise.resolve();
    expect(document.activeElement).not.toBe(ausloeser);

    unmount();
    expect(document.activeElement).toBe(ausloeser);
    ausloeser.remove();
  });

  it('ein verschwundener Auslöser wirft nicht (der Merge-Dialog entfernt seine eigene Zeile)', async () => {
    const ausloeser = document.createElement('button');
    document.body.appendChild(ausloeser);
    ausloeser.focus();

    const { unmount } = eventModal();
    await Promise.resolve();
    ausloeser.remove();

    expect(() => unmount()).not.toThrow();
  });

  it('ValConfigSheet folgt derselben Regel — der Ring hängt nicht an einer Komponente', async () => {
    render(ValConfigSheet, {
      props: { config: defaultConfig(), onSave: vi.fn(), onClose: vi.fn() },
    });
    await Promise.resolve();

    expect(document.activeElement?.getAttribute('role')).toBe('dialog');
  });
});
