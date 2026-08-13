// @vitest-environment happy-dom
// tests/ui/EntryTemplateCapture.component.test.ts — die Erfassungs-Fläche EINER Vorlage
// (BL-352, ADR-v9-264 Entscheidung 5/6/10). Fertig-Zustand von BL-352: „ein Komponenten-
// test, der eine Vorlage ausfüllt, einen Dubletten-Treffer verknüpft und speichert".
//
// ECHTE Timer, KEINE Fake-Timer (dieselbe Begründung wie StatusNotice.component.test.ts):
// der a11y-Lauf braucht echte Timer für axe-core, `vi.useFakeTimers()` riss dort schon
// einmal `npm run check:a11y` mit einem stillen Timeout. Die Entprellung wird über
// `vi.waitFor` mit einer kurzen, aber echten Wartezeit geprüft.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import EntryTemplateCapture from '../../ui/shell/EntryTemplateCapture.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makePerson, makeFamily, makeSource } from '../../core/model';
import { makeEntryTemplate, type EntryTemplate } from '../../core/model/entry-templates';

const HEIRAT: EntryTemplate = makeEntryTemplate('t-heirat', {
  label: 'Heirat (Heiratsbuch)',
  slots: [
    { role: 'spouseFamily', field: 'date', event: 'MARR' },
    { role: 'spouseFamily', field: 'place', event: 'MARR' },
    { role: 'main', field: 'surname' },
    { role: 'main', field: 'given' },
    { role: 'main', field: 'sex', prefill: 'M', prefillMode: 'hidden' },
    { role: 'spouse', field: 'surname' },
    { role: 'spouse', field: 'given' },
    { role: 'spouse', field: 'sex', prefill: 'F', prefillMode: 'hidden' },
  ],
});

describe('EntryTemplateCapture — Rendering (E3: hidden entfällt, locked ist sichtbar & readonly)', () => {
  it('zeigt den Vorlagennamen und die hidden-Vorbelegungen als Kopfzeilen-Chips, kein Feld dafür', () => {
    const appState = createAppState();
    render(EntryTemplateCapture, { props: { appState, template: HEIRAT, onClose: vi.fn() } });

    expect(screen.getByText('Heirat (Heiratsbuch)')).toBeTruthy();
    expect(screen.queryByLabelText('Hauptperson Geschlecht')).toBeNull();
    expect(screen.getByText(/Hauptperson · Geschlecht: Männlich/)).toBeTruthy();
    expect(screen.getByText(/Partner\(in\) · Geschlecht: Weiblich/)).toBeTruthy();
  });

  it('rendert ein locked-Feld sichtbar UND readonly (kein bloßes Schloss-Icon)', () => {
    const taufe: EntryTemplate = makeEntryTemplate('t-taufe', {
      label: 'Taufe',
      slots: [
        { role: 'main', field: 'given' },
        { role: 'main', field: 'surname' },
        { role: 'main', field: 'date', event: 'CHR' },
        { role: 'main', field: 'place', event: 'CHR', prefill: 'Ochtrup', prefillMode: 'locked' },
      ],
    });
    const appState = createAppState();
    render(EntryTemplateCapture, { props: { appState, template: taufe, onClose: vi.fn() } });

    const field = screen.getByLabelText('Hauptperson Taufe Ort (vorbelegt)') as HTMLInputElement;
    expect(field.value).toBe('Ochtrup');
    expect(field.readOnly).toBe(true);
  });
});

describe('EntryTemplateCapture — ausfüllen und speichern (Fertig-Zustand BL-352)', () => {
  it('legt Hauptperson + Partner:in + Ehefamilie über EIN Kommando an', async () => {
    const appState = createAppState();
    render(EntryTemplateCapture, { props: { appState, template: HEIRAT, onClose: vi.fn() } });

    await fireEvent.change(screen.getByLabelText('Hauptperson Nachname'), { target: { value: 'Zurloh' } });
    await fireEvent.change(screen.getByLabelText('Hauptperson Vorname'), { target: { value: 'Josef' } });
    await fireEvent.change(screen.getByLabelText('Partner(in) Nachname'), { target: { value: 'Decker' } });
    await fireEvent.change(screen.getByLabelText('Partner(in) Vorname'), { target: { value: 'Anna' } });
    await fireEvent.change(screen.getByLabelText('Ehefamilie/Partnerschaft Heirat Jahr'), { target: { value: '1820' } });
    await fireEvent.click(screen.getByLabelText('Ehefamilie/Partnerschaft Heirat Ort'));
    await fireEvent.input(screen.getByLabelText('Ehefamilie/Partnerschaft Heirat Ort'), { target: { value: 'Ochtrup' } });

    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.individuals.size).toBe(2);
    expect(appState.db.families.size).toBe(1);
    const fam = [...appState.db.families.values()][0];
    expect(fam.marriage.date).toBe('1820');
    expect(fam.marriage.place).toBe('Ochtrup');
    expect(appState.canUndo).toBe(true);

    // Serienerfassung: die Fläche bleibt offen und meldet den Erfolg.
    expect(screen.getByText(/gespeichert/)).toBeTruthy();
    expect((screen.getByLabelText('Hauptperson Nachname') as HTMLInputElement).value).toBe('');
  });

  it('EIN Undo-Schritt macht die ganze Vorlagen-Anwendung rückgängig', async () => {
    const appState = createAppState();
    render(EntryTemplateCapture, { props: { appState, template: HEIRAT, onClose: vi.fn() } });

    await fireEvent.change(screen.getByLabelText('Hauptperson Nachname'), { target: { value: 'Zurloh' } });
    await fireEvent.change(screen.getByLabelText('Partner(in) Nachname'), { target: { value: 'Decker' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.individuals.size).toBe(2);
    appState.undo();
    expect(appState.db.individuals.size).toBe(0);
    expect(appState.db.families.size).toBe(0);
  });
});

/**
 * Tippt den Namen einer Rolle und verknüpft über den Vorschlag den benannten Bestandstreffer.
 *
 * Die Fläche bindet NIE von selbst (s. `entry-template-dedup.ts`): die entprellte Suche
 * blendet nur eine Vorschlagszeile ein, die den gewohnten `PersonPicker` öffnet — erst der
 * Klick auf den Namen verknüpft. Genau diesen Weg geht der Helfer.
 */
async function verknuepfeUeberVorschlag(rolle: string, vorname: string, nachname: string, name: string) {
  await fireEvent.change(screen.getByLabelText(`${rolle} Vorname`), { target: { value: vorname } });
  await fireEvent.change(screen.getByLabelText(`${rolle} Nachname`), { target: { value: nachname } });

  const vorschlag = await vi.waitFor(() => screen.getByText(/mögliche.? Treffer — verknüpfen statt neu anlegen\?/), {
    timeout: 2000,
  });
  await fireEvent.click(vorschlag);
  await fireEvent.click(screen.getByText(name));
}

describe('EntryTemplateCapture — Live-Dubletten-Erkennung, entprellt (ADR-v9-264 E10)', () => {
  it('bindet NICHT von selbst — der Treffer erscheint als Vorschlag', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Josef', surname: 'Zurloh', sex: 'M' }));
    appState.loadDatabase(db, 'test.ged');

    render(EntryTemplateCapture, { props: { appState, template: HEIRAT, onClose: vi.fn() } });
    await fireEvent.change(screen.getByLabelText('Hauptperson Vorname'), { target: { value: 'Josef' } });
    await fireEvent.change(screen.getByLabelText('Hauptperson Nachname'), { target: { value: 'Zurloh' } });

    await vi.waitFor(() => expect(screen.getByText(/mögliche.? Treffer/)).toBeTruthy(), { timeout: 2000 });
    // Nichts verknüpft, die Felder stehen unverändert — die Wahl gehört dem Menschen.
    expect(screen.queryByText(/Verknüpft:/)).toBeNull();
    expect((screen.getByLabelText('Hauptperson Vorname') as HTMLInputElement).value).toBe('Josef');
  });

  it('ein anderer Vorname beim selben Nachnamen wird nicht still gebunden', async () => {
    // Der Befund, der die automatische Bindung widerlegt hat: „Maria Decker" gegen eine
    // vorhandene „Anna Decker" liegt über der Schwelle (gemessen 47 Punkte).
    const appState = createAppState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Decker', sex: 'F' }));
    appState.loadDatabase(db, 'test.ged');

    render(EntryTemplateCapture, { props: { appState, template: HEIRAT, onClose: vi.fn() } });
    await fireEvent.change(screen.getByLabelText('Partner(in) Vorname'), { target: { value: 'Maria' } });
    await fireEvent.change(screen.getByLabelText('Partner(in) Nachname'), { target: { value: 'Decker' } });

    await vi.waitFor(() => expect(screen.getByText(/mögliche.? Treffer/)).toBeTruthy(), { timeout: 2000 });
    expect(screen.queryByText(/Verknüpft:/)).toBeNull();

    await fireEvent.change(screen.getByLabelText('Hauptperson Nachname'), { target: { value: 'Zurloh' } });
    await fireEvent.change(screen.getByLabelText('Hauptperson Vorname'), { target: { value: 'Josef' } });
    await fireEvent.click(screen.getByText('Speichern'));

    // Maria ist als EIGENE Person entstanden, Anna unangetastet.
    const decker = [...appState.db.individuals.values()].filter((p) => p.surname === 'Decker');
    expect(decker).toHaveLength(2);
    expect(appState.db.individuals.get('@I1@')!.given).toBe('Anna');
  });

  it('verknüpft nach der Wahl im Picker statt eine zweite Person anzulegen', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Josef', surname: 'Zurloh', sex: 'M' }));
    appState.loadDatabase(db, 'test.ged');

    render(EntryTemplateCapture, { props: { appState, template: HEIRAT, onClose: vi.fn() } });
    await verknuepfeUeberVorschlag('Hauptperson', 'Josef', 'Zurloh', 'Josef Zurloh');

    expect(screen.getByText(/Verknüpft: Josef Zurloh/)).toBeTruthy();
    // Die Eingabefelder der verknüpften Rolle sind weg — die Chip-Zeile trägt die Aussage.
    expect(screen.queryByLabelText('Hauptperson Vorname')).toBeNull();

    await fireEvent.change(screen.getByLabelText('Partner(in) Nachname'), { target: { value: 'Decker' } });
    await fireEvent.change(screen.getByLabelText('Partner(in) Vorname'), { target: { value: 'Anna' } });
    await fireEvent.click(screen.getByText('Speichern'));

    // Nur EINE Person mit diesem Namen — die verknüpfte, keine zweite.
    expect(appState.db.individuals.size).toBe(2);
    const zurloh = [...appState.db.individuals.values()].filter((p) => p.surname === 'Zurloh');
    expect(zurloh).toHaveLength(1);
    expect(zurloh[0].id).toBe('@I1@');
  });

  it('die Verknüpfung ist wieder lösbar — danach ist das Feld wieder editierbar', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Josef', surname: 'Zurloh', sex: 'M' }));
    appState.loadDatabase(db, 'test.ged');

    render(EntryTemplateCapture, { props: { appState, template: HEIRAT, onClose: vi.fn() } });
    await verknuepfeUeberVorschlag('Hauptperson', 'Josef', 'Zurloh', 'Josef Zurloh');
    expect(screen.getByText(/Verknüpft: Josef Zurloh/)).toBeTruthy();

    await fireEvent.click(screen.getByLabelText('Hauptperson: Verknüpfung lösen'));

    expect(screen.queryByText(/Verknüpft:/)).toBeNull();
    expect(screen.getByLabelText('Hauptperson Vorname')).toBeTruthy();
  });
});

describe('EntryTemplateCapture — Familien-Mehrdeutigkeit (ADR-v9-264 E6)', () => {
  it('fragt über FamilyPicker nach, wenn ≥2 Familien passen — schreibt erst nach der Wahl', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Bernd', surname: 'Decker', sex: 'M', parentIn: ['@F1@', '@F2@'] }));
    db.families.set('@F1@', makeFamily('@F1@', { husband: '@I1@' }));
    db.families.set('@F2@', makeFamily('@F2@', { husband: '@I1@' }));
    appState.loadDatabase(db, 'test.ged');

    const spouseFamilyTpl: EntryTemplate = makeEntryTemplate('t-ehe', {
      label: 'Ehe',
      slots: [
        { role: 'main', field: 'given' },
        { role: 'main', field: 'surname' },
        { role: 'spouse', field: 'given' },
        { role: 'spouse', field: 'surname' },
        { role: 'spouseFamily', field: 'date', event: 'MARR' },
      ],
    });

    render(EntryTemplateCapture, { props: { appState, template: spouseFamilyTpl, onClose: vi.fn() } });

    await verknuepfeUeberVorschlag('Hauptperson', 'Bernd', 'Decker', 'Bernd Decker');
    expect(screen.getByText(/Verknüpft: Bernd Decker/)).toBeTruthy();

    await fireEvent.change(screen.getByLabelText('Partner(in) Vorname'), { target: { value: 'Maria' } });
    await fireEvent.change(screen.getByLabelText('Partner(in) Nachname'), { target: { value: 'Wolters' } });
    await fireEvent.click(screen.getByText('Speichern'));

    // Nichts geschrieben — die Frage steht.
    expect(appState.db.individuals.size).toBe(1);
    expect(screen.getByText(/Mehrere passende Ehefamilie/)).toBeTruthy();

    const picker = screen.getByLabelText('Ehefamilie/Partnerschaft wählen');
    await fireEvent.click(picker);
    const panel = screen.getByRole('listbox', { name: /Treffer/ });
    const options = within(panel).getAllByRole('option');
    expect(options.length).toBe(2);
    await fireEvent.click(options[0]);

    // Nach der Wahl: derselbe Aufruf lief erneut durch und hat geschrieben.
    expect(appState.db.individuals.size).toBe(2);
    expect(screen.queryByText(/Mehrere passende/)).toBeNull();
  });
});

// --- Mitführen je Feld (BL-360, ADR-v9-271) --------------------------------------------
//
// DER FALL, DER ES AUSGELÖST HAT: ein Hofregister. Derselbe Nachname über zwanzig
// Einträge, aber OHNE Vorbelegung — er ist von Bestand zu Bestand ein anderer, gehört also
// nicht in die Vorlage. Genau deshalb ist `carry` kein vierter `prefillMode`, sondern eine
// eigene Achse: ein vierter Modus wäre die Anzeige-Anweisung einer Vorbelegung, die es
// nicht gibt.
//
// Geprüft wird BEIDES in einem Zug — was mitläuft UND was nicht. Ein Test, der nur das
// Mitgeführte prüft, bliebe grün, wenn `resetForSeries` gar nichts mehr leert.
describe('EntryTemplateCapture — Mitführen (BL-360)', () => {
  const HOFREGISTER: EntryTemplate = makeEntryTemplate('t-hof', {
    label: 'Hofregister',
    slots: [
      { role: 'main', field: 'surname', carry: true },
      { role: 'main', field: 'given' },
    ],
    source: {
      sourceId: '@S1@',
      abbr: 'HR',
      title: 'Hofregister',
      quay: null,
      pagePattern: '',
      urlPattern: '',
      pageCarry: true,
      urlCarry: false,
    },
  });

  function appStateMitQuelle() {
    const appState = createAppState();
    const db = makeDatabase();
    db.sources.set('@S1@', makeSource('@S1@', { abbr: 'HR', title: 'Hofregister' }));
    appState.loadDatabase(db, 'hofregister.ged');
    return appState;
  }

  it('führt das markierte Feld und die Seite in den nächsten Eintrag mit — die übrigen nicht', async () => {
    const appState = appStateMitQuelle();
    render(EntryTemplateCapture, { props: { appState, template: HOFREGISTER, onClose: vi.fn() } });

    await fireEvent.change(screen.getByLabelText('Hauptperson Nachname'), { target: { value: 'Meyer' } });
    await fireEvent.change(screen.getByLabelText('Hauptperson Vorname'), { target: { value: 'Josef' } });
    await fireEvent.change(screen.getByLabelText('Seite / Fundstelle'), { target: { value: 'Bl. 14' } });
    await fireEvent.click(screen.getByText('Speichern'));

    expect(appState.db.individuals.size).toBe(1);
    // Mitgeführt: der Nachname (Slot-Flag) und die Seite (Flag an der Quellen-Vorbelegung).
    expect((screen.getByLabelText('Hauptperson Nachname') as HTMLInputElement).value).toBe('Meyer');
    expect((screen.getByLabelText('Seite / Fundstelle') as HTMLInputElement).value).toBe('Bl. 14');
    // NICHT mitgeführt: alles ohne Flag.
    expect((screen.getByLabelText('Hauptperson Vorname') as HTMLInputElement).value).toBe('');
  });

  it('legt beim zweiten Eintrag eine zweite Person mit dem mitgeführten Nachnamen an', async () => {
    const appState = appStateMitQuelle();
    render(EntryTemplateCapture, { props: { appState, template: HOFREGISTER, onClose: vi.fn() } });

    await fireEvent.change(screen.getByLabelText('Hauptperson Nachname'), { target: { value: 'Meyer' } });
    await fireEvent.change(screen.getByLabelText('Hauptperson Vorname'), { target: { value: 'Josef' } });
    await fireEvent.click(screen.getByText('Speichern'));

    // Zweiter Eintrag: NUR der Vorname wird getippt — der Nachname steht schon da.
    await fireEvent.change(screen.getByLabelText('Hauptperson Vorname'), { target: { value: 'Anna' } });
    await fireEvent.click(screen.getByText('Speichern'));

    const namen = [...appState.db.individuals.values()].map((p) => `${p.given} ${p.surname}`).sort();
    expect(namen).toEqual(['Anna Meyer', 'Josef Meyer']);
  });
});
