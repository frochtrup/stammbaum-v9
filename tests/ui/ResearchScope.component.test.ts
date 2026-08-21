// @vitest-environment happy-dom
// tests/ui/ResearchScope.component.test.ts — die Verwandtschafts-Relevanz (BL-375) und die
// Suche der Forschungs-Segmente (BL-374), Spec 20 §1.11 a/b/d/i.
//
// WARUM AN DER NAHT und nicht je Fläche: die Achse wird auf der Umbrella-Ebene gestellt
// und muss in JEDEM Segment ankommen. Genau diese Naht ist die Stelle, an der zwei für
// sich richtige Hälften vorbeireden können (CLAUDE.md, Lehre 2026-07-14) — ein Test je
// Segment mit selbst gestelltem `allowed` hätte sie nicht berührt. Deshalb geht dieser
// Test über `ResearchTab`, stellt die Achse über ihr echtes Bedienelement und sieht in
// den Segmenten nach.
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ResearchTab from '../../ui/views/ResearchTab.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createRoute } from '../../ui/shell/route.svelte';
import { createProjectsState } from '../../ui/shell/projects-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { createResearchScopeState } from '../../ui/views/research-segment-state.svelte';
import { pinLayout } from './layout-harness';
import { layout } from '../../ui/shell/layout.svelte';
import { makeDatabase, makePerson, makeFamily } from '../../core/model';
import { makeTask } from '../../core/research/index';

const mkProjects = () => createProjectsState({ load: async () => [], save: async () => {} });

function link(familyId: string) {
  return {
    familyId,
    pedigree: '' as const,
    fatherRel: '',
    motherRel: '',
    fatherRelSeen: false,
    motherRelSeen: false,
    citations: [],
  };
}

/**
 * Drei Personen, drei Aufgaben — je eine pro Stufe, damit jede Zusicherung eine Zeile
 * verlieren UND eine behalten kann:
 *   @I1@ Proband (Aufgabe „Taufeintrag prüfen")
 *   @I2@ Vater, Vorfahr  (Aufgabe „Sterbeurkunde anfordern")
 *   @I9@ Fremder, außerhalb des Kernbaums (Aufgabe „Herkunft klären")
 */
function seed() {
  const appState = createAppState();
  const db = makeDatabase();
  db.families.set('@F1@', makeFamily('@F1@', { husband: '@I2@', children: ['@I1@'] }));
  const proband = makePerson('@I1@', { given: 'Anna', surname: 'Decker', childOf: [link('@F1@')] });
  proband.tasks.push(makeTask('t1', { text: 'Taufeintrag prüfen', created: '2026-01-01' }));
  const vater = makePerson('@I2@', { given: 'Bernd', surname: 'Decker', parentIn: ['@F1@'] });
  vater.tasks.push(makeTask('t2', { text: 'Sterbeurkunde anfordern', created: '2026-01-01' }));
  const fremder = makePerson('@I9@', { given: 'Clara', surname: 'Fremd' });
  fremder.tasks.push(makeTask('t3', { text: 'Herkunft klären', created: '2026-01-01' }));
  db.individuals.set('@I1@', proband);
  db.individuals.set('@I2@', vater);
  db.individuals.set('@I9@', fremder);
  appState.loadDatabase(db, 'test.ged');
  return appState;
}

function renderTab(scopeState = createResearchScopeState()) {
  const appState = seed();
  const viewState = createViewState();
  viewState.setProband('@I1@');
  const gerendert = render(ResearchTab, {
    props: {
      appState,
      route: createRoute(),
      viewState,
      projects: mkProjects(),
      researchScope: scopeState,
    },
  });
  return { appState, viewState, scopeState, gerendert };
}

const relevanz = () => screen.getByLabelText('Relevanz') as HTMLSelectElement;

/**
 * Das Suchfeld steht SICHTBAR in der Toolbar — den Platz dafür schafft der
 * Zwei-Zustands-Umschalter (ein Knopf statt zweier Segmente, Spec 21 §6h „ein
 * Icon-Slot"). Kein Öffnen nötig; die Funktion bleibt, damit die Fälle unten lesbar
 * bleiben, wenn sich der Weg noch einmal ändert.
 */
async function suchfeld(label: string) {
  return screen.getByLabelText(label) as HTMLInputElement;
}

describe('Verwandtschafts-Relevanz auf der Umbrella-Ebene (BL-375)', () => {
  let unpin: () => void;
  afterEach(() => {
    unpin?.();
    layout.reset();
  });
  const mobile = () => (unpin = pinLayout(false));

  it('steht GENAU EINMAL da — nicht je Segment wiederholt (Spec 20 §1.11i)', async () => {
    mobile();
    renderTab();

    expect(screen.getAllByLabelText('Relevanz')).toHaveLength(1);
    // Auch nach dem Wechsel des Segments bleibt es die eine Leiste darüber.
    await fireEvent.click(screen.getByRole('tab', { name: 'Hypothesen' }));
    expect(screen.getAllByLabelText('Relevanz')).toHaveLength(1);
  });

  it('zeigt ohne Einschränkung alle Aufgaben', () => {
    mobile();
    renderTab();

    expect(screen.getByText('Taufeintrag prüfen')).toBeTruthy();
    expect(screen.getByText('Sterbeurkunde anfordern')).toBeTruthy();
    expect(screen.getByText('Herkunft klären')).toBeTruthy();
  });

  it('„Vorfahren" lässt die Ahnenlinie stehen und wirft den Unverbundenen heraus', async () => {
    mobile();
    renderTab();

    await fireEvent.change(relevanz(), { target: { value: 'ancestors' } });

    expect(screen.getByText('Taufeintrag prüfen')).toBeTruthy();
    expect(screen.getByText('Sterbeurkunde anfordern')).toBeTruthy();
    expect(screen.queryByText('Herkunft klären')).toBeNull();
  });

  it('„Außerhalb" ist das Gegenstück — nur der Unverbundene bleibt', async () => {
    mobile();
    renderTab();

    await fireEvent.change(relevanz(), { target: { value: 'outside' } });

    expect(screen.queryByText('Taufeintrag prüfen')).toBeNull();
    expect(screen.getByText('Herkunft klären')).toBeTruthy();
  });

  it('wirkt auch im Protokoll-Segment — die Achse gilt für ALLE Flächen, nicht nur die erste', async () => {
    mobile();
    const { appState } = renderTab();
    appState.addLogEntry('person', '@I9@', {
      date: '2026-02-01',
      repoRef: '',
      sourceRef: '',
      query: 'Kirchenbuch Fremd',
      result: 'notfound',
      note: '',
      taskId: '',
    });

    await fireEvent.click(screen.getByRole('tab', { name: 'Protokoll' }));
    expect(screen.getByText(/Kirchenbuch Fremd/)).toBeTruthy();

    await fireEvent.change(relevanz(), { target: { value: 'ancestors' } });
    expect(screen.queryByText(/Kirchenbuch Fremd/)).toBeNull();
  });

  it('überlebt den Abbau der Fläche — der Halter gehört der Wurzel', async () => {
    mobile();
    const scopeState = createResearchScopeState();
    const erste = renderTab(scopeState);

    await fireEvent.change(relevanz(), { target: { value: 'outside' } });
    expect(scopeState.kinship).toBe('outside');

    // Der Weg des Nutzers: aus einem Befund zur Person springen und zurückkommen. Für
    // die Forschungsfläche ist das ein Abbau samt Neuaufbau.
    erste.gerendert.unmount();
    renderTab(scopeState);

    expect(relevanz().value).toBe('outside');
  });
});

describe('Suche in den Forschungs-Segmenten (BL-374)', () => {
  let unpin: () => void;
  afterEach(() => {
    unpin?.();
    layout.reset();
  });
  const mobile = () => (unpin = pinLayout(false));

  it('grenzt die Aufgaben auf den Treffer ein', async () => {
    mobile();
    renderTab();

    await fireEvent.input(await suchfeld('Aufgaben durchsuchen'), { target: { value: 'sterbe' } });

    expect(screen.getByText('Sterbeurkunde anfordern')).toBeTruthy();
    expect(screen.queryByText('Taufeintrag prüfen')).toBeNull();
  });

  it('sucht auch über den Trägernamen — die Liste ist global', async () => {
    mobile();
    renderTab();

    await fireEvent.input(await suchfeld('Aufgaben durchsuchen'), { target: { value: 'Fremd' } });

    expect(screen.getByText('Herkunft klären')).toBeTruthy();
    expect(screen.queryByText('Taufeintrag prüfen')).toBeNull();
  });

  it('hat je Segment ein eigenes Feld — eine Anfrage schwappt nicht in die Nachbarfläche', async () => {
    mobile();
    renderTab();

    await fireEvent.input(await suchfeld('Aufgaben durchsuchen'), { target: { value: 'sterbe' } });
    await fireEvent.click(screen.getByRole('tab', { name: 'Hypothesen' }));

    expect((await suchfeld('Hypothesen durchsuchen')).value).toBe('');
  });

  it('steht sichtbar in der Kopfzeile und zählt deshalb NICHT im Filter-Badge mit', async () => {
    mobile();
    renderTab();

    expect(screen.getByLabelText('Aufgaben durchsuchen')).toBeTruthy();
    await fireEvent.input(await suchfeld('Aufgaben durchsuchen'), { target: { value: 'sterbe' } });

    // Ein Badge über einem sichtbaren Feld zeigte dieselbe Sache zweimal an.
    expect(screen.getByRole('button', { name: 'Filter' })).toBeTruthy();
  });

  it('leert die Anfrage über ✕', async () => {
    mobile();
    renderTab();

    const feld = await suchfeld('Aufgaben durchsuchen');
    await fireEvent.input(feld, { target: { value: 'sterbe' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Suche löschen' }));

    expect((screen.getByLabelText('Aufgaben durchsuchen') as HTMLInputElement).value).toBe('');
    expect(screen.getByText('Taufeintrag prüfen')).toBeTruthy();
  });
});
