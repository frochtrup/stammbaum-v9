// @vitest-environment happy-dom
// tests/ui/Picker.component.test.ts — generische Picker-Shell (ADR-v9-40, INV-UI-4;
// Combobox-Umbau ADR-v9-103).
// Deckt die entitätsagnostische Mechanik ab (EIN Feld, Filtern per matches-Prop,
// Auswahl/onChange, allowNone, excludeIds, Kapazitäts-Kappung, "+ neu anlegen"-Zeile über
// onCreateRequested) — die entitätsspezifischen Wrapper (PersonPicker/SourcePicker/
// RepositoryPicker/FamilyPicker) haben je eigene, dünnere Tests für Label/Matcher/
// Inline-Neuanlage. KEIN <select bind:value> (Picker rendert Buttons/Listen).
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Picker from '../../ui/shell/Picker.svelte';

interface Fruit {
  id: string;
  name: string;
  color: string;
}

function fruits(): Fruit[] {
  return [
    { id: 'f1', name: 'Apfel', color: 'rot' },
    { id: 'f2', name: 'Banane', color: 'gelb' },
    { id: 'f3', name: 'Aprikose', color: 'orange' },
  ];
}

function matches(f: Fruit, query: string): boolean {
  return f.name.toLowerCase().includes(query.toLowerCase());
}

describe('Picker — Anzeige des Feldes', () => {
  it('zeigt den Platzhalter, solange nichts ausgewählt ist', () => {
    render(Picker, {
      props: {
        items: fruits(),
        getId: (f: Fruit) => f.id,
        getLabel: (f: Fruit) => f.name,
        matches,
        value: null,
        onChange: vi.fn(),
        placeholder: 'Frucht wählen…',
      },
    });

    // Das Feld IST das Eingabefeld (ADR-v9-103) — der Platzhalter steht als Attribut,
    // nicht als Knopfbeschriftung.
    expect(screen.getByPlaceholderText('Frucht wählen…')).toBeTruthy();
  });

  it('zeigt Label + Sublabel der aktuell gewählten Zeile', () => {
    render(Picker, {
      props: {
        items: fruits(),
        getId: (f: Fruit) => f.id,
        getLabel: (f: Fruit) => f.name,
        getSubLabel: (f: Fruit) => f.color,
        matches,
        value: 'f1',
        onChange: vi.fn(),
      },
    });

    // Die Auswahl steht als Wert IM Feld, die Unterzeile darunter.
    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('Apfel');
    expect(screen.getByText('rot')).toBeTruthy();
  });
});

describe('Picker — Filtern + Auswahl', () => {
  it('filtert Kandidaten per Tippen über die matches-Prop', async () => {
    render(Picker, {
      props: {
        items: fruits(),
        getId: (f: Fruit) => f.id,
        getLabel: (f: Fruit) => f.name,
        matches,
        value: null,
        onChange: vi.fn(),
        label: 'Frucht',
      },
    });

    await fireEvent.click(screen.getByLabelText('Frucht'));
    expect(screen.getByText('Apfel')).toBeTruthy();
    expect(screen.getByText('Banane')).toBeTruthy();
    expect(screen.getByText('Aprikose')).toBeTruthy();

    await fireEvent.input(screen.getByLabelText('Frucht'), { target: { value: 'Ap' } });

    expect(screen.getByText('Apfel')).toBeTruthy();
    expect(screen.getByText('Aprikose')).toBeTruthy();
    expect(screen.queryByText('Banane')).toBeNull();
  });

  it('ruft onChange mit der gewählten id auf und schließt das Panel', async () => {
    const onChange = vi.fn();
    render(Picker, {
      props: {
        items: fruits(),
        getId: (f: Fruit) => f.id,
        getLabel: (f: Fruit) => f.name,
        matches,
        value: null,
        onChange,
        label: 'Frucht',
      },
    });

    await fireEvent.click(screen.getByLabelText('Frucht'));
    await fireEvent.click(screen.getByText('Banane'));

    expect(onChange).toHaveBeenCalledWith('f2');
    expect(screen.queryByText('Apfel')).toBeNull(); // Panel geschlossen
  });

  it('allowNone bietet eine "keine Auswahl"-Option, die onChange(null) auslöst', async () => {
    const onChange = vi.fn();
    render(Picker, {
      props: {
        items: fruits(),
        getId: (f: Fruit) => f.id,
        getLabel: (f: Fruit) => f.name,
        matches,
        value: 'f1',
        onChange,
        allowNone: true,
        noneLabel: '— keine Frucht —',
        label: 'Frucht',
      },
    });

    await fireEvent.click(screen.getByLabelText('Frucht'));
    await fireEvent.click(screen.getByText('— keine Frucht —', { selector: '.stb-picker__result--none' }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('excludeIds entfernt Kandidaten aus der Ergebnisliste', async () => {
    render(Picker, {
      props: {
        items: fruits(),
        getId: (f: Fruit) => f.id,
        getLabel: (f: Fruit) => f.name,
        matches,
        value: null,
        onChange: vi.fn(),
        excludeIds: ['f2'],
        label: 'Frucht',
      },
    });

    await fireEvent.click(screen.getByLabelText('Frucht'));
    expect(screen.getByText('Apfel')).toBeTruthy();
    expect(screen.queryByText('Banane', { selector: '.stb-picker__result-name' })).toBeNull();
  });

  it('viele dicht benannte Kandidaten bleiben bedienbar (TST-7 Überlauf-Fall) — Liste wird gekappt', async () => {
    const many: Fruit[] = [];
    for (let i = 0; i < 40; i += 1) {
      many.push({ id: `f${i}`, name: `Frucht${String(i).padStart(2, '0')}`, color: 'x' });
    }

    render(Picker, {
      props: {
        items: many,
        getId: (f: Fruit) => f.id,
        getLabel: (f: Fruit) => f.name,
        matches,
        value: null,
        onChange: vi.fn(),
        label: 'Frucht',
      },
    });
    await fireEvent.click(screen.getByLabelText('Frucht'));

    const results = document.querySelectorAll('.stb-picker__result-name');
    expect(results.length).toBeLessThan(40);
    expect(screen.getByText(/weitere/)).toBeTruthy();
  });
});

describe('Picker — "+ neu anlegen"-Zeile', () => {
  it('erscheint nur, wenn createLabel UND onCreateRequested gesetzt sind', async () => {
    render(Picker, {
      props: {
        items: fruits(),
        getId: (f: Fruit) => f.id,
        getLabel: (f: Fruit) => f.name,
        matches,
        value: null,
        onChange: vi.fn(),
        label: 'Frucht',
      },
    });
    await fireEvent.click(screen.getByLabelText('Frucht'));
    expect(screen.queryByText(/neu anlegen/)).toBeNull();
  });

  it('ruft onCreateRequested auf und schließt das Panel (Ort/Hof-Fall: kein Create-Slot nötig)', async () => {
    const onCreateRequested = vi.fn();
    render(Picker, {
      props: {
        items: fruits(),
        getId: (f: Fruit) => f.id,
        getLabel: (f: Fruit) => f.name,
        matches,
        value: null,
        onChange: vi.fn(),
        label: 'Frucht',
        createLabel: '+ Neue Frucht anlegen …',
        onCreateRequested,
      },
    });
    await fireEvent.click(screen.getByLabelText('Frucht'));
    await fireEvent.click(screen.getByText('+ Neue Frucht anlegen …'));

    expect(onCreateRequested).toHaveBeenCalledTimes(1);
  });
});

describe('Picker — EIN Feld: das sichtbare Feld IST das Suchfeld (ADR-v9-103)', () => {
  it('hat genau ein Eingabefeld — kein zweites Suchfeld hinter einem Auslöser', async () => {
    render(Picker, {
      props: { items: fruits(), getId: (f: Fruit) => f.id, getLabel: (f: Fruit) => f.name, matches, value: null, onChange: vi.fn(), label: 'Frucht' },
    });

    await fireEvent.click(screen.getByLabelText('Frucht'));

    // Der eigentliche Nutzerbefund: vorher öffnete das Feld ein Panel mit einem ZWEITEN,
    // eigenen Suchfeld — eine bestehende Zeile zu wählen kostete dadurch vier Schritte.
    expect(document.querySelectorAll('input')).toHaveLength(1);
  });

  it('meldet Combobox-Semantik und koppelt das Feld an die Trefferliste', async () => {
    render(Picker, {
      props: { items: fruits(), getId: (f: Fruit) => f.id, getLabel: (f: Fruit) => f.name, matches, value: null, onChange: vi.fn(), label: 'Frucht' },
    });

    const field = screen.getByRole('combobox');
    expect(field.getAttribute('aria-expanded')).toBe('false');

    await fireEvent.click(field);

    expect(field.getAttribute('aria-expanded')).toBe('true');
    const list = screen.getByRole('listbox');
    expect(field.getAttribute('aria-controls')).toBe(list.id);
    // Eigener Name je Element — zwei gleichnamige sind für Screenreader ununterscheidbar.
    expect(list.getAttribute('aria-label')).not.toBe(field.getAttribute('aria-label'));
  });

  it('bedient die Liste per Tastatur: ↓ steuert an, Enter wählt', async () => {
    const onChange = vi.fn();
    render(Picker, {
      props: { items: fruits(), getId: (f: Fruit) => f.id, getLabel: (f: Fruit) => f.name, matches, value: null, onChange, label: 'Frucht' },
    });

    const field = screen.getByRole('combobox');
    await fireEvent.keyDown(field, { key: 'ArrowDown' });
    expect(field.getAttribute('aria-activedescendant')).toBeTruthy();
    await fireEvent.keyDown(field, { key: 'Enter' });

    // Alphabetisch sortiert: Apfel, Aprikose, Banane.
    expect(onChange).toHaveBeenCalledWith('f1');
  });

  it('Escape schließt die Liste und öffnet sie nicht sofort wieder', async () => {
    render(Picker, {
      props: { items: fruits(), getId: (f: Fruit) => f.id, getLabel: (f: Fruit) => f.name, matches, value: null, onChange: vi.fn(), label: 'Frucht' },
    });

    const field = screen.getByRole('combobox');
    await fireEvent.click(field);
    await fireEvent.keyDown(field, { key: 'Escape' });

    // Beim Bau lag hier ein `focus()` im Escape-Zweig — das löste `onfocus` aus und
    // öffnete die eben geschlossene Liste sofort wieder.
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('Picker — Freitext-Modus (Ereignis-Ort/-Adresse, ADR-v9-42 + ADR-v9-103)', () => {
  it('meldet jeden Tastendruck als Text — auch wenn er auf keinen Kandidaten passt', async () => {
    const onTextChange = vi.fn();
    render(Picker, {
      props: {
        items: fruits(), getId: (f: Fruit) => f.id, getLabel: (f: Fruit) => f.name, matches,
        value: null, onChange: vi.fn(), label: 'Frucht',
        freeText: true, textValue: '', onTextChange,
      },
    });

    await fireEvent.input(screen.getByLabelText('Frucht'), { target: { value: 'Kein Kandidat' } });

    // Freitext bleibt Freitext (ADR-v9-42).
    expect(onTextChange).toHaveBeenCalledWith('Kein Kandidat');
  });

  it('zeigt den vom Aufrufer gehaltenen Text als Feldwert', () => {
    render(Picker, {
      props: {
        items: fruits(), getId: (f: Fruit) => f.id, getLabel: (f: Fruit) => f.name, matches,
        value: null, onChange: vi.fn(), label: 'Frucht',
        freeText: true, textValue: 'Handgetippter Ort', onTextChange: vi.fn(),
      },
    });

    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('Handgetippter Ort');
  });

  it('behandelt den VORHANDENEN Text nicht als Suchbegriff — beim Hineinklicken stehen alle Kandidaten da', async () => {
    render(Picker, {
      props: {
        items: fruits(), getId: (f: Fruit) => f.id, getLabel: (f: Fruit) => f.name, matches,
        value: null, onChange: vi.fn(), label: 'Frucht',
        // Ein Ereignis-Ort trägt typischerweise die volle Verwaltungskette. Würde dieser
        // Text als Suchbegriff gelten, stünde beim Hineinklicken "Keine Treffer" und der
        // Nutzer müsste erst löschen, um überhaupt auswählen zu können — genau die
        // Reibung, die dieser Umbau beseitigen soll (am echten Bestand aufgefallen,
        // nicht in den Tests).
        freeText: true, textValue: 'Steinwedel, Amt Burgdorf (Hannover), Kurfürstentum', onTextChange: vi.fn(),
      },
    });

    await fireEvent.click(screen.getByLabelText('Frucht'));

    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('filtert erst, sobald tatsächlich getippt wurde', async () => {
    const { rerender } = render(Picker, {
      props: {
        items: fruits(), getId: (f: Fruit) => f.id, getLabel: (f: Fruit) => f.name, matches,
        value: null, onChange: vi.fn(), label: 'Frucht',
        freeText: true, textValue: '', onTextChange: vi.fn(),
      },
    });

    await fireEvent.input(screen.getByLabelText('Frucht'), { target: { value: 'Ban' } });
    // Der Aufrufer hält den Text — im echten Formular kommt er als neue Prop zurück.
    await rerender({ textValue: 'Ban' });

    expect(screen.getAllByRole('option').map((o) => o.textContent?.trim())).toEqual(['Banane']);
  });
});
