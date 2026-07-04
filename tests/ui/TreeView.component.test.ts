// @vitest-environment happy-dom
// tests/ui/TreeView.component.test.ts — dünner Svelte-Wrapper um die imperative
// Sanduhr-Insel (Spec 02 §5). Prüft NUR Mount/Unmount/Container-Vertrag — die
// Layout-/SVG-Logik selbst ist in tests/islands/tree-layout.test.ts abgedeckt
// (Spec 32 §2: Inseln werden über ihre Layout-Berechnung getestet, nicht Pixel).
import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import TreeView from '../../ui/views/tree/TreeView.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeDatabase, makePerson } from '../../core/model';

function dbWithPerson(id: string): ReturnType<typeof makeDatabase> {
  const db = makeDatabase();
  db.individuals.set(id, makePerson(id, { given: 'Anna', surname: 'Bauer' }));
  return db;
}

describe('TreeView — Mount/Unmount der imperativen Insel', () => {
  it('mountet einen Container und baut mindestens eine Zentrum-Karte auf', () => {
    const appState = createAppState();
    const viewState = createViewState();
    appState.loadDatabase(dbWithPerson('@I1@'), 'test.ged');
    viewState.setCurrent('tree', '@I1@');

    const { container } = render(TreeView, { props: { appState, viewState } });

    expect(container.querySelector('.tree-island')).toBeTruthy();
    expect(container.querySelector('.tree-island__card--center')).toBeTruthy();
  });

  it('zeigt einen Leerzustand ohne geladene Person, ohne zu crashen', () => {
    const appState = createAppState();
    const viewState = createViewState();

    const { getByText } = render(TreeView, { props: { appState, viewState } });

    expect(getByText(/Keine Person geladen/)).toBeTruthy();
  });

  it('fällt auf die erste Person der DB zurück, wenn ViewState noch keinen Baum-Fokus hat', () => {
    const appState = createAppState();
    const viewState = createViewState();
    appState.loadDatabase(dbWithPerson('@I1@'), 'test.ged');
    // Bewusst KEIN viewState.setCurrent('tree', ...) — Baum-Tab muss trotzdem etwas zeigen.

    const { container } = render(TreeView, { props: { appState, viewState } });

    expect(container.querySelector('.tree-island__card--center')).toBeTruthy();
  });

  it('Vollbild-Button schaltet die State-Klasse auf dem Container um (Spec 21 §3)', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    appState.loadDatabase(dbWithPerson('@I1@'), 'test.ged');
    viewState.setCurrent('tree', '@I1@');

    const { container, getByText } = render(TreeView, { props: { appState, viewState } });
    const island = container.querySelector('.tree-island')!;
    expect(island.className).not.toContain('tree-island--fullscreen');

    await fireEvent.click(getByText(/⤢ Vollbild/));
    expect(island.className).toContain('tree-island--fullscreen');

    await fireEvent.click(getByText(/⤡ Vollbild beenden/));
    expect(island.className).not.toContain('tree-island--fullscreen');
  });

  it('Klick auf die Zentrum-Karte ruft onOpenPersonDetail mit der Proband-ID auf', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    appState.loadDatabase(dbWithPerson('@I1@'), 'test.ged');
    viewState.setCurrent('tree', '@I1@');
    const onOpenPersonDetail = vi.fn();

    const { container } = render(TreeView, { props: { appState, viewState, onOpenPersonDetail } });
    const center = container.querySelector('.tree-island__card--center') as HTMLElement;
    await fireEvent.click(center);

    expect(onOpenPersonDetail).toHaveBeenCalledWith('@I1@');
  });

  it('Klick auf eine Ahnen-Karte rezentriert (ViewState "tree" wechselt auf die geklickte Person)', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Kind', surname: 'Bauer' }));
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Vater', surname: 'Bauer' }));
    db.individuals.set('@I3@', makePerson('@I3@', { given: 'Mutter', surname: 'Bauer' }));
    db.families.set('@F1@', {
      id: '@F1@',
      husband: '@I2@',
      wife: '@I3@',
      children: ['@I1@'],
      marriage: db.individuals.get('@I1@')!.birth,
      engagement: db.individuals.get('@I1@')!.birth,
      events: [],
      noteText: '',
      citations: [],
      tasks: [],
      researchLog: [],
      hypotheses: [],
      lastChanged: '',
    });
    db.individuals.get('@I1@')!.childOf.push({
      familyId: '@F1@',
      pedigree: 'birth',
      fatherRel: '',
      motherRel: '',
      fatherRelSeen: false,
      motherRelSeen: false,
      citations: [],
    });
    db.individuals.get('@I2@')!.parentIn.push('@F1@');
    db.individuals.get('@I3@')!.parentIn.push('@F1@');
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('tree', '@I1@');

    const { container } = render(TreeView, { props: { appState, viewState } });
    const fatherCard = container.querySelector('[data-person-id="@I2@"]') as HTMLElement;
    expect(fatherCard).toBeTruthy();
    await fireEvent.click(fatherCard);

    expect(viewState.getCurrent('tree')).toBe('@I2@');
  });
});
