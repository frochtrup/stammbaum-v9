// tests/ui/tree-view-state.test.ts — Halter der Baum-Lens (BL-368, Spec 21 §5 Heimat ③).
//
// Die eine Zusicherung, die es zu halten gilt: JE MODUS ein eigener Wert. Ein gemeinsamer
// Wert wäre der naheliegende Bau — und würde stillschweigend klemmen, weil die drei
// Spannen verschieden sind (Vorfahren-Ebenen 1–4 · Nachkommen 2–7 · Fächer 3–6). Der
// Regler zeigte dann „6", während die Sanduhr 4 Ebenen zeichnet.
import { describe, expect, it } from 'vitest';
import { createTreeViewState } from '../../ui/views/tree/tree-view-state.svelte';

describe('TreeViewState — Generationenzahl je Baum-Modus', () => {
  it('kennt vor der ersten Wahl keinen Wert — dann bildet die Insel ihre eigene Vorgabe', () => {
    const s = createTreeViewState();
    // Nicht `0` oder eine geratene Zahl: die Sanduhr-Vorgabe hängt am Formfaktor, den nur
    // der Viewport misst. `null` ist die ehrliche Antwort der Schale.
    expect(s.generationsFor('hourglass')).toBeNull();
    expect(s.generationsFor('descendant')).toBeNull();
    expect(s.generationsFor('fan')).toBeNull();
  });

  it('hält die Wahl je Modus getrennt', () => {
    const s = createTreeViewState();

    s.setGenerations('fan', 6);

    expect(s.generationsFor('fan')).toBe(6);
    // 6 liegt außerhalb der Sanduhr-Spanne (1–4) — ein geteilter Topf hätte hier still
    // geklemmt und den Regler eine andere Zahl zeigen lassen als das Diagramm.
    expect(s.generationsFor('hourglass')).toBeNull();
    expect(s.generationsFor('descendant')).toBeNull();
  });

  it('überlebt den Weg in einen anderen Modus und zurück', () => {
    const s = createTreeViewState();

    s.setGenerations('fan', 3);
    s.setGenerations('descendant', 7);

    expect(s.generationsFor('fan')).toBe(3);
    expect(s.generationsFor('descendant')).toBe(7);
  });

  it('eine erneute Wahl ersetzt die vorige', () => {
    const s = createTreeViewState();

    s.setGenerations('hourglass', 2);
    s.setGenerations('hourglass', 3);

    expect(s.generationsFor('hourglass')).toBe(3);
  });

  it('zwei Halter sind unabhängig — kein Modul-Singleton', () => {
    // Dieselbe Begründung wie bei `createViewState`: die App-Wurzel erzeugt genau eine
    // Instanz, Komponententests bekommen eine frische.
    const a = createTreeViewState();
    const b = createTreeViewState();

    a.setGenerations('fan', 4);

    expect(b.generationsFor('fan')).toBeNull();
  });
});
