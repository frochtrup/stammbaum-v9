// @vitest-environment happy-dom
// tests/ui/StatisticsView.component.test.ts — Statistik-Lens als Component-Test
// (Spec 32 §6; Spec 20 §4). Deckt Rendering ab: Empty-State auf leerer DB, Kern-Kacheln
// + Geschlechterbalken bei vorhandenen Daten (keine Console-Fehler, kein Absturz).
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import StatisticsView from '../../ui/views/stats/StatisticsView.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makeFamily, makePerson } from '../../core/model';

/** Die geteilte Tooltip-Blase (ui/shell/tooltip.ts, INV-UI-4) lebt außerhalb jeder
 *  Komponente im <body> — Text nach `mouseenter` dort auslesen (analog tooltip.test.ts). */
function tooltipText(): string | null {
  return document.querySelector('.stb-tooltip')?.textContent ?? null;
}

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

  it('Balken beziffern sich selbst: Tooltip nennt Anteil in Prozent, Caption die Gesamtzahl (BL-219)', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    [50, 60, 70, 80, 90].forEach((age, i) => {
      const p = makePerson(`@I${i}@`);
      p.birth.date = '1 JAN 1900';
      p.death.date = `1 JAN ${1900 + age}`;
      db.individuals.set(p.id, p);
    });
    appState.loadDatabase(db, 'test.ged');

    const { container } = render(StatisticsView, { props: { appState } });

    // Gesamt-Caption unter der Verteilung (v8-Vorbild "N Familien/Personen gesamt").
    expect(screen.getByText('5 Personen gesamt')).toBeTruthy();

    // Balken-Tooltip nennt neben der Zahl den Anteil (hier: 1 von 5 -> 20%).
    const bar = container.querySelector('.stats-tl-bar--ls');
    expect(bar).toBeTruthy();
    await fireEvent.mouseEnter(bar!);
    expect(tooltipText()).toBe('1 (20%)');
  });
});

describe('StatisticsView — Top-Nachnamen: Tooltip + Gesamt-Caption (BL-219)', () => {
  it('nennt Anteil in Prozent im Balken-Tooltip und die Gesamtzahl in einer Caption', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Otto', surname: 'Bauer' }));
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Karl', surname: 'Bauer' }));
    db.individuals.set('@I3@', makePerson('@I3@', { given: 'Anna', surname: 'Klein' }));
    appState.loadDatabase(db, 'test.ged');

    const { container } = render(StatisticsView, { props: { appState } });

    expect(screen.getByText('3 Personen mit erfasstem Nachnamen')).toBeTruthy();

    const track = container.querySelector('.stats-bar-row__track');
    expect(track).toBeTruthy();
    await fireEvent.mouseEnter(track!);
    expect(tooltipText()).toBe('2 (67%)'); // "Bauer" 2 von 3 Nennungen
  });
});

describe('StatisticsView — Ereignisse pro Jahrzehnt: Tooltip + Gesamt-Caption (BL-219)', () => {
  it('nennt Anteil in Prozent je Serie und eine kombinierte Gesamt-Caption', async () => {
    const appState = createAppState();
    const db = makeDatabase();
    const p1 = makePerson('@I1@');
    p1.birth.date = '1 JAN 1900';
    const p2 = makePerson('@I2@');
    p2.birth.date = '1 JAN 1910';
    p2.death.date = '1 JAN 1920';
    db.individuals.set('@I1@', p1);
    db.individuals.set('@I2@', p2);
    const f = makeFamily('@F1@');
    f.marriage.date = '1 JAN 1930';
    db.families.set('@F1@', f);
    appState.loadDatabase(db, 'test.ged');

    const { container } = render(StatisticsView, { props: { appState } });

    expect(screen.getByText(/2 Geburten · 1 Sterbefälle · 1 Heiraten gesamt/)).toBeTruthy();

    const birthBar = container.querySelector('.stats-tl-bar--birth');
    await fireEvent.mouseEnter(birthBar!);
    expect(tooltipText()).toBe('Geburten 1 (50%)'); // 1900+1910 -> je 1 von totalBirths=2
  });
});
