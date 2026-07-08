// @vitest-environment happy-dom
// tests/ui/Picker.component.test.ts — generische Picker-Shell (ADR-v9-40, INV-UI-4).
// Deckt die entitätsagnostische Mechanik ab (Feld/Panel-Toggle, Filtern per matches-Prop,
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

    expect(screen.getByText('Frucht wählen…')).toBeTruthy();
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

    expect(screen.getByText('Apfel')).toBeTruthy();
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

    await fireEvent.input(screen.getByLabelText('Frucht durchsuchen'), { target: { value: 'Ap' } });

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
