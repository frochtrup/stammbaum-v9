// tests/core/model/draft.test.ts — Copy-on-Write-Primitive (ADR-v9-92, BL-01).
//
// Das ist der Baustein, auf dem Undo/Redo steht: ein Editier-Kommando darf NIE ein
// Entitäts-Objekt anfassen, das ein zurückgehaltener Snapshot noch referenziert. Die
// Tests hier prüfen genau diese zwei Hälften — (a) die geänderte Entität ist ein NEUES
// Objekt, (b) alle übrigen werden mit dem Vorzustand GETEILT (das ist die Bedingung für
// die 0,43 MiB/Snapshot aus ADR-v9-92; ohne (b) wäre es wieder eine Tiefkopie).
import { describe, it, expect } from 'vitest';
import { makeDatabase, makePerson, makeFamily } from '../../../core/model';
import { editDatabase } from '../../../core/model/draft';

describe('editDatabase — Copy-on-Write (ADR-v9-92)', () => {
  function dbWith(n: number) {
    const db = makeDatabase();
    for (let i = 1; i <= n; i++) db.individuals.set(`@I${i}@`, makePerson(`@I${i}@`));
    db.families.set('@F1@', makeFamily('@F1@'));
    return db;
  }

  it('ändert die bearbeitete Person, ohne den Vorzustand anzufassen', () => {
    const before = dbWith(3);
    const originalPerson = before.individuals.get('@I2@')!;

    const after = editDatabase(before, (d) => {
      d.person('@I2@')!.tasks.push({
        id: 't1',
        text: 'Neu',
        category: '',
        created: '2026-01-01',
        status: 'todo',
        done: false,
        sourceRef: '',
      });
    });

    expect(after.individuals.get('@I2@')!.tasks).toHaveLength(1);
    // Der Vorzustand darf NICHTS davon sehen — das ist der Fehler, den ADR-v9-92 ausschließt.
    expect(before.individuals.get('@I2@')!.tasks).toHaveLength(0);
    expect(after.individuals.get('@I2@')).not.toBe(originalPerson);
  });

  it('teilt alle unveränderten Entitäten mit dem Vorzustand (Referenzgleichheit)', () => {
    const before = dbWith(3);

    const after = editDatabase(before, (d) => {
      d.person('@I2@')!.sex = 'M';
    });

    // Kern der Speicher-Zusicherung: nur die berührte Entität ist neu.
    expect(after.individuals.get('@I1@')).toBe(before.individuals.get('@I1@'));
    expect(after.individuals.get('@I3@')).toBe(before.individuals.get('@I3@'));
    expect(after.families.get('@F1@')).toBe(before.families.get('@F1@'));
    // Unberührte Maps werden ebenfalls geteilt, nicht neu gebaut.
    expect(after.sources).toBe(before.sources);
    expect(after.repositories).toBe(before.repositories);
  });

  it('liefert bei mehrfachem Zugriff denselben Entwurf (klont nur einmal)', () => {
    const before = dbWith(2);
    let a: unknown, b: unknown;

    editDatabase(before, (d) => {
      a = d.person('@I1@');
      b = d.person('@I1@');
    });

    expect(a).toBe(b);
  });

  it('gibt ein NEUES Database zurück; das alte behält seine Map-Identitäten', () => {
    const before = dbWith(2);
    const beforeIndividuals = before.individuals;

    const after = editDatabase(before, (d) => {
      d.person('@I1@')!.sex = 'F';
    });

    expect(after).not.toBe(before);
    expect(before.individuals).toBe(beforeIndividuals);
    expect(before.individuals.get('@I1@')!.sex).not.toBe('F');
  });

  it('ohne Änderung bleibt alles referenzgleich (kein unnötiger Snapshot-Ballast)', () => {
    const before = dbWith(2);

    const after = editDatabase(before, () => {
      /* nichts anfassen */
    });

    expect(after.individuals).toBe(before.individuals);
    expect(after.families).toBe(before.families);
  });

  it('setPerson/removePerson wirken nur auf den neuen Stand', () => {
    const before = dbWith(2);

    const after = editDatabase(before, (d) => {
      d.setPerson(makePerson('@I9@'));
      d.removePerson('@I1@');
    });

    expect(after.individuals.has('@I9@')).toBe(true);
    expect(after.individuals.has('@I1@')).toBe(false);
    expect(before.individuals.has('@I9@')).toBe(false);
    expect(before.individuals.has('@I1@')).toBe(true);
  });

  it('unbekannte id liefert null statt still zu scheitern', () => {
    const before = dbWith(1);
    editDatabase(before, (d) => {
      expect(d.person('@IX@')).toBeNull();
      expect(d.family('@FX@')).toBeNull();
    });
  });
});
