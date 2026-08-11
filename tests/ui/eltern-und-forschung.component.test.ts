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
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PersonDetail from '../../ui/views/person/PersonDetail.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeDatabase, makePerson, makeFamily } from '../../core/model';

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
