// @vitest-environment happy-dom
// tests/ui/Validation.component.test.ts — Prüfbericht und Regel-Konfiguration als
// tatsächliches DOM-Rendering (Spec 32 §6; Spec 20 §1.11h/§3).
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ValidationPanel from '../../ui/views/validation/ValidationPanel.svelte';
import ValConfigSheet from '../../ui/views/validation/ValConfigSheet.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makePerson } from '../../core/model';
import { defaultConfig, runValidation, type Finding } from '../../core/validate/index';

function stateWithPerson() {
  const appState = createAppState();
  const db = makeDatabase();
  const p = makePerson('@I1@', { given: 'Otto', surname: 'Bauer', name: 'Otto /Bauer/' });
  p.birth.date = '1900';
  p.death.date = '1880';
  db.individuals.set('@I1@', p);
  appState.loadDatabase(db, 'test.ged');
  return appState;
}

function findingsFor(appState: ReturnType<typeof createAppState>): Finding[] {
  return runValidation(appState.db, defaultConfig());
}

describe('ValidationPanel', () => {
  it('zeigt den Befund mit Personenname und Text', () => {
    const appState = stateWithPerson();
    render(ValidationPanel, {
      props: { appState, findings: findingsFor(appState), onClose: () => {}, onOpenConfig: () => {} },
    });

    expect(screen.getByText(/Sterbejahr 1880 liegt vor Geburtsjahr 1900/)).toBeTruthy();
    // Der Name darf NICHT den rohen GEDCOM-Wert mit Schrägstrichen zeigen.
    expect(screen.queryByText(/\/Bauer\//)).toBeNull();
  });

  it('gruppiert nach Schwere und nennt die Anzahl je Block', () => {
    const appState = stateWithPerson();
    render(ValidationPanel, {
      props: { appState, findings: findingsFor(appState), onClose: () => {}, onOpenConfig: () => {} },
    });
    expect(screen.getByText(/✗ Fehler \(\d+\)/)).toBeTruthy();
  });

  it('meldet den Leerzustand ohne Befunde', () => {
    const appState = stateWithPerson();
    render(ValidationPanel, { props: { appState, findings: [], onClose: () => {}, onOpenConfig: () => {} } });
    expect(screen.getByText(/Keine Befunde/)).toBeTruthy();
  });

  it('„Als Aufgabe übernehmen" legt die Aufgabe an und entfernt die Zeile', async () => {
    const appState = stateWithPerson();
    const findings = findingsFor(appState);
    const target = findings.find((f) => f.rule === 'DEATH_BEFORE_BIRTH')!;
    render(ValidationPanel, { props: { appState, findings, onClose: () => {}, onOpenConfig: () => {} } });

    expect(appState.db.individuals.get('@I1@')!.tasks).toHaveLength(0);
    const buttons = screen.getAllByLabelText('Als Aufgabe übernehmen');
    await fireEvent.click(buttons[0]);

    const tasks = appState.db.individuals.get('@I1@')!.tasks;
    expect(tasks.length).toBeGreaterThan(0);
    // Die übernommene Zeile verschwindet, damit sie nicht doppelt angeboten wird.
    expect(screen.queryByText(target.text)).toBeNull();
  });

  it('das ⚙ im Berichtskopf öffnet die Konfiguration (INV-UI-11: kein Dauer-Toolbar-Icon)', async () => {
    const appState = stateWithPerson();
    const onOpenConfig = vi.fn();
    render(ValidationPanel, {
      props: { appState, findings: findingsFor(appState), onClose: () => {}, onOpenConfig },
    });

    await fireEvent.click(screen.getByLabelText('Prüfregeln konfigurieren'));
    expect(onOpenConfig).toHaveBeenCalledTimes(1);
  });

  it('ein Klick auf die Trägerperson navigiert dorthin', async () => {
    const appState = stateWithPerson();
    const onNavigateToPerson = vi.fn();
    render(ValidationPanel, {
      props: { appState, findings: findingsFor(appState), onClose: () => {}, onOpenConfig: () => {}, onNavigateToPerson },
    });

    await fireEvent.click(screen.getAllByText('Otto Bauer')[0]);
    expect(onNavigateToPerson).toHaveBeenCalledWith('@I1@');
  });
});

describe('ValConfigSheet', () => {
  it('rendert die Regeln aus der Registry, opt-in-Regeln als abgehakt-aus', () => {
    render(ValConfigSheet, {
      props: { config: defaultConfig(), onSave: () => {}, onClose: () => {} },
    });

    expect(screen.getByText('Sterbejahr vor Geburtsjahr')).toBeTruthy();
    expect(screen.getByText('Offene Hypothesen')).toBeTruthy();
    // Zwei ab Werk deaktivierte Regeln tragen die opt-in-Markierung.
    expect(screen.getAllByText('opt-in')).toHaveLength(2);
  });

  it('gibt Abschaltung und geänderte Schwelle an onSave weiter', async () => {
    const onSave = vi.fn();
    render(ValConfigSheet, { props: { config: defaultConfig(), onSave, onClose: () => {} } });

    const box = screen.getByLabelText('Geschlecht unbekannt', { exact: false });
    await fireEvent.click(box);
    await fireEvent.click(screen.getByText('Speichern'));

    expect(onSave).toHaveBeenCalledTimes(1);
    const cfg = onSave.mock.calls[0][0];
    expect(cfg.disabled.has('MISSING_SEX')).toBe(true);
    // Das an die Engine gereichte Set ist ein gewöhnliches Set (INV-ARCH-1).
    expect(cfg.disabled.constructor.name).toBe('Set');
  });

  it('„Alle aus" schaltet jede Regel ab, „Zurücksetzen" stellt die Defaults her', async () => {
    const onSave = vi.fn();
    render(ValConfigSheet, { props: { config: defaultConfig(), onSave, onClose: () => {} } });

    await fireEvent.click(screen.getByText('Alle aus'));
    await fireEvent.click(screen.getByText('Speichern'));
    const alleAus = onSave.mock.calls[0][0];
    expect(alleAus.disabled.size).toBeGreaterThan(30);

    await fireEvent.click(screen.getByText('Zurücksetzen'));
    await fireEvent.click(screen.getByText('Speichern'));
    const zurueck = onSave.mock.calls[1][0];
    expect([...zurueck.disabled].sort()).toEqual(['MISSING_EVAL', 'OPEN_HYPO']);
  });

  it('Abbrechen verwirft die Änderung folgenlos', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(ValConfigSheet, { props: { config: defaultConfig(), onSave, onClose } });

    await fireEvent.click(screen.getByLabelText('Geschlecht unbekannt', { exact: false }));
    await fireEvent.click(screen.getByText('Abbrechen'));

    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
