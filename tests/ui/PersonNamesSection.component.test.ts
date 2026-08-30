// @vitest-environment happy-dom
// tests/ui/PersonNamesSection.component.test.ts — weitere Namensformen im Steckbrief
// (Spec 20 §1.4, Spec 10 §2 „Namen"; Nutzer-Wunsch 2026-08-30 „andere namensformen
// (z.B. aka) les- und editierbar").
//
// Der Kontrakt, den die Component-Ebene hier trägt (und den der reine Kern-Test nicht
// tragen kann): das GATING (kein Mutations-Control ohne „✎ Identität", ADR-v9-30), das
// TIMING (sofort committen, nicht an einem Speichern-Knopf, INV-UI-16) und dass die ART
// im sichtbaren TEXT steht statt nur in einem Tooltip (ADR-v9-183).
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PersonNamesSection from '../../ui/views/person/PersonNamesSection.svelte';
import { makePerson } from '../../core/model';
import type { Person, PersonName } from '../../core/model/types';

function nameForm(over: Partial<PersonName> = {}): PersonName {
  return { nameRaw: '', given: '', surname: '', prefix: '', suffix: '', type: '', citations: [], ...over };
}

function personMit(...formen: PersonName[]): Person {
  const p = makePerson('@I1@', { given: 'Anna', surname: 'Decker' });
  p.extraNames.push(...formen);
  return p;
}

describe('Lesefläche', () => {
  it('zeigt jede Namensform mit ihrer Art im sichtbaren Text (ADR-v9-183)', () => {
    const person = personMit(nameForm({ nameRaw: 'Anna /Meyer/', type: 'married' }));
    render(PersonNamesSection, { props: { person, editing: false, onSave: () => {} } });

    expect(screen.getByText('Anna Meyer', { exact: false })).toBeTruthy();
    // Die Art als Text, nicht als `title`/Tooltip — auf dem Telefon gibt es den Kanal nicht.
    expect(screen.getByText('Ehename')).toBeTruthy();
  });

  it('ein unbekannter TYPE-Wert kommt roh durch, statt still zu einem der fünf zu werden', () => {
    const person = personMit(nameForm({ nameRaw: 'Nonne /Theresia/', type: 'Ordensname' }));
    render(PersonNamesSection, { props: { person, editing: false, onSave: () => {} } });
    expect(screen.getByText('Ordensname')).toBeTruthy();
  });

  it('ohne Namensform und ohne Bearbeiten-Modus steht die Sektion gar nicht da', () => {
    const { container } = render(PersonNamesSection, {
      props: { person: personMit(), editing: false, onSave: () => {} },
    });
    expect(container.querySelector('.person-names')).toBeNull();
  });
});

describe('Gating (ADR-v9-30: kein ungegatetes Mutations-Control)', () => {
  it('ohne Bearbeiten-Modus gibt es weder Eingabefeld noch Entfernen-Knopf', () => {
    const person = personMit(nameForm({ nameRaw: 'Anna /Meyer/', type: 'aka' }));
    const { container } = render(PersonNamesSection, { props: { person, editing: false, onSave: () => {} } });

    expect(container.querySelectorAll('input')).toHaveLength(0);
    expect(container.querySelectorAll('select')).toHaveLength(0);
    expect(screen.queryByText('+ Namensform')).toBeNull();
  });

  it('im Bearbeiten-Modus erscheint die Add-Zeile auch ohne bestehende Form', () => {
    render(PersonNamesSection, { props: { person: personMit(), editing: true, onSave: () => {} } });
    expect(screen.getByText('+ Namensform')).toBeTruthy();
  });
});

describe('Bearbeiten — sofort committen (INV-UI-16), kein Speichern-Knopf', () => {
  it('Nachname ändern meldet die vollständige Person sofort nach oben', async () => {
    const person = personMit(nameForm({ nameRaw: 'Anna /Meyer/', type: 'married' }));
    const onSave = vi.fn();
    render(PersonNamesSection, { props: { person, editing: true, onSave } });

    const feld = screen.getByLabelText('Namensform 1 — Nachname') as HTMLInputElement;
    feld.value = 'Meier';
    await fireEvent.change(feld);

    expect(onSave).toHaveBeenCalledTimes(1);
    const next = onSave.mock.calls[0]![0] as Person;
    expect(next.extraNames[0]!.nameRaw).toBe('Anna /Meier/');
    // Die Sektion hat KEINEN eigenen Speichern-Knopf — das Commit ist bereits passiert.
    expect(screen.queryByText('Speichern')).toBeNull();
  });

  it('die Art wird über das geteilte TypeSelect gesetzt und trägt den ROHEN Wert', async () => {
    const person = personMit(nameForm({ nameRaw: 'Anna /Meyer/' }));
    const onSave = vi.fn();
    render(PersonNamesSection, { props: { person, editing: true, onSave } });

    const wahl = screen.getByLabelText('Namensform 1 — Art') as HTMLSelectElement;
    wahl.value = 'aka';
    await fireEvent.change(wahl);

    const next = onSave.mock.calls[0]![0] as Person;
    // Gespeichert wird `aka`, nicht das deutsche Label — sonst bräche die Interop.
    expect(next.extraNames[0]!.type).toBe('aka');
    // Und der Namenswert bleibt dabei unberührt (ADR-v9-197).
    expect(next.extraNames[0]!.nameRaw).toBe('Anna /Meyer/');
  });

  it('Entfernen meldet die Person ohne diese Form', async () => {
    const person = personMit(nameForm({ nameRaw: 'Anna /Meyer/' }), nameForm({ nameRaw: 'Anna /Klein/' }));
    const onSave = vi.fn();
    render(PersonNamesSection, { props: { person, editing: true, onSave } });

    await fireEvent.click(screen.getByLabelText('Namensform „Anna Meyer“ entfernen'));

    const next = onSave.mock.calls[0]![0] as Person;
    expect(next.extraNames.map((n) => n.nameRaw)).toEqual(['Anna /Klein/']);
  });

  it('Hinzufügen baut die neue Form und leert die Eingabefelder wieder', async () => {
    const person = personMit();
    const onSave = vi.fn();
    render(PersonNamesSection, { props: { person, editing: true, onSave } });

    const vor = screen.getByLabelText('Neue Namensform — Vorname') as HTMLInputElement;
    const nach = screen.getByLabelText('Neue Namensform — Nachname') as HTMLInputElement;
    await fireEvent.input(vor, { target: { value: 'Anna' } });
    await fireEvent.input(nach, { target: { value: 'Meyer' } });
    await fireEvent.click(screen.getByText('+ Namensform'));

    const next = onSave.mock.calls[0]![0] as Person;
    expect(next.extraNames.map((n) => n.nameRaw)).toEqual(['Anna /Meyer/']);
    expect(vor.value).toBe('');
    expect(nach.value).toBe('');
  });

  it('leere Eingabe legt nichts an (kein Commit auf einen toten Knopf)', async () => {
    const onSave = vi.fn();
    render(PersonNamesSection, { props: { person: personMit(), editing: true, onSave } });
    await fireEvent.click(screen.getByText('+ Namensform'));
    expect(onSave).not.toHaveBeenCalled();
  });
});
