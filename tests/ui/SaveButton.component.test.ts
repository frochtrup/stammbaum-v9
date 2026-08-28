// @vitest-environment happy-dom
// tests/ui/SaveButton.component.test.ts — die drei Speicher-Varianten an der Fläche
// (Spec 14 §4.1, [ADR-v9-302]).
//
// WAS HIER GEHALTEN WIRD, und was NICHT: Die Tier-Logik und der Backup-Vorlauf liegen im
// FileService und sind dort geprüft (tests/services/backup-before-overwrite.test.ts).
// Hier geht es um die Naht dazwischen — dass die Fläche die beiden Schalter überhaupt
// ANBIETET und richtig herum durchreicht, und dass der Nutzer erfährt, ob gesichert wurde.
//
// Der letzte Punkt ist der eigentliche Anlass: INV-FILE-4 verlangt, dass ein Save ohne
// Sicherung nie stillschweigend passiert. Diese Zusage kann nur die Oberfläche einlösen —
// ein Dienst, der `backup:'kein-ordner'` zurückgibt und dessen Meldung das verschweigt,
// hält sie nicht.
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import SaveButton from '../../ui/shell/SaveButton.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { FileService } from '../../services/file/file-service';
import { parseGedcom } from '../../core/interop';
import { createMockAdapterSet } from '../services/mock-adapters';

const FX = (n: string) => join(__dirname, '../fixtures', n);
const ALT = new TextEncoder().encode('0 HEAD\n0 TRLR\n');
const FEST = () => new Date(2026, 7, 28, 14, 32, 5);

function setup(opts: Parameters<typeof createMockAdapterSet>[0] = {}) {
  const appState = createAppState();
  const parsed = parseGedcom(readFileSync(FX('mini.small.ged'), 'utf8'));
  appState.loadDatabase(parsed.db, 'mini.ged', parsed.roots);
  const set = createMockAdapterSet({ fsHandleSupported: true, diskContent: ALT, now: FEST, ...opts });
  render(SaveButton, {
    props: { appState, fileService: new FileService(set.adapters), handle: { id: 'datei' } },
  });
  return { appState, ...set };
}

const knopf = (name: string) => screen.getByRole('button', { name });

describe('SaveButton — die drei Wege (Spec 14 §4.1)', () => {
  it('bietet alle drei an: Speichern, Speichern unter …, Ohne Sicherung speichern', () => {
    setup();
    expect(knopf('Speichern')).toBeTruthy();
    expect(knopf('Speichern unter …')).toBeTruthy();
    expect(knopf('Ohne Sicherung speichern')).toBeTruthy();
  });

  it('„Speichern" sichert vorher und nennt den Namen der Sicherung', async () => {
    const { backup } = setup({ backupConnected: true });

    await fireEvent.click(knopf('Speichern'));

    await waitFor(() => expect(backup.writes).toHaveLength(1));
    expect(backup.writes[0].filename).toBe('mini (Backup 2026-08-28 14-32-05).ged');
    expect(backup.writes[0].bytes).toEqual(ALT);
    await waitFor(() =>
      expect(screen.getByText(/Vorheriger Stand gesichert: mini \(Backup 2026-08-28 14-32-05\)\.ged/)).toBeTruthy(),
    );
  });

  it('sagt es, wenn OHNE Sicherung gespeichert wurde — INV-FILE-4', async () => {
    const { fsHandle } = setup(); // kein Ordner verbunden
    await fireEvent.click(knopf('Speichern'));

    await waitFor(() => expect(fsHandle.writeCalls).toHaveLength(1));
    // Die Datei ist geschrieben — und der Satz verschweigt die fehlende Sicherung nicht.
    await waitFor(() => expect(screen.getByText(/Ohne Sicherung — kein Backup-Ordner verbunden/)).toBeTruthy());
  });

  it('„Ohne Sicherung speichern" überspringt den Vorlauf und benennt die Wahl', async () => {
    const { backup, fsHandle } = setup({ backupConnected: true });

    await fireEvent.click(knopf('Ohne Sicherung speichern'));

    await waitFor(() => expect(fsHandle.writeCalls).toHaveLength(1));
    expect(backup.writes).toEqual([]);
    await waitFor(() => expect(screen.getByText(/Ohne Sicherung, wie gewählt\./)).toBeTruthy());
  });

  it('meldet einen Fehlschlag der Sicherung als NICHT gespeichert — und nennt den Ausweg', async () => {
    const { fsHandle } = setup({ backupConnected: true, backupWriteFails: 'Ordner ist voll' });

    await fireEvent.click(knopf('Speichern'));

    await waitFor(() => expect(screen.getByText(/Nicht gespeichert/)).toBeTruthy());
    expect(screen.getByText(/Ordner ist voll/)).toBeTruthy();
    expect(screen.getByText(/Ohne Sicherung speichern.*schreibt sie trotzdem/)).toBeTruthy();
    // Der Punkt, um den es geht: die Datei ist unangetastet.
    expect(fsHandle.writeCalls).toEqual([]);
  });

  it('„Speichern unter …" öffnet den Dialog trotz Handle und übernimmt den neuen Namen', async () => {
    const { appState, fsHandle } = setup({
      fsCanPickSaveTarget: true,
      fsSaveTarget: { id: 'neu' },
      handleName: 'Zweitname.ged',
      backupConnected: true,
    });

    await fireEvent.click(knopf('Speichern unter …'));

    await waitFor(() => expect(fsHandle.pickSaveTargetCalls).toHaveLength(1));
    expect(fsHandle.writeCalls[0].handle).toEqual({ id: 'neu' });
    // Ab jetzt IST das die geladene Datei — sonst zeigte die Oberfläche weiter den alten
    // Namen, während der nächste stille Save in die neue Datei schriebe.
    expect(appState.fileName).toBe('Zweitname.ged');
    await waitFor(() => expect(screen.getByText(/Gespeichert unter „Zweitname\.ged"/)).toBeTruthy());
  });
});
