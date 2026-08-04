// tests/ui/save-action-save-as.test.ts — „Speichern unter" (Tier 1b) im UI-Kommando
// (Spec 14 §4, ADR-v9-194).
//
// Die Tier-AUSWAHL selbst liegt in tests/services/file-service.test.ts; hier geht es um
// das, was die Schale daraus macht: die Meldung, das Weiterreichen des Handles und —
// der eigentliche Anlass dieser Datei — dass ein gescheitertes MERKEN einen bereits
// vollständig geschriebenen Save nicht als Fehlschlag ausgibt.
//
// Dieser letzte Fall stammt aus der eigenen Browser-Verifikation, nicht aus dem Entwurf:
// dort schlug `rememberHandle` fehl, die Datei war mit 2.260.632 Bytes längst geschrieben,
// und die Fläche meldete trotzdem „Speichern fehlgeschlagen". Ein Nutzer, der das liest,
// speichert ein zweites Mal.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { saveCurrentDoc } from '../../ui/shell/save-action';
import { FileService } from '../../services/file/file-service';
import { parseGedcom } from '../../core/interop';
import { createMockAdapterSet } from '../services/mock-adapters';

const FX = (n: string) => join(__dirname, '../fixtures', n);

function geladeneApp() {
  const appState = createAppState();
  const parsed = parseGedcom(readFileSync(FX('mini.small.ged'), 'utf8'));
  appState.loadDatabase(parsed.db, 'mini.ged', parsed.roots);
  return appState;
}

/** Kein Handle + Plattform kann „Speichern unter" — die Lage auf dem Desktop nach Reload. */
function speichernUnterUmgebung(saveTarget: unknown = { id: 'gewählt' }) {
  return createMockAdapterSet({
    initialWorkingCopy: { text: 'ALT', name: 'mini.ged', format: 'gedcom' },
    fsHandleSupported: true,
    fsCanPickSaveTarget: true,
    fsSaveTarget: saveTarget,
    shareSupported: false,
  });
}

describe('saveCurrentDoc — „Speichern unter" (Tier 1b)', () => {
  it('meldet einen geschriebenen Save und reicht das erworbene Handle zurück', async () => {
    const { adapters, fsHandle, workingCopyStore } = speichernUnterUmgebung();
    const outcome = await saveCurrentDoc(geladeneApp(), new FileService(adapters));

    expect(outcome.notice).toBe('Gespeichert (in die gewählte Datei).');
    expect(outcome.handle).toEqual({ id: 'gewählt' });
    expect(fsHandle.pickSaveTargetCalls[0].filename).toBe('mini.ged');
    // Gemerkt, damit der NÄCHSTE Save still über Tier 1a läuft.
    expect(workingCopyStore._peek()?.handle).toEqual({ id: 'gewählt' });
  });

  it('meldet den Abbruch als Abbruch, nicht als Fehlschlag, und merkt kein Handle', async () => {
    const { adapters, fsHandle, workingCopyStore } = speichernUnterUmgebung(null);
    const outcome = await saveCurrentDoc(geladeneApp(), new FileService(adapters));

    expect(outcome.notice).toBe('Speichern abgebrochen.');
    expect(outcome.handle).toBeUndefined();
    expect(fsHandle.write).not.toHaveBeenCalled();
    expect(workingCopyStore._peek()?.handle).toBeUndefined();
  });

  it('meldet KEINEN Fehlschlag, wenn nur das Merken des Handles scheitert — die Datei ist geschrieben', async () => {
    const { adapters, fsHandle } = speichernUnterUmgebung();
    // Genau der in der Browser-Verifikation beobachtete Fall: der IDB-`put` wirft
    // (dort: nicht strukturiert klonbar), nachdem write() längst durchgelaufen ist.
    adapters.workingCopyStore.save = async () => {
      throw new Error("Failed to execute 'put' on 'IDBObjectStore': could not be cloned.");
    };

    const outcome = await saveCurrentDoc(geladeneApp(), new FileService(adapters));

    expect(outcome.notice).toBe('Gespeichert (in die gewählte Datei).');
    expect(outcome.notice).not.toMatch(/fehlgeschlagen/);
    // Die Bytes sind wirklich geflossen — das ist der Grund, warum die Meldung stimmt.
    expect(fsHandle.writeCalls).toHaveLength(1);
    expect(String(fsHandle.writeCalls[0].bytes)).toContain('0 HEAD');
  });
});
