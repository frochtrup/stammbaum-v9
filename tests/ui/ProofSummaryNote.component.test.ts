// @vitest-environment happy-dom
// tests/ui/ProofSummaryNote.component.test.ts — Beweisführungsnotiz (Spec 20 §1.11e,
// BL-61): rein lesende Disclosure aus Zitaten + Hypothesen einer Person.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { makePerson, makeCitation } from '../../core/model/index';
import { makeHypothesis } from '../../core/research/index';
import ProofSummaryNote from '../../ui/views/person/ProofSummaryNote.svelte';

function personWith() {
  const p = makePerson('@I1@', { given: 'Anna', surname: 'Muster' });
  p.hypotheses.push(makeHypothesis('h1', { status: 'confirmed', text: 'Vater ist Johann', conclusion: 'Durch Taufeintrag belegt' }));
  p.hypotheses.push(makeHypothesis('h2', { status: 'open', text: 'Geburtsort Ochtrup?', rationale: 'Indirekte Hinweise' }));
  p.topLevelCitations.push(makeCitation('@S1@', { quay: 3 }));
  return p;
}

describe('ProofSummaryNote', () => {
  it('zeigt den Reife-Indikator und die Quellenlage', () => {
    render(ProofSummaryNote, { props: { person: personWith() } });
    // 1 von 2 Hypothesen aufgelöst → 50 %.
    expect(screen.getByText('50 % aufgelöst')).toBeTruthy();
    expect(screen.getByText(/1 Zitat/)).toBeTruthy();
  });

  it('rendert nur die nicht-leeren Blöcke (bestätigt + offen, nicht verworfen)', () => {
    render(ProofSummaryNote, { props: { person: personWith() } });
    expect(screen.getByText('Bestätigte Schlüsse')).toBeTruthy();
    expect(screen.getByText('Offene Fragen')).toBeTruthy();
    expect(screen.queryByText('Verworfene Annahmen')).toBeNull();
    expect(screen.getByText('Vater ist Johann')).toBeTruthy();
    expect(screen.getByText('Durch Taufeintrag belegt')).toBeTruthy();
  });
});
