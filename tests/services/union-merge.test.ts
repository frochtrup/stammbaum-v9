// tests/services/union-merge.test.ts — der EINE Drei-Wege-Union-Merge (Spec 30 §4 LP-9,
// services/union-merge.ts).
//
// Die Funktion war bis BL-239 privat in `places-sync-service.ts` und nur mittelbar über
// die orte.json-Tests abgedeckt. Seit sie eine ZWEITE Sammlung bedient (die Projekte im
// B1-Bündel), gehört ihr Vertrag direkt geprüft — sonst hinge die neue Nutzung an Tests,
// die von Orten sprechen.
import { describe, expect, it } from 'vitest';
import { toList, toMap, unionMerge } from '../../services/union-merge';

interface Ding {
  id: string;
  wert: string;
}

const d = (id: string, wert: string): Ding => ({ id, wert });

function merge(local: Ding[], remote: Ding[], base: Ding[]) {
  const r = unionMerge(toMap(local), toMap(remote), toMap(base));
  return { ids: toList(r.merged).map((x) => x.id).sort(), werte: toList(r.merged), conflicts: r.conflictIds };
}

describe('unionMerge', () => {
  it('beide Seiten behalten, was die andere nicht hat', () => {
    const r = merge([d('a', '1')], [d('b', '1')], []);
    expect(r.ids).toEqual(['a', 'b']);
    expect(r.conflicts).toEqual([]);
  });

  it('nur lokal geändert → lokale Fassung gewinnt, kein Konflikt', () => {
    const r = merge([d('a', 'neu')], [d('a', 'alt')], [d('a', 'alt')]);
    expect(r.werte).toEqual([d('a', 'neu')]);
    expect(r.conflicts).toEqual([]);
  });

  it('nur entfernt geändert → deren Fassung gewinnt, kein Konflikt', () => {
    const r = merge([d('a', 'alt')], [d('a', 'neu')], [d('a', 'alt')]);
    expect(r.werte).toEqual([d('a', 'neu')]);
    expect(r.conflicts).toEqual([]);
  });

  it('beide geändert → lokal gewinnt, aber die Id wird gemeldet', () => {
    const r = merge([d('a', 'hier')], [d('a', 'dort')], [d('a', 'basis')]);
    expect(r.werte).toEqual([d('a', 'hier')]);
    expect(r.conflicts).toEqual(['a']);
  });

  it('ohne gemeinsamen Vorfahren ist jede Abweichung ein Konflikt', () => {
    const r = merge([d('a', 'hier')], [d('a', 'dort')], []);
    expect(r.conflicts).toEqual(['a']);
  });

  it('identischer Inhalt auf beiden Seiten ist kein Konflikt', () => {
    expect(merge([d('a', 'x')], [d('a', 'x')], []).conflicts).toEqual([]);
  });

  it('BEWUSSTE GRENZE: eine lokale Löschung setzt sich nicht durch (kein Tombstone)', () => {
    // Dokumentiert, nicht bedauert: „Union" heißt genau das. Der Nutzer löscht zweimal.
    expect(merge([], [d('a', 'x')], [d('a', 'x')]).ids).toEqual(['a']);
  });
});
