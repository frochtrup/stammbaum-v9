// @vitest-environment happy-dom
// tests/ui/StatisticsView.component.test.ts — Statistik-Lens als Component-Test
// (Spec 32 §6; Spec 20 §4). Deckt Rendering ab: Empty-State auf leerer DB, Kern-Kacheln
// + Geschlechterbalken bei vorhandenen Daten (keine Console-Fehler, kein Absturz).
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import StatisticsView from '../../ui/views/stats/StatisticsView.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makeFamily, makePerson } from '../../core/model';

describe('StatisticsView — Empty-State', () => {
  it('zeigt einen Leerzustand, solange keine Personen geladen sind (kein Absturz)', () => {
    const appState = createAppState();

    render(StatisticsView, { props: { appState } });

    expect(screen.getByText(/Keine Daten geladen/)).toBeTruthy();
  });
});

describe('StatisticsView — Kern-Kacheln + Geschlechterbalken bei vorhandenen Daten', () => {
  function seeded() {
    const appState = createAppState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Otto', surname: 'Bauer', sex: 'M' }));
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Anna', surname: 'Klein', sex: 'F' }));
    db.families.set('@F1@', makeFamily('@F1@', { husband: '@I1@', wife: '@I2@' }));
    appState.loadDatabase(db, 'test.ged');
    return appState;
  }

  it('rendert die Übersicht-Kacheln mit den korrekten Zählungen', () => {
    render(StatisticsView, { props: { appState: seeded() } });

    expect(screen.getByText('Übersicht')).toBeTruthy();
    expect(screen.getByText('Personen')).toBeTruthy();
    expect(screen.getByText('Familien')).toBeTruthy();
    expect(screen.getAllByText('2').length).toBeGreaterThan(0); // Personen-Kachel
  });

  it('rendert die Geschlechterverteilung mit Legende', () => {
    render(StatisticsView, { props: { appState: seeded() } });

    expect(screen.getByText('Geschlecht')).toBeTruthy();
    expect(screen.getByText(/♂ 1 \(50%\)/)).toBeTruthy();
    expect(screen.getByText(/♀ 1 \(50%\)/)).toBeTruthy();
  });

  it('rendert die Datenvollständigkeit-Sektion', () => {
    render(StatisticsView, { props: { appState: seeded() } });

    expect(screen.getByText('Datenvollständigkeit')).toBeTruthy();
    expect(screen.getByText('Geburtsdatum/-ort')).toBeTruthy();
  });

  it('zeigt KEINE Lebensspannen-/Heiratsalter-Sektion, wenn zu wenig Datenpunkte vorhanden sind', () => {
    render(StatisticsView, { props: { appState: seeded() } });

    expect(screen.queryByText(/Lebensspannen/)).toBeNull();
    expect(screen.queryByText('Heiratsalter')).toBeNull();
  });

  it('rendert Top-Nachnamen, wenn Personen mit Nachnamen vorhanden sind', () => {
    render(StatisticsView, { props: { appState: seeded() } });

    expect(screen.getByText('Häufigste Nachnamen')).toBeTruthy();
    expect(screen.getByText('Bauer')).toBeTruthy();
    expect(screen.getByText('Klein')).toBeTruthy();
  });
});

describe('StatisticsView — Lebensspannen-Sektion mit genug Datenpunkten', () => {
  it('rendert Ø/Median/Min/Max ab 5 plausiblen Lebensspannen', () => {
    const appState = createAppState();
    const db = makeDatabase();
    [50, 60, 70, 80, 90].forEach((age, i) => {
      const p = makePerson(`@I${i}@`);
      p.birth.date = '1 JAN 1900';
      p.death.date = `1 JAN ${1900 + age}`;
      db.individuals.set(p.id, p);
    });
    appState.loadDatabase(db, 'test.ged');

    render(StatisticsView, { props: { appState } });

    expect(screen.getByText(/Lebensspannen \(5 Personen\)/)).toBeTruthy();
    expect(screen.getByText('Ø Jahre')).toBeTruthy();
    expect(screen.getByText('Median')).toBeTruthy();
  });
});
