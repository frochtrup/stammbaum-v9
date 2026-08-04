// @vitest-environment happy-dom
// tests/ui/detail-scroll.test.ts — die Detailfläche scrollt (BL-309, ADR-v9-220,
// Spec 21 §2).
//
// DER DEFEKT, den dieser Wächter verhindert: `.entity-tab__swipe` — der Knoten, an dem
// die Wisch-Geste hängt — hatte im `<style>`-Block von `EntityTab.svelte` KEINE Regel.
// Damit war er eine gewöhnliche Block-Box und als Flex-Kind von `.entity-tab` nicht
// schrumpffähig (seine automatische Mindesthöhe ist die Inhaltshöhe, weil sein eigenes
// `overflow` `visible` ist). Er wuchs auf die volle Inhaltshöhe, die Detail-Wurzel darin
// bekam nie eine Höhe, ihr `overflow-y: auto` griff nie — und `main` (`overflow: hidden`)
// schnitt den Rest ab. Am Handy war alles unterhalb des ersten Bildschirms per Geste
// unerreichbar. Gemessen bei 375x812: `.entity-tab` 688px, Wrapper 2534px.
//
// WARUM ALS QUELLTEXT-PRÜFUNG UND NICHT AM GERENDERTEN BAUM: happy-dom hat keine
// Layout-Engine — `clientHeight` ist dort 0, „scrollt das?" ist prinzipiell nicht
// beantwortbar (dieselbe Grenze, die `overlay-portal.test.ts` und `overlay-z-index.test.ts`
// benennen). Die Wirkung ist im echten Browser verifiziert (ADR-v9-220: Mausrad über der
// Detailfläche, vorher 0px, nachher bis zur Lösch-Zone). Prüfbar ist hier die BEDINGUNG,
// aus der sie folgt — und genau die fehlte.
//
// ZWEI EBENEN, weil der Defekt aus dem ZUSAMMENSPIEL entstand:
//  1. Jede Detail-Wurzel ist ihr eigener Scroll-Container (`overflow-y: auto`).
//  2. Zwischen ihr und `.entity-tab` steht keine Box, die diese Höhe wieder auflöst.
// Beide für sich waren nie verletzt; ihr Zusammenspiel war es. Ein Wächter auf nur eine
// der beiden hätte den Fall nicht gesehen.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { swipeNav, SWIPE_MIN_DISTANCE } from '../../ui/shell/swipe-nav';

const UI_DIR = resolve(process.cwd(), 'ui');
const ENTITY_TAB = join(UI_DIR, 'views', 'EntityTab.svelte');

/** Quelltext ohne Kommentare — ein auskommentiertes Beispiel ist kein Markup. */
function quelle(pfad: string): string {
  return readFileSync(pfad, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

// ---------------------------------------------------------------------------------
// Ebene 1: die Detail-Wurzeln sind Scroll-Container
// ---------------------------------------------------------------------------------
//
// POPULATION GERECHNET, NICHT ALS NAMENSLISTE (Vorbild BL-278-Wächter): gefragt sind
// genau die Komponenten, die `EntityTab` in seinem `detailPane`-Snippet rendert. Eine
// achte Detailansicht wird damit automatisch mitgeprüft — eine Namensliste sähe sie nicht.
describe('BL-309: jede Detail-Wurzel ist ihr eigener Scroll-Container', () => {
  /** Die Komponenten aus dem `detailPane`-Snippet, aufgelöst auf ihre Dateien. */
  function detailKomponenten(): { name: string; pfad: string }[] {
    const src = quelle(ENTITY_TAB);
    const snippet = /\{#snippet detailPane\(\)\}([\s\S]*?)\{\/snippet\}/.exec(src);
    if (!snippet) throw new Error('detailPane-Snippet nicht gefunden — Markup umgebaut?');
    const namen = [...new Set([...snippet[1].matchAll(/<([A-Z]\w+)/g)].map((m) => m[1]))];
    const out: { name: string; pfad: string }[] = [];
    for (const name of namen) {
      const imp = new RegExp(`import\\s+${name}\\s+from\\s+'([^']+)'`).exec(src);
      if (!imp) continue; // z. B. eine im selben Modul definierte Hilfskomponente
      out.push({ name, pfad: resolve(join(UI_DIR, 'views'), imp[1]) });
    }
    return out;
  }

  it('es gibt überhaupt Detail-Komponenten zu prüfen', () => {
    // Ohne diese Zeile liefe die Schleife unten über eine leere Menge grün durch —
    // grün, ohne je etwas geprüft zu haben (ADR-v9-200).
    expect(detailKomponenten().length).toBeGreaterThanOrEqual(7);
  });

  it('jede rendert ihre Wurzel mit `overflow-y: auto`', () => {
    const verstoesse = detailKomponenten()
      .filter(({ pfad }) => {
        // Die Wurzelklasse ist die Datei-eigene Kebab-Form (.person-detail & Co.) — der
        // Selektor, der im `<style>`-Block die Wurzel trägt. Gesucht wird die Regel, die
        // GENAU diese Klasse setzt, nicht eine ihrer `__`-Unterklassen.
        const src = quelle(pfad);
        const wurzel = /<div class="([a-z-]+)"/.exec(src)?.[1];
        if (!wurzel) return true;
        const regel = new RegExp(`\\.${wurzel}\\s*\\{([^}]*)\\}`).exec(src)?.[1] ?? '';
        return !/overflow-y:\s*auto/.test(regel);
      })
      .map(({ name }) => name);
    expect(
      verstoesse,
      'Detail-Wurzel ohne eigenen Scroll-Container — sie bekommt vom Tab eine Höhe und muss den Überschuss selbst scrollen',
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------
// Ebene 2: keine Box zwischen Tab und Detail-Wurzel, die die Höhe auflöst
// ---------------------------------------------------------------------------------
describe('BL-309: was `detailPane` umschließt, löst die Höhenkette nicht auf', () => {
  /** Klassen aller Elemente, die `{@render detailPane()}` direkt umschließen. */
  function huellenKlassen(): string[] {
    const zeilen = quelle(ENTITY_TAB).split('\n');
    const out: string[] = [];
    zeilen.forEach((zeile, i) => {
      if (!zeile.includes('{@render detailPane()}')) return;
      // Die Hülle steht entweder auf derselben Zeile (einzeiliges `{#if}`-Konstrukt)
      // oder auf der nächstgelegenen darüber, die ein Element öffnet.
      for (let j = i; j >= 0 && j > i - 4; j--) {
        const m = /<div[^>]*class="([^"]+)"/.exec(zeilen[j]);
        if (m) {
          out.push(m[1]);
          return;
        }
      }
    });
    return [...new Set(out)];
  }

  /** Alle Deklarationen, die auf ein Element mit diesen Klassen wirken. */
  function deklarationen(klassen: string): string {
    const src = quelle(ENTITY_TAB);
    return klassen
      .split(/\s+/)
      .filter(Boolean)
      .map((k) => new RegExp(`\\.${k}\\s*\\{([^}]*)\\}`).exec(src)?.[1] ?? '')
      .join(';');
  }

  it('es gibt überhaupt Hüllen zu prüfen', () => {
    // Drei erwartet: mobil (Wisch-Knoten), Desktop-Zweispalter, Desktop-Flächenübersicht.
    expect(huellenKlassen().length).toBeGreaterThanOrEqual(3);
  });

  it('jede Hülle ist entweder box-los oder selbst höhenbegrenzt', () => {
    // DIE EIGENTLICHE ZUSICHERUNG. Zwei zulässige Formen, weil beide korrekt sind:
    //  * `display: contents` — der Knoten ist nur ein Ereignis-Griff (der Wisch-Knoten;
    //    die Detail-Wurzel wird selbst zum Flex-Kind, wie im Listen-Pfad).
    //  * `min-height: 0` — der Knoten IST eine Box, gibt seine Begrenzung aber weiter
    //    (die beiden Desktop-Panes über `.entity-tab__pane`).
    // Der Defektzustand — gar keine Regel — erfüllt keine von beiden und wird rot.
    const verstoesse = huellenKlassen().filter((k) => {
      const d = deklarationen(k);
      return !/display:\s*contents/.test(d) && !/min-height:\s*0/.test(d);
    });
    expect(
      verstoesse,
      'Hülle um detailPane ohne Höhen-Weitergabe — sie wächst auf Inhaltshöhe und die Detailfläche scrollt nicht mehr',
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------
// Der Kontrakt, auf dem der Fix ruht: die Geste überlebt die box-lose Hülle
// ---------------------------------------------------------------------------------
describe('BL-309: `display: contents` nimmt die Box, nicht die Ereignisse', () => {
  it('ein Wisch, der auf einem KIND beginnt, erreicht den Griff darüber', () => {
    // Warum das der springende Punkt ist: `display: contents` entfernt die Box des
    // Knotens — er wird nie selbst Treffer-Ziel. Die Geste funktioniert trotzdem, weil
    // touch-Ereignisse die DOM-Kette hochblubbern und die von `contents` unberührt ist.
    // Layout-unabhängig und deshalb hier ehrlich prüfbar.
    const griff = document.createElement('div');
    const kind = document.createElement('div');
    griff.appendChild(kind);
    document.body.appendChild(griff);

    const onBack = vi.fn();
    const onForward = vi.fn();
    const aktion = swipeNav(griff, { onBack, onForward });

    const beruehrung = (x: number) => ({ clientX: x, clientY: 0 });
    kind.dispatchEvent(
      new TouchEvent('touchstart', { bubbles: true, touches: [beruehrung(0) as Touch] }),
    );
    kind.dispatchEvent(
      new TouchEvent('touchend', {
        bubbles: true,
        changedTouches: [beruehrung(SWIPE_MIN_DISTANCE + 40) as Touch],
      }),
    );

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onForward).not.toHaveBeenCalled();
    aktion.destroy();
    griff.remove();
  });
});
