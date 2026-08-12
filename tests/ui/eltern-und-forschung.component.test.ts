// @vitest-environment happy-dom
// tests/ui/eltern-und-forschung.component.test.ts — BL-341: die beiden Einstiege, die dem
// Personen-Steckbrief fehlten.
//
// NUTZER-BEFUND. „Kann Eltern nicht im Personendetail ergänzen" und „Forschungeinträge
// sollten direkt in Person/Familie angelegt werden können." Beides war überwiegend
// Verdrahtung: `FamilyPicker` konnte längst suchen UND anlegen, die drei Forschungs-
// formulare existierten, und die Kommandos waren seit jeher auf `(kind, entityId)`
// adressiert. Es führte nur kein Weg von der Personenseite dorthin.
//
// WAS DIESE TESTS HALTEN, ist deshalb nicht die Mechanik der Formulare (die haben ihre
// eigenen Tests), sondern die VERDRAHTUNG: kommt der Einstieg an der richtigen Stelle an,
// landet das Ergebnis am richtigen Träger, und passiert es über die Kommandos, die INV-P3
// einhalten.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PersonDetail from '../../ui/views/person/PersonDetail.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeDatabase, makePerson, makeFamily, makeSource } from '../../core/model';
import { makeLogEntry } from '../../core/research/index';

function aufbau(mitFamilie = false) {
  const appState = createAppState();
  const viewState = createViewState();
  const db = makeDatabase();
  db.individuals.set('@I1@', makePerson('@I1@', { given: 'Anna', surname: 'Bauer' }));
  db.individuals.set('@I2@', makePerson('@I2@', { given: 'Otto', surname: 'Bauer' }));
  if (mitFamilie) db.families.set('@F1@', makeFamily('@F1@', { husband: '@I2@' }));
  appState.loadDatabase(db, 'test.ged');
  viewState.setCurrent('person', '@I1@');
  return { appState, viewState };
}

describe('Herkunftsfamilie zuordnen und anlegen (BL-341)', () => {
  it('beide Rollen tragen ihr + auch an einer Person ganz ohne Familien', () => {
    // Der eigentliche Befund: vorher hing die GANZE Sektion an `families.length > 0` —
    // ausgerechnet wer keine Eltern hat, hatte keinen Ort, welche einzutragen.
    const { appState, viewState } = aufbau(false);
    render(PersonDetail, { props: { appState, viewState } });
    // Das `+` sitzt seit BL-344 hinter dem Rollen-Label und trägt seinen Zweck im
    // aria-label statt im sichtbaren Text (INV-UI-12).
    expect(screen.getByRole('button', { name: 'Herkunftsfamilie zuordnen oder anlegen' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Eigene Familie zuordnen oder anlegen' }), 'auch die eigene Familie ist anlegbar').toBeTruthy();
  });

  it('eine bestehende Familie zuordnen hängt die Person als Kind ein — auf BEIDEN Seiten', () => {
    // INV-P3: die Beziehung steht an der Familie UND an der Person. Deshalb läuft der
    // Weg über `saveFamily` (das `addChildToFamily` nachführt) und nicht über
    // `saveChildLink`, das nur einen bestehenden Link aktualisiert.
    const { appState, viewState } = aufbau(true);
    render(PersonDetail, { props: { appState, viewState } });

    // Der Picker ersetzt die Pille beim Öffnen; die Auswahl läuft über sein Ergebnis.
    // Hier wird die Wirkung geprüft, nicht die Picker-Mechanik (die hat eigene Tests).
    appState.saveFamily({ ...appState.db.families.get('@F1@')!, children: ['@I1@'] });

    expect(appState.db.families.get('@F1@')!.children).toContain('@I1@');
    expect(appState.db.individuals.get('@I1@')!.childOf.map((l) => l.familyId)).toContain('@F1@');
  });

  it('nach dem Zuordnen erscheint die Familie in der Liste der Person', async () => {
    const { appState, viewState } = aufbau(true);
    render(PersonDetail, { props: { appState, viewState } });
    appState.saveFamily({ ...appState.db.families.get('@F1@')!, children: ['@I1@'] });

    expect(await screen.findByText('Herkunftsfamilie')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Otto Bauer/ })).toBeTruthy();
  });

  it('doppeltes Zuordnen derselben Familie legt keinen zweiten Eintrag an', () => {
    const { appState } = aufbau(true);
    appState.saveFamily({ ...appState.db.families.get('@F1@')!, children: ['@I1@'] });
    appState.saveFamily({ ...appState.db.families.get('@F1@')!, children: ['@I1@'] });
    expect(appState.db.individuals.get('@I1@')!.childOf).toHaveLength(1);
  });
});

describe('Forschungseinträge an der Person (BL-341)', () => {
  it('der Einstieg steht am Steckbrief', () => {
    const { appState, viewState } = aufbau();
    render(PersonDetail, { props: { appState, viewState } });
    expect(screen.getByRole('button', { name: '+ Forschungseintrag' })).toBeTruthy();
  });

  it('das Menü bietet alle drei Arten an — ein Trigger, nicht drei Knöpfe (INV-UI-11)', async () => {
    const { appState, viewState } = aufbau();
    render(PersonDetail, { props: { appState, viewState } });
    await fireEvent.click(screen.getByRole('button', { name: '+ Forschungseintrag' }));

    for (const art of ['Aufgabe', 'Protokolleintrag', 'Hypothese']) {
      expect(screen.getByText(art, { selector: '.stb-event-menu__item' }), art).toBeTruthy();
    }
  });

  it('eine angelegte Aufgabe landet AN DIESER Person und wird dort auch angezeigt', async () => {
    const { appState, viewState } = aufbau();
    render(PersonDetail, { props: { appState, viewState } });

    appState.addTask('person', '@I1@', 't1', 'Taufeintrag prüfen', 'Kirchenbuch', '2026-08-11', '');

    expect(appState.db.individuals.get('@I1@')!.tasks).toHaveLength(1);
    expect(appState.db.individuals.get('@I2@')!.tasks, 'nicht an der anderen Person').toHaveLength(0);
    // Anlegen ohne Anzeigen wäre die Falle, die dieser Bereich schon zweimal hatte.
    expect(await screen.findByText('Taufeintrag prüfen')).toBeTruthy();
  });

  it('ab dem VIERTEN Eintrag klappt die Liste ein und sagt, wie viele fehlen', async () => {
    const { appState, viewState } = aufbau();
    render(PersonDetail, { props: { appState, viewState } });
    for (const n of [1, 2, 3, 4]) {
      appState.addTask('person', '@I1@', `t${n}`, `Aufgabe ${n}`, '', '2026-08-11', '');
    }

    expect(await screen.findByText('Aufgabe 3')).toBeTruthy();
    expect(screen.queryByText('Aufgabe 4'), 'die vierte ist zunächst verborgen').toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: '1 weitere anzeigen' }));
    expect(screen.getByText('Aufgabe 4')).toBeTruthy();
  });

  it('drei Einträge stehen vollständig da — eingeklappt wird erst darüber', async () => {
    const { appState, viewState } = aufbau();
    render(PersonDetail, { props: { appState, viewState } });
    for (const n of [1, 2, 3]) {
      appState.addTask('person', '@I1@', `t${n}`, `Aufgabe ${n}`, '', '2026-08-11', '');
    }

    expect(await screen.findByText('Aufgabe 3')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /weitere anzeigen/ })).toBeNull();
  });
});

// ---------------------------------------------------------------------------------
// BL-350: die Zeile sagt, was sie weiß — und lässt sich anfassen
// ---------------------------------------------------------------------------------
//
// NUTZER-BEFUND 2026-08-12 (Bildschirmfoto): eine Protokollzeile am Steckbrief zeigte
// „PROTOKOLL · Taufe · 2026-08-12" — „braucht nicht nur die Überschrift, sondern auch
// Status und Quelle", und „ausserdem sollte es editier- und löschbar sein". Beides sind
// Lücken derselben Art wie BL-341 selbst: die Anzeige war da, die ARBEIT daran fehlte,
// und wer etwas ändern wollte, musste den Umweg über die Forschungsansicht nehmen und
// die Person dort wieder heraussuchen.
describe('Forschungszeile: Zusatzangaben, Bearbeiten, Löschen (BL-350)', () => {
  afterEach(() => vi.unstubAllGlobals());

  function mitProtokoll() {
    const { appState, viewState } = aufbau();
    const db = appState.db;
    db.sources.set('@S1@', makeSource('@S1@', { abbr: 'KB Ochtrup', title: 'Kirchenbuch St. Lamberti' }));
    const p = db.individuals.get('@I1@')!;
    p.researchLog.push(
      makeLogEntry({ date: '2026-08-12', query: 'Taufe', result: 'pending', sourceRef: '@S1@' }),
    );
    appState.loadDatabase(db, 'test.ged');
    viewState.setCurrent('person', '@I1@');
    return { appState, viewState };
  }

  it('die Protokollzeile nennt Ergebnis UND Quelle, nicht nur Suchbegriff und Datum', async () => {
    const { appState, viewState } = mitProtokoll();
    render(PersonDetail, { props: { appState, viewState } });

    expect(await screen.findByText('Taufe')).toBeTruthy();
    // Ein Text-Knoten, drei Angaben: Ergebnis · Quelle · Datum. Geprüft wird der
    // ZUSAMMENGESETZTE Zusatz — die Reihenfolge ist die Aussage („was kam dabei heraus"
    // vor „worin gesucht" vor „wann").
    expect(screen.getByText('· Ausstehend · KB Ochtrup · 2026-08-12')).toBeTruthy();
  });

  it('ohne Suchbegriff steht dort kein roher Enum-Wert', async () => {
    const { appState, viewState } = aufbau();
    const p = appState.db.individuals.get('@I1@')!;
    p.researchLog.push(makeLogEntry({ date: '2026-08-12', query: '', result: 'pending' }));
    appState.loadDatabase(appState.db, 'test.ged');
    viewState.setCurrent('person', '@I1@');
    render(PersonDetail, { props: { appState, viewState } });

    // Vorher zeigte die Überschrift `l.query || l.result` — ohne Suchbegriff also
    // wörtlich „pending".
    expect(await screen.findByText('(kein Suchbegriff)')).toBeTruthy();
    expect(screen.queryByText('pending')).toBeNull();
  });

  it('die Hypothesenzeile zeigt den übersetzten Status, nicht „open"', async () => {
    const { appState, viewState } = aufbau();
    render(PersonDetail, { props: { appState, viewState } });
    appState.addHypothesis('person', '@I1@', 'h1', { text: 'Zwei Ottos sind einer' }, '2026-08-12');

    // `findAllBy…`: die Beweis-Zusammenfassung (`ProofSummaryNote`) zeigt denselben Satz
    // weiter unten noch einmal — hier zählt die Zeile in der Forschungsliste.
    expect((await screen.findAllByText('Zwei Ottos sind einer')).length).toBeGreaterThan(0);
    expect(screen.getByText('· Offen')).toBeTruthy();
  });

  it('✎ öffnet das vorbelegte Formular und ÄNDERT den Eintrag, statt einen zweiten anzulegen', async () => {
    const { appState, viewState } = mitProtokoll();
    render(PersonDetail, { props: { appState, viewState } });

    await fireEvent.click(await screen.findByLabelText('Protokoll „Taufe“ bearbeiten'));
    const feld = screen.getByPlaceholderText('Wonach wurde gesucht?') as HTMLInputElement;
    expect(feld.value, 'vorbelegt aus dem Eintrag').toBe('Taufe');

    await fireEvent.input(feld, { target: { value: 'Taufe (Zweitschrift)' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    const log = appState.db.individuals.get('@I1@')!.researchLog;
    expect(log, 'kein zweiter Eintrag').toHaveLength(1);
    expect(log[0]!.query).toBe('Taufe (Zweitschrift)');
    expect(log[0]!.sourceRef, 'die übrigen Angaben überleben die Änderung').toBe('@S1@');
  });

  it('🗑 löscht die Zeile — aber erst nach Bestätigung', async () => {
    const { appState, viewState } = mitProtokoll();
    render(PersonDetail, { props: { appState, viewState } });

    // Abgelehnte Rückfrage: nichts passiert. Ohne diesen Fall prüfte der Test nur, DASS
    // gelöscht wird, nicht dass die Bestätigung wirkt.
    vi.stubGlobal('confirm', vi.fn(() => false));
    await fireEvent.click(await screen.findByLabelText('Protokoll „Taufe“ löschen'));
    expect(appState.db.individuals.get('@I1@')!.researchLog).toHaveLength(1);

    vi.stubGlobal('confirm', vi.fn(() => true));
    await fireEvent.click(screen.getByLabelText('Protokoll „Taufe“ löschen'));
    expect(appState.db.individuals.get('@I1@')!.researchLog).toHaveLength(0);
  });

  it('eine bearbeitete Aufgabe bleibt EINE Aufgabe', async () => {
    const { appState, viewState } = aufbau();
    render(PersonDetail, { props: { appState, viewState } });
    appState.addTask('person', '@I1@', 't1', 'Taufeintrag prüfen', 'Kirchenbuch', '2026-08-11', '');

    await fireEvent.click(await screen.findByLabelText('Aufgabe „Taufeintrag prüfen“ bearbeiten'));
    const feld = screen.getByDisplayValue('Taufeintrag prüfen');
    await fireEvent.input(feld, { target: { value: 'Taufeintrag geprüft' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    const tasks = appState.db.individuals.get('@I1@')!.tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.text).toBe('Taufeintrag geprüft');
    expect(tasks[0]!.category, 'die übrigen Felder überleben').toBe('Kirchenbuch');
  });
});
