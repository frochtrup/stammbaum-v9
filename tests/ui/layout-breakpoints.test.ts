// tests/ui/layout-breakpoints.test.ts — Formfaktor-Zustand der Schale (Spec 21 §3,
// ADR-v9-101, BL-91).
//
// Zwei Dinge werden hier bewacht, und das zweite ist der eigentliche Zweck des Moduls:
//
// 1. Die Entscheidungsfunktion und der reaktive Zustand verhalten sich an der Grenze
//    korrekt und melden Änderungen live weiter.
// 2. Kein Stylesheet führt einen EIGENEN Formfaktor-Breakpoint. Genau das ist der
//    Zustand, den BL-91 auflöst ("statt verstreuter Media-Queries") — und eine
//    Konvention allein hält ihn nicht: die `<select bind:value>`-Falle tauchte nach
//    ihrer ersten Behebung in sieben neuen Stellen wieder auf, bis sie eine Lint-Regel
//    wurde (Spec 32 TST-12). Deshalb hier ein Wächter statt eines Kommentars.
//
// Läuft bewusst im node-Environment (kein DOM-Docblock): das Modul ist bis auf die
// injizierbare Umgebung DOM-frei, und der Stylesheet-Wächter liest Dateien.
//
// ACHTUNG beim Bearbeiten dieser Datei: Vitest sucht den Environment-Docblock als
// reine Zeichenfolge im Dateiinhalt — er wirkt auch aus einem KOMMENTAR heraus, in dem
// er nur erwähnt wird. Genau das ist hier beim Bau passiert: der ursprüngliche
// Kopfkommentar erklärte, dass die Datei OHNE DOM-Umgebung läuft, nannte den Docblock
// dabei wörtlich — und schaltete ihn damit ein. Folge: happy-dom mit 1024px-Viewport,
// `matchMedia('(min-width: 900px)')` lieferte true, und der Test des Direktabruf-Pfads
// schlug mit einem auf den ersten Blick unerklärlichen `true` fehl.
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  BREAKPOINT_LAYOUT_PX,
  BREAKPOINT_OVERLAY_PX,
  LAYOUT_QUERY,
  isDesktopLayout,
  layout,
  type LayoutEnv,
} from '../../ui/shell/layout.svelte';

/** Steuerbare Umgebung: erlaubt einen Formfaktor-Wechsel mitten im Test. */
function makeEnv(initial: boolean) {
  let matches = initial;
  const subscribers = new Set<(m: boolean) => void>();
  const env: LayoutEnv = {
    matches: () => matches,
    subscribe: (_query, cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
  };
  return {
    env,
    subscriberCount: () => subscribers.size,
    resizeTo(next: boolean) {
      matches = next;
      for (const cb of subscribers) cb(next);
    },
  };
}

describe('isDesktopLayout — reine Entscheidung an der Grenze', () => {
  it('schaltet bei 900px um, Grenze eingeschlossen', () => {
    expect(isDesktopLayout(899)).toBe(false);
    expect(isDesktopLayout(BREAKPOINT_LAYOUT_PX)).toBe(true);
    expect(isDesktopLayout(901)).toBe(true);
  });

  it('behandelt ein Tablet im Hochformat als Mobile-Layout (aber über der Overlay-Grenze)', () => {
    // Die beabsichtigte Wirkung der Trennung beider Grenzen: 768px bekommt Popover
    // (CSS-Sache) OHNE Sidebar (JS-Sache). Wäre es nur eine Grenze, ginge genau das
    // verloren — deshalb steht der Fall als Test da, nicht nur als Kommentar.
    expect(isDesktopLayout(768)).toBe(false);
    expect(768).toBeGreaterThan(BREAKPOINT_OVERLAY_PX);
  });

  it('baut die Media-Query aus derselben Konstante', () => {
    expect(LAYOUT_QUERY).toBe(`(min-width: ${BREAKPOINT_LAYOUT_PX}px)`);
  });
});

describe('layout — reaktiver Formfaktor der Schale', () => {
  beforeEach(() => layout.reset());

  it('fragt die Plattform direkt, solange start() nicht gelaufen ist', () => {
    // Mount-Reihenfolge Kind vor Wurzel: ohne diesen Direktabruf zeigte ein
    // Desktop-Fenster einen Frame lang das Mobile-Layout (Lehre aus onlineStatus).
    const { env } = makeEnv(true);
    layout.start(env);
    layout.reset();
    expect(layout.isDesktopLayout).toBe(false); // reset -> wieder browserEnv, kein window
  });

  it('übernimmt den Startwert aus der Umgebung', () => {
    const { env } = makeEnv(true);
    layout.start(env);
    expect(layout.isDesktopLayout).toBe(true);
  });

  it('folgt einem Formfaktor-Wechsel live (Fenster ziehen, Gerät drehen)', () => {
    const ctl = makeEnv(false);
    layout.start(ctl.env);
    expect(layout.isDesktopLayout).toBe(false);

    ctl.resizeTo(true);
    expect(layout.isDesktopLayout).toBe(true);

    ctl.resizeTo(false);
    expect(layout.isDesktopLayout).toBe(false);
  });

  it('meldet den Listener bei der Abmeldefunktion wieder ab (kein Leck bei Remount)', () => {
    const ctl = makeEnv(false);
    const stop = layout.start(ctl.env);
    expect(ctl.subscriberCount()).toBe(1);

    stop();
    expect(ctl.subscriberCount()).toBe(0);
  });
});

describe('Kein Stylesheet führt einen eigenen Formfaktor-Breakpoint (BL-91)', () => {
  // Repo-Wurzel statt import.meta.url: Vitest läuft mit cwd = Projektwurzel, und die
  // URL-Variante lieferte hier einen abgeschnittenen Pfad ('/ui').
  const UI_ROOT = join(process.cwd(), 'ui');

  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return e.isFile() && (e.name.endsWith('.svelte') || e.name.endsWith('.css')) ? [full] : [];
    });
  }

  it('nutzt in px-basierten Breiten-Media-Queries ausschließlich die benannten Grenzen', () => {
    // Warum px vs. rem die richtige Trennlinie ist — und keine bequeme Ausrede für den
    // Bestand: ein FORMFAKTOR darf nicht mit der Schriftgröße des Nutzers skalieren
    // (ein Telefon bleibt ein Telefon, auch bei 200 % Schrift) und gehört deshalb in
    // px. Ein INHALTSGETRIEBENER Umbruch (eine Spaltenzeile, deren Text sonst auf
    // wenige Zeichen schrumpft — ValidationPanel) SOLL mitskalieren und gehört in rem.
    // Dieser Wächter greift daher genau die erste Sorte.
    const allowed = new Set([BREAKPOINT_OVERLAY_PX, BREAKPOINT_LAYOUT_PX]);
    const offenders: string[] = [];

    for (const file of walk(UI_ROOT)) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/@media[^{]*?\((?:min|max)-width:\s*(\d+(?:\.\d+)?)px\)/g)) {
        const px = Number(m[1]);
        if (!allowed.has(px)) offenders.push(`${file.replace(process.cwd() + '/', '')}: ${px}px`);
      }
    }

    expect(offenders, `Unbenannte Formfaktor-Breakpoints: ${offenders.join(' · ')}`).toEqual([]);
  });

  it('findet die bestehende Overlay-Media-Query überhaupt (der Wächter läuft nicht ins Leere)', () => {
    // Ein Wächter, der nichts sieht, ist immer grün. Gegenprobe: die eine bekannte
    // px-Breiten-Query im Bestand (FilterBar, Bottom-Sheet ⇄ Popover) muss auffindbar
    // sein — sonst prüft der Test oben nur einen leeren Dateibaum.
    const found = walk(UI_ROOT)
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')
      .match(/@media[^{]*?\((?:min|max)-width:\s*\d+(?:\.\d+)?px\)/g);

    expect(found?.length ?? 0).toBeGreaterThan(0);
  });
});
