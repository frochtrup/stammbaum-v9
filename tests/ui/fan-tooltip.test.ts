// @vitest-environment happy-dom
// tests/ui/fan-tooltip.test.ts — Verdrahtung der Fächer-Tooltips und der erweiterten
// Generationen-Spanne (Nutzer-Befund 2026-08-19, ADR-v9-276).
//
// ANLASS. Die gezeichnete Beschriftung des Fächers verkürzt sich ring für ring
// (voller Name → „J. G. Schmidt" → nur Nachname → gar nichts) — genau dort, wo die
// Ahnenreihe interessant wird. Die Identität hängt seitdem am Tooltip; er ist also kein
// Zusatz, sondern die einzige Auskunft der äußeren Ringe.
//
// WAS DIESER WÄCHTER PRÜFT UND WAS NICHT. `fan-layout.test.ts` prüft den TEXT (reine
// Funktion, kein DOM). Hier geht es um die Kette dahinter: dass die Segmente die geteilte
// Blase (`ui/shell/tooltip.ts`, INV-UI-12) tatsächlich auslösen und dass der Orts-Teil
// den Weg von `appState.placeContext` bis in die Zeile findet — vier Module, die je für
// sich grün sein können, ohne dass am Ende etwas erscheint.
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import TreeView from '../../ui/views/tree/TreeView.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { createRoute } from '../../ui/shell/route.svelte';
import { makeEvent } from '../../core/model';
import { buildFourGenTree } from '../islands/tree-fixtures';
import { pinLayout } from './layout-harness';
import { layout } from '../../ui/shell/layout.svelte';
import { MAX_FAN_GENERATIONS, MIN_FAN_GENERATIONS } from '../../ui/islands/tree/fan-layout';

function bubbleText(): string | null {
  return document.querySelector('.stb-tooltip')?.textContent ?? null;
}

describe('Fächer — Tooltip statt verlorener Beschriftung', () => {
  let unpin: () => void;
  beforeEach(() => {
    document.querySelector('.stb-tooltip')?.remove();
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
    const db = buildFourGenTree();
    // Ein Ahn mit Geburtsdatum — der Teil, den der Fächer nirgends zeichnet.
    db.individuals.get('I2')!.birth = makeEvent('BIRT', { date: '12 MAR 1834', place: 'Hasbergen' });
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('lensFocus', 'I1');
    return render(TreeView, { props: { appState, viewState, route } });
  }

  it('Hover auf einem Segment zeigt Name und Geburtsjahr', async () => {
    const { container } = renderFan();
    const father = container.querySelector('.tree-island__fan-seg[data-person-id="I2"]')!;
    expect(father, 'Vater-Segment (I2) fehlt im Fächer').toBeTruthy();

    await fireEvent.mouseEnter(father);

    // Picker-Form: Anzeigename · Jahr, Ort (`yearPlaceSummary`, INV-UI-6) — der Ort ist
    // hier nur der Rohtext des Ereignisses, weil kein kuratierter Ortssatz existiert.
    expect(bubbleText()).toBe('Vater Testperson · 1834, Hasbergen');
  });

  it('auch der Zentrums-Kreis trägt ihn — er zeigt ebenfalls kein Geburtsjahr', async () => {
    const { container } = renderFan();
    const center = container.querySelector('.tree-island__fan-center')!;

    await fireEvent.mouseEnter(center);

    expect(bubbleText()).toBe('Proband Testperson');
  });

  it('leere Segmente lösen keine Blase aus (es gibt nichts zu benennen)', async () => {
    const { container } = renderFan();
    const leer = container.querySelectorAll('.tree-island__fan-seg--empty');
    expect(leer.length).toBeGreaterThan(0);

    await fireEvent.mouseEnter(leer[0]);

    expect(bubbleText()).toBeFalsy();
  });

  it('der Regler bietet die volle Spanne bis 8 Generationen an', () => {
    const { container } = renderFan();
    const sel = container.querySelector('.tree-island__gen-sel') as HTMLSelectElement;
    const werte = Array.from(sel.options).map((o) => Number(o.value));

    expect(werte[0]).toBe(MIN_FAN_GENERATIONS);
    expect(werte[werte.length - 1]).toBe(MAX_FAN_GENERATIONS);
    expect(MAX_FAN_GENERATIONS).toBe(8);
  });

  it('die Wahl „8" zeichnet acht Ringe (2^1 + … + 2^8 Segmente)', async () => {
    const { container } = renderFan();
    const sel = container.querySelector('.tree-island__gen-sel') as HTMLSelectElement;
    sel.value = '8';
    await fireEvent.change(sel);
    await tick();

    expect(container.querySelectorAll('.tree-island__fan-seg')).toHaveLength(2 ** 9 - 2);
    // Und die Beschriftung des Zentrums bleibt lesbar — der äußere Ring drückt sie nicht weg.
    expect(container.querySelector('.tree-island__fan-center')).toBeTruthy();
  });
});
