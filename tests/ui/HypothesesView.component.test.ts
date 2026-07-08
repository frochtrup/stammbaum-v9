// @vitest-environment happy-dom
// tests/ui/HypothesesView.component.test.ts — globaler Hypothesen-Tab (Spec 12 §4,
// Spec 20 §1.11 [S]). Deckt Filter, Hinzufügen (inkl. Evidenz-Zeile, INV-H2),
// Bearbeiten/Löschen (id-adressiert) ab. KEIN MD-Export (Spec verlangt es hier nicht).
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import HypothesesView from '../../ui/views/hypotheses/HypothesesView.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
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

describe('HypothesesView — Liste + Filter', () => {
  it('zeigt die Hypothese standardmäßig (Filter "Alle")', () => {
    renderView(seedDb());
    expect(screen.getByText('Otto ist identisch mit dem Otto aus Nachbarort')).toBeTruthy();
  });

  it('Filter "Bestätigt" blendet eine offene Hypothese aus', async () => {
    renderView(seedDb());
    await fireEvent.click(screen.getByRole('button', { name: 'Bestätigt' }));
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

  it('löscht eine Hypothese über den ×-Button', async () => {
    const { appState } = renderView(seedDb());
    await fireEvent.click(screen.getByLabelText('Hypothese löschen'));
    expect(appState.db.individuals.get('@I1@')!.hypotheses).toHaveLength(0);
  });
});

describe('HypothesesView — Klick-Navigation zur Trägerentität', () => {
  it('Klick auf den Trägerentität-Link ruft den passenden onNavigate-Callback auf', async () => {
    const { onNavigateToPerson } = renderView(seedDb());
    await fireEvent.click(screen.getByText(/Otto Bauer ›/));
    expect(onNavigateToPerson).toHaveBeenCalledWith('@I1@');
  });
});
