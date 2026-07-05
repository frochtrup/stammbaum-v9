// @vitest-environment happy-dom
// tests/ui/PersonForm.component.test.ts — Personen-Editor (Spec 32 §6; Spec 20 §2
// Formular-Feldtabelle "Person"/"Ereignis"). Deckt Identitäts-Felder, Sonder-Ereignisse
// (fest positioniert), events[]-Hinzufügen/Entfernen, Datums-Struktureingabe (Qualifier +
// Tag/Monat/Jahr über parseDateValue/formatDateValue/normalizeMonth), Quellen-Widget
// (Seite/QUAY/Notiz) sowie Speichern/Abbrechen ab. KEIN <select bind:value> mit
// fireEvent.change (bekannter happy-dom-Bug, Commit 3cc3d67) — value/onchange-Muster.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PersonForm from '../../ui/views/person/PersonForm.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makePerson, makeSource, makeCitation } from '../../core/model';

describe('PersonForm — Identität speichern', () => {
  it('speichert geänderte Identitätsfelder über appState.savePerson als vollständiges Objekt', async () => {
    const appState = createAppState();
    const person = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    const onSaved = vi.fn();

    render(PersonForm, { props: { appState, person, onSaved } });

    await fireEvent.input(screen.getByLabelText('Vorname'), { target: { value: 'Anna Maria' } });
    await fireEvent.input(screen.getByLabelText('Nachname'), { target: { value: 'Bauer-Schmidt' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.individuals.get('@I1@')?.given).toBe('Anna Maria');
    expect(appState.db.individuals.get('@I1@')?.surname).toBe('Bauer-Schmidt');
    expect(onSaved).toHaveBeenCalledWith('@I1@');
  });

  it('setzt das Geschlecht per Dropdown (value/onchange-Muster, kein bind:value)', async () => {
    const appState = createAppState();
    const person = makePerson('@I1@', { sex: 'U' });

    render(PersonForm, { props: { appState, person } });

    const select = screen.getByLabelText('Geschlecht') as HTMLSelectElement;
    await fireEvent.change(select, { target: { value: 'F' } });
    expect(select.value).toBe('F');

    await fireEvent.click(screen.getByText('Speichern'));
    expect(appState.db.individuals.get('@I1@')?.sex).toBe('F');
  });

  it('Abbrechen speichert nichts', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna' }));
    appState.loadDatabase(db, 'test.ged');
    const onCancel = vi.fn();

    render(PersonForm, { props: { appState, person: db.individuals.get('@I1@')!, onCancel } });
    await fireEvent.input(screen.getByLabelText('Vorname'), { target: { value: 'Geändert' } });
    await fireEvent.click(screen.getByText('Abbrechen'));

    expect(appState.db.individuals.get('@I1@')?.given).toBe('Anna');
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('PersonForm — Sonder-Ereignisse (Geburt/Taufe/Tod/Bestattung)', () => {
  it('erfasst ein Geburtsdatum strukturiert (Qualifier + Tag/Monat/Jahr) und baut den Raw-String korrekt zusammen', async () => {
    const appState = createAppState();
    const person = makePerson('@I1@');

    render(PersonForm, { props: { appState, person } });

    const birthSection = screen.getByText('Geburt (BIRT)').closest('.person-form__event') as HTMLElement;
    await fireEvent.click(birthSection.querySelector('input[type="checkbox"]')!);
    const dayInput = birthSection.querySelector('input[aria-label="Tag"]') as HTMLInputElement;
    const monthInput = birthSection.querySelector('input[aria-label="Monat"]') as HTMLInputElement;
    const yearInput = birthSection.querySelector('input[aria-label="Jahr"]') as HTMLInputElement;
    await fireEvent.input(dayInput, { target: { value: '12' } });
    await fireEvent.input(monthInput, { target: { value: 'märz' } });
    await fireEvent.change(monthInput, { target: { value: 'märz' } }); // onchange normalisiert den Monat
    await fireEvent.input(yearInput, { target: { value: '1890' } });

    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.individuals.get('@I1@')?.birth.date).toBe('12 MAR 1890');
  });

  it('erfasst die Todesursache im Tod-Abschnitt (cause)', async () => {
    const appState = createAppState();
    const person = makePerson('@I1@');

    render(PersonForm, { props: { appState, person } });

    const deathSection = screen.getByText('Tod (DEAT)').closest('.person-form__event') as HTMLElement;
    const causeInput = Array.from(deathSection.querySelectorAll('label')).find((l) =>
      l.textContent?.includes('Todesursache'),
    )!.querySelector('input') as HTMLInputElement;
    await fireEvent.input(causeInput, { target: { value: 'Typhus' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.individuals.get('@I1@')?.cause).toBe('Typhus');
  });

  it('Ort als Freitext setzt ev.place, ohne placeId/hofId anzutasten', async () => {
    const appState = createAppState();
    const person = makePerson('@I1@');
    person.birth.placeId = '@P1@';

    render(PersonForm, { props: { appState, person } });

    const birthSection = screen.getByText('Geburt (BIRT)').closest('.person-form__event') as HTMLElement;
    const placeInput = Array.from(birthSection.querySelectorAll('label')).find((l) =>
      l.textContent?.includes('Ort (Freitext)'),
    )!.querySelector('input') as HTMLInputElement;
    await fireEvent.input(placeInput, { target: { value: 'Ochtrup' } });
    await fireEvent.change(placeInput, { target: { value: 'Ochtrup' } });
    await fireEvent.click(screen.getByText('Speichern'));

    const saved = appState.db.individuals.get('@I1@')!.birth;
    expect(saved.place).toBe('Ochtrup');
    expect(saved.placeId).toBe('@P1@');
  });
});

describe('PersonForm — weitere Ereignisse (events[]) hinzufügen/entfernen', () => {
  it('fügt ein neues Ereignis per Typ-Auswahl hinzu', async () => {
    const appState = createAppState();
    const person = makePerson('@I1@');

    render(PersonForm, { props: { appState, person } });

    const typeSelect = screen.getByLabelText('Neuer Ereignis-Typ') as HTMLSelectElement;
    await fireEvent.change(typeSelect, { target: { value: 'OCCU' } });
    await fireEvent.click(screen.getByText('+ Ereignis hinzufügen'));
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.individuals.get('@I1@')?.events.map((e) => e.type)).toEqual(['OCCU']);
  });

  it('entfernt ein Ereignis wieder', async () => {
    const appState = createAppState();
    const person = makePerson('@I1@');
    person.events.push({
      type: 'OCCU', value: '', eventType: '', date: null, datePhrase: '', place: null, placeId: null,
      hofId: null, lati: null, long: null, addr: '', note: '', citations: [], media: [], seen: true,
    });

    render(PersonForm, { props: { appState, person } });
    await fireEvent.click(screen.getByLabelText('Ereignis OCCU entfernen'));
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.individuals.get('@I1@')?.events).toHaveLength(0);
  });

  it('EVEN/FACT zeigt ein zusätzliches TYPE-Freitextfeld', async () => {
    const appState = createAppState();
    const person = makePerson('@I1@');

    render(PersonForm, { props: { appState, person } });
    const typeSelect = screen.getByLabelText('Neuer Ereignis-Typ') as HTMLSelectElement;
    await fireEvent.change(typeSelect, { target: { value: 'EVEN' } });
    await fireEvent.click(screen.getByText('+ Ereignis hinzufügen'));

    expect(screen.getByText('Typ-Freitext (TYPE)')).toBeTruthy();
  });

  it('viele Ereignisse gleichzeitig bleiben unabhängig editierbar (TST-7 Überlauf-Fall)', async () => {
    const appState = createAppState();
    const person = makePerson('@I1@');

    render(PersonForm, { props: { appState, person } });
    const typeSelect = screen.getByLabelText('Neuer Ereignis-Typ') as HTMLSelectElement;
    for (let i = 0; i < 12; i += 1) {
      await fireEvent.change(typeSelect, { target: { value: 'OCCU' } });
      await fireEvent.click(screen.getByText('+ Ereignis hinzufügen'));
    }
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.individuals.get('@I1@')?.events).toHaveLength(12);
  });
});

describe('PersonForm — Quellen-Widget pro Ereignis', () => {
  it('fügt eine Quellen-Zitation zur Geburt hinzu (sourceId/page/QUAY/Notiz)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.sources.set('@S1@', makeSource('@S1@', { abbr: 'KB Ochtrup' }));
    const person = makePerson('@I1@');
    db.individuals.set('@I1@', person);
    appState.loadDatabase(db, 'test.ged');

    render(PersonForm, { props: { appState, person: db.individuals.get('@I1@')! } });

    const birthSection = screen.getByText('Geburt (BIRT)').closest('.person-form__event') as HTMLElement;
    await fireEvent.click(birthSection.querySelector('.person-form__add-citation-btn')!);

    const pageInput = screen.getByLabelText('Geburt (BIRT) Seite 1') as HTMLInputElement;
    await fireEvent.change(pageInput, { target: { value: 'fol. 12' } });
    const quaySelect = screen.getByLabelText('Geburt (BIRT) Zuverlässigkeit 1') as HTMLSelectElement;
    await fireEvent.change(quaySelect, { target: { value: '3' } });

    await fireEvent.click(screen.getByText('Speichern'));

    const cit = appState.db.individuals.get('@I1@')?.birth.citations[0];
    expect(cit?.sourceId).toBe('@S1@');
    expect(cit?.page).toBe('fol. 12');
    expect(cit?.quay).toBe(3);
  });

  it('entfernt eine Quellen-Zitation wieder', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.sources.set('@S1@', makeSource('@S1@', { abbr: 'KB Ochtrup' }));
    const person = makePerson('@I1@');
    person.birth.citations.push(makeCitation('@S1@'));
    db.individuals.set('@I1@', person);
    appState.loadDatabase(db, 'test.ged');

    render(PersonForm, { props: { appState, person: db.individuals.get('@I1@')! } });
    await fireEvent.click(screen.getByLabelText('Geburt (BIRT) Quelle 1 entfernen'));
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.individuals.get('@I1@')?.birth.citations).toHaveLength(0);
  });

  it('"+ Quelle hinzufügen" ist deaktiviert, solange keine Quellen im Datenbestand existieren', () => {
    const appState = createAppState();
    const person = makePerson('@I1@');

    render(PersonForm, { props: { appState, person } });

    const btn = screen.getAllByText('+ Quelle hinzufügen')[0] as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

describe('PersonForm — Neue Person (leeres Gerüst)', () => {
  it('zeigt "Neue Person" als Überschrift, wenn given/surname leer sind', () => {
    const appState = createAppState();
    const person = makePerson('@I1@');

    render(PersonForm, { props: { appState, person } });

    expect(screen.getByText('Neue Person')).toBeTruthy();
  });
});
