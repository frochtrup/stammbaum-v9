// @vitest-environment happy-dom
// tests/ui/HypothesesView.component.test.ts — globaler Hypothesen-Tab (Spec 12 §4,
// Spec 20 §1.11 [S]). Deckt Filter, Hinzufügen (inkl. Evidenz-Zeile, INV-H2),
// Bearbeiten/Löschen (id-adressiert) ab. KEIN MD-Export (Spec verlangt es hier nicht).
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { bestaetige } from './confirm-helper';
import HypothesesView from '../../ui/views/hypotheses/HypothesesView.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createHypothesesViewState } from '../../ui/views/research-segment-state.svelte';
import { makeDatabase, makePerson, makeSource } from '../../core/model';

function seedDb() {
  const db = makeDatabase();
  const p1 = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
  p1.hypotheses.push({
    id: 'h1',
    created: '2026-01-01',
    text: 'Otto ist identisch mit dem Otto aus Nachbarort',
    status: 'open',
    weight: 'medium',
    kind: 'free',
    refs: [],
    evidence: [],
    rationale: '',
    conclusion: '',
  });
  db.individuals.set('@I1@', p1);
  const p2 = makePerson('@I2@', { given: 'Anna', surname: 'Klein' });
  db.individuals.set('@I2@', p2);
  db.sources.set('@S1@', makeSource('@S1@', { title: 'Kirchenbuch Musterstadt' }));
  return db;
}

function renderView(db: ReturnType<typeof makeDatabase>) {
  const appState = createAppState();
  appState.loadDatabase(db, 'test.ged');
  const onNavigateToPerson = vi.fn();
  const onNavigateToFamily = vi.fn();
  const utils = render(HypothesesView, { props: { appState, onNavigateToPerson, onNavigateToFamily } });
  return { ...utils, appState, onNavigateToPerson, onNavigateToFamily };
}

/** Filter-Panel öffnen — seit dem INV-UI-11-Retrofit (Spec 21 §6h) liegt die Auswahl
 *  dahinter statt als Dauer-Pillenreihe in der Toolbar. */
async function openFilters() {
  await fireEvent.click(screen.getByRole('button', { name: /^Filter/ }));
}

async function setFilter(label: string) {
  await openFilters();
  await fireEvent.click(screen.getByLabelText(label));
}

describe('HypothesesView — Liste + Filter', () => {
  it('zeigt die Hypothese standardmäßig (Filter "Alle")', () => {
    renderView(seedDb());
    expect(screen.getByText('Otto ist identisch mit dem Otto aus Nachbarort')).toBeTruthy();
  });

  it('Filter "Bestätigt" blendet eine offene Hypothese aus', async () => {
    renderView(seedDb());
    await setFilter('Bestätigt');
    expect(screen.queryByText('Otto ist identisch mit dem Otto aus Nachbarort')).toBeNull();
  });

  it('leerer Zustand ohne Hypothesen zeigt keine Datenzeile', () => {
    renderView(makeDatabase());
    expect(screen.queryByText(/identisch/)).toBeNull();
  });
});

describe('HypothesesView — Hypothese hinzufügen (inkl. Evidenz)', () => {
  it('legt eine neue Hypothese an einer Person an', async () => {
    const { appState } = renderView(seedDb());
    await fireEvent.click(screen.getByRole('button', { name: '+ Hypothese' }));

    await fireEvent.input(screen.getByPlaceholderText('Was wird vermutet?'), { target: { value: 'Neue Vermutung' } });

    await fireEvent.click(screen.getByLabelText('Ziel-Person'));
    await fireEvent.click(screen.getByText('Otto Bauer'));

    await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    const allTexts = [...appState.db.individuals.values()].flatMap((p) => p.hypotheses.map((h) => h.text));
    expect(allTexts).toContain('Neue Vermutung');
  });

  it('fügt eine Evidenz-Zeile hinzu (SID-Referenz, INV-H2) und speichert sie mit', async () => {
    const { appState } = renderView(seedDb());
    await fireEvent.click(screen.getByRole('button', { name: '+ Hypothese' }));
    await fireEvent.input(screen.getByPlaceholderText('Was wird vermutet?'), { target: { value: 'Mit Beleg' } });

    await fireEvent.click(screen.getByRole('button', { name: '+ Beleg hinzufügen' }));
    await fireEvent.click(screen.getByLabelText('Evidenz-Quelle 1'));
    await fireEvent.click(screen.getByText('Kirchenbuch Musterstadt'));
    await fireEvent.change(screen.getByLabelText('Evidenz-Seite 1'), { target: { value: 'S. 12' } });

    await fireEvent.click(screen.getByLabelText('Ziel-Person'));
    await fireEvent.click(screen.getByText('Otto Bauer'));
    await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    const saved = [...appState.db.individuals.values()].flatMap((p) => p.hypotheses).find((h) => h.text === 'Mit Beleg')!;
    expect(saved.evidence).toEqual([{ sourceId: '@S1@', page: 'S. 12' }]);
  });

  it('Abbrechen schließt das Formular ohne Hypothese anzulegen', async () => {
    const { appState } = renderView(seedDb());
    const before = appState.db.individuals.get('@I1@')!.hypotheses.length;
    await fireEvent.click(screen.getByRole('button', { name: '+ Hypothese' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));

    expect(screen.queryByPlaceholderText('Was wird vermutet?')).toBeNull();
    expect(appState.db.individuals.get('@I1@')!.hypotheses.length).toBe(before);
  });
});

describe('HypothesesView — Bearbeiten/Löschen', () => {
  it('bearbeitet eine bestehende Hypothese (Status-Wechsel)', async () => {
    const { appState } = renderView(seedDb());
    await fireEvent.click(screen.getByLabelText('Hypothese bearbeiten'));

    await fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'confirmed' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(appState.db.individuals.get('@I1@')!.hypotheses[0]!.status).toBe('confirmed');
  });

  it('löscht eine Hypothese über den 🗑-Knopf — nach bestätigter Rückfrage (BL-351)', async () => {
    const { appState } = renderView(seedDb());
    await fireEvent.click(screen.getByLabelText('Hypothese löschen'));
    expect(appState.db.individuals.get('@I1@')!.hypotheses, 'erst fragen').toHaveLength(1);

    await bestaetige();
    expect(appState.db.individuals.get('@I1@')!.hypotheses).toHaveLength(0);
  });
});

describe('HypothesesView — Konfidenz als getöntes Label (BL-208, ADR-v9-157)', () => {
  it('trägt eine Ton-Klasse je Konfidenzstufe (low/medium/high) und zeigt weiterhin den Textwert', () => {
    const db = makeDatabase();
    const weights = ['low', 'medium', 'high'] as const;
    weights.forEach((weight, i) => {
      const p = makePerson(`@I${i}@`, { given: `P${i}`, surname: 'Test' });
      p.hypotheses.push({
        id: `h${i}`,
        created: '2026-01-01',
        text: `Hypothese ${weight}`,
        status: 'open',
        weight,
        kind: 'free',
        refs: [],
        evidence: [],
        rationale: '',
        conclusion: '',
      });
      db.individuals.set(`@I${i}@`, p);
    });

    const { container } = renderView(db);
    for (const weight of weights) {
      const label = container.querySelector(`.stb-tone-label--${weight}`);
      expect(label, `Ton-Klasse für ${weight} fehlt`).toBeTruthy();
    }

    // NICHT die QuayMeter-Pip-Optik (INV-H1: Forscher-Konfidenz != Quellen-Beweiskraft).
    expect(container.querySelector('.quay-meter')).toBeNull();

    expect(screen.getByText('Niedrig')).toBeTruthy();
    expect(screen.getByText('Mittel')).toBeTruthy();
    expect(screen.getByText('Hoch')).toBeTruthy();
  });
});

describe('HypothesesView — Klick-Navigation zur Trägerentität', () => {
  it('Klick auf den Trägerentität-Link ruft den passenden onNavigate-Callback auf', async () => {
    const { onNavigateToPerson } = renderView(seedDb());
    await fireEvent.click(screen.getByText(/Otto Bauer ›/));
    expect(onNavigateToPerson).toHaveBeenCalledWith('@I1@');
  });
});

// ---------------------------------------------------------------------------------------
// BL-320: der Status-Filter überlebt das Wegnavigieren (Spec 21 §5).
describe('HypothesesView — der Filter überlebt das Wegnavigieren (BL-320)', () => {
  it('kommt mit dem gesetzten Status-Filter zurück, nicht auf „Alle"', async () => {
    const hypotheses = createHypothesesViewState();
    const appState = createAppState();
    appState.loadDatabase(seedDb(), 'test.ged');
    const props = { appState, hypotheses, onNavigateToPerson: vi.fn(), onNavigateToFamily: vi.fn() };

    const first = render(HypothesesView, { props });
    await fireEvent.click(screen.getByRole('button', { name: /^Filter/ }));
    await fireEvent.click(screen.getByLabelText('Bestätigt'));
    expect(screen.getByRole('button', { name: /^Filter · 1/ })).toBeTruthy();
    first.unmount();

    render(HypothesesView, { props: { ...props } });

    expect(screen.getByRole('button', { name: /^Filter · 1/ })).toBeTruthy();
  });
});
