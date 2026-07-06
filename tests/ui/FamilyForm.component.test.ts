// @vitest-environment happy-dom
// tests/ui/FamilyForm.component.test.ts — Familien-Editor (Spec 32 §6; Spec 20 §2
// Formular-Feldtabelle "Familie": Eltern (Dropdown), Heirat + Verlobung, Kinder ±,
// Quellen). Deckt Eltern-Dropdowns, Sonder-Ereignisse (Heirat/Verlobung), Kinder ±,
// weitere Ereignisse, Familien-Quellen sowie Speichern/Abbrechen ab. KEIN
// <select bind:value> mit fireEvent.change (bekannter happy-dom-Bug) — value/onchange-
// Muster wie PersonForm.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import FamilyForm from '../../ui/views/family/FamilyForm.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makeFamily, makePerson, makeSource, makeCitation } from '../../core/model';

function seedThreePersons() {
  const appState = createAppState();
  const db = makeDatabase();
  db.individuals.set('@I1@', makePerson('@I1@', { given: 'Otto', surname: 'Bauer' }));
  db.individuals.set('@I2@', makePerson('@I2@', { given: 'Anna', surname: 'Klein' }));
  db.individuals.set('@I3@', makePerson('@I3@', { given: 'Karl', surname: 'Bauer' }));
  appState.loadDatabase(db, 'test.ged');
  return appState;
}

describe('FamilyForm — Eltern speichern', () => {
  it('setzt Ehemann/Ehefrau per PersonPicker (Klick auf Feld, Ergebnis wählen) und speichert über appState.saveFamily', async () => {
    const appState = seedThreePersons();
    const family = makeFamily('@F1@');
    const onSaved = vi.fn();

    render(FamilyForm, { props: { appState, family, onSaved } });

    await fireEvent.click(screen.getByLabelText('Ehemann'));
    await fireEvent.click(screen.getByText('Otto Bauer'));
    await fireEvent.click(screen.getByLabelText('Ehefrau'));
    await fireEvent.click(screen.getByText('Anna Klein'));
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.families.get('@F1@')?.husband).toBe('@I1@');
    expect(appState.db.families.get('@F1@')?.wife).toBe('@I2@');
    expect(onSaved).toHaveBeenCalledWith('@F1@');
  });

  it('"— kein Elternteil —" setzt husband/wife zurück auf null', async () => {
    const appState = seedThreePersons();
    const family = makeFamily('@F1@', { husband: '@I1@' });
    appState.saveFamily(family);

    render(FamilyForm, { props: { appState, family: appState.db.families.get('@F1@')! } });

    await fireEvent.click(screen.getByLabelText('Ehemann'));
    await fireEvent.click(screen.getByText('— kein Elternteil —', { selector: '.person-picker__result--none' }));
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.families.get('@F1@')?.husband).toBeNull();
  });

  it('führt beim Speichern die INDI-Seite (parentIn) nach — sichtbarer Beweis für INV-P3 aus der Formular-Perspektive', async () => {
    const appState = seedThreePersons();
    const family = makeFamily('@F1@');

    render(FamilyForm, { props: { appState, family } });
    await fireEvent.click(screen.getByLabelText('Ehemann'));
    await fireEvent.click(screen.getByText('Otto Bauer'));
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.individuals.get('@I1@')?.parentIn).toContain('@F1@');
  });

  it('Abbrechen speichert nichts', async () => {
    const appState = seedThreePersons();
    const family = makeFamily('@F1@');
    appState.saveFamily(family);
    const onCancel = vi.fn();

    render(FamilyForm, { props: { appState, family: appState.db.families.get('@F1@')!, onCancel } });
    await fireEvent.click(screen.getByLabelText('Ehemann'));
    await fireEvent.click(screen.getByText('Otto Bauer'));
    await fireEvent.click(screen.getByText('Abbrechen'));

    expect(appState.db.families.get('@F1@')?.husband).toBeNull();
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('FamilyForm — Heirat (MARR) + Verlobung (ENGA)', () => {
  it('erfasst ein Heiratsdatum strukturiert (Qualifier + Tag/Monat/Jahr)', async () => {
    const appState = seedThreePersons();
    const family = makeFamily('@F1@');

    render(FamilyForm, { props: { appState, family } });

    const marriageSection = screen.getByText('Heirat (MARR)').closest('.family-form__event') as HTMLElement;
    await fireEvent.click(marriageSection.querySelector('input[type="checkbox"]')!);
    const dayInput = marriageSection.querySelector('input[aria-label="Tag"]') as HTMLInputElement;
    const monthInput = marriageSection.querySelector('input[aria-label="Monat"]') as HTMLInputElement;
    const yearInput = marriageSection.querySelector('input[aria-label="Jahr"]') as HTMLInputElement;
    await fireEvent.input(dayInput, { target: { value: '5' } });
    await fireEvent.input(monthInput, { target: { value: 'juni' } });
    await fireEvent.change(monthInput, { target: { value: 'juni' } });
    await fireEvent.input(yearInput, { target: { value: '1920' } });

    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.families.get('@F1@')?.marriage.date).toBe('5 JUN 1920');
  });

  it('erfasst ein Verlobungsdatum unabhängig vom Heiratsdatum', async () => {
    const appState = seedThreePersons();
    const family = makeFamily('@F1@');

    render(FamilyForm, { props: { appState, family } });

    const engagementSection = screen.getByText('Verlobung (ENGA)').closest('.family-form__event') as HTMLElement;
    await fireEvent.click(engagementSection.querySelector('input[type="checkbox"]')!);
    const yearInput = engagementSection.querySelector('input[aria-label="Jahr"]') as HTMLInputElement;
    await fireEvent.input(yearInput, { target: { value: '1919' } });

    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.families.get('@F1@')?.engagement.date).toBe('1919');
    expect(appState.db.families.get('@F1@')?.marriage.date).toBeNull();
  });
});

describe('FamilyForm — Kinder (± Liste)', () => {
  it('fügt ein Kind per Picker hinzu (Auswahl fügt sofort hinzu, kein Zwischenschritt)', async () => {
    const appState = seedThreePersons();
    const family = makeFamily('@F1@');

    render(FamilyForm, { props: { appState, family } });

    await fireEvent.click(screen.getByLabelText('Kind hinzufügen'));
    await fireEvent.click(screen.getByText('Karl Bauer'));
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.families.get('@F1@')?.children).toEqual(['@I3@']);
    expect(appState.db.individuals.get('@I3@')?.childOf.map((c) => c.familyId)).toContain('@F1@');
  });

  it('bereits zugeordnete Kinder werden im Picker nicht nochmal angeboten (excludeIds)', async () => {
    const appState = seedThreePersons();
    const family = makeFamily('@F1@', { children: ['@I1@'] });
    appState.saveFamily(family);

    render(FamilyForm, { props: { appState, family: appState.db.families.get('@F1@')! } });

    await fireEvent.click(screen.getByLabelText('Kind hinzufügen'));
    expect(screen.queryByText('Otto Bauer', { selector: '.person-picker__result-name' })).toBeNull();
  });

  it('entfernt ein Kind wieder (kein Diffing im UI nötig — volle Zielliste wird gebaut)', async () => {
    const appState = seedThreePersons();
    const family = makeFamily('@F1@', { children: ['@I1@', '@I3@'] });
    appState.saveFamily(family);

    render(FamilyForm, { props: { appState, family: appState.db.families.get('@F1@')! } });
    await fireEvent.click(screen.getByLabelText('Kind Otto Bauer entfernen'));
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.families.get('@F1@')?.children).toEqual(['@I3@']);
    expect(appState.db.individuals.get('@I1@')?.childOf).toHaveLength(0);
  });

  it('viele Kinder gleichzeitig bleiben unabhängig entfernbar (TST-7 Überlauf-Fall)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    const childIds: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const id = `@I${i}@`;
      db.individuals.set(id, makePerson(id, { given: `Kind${i}` }));
      childIds.push(id);
    }
    const family = makeFamily('@F1@', { children: childIds });
    db.families.set('@F1@', family);
    appState.loadDatabase(db, 'test.ged');

    render(FamilyForm, { props: { appState, family: appState.db.families.get('@F1@')! } });
    await fireEvent.click(screen.getByLabelText('Kind Kind3 entfernen'));
    await fireEvent.click(screen.getByText('Speichern'));

    const saved = appState.db.families.get('@F1@')?.children ?? [];
    expect(saved).toHaveLength(9);
    expect(saved).not.toContain('@I3@');
  });
});

describe('FamilyForm — weitere Ereignisse (events[]) hinzufügen/entfernen', () => {
  it('fügt ein neues Ereignis per Typ-Auswahl hinzu', async () => {
    const appState = seedThreePersons();
    const family = makeFamily('@F1@');

    render(FamilyForm, { props: { appState, family } });

    const typeSelect = screen.getByLabelText('Neuer Ereignis-Typ') as HTMLSelectElement;
    await fireEvent.change(typeSelect, { target: { value: 'CENS' } });
    await fireEvent.click(screen.getByText('+ Ereignis hinzufügen'));
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.families.get('@F1@')?.events.map((e) => e.type)).toEqual(['CENS']);
  });

  it('entfernt ein Ereignis wieder', async () => {
    const appState = seedThreePersons();
    const family = makeFamily('@F1@');
    family.events.push({
      type: 'CENS', value: '', eventType: '', date: null, datePhrase: '', place: null, placeId: null,
      hofId: null, lati: null, long: null, addr: '', note: '', citations: [], media: [], seen: true,
    });

    render(FamilyForm, { props: { appState, family } });
    await fireEvent.click(screen.getByLabelText('Ereignis CENS entfernen'));
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.families.get('@F1@')?.events).toHaveLength(0);
  });
});

describe('FamilyForm — Familien-Quellen', () => {
  it('fügt eine Quellen-Zitation zur Familie hinzu (sourceId/page/QUAY/Notiz)', async () => {
    const appState = seedThreePersons();
    const db = appState.db;
    db.sources.set('@S1@', makeSource('@S1@', { abbr: 'KB Ochtrup' }));
    const family = makeFamily('@F1@');
    db.families.set('@F1@', family);
    appState.loadDatabase(db, 'test.ged');

    render(FamilyForm, { props: { appState, family: appState.db.families.get('@F1@')! } });

    const familyCitations = screen.getByText('Quellen (Familie)').closest('.family-form__citations') as HTMLElement;
    await fireEvent.click(familyCitations.querySelector('.family-form__add-citation-btn')!);

    const pageInput = screen.getByLabelText('Familie Seite 1') as HTMLInputElement;
    await fireEvent.change(pageInput, { target: { value: 'fol. 3' } });
    const quaySelect = screen.getByLabelText('Familie Zuverlässigkeit 1') as HTMLSelectElement;
    await fireEvent.change(quaySelect, { target: { value: '2' } });

    await fireEvent.click(screen.getByText('Speichern'));

    const cit = appState.db.families.get('@F1@')?.citations[0];
    expect(cit?.sourceId).toBe('@S1@');
    expect(cit?.page).toBe('fol. 3');
    expect(cit?.quay).toBe(2);
  });

  it('entfernt eine Familien-Quellen-Zitation wieder', async () => {
    const appState = seedThreePersons();
    const db = appState.db;
    db.sources.set('@S1@', makeSource('@S1@', { abbr: 'KB Ochtrup' }));
    const family = makeFamily('@F1@');
    family.citations.push(makeCitation('@S1@'));
    db.families.set('@F1@', family);
    appState.loadDatabase(db, 'test.ged');

    render(FamilyForm, { props: { appState, family: appState.db.families.get('@F1@')! } });
    await fireEvent.click(screen.getByLabelText('Familie Quelle 1 entfernen'));
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.families.get('@F1@')?.citations).toHaveLength(0);
  });

  it('"+ Quelle hinzufügen" ist deaktiviert, solange keine Quellen im Datenbestand existieren', () => {
    const appState = seedThreePersons();
    const family = makeFamily('@F1@');

    render(FamilyForm, { props: { appState, family } });

    const btn = screen.getAllByText('+ Quelle hinzufügen')[0] as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

describe('FamilyForm — Neue Familie (leeres Gerüst)', () => {
  it('zeigt "Neue Familie" als Überschrift, wenn keine Eltern/Kinder gesetzt sind', () => {
    const appState = seedThreePersons();
    const family = makeFamily('@F1@');

    render(FamilyForm, { props: { appState, family } });

    expect(screen.getByText('Neue Familie')).toBeTruthy();
  });
});
