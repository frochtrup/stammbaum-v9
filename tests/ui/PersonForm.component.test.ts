// @vitest-environment happy-dom
// tests/ui/PersonForm.component.test.ts — Personen-Editor, REDUZIERT auf reine
// Identitätsfelder (ADR-v9-63, Spec 20 §2 Formular-Feldtabelle "Person (Toggle-Formular,
// nur Identität)"). Deckt Identitäts-Felder, Schnellauswahl-Pills (Präfix/Suffix,
// Rufname, Titel, Religion, RESN, E-Mail, Website) sowie Speichern/Abbrechen ab. ALLE
// Ereignis-Bearbeitungslogik ist ENTFERNT (lebt jetzt in `EventEditModal`/
// `PersonDetail.svelte`, s. dortige Tests) — dieses Formular kennt keine Ereignisse mehr.
// KEIN <select bind:value> mit fireEvent.change (bekannter happy-dom-Bug) — value/
// onchange-Muster.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PersonForm from '../../ui/views/person/PersonForm.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makePerson } from '../../core/model';

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

  it('lässt Ereignisse (birth/chr/death/cause/buri/events) beim Speichern unverändert — dieses Formular kennt sie nicht mehr (ADR-v9-63)', async () => {
    const appState = createAppState();
    const person = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    person.birth.date = '1900';
    person.cause = 'Typhus';
    person.events.push({
      type: 'OCCU', value: 'Bauer', eventType: '', date: null, datePhrase: '', place: null, placeId: null,
      hofId: null, lati: null, long: null, addr: '', addrExtra: [], note: '', citations: [], media: [], seen: true, grampsId: null,
    });

    render(PersonForm, { props: { appState, person } });
    await fireEvent.input(screen.getByLabelText('Vorname'), { target: { value: 'Anna Maria' } });
    await fireEvent.click(screen.getByText('Speichern'));

    const saved = appState.db.individuals.get('@I1@')!;
    expect(saved.birth.date).toBe('1900');
    expect(saved.cause).toBe('Typhus');
    expect(saved.events).toHaveLength(1);
    expect(saved.events[0].value).toBe('Bauer');
  });
});

describe('PersonForm — keine Ereignis-Felder mehr (ADR-v9-63 Rückbau)', () => {
  it('zeigt keine Ereignis-Sektion/Ereignis-Pills mehr im Formular', () => {
    const appState = createAppState();
    const person = makePerson('@I1@');

    render(PersonForm, { props: { appState, person } });

    expect(screen.queryByText('Geburt (BIRT)')).toBeNull();
    expect(screen.queryByText('Ereignisse')).toBeNull();
    expect(screen.queryByLabelText('Datums-Qualifier')).toBeNull();
    expect(screen.queryByText('+ Beruf')).toBeNull();
    expect(screen.queryByText('+ Wohnort')).toBeNull();
    expect(screen.queryByLabelText('Neuer Ereignis-Typ')).toBeNull();
  });
});

describe('PersonForm — Schnellauswahl-Pills (ADR-v9-30 Punkt 3, unverändert)', () => {
  it('zeigt Pills nur für leere Felder; befüllte Felder sind sofort inline sichtbar, kein Pill', () => {
    const appState = createAppState();
    const person = makePerson('@I1@', { given: 'Anna', surname: 'Bauer', title: 'Dr.' });

    render(PersonForm, { props: { appState, person } });

    // Titel ist befüllt -> inline sichtbar, kein Pill dafür.
    expect(screen.getByLabelText('Titel')).toBeTruthy();
    expect(screen.queryByText('+ Titel')).toBeNull();
    // Rufname ist leer -> Pill vorhanden, Feld nicht gerendert. (Frueher stand hier
    // „Religion"; sie ist seit BL-289 ein EREIGNIS und wird ueber die Ereigniszeile
    // gepflegt, nicht mehr als Identitaetsfeld — deshalb hat sie hier keinen Pill mehr.)
    expect(screen.getByText('+ Rufname')).toBeTruthy();
    expect(screen.queryByLabelText('Rufname')).toBeNull();
  });

  it('Klick auf einen Pill blendet das Feld ein und der Pill verschwindet aus der Reihe', async () => {
    const appState = createAppState();
    const person = makePerson('@I1@');

    render(PersonForm, { props: { appState, person } });

    expect(screen.queryByLabelText('E-Mail')).toBeNull();
    await fireEvent.click(screen.getByText('+ E-Mail'));

    expect(screen.getByLabelText('E-Mail')).toBeTruthy();
    expect(screen.queryByText('+ E-Mail')).toBeNull();
  });

  it('viele Pills gleichzeitig bleiben unabhängig aktivierbar (TST-7 Überlauf-Fall)', async () => {
    const appState = createAppState();
    const person = makePerson('@I1@');

    render(PersonForm, { props: { appState, person } });

    for (const label of ['Präfix / Suffix', 'Rufname', 'Titel', 'Zugriffsbeschränkung', 'E-Mail', 'Website']) {
      await fireEvent.click(screen.getByText(`+ ${label}`));
    }

    expect(screen.getByLabelText('Präfix')).toBeTruthy();
    expect(screen.getByLabelText('Suffix')).toBeTruthy();
    expect(screen.getByLabelText('Rufname')).toBeTruthy();
    expect(screen.getByLabelText('Titel')).toBeTruthy();
    expect(screen.getByLabelText('RESN (Zugriffsbeschränkung)')).toBeTruthy();
    expect(screen.getByLabelText('E-Mail')).toBeTruthy();
    expect(screen.getByLabelText('Website')).toBeTruthy();
  });

  it('nutzt die geteilte Aktivierungs-Pill-Klasse (.stb-activation-pill, INV-UI-4)', () => {
    const appState = createAppState();
    const person = makePerson('@I1@');

    render(PersonForm, { props: { appState, person } });

    const pill = screen.getByText('+ Titel');
    expect(pill.className).toContain('stb-activation-pill');
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
