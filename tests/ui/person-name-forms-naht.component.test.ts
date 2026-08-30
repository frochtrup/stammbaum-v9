// @vitest-environment happy-dom
// tests/ui/person-name-forms-naht.component.test.ts — die NAHT: die Namensformen-Sektion
// hängt tatsächlich am Steckbrief, ihr Commit erreicht die Datenbank, und die Art des
// HAUPTnamens ist über das Identitäts-Formular setzbar.
//
// WARUM EIGENS. `PersonNamesSection.component.test.ts` prüft die Sektion isoliert und
// wäre auch dann grün, wenn niemand sie einbindet — genau die Lücke, an der ein
// „gebaut"-Bericht schon zweimal vorbeigelaufen ist (CLAUDE.md, Zwei-Agenten-Lehre). Hier
// läuft der Weg vom Klick auf „✎ Identität" bis in `appState.db`.
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PersonDetail from '../../ui/views/person/PersonDetail.svelte';
import PersonForm from '../../ui/views/person/PersonForm.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeDatabase, makePerson } from '../../core/model';
import { pinLayout } from './layout-harness';
import { layout } from '../../ui/shell/layout.svelte';

let unpin: () => void;
beforeEach(() => {
  unpin = pinLayout(false);
});
afterEach(() => {
  unpin();
  layout.reset();
});

function seed() {
  const appState = createAppState();
  const viewState = createViewState();
  const db = makeDatabase();
  const p = makePerson('@I1@', { given: 'Anna', surname: 'Decker' });
  p.extraNames.push({
    nameRaw: 'Anna /Meyer/', given: '', surname: '', prefix: '', suffix: '',
    type: 'married', citations: [],
  });
  db.individuals.set('@I1@', p);
  appState.loadDatabase(db, 'test.ged');
  viewState.setCurrent('person', '@I1@');
  return { appState, viewState };
}

describe('Naht — Namensformen am Personen-Steckbrief', () => {
  it('die Form steht im Steckbrief, bevor irgendein Modus geöffnet ist', () => {
    const { appState, viewState } = seed();
    render(PersonDetail, { props: { appState, viewState } });

    expect(screen.getByText('Weitere Namensformen')).toBeTruthy();
    expect(screen.getByText('Anna Meyer', { exact: false })).toBeTruthy();
    expect(screen.getByText('Ehename')).toBeTruthy();
    // Gelesen ja, geändert nein — die Controls hängen am „✎ Identität"-Schalter.
    expect(screen.queryByLabelText('Namensform 1 — Nachname')).toBeNull();
  });

  it('„✎ Identität" gibt die Controls frei, und der Edit landet in der Datenbank', async () => {
    const { appState, viewState } = seed();
    render(PersonDetail, { props: { appState, viewState } });

    await fireEvent.click(screen.getByText('✎ Identität'));

    const feld = screen.getByLabelText('Namensform 1 — Nachname') as HTMLInputElement;
    feld.value = 'Meier';
    await fireEvent.change(feld);

    // NICHT der lokale Formularzustand, sondern der gespeicherte Datensatz — die Sektion
    // committet sofort, ohne den „Speichern"-Knopf des Identitäts-Formulars zu berühren.
    expect(appState.db.individuals.get('@I1@')!.extraNames[0]!.nameRaw).toBe('Anna /Meier/');
  });

  it('das Sofort-Commit lässt die Skalarfelder des Formulars unangetastet (INV-UI-16)', async () => {
    const { appState, viewState } = seed();
    render(PersonDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByText('✎ Identität'));

    const feld = screen.getByLabelText('Namensform 1 — Nachname') as HTMLInputElement;
    feld.value = 'Meier';
    await fireEvent.change(feld);

    const p = appState.db.individuals.get('@I1@')!;
    expect(p.given).toBe('Anna');
    expect(p.surname).toBe('Decker');
  });
});

describe('Art des HAUPTnamens (`Person.nameType`) im Identitäts-Formular', () => {
  it('erscheint als Aktivierungs-Pille, solange sie leer ist — und danach als Feld', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Decker' }));
    appState.loadDatabase(db, 'test.ged');
    const person = appState.db.individuals.get('@I1@')!;

    render(PersonForm, { props: { appState, person } });

    await fireEvent.click(screen.getByText('+ Art des Namens'));
    const wahl = screen.getByLabelText('Art des Hauptnamens') as HTMLSelectElement;
    wahl.value = 'birth';
    await fireEvent.change(wahl);
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.individuals.get('@I1@')!.nameType).toBe('birth');
  });

  it('ein bereits gesetzter Wert zeigt das Feld ohne Umweg über die Pille', () => {
    const appState = createAppState();
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Decker' });
    p.nameType = 'married';
    db.individuals.set('@I1@', p);
    appState.loadDatabase(db, 'test.ged');

    render(PersonForm, { props: { appState, person: appState.db.individuals.get('@I1@')! } });

    expect((screen.getByLabelText('Art des Hauptnamens') as HTMLSelectElement).value).toBe('married');
    expect(screen.queryByText('+ Art des Namens')).toBeNull();
  });
});
