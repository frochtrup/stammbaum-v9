// @vitest-environment happy-dom
// tests/ui/FamilyList.component.test.ts — Familien-Tab-Liste als Component-Test
// (Spec 32 §6; Spec 20 §1.5 [K]). Deckt Rendering ab: Zeilen erscheinen im DOM, Klick
// ruft den EINEN ViewState-Weg auf (INV-VS).
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import FamilyList from '../../ui/views/family/FamilyList.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeDatabase, makeFamily, makePerson } from '../../core/model';

function seedAppState() {
  const appState = createAppState();
  const db = makeDatabase();
  db.individuals.set('@I1@', makePerson('@I1@', { given: 'Otto', surname: 'Bauer' }));
  db.individuals.set('@I2@', makePerson('@I2@', { given: 'Anna', surname: 'Klein' }));
  const f = makeFamily('@F1@', { husband: '@I1@', wife: '@I2@', children: ['@I3@'] });
  f.marriage.date = '1 JAN 1920';
  db.families.set('@F1@', f);
  appState.loadDatabase(db, 'test.ged');
  return appState;
}

describe('FamilyList — Elternpaar/Heiratsdatum/Kinderzahl (Component)', () => {
  it('rendert das Elternpaar-Label und die Kinderzahl', () => {
    const appState = seedAppState();
    const viewState = createViewState();

    render(FamilyList, { props: { appState, viewState } });

    expect(screen.getByText('Otto Bauer ⚭ Anna Klein')).toBeTruthy();
    expect(screen.getByText(/1 Kind/)).toBeTruthy();
  });

  it('zeigt einen Leerzustand, solange keine Familien geladen sind (kein Absturz auf leerer DB)', () => {
    const appState = createAppState();
    const viewState = createViewState();

    render(FamilyList, { props: { appState, viewState } });

    expect(screen.getByText(/Keine Familien geladen/)).toBeTruthy();
  });

  it('Klick auf eine Zeile setzt die Auswahl über den EINEN ViewState-Weg (setCurrent)', async () => {
    const appState = seedAppState();
    const viewState = createViewState();

    render(FamilyList, { props: { appState, viewState } });

    await fireEvent.click(screen.getByText('Otto Bauer ⚭ Anna Klein'));

    expect(viewState.getCurrent('family')).toBe('@F1@');
  });
});
