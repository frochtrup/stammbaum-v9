// @vitest-environment happy-dom
// tests/ui/tooltip.test.ts — geteilte Tooltip-Action (ui/shell/tooltip.ts, INV-UI-4).
// Ersetzt die nativen `title`-Tooltips (erschienen auf Touch/iPad nicht, ADR-v9-86 Nachtrag).
import { describe, expect, it, beforeEach } from 'vitest';
import { tooltip } from '../../ui/shell/tooltip';

function bubble(): HTMLElement | null {
  return document.querySelector('.stb-tooltip');
}

describe('tooltip-Action — Hover/Fokus zeigt und verbirgt die Blase', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.querySelector('.stb-tooltip')?.remove();
  });

  it('zeigt bei mouseenter eine Blase mit dem Text und verbirgt sie bei mouseleave', () => {
    const node = document.createElement('button');
    document.body.appendChild(node);
    const handle = tooltip(node, 'Quelle X · S. 12');

    node.dispatchEvent(new Event('mouseenter'));
    expect(bubble()?.textContent).toBe('Quelle X · S. 12');
    expect(bubble()?.style.visibility).toBe('visible');

    node.dispatchEvent(new Event('mouseleave'));
    expect(bubble()?.style.visibility).toBe('hidden');

    handle?.destroy?.();
  });

  it('zeigt auch bei Tastatur-Fokus (focus) — A11y', () => {
    const node = document.createElement('button');
    document.body.appendChild(node);
    const handle = tooltip(node, 'Fokus-Text');

    node.dispatchEvent(new Event('focus'));
    expect(bubble()?.textContent).toBe('Fokus-Text');
    expect(bubble()?.style.visibility).toBe('visible');

    node.dispatchEvent(new Event('blur'));
    expect(bubble()?.style.visibility).toBe('hidden');

    handle?.destroy?.();
  });

  it('zeigt NICHTS bei leerem Text', () => {
    const node = document.createElement('button');
    document.body.appendChild(node);
    const handle = tooltip(node, '');

    node.dispatchEvent(new Event('mouseenter'));
    // entweder keine Blase oder unsichtbar
    expect(bubble()?.style.visibility ?? 'hidden').toBe('hidden');

    handle?.destroy?.();
  });

  it('update() ändert den Text, während die Blase sichtbar ist', () => {
    const node = document.createElement('button');
    document.body.appendChild(node);
    const handle = tooltip(node, 'alt');

    node.dispatchEvent(new Event('mouseenter'));
    expect(bubble()?.textContent).toBe('alt');

    handle?.update?.('neu');
    expect(bubble()?.textContent).toBe('neu');

    handle?.destroy?.();
  });

  it('destroy() verbirgt die Blase und entfernt die Listener', () => {
    const node = document.createElement('button');
    document.body.appendChild(node);
    const handle = tooltip(node, 'weg gleich');

    node.dispatchEvent(new Event('mouseenter'));
    expect(bubble()?.style.visibility).toBe('visible');

    handle?.destroy?.();
    expect(bubble()?.style.visibility).toBe('hidden');

    // nach destroy löst ein erneutes mouseenter nichts mehr aus
    node.dispatchEvent(new Event('mouseenter'));
    expect(bubble()?.style.visibility).toBe('hidden');
  });
});
