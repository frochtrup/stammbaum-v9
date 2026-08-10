// @vitest-environment happy-dom
// tests/ui/FocusPersonList.component.test.ts — die Brennpunkte-Liste rendert auch dann,
// wenn eine Person ZWEI gleichlautende Befunde trägt (Nutzer-Befund 2026-08-10).
//
// DER FALL, DER DAS AUSGELÖST HAT. Die Zeilen-Schleife über die Befunde einer Person war
// mit `(f.rule + f.text)` gekeyt. Solange jede Regel höchstens EINEN Befund je Person
// liefert, ist das eindeutig — `PLAC_EBENE_UNBEKANNT` liefert aber einen je EREIGNIS, und
// zwei Ereignisse derselben Person tragen oft denselben Ortstext (Geburt und Tod am selben
// Ort). Der Key kollidierte, Svelte brach den `{:else}`-Zweig ab, und die Fläche zeigte
// die Überschrift mit der richtigen Zahl über einem „keine Einträge"-Text.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FocusPersonList from '../../ui/views/quality/FocusPersonList.svelte';
import type { Finding, FocusRow } from '../../core/validate/index';

function befund(text: string): Finding {
  return {
    rule: 'PLAC_EBENE_UNBEKANNT',
    severity: 'info',
    text,
    category: 'online',
    personId: '@I1@',
    familyId: null,
    placeId: null,
    hofId: null,
  };
}

const zeile = (findings: Finding[]): FocusRow => ({
  personId: '@I1@',
  label: 'Test Person',
  life: '1900–1980',
  findings,
  dot: 'info',
});

const props = (rows: FocusRow[]) => ({
  rows,
  focusFilter: 'all' as const,
  onPromote: () => {},
  onPromoteAll: () => {},
  countOf: () => rows[0]?.findings.length ?? 0,
});

describe('FocusPersonList', () => {
  it('rendert eine Person mit ZWEI gleichlautenden Befunden (Key-Kollision)', () => {
    const doppelt = [befund('Ortsangabe „Halle-Süd" nennt eine Ebene …'), befund('Ortsangabe „Halle-Süd" nennt eine Ebene …')];

    render(FocusPersonList, { props: props([zeile(doppelt)]) });

    expect(screen.getByText('Brennpunkte').textContent).toContain('(1)');
    expect(screen.getByText('Test Person')).toBeTruthy();
    // Beide Befundzeilen stehen da — die zweite ist keine Dublette, sondern ein zweites
    // Ereignis mit demselben Text.
    expect(screen.getAllByText('Ortsangabe „Halle-Süd" nennt eine Ebene …')).toHaveLength(2);
    expect(screen.queryByText(/Keine Personen mit/)).toBeNull();
  });

  it('zeigt den Leerzustand nur, wenn es wirklich keine Zeilen gibt', () => {
    render(FocusPersonList, { props: props([]) });

    expect(screen.getByText(/Keine Personen mit Befunden/)).toBeTruthy();
    expect(screen.getByText('Brennpunkte').textContent).not.toContain('(');
  });
});
