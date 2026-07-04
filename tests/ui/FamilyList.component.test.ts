// @vitest-environment happy-dom
// tests/ui/FamilyList.component.test.ts — Familien-Tab-Liste als Component-Test
// (Spec 32 §6; Spec 20 §1.5 [K]). Deckt Rendering ab: Zeilen erscheinen im DOM,
// zyklischer Sortier-Umschalter (3 Zustände), Suche + Filter-Panel reagieren auf
// Nutzer-Interaktion, Klick ruft den EINEN ViewState-Weg auf (INV-VS).
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

function seedTwoFamilies() {
  const appState = createAppState();
  const db = makeDatabase();
  // F1: Ehemann Zimmer, Ehefrau Adler, Heirat 1950
  db.individuals.set('@I1@', makePerson('@I1@', { given: 'Otto', surname: 'Zimmer' }));
  db.individuals.set('@I2@', makePerson('@I2@', { given: 'Anna', surname: 'Adler' }));
  const f1 = makeFamily('@F1@', { husband: '@I1@', wife: '@I2@' });
  f1.marriage.date = '1 JAN 1950';
  // F2: Ehemann Adler, Ehefrau Zimmer, Heirat 1900
  db.individuals.set('@I3@', makePerson('@I3@', { given: 'Karl', surname: 'Adler' }));
  db.individuals.set('@I4@', makePerson('@I4@', { given: 'Berta', surname: 'Zimmer' }));
  const f2 = makeFamily('@F2@', { husband: '@I3@', wife: '@I4@' });
  f2.marriage.date = '1 JAN 1900';
  db.families.set('@F1@', f1);
  db.families.set('@F2@', f2);
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

describe('FamilyList — zyklischer Sortier-Umschalter mit drei Zuständen (Component)', () => {
  it('zyklet Nachname Ehemann → Nachname Ehefrau → Heiratsdatum → zurück', async () => {
    const appState = seedTwoFamilies();
    const viewState = createViewState();

    render(FamilyList, { props: { appState, viewState } });
    const toggle = screen.getByRole('button', { name: /⇅/ });

    expect(screen.getByRole('button', { name: /⇅ Nachname Ehemann/ })).toBeTruthy();
    let rows = screen.getAllByRole('button', { name: /⚭/ });
    expect(rows[0].textContent).toContain('Karl Adler ⚭ Berta Zimmer'); // Adler vor Zimmer (Ehemann-Nachname)

    await fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: /⇅ Nachname Ehefrau/ })).toBeTruthy();
    rows = screen.getAllByRole('button', { name: /⚭/ });
    expect(rows[0].textContent).toContain('Otto Zimmer ⚭ Anna Adler'); // Adler (Ehefrau) vor Zimmer (Ehefrau)

    await fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: /⇅ Heiratsdatum/ })).toBeTruthy();
    rows = screen.getAllByRole('button', { name: /⚭/ });
    expect(rows[0].textContent).toContain('Karl Adler ⚭ Berta Zimmer'); // 1900 vor 1950

    await fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: /⇅ Nachname Ehemann/ })).toBeTruthy();
  });
});

describe('FamilyList — Live-Suche (Component)', () => {
  it('filtert die Liste live beim Tippen und zeigt ein ✕ zum Löschen', async () => {
    const appState = seedTwoFamilies();
    const viewState = createViewState();

    render(FamilyList, { props: { appState, viewState } });
    const search = screen.getByLabelText('Familien durchsuchen');

    await fireEvent.input(search, { target: { value: 'zimmer' } });

    // Beide Familien haben einen "Zimmer"-Partner → beide bleiben sichtbar.
    expect(screen.getAllByText(/Zimmer/).length).toBeGreaterThan(0);

    await fireEvent.input(search, { target: { value: 'nonexistent-zzz' } });
    expect(screen.getByText(/Keine Familien gefunden/)).toBeTruthy();

    const clearBtn = screen.getByLabelText('Suche löschen');
    await fireEvent.click(clearBtn);

    expect(screen.getByText('Otto Zimmer ⚭ Anna Adler')).toBeTruthy();
  });
});

describe('FamilyList — Filter-Panel (Component)', () => {
  it('öffnet das Filter-Panel und filtert nach Heiratsjahr-Bereich', async () => {
    const appState = seedTwoFamilies();
    const viewState = createViewState();

    render(FamilyList, { props: { appState, viewState } });

    await fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    const from = screen.getByLabelText(/Heiratsjahr von/);
    const to = screen.getByLabelText(/Heiratsjahr bis/);
    await fireEvent.input(from, { target: { value: '1940' } });
    await fireEvent.input(to, { target: { value: '1960' } });

    expect(screen.getByText('Otto Zimmer ⚭ Anna Adler')).toBeTruthy();
    expect(screen.queryByText('Karl Adler ⚭ Berta Zimmer')).toBeNull();
  });

  it('"Filter zurücksetzen" stellt die volle Liste wieder her', async () => {
    const appState = seedTwoFamilies();
    const viewState = createViewState();

    render(FamilyList, { props: { appState, viewState } });

    await fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    const from = screen.getByLabelText(/Heiratsjahr von/);
    await fireEvent.input(from, { target: { value: '1940' } });
    expect(screen.queryByText('Karl Adler ⚭ Berta Zimmer')).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'Filter zurücksetzen' }));

    expect(screen.getByText('Karl Adler ⚭ Berta Zimmer')).toBeTruthy();
  });
});
