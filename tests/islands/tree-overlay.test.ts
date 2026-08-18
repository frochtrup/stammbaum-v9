// @vitest-environment happy-dom
// tests/islands/tree-overlay.test.ts — die Bedienelemente der Insel-Überlagerung
// (BL-367 „★ Zentrieren", BL-368 Generationen-Regler), für alle drei Baum-Modi zugleich.
//
// Warum parametrisiert über alle drei: die Überlagerung liegt EINMAL im geteilten
// `tree-viewport`, aber gefüllt wird sie je Insel (`homeTarget`, `generations` im
// `DiagramLayoutFrame`). Genau dort entstehen Geschwister-Stellen, die auseinanderdriften
// — eine Insel, die eins der beiden Felder vergisst, fällt nur auf, wenn alle drei
// dieselbe Zusicherung durchlaufen.
//
// Erster Test, der eine Baum-Insel überhaupt MOUNTET (bisher liefen sie nur über ihre
// reinen Layout-Funktionen). Das ist der Preis dafür, dass die Insel jetzt eigene
// Bedienelemente trägt und nicht mehr nur zeichnet.
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mountHourglassTree, type TreeIslandHandle, type TreeMountCallbacks } from '../../ui/islands/tree/hourglass-tree';
import { mountDescendantTree } from '../../ui/islands/tree/descendant-tree';
import { mountFanChart } from '../../ui/islands/tree/fan-chart';
import { MIN_ANCESTOR_LEVELS, MAX_ANCESTOR_LEVELS } from '../../ui/islands/tree/tree-layout';
import { MIN_DESC_GENERATIONS, MAX_DESC_GENERATIONS, DEFAULT_DESC_GENERATIONS } from '../../ui/islands/tree/descendant-layout';
import { MIN_FAN_GENERATIONS, MAX_FAN_GENERATIONS, DEFAULT_FAN_GENERATIONS } from '../../ui/islands/tree/fan-layout';
import { buildFourGenTree } from './tree-fixtures';
import type { Database, PersonId } from '../../core/model/types';

type Mounter = (
  el: HTMLElement,
  db: Database,
  id: PersonId,
  cb: TreeMountCallbacks,
  opts?: Parameters<typeof mountHourglassTree>[4],
) => TreeIslandHandle;

const MODI: { name: string; mount: Mounter; min: number; max: number; default: number; caption: string }[] = [
  {
    name: 'Sanduhr',
    mount: mountHourglassTree,
    min: MIN_ANCESTOR_LEVELS,
    max: MAX_ANCESTOR_LEVELS,
    // Die Vorgabe hängt beim Sanduhr-Baum am Formfaktor; die Tests erzwingen `portrait: false`.
    default: MAX_ANCESTOR_LEVELS,
    caption: 'Vorfahren-Ebenen',
  },
  {
    name: 'Nachkommen',
    mount: mountDescendantTree,
    min: MIN_DESC_GENERATIONS,
    max: MAX_DESC_GENERATIONS,
    default: DEFAULT_DESC_GENERATIONS,
    caption: 'Generationen',
  },
  {
    name: 'Fächer',
    mount: mountFanChart,
    min: MIN_FAN_GENERATIONS,
    max: MAX_FAN_GENERATIONS,
    default: DEFAULT_FAN_GENERATIONS,
    caption: 'Generationen',
  },
];

let host: HTMLElement;
let handles: TreeIslandHandle[];

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  handles = [];
});
afterEach(() => {
  for (const h of handles) h.destroy();
  host.remove();
});

function mount(
  m: (typeof MODI)[number],
  id: PersonId,
  opts: Parameters<typeof mountHourglassTree>[4] = {},
  cb: Partial<TreeMountCallbacks> = {},
): HTMLElement {
  const el = document.createElement('div');
  host.appendChild(el);
  const handle = m.mount(el, buildFourGenTree(), id, { onSelect: () => {}, ...cb }, { portrait: false, ...opts });
  handles.push(handle);
  return el;
}

const homeBtn = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('.tree-island__home-btn')!;
const genSel = (el: HTMLElement) => el.querySelector<HTMLSelectElement>('.tree-island__gen-sel')!;

describe.each(MODI)('$name — Überlagerung', (m) => {
  describe('★ Zentrieren (BL-367)', () => {
    it('fehlt, solange gar kein Proband bekannt ist', () => {
      const el = mount(m, 'I1');
      expect(homeBtn(el).hidden).toBe(true);
    });

    it('fehlt, wenn der Proband bereits das Zentrum ist — ein Knopf ohne Wirkung wäre keiner', () => {
      const el = mount(m, 'I1', { probandId: 'I1' });
      expect(homeBtn(el).hidden).toBe(true);
    });

    it('erscheint, sobald der Baum woanders zentriert ist', () => {
      const el = mount(m, 'I2', { probandId: 'I1' });
      expect(homeBtn(el).hidden).toBe(false);
    });

    it('führt auf den Probanden zurück — über denselben Rückkanal wie die Pfeiltasten', () => {
      const gesehen: PersonId[] = [];
      const el = mount(m, 'I2', { probandId: 'I1' }, { onSelect: (id) => gesehen.push(id) });

      homeBtn(el).click();

      expect(gesehen).toEqual(['I1']);
    });

    it('verschwindet wieder, sobald die Rezentrierung angekommen ist', () => {
      const el = mount(m, 'I2', { probandId: 'I1' });
      expect(homeBtn(el).hidden).toBe(false);

      // Was die Schale nach `onSelect` tut: neuer Fokus, gleiche Insel.
      handles[handles.length - 1].update('I1', { probandId: 'I1' });

      expect(homeBtn(el).hidden).toBe(true);
    });
  });

  describe('Generationen-Regler (BL-368)', () => {
    it('bietet genau die Spanne dieser Insel an', () => {
      const el = mount(m, 'I1');
      const werte = [...genSel(el).options].map((o) => Number(o.value));

      expect(werte.length).toBeGreaterThan(0);
      expect(werte[0]).toBe(m.min);
      expect(werte[werte.length - 1]).toBe(m.max);
      // Lückenlos aufsteigend — sonst führt der Regler an Stufen vorbei, die es gibt.
      expect(werte).toEqual(Array.from({ length: m.max - m.min + 1 }, (_, i) => m.min + i));
    });

    it('trägt den Namen dieser Insel als zugänglichen Namen', () => {
      // „Vorfahren-Ebenen" vs. „Generationen": die Sanduhr zählt Ebenen ÜBER dem Zentrum,
      // die anderen beiden Generationen inklusive Zentrum. Ein gemeinsames Wort wäre gelogen.
      expect(genSel(mount(m, 'I1')).getAttribute('aria-label')).toBe(m.caption);
    });

    it('zeigt ohne Wahl die Vorgabe der Insel — nicht leer und nicht geraten', () => {
      expect(genSel(mount(m, 'I1')).value).toBe(String(m.default));
    });

    it('meldet eine Wahl nach oben, statt sie selbst abzulegen', () => {
      const gewaehlt: number[] = [];
      const el = mount(m, 'I1', {}, { onGenerationsChange: (n) => gewaehlt.push(n) });

      genSel(el).value = String(m.min);
      genSel(el).dispatchEvent(new Event('change'));

      expect(gewaehlt).toEqual([m.min]);
    });

    it('übernimmt den zurückgereichten Wert, ohne die Insel neu aufzubauen', () => {
      const el = mount(m, 'I1');
      const vorher = el.querySelector('.tree-island__scroll');

      handles[handles.length - 1].update('I1', { generations: m.min, maxAncestorLevels: m.min });

      expect(genSel(el).value).toBe(String(m.min));
      // Dieselbe DOM-Instanz: eine Generationen-Wahl darf weder Zoom noch Scroll-Position
      // noch den Tastaturzustand wegwerfen.
      expect(el.querySelector('.tree-island__scroll')).toBe(vorher);
    });
  });
});

describe('Export folgt der Anzeige (BL-368)', () => {
  // Die unauffälligste Bruchstelle des ganzen Zugs: `getExportSvg()` rechnet das Layout
  // ERNEUT (es liest nicht das Live-DOM, ADR-v9-123). Nähme es dabei eine andere
  // Generationenzahl, exportierte der Nutzer etwas anderes, als er auf dem Schirm sieht —
  // und niemand würde es bemerken, weil beide Wege für sich funktionieren.
  it.each([
    // Der Nachkommen-Baum wird beim Urgroßvater zentriert, NICHT beim Probanden: von I1
    // aus ist die Fixture nur zwei Generationen tief, dort sähen 2 und 7 identisch aus —
    // der Test wäre grün, ohne irgendetwas zu prüfen. Von I8 aus geht es I8→I4→I2→I1→I30.
    ['Nachkommen', MODI[1], 'I8', MIN_DESC_GENERATIONS, MAX_DESC_GENERATIONS],
    ['Fächer', MODI[2], 'I1', MIN_FAN_GENERATIONS, MAX_FAN_GENERATIONS],
  ] as const)('%s: weniger Generationen im Regler → kleineres Export-SVG', (_name, m, zentrum, min, max) => {
    mount(m, zentrum, { generations: max });
    const gross = handles[handles.length - 1].getExportSvg()!;

    mount(m, zentrum, { generations: min });
    const klein = handles[handles.length - 1].getExportSvg()!;

    expect(gross).not.toBeNull();
    expect(klein.body.length).toBeLessThan(gross.body.length);
  });

  it('Sanduhr: die gewählte Ebenenzahl schlägt bis in den Export durch', () => {
    mount(MODI[0], 'I1', { maxAncestorLevels: MAX_ANCESTOR_LEVELS });
    const gross = handles[handles.length - 1].getExportSvg()!;

    mount(MODI[0], 'I1', { maxAncestorLevels: MIN_ANCESTOR_LEVELS });
    const klein = handles[handles.length - 1].getExportSvg()!;

    expect(klein.body.length).toBeLessThan(gross.body.length);
  });
});

describe('Sanduhr — formfaktor-abhängige Vorgabe', () => {
  // Die Vorgabe wird IN der Insel gebildet, weil nur der Viewport das Seitenverhältnis des
  // Containers misst. Weil der Regler ebenfalls dort sitzt, zeigt er genau den Wert, der
  // gezeichnet wird — es gibt keine zweite Formfaktor-Wahrheit in der Schale.
  it('zeigt im Hochformat 2 Ebenen, im Querformat 4', () => {
    const hoch = mount(MODI[0], 'I1', { portrait: true });
    expect(genSel(hoch).value).toBe('2');

    const quer = mount(MODI[0], 'I1', { portrait: false });
    expect(genSel(quer).value).toBe(String(MAX_ANCESTOR_LEVELS));
  });

  it('eine ausdrückliche Wahl schlägt die Formfaktor-Vorgabe', () => {
    const el = mount(MODI[0], 'I1', { portrait: true, maxAncestorLevels: 4 });
    expect(genSel(el).value).toBe('4');
  });
});
