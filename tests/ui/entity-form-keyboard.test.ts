// @vitest-environment happy-dom
// tests/ui/entity-form-keyboard.test.ts — Enter speichert, Escape bricht ab
// (BL-276, [21 §6i] „Tastatur-first überall", [32 TST-15]).
//
// WAS DIESER WÄCHTER HÄLT. Nicht „es gibt Formulare", sondern: es gibt nur EINE Klasse
// davon. Der Befund war eine Zweiteilung — `TaskForm`/`LogForm`/`HypothesisForm` waren
// `<form onsubmit>` und speicherten mit Enter, die sechs Entitäts-Formulare waren `<div>`
// mit `type="button"` und taten auf beide Tasten nichts. §6i macht diesen Unterschied
// nicht und gilt ausdrücklich mobil wie auf Desktop.
//
// Die Population wird GERECHNET, nicht aufgezählt: jede Fläche unter `ui/`, die einen
// „Speichern"-Knopf trägt. Eine Namensliste wäre in dem Moment tot, in dem jemand ein
// siebtes Formular anlegt — genau der Verfallsweg, den Regel 6 des Backlogs beschreibt.
//
// GRENZE, bewusst benannt: dass ein Enter IM FELD den Submit auslöst, ist Browser-
// Verhalten (implicit submission) und in happy-dom nicht nachbildbar. Geprüft wird hier,
// dass die Fläche ein `<form>` mit `onsubmit` IST und dass ihr Escape-Pfad wirkt; die
// Enter-Wirkung im echten Browser gehört zur manuellen Stichprobe aus TST-15.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PersonForm from '../../ui/views/person/PersonForm.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makePerson } from '../../core/model';
import { pinLayout } from './layout-harness';
import { layout } from '../../ui/shell/layout.svelte';

// `process.cwd()` statt `import.meta.url`: diese Datei läuft in happy-dom (sie prüft
// unten auch das VERHALTEN), und dort ist `import.meta.url` keine `file:`-URL mehr.
// Vitests Wurzel ist das Repo-Wurzelverzeichnis.
const UI_DIR = resolve(process.cwd(), 'ui');

function svelteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...svelteFiles(p));
    else if (name.endsWith('.svelte')) out.push(p);
  }
  return out;
}

/** Kommentare raus — die Erklärung eines Verstoßes darf nicht als Verstoß zählen und die
 *  Erklärung einer Lösung nicht als Lösung (dieselbe Falle wie bei `txt:`-Belegen). */
function ohneKommentare(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** Jede Fläche mit einer „Speichern"-Aktion — die Population, um die es geht. */
function speicherFlaechen(): { pfad: string; src: string }[] {
  return svelteFiles(UI_DIR)
    .map((pfad) => ({ pfad, src: ohneKommentare(readFileSync(pfad, 'utf8')) }))
    .filter(({ src }) => />\s*Speichern/.test(src));
}

const kurz = (p: string) => p.replace(UI_DIR, 'ui');

describe('BL-276 — jede Speichern-Fläche beantwortet beide Tastaturfragen', () => {
  // Ohne diese Zählung liefe jede Prüfung unten über eine leere Menge und wäre grün,
  // ohne etwas geprüft zu haben (ADR-v9-200).
  it('es gibt überhaupt Speichern-Flächen zu prüfen', () => {
    expect(speicherFlaechen().length).toBeGreaterThanOrEqual(12);
  });

  it('jede ist ein `<form>` mit `onsubmit` — Enter speichert', () => {
    const verstoesse = speicherFlaechen()
      .filter(({ src }) => !/<form\b[\s\S]*?onsubmit=/.test(src))
      .map(({ pfad }) => kurz(pfad));
    expect(verstoesse, 'Speichern-Fläche ohne `<form onsubmit>` — Enter tut dort nichts').toEqual([]);
  });

  it('jede trägt ihren Speichern-Knopf als `type="submit"`', () => {
    const verstoesse = speicherFlaechen()
      .filter(({ src }) => !/type="submit"/.test(src))
      .map(({ pfad }) => kurz(pfad));
    expect(verstoesse, 'Speichern-Knopf ist `type="button"` — der Submit-Pfad ist tot').toEqual([]);
  });

  it('jede hat einen Escape-Ausgang', () => {
    const verstoesse = speicherFlaechen()
      .filter(({ src }) => !/formEscape\(|['"]Escape['"]/.test(src))
      .map(({ pfad }) => kurz(pfad));
    expect(verstoesse, 'Speichern-Fläche ohne Escape — die zweite Hälfte von §6i fehlt').toEqual([]);
  });

  // EIN Mechanismus, kein abzuschreibendes Muster (INV-UI-4). Die beiden Handler tragen
  // je einen `stopPropagation`, den man je Fundstelle neu übersehen kann — Begründung im
  // Kopf von `form-keys.ts`. Ein inline-Lambda hätte ihn nicht.
  it('kein Formular baut sich seinen Submit-Handler selbst', () => {
    const verstoesse = speicherFlaechen()
      .filter(({ src }) => /onsubmit=\{\(e\)/.test(src))
      .map(({ pfad }) => kurz(pfad));
    expect(verstoesse, 'inline-Submit-Handler statt `formSubmit` — der `stopPropagation` fehlt dort').toEqual([]);
  });
});

let unpin: () => void;
beforeEach(() => {
  unpin = pinLayout(false);
});
afterEach(() => {
  unpin();
  layout.reset();
});

describe('BL-276 — die Wirkung, an einem Formular durchgespielt', () => {
  function aufbau() {
    const appState = createAppState();
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Otto', surname: 'Bauer' }));
    appState.loadDatabase(db, 'test.ged');
    return { appState, person: appState.db.individuals.get('@I1@')! };
  }

  it('Submit speichert — ohne dass der Speichern-Knopf angeklickt wurde', async () => {
    const { appState, person } = aufbau();
    const onSaved = vi.fn();
    const { container } = render(PersonForm, { props: { appState, person, onSaved } });

    await fireEvent.input(screen.getByLabelText('Vorname'), { target: { value: 'Otta' } });
    await fireEvent.submit(container.querySelector('form')!);

    expect(appState.db.individuals.get('@I1@')?.given).toBe('Otta');
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it('Escape verwirft die Feldwerte — und speichert dabei nichts', async () => {
    const { appState, person } = aufbau();
    render(PersonForm, { props: { appState, person } });

    const feld = screen.getByLabelText('Vorname') as HTMLInputElement;
    await fireEvent.input(feld, { target: { value: 'Otta' } });
    await fireEvent.keyDown(feld, { key: 'Escape' });

    expect(feld.value).toBe('Otto');
    expect(appState.db.individuals.get('@I1@')?.given).toBe('Otto');
  });

  it('Escape im Wegwerf-Entwurf schließt die Fläche (dort IST der Sekundär-Knopf der Ausgang)', async () => {
    const { appState, person } = aufbau();
    const onCancel = vi.fn();
    render(PersonForm, { props: { appState, person, onCancel } });

    await fireEvent.keyDown(screen.getByLabelText('Vorname'), { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('Escape geht nicht weiter nach oben — das erste gehört der innersten Fläche', async () => {
    const { appState, person } = aufbau();
    const draussen = vi.fn();
    const { container } = render(PersonForm, { props: { appState, person } });
    container.parentElement?.addEventListener('keydown', draussen);

    await fireEvent.keyDown(screen.getByLabelText('Vorname'), { key: 'Escape' });

    expect(draussen).not.toHaveBeenCalled();
  });
});
