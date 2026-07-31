// @vitest-environment happy-dom
// tests/ui/UndoControls.component.test.ts — Undo/Redo-Leiste als Component-Test
// (Spec 32 §6, BL-01).
//
// WARUM DIESER TEST EXISTIERT — am laufenden System gefunden, nicht vorab bedacht:
// Die Undo-Logik war vollständig und ihre 15 Unit-Tests grün, die Schaltflächen blieben
// aber dauerhaft ausgegraut. Grund: der Undo-Stack ist framework-frei (INV-ARCH-1) und
// hält einfache Arrays — Svelte kann Änderungen daran nicht bemerken. Ein Test, der
// `appState.canUndo` DIREKT liest, läuft außerhalb jedes reaktiven Kontexts und bemerkt
// das nie; nur ein gerendertes Bauteil tut es.
//
// Die Lehre ist allgemeiner als dieser Fall: für Zustand, der aus einem framework-freien
// Dienst stammt, ist „der Getter liefert den richtigen Wert" NICHT dasselbe wie „die
// Oberfläche zeigt ihn an".
//
// SEIT ADR-v9-155 prüft dieselbe Reaktivität ein anderes Ergebnis: die Knöpfe werden
// nicht mehr ausgegraut, sondern ERSCHEINEN erst, wenn sie etwas können (der dauerhaft
// blasse Zustand war die Design-Kritik; und nur so passt die Beschriftung ins
// Breitenbudget, s. Komponenten-Kommentar). Der Wächter gegen den Ursprungsfehler bleibt
// damit intakt — er fragt nur „ist der Knopf da?" statt „ist er aktiv?".
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import UndoControls from '../../ui/shell/UndoControls.svelte';
import { createAppState, type AppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makePerson } from '../../core/model';

function seeded(): AppState {
  const appState = createAppState();
  const db = makeDatabase();
  db.individuals.set('@I1@', makePerson('@I1@', { given: 'Otto' }));
  appState.loadDatabase(db, 'test.ged');
  return appState;
}

/** `queryByText` mit Teilstring-Matcher: der sichtbare Text ist „↶ Zurück" (Glyph +
 *  Wort), und genau das IST der zugängliche Name — kein `aria-label` mehr nötig
 *  (WCAG 2.5.3 „Label in Name", §6j). */
const undoBtn = () => screen.queryByRole('button', { name: /Zurück/ }) as HTMLButtonElement | null;
const redoBtn = () => screen.queryByRole('button', { name: /Vor/ }) as HTMLButtonElement | null;

describe('UndoControls', () => {
  it('anfangs ist keine der beiden Schaltflächen da (kein dauerhaft blasser Knopf)', () => {
    render(UndoControls, { props: { appState: seeded() } });
    expect(undoBtn()).toBeNull();
    expect(redoBtn()).toBeNull();
  });

  it('zeigt „Rückgängig", sobald ein Kommando gelaufen ist', async () => {
    const appState = seeded();
    render(UndoControls, { props: { appState } });

    appState.savePerson({ ...appState.db.individuals.get('@I1@')!, given: 'Geändert' });
    await Promise.resolve(); // Svelte-Aktualisierung abwarten

    // Genau das war kaputt: der Getter stimmte, die Schaltfläche reagierte nicht.
    expect(undoBtn()).not.toBeNull();
  });

  // ADR-v9-155: `↶`/`↷` allein hingen erklärungslos am Tooltip — der auf Touch nicht
  // existiert, während iPhone/iPad die Primärplattform ist (dieselbe Lehre wie
  // ADR-v9-150 an der Mini-Karte). Der sichtbare Text ist zugleich der zugängliche Name.
  it('trägt eine sichtbare Beschriftung, nicht nur den Glyph', async () => {
    const appState = seeded();
    render(UndoControls, { props: { appState } });
    appState.savePerson({ ...appState.db.individuals.get('@I1@')!, given: 'Geändert' });
    await Promise.resolve();

    expect(undoBtn()!.textContent).toMatch(/Zurück/);
    // Der Glyph ist Dekoration neben dem Wort — er darf den Namen nicht verdoppeln.
    expect(undoBtn()!.querySelector('[aria-hidden="true"]')!.textContent).toBe('↶');
  });

  it('Klick auf „Rückgängig" stellt den Vorzustand her und aktiviert „Wiederherstellen"', async () => {
    const appState = seeded();
    render(UndoControls, { props: { appState } });
    appState.savePerson({ ...appState.db.individuals.get('@I1@')!, given: 'Geändert' });
    await Promise.resolve();

    await fireEvent.click(undoBtn()!);

    expect(appState.db.individuals.get('@I1@')!.given).toBe('Otto');
    expect(redoBtn()).not.toBeNull();
    expect(undoBtn()).toBeNull();
  });

  it('Klick auf „Wiederherstellen" führt den Schritt erneut aus', async () => {
    const appState = seeded();
    render(UndoControls, { props: { appState } });
    appState.savePerson({ ...appState.db.individuals.get('@I1@')!, given: 'Geändert' });
    await Promise.resolve();
    await fireEvent.click(undoBtn()!);

    await fireEvent.click(redoBtn()!);

    expect(appState.db.individuals.get('@I1@')!.given).toBe('Geändert');
  });

  it('zeigt „Zum geladenen Stand" nur, solange nichts rücknehmbar ist (Fallback, Spec 20 §1.2)', async () => {
    const appState = seeded();
    render(UndoControls, { props: { appState } });
    expect(screen.queryByText('Zum geladenen Stand')).not.toBeNull();

    appState.savePerson({ ...appState.db.individuals.get('@I1@')!, given: 'Geändert' });
    await Promise.resolve();

    // Sobald ein feinerer Weg zurück existiert, tritt die grobe Notbremse in den Hintergrund.
    expect(screen.queryByText('Zum geladenen Stand')).toBeNull();
  });

  // Nutzer-Entscheidung 2026-07-30 (ADR-v9-155 Nachtrag): die Meldung steht UNTER der
  // Knopfzeile, damit sie nicht mehr mit den Bedienelementen um Breite konkurriert — und
  // ihr Platz entsteht NUR, solange sie da ist (kein reservierter Leerraum, der die
  // Topbar dauerhaft höher machte).
  it('die Meldung steht unter der Knopfzeile, nicht in ihr', async () => {
    const appState = seeded();
    const { container } = render(UndoControls, { props: { appState } });
    appState.savePerson({ ...appState.db.individuals.get('@I1@')!, given: 'Geändert' });
    await Promise.resolve();
    await fireEvent.click(undoBtn()!);

    const notice = container.querySelector('.undo-controls__notice');
    expect(notice).not.toBeNull();
    // Entscheidend: NICHT im selben Container wie die Knöpfe.
    expect(notice!.closest('.undo-controls__row')).toBeNull();
    expect(notice!.parentElement!.classList.contains('undo-controls')).toBe(true);
  });

  it('ohne Meldung entsteht kein Platz — die Zeile wird gar nicht erst gerendert', () => {
    const { container } = render(UndoControls, { props: { appState: seeded() } });
    expect(container.querySelector('.undo-controls__notice')).toBeNull();
    // Nur die Knopfzeile, kein leeres Platzhalter-Element daneben.
    expect(container.querySelectorAll('.undo-controls > *')).toHaveLength(1);
  });

  it('blendet den Fallback aus, solange keine Datei geladen ist', () => {
    render(UndoControls, { props: { appState: createAppState() } });
    expect(screen.queryByText('Zum geladenen Stand')).toBeNull();
  });
});
