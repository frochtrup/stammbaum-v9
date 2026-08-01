// tests/core/identity-exclusion.test.ts — Dublettenausschluss als abgelehnte
// Identitäts-Hypothese (Spec 12 §4, Spec 20 §1.12, ADR-v9-174, BL-240).
//
// Verriegelt drei Dinge, die je für sich still kippen könnten:
//   1. INV-H3 — `identity` ohne refs oder ohne Begründung ist kein gültiger Ausschluss.
//   2. Die Art der Behauptung entscheidet, NICHT der Status: eine abgelehnte FREIE
//      Hypothese über dieselben zwei Personen darf kein Paar unterdrücken (genau der
//      stille Fehlschluss, gegen den `kind` eingeführt wurde, ADR-v9-174 Punkt 2).
//   3. Einseitig geschrieben, beidseitig gelesen — der Finder darf nicht davon abhängen,
//      an welcher der beiden Personen der Befund hängt.
import { describe, it, expect } from 'vitest';
import { makeHypothesis } from '../../core/research/index';
import { makePerson, makeFamily } from '../../core/model/index';
import {
  isIdentityExclusion,
  collectIdentityExclusions,
  pairKey,
  findPersonDuplicates,
} from '../../core/dedup/index';
import type { PersonGraph } from '../../core/dedup/index';

function graphOf(persons: ReturnType<typeof makePerson>[]): PersonGraph {
  return {
    individuals: new Map(persons.map((p) => [p.id, p])),
    families: new Map(),
  };
}

/** Zwei Personen, die der Finder ohne Ausschluss sicher als Paar meldet. */
function twins(): ReturnType<typeof makePerson>[] {
  const a = makePerson('@I1@');
  a.name = 'Johann /Meyer/';
  a.given = 'Johann';
  a.surname = 'Meyer';
  a.sex = 'M';
  a.birth.date = '1750';
  a.birth.seen = true;
  const b = makePerson('@I7@');
  b.name = 'Johann /Meyer/';
  b.given = 'Johann';
  b.surname = 'Meyer';
  b.sex = 'M';
  b.birth.date = '1750';
  b.birth.seen = true;
  return [a, b];
}

const EXCLUSION = {
  kind: 'identity' as const,
  status: 'rejected' as const,
  refs: ['@I7@'],
  rationale: 'Verschiedene Eltern, Taufbuch 1750 vs. 1762.',
};

describe('INV-H3: ein Identitäts-Befund braucht Bezug und Begründung', () => {
  it('erkennt den vollständigen Ausschluss', () => {
    expect(isIdentityExclusion(makeHypothesis('h1', EXCLUSION))).toBe(true);
  });

  it('ohne refs ist es kein Ausschluss — der Bezug ist die halbe Aussage', () => {
    const h = makeHypothesis('h1', { ...EXCLUSION, refs: [] });
    expect(isIdentityExclusion(h)).toBe(false);
  });

  it('ohne Begründung ist es eine Abweisung, kein Befund', () => {
    const h = makeHypothesis('h1', { ...EXCLUSION, rationale: '   ' });
    expect(isIdentityExclusion(h)).toBe(false);
  });

  it('offen oder bestätigt ist kein Ausschluss — nur `rejected` blendet aus', () => {
    for (const status of ['open', 'confirmed'] as const) {
      expect(isIdentityExclusion(makeHypothesis('h1', { ...EXCLUSION, status }))).toBe(false);
    }
  });
});

describe('collectIdentityExclusions', () => {
  it('liefert den Paar-Schlüssel, egal an welcher Seite der Befund hängt', () => {
    const [a, b] = twins();
    a.hypotheses = [makeHypothesis('h1', EXCLUSION)];
    expect(collectIdentityExclusions(graphOf([a, b]))).toEqual(new Set([pairKey('@I1@', '@I7@')]));

    const [c, d] = twins();
    d.hypotheses = [makeHypothesis('h1', { ...EXCLUSION, refs: ['@I1@'] })];
    expect(collectIdentityExclusions(graphOf([c, d]))).toEqual(new Set([pairKey('@I1@', '@I7@')]));
  });

  it('eine ABGELEHNTE FREIE Hypothese über dieselben zwei unterdrückt nichts', () => {
    const [a, b] = twins();
    // „A ist NICHT der Vater von B" — abgelehnt, mit Bezug und Begründung, aber keine
    // Identitäts-Aussage. Ohne `kind` läse ein Filter genau das als Dublettenausschluss.
    a.hypotheses = [makeHypothesis('h1', { ...EXCLUSION, kind: 'free' })];
    expect(collectIdentityExclusions(graphOf([a, b])).size).toBe(0);
  });

  it('liest auch Familien-Hypothesen (beide Träger führen `hypotheses[]`)', () => {
    const fam = makeFamily('@F1@');
    fam.hypotheses = [makeHypothesis('h1', { ...EXCLUSION, refs: ['@F2@'] })];
    const graph: PersonGraph = { individuals: new Map(), families: new Map([[fam.id, fam]]) };
    expect(collectIdentityExclusions(graph)).toEqual(new Set([pairKey('@F1@', '@F2@')]));
  });

  it('mehrere refs erzeugen je einen Schlüssel', () => {
    const [a, b] = twins();
    a.hypotheses = [makeHypothesis('h1', { ...EXCLUSION, refs: ['@I7@', '@I9@'] })];
    expect(collectIdentityExclusions(graphOf([a, b]))).toEqual(
      new Set([pairKey('@I1@', '@I7@'), pairKey('@I1@', '@I9@')]),
    );
  });
});

describe('der Finder blendet ausgeschlossene Paare aus', () => {
  it('meldet das Paar ohne Befund und schweigt mit Befund — von beiden Seiten', () => {
    const pair = twins();
    expect(findPersonDuplicates(graphOf(pair), 65).length).toBe(1);

    const [a, b] = twins();
    a.hypotheses = [makeHypothesis('h1', EXCLUSION)];
    const g = graphOf([a, b]);
    expect(findPersonDuplicates(g, 65, collectIdentityExclusions(g)).length).toBe(0);

    const [c, d] = twins();
    d.hypotheses = [makeHypothesis('h1', { ...EXCLUSION, refs: ['@I1@'] })];
    const g2 = graphOf([c, d]);
    expect(findPersonDuplicates(g2, 65, collectIdentityExclusions(g2)).length).toBe(0);
  });
});
