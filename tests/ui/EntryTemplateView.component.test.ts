// @vitest-environment happy-dom
// tests/ui/EntryTemplateView.component.test.ts — die Arbeitsfläche „Erfassung" (BL-353,
// ADR-v9-265/ADR-v9-264). Fertig-Zustand: eine im Builder gebaute Vorlage ist von einer
// mitgelieferten NICHT unterscheidbar — gleicher Typ (`EntryTemplate`), gleicher
// Anwenden-Pfad (`applyEntryTemplate`).
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import EntryView from '../../ui/views/entry/EntryView.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { applyEntryTemplate, makeEntryDraft } from '../../core/model';
import { BUILTIN_ENTRY_TEMPLATES, type EntryTemplate } from '../../core/model/entry-templates';
import { createEntryTemplatesState } from '../../ui/shell/entry-templates-state.svelte';
import type { EntryTemplatesStore } from '../../services/app-data';
import { bestaetige, brichAb, rueckfrageOffen } from './confirm-helper';

/** In-Memory-Attrappe — kein IndexedDB in happy-dom nötig, dieselbe Speicher-Semantik wie
 *  `AppDataEntryTemplatesStore.save`: überschreibt die ganze Liste. */
function memoryStore(initial: EntryTemplate[] = []): EntryTemplatesStore {
  let saved = initial;
  return {
    async load() {
      return saved;
    },
    async save(templates) {
      saved = templates;
    },
  };
}

describe('EntryView — Liste (Einstieg, ADR-v9-265 Entscheidung 2)', () => {
  it('zeigt die drei mitgelieferten Vorlagen mit ihrer Rollen-Kurzfassung', async () => {
    const appState = createAppState();
    render(EntryView, { props: { appState, templates: createEntryTemplatesState(memoryStore()) } });

    await vi.waitFor(() => expect(screen.getByText('Heirat (Heiratsbuch)')).toBeTruthy());
    expect(screen.getByText('Taufe (Taufbuch)')).toBeTruthy();
    expect(screen.getByText('Sterbefall (Sterberegister)')).toBeTruthy();
  });

  it('mitgelieferte Vorlagen sind kopierbar, aber NICHT bearbeitbar/löschbar (ADR-v9-264 E8, INV-UI-2)', async () => {
    const appState = createAppState();
    render(EntryView, { props: { appState, templates: createEntryTemplatesState(memoryStore()) } });
    await vi.waitFor(() => expect(screen.getByText('Taufe (Taufbuch)')).toBeTruthy());

    const row = screen.getByText('Taufe (Taufbuch)').closest('li')!;
    expect(within(row).getByRole('button', { name: /kopieren/ })).toBeTruthy();
    expect(within(row).queryByRole('button', { name: /bearbeiten/ })).toBeNull();
    expect(within(row).queryByRole('button', { name: /löschen/ })).toBeNull();
  });

  it('eine eigene Vorlage trägt alle vier Aktionen: erfassen · bearbeiten · kopieren · löschen', async () => {
    const appState = createAppState();
    const custom: EntryTemplate = {
      id: 'et_custom',
      label: 'Meine Vorlage',
      slots: [{ role: 'main', field: 'given' }],
    };
    render(EntryView, { props: { appState, templates: createEntryTemplatesState(memoryStore([custom])) } });
    await vi.waitFor(() => expect(screen.getByText('Meine Vorlage')).toBeTruthy());

    const row = screen.getByText('Meine Vorlage').closest('li')!;
    expect(within(row).getByRole('button', { name: /Erfassen/ })).toBeTruthy();
    expect(within(row).getByRole('button', { name: /bearbeiten/ })).toBeTruthy();
    expect(within(row).getByRole('button', { name: /kopieren/ })).toBeTruthy();
    expect(within(row).getByRole('button', { name: /löschen/ })).toBeTruthy();
  });
});

describe('EntryView — Löschen über ConfirmDialog (TST-27, kein window.confirm)', () => {
  it('fragt nach, entfernt erst nach Bestätigung', async () => {
    const appState = createAppState();
    const custom: EntryTemplate = { id: 'et_x', label: 'Löschbar', slots: [{ role: 'main', field: 'given' }] };
    const templates = createEntryTemplatesState(memoryStore([custom]));
    render(EntryView, { props: { appState, templates } });
    await vi.waitFor(() => expect(screen.getByText('Löschbar')).toBeTruthy());

    const row = screen.getByText('Löschbar').closest('li')!;
    await fireEvent.click(within(row).getByRole('button', { name: /löschen/ }));
    expect(rueckfrageOffen()).toBe(true);

    await brichAb();
    expect(screen.getByText('Löschbar')).toBeTruthy(); // Abbrechen lässt sie stehen

    await fireEvent.click(within(row).getByRole('button', { name: /löschen/ }));
    await bestaetige('Löschen');
    expect(screen.queryByText('Löschbar')).toBeNull();
    expect(templates.templates).toHaveLength(0);
  });
});

describe('EntryView — INV-VS: genau eine Auswahl-Instanz, frischer Entwurf je Vorlage', () => {
  it('Builder-Zustand einer abgebrochenen Vorlage überlebt nicht in den nächsten Builder', async () => {
    const appState = createAppState();
    render(EntryView, { props: { appState, templates: createEntryTemplatesState(memoryStore()) } });
    await vi.waitFor(() => expect(screen.getByText('Heirat (Heiratsbuch)')).toBeTruthy());

    await fireEvent.click(screen.getByText('＋ Neue Vorlage'));
    await fireEvent.input(screen.getByLabelText('Vorlagenname'), { target: { value: 'Angefangen, nie gespeichert' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Builder schließen' }));

    // Zurück in der Liste — der Entwurf ist weg, keine Karteileiche.
    expect(screen.queryByText('Angefangen, nie gespeichert')).toBeNull();

    await fireEvent.click(screen.getByText('＋ Neue Vorlage'));
    expect((screen.getByLabelText('Vorlagenname') as HTMLInputElement).value).toBe('');
  });

  it('genau EIN Modus ist sichtbar — Liste UND Builder erscheinen nie gleichzeitig', async () => {
    const appState = createAppState();
    render(EntryView, { props: { appState, templates: createEntryTemplatesState(memoryStore()) } });
    await vi.waitFor(() => expect(screen.getByText('＋ Neue Vorlage')).toBeTruthy());

    await fireEvent.click(screen.getByText('＋ Neue Vorlage'));
    expect(screen.queryByText('＋ Neue Vorlage')).toBeNull();
    expect(screen.getByLabelText('Vorlagenname')).toBeTruthy();
  });
});

describe('EntryView — Builder: eine gebaute Vorlage ist von einer mitgelieferten nicht unterscheidbar (Fertig-Zustand BL-353)', () => {
  it('baut eine Vorlage über die UI und wendet sie über applyEntryTemplate an — wie eine mitgelieferte', async () => {
    const appState = createAppState();
    const templates = createEntryTemplatesState(memoryStore());
    render(EntryView, { props: { appState, templates } });
    await vi.waitFor(() => expect(screen.getByText('＋ Neue Vorlage')).toBeTruthy());

    await fireEvent.click(screen.getByText('＋ Neue Vorlage'));
    await fireEvent.input(screen.getByLabelText('Vorlagenname'), { target: { value: 'Mein Taufeintrag' } });

    const mainSection = screen.getByText('Hauptperson').closest('section')!;
    await fireEvent.click(within(mainSection).getByRole('button', { name: 'Vorname' }));
    await fireEvent.click(within(mainSection).getByRole('button', { name: 'Nachname' }));

    // Ereignis über EventTypeMenu — INV-UI-8, keine zweite Typ-Liste. „Geburt" ist
    // eindeutig beschriftet (BIRT). Seit dem CHR/BAPM-Befund ist jedes Label eindeutig —
    // ein Wächter in entry-template-capture-model.test.ts hält das fest.
    await fireEvent.click(within(mainSection).getByRole('button', { name: '＋ Ereignis' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Geburt' }));

    expect(screen.getByText('Geburt')).toBeTruthy(); // die neue Ereignisgruppe ist entstanden

    await fireEvent.click(screen.getByRole('button', { name: 'Vorlage speichern' }));

    // Zurück in der Liste — die eigene Vorlage steht neben den mitgelieferten.
    await vi.waitFor(() => expect(screen.getByText('Mein Taufeintrag')).toBeTruthy());
    expect(screen.getByText('Heirat (Heiratsbuch)')).toBeTruthy();

    const built = templates.templates.find((t) => t.label === 'Mein Taufeintrag');
    expect(built).toBeTruthy();
    expect(built!.slots.map((s) => `${s.role}.${s.field}`).sort()).toEqual(['main.date', 'main.given', 'main.surname']);

    // DERSELBE Kommando-Pfad wie bei einer mitgelieferten Vorlage — kein zweiter Weg.
    const draft = makeEntryDraft({
      values: { 'main.given': 'Josef', 'main.surname': 'Zurloh', 'main.BIRT.date': '1850' },
    });
    const result = applyEntryTemplate(appState.db, built!, draft);
    expect(result.ambiguous).toEqual([]);
    const person = result.db.individuals.get(result.persons.main!)!;
    expect(person.given).toBe('Josef');
    expect(person.surname).toBe('Zurloh');
    expect(person.birth.date).toBe('1850');

    // Gegenprobe: eine ECHTE mitgelieferte Vorlage läuft durch dieselbe Funktion, mit
    // derselben Draft-Form — „gleicher Typ, gleicher Anwenden-Pfad" ist keine Behauptung
    // über die gebaute Vorlage allein, sondern über die Funktion, die beide bedient.
    const taufe = BUILTIN_ENTRY_TEMPLATES.find((t) => t.id === 'taufe')!;
    const builtinDraft = makeEntryDraft({
      values: { 'main.given': 'Anna', 'main.surname': 'Decker', 'main.CHR.date': '1851' },
    });
    const builtinResult = applyEntryTemplate(appState.db, taufe, builtinDraft);
    expect(builtinResult.ambiguous).toEqual([]);
    const builtinPerson = builtinResult.db.individuals.get(builtinResult.persons.main!)!;
    expect(builtinPerson.given).toBe('Anna');
  });

  it('lässt sich NICHT ohne Namen/Felder speichern (leere Vorlage bleibt verhindert)', async () => {
    const appState = createAppState();
    render(EntryView, { props: { appState, templates: createEntryTemplatesState(memoryStore()) } });
    await vi.waitFor(() => expect(screen.getByText('＋ Neue Vorlage')).toBeTruthy());

    await fireEvent.click(screen.getByText('＋ Neue Vorlage'));
    const saveBtn = screen.getByRole('button', { name: 'Vorlage speichern' }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
    expect(screen.getByText('Die Vorlage braucht einen Namen.')).toBeTruthy();
    expect(screen.getByText('Die Vorlage braucht mindestens ein Feld.')).toBeTruthy();
  });
});

describe('EntryView — Kopieren (mitgeliefert UND eigen), Bearbeiten', () => {
  it('kopiert eine mitgelieferte Vorlage — die Kopie ist danach eine ganz normale eigene Vorlage', async () => {
    const appState = createAppState();
    const templates = createEntryTemplatesState(memoryStore());
    render(EntryView, { props: { appState, templates } });
    await vi.waitFor(() => expect(screen.getByText('Heirat (Heiratsbuch)')).toBeTruthy());

    const row = screen.getByText('Heirat (Heiratsbuch)').closest('li')!;
    await fireEvent.click(within(row).getByRole('button', { name: /kopieren/ }));

    expect((screen.getByLabelText('Vorlagenname') as HTMLInputElement).value).toBe('Heirat (Heiratsbuch) (Kopie)');
    await fireEvent.click(screen.getByRole('button', { name: 'Vorlage speichern' }));

    await vi.waitFor(() => expect(screen.getByText('Heirat (Heiratsbuch) (Kopie)')).toBeTruthy());
    const copyRow = screen.getByText('Heirat (Heiratsbuch) (Kopie)').closest('li')!;
    // Jetzt eine eigene Vorlage — bearbeitbar UND löschbar, anders als das Original.
    expect(within(copyRow).getByRole('button', { name: /bearbeiten/ })).toBeTruthy();
    expect(within(copyRow).getByRole('button', { name: /löschen/ })).toBeTruthy();
    expect(templates.templates).toHaveLength(1);
  });

  it('bearbeitet eine eigene Vorlage — der Builder startet mit ihrem Stand', async () => {
    const appState = createAppState();
    const custom: EntryTemplate = {
      id: 'et_edit',
      label: 'Alter Name',
      slots: [{ role: 'main', field: 'given' }],
    };
    const templates = createEntryTemplatesState(memoryStore([custom]));
    render(EntryView, { props: { appState, templates } });
    await vi.waitFor(() => expect(screen.getByText('Alter Name')).toBeTruthy());

    const row = screen.getByText('Alter Name').closest('li')!;
    await fireEvent.click(within(row).getByRole('button', { name: /bearbeiten/ }));
    expect((screen.getByLabelText('Vorlagenname') as HTMLInputElement).value).toBe('Alter Name');

    await fireEvent.input(screen.getByLabelText('Vorlagenname'), { target: { value: 'Neuer Name' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Vorlage speichern' }));

    await vi.waitFor(() => expect(screen.getByText('Neuer Name')).toBeTruthy());
    expect(screen.queryByText('Alter Name')).toBeNull();
    // Bearbeiten ändert die BESTEHENDE Vorlage, legt keine zweite an.
    expect(templates.templates).toHaveLength(1);
  });
});

describe('EntryView — Erfassen öffnet die gebaute EntryTemplateCapture (BL-352 unverändert)', () => {
  it('Klick auf „▶ Erfassen" öffnet die Erfassungs-Fläche der gewählten Vorlage', async () => {
    const appState = createAppState();
    render(EntryView, { props: { appState, templates: createEntryTemplatesState(memoryStore()) } });
    await vi.waitFor(() => expect(screen.getByText('Taufe (Taufbuch)')).toBeTruthy());

    const row = screen.getByText('Taufe (Taufbuch)').closest('li')!;
    await fireEvent.click(within(row).getByRole('button', { name: /Erfassen/ }));

    // EntryTemplateCapture rendert den Vorlagennamen als Überschrift.
    expect(screen.getByRole('heading', { name: 'Taufe (Taufbuch)' })).toBeTruthy();
    expect(screen.getByLabelText('Hauptperson Vorname')).toBeTruthy();
  });
});
