// @vitest-environment happy-dom
// tests/ui/BranchMaturitySection.component.test.ts — Ast-Reifegrad-Sektion
// (Spec 20 §1.11g „Ast-Reifegrad", ADR-v9-167, BL-231).
//
// Die Ast-Berechnung selbst ist in tests/core/research-branches.test.ts abgedeckt; hier
// geht es um das, was nur im DOM sichtbar wird: Ebenenwechsel ändert die Balkenzahl,
// Klick auf einen Ast meldet die Auswahl nach oben (scoped die Brennpunkte der
// aufrufenden QualityDashboard), und ein Projekt-Schnitt, der einen Ast leer macht,
// zeigt „—" statt den Ast auszublenden.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import BranchMaturitySection from '../../ui/views/quality/BranchMaturitySection.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { runValidation, defaultConfig, type Finding } from '../../core/validate/index';
import { makeDatabase, makePerson } from '../../core/model';
import { buildFourGenTree } from '../islands/tree-fixtures';
import { ancestorBranches } from '../../core/research/index';
import { resolveProband } from '../../ui/shell/proband';

function renderView(opts: { projectScope?: ReadonlySet<string> | null } = {}) {
  const db = buildFourGenTree();
  // I2 (Vater, Ebene-2-Wurzel) bekommt einen echten Validierungsfehler (Sterbejahr vor
  // Geburtsjahr) — damit die Ast-Bar einen Score < 100 % zeigt statt nur Nullen.
  const vater = db.individuals.get('I2')!;
  vater.birth.date = '1900';
  vater.death.date = '1880';

  const appState = createAppState();
  appState.loadDatabase(db, 'test.ged');
  const viewState = createViewState();
  viewState.setProband('I1');

  const findings: Finding[] = runValidation(db, defaultConfig());
  const onSelectBranch = vi.fn();
  const utils = render(BranchMaturitySection, {
    props: {
      appState,
      viewState,
      findings,
      projectScope: opts.projectScope ?? null,
      onSelectBranch,
    },
  });
  return { ...utils, appState, viewState, findings, onSelectBranch };
}

describe('BranchMaturitySection — Grundform', () => {
  it('zeigt standardmäßig Ebene 3 (Großeltern, 4 Äste)', () => {
    renderView();
    expect(screen.getByRole('combobox', { name: /Ebene/ }).textContent).toContain('Ebene 3');
    // 4 Ast-Zeilen + 1 Restzeile (ADR-v9-167 Pkt 4, s. eigene describe-Gruppe unten).
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(rows.filter((r) => !/Übrige/.test(r.textContent ?? ''))).toHaveLength(4);
  });

  it('zeigt die Wurzel-Namen als Teil des Ast-Labels', () => {
    renderView();
    // Ebene 3 -> Großeltern; I4/I5/I6/I7 sind die Wurzeln (buildFourGenTree).
    expect(screen.getByText(/Großvater vv/)).toBeTruthy();
    expect(screen.getByText(/Großmutter mv/)).toBeTruthy();
  });
});

describe('BranchMaturitySection — Ebenenwechsel ändert die Balkenzahl', () => {
  it('Ebene 2 (Eltern) -> 2 Balken; Ebene 4 (Urgroßeltern) -> 8 Balken', async () => {
    renderView();
    const select = screen.getByRole('combobox', { name: /Ebene/ });

    // Gezählt werden die AST-Zeilen; die Restzeile (ADR-v9-167 Pkt 4) kommt jeweils
    // hinzu und ist unten in ihrer eigenen describe-Gruppe zugesichert.
    const aeste = () =>
      screen.getAllByRole('listitem').filter((r) => !/Übrige/.test(r.textContent ?? ''));

    await fireEvent.change(select, { target: { value: '2' } });
    expect(aeste()).toHaveLength(2);

    await fireEvent.change(select, { target: { value: '4' } });
    expect(aeste()).toHaveLength(8);
  });

  it('ein Ebenenwechsel hebt eine bestehende Ast-Auswahl auf (meldet null nach oben)', async () => {
    const { onSelectBranch } = renderView();
    const firstRow = screen.getAllByRole('button', { name: /Vater|Mutter|Großvater|Großmutter/ })[0];
    await fireEvent.click(firstRow);
    expect(onSelectBranch).toHaveBeenLastCalledWith(expect.objectContaining({ label: expect.any(String) }));

    const select = screen.getByRole('combobox', { name: /Ebene/ });
    await fireEvent.change(select, { target: { value: '2' } });
    expect(onSelectBranch).toHaveBeenLastCalledWith(null);
  });
});

describe('BranchMaturitySection — Klick scoped nach oben, erneuter Klick hebt auf', () => {
  it('Klick auf einen Ast meldet Label + Personenmenge der Wurzel; erneuter Klick meldet null', async () => {
    const { onSelectBranch } = renderView();
    // Auf Ebene 2 (Eltern) wechseln — dort sind die Wurzeln I2/I3 selbst (klarere
    // Vater-/Mutter-Zuordnung als die Großeltern-Wurzeln der Vorgabe-Ebene 3).
    await fireEvent.change(screen.getByRole('combobox', { name: /Ebene/ }), { target: { value: '2' } });
    onSelectBranch.mockClear(); // der Ebenenwechsel selbst meldet bereits einmal `null`
    const vaterRow = screen.getByRole('button', { name: /Vater Testperson/ });

    await fireEvent.click(vaterRow);
    expect(onSelectBranch).toHaveBeenCalledTimes(1);
    const [selection] = onSelectBranch.mock.calls[0];
    expect(selection.label).toContain('Vater Testperson');
    // Vater-Ast (I2) + seine Elternhülle (I4/I5/I8..I11, Ebene 3 -> Vorfahren bis Ebene 3
    // sind Großeltern; Ast selbst geht aber unbegrenzt hoch bis Urgroßeltern I8/I9/I10/I11).
    expect(selection.personIds.has('I2')).toBe(true);
    expect(selection.personIds.has('I4')).toBe(true);
    expect(selection.personIds.has('I3')).toBe(false); // Mutter-Ast, nicht im Vater-Ast

    await fireEvent.click(vaterRow);
    expect(onSelectBranch).toHaveBeenLastCalledWith(null);
  });

  it('Klick auf einen ZWEITEN Ast wechselt die Auswahl direkt (kein doppelter Klick nötig)', async () => {
    const { onSelectBranch } = renderView();
    await fireEvent.change(screen.getByRole('combobox', { name: /Ebene/ }), { target: { value: '2' } });
    onSelectBranch.mockClear();
    await fireEvent.click(screen.getByRole('button', { name: /Vater Testperson/ }));
    await fireEvent.click(screen.getByRole('button', { name: /Mutter Testperson/ }));
    expect(onSelectBranch).toHaveBeenCalledTimes(2);
    const [selection] = onSelectBranch.mock.calls[1];
    expect(selection.label).toContain('Mutter Testperson');
  });
});

describe('BranchMaturitySection — Projekt-Schnitt (UND), leerer Ast zeigt "—"', () => {
  it('ein Projekt-Scope ohne Schnittmenge zu einem Ast zeigt "—" statt den Ast zu verstecken', () => {
    // Vorgabe-Ebene 3 (Großeltern): Wurzeln I4/I5 (väterlicherseits) und I6/I7
    // (mütterlicherseits). Der Projekt-Scope enthält nur die Mutter-Linie (I6/I7/I12..I15)
    // -> die Väter-Äste (I4/I5) haben keine Schnittmenge und müssen trotzdem als Zeile
    // bestehen bleiben (ADR-v9-167 Punkt 5), nur mit "—" statt einem Prozentwert.
    const projectScope = new Set(['I6', 'I7', 'I12', 'I13', 'I14', 'I15']);
    renderView({ projectScope });
    // 4 Ast-Zeilen + 1 Restzeile (ADR-v9-167 Pkt 4, s. eigene describe-Gruppe unten).
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(rows.filter((r) => !/Übrige/.test(r.textContent ?? ''))).toHaveLength(4); // weiterhin 4 Äste, keiner verschwindet
    const vaterRow = screen.getByRole('button', { name: /Großvater vv/ });
    expect(within(vaterRow).getByText('—')).toBeTruthy();
    // Die Mutter-Äste (im Scope) zeigen weiterhin einen echten Prozentwert.
    const mutterRow = screen.getByRole('button', { name: /Großvater mv/ });
    expect(within(mutterRow).queryByText('—')).toBeNull();
  });
});

describe('BranchMaturitySection — Leerzustände', () => {
  it('ohne auflösbaren Probanden (leere Datenbank): Hinweistext statt Balkenwüste', () => {
    const appState = createAppState();
    const viewState = createViewState();
    render(BranchMaturitySection, {
      props: { appState, viewState, findings: [], projectScope: null, onSelectBranch: vi.fn() },
    });
    expect(screen.getByText(/Kein Proband auflösbar/)).toBeTruthy();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('Proband ohne jede bekannte Vorfahrenlinie: Hinweistext statt leerer Balken', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.individuals.set('X1', makePerson('X1', { given: 'Einzelperson', name: 'Einzelperson' }));
    appState.loadDatabase(db, 'x.ged');
    const viewState = createViewState();
    viewState.setProband('X1');
    render(BranchMaturitySection, {
      props: { appState, viewState, findings: [], projectScope: null, onSelectBranch: vi.fn() },
    });
    expect(screen.getByText(/Keine bekannten Vorfahren/)).toBeTruthy();
  });
});

// ADR-v9-167 Punkt 4: „Personen außerhalb aller Äste (Nachkommen, Seitenlinien,
// Unverbundene) erscheinen als EINE zusammengefasste Restzeile. Eine Ansicht, die nur
// Äste zeigt, behauptete sonst eine Vollständigkeit, die sie nicht hat." Der Kern liefert
// die Menge als `rest`; sie muss auch sichtbar werden — sonst summieren sich die Balken
// stillschweigend auf weniger als den Bestand.
describe('BranchMaturitySection — Restzeile (ADR-v9-167 Pkt 4)', () => {
  const REST = /Übrige/;

  it('zeigt zusätzlich zu den vier Ästen eine Restzeile', () => {
    renderView();
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByText(REST)).toBeTruthy();
  });

  it('die Restzeile zählt genau das Komplement der Astmengen', () => {
    const { appState, viewState } = renderView();
    const gesamt = appState.db.individuals.size;
    // Dieselbe Proband-Auflösung wie die Ansicht (ADR-v9-140) — NICHT ein zweiter Weg:
    // ein direkter Zugriff auf den ViewState-Slot lieferte hier stumm eine leere Astmenge
    // und hätte die Zusicherung wertlos gemacht.
    const inAesten = new Set<string>();
    for (const b of ancestorBranches(appState.db, resolveProband(appState.db, viewState)!, 3).branches)
      for (const id of b.personIds) inAesten.add(id);
    expect(inAesten.size).toBeGreaterThan(0);

    const zeile = screen.getByText(REST).closest('button')!;
    expect(within(zeile).getByText(new RegExp(`· ${gesamt - inAesten.size}\\b`))).toBeTruthy();
  });

  it('ein Klick auf die Restzeile scoped die Brennpunkte wie ein Ast', async () => {
    const { onSelectBranch } = renderView();
    await fireEvent.click(screen.getByText(REST).closest('button')!);
    expect(onSelectBranch).toHaveBeenCalledTimes(1);
    const arg = onSelectBranch.mock.calls[0][0];
    expect(arg.label).toMatch(REST);
    expect(arg.personIds.size).toBeGreaterThan(0);
  });

  it('ein Projekt-Scope schneidet auch die Restzeile (UND) und ergibt dann „—"', () => {
    // Scope enthält NUR eine Ahnenperson — die Restmenge wird dadurch leer.
    renderView({ projectScope: new Set(['I4']) });
    const zeile = screen.getByText(REST).closest('button')!;
    expect(within(zeile).getByText('—')).toBeTruthy();
  });
});
