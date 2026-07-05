// @vitest-environment happy-dom
// tests/ui/PersonList.component.test.ts — Personen-Liste als Component-Test
// (Spec 32 §6 "[21] INV-VS/INV-UI-…, Testart: Komponente"; Spec 32 §3
// @testing-library/svelte + happy-dom). Deckt Rendering ab, das die reine
// Gruppierungs-/Filterlogik (person-list-model.test.ts) nicht zeigt: Buchstaben-Trenner
// erscheinen tatsächlich im DOM, Sortier-Umschalter/Suche/Filter-Panel reagieren auf
// Nutzer-Interaktion, Klick ruft den EINEN ViewState-Weg auf.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PersonList from '../../ui/views/person/PersonList.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeDatabase, makePerson } from '../../core/model';

function seedAppState() {
  const appState = createAppState();
  const db = makeDatabase();
  const a = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
  a.birth.date = '1 JAN 1950';
  const o = makePerson('@I2@', { given: 'Otto', surname: 'Meyer' });
  o.birth.date = '1 JAN 1900';
  db.individuals.set('@I1@', a);
  db.individuals.set('@I2@', o);
  appState.loadDatabase(db, 'test.ged');
  return appState;
}

describe('PersonList — alphabetische Gruppierung mit Buchstaben-Trenner (Component)', () => {
  it('rendert einen Buchstaben-Trenner pro Anfangsbuchstaben und die Personenzeilen darunter', () => {
    const appState = seedAppState();
    const viewState = createViewState();

    render(PersonList, { props: { appState, viewState } });

    expect(screen.getByRole('separator', { name: 'Buchstabe B' })).toBeTruthy();
    expect(screen.getByRole('separator', { name: 'Buchstabe M' })).toBeTruthy();
    expect(screen.getByText('Anna Bauer')).toBeTruthy();
    expect(screen.getByText('Otto Meyer')).toBeTruthy();
  });

  it('zeigt einen Leerzustand, solange keine Personen geladen sind (kein Absturz auf leerer DB)', () => {
    const appState = createAppState();
    const viewState = createViewState();

    render(PersonList, { props: { appState, viewState } });

    expect(screen.getByText(/Keine Personen geladen/)).toBeTruthy();
  });

  it('Klick auf eine Zeile setzt die Auswahl über den EINEN ViewState-Weg (setCurrent)', async () => {
    const appState = seedAppState();
    const viewState = createViewState();

    render(PersonList, { props: { appState, viewState } });

    await fireEvent.click(screen.getByText('Anna Bauer'));

    expect(viewState.getCurrent('person')).toBe('@I1@');
  });
});

describe('PersonList — Sortier-Umschalter Name ⇄ Geburtsdatum (Component)', () => {
  it('startet im Name-Modus mit Buchstaben-Trennern und schaltet auf Geburtsdatum ohne Trenner um', async () => {
    const appState = seedAppState();
    const viewState = createViewState();

    render(PersonList, { props: { appState, viewState } });

    expect(screen.getByRole('button', { name: /⇅ Name/ })).toBeTruthy();
    expect(screen.getByRole('separator', { name: 'Buchstabe B' })).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: /⇅ Name/ }));

    expect(screen.getByRole('button', { name: /⇅ Geburtsdatum/ })).toBeTruthy();
    expect(screen.queryByRole('separator')).toBeNull();

    // chronologische Reihenfolge: Otto (1900) vor Anna (1950)
    const names = screen.getAllByText(/Anna Bauer|Otto Meyer/).map((el) => el.textContent);
    expect(names).toEqual(['Otto Meyer', 'Anna Bauer']);
  });

  it('schaltet zurück auf Name-Modus (Toggle ist reversibel)', async () => {
    const appState = seedAppState();
    const viewState = createViewState();

    render(PersonList, { props: { appState, viewState } });
    const toggle = screen.getByRole('button', { name: /⇅/ });

    await fireEvent.click(toggle);
    await fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: /⇅ Name/ })).toBeTruthy();
    expect(screen.getByRole('separator', { name: 'Buchstabe B' })).toBeTruthy();
  });
});

describe('PersonList — Live-Suche (Component)', () => {
  it('filtert die Liste live beim Tippen und zeigt ein ✕ zum Löschen', async () => {
    const appState = seedAppState();
    const viewState = createViewState();

    render(PersonList, { props: { appState, viewState } });
    const search = screen.getByLabelText('Personen durchsuchen');

    await fireEvent.input(search, { target: { value: 'bauer' } });

    expect(screen.getByText('Anna Bauer')).toBeTruthy();
    expect(screen.queryByText('Otto Meyer')).toBeNull();

    const clearBtn = screen.getByLabelText('Suche löschen');
    await fireEvent.click(clearBtn);

    expect(screen.getByText('Otto Meyer')).toBeTruthy();
  });

  it('zeigt einen Leerzustand, wenn die Suche nichts findet', async () => {
    const appState = seedAppState();
    const viewState = createViewState();

    render(PersonList, { props: { appState, viewState } });
    const search = screen.getByLabelText('Personen durchsuchen');

    await fireEvent.input(search, { target: { value: 'nonexistent-zzz' } });

    expect(screen.getByText(/Keine Personen gefunden/)).toBeTruthy();
  });
});

describe('PersonList — Filter-Panel (Component)', () => {
  it('öffnet das Filter-Panel und filtert nach Geschlecht', async () => {
    const appState = seedAppState();
    const viewState = createViewState();
    // Anna ist standardmäßig 'U' (kein sex im patch) — für einen echten Filter-Test
    // Geschlecht explizit setzen.
    appState.db.individuals.get('@I1@')!.sex = 'F';
    appState.db.individuals.get('@I2@')!.sex = 'M';

    render(PersonList, { props: { appState, viewState } });

    await fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    await fireEvent.click(screen.getByRole('radio', { name: 'Weiblich' }));

    expect(screen.getByText('Anna Bauer')).toBeTruthy();
    expect(screen.queryByText('Otto Meyer')).toBeNull();
  });

  it('filtert nach Geburtsjahr-Bereich', async () => {
    const appState = seedAppState();
    const viewState = createViewState();

    render(PersonList, { props: { appState, viewState } });

    await fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    const from = screen.getByLabelText(/Geburtsjahr von/);
    const to = screen.getByLabelText(/Geburtsjahr bis/);
    await fireEvent.input(from, { target: { value: '1940' } });
    await fireEvent.input(to, { target: { value: '1960' } });

    expect(screen.getByText('Anna Bauer')).toBeTruthy();
    expect(screen.queryByText('Otto Meyer')).toBeNull();
  });

  it('"Filter zurücksetzen" stellt die volle Liste wieder her', async () => {
    const appState = seedAppState();
    const viewState = createViewState();

    render(PersonList, { props: { appState, viewState } });

    await fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    const from = screen.getByLabelText(/Geburtsjahr von/);
    await fireEvent.input(from, { target: { value: '1940' } });
    expect(screen.queryByText('Otto Meyer')).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'Filter zurücksetzen' }));

    expect(screen.getByText('Otto Meyer')).toBeTruthy();
  });
});

describe('PersonList — "＋ Neue Person" (Spec 20 §2)', () => {
  it('legt eine leere Person mit kollisionsfreier id an und meldet sie über onCreate', async () => {
    const appState = seedAppState(); // bereits @I1@/@I2@ belegt
    const viewState = createViewState();
    const onCreate = vi.fn();

    render(PersonList, { props: { appState, viewState, onCreate } });
    await fireEvent.click(screen.getByText('＋ Neue Person'));

    expect(onCreate).toHaveBeenCalledWith('@I3@');
    expect(appState.db.individuals.has('@I3@')).toBe(true);
    expect(appState.db.individuals.get('@I3@')?.given).toBe('');
  });

  it('funktioniert auch bei leerem Datenbestand (erste Person)', async () => {
    const appState = createAppState();
    const viewState = createViewState();
    const onCreate = vi.fn();

    render(PersonList, { props: { appState, viewState, onCreate } });
    await fireEvent.click(screen.getByText('＋ Neue Person'));

    expect(onCreate).toHaveBeenCalledWith('@I1@');
    expect(appState.db.individuals.has('@I1@')).toBe(true);
  });
});
