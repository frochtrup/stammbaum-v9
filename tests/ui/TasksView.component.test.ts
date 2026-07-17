// @vitest-environment happy-dom
// tests/ui/TasksView.component.test.ts — globaler Aufgaben-Tab (Spec 20 §1.11 [K]).
// Deckt Filter-Umschalter, Liste ⇄ Board, Hinzufügen/Status-Wechsel, Export-Button ab.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import TasksView from '../../ui/views/tasks/TasksView.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makePerson, makeFamily, makeSource } from '../../core/model';
import { makeTask } from '../../core/research/index';

function seedDb() {
  const db = makeDatabase();
  const p1 = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
  p1.tasks.push(makeTask('t1', { text: 'Kirchenbuch Hildesheim prüfen', category: 'Kirchenbuch', status: 'todo', created: '2026-01-01' }));
  p1.tasks.push(makeTask('t2', { text: 'Sterbeurkunde beschaffen', category: 'Urkunde/Standesamt', status: 'done', created: '2026-01-02' }));
  db.individuals.set('@I1@', p1);

  const p2 = makePerson('@I2@', { given: 'Anna', surname: 'Klein' });
  db.individuals.set('@I2@', p2);

  // Eigener Ehepartner (nicht @I1@), damit das Familien-Label ("Otto Bauer ⚭ Anna Klein")
  // sich vom Personen-Label ("Otto Bauer") unterscheidet — sonst wären Personen- und
  // Familien-Aufgabenzeile im Test nicht mehr eindeutig anklickbar.
  const f1 = makeFamily('@F1@', { husband: '@I1@', wife: '@I2@' });
  f1.tasks.push(makeTask('t3', { text: 'Heiratsurkunde beschaffen', category: 'Urkunde/Standesamt', status: 'doing', created: '2026-01-03' }));
  db.families.set('@F1@', f1);

  return db;
}

function renderView(db: ReturnType<typeof makeDatabase>) {
  const appState = createAppState();
  appState.loadDatabase(db, 'test.ged');
  const onNavigateToPerson = vi.fn();
  const onNavigateToFamily = vi.fn();
  const utils = render(TasksView, { props: { appState, onNavigateToPerson, onNavigateToFamily } });
  return { ...utils, appState, onNavigateToPerson, onNavigateToFamily };
}

describe('TasksView — Filter, Kategorien-Gruppierung, Liste', () => {
  it('zeigt standardmäßig nur offene Aufgaben (todo+doing), gruppiert nach Kategorie', () => {
    renderView(seedDb());
    expect(screen.getByText('Kirchenbuch Hildesheim prüfen')).toBeTruthy();
    expect(screen.getByText('Heiratsurkunde beschaffen')).toBeTruthy();
    expect(screen.queryByText('Sterbeurkunde beschaffen')).toBeNull(); // done, Filter=open
  });

  it('Filter "Alle" zeigt auch erledigte Aufgaben', async () => {
    renderView(seedDb());
    await fireEvent.click(screen.getByRole('button', { name: 'Alle' }));
    expect(screen.getByText('Sterbeurkunde beschaffen')).toBeTruthy();
  });

  it('Filter "Erledigt" zeigt NUR erledigte Aufgaben', async () => {
    renderView(seedDb());
    await fireEvent.click(screen.getByRole('button', { name: 'Erledigt' }));
    expect(screen.getByText('Sterbeurkunde beschaffen')).toBeTruthy();
    expect(screen.queryByText('Kirchenbuch Hildesheim prüfen')).toBeNull();
  });
});

describe('TasksView — Liste ⇄ Kanban-Board-Umschalter', () => {
  it('wechselt in die Board-Ansicht mit den 3 Spalten Offen/In Arbeit/Erledigt', async () => {
    renderView(seedDb());
    await fireEvent.click(screen.getByRole('button', { name: 'Alle' })); // alle Status sichtbar
    await fireEvent.click(screen.getByRole('button', { name: 'Kanban-Board' }));

    // Spaltenköpfe (nicht der Filter-Button "Offen" oben in der Toolbar) — Selektor über
    // die Board-Spalten-Klasse, damit der Test nicht an der gleichlautenden Filter-
    // Beschriftung hängen bleibt.
    const heads = document.querySelectorAll('.tasks-view__col-head');
    const headTexts = Array.from(heads).map((h) => h.textContent?.trim());
    expect(headTexts.some((t) => t?.startsWith('Offen'))).toBe(true);
    expect(headTexts.some((t) => t?.startsWith('In Arbeit'))).toBe(true);
    expect(headTexts.some((t) => t?.startsWith('Erledigt'))).toBe(true);
  });

  it('Tap-to-Advance im Board erhöht den Status um eine Stufe', async () => {
    const { appState } = renderView(seedDb());
    await fireEvent.click(screen.getByRole('button', { name: 'Alle' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Kanban-Board' }));

    const advanceBtn = screen.getByText('→ In Arbeit'); // t1 ist todo -> next=doing
    await fireEvent.click(advanceBtn);

    const updated = appState.db.individuals.get('@I1@')!.tasks.find((t) => t.id === 't1')!;
    expect(updated.status).toBe('doing');
  });
});

describe('TasksView — Aufgabe hinzufügen', () => {
  it('öffnet das Formular, legt eine neue Aufgabe an einer Person an (über PersonPicker, ADR-v9-40)', async () => {
    const { appState } = renderView(seedDb());
    await fireEvent.click(screen.getByRole('button', { name: '+ Aufgabe' }));

    await fireEvent.input(screen.getByPlaceholderText('Was ist zu tun?'), { target: { value: 'Neue Aufgabe' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Kirchenbuch' })); // Preset-Chip (Kategorie-Header ist kein <button>)

    await fireEvent.click(screen.getByLabelText('Ziel-Person'));
    await fireEvent.click(screen.getByText('Otto Bauer'));

    await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    const allTexts = [...appState.db.individuals.values()].flatMap((p) => p.tasks.map((t) => t.text));
    expect(allTexts).toContain('Neue Aufgabe');
  });

  it('wählt gezielt eine NICHT-erste Person aus der Ziel-Liste (PersonPicker-Ergebnisliste)', async () => {
    // Kandidaten sind nach Anzeigename sortiert ("Anna Klein" vor "Otto Bauer") — die
    // Aufgabe muss bei Otto (@I1@) landen, nicht bei Anna (@I2@), um sicherzustellen,
    // dass die Auswahl tatsächlich reagiert (kein "immer erste Option"-Fehler).
    const { appState } = renderView(seedDb());
    await fireEvent.click(screen.getByRole('button', { name: '+ Aufgabe' }));
    await fireEvent.input(screen.getByPlaceholderText('Was ist zu tun?'), { target: { value: 'Für Otto' } });

    await fireEvent.click(screen.getByLabelText('Ziel-Person'));
    await fireEvent.click(screen.getByText('Otto Bauer'));

    await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(appState.db.individuals.get('@I1@')!.tasks.some((t) => t.text === 'Für Otto')).toBe(true);
    expect(appState.db.individuals.get('@I2@')!.tasks.some((t) => t.text === 'Für Otto')).toBe(false);
  });

  it('legt eine Aufgabe an einer Familie an (Ziel-Kind-Umschalter -> FamilyPicker)', async () => {
    const { appState } = renderView(seedDb());
    await fireEvent.click(screen.getByRole('button', { name: '+ Aufgabe' }));
    await fireEvent.input(screen.getByPlaceholderText('Was ist zu tun?'), { target: { value: 'Für die Familie' } });

    await fireEvent.click(screen.getByLabelText('Familie'));
    await fireEvent.click(screen.getByLabelText('Ziel-Familie'));
    await fireEvent.click(screen.getByText('Otto Bauer ⚭ Anna Klein'));

    await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(appState.db.families.get('@F1@')!.tasks.some((t) => t.text === 'Für die Familie')).toBe(true);
  });

  it('setzt einen optionalen Quellen-Bezug über den SourcePicker', async () => {
    const db = seedDb();
    db.sources.set('@S1@', makeSource('@S1@', { abbr: 'KB Musterdorf' }));
    const { appState } = renderView(db);
    await fireEvent.click(screen.getByRole('button', { name: '+ Aufgabe' }));
    await fireEvent.input(screen.getByPlaceholderText('Was ist zu tun?'), { target: { value: 'Mit Quelle' } });

    await fireEvent.click(screen.getByLabelText('Quelle'));
    await fireEvent.click(screen.getByText('KB Musterdorf'));

    await fireEvent.click(screen.getByLabelText('Ziel-Person'));
    await fireEvent.click(screen.getByText('Otto Bauer'));
    await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    const saved = appState.db.individuals.get('@I1@')!.tasks.find((t) => t.text === 'Mit Quelle');
    expect(saved?.sourceRef).toBe('@S1@');
  });

  it('Abbrechen schließt das Formular ohne Aufgabe anzulegen', async () => {
    const { appState } = renderView(seedDb());
    const before = appState.db.individuals.get('@I1@')!.tasks.length;
    await fireEvent.click(screen.getByRole('button', { name: '+ Aufgabe' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));

    expect(screen.queryByPlaceholderText('Was ist zu tun?')).toBeNull();
    expect(appState.db.individuals.get('@I1@')!.tasks.length).toBe(before);
  });
});

describe('TasksView — Status-Wechsel im Listen-Modus + Klick-Navigation zur Trägerentität', () => {
  it('Status-Dropdown in der Liste ändert den Status direkt', async () => {
    const { appState } = renderView(seedDb());
    await fireEvent.click(screen.getByRole('button', { name: 'Alle' }));

    const selects = screen.getAllByLabelText('Status');
    await fireEvent.change(selects[0]!, { target: { value: 'done' } });

    const anyDoneNow = [...appState.db.individuals.values(), ...appState.db.families.values()].some((e) =>
      e.tasks.some((t) => t.status === 'done'),
    );
    expect(anyDoneNow).toBe(true);
  });

  it('Klick auf den Trägerentität-Link ruft den passenden onNavigate-Callback auf', async () => {
    const { onNavigateToPerson } = renderView(seedDb());
    await fireEvent.click(screen.getByText(/Otto Bauer ›/));
    expect(onNavigateToPerson).toHaveBeenCalledWith('@I1@');
  });
});

describe('TasksView — MD-Export-Button vorhanden', () => {
  it('rendert den Export-Button (Download wird über den AnchorDownloadAdapter angestoßen)', () => {
    renderView(seedDb());
    expect(screen.getByRole('button', { name: 'Als Markdown exportieren' })).toBeTruthy();
  });
});
