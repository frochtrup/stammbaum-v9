// @vitest-environment happy-dom
// tests/ui/tree-island-pointer-events.test.ts — Wächter über den Zeiger-Kontrakt der
// geteilten Insel-SVG-Ebene (BL-366, ADR-v9-275).
//
// ANLASS. `.tree-island__svg` trägt seit dem allerersten Insel-Commit
// `pointer-events: none`. Die Regel meinte die SANDUHR: dort ist das SVG nur die
// Linien-Ebene, die Karten sind `div`s darüber. Der Fächer kam später und ist die
// einzige Insel, die ihre Karten ALS SVG zeichnet — seine Segment-Klicks waren dadurch
// im Browser tot, obwohl `fan-chart.ts` sie sauber verdrahtet hatte.
//
// WARUM ZWEI HÄLFTEN, DIE JE FÜR SICH WERTLOS SIND. happy-dom hat keine Layout-Engine
// und wertet `pointer-events` nicht aus: ein `fireEvent.click` auf dem Segment ist dort
// grün, egal was das CSS sagt. Genau deshalb blieb der Defekt unentdeckt — auch die
// Tastaturnavigation (`tree-viewport.ts`, `navTargets`) läuft unabhängig von
// `pointer-events` weiter und sah gesund aus.
//   (a) prüft die CSS-REGEL im Quelltext — das, was der Browser auswertet und happy-dom
//       nicht sieht.
//   (b) prüft das MARKUP — dass die Elemente, die die Regel meint, das Attribut auch
//       tragen und verdrahtet sind.
// Erst (a)∧(b) sichern die Kette. Vorbild für (a): overlay-z-index.test.ts /
// touch-target.test.ts (TST-15) — CSS-Quelltext-Zusicherung statt Hit-Testing.
//
// GRENZE, bewusst mitgeschrieben: ein SVG-Kind OHNE `data-person-id`, das trotzdem einen
// Klick-Listener bekommt, sieht dieser Wächter nicht — happy-dom kann Listener nicht
// aufzählen. (b) ist deshalb als Kontraktsatz über ALLE interaktiven Kinder formuliert,
// nicht als Stichprobe auf einem.
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, fireEvent } from '@testing-library/svelte';
import TreeView from '../../ui/views/tree/TreeView.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { createRoute } from '../../ui/shell/route.svelte';
import { buildFourGenTree } from '../islands/tree-fixtures';
import { pinLayout } from './layout-harness';
import { layout } from '../../ui/shell/layout.svelte';

// `process.cwd()` statt `import.meta.url`: diese Datei läuft in happy-dom (Hälfte (b)
// prüft echtes Markup), und dort ist `import.meta.url` keine `file:`-URL mehr — dieselbe
// Begründung wie in lens-header-overflow.test.ts / entity-form-keyboard.test.ts.
const css = readFileSync(join(process.cwd(), 'ui/islands/tree/hourglass-tree.css'), 'utf8');

/** Rumpf des ersten Regelblocks mit exakt diesem Selektor. */
function ruleBody(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `CSS-Regel "${selector}" fehlt in hourglass-tree.css`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('}', start));
}

describe('(a) Zeiger-Kontrakt der Insel-SVG-Ebene — CSS-Quelltext', () => {
  it('die geteilte SVG-Ebene ist stumm', () => {
    // Sie liegt vollflächig über der Diagrammfläche. Wäre sie klickbar, träfe sie jeden
    // leeren Pixel und machte jede Ebene DARUNTER still unerreichbar.
    expect(ruleBody('.tree-island__svg')).toMatch(/pointer-events:\s*none/);
  });

  it('was eine Person benennt, holt sich das Klicken zurück', () => {
    // Eine REGEL statt einer Namensliste: `[data-person-id]` ist der bereits geteilte
    // Kontrakt (tree-cards.ts setzt es auf Karten, fan-chart.ts auf Segmente und
    // Zentrums-Kreis). Ohne sie sind die Fächer-Segmente im Browser tot, während
    // happy-dom sie für klickbar hält.
    const body = ruleBody('.tree-island__svg [data-person-id]');
    expect(body).toMatch(/pointer-events:\s*auto/);
    expect(body).toMatch(/cursor:\s*pointer/);
  });

  it('die Fächer-Beschriftung bleibt durchlässig', () => {
    // Tragend, nicht Vorsicht: `drawText()` hängt die Labels NACH ihrem Pfad an, sie
    // liegen also darüber und schluckten sonst den Klick auf ihr eigenes Segment.
    expect(ruleBody('.tree-island__fan-text')).toMatch(/pointer-events:\s*none/);
  });
});

describe('(b) Zeiger-Kontrakt — Markup des Fächers', () => {
  let unpin: () => void;
  beforeEach(() => {
    unpin = pinLayout(false);
  });
  afterEach(() => {
    unpin();
    layout.reset();
  });

  function renderFan() {
    const appState = createAppState();
    const viewState = createViewState();
    const route = createRoute({ treeMode: 'fan' });
    appState.loadDatabase(buildFourGenTree(), 'test.ged');
    viewState.setCurrent('lensFocus', 'I1');
    return { ...render(TreeView, { props: { appState, viewState, route } }), viewState };
  }

  it('zeichnet belegte Vorfahren-Segmente, und alle tragen data-person-id', () => {
    const { container } = renderFan();

    const clickable = container.querySelectorAll('.tree-island__svg [data-person-id]');
    // Zählung VOR der Zusicherung: eine Schleife über eine leere Menge wäre grün und
    // wertlos (Lehre ADR-v9-200).
    expect(clickable.length).toBeGreaterThan(0);

    // Kontraktsatz statt Stichprobe: jedes Segment MIT Person trägt das Attribut, jedes
    // leere Segment trägt es NICHT (ein Klick ins Leere darf den Fokus nicht verwerfen).
    const segments = container.querySelectorAll('.tree-island__fan-seg');
    expect(segments.length).toBeGreaterThan(0);
    for (const seg of segments) {
      const empty = seg.classList.contains('tree-island__fan-seg--empty');
      expect(seg.hasAttribute('data-person-id')).toBe(!empty);
    }
  });

  it('ein Klick auf ein Vorfahren-Segment zentriert den Baum um', async () => {
    const { container, viewState } = renderFan();

    const father = container.querySelector('.tree-island__fan-seg[data-person-id="I2"]');
    expect(father, 'Vater-Segment (I2) fehlt im Fächer').toBeTruthy();

    await fireEvent.click(father!);

    expect(viewState.getCurrent('lensFocus')).toBe('I2');
  });

  it('der Zentrums-Kreis öffnet den Steckbrief, statt wirkungslos zu rezentrieren', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const route = createRoute({ treeMode: 'fan' });
    appState.loadDatabase(buildFourGenTree(), 'test.ged');
    viewState.setCurrent('lensFocus', 'I1');
    const opened: string[] = [];

    const { container } = render(TreeView, {
      props: { appState, viewState, route, onOpenPersonDetail: (id: string) => opened.push(id) },
    });

    const center = container.querySelector('.tree-island__fan-center');
    expect(center, 'Zentrums-Kreis fehlt im Fächer').toBeTruthy();

    await fireEvent.click(center!);

    // Rezentrieren auf die bereits zentrierte Person wäre ein Klick ohne Wirkung —
    // dieselbe Rolle wie die Zentrum-Karte in Sanduhr/Nachkommen (tree-cards.ts).
    expect(opened).toEqual(['I1']);
    expect(viewState.getCurrent('lensFocus')).toBe('I1');
  });
});
