// @vitest-environment happy-dom
// tests/ui/TimelineLensView.component.test.ts — Zeitleiste-Lens (Spec 21 §4, Spec 20
// §1.10 [S]). Deckt: Lens-/Fokus-Verdrahtung, Modus-Umschalter (Swim-Lane/Dekaden),
// Personen-Picker-Default = lensFocus, Mehrpersonen-Hinzufügen (bis 5), historische
// Ereignisse ein-/ausblendbar. Die Layout-Berechnung selbst ist in
// tests/islands/timeline-model.test.ts abgedeckt (Spec 32 §2).
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import TimelineLensView from '../../ui/views/timeline/TimelineLensView.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeDatabase, makeEvent, makePerson } from '../../core/model';

function dbWithPerson(id: string, given: string, surname: string, birthYear: number): ReturnType<typeof makeDatabase> {
  const db = makeDatabase();
  db.individuals.set(
    id,
    makePerson(id, {
      given,
      surname,
      birth: makeEvent('BIRT', { date: `1 JAN ${birthYear}`, seen: true }),
      death: makeEvent('DEAT', { date: `1 JAN ${birthYear + 70}`, seen: true }),
    }),
  );
  return db;
}

describe('TimelineLensView — Lens-/Fokus-Verdrahtung (INV-UI-3, Spec 21 §4)', () => {
  it('bindet den EINEN Lens-Umschalter mit "Zeitleiste" als aktiver Lens ein', () => {
    render(TimelineLensView, { props: { appState: createAppState(), viewState: createViewState() } });

    const timelineTab = screen.getByRole('tab', { name: /Zeitleiste/ });
    expect(timelineTab.getAttribute('aria-current')).toBe('page');
  });

  it('Klick auf "Baum" im eingebetteten Umschalter ruft onNavigateLens mit "tree" auf', async () => {
    const onNavigateLens = vi.fn();
    render(TimelineLensView, {
      props: { appState: createAppState(), viewState: createViewState(), onNavigateLens },
    });

    await fireEvent.click(screen.getByRole('tab', { name: /Baum/ }));

    expect(onNavigateLens).toHaveBeenCalledWith('tree');
  });

  it('zeigt KEINE redundante Titel-Zeile über dem Umschalter (INV-UI-4, LensViewHeader-Kanon)', () => {
    const { container } = render(TimelineLensView, {
      props: { appState: createAppState(), viewState: createViewState() },
    });

    expect(container.querySelectorAll('.lens-switcher__item--active')).toHaveLength(1);
    expect(container.textContent?.match(/Zeitleiste/g)).toHaveLength(1);
  });
});

describe('TimelineLensView — Modus-Umschalter (Spec 20 §1.10 [S]: Swim-Lane/Dekaden)', () => {
  it('startet im Swim-Lane-Modus', () => {
    render(TimelineLensView, { props: { appState: createAppState(), viewState: createViewState() } });

    const swimTab = screen.getByRole('tab', { name: 'Swim-Lane' });
    expect(swimTab.getAttribute('aria-current')).toBe('page');
  });

  it('nutzt die zentralen .stb-segment-row/.stb-segment-btn-Klassen (INV-UI-4, kein eigenes Tab-CSS)', () => {
    const { container } = render(TimelineLensView, {
      props: { appState: createAppState(), viewState: createViewState() },
    });

    const modeRow = container.querySelector('.timeline-lens-view__mode-row');
    expect(modeRow?.classList.contains('stb-segment-row')).toBe(true);
    expect(container.querySelectorAll('.stb-segment-btn').length).toBeGreaterThanOrEqual(2);
  });

  it('Klick auf "Dekaden" wechselt den Modus', async () => {
    render(TimelineLensView, { props: { appState: createAppState(), viewState: createViewState() } });

    await fireEvent.click(screen.getByRole('tab', { name: 'Dekaden' }));

    expect(screen.getByRole('tab', { name: 'Dekaden' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('tab', { name: 'Swim-Lane' }).getAttribute('aria-current')).toBeNull();
  });

  it('zeigt einen Hinweis, wenn Dekaden-Modus + Mehrpersonen aktiv sind (Orakel: "nur im Querformat"-Toast-Äquivalent)', async () => {
    const appState = createAppState();
    const db = dbWithPerson('@I1@', 'Anna', 'Bauer', 1850);
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Otto', surname: 'Müller' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('lensFocus', '@I1@');

    render(TimelineLensView, { props: { appState, viewState } });
    await fireEvent.click(screen.getByRole('button', { name: /Person hinzufügen/ }));
    await fireEvent.click(screen.getByRole('button', { name: /Otto Müller/ }));
    await fireEvent.click(screen.getByRole('tab', { name: 'Dekaden' }));

    expect(screen.getByText(/nur im Swim-Lane-Modus/)).toBeTruthy();
  });
});

describe('TimelineLensView — Personen-Picker-Default + Mehrpersonen (Spec 20 §1.10 [S] "bis 5")', () => {
  it('zeigt die geteilte ViewState-Fokus-Person "lensFocus" als erste/einzige Person', () => {
    const appState = createAppState();
    appState.loadDatabase(dbWithPerson('@I1@', 'Anna', 'Bauer', 1850), 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('lensFocus', '@I1@');

    render(TimelineLensView, { props: { appState, viewState } });

    expect(screen.getByText(/Anna Bauer/)).toBeTruthy();
  });

  it('fügt über den Picker eine weitere Person hinzu (bis zu 5 insgesamt)', async () => {
    const appState = createAppState();
    const db = dbWithPerson('@I1@', 'Anna', 'Bauer', 1850);
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Otto', surname: 'Müller' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('lensFocus', '@I1@');

    render(TimelineLensView, { props: { appState, viewState } });
    await fireEvent.click(screen.getByRole('button', { name: /Person hinzufügen/ }));
    await fireEvent.click(screen.getByRole('button', { name: /Otto Müller/ }));

    expect(screen.getByText(/Anna Bauer/)).toBeTruthy();
    expect(screen.getByText(/Otto Müller/)).toBeTruthy();
    // Der geteilte Lens-Fokus bleibt die erste/primäre Person (Auftrag: "Fokus-Person
    // ist immer Startpunkt/erste der Auswahl").
    expect(viewState.getCurrent('lensFocus')).toBe('@I1@');
  });

  it('blendet den "Person hinzufügen"-Button aus, sobald 5 Personen ausgewählt sind', async () => {
    const appState = createAppState();
    const db = dbWithPerson('@I1@', 'P1', 'X', 1800);
    for (const n of [2, 3, 4, 5]) {
      db.individuals.set(`@I${n}@`, makePerson(`@I${n}@`, { given: `P${n}`, surname: 'X' }));
    }
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('lensFocus', '@I1@');

    render(TimelineLensView, { props: { appState, viewState } });
    for (const n of [2, 3, 4, 5]) {
      await fireEvent.click(screen.getByRole('button', { name: /Person hinzufügen/ }));
      await fireEvent.click(screen.getByRole('button', { name: new RegExp(`P${n} X`) }));
    }

    expect(screen.queryByRole('button', { name: /Person hinzufügen/ })).toBeNull();
  });

  it('entfernt eine hinzugefügte Person wieder, aber nicht die Fokus-Person', async () => {
    const appState = createAppState();
    const db = dbWithPerson('@I1@', 'Anna', 'Bauer', 1850);
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Otto', surname: 'Müller' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('lensFocus', '@I1@');

    render(TimelineLensView, { props: { appState, viewState } });
    await fireEvent.click(screen.getByRole('button', { name: /Person hinzufügen/ }));
    await fireEvent.click(screen.getByRole('button', { name: /Otto Müller/ }));
    await fireEvent.click(screen.getByRole('button', { name: /Person aus Vergleich entfernen/ }));

    expect(screen.getByText(/Anna Bauer/)).toBeTruthy();
    expect(screen.queryByText(/Otto Müller/)).toBeNull();
  });
});

describe('TimelineLensView — historische Ereignisse ein-/ausblendbar (Spec 20 §1.10 [S])', () => {
  it('zeigt die Kategorie-Filter standardmäßig aktiv, wenn "Historische Ereignisse" angehakt ist', () => {
    render(TimelineLensView, { props: { appState: createAppState(), viewState: createViewState() } });

    expect(screen.getByRole('checkbox', { name: /Historische Ereignisse/ })).toBeTruthy();
    expect(screen.getByText(/⚔ Krieg/)).toBeTruthy();
  });

  it('blendet die Kategorie-Filter aus, wenn "Historische Ereignisse" abgehakt wird', async () => {
    render(TimelineLensView, { props: { appState: createAppState(), viewState: createViewState() } });

    await fireEvent.click(screen.getByRole('checkbox', { name: /Historische Ereignisse/ }));

    expect(screen.queryByText(/⚔ Krieg/)).toBeNull();
  });

  it('togglet eine einzelne Kategorie (Krieg) unabhängig von den anderen', async () => {
    render(TimelineLensView, { props: { appState: createAppState(), viewState: createViewState() } });

    const warBtn = screen.getByText(/⚔ Krieg/);
    expect(warBtn.className).toContain('timeline-lens-view__filter-btn--active');

    await fireEvent.click(warBtn);

    expect(warBtn.className).not.toContain('timeline-lens-view__filter-btn--active');
  });
});

describe('TimelineLensView — leerer Zustand', () => {
  it('zeigt einen Hinweis, wenn keine Person geladen ist', () => {
    render(TimelineLensView, { props: { appState: createAppState(), viewState: createViewState() } });

    expect(screen.getByText('Keine Person geladen.')).toBeTruthy();
  });

  it('zeigt einen Hinweis, wenn die Fokus-Person keine datierten Ereignisse hat', () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Bauer' }));
    appState.loadDatabase(db, 'test.ged');
    const viewState = createViewState();
    viewState.setCurrent('lensFocus', '@I1@');

    render(TimelineLensView, { props: { appState, viewState } });

    expect(screen.getByText('Keine datierten Ereignisse vorhanden.')).toBeTruthy();
  });
});
