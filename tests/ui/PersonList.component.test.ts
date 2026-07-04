// @vitest-environment happy-dom
// tests/ui/PersonList.component.test.ts — Personen-Liste als Component-Test
// (Spec 32 §6 "[21] INV-VS/INV-UI-…, Testart: Komponente"; Spec 32 §3
// @testing-library/svelte + happy-dom). Deckt Rendering ab, das die reine
// Gruppierungslogik (person-list-model.test.ts) nicht zeigt: Buchstaben-Trenner
// erscheinen tatsächlich im DOM, Klick ruft den EINEN ViewState-Weg auf.
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PersonList from '../../ui/views/person/PersonList.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeDatabase, makePerson } from '../../core/model';

function seedAppState() {
  const appState = createAppState();
  const db = makeDatabase();
  db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Bauer' }));
  db.individuals.set('@I2@', makePerson('@I2@', { given: 'Otto', surname: 'Meyer' }));
  appState.loadDatabase(db, 'test.ged');
  return appState;
}

describe('PersonList — alphabetische Gruppierung mit Buchstaben-Trenner (Component)', () => {
  it('rendert einen Buchstaben-Trenner pro Anfangsbuchstabe und die Personenzeilen darunter', () => {
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
