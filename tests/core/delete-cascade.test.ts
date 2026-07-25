// tests/core/delete-cascade.test.ts — referenz-auflösendes Löschen der vier Modell-
// Entitäten (Person/Familie/Quelle/Archiv), ADR-v9-… / BL-….
//
// WARUM ES DIESE KOMMANDOS GIBT: die nackten `deletePerson`/`deleteFamily`/`deleteSource`/
// `deleteRepository` (core/model/commands.ts) entfernen NUR das Objekt und lassen verwaiste
// Referenzen stehen (Kopfkommentar dort). Für den UI-Lösch-Weg ist das falsch: eine gelöschte
// Person bliebe als Elternteil/Kind/Partner im Baum stehen. Die Kaskaden hängen jede Referenz
// sauber aus — und eine dadurch VÖLLIG leere Familie (0 Eltern, 0 Kinder) wird mitentfernt
// (die einzige zugelassene Kaskade auf ein Sach-Objekt).
//
// Der schärfste Wächter ist wie bei mergePersons `findOrphanRefs(db) === []` (INV-P2, kennt
// alle PersonId-/SourceId-/RepoId-Stellen, die es selbst prüft) plus `checkIndiFamConsistency`
// (INV-P3). Zitat-Träger, die INV-P2 NICHT prüft (Event-/ChildLink-/Association-/extraNames-
// Zitate), werden zusätzlich direkt geprüft.
import { describe, it, expect } from 'vitest';
import {
  makeDatabase,
  makePerson,
  makeFamily,
  makeSource,
  makeRepository,
  makeEvent,
  makeCitation,
} from '../../core/model/factory';
import { findOrphanRefs, checkIndiFamConsistency } from '../../core/model/integrity';
import {
  deletePersonCascade,
  deleteFamilyCascade,
  deleteSourceCascade,
  deleteRepositoryCascade,
} from '../../core/model/delete-cascade';
import type {
  Database,
  Person,
  Family,
  Source,
  Repository,
  ChildLink,
  Association,
  PersonName,
  Citation,
} from '../../core/model/types';

function db(opts: {
  persons?: Person[];
  families?: Family[];
  sources?: Source[];
  repositories?: Repository[];
}): Database {
  const base = makeDatabase();
  for (const p of opts.persons ?? []) base.individuals.set(p.id, p);
  for (const f of opts.families ?? []) base.families.set(f.id, f);
  for (const s of opts.sources ?? []) base.sources.set(s.id, s);
  for (const r of opts.repositories ?? []) base.repositories.set(r.id, r);
  return base;
}

function childLink(familyId: string, citations: Citation[] = []): ChildLink {
  return {
    familyId,
    pedigree: '',
    fatherRel: '',
    motherRel: '',
    fatherRelSeen: false,
    motherRelSeen: false,
    citations,
  };
}

function assoc(personRef: string | null, citations: Citation[] = []): Association {
  return { personRef, grampsHandle: null, role: 'godparent', note: '', citations };
}

function extraName(citations: Citation[]): PersonName {
  return { nameRaw: '', given: '', surname: '', prefix: '', suffix: '', type: '', citations };
}

// --- deletePersonCascade: Familienkanten sauber aushängen -----------------------------

describe('deletePersonCascade', () => {
  it('hängt die Person aus Eltern-Slot, Kindliste, Assoziationen und Aliassen aus (0 Waisen)', () => {
    // @P@: Ehemann in @F1@ (Frau @W@ bleibt), Kind in @F2@ (Vater @V@ bleibt).
    // @Q@ verweist auf @P@ per Assoziation UND Alias.
    const next = deletePersonCascade(
      db({
        persons: [
          makePerson('@P@', { parentIn: ['@F1@'], childOf: [childLink('@F2@')] }),
          makePerson('@W@', { parentIn: ['@F1@'] }),
          makePerson('@V@', { parentIn: ['@F2@'] }),
          makePerson('@Q@', { associations: [assoc('@P@')], aliases: ['@P@'] }),
        ],
        families: [
          makeFamily('@F1@', { husband: '@P@', wife: '@W@' }),
          makeFamily('@F2@', { husband: '@V@', children: ['@P@'] }),
        ],
      }),
      '@P@',
    );

    expect(next.individuals.has('@P@')).toBe(false);
    expect(next.families.get('@F1@')!.husband).toBeNull();
    expect(next.families.get('@F2@')!.children).not.toContain('@P@');
    expect(next.individuals.get('@Q@')!.associations).toHaveLength(0);
    expect(next.individuals.get('@Q@')!.aliases).toHaveLength(0);
    expect(findOrphanRefs(next)).toEqual([]);
    expect(checkIndiFamConsistency(next)).toEqual([]);
  });

  it('löscht eine durch das Aushängen VÖLLIG leer gewordene Familie mit', () => {
    const next = deletePersonCascade(
      db({
        persons: [makePerson('@P@', { parentIn: ['@F1@'] })],
        families: [makeFamily('@F1@', { husband: '@P@' })], // wife null, keine Kinder
      }),
      '@P@',
    );
    expect(next.families.has('@F1@')).toBe(false);
    expect(findOrphanRefs(next)).toEqual([]);
  });

  it('KONTROLLE: eine Familie mit verbleibendem Partner/Kind bleibt bestehen', () => {
    const next = deletePersonCascade(
      db({
        persons: [
          makePerson('@P@', { parentIn: ['@F1@'] }),
          makePerson('@Q@', { parentIn: ['@F1@'] }),
        ],
        families: [makeFamily('@F1@', { husband: '@P@', wife: '@Q@' })],
      }),
      '@P@',
    );
    expect(next.families.has('@F1@')).toBe(true);
    expect(next.families.get('@F1@')!.wife).toBe('@Q@');
    expect(findOrphanRefs(next)).toEqual([]);
  });

  it('lässt den Vorzustand unangetastet (Copy-on-Write, Undo-Snapshot bleibt gültig)', () => {
    const before = db({
      persons: [makePerson('@P@', { parentIn: ['@F1@'] }), makePerson('@W@', { parentIn: ['@F1@'] })],
      families: [makeFamily('@F1@', { husband: '@P@', wife: '@W@' })],
    });
    deletePersonCascade(before, '@P@');
    expect(before.individuals.has('@P@')).toBe(true);
    expect(before.families.get('@F1@')!.husband).toBe('@P@');
  });

  it('no-op bei unbekannter id', () => {
    const base = db({ persons: [makePerson('@P@')] });
    const next = deletePersonCascade(base, '@NOPE@');
    expect(next.individuals.has('@P@')).toBe(true);
  });
});

// --- deleteFamilyCascade: Person-Seite (parentIn/childOf) lösen ------------------------

describe('deleteFamilyCascade', () => {
  it('löst Eltern (parentIn) und Kinder (childOf), Personen bleiben bestehen (0 Waisen)', () => {
    const next = deleteFamilyCascade(
      db({
        persons: [
          makePerson('@H@', { parentIn: ['@F1@'] }),
          makePerson('@W@', { parentIn: ['@F1@'] }),
          makePerson('@C@', { childOf: [childLink('@F1@')] }),
        ],
        families: [makeFamily('@F1@', { husband: '@H@', wife: '@W@', children: ['@C@'] })],
      }),
      '@F1@',
    );
    expect(next.families.has('@F1@')).toBe(false);
    expect(next.individuals.get('@H@')!.parentIn).toHaveLength(0);
    expect(next.individuals.get('@W@')!.parentIn).toHaveLength(0);
    expect(next.individuals.get('@C@')!.childOf).toHaveLength(0);
    expect(findOrphanRefs(next)).toEqual([]);
    expect(checkIndiFamConsistency(next)).toEqual([]);
  });
});

// --- deleteSourceCascade: Zitate an ALLEN Trägern entfernen ----------------------------

describe('deleteSourceCascade', () => {
  it('entfernt Zitate auf die Quelle an allen Träger-Stellen und die Quelle selbst', () => {
    const cit = (): Citation => makeCitation('@S1@');
    const person = makePerson('@P@', {
      topLevelCitations: [cit()],
      nameCitations: [cit()],
      extraNames: [extraName([cit()])],
      childOf: [childLink('@F1@', [cit()])],
      associations: [assoc('@X@', [cit()])],
      birth: makeEvent('BIRT', { citations: [cit()] }),
      events: [makeEvent('OCCU', { citations: [cit()] })],
      parentIn: ['@F1@'],
    });
    const family = makeFamily('@F1@', {
      husband: '@P@',
      citations: [cit()],
      marriage: makeEvent('MARR', { citations: [cit()] }),
      events: [makeEvent('RESI', { citations: [cit()] })],
    });
    const other = makePerson('@X@');

    const next = deleteSourceCascade(
      db({ persons: [person, other], families: [family], sources: [makeSource('@S1@')] }),
      '@S1@',
    );

    expect(next.sources.has('@S1@')).toBe(false);
    const p = next.individuals.get('@P@')!;
    expect(p.topLevelCitations).toHaveLength(0);
    expect(p.nameCitations).toHaveLength(0);
    expect(p.extraNames[0]!.citations).toHaveLength(0);
    expect(p.childOf[0]!.citations).toHaveLength(0);
    expect(p.associations[0]!.citations).toHaveLength(0);
    expect(p.birth.citations).toHaveLength(0);
    expect(p.events[0]!.citations).toHaveLength(0);
    const f = next.families.get('@F1@')!;
    expect(f.citations).toHaveLength(0);
    expect(f.marriage.citations).toHaveLength(0);
    expect(f.events[0]!.citations).toHaveLength(0);
    expect(findOrphanRefs(next)).toEqual([]);
  });

  it('lässt Zitate auf ANDERE Quellen unangetastet', () => {
    const next = deleteSourceCascade(
      db({
        persons: [makePerson('@P@', { topLevelCitations: [makeCitation('@S1@'), makeCitation('@S2@')] })],
        sources: [makeSource('@S1@'), makeSource('@S2@')],
      }),
      '@S1@',
    );
    const cits = next.individuals.get('@P@')!.topLevelCitations;
    expect(cits).toHaveLength(1);
    expect(cits[0]!.sourceId).toBe('@S2@');
  });
});

// --- deleteRepositoryCascade: Source.repo-Verweis lösen --------------------------------

describe('deleteRepositoryCascade', () => {
  it('löst source.repo auf die Quelle und entfernt das Archiv (0 Waisen)', () => {
    const next = deleteRepositoryCascade(
      db({
        sources: [makeSource('@S1@', { repo: '@R1@' }), makeSource('@S2@', { repo: '@R2@' })],
        repositories: [makeRepository('@R1@'), makeRepository('@R2@')],
      }),
      '@R1@',
    );
    expect(next.repositories.has('@R1@')).toBe(false);
    expect(next.sources.get('@S1@')!.repo).toBe('');
    expect(next.sources.get('@S2@')!.repo).toBe('@R2@');
    expect(findOrphanRefs(next)).toEqual([]);
  });
});
