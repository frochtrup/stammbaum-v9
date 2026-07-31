// @vitest-environment happy-dom
// tests/ui/QualityDashboard.component.test.ts — Qualitäts-Dashboard als tatsächliches
// DOM-Rendering (Spec 32 §6; Spec 20 §1.11g, BL-05).
//
// Die Rechnung selbst ist in tests/core/validate-dashboard.test.ts abgedeckt; hier geht
// es um das, was nur im DOM sichtbar wird: Score/Ampel/Radar erscheinen, „+ alle" legt
// wirklich Aufgaben an, der Brennpunkt-Filter greift, und der vollständige Bericht
// (die einzige Fläche mit Orts-/Hof-Befunden) ist von hier aus erreichbar.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import QualityDashboard from '../../ui/views/quality/QualityDashboard.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { makeDatabase, makePerson } from '../../core/model';

/** Otto hat einen echten Fehler (Sterbejahr vor Geburtsjahr), Anna nur Lücken. */
function seedDb() {
  const db = makeDatabase();
  const otto = makePerson('@I1@', { given: 'Otto', surname: 'Bauer', name: 'Otto /Bauer/', sex: 'M' });
  otto.birth.date = '1900';
  otto.death.date = '1880';
  db.individuals.set('@I1@', otto);

  const anna = makePerson('@I2@', { given: 'Anna', surname: 'Klein', name: 'Anna /Klein/', sex: 'F' });
  anna.birth.date = '1850';
  db.individuals.set('@I2@', anna);
  return db;
}

function renderView(db = seedDb()) {
  const appState = createAppState();
  appState.loadDatabase(db, 'test.ged');
  const viewState = createViewState();
  const onNavigateToPerson = vi.fn();
  const utils = render(QualityDashboard, { props: { appState, viewState, onNavigateToPerson } });
  return { ...utils, appState, viewState, onNavigateToPerson };
}

describe('QualityDashboard — Score, Ampel, Radar', () => {
  it('zeigt die Score-Kachel mit der Personenzahl', () => {
    renderView();
    expect(screen.getByText(/befundfrei · 2 Personen/)).toBeTruthy();
  });

  it('zeigt alle vier Ampel-Chips (Spec 20 §1.11g „4-Chip-Ampel-Verteilung")', () => {
    renderView();
    for (const label of ['Fehler', 'Warnungen', 'nur Hinweise', 'sauber']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('rendert die Lückenradar-Balken der Spec-Liste', () => {
    renderView();
    for (const label of [
      'Geburts-/Taufdatum',
      'Geburtsort',
      'Sterbedatum',
      'Geschlecht bestimmt',
      'mind. 1 Quelle',
      'Quellen mit Bewertung (QUAY)',
      'Quellen mit Evidenzbewertung',
    ]) {
      expect(screen.getByText(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeTruthy();
    }
    // Ohne Hypothesen im Bestand fehlt dieser Balken ganz (informiert, ohne zu strafen).
    expect(screen.queryByText(/Hypothesen aufgelöst/)).toBeNull();
  });

  it('zeigt einen Hinweis statt leerer Kacheln, wenn keine Personen geladen sind', () => {
    renderView(makeDatabase());
    expect(screen.getByText('Keine Personen geladen.')).toBeTruthy();
  });
});

describe('QualityDashboard — Brennpunkte', () => {
  it('listet die Person mit Fehler und ihren Befundtext', () => {
    renderView();
    expect(screen.getByRole('button', { name: 'Otto Bauer' })).toBeTruthy();
    expect(screen.getByText(/Sterbejahr 1880 liegt vor Geburtsjahr 1900/)).toBeTruthy();
  });

  it('navigiert bei Klick auf den Namen zur Person', async () => {
    const { onNavigateToPerson } = renderView();
    await fireEvent.click(screen.getByRole('button', { name: 'Otto Bauer' }));
    expect(onNavigateToPerson).toHaveBeenCalledWith('@I1@');
  });

  it('„+ alle" legt für JEDEN Befund der Person eine Aufgabe an — auch für die gerade ausgeblendeten Hinweise', async () => {
    // Der Default-Filter zeigt nur Fehler+Warnungen. „+ alle" meint trotzdem alles
    // (v8-Parität `_handleDashPromoteAll`) — sonst verschwiegen die angelegten Aufgaben
    // genau die Lücken, wegen derer man auf den Knopf drückt.
    const { appState } = renderView();
    const vorher = appState.db.individuals.get('@I1@')!.tasks.length;
    await fireEvent.click(screen.getAllByRole('button', { name: '+ alle' })[0]!);
    const nachher = appState.db.individuals.get('@I1@')!.tasks;
    expect(nachher.length).toBeGreaterThan(vorher);
    expect(nachher.some((t) => t.text.includes('Sterbejahr 1880'))).toBe(true);
  });

  it('blendet den übernommenen Befund danach aus (withoutAlreadyTasked)', async () => {
    renderView();
    await fireEvent.click(screen.getAllByRole('button', { name: '+ alle' })[0]!);
    expect(screen.queryByText(/Sterbejahr 1880 liegt vor Geburtsjahr 1900/)).toBeNull();
  });

  it('Filter „Nur Fehler" blendet Personen ohne Fehler aus', async () => {
    renderView();
    // Anna hat nur Hinweise/Warnungen — mit „Alle" sichtbar, mit „Nur Fehler" nicht.
    await fireEvent.click(screen.getByRole('button', { name: /^Filter/ }));
    await fireEvent.click(screen.getByLabelText('Alle (inkl. Hinweise)'));
    expect(screen.getByRole('button', { name: 'Anna Klein' })).toBeTruthy();

    await fireEvent.click(screen.getByLabelText('Nur Fehler'));
    expect(screen.queryByRole('button', { name: 'Anna Klein' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Otto Bauer' })).toBeTruthy();
  });
});

describe('QualityDashboard — vollständiger Bericht und Konfiguration (ADR-v9-98)', () => {
  it('blendet den Prüfbericht erst auf Knopfdruck ein', async () => {
    renderView();
    expect(screen.queryByLabelText('Prüfbericht')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: '✓ Bericht' }));
    expect(screen.getByLabelText('Prüfbericht')).toBeTruthy();
  });

  it('öffnet die Regel-Konfiguration über den ⚙-Einstiegspunkt (INV-UI-11)', async () => {
    renderView();
    await fireEvent.click(screen.getByRole('button', { name: 'Prüfregeln konfigurieren' }));
    expect(screen.getByText(/Prüfregeln/)).toBeTruthy();
  });
});
