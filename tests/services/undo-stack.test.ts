// tests/services/undo-stack.test.ts — Undo/Redo-Stack (BL-01, ADR-v9-92, Spec 20 §1.2).
//
// Der Stack hält REFERENZEN auf Database-Objekte, keine Kopien — die Copy-on-Write-
// Disziplin der Kommandos (ADR-v9-92, tests/ui/app-state-cow.test.ts) ist die
// Voraussetzung dafür, dass eine gehaltene Referenz auch später noch den damaligen
// Zustand zeigt. Diese Datei prüft nur die Stack-Mechanik; dass die Referenzen gültig
// bleiben, prüft der Copy-on-Write-Test.
import { describe, expect, it } from 'vitest';
import { createUndoStack } from '../../services/undo';
import { makeDatabase, makePerson } from '../../core/model';
import type { Database } from '../../core/model/types';

/** Unterscheidbare Zustände — der Stack behandelt sie als undurchsichtige Referenzen. */
function state(marker: string): Database {
  const db = makeDatabase();
  db.individuals.set('@I1@', makePerson('@I1@', { given: marker }));
  return db;
}
const marker = (db: Database) => db.individuals.get('@I1@')!.given;

describe('createUndoStack — Mechanik', () => {
  it('ist anfangs leer (nichts rückgängig zu machen)', () => {
    const stack = createUndoStack();
    expect(stack.canUndo).toBe(false);
    expect(stack.canRedo).toBe(false);
    expect(stack.undo(state('jetzt'))).toBeNull();
    expect(stack.redo(state('jetzt'))).toBeNull();
  });

  it('undo gibt den Zustand VOR dem Kommando zurück', () => {
    const stack = createUndoStack();
    const vorher = state('A');
    stack.push(vorher);
    const jetzt = state('B');

    expect(stack.canUndo).toBe(true);
    expect(marker(stack.undo(jetzt)!)).toBe('A');
  });

  it('redo stellt den rückgängig gemachten Zustand wieder her', () => {
    const stack = createUndoStack();
    stack.push(state('A'));
    const jetzt = state('B');

    const zurueck = stack.undo(jetzt)!;
    expect(stack.canRedo).toBe(true);
    expect(marker(stack.redo(zurueck)!)).toBe('B');
  });

  it('mehrere Schritte laufen in umgekehrter Reihenfolge zurück', () => {
    const stack = createUndoStack();
    stack.push(state('A'));
    stack.push(state('B'));
    stack.push(state('C'));

    let cur = state('D');
    cur = stack.undo(cur)!;
    expect(marker(cur)).toBe('C');
    cur = stack.undo(cur)!;
    expect(marker(cur)).toBe('B');
    cur = stack.undo(cur)!;
    expect(marker(cur)).toBe('A');
    expect(stack.canUndo).toBe(false);
  });

  it('ein neues Kommando verwirft den Redo-Zweig (kein Sprung in eine tote Zukunft)', () => {
    const stack = createUndoStack();
    stack.push(state('A'));
    const zurueck = stack.undo(state('B'))!;
    expect(stack.canRedo).toBe(true);

    stack.push(zurueck); // neues Kommando statt redo

    expect(stack.canRedo).toBe(false);
    expect(stack.redo(state('X'))).toBeNull();
  });

  it('hält mindestens 30 Einträge (Spec 20 §1.2) und wirft die ÄLTESTEN weg', () => {
    const stack = createUndoStack();
    for (let i = 0; i < 40; i++) stack.push(state(`S${i}`));

    expect(stack.depth).toBe(30);
    // 40 Kommandos, 30 Einträge → zurück bis S10, danach ist Schluss.
    let cur = state('jetzt');
    for (let i = 39; i >= 10; i--) {
      cur = stack.undo(cur)!;
      expect(marker(cur)).toBe(`S${i}`);
    }
    expect(stack.canUndo).toBe(false);
  });

  it('clear() leert beide Richtungen (Laden ist kein Undo-Schritt, ADR-v9-92 Punkt 5)', () => {
    const stack = createUndoStack();
    stack.push(state('A'));
    stack.undo(state('B'));

    stack.clear();

    expect(stack.canUndo).toBe(false);
    expect(stack.canRedo).toBe(false);
    expect(stack.depth).toBe(0);
  });

  it('kopiert nichts — der abgelegte Zustand bleibt referenzgleich', () => {
    const stack = createUndoStack();
    const vorher = state('A');
    stack.push(vorher);

    // Das ist der Kern von ADR-v9-92: 12,8 MiB für 30 Snapshots statt 1,3 GiB.
    expect(stack.undo(state('B'))).toBe(vorher);
  });
});
