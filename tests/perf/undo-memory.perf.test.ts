// tests/perf/undo-memory.perf.test.ts — Speicher-Zusicherung für Undo/Redo
// (BL-01, Testkontrakt aus ADR-v9-92).
//
// WARUM DIESES GATE EXISTIERT: ADR-v9-92 verwirft den wörtlich gelesenen Spec-Bullet
// („Snapshot-Stack" = Tiefkopie je Eintrag), weil er bei der zugesicherten Bestandsgröße
// von 20.000 Personen 1,3 GiB belegt — auf dem primären Zielgerät (iPad/Safari,
// Spec 30 NFR-2) nicht tragbar. Die gewählte Bauweise (Referenz-Snapshots mit
// Copy-on-Write) kostet gemessen 12,8 MiB für 30 Einträge, Faktor 103 günstiger.
//
// Diese Ersparnis ist KEINE Eigenschaft des Undo-Stacks, sondern eine des Kommando-
// Verhaltens: sie hält nur, solange jedes Kommando unveränderte Entitäten TEILT statt
// sie zu kopieren. Eine spätere Änderung, die irgendwo wieder tief kopiert, bliebe
// fachlich unauffällig — alle Verhaltens-Tests blieben grün — und würde erst auf dem
// echten Gerät auffallen. Genau deshalb fordert der ADR hier ein Gate.
//
// LÄUFT NICHT IM STANDARD-TESTLAUF (tests/perf/ ist in vitest.config.ts ausgeschlossen).
// Aufruf: `npm run test:perf`. Die gemessene Zahl wird IMMER ausgegeben, auch bei grünem
// Lauf — sie ist der eigentliche Nutzen, die Schwelle nur der Wecker (dieselbe Disziplin
// wie scale.perf.test.ts, s. dortiger Kopf und ADR-v9-91).
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../../core/interop';
import { editDatabase } from '../../core/model/draft';
import { createUndoStack, DEFAULT_UNDO_LIMIT } from '../../services/undo';
import type { Database } from '../../core/model/types';
import { makeScaleGedcom } from './make-scale-gedcom';

/** Zusicherungsgröße aus ADR-v9-89 / Spec 30 §1. */
const PERSONEN = 20_000;

/** ADR-v9-92 Testkontrakt: „30 Snapshots bei 20.000 Personen bleiben unter 50 MiB".
 *
 *  BEMESSUNG — anders als bei den ZEIT-Budgets in scale.perf.test.ts, die auf dem Runner
 *  kalibriert werden mussten (ADR-v9-91 Nachtrag): Speicherverbrauch hängt an der
 *  Objektstruktur, nicht an der Hardware-Geschwindigkeit. Die Schwelle ist deshalb direkt
 *  aus dem ADR übernommen und braucht keine Runner-Toleranz.
 *
 *  ECHTE MESSUNG (2026-07-18, erster Lauf dieses Gates, Referenz-Mac, Node 24) — die
 *  ADR-Zahlen stammen aus einer Vorab-Schätzung mit `structuredClone` und liegen
 *  durchweg zu niedrig, die ENTSCHEIDUNG tragen sie unverändert:
 *
 *    Bauweise            | ADR-Schätzung        | hier gemessen
 *    Copy-on-Write       | 0,43 MiB/Snapshot    | 0,88 MiB/Snapshot  (30 → 26,4 MiB)
 *    Tiefkopie           | 43,8 MiB/Snapshot    | 59,3 MiB/Snapshot  (30 → 1.778,7 MiB)
 *    Verhältnis          | Faktor 103           | Faktor 67
 *
 *  Beide Ist-Werte liegen ~1,4–2× über der Schätzung, das Verhältnis bleibt dieselbe
 *  Größenordnung — der ADR-Beschluss (kein Tiefkopie-Stack) ist damit bestätigt, seine
 *  konkreten Zahlen sind es nicht. Wer sie zitiert, zitiert eine Schätzung.
 *
 *  Die Schwelle liegt bewusst weit über dem Ist (26,4 von 50 MiB): gefangen werden soll
 *  die RÜCKKEHR ZUR TIEFKOPIE — negativ verifiziert, s. o.: 1.778,7 MiB, Faktor 36 über
 *  der Schwelle. NICHT gefangen wird ein Zuwachs um Prozentpunkte; das ist Absicht. */
const BUDGET_MIB = 50;

const MIB = 1024 * 1024;

function heapUsedAfterGc(): number {
  // Zweimal sammeln: der erste Durchlauf kann Objekte finalisieren, die erst dadurch
  // unerreichbar werden.
  globalThis.gc!();
  globalThis.gc!();
  return process.memoryUsage().heapUsed;
}

describe(`Undo-Speicher-Gate: ${DEFAULT_UNDO_LIMIT} Snapshots bei ${PERSONEN} Personen (ADR-v9-92)`, () => {
  it('hält 30 Snapshots unter dem Speicherbudget (Copy-on-Write, keine Tiefkopie)', () => {
    // Ohne erzwungene Sammlung misst man Müll mit und bekommt Rauschen statt einer Zahl.
    // Lieber laut scheitern als still eine bedeutungslose Zahl grün melden.
    expect(
      typeof globalThis.gc,
      '`--expose-gc` fehlt — s. poolOptions in vitest.perf.config.ts',
    ).toBe('function');

    const { text } = makeScaleGedcom(PERSONEN);
    let db: Database = parseGedcom(text).db;
    const personIds = [...db.individuals.keys()];

    const stack = createUndoStack();
    const baseline = heapUsedAfterGc();

    // 30 realistische Einzel-Edits an VERSCHIEDENEN Personen — der ungünstigste Fall
    // innerhalb des Limits: jeder Schritt taut eine weitere Entität auf. Würden alle
    // dieselbe Person treffen, wäre der Verbrauch kleiner und die Messung geschönt.
    for (let i = 0; i < DEFAULT_UNDO_LIMIT; i++) {
      stack.push(db);
      const id = personIds[i % personIds.length]!;
      db = editDatabase(db, (d) => {
        const p = d.person(id);
        if (p) p.given = `Geändert ${i}`;
      });
    }

    const used = heapUsedAfterGc() - baseline;
    const usedMib = used / MIB;

    // Die Zahl ist der eigentliche Nutzen — immer ausgeben, auch bei grünem Lauf.
    console.log(
      `[undo-memory] ${DEFAULT_UNDO_LIMIT} Snapshots / ${PERSONEN} Personen: ` +
        `${usedMib.toFixed(1)} MiB (Budget ${BUDGET_MIB} MiB, ` +
        `${(usedMib / DEFAULT_UNDO_LIMIT).toFixed(2)} MiB je Snapshot)`,
    );

    // Stack am Leben halten, damit die Snapshots bis NACH der Messung erreichbar bleiben —
    // sonst sammelt gc() genau das weg, was gemessen werden soll.
    expect(stack.depth).toBe(DEFAULT_UNDO_LIMIT);
    expect(usedMib).toBeLessThan(BUDGET_MIB);
  });
});
