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
    viewState.setCurrent('lensFocus', '@I1@');

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
    // Bewusst KEIN viewState.setCurrent('lensFocus', ...) — Baum-Tab muss trotzdem etwas zeigen.

    const { container } = render(TreeView, { props: { appState, viewState } });

    expect(container.querySelector('.tree-island__card--center')).toBeTruthy();
  });

  it('Vollbild-Button schaltet die State-Klasse auf dem Container um (Spec 21 §3)', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    appState.loadDatabase(dbWithPerson('@I1@'), 'test.ged');
    viewState.setCurrent('lensFocus', '@I1@');

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
    viewState.setCurrent('lensFocus', '@I1@');
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
    viewState.setCurrent('lensFocus', '@I1@');

    const { container } = render(TreeView, { props: { appState, viewState } });
    const fatherCard = container.querySelector('[data-person-id="@I2@"]') as HTMLElement;
    expect(fatherCard).toBeTruthy();
    await fireEvent.click(fatherCard);

    expect(viewState.getCurrent('lensFocus')).toBe('@I2@');
  });
});

describe('TreeView — Lens-Umschalter-Einbettung (Spec 21 §4, INV-UI-3)', () => {
  it('bindet den EINEN Lens-Umschalter ein, mit "Baum" als aktiver Lens', () => {
    const appState = createAppState();
    const viewState = createViewState();
    appState.loadDatabase(dbWithPerson('@I1@'), 'test.ged');
    viewState.setCurrent('lensFocus', '@I1@');

    const { container, getByRole } = render(TreeView, { props: { appState, viewState } });

    expect(container.querySelector('.lens-switcher')).toBeTruthy();
    const treeTab = getByRole('tab', { name: /Baum/ });
    expect(treeTab.getAttribute('aria-current')).toBe('page');
  });

  it('zeigt KEINE redundante Titel-Zeile über dem Umschalter (Befund: doppeltes "Baum")', () => {
    const appState = createAppState();
    const viewState = createViewState();
    appState.loadDatabase(dbWithPerson('@I1@'), 'test.ged');
    viewState.setCurrent('lensFocus', '@I1@');

    const { container, getByText } = render(TreeView, { props: { appState, viewState } });

    // "Baum" darf nur einmal im DOM stehen (als aktives Tab im Lens-Umschalter) —
    // keine zusätzliche `__topbar`-Titel-Zeile mehr darüber.
    expect(container.querySelectorAll('.lens-switcher__item--active')).toHaveLength(1);
    expect(container.textContent?.match(/Baum/g)).toHaveLength(1);
    // Der Vollbild-Button bleibt erreichbar — jetzt im Aktionen-Slot der gemeinsamen
    // Kopfzeile (ui/shell/LensViewHeader.svelte), nicht mehr in einer eigenen Zeile.
    expect(getByText(/⤢ Vollbild/)).toBeTruthy();
  });

  it('Klick auf eine andere implementierte Lens (Karte) im Umschalter ruft onNavigateLens auf, ohne den Fokus zu ändern', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    appState.loadDatabase(dbWithPerson('@I1@'), 'test.ged');
    viewState.setCurrent('lensFocus', '@I1@');
    const onNavigateLens = vi.fn();

    // "Karte" ist implementiert (ADR-v9-25) -> Klick ruft onNavigateLens('map') auf;
    // der geteilte Fokus-Slot bleibt unverändert (TreeView schreibt ihn beim
    // Lens-Wechsel selbst nicht, das übernimmt App.svelte/MapLensView).
    const { getByRole } = render(TreeView, { props: { appState, viewState, onNavigateLens } });
    await fireEvent.click(getByRole('tab', { name: /Karte/ }));

    expect(onNavigateLens).toHaveBeenCalledWith('map');
    expect(viewState.getCurrent('lensFocus')).toBe('@I1@');
  });

  it('Klick auf eine implementierte Lens (Zeitleiste) ruft onNavigateLens auf', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    appState.loadDatabase(dbWithPerson('@I1@'), 'test.ged');
    viewState.setCurrent('lensFocus', '@I1@');
    const onNavigateLens = vi.fn();

    const { getByRole } = render(TreeView, { props: { appState, viewState, onNavigateLens } });
    await fireEvent.click(getByRole('tab', { name: /Zeitleiste/ }));

    expect(onNavigateLens).toHaveBeenCalledWith('timeline');
    expect(viewState.getCurrent('lensFocus')).toBe('@I1@');
  });

  it('Klick auf eine NICHT implementierte Lens (Story) ruft onNavigateLens NICHT auf', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    appState.loadDatabase(dbWithPerson('@I1@'), 'test.ged');
    viewState.setCurrent('lensFocus', '@I1@');
    const onNavigateLens = vi.fn();

    const { getByRole } = render(TreeView, { props: { appState, viewState, onNavigateLens } });
    await fireEvent.click(getByRole('tab', { name: /Story/ }));

    expect(onNavigateLens).not.toHaveBeenCalled();
    expect(viewState.getCurrent('lensFocus')).toBe('@I1@');
  });

  it('der Fokus bleibt in ViewState erhalten, wenn TreeView entfernt und mit derselben ViewState-Instanz neu gemountet wird (Lens-Wechsel weg-und-zurück)', () => {
    const appState = createAppState();
    const viewState = createViewState();
    appState.loadDatabase(dbWithPerson('@I1@'), 'test.ged');
    viewState.setCurrent('lensFocus', '@I1@');

    const first = render(TreeView, { props: { appState, viewState } });
    expect(first.container.querySelector('[data-person-id="@I1@"].tree-island__card--center')).toBeTruthy();
    first.unmount();

    // Simuliert "Weg zu Karte (Platzhalter) und zurück zu Baum" — dieselbe geteilte
    // ViewState-Instanz überlebt den Lens-Wechsel (App.svelte reicht sie unverändert
    // durch), der Fokus ist danach identisch zu vorher.
    const second = render(TreeView, { props: { appState, viewState } });
    expect(viewState.getCurrent('lensFocus')).toBe('@I1@');
    expect(second.container.querySelector('[data-person-id="@I1@"].tree-island__card--center')).toBeTruthy();
  });
});
