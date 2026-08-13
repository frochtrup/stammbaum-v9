// tests/core/model/partner-eltern.test.ts — die Eltern des Partners als eigene Rollen
// (BL-358, ADR-v9-268 E1).
//
// Der Anlass ist die Quelle selbst: ein Trauregister-Eintrag nennt in aller Regel BEIDE
// Elternpaare. `spouseFather`/`spouseMother` sind die symmetrische Ergänzung zu
// `father`/`mother`, `spouseParentFamily` die FAMC des Partners — genau wie `parentFamily`
// die FAMC der Hauptperson ist.
//
// Der Fertig-Zustand der Backlog-Zeile wörtlich: „ein Test, der eine Vorlage mit beiden
// Elternpaaren anwendet und danach INV-P2/INV-P3 hält — in EINEM Undo-Schritt".
import { describe, expect, it } from 'vitest';
import {
  makeEntryTemplate,
  ENTRY_PERSON_ROLES,
  ENTRY_FAMILY_ROLES,
  type EntryTemplate,
} from '../../../core/model/entry-templates';
import { applyEntryTemplate, makeEntryDraft } from '../../../core/model/apply-entry-template';
import { makeDatabase, makePerson } from '../../../core/model';
import { findOrphanRefs, checkIndiFamConsistency } from '../../../core/model/integrity';
import { createUndoStack } from '../../../services/undo/undo-stack';

/** Eine Trauregister-Vorlage, wie sie ein Kirchenbuch hergibt: das Paar und beide Elternpaare. */
const TRAUUNG: EntryTemplate = makeEntryTemplate('t-trauung', {
  label: 'Trauung mit beiden Elternpaaren',
  slots: [
    { role: 'spouseFamily', field: 'date', event: 'MARR' },
    { role: 'main', field: 'given' },
    { role: 'main', field: 'surname' },
    { role: 'father', field: 'given' },
    { role: 'father', field: 'surname' },
    { role: 'mother', field: 'given' },
    { role: 'mother', field: 'surname' },
    { role: 'spouse', field: 'given' },
    { role: 'spouse', field: 'surname' },
    { role: 'spouseFather', field: 'given' },
    { role: 'spouseFather', field: 'surname' },
    { role: 'spouseMother', field: 'given' },
    { role: 'spouseMother', field: 'surname' },
  ],
});

const WERTE: Record<string, string> = {
  'spouseFamily.MARR.date': '4 MAY 1820',
  'main.given': 'Josef',
  'main.surname': 'Zurloh',
  'father.given': 'Bernhard',
  'father.surname': 'Zurloh',
  'mother.given': 'Katharina',
  'mother.surname': 'Wolters',
  'spouse.given': 'Anna',
  'spouse.surname': 'Decker',
  'spouseFather.given': 'Heinrich',
  'spouseFather.surname': 'Decker',
  'spouseMother.given': 'Maria',
  'spouseMother.surname': 'Kortmann',
};

function personMit(db: ReturnType<typeof makeDatabase>, given: string) {
  const treffer = [...db.individuals.values()].filter((p) => p.given === given);
  expect(treffer).toHaveLength(1);
  return treffer[0];
}

describe('Die Rollen selbst (ADR-v9-268 E1)', () => {
  it('kennt sechs Personen- und drei Familien-Rollen', () => {
    expect(ENTRY_PERSON_ROLES).toEqual(['main', 'father', 'mother', 'spouse', 'spouseFather', 'spouseMother']);
    expect(ENTRY_FAMILY_ROLES).toEqual(['parentFamily', 'spouseParentFamily', 'spouseFamily']);
  });
});

describe('Anwenden mit beiden Elternpaaren', () => {
  it('legt sechs Personen und drei Familien an; INV-P2/INV-P3 halten', () => {
    const res = applyEntryTemplate(makeDatabase(), TRAUUNG, makeEntryDraft({ values: WERTE }));

    expect(res.ambiguous).toEqual([]);
    expect(res.db.individuals.size).toBe(6);
    expect(res.db.families.size).toBe(3); // Eltern · Eltern des Partners · die Ehe
    expect(findOrphanRefs(res.db)).toEqual([]);
    expect(checkIndiFamConsistency(res.db)).toEqual([]);
  });

  it('hängt jeden an SEINE Familie — der Partner ist Kind seiner eigenen Eltern', () => {
    const res = applyEntryTemplate(makeDatabase(), TRAUUNG, makeEntryDraft({ values: WERTE }));
    const db = res.db;

    const josef = personMit(db, 'Josef');
    const anna = personMit(db, 'Anna');
    const bernhard = personMit(db, 'Bernhard');
    const heinrich = personMit(db, 'Heinrich');

    const elternMain = db.families.get(res.families.parentFamily!)!;
    const elternSpouse = db.families.get(res.families.spouseParentFamily!)!;
    const ehe = db.families.get(res.families.spouseFamily!)!;

    // Die beiden Elternfamilien sind VERSCHIEDEN und tragen je ihr eigenes Kind.
    expect(elternMain.id).not.toBe(elternSpouse.id);
    expect(elternMain.children).toEqual([josef.id]);
    expect(elternSpouse.children).toEqual([anna.id]);
    expect(elternMain.husband).toBe(bernhard.id);
    expect(elternSpouse.husband).toBe(heinrich.id);

    // Und die Ehe verbindet die beiden Kinder, nicht etwa die Eltern.
    expect([ehe.husband, ehe.wife].sort()).toEqual([josef.id, anna.id].sort());
    expect(ehe.marriage.date).toBe('4 MAY 1820');

    // Gegenrichtung (INV-P3): die Personen kennen ihre Familien. `childOf` trägt
    // `ChildLink`-Objekte (Verhältnis + Belege, [10 §2]), nicht bloße Ids.
    expect(josef.childOf.map((l) => l.familyId)).toContain(elternMain.id);
    expect(anna.childOf.map((l) => l.familyId)).toContain(elternSpouse.id);
  });

  it('EIN Undo-Schritt führt zum Ausgangszustand zurück', () => {
    const vorher = makeDatabase();
    vorher.individuals.set('@I1@', makePerson('@I1@', { given: 'Bestand', surname: 'Alt' }));
    const stack = createUndoStack();

    stack.push(vorher);
    const nachher = applyEntryTemplate(vorher, TRAUUNG, makeEntryDraft({ values: WERTE })).db;

    expect(nachher.individuals.size).toBe(7);
    expect(nachher.families.size).toBe(3);

    const zurueck = stack.undo(nachher);
    expect(zurueck).toBe(vorher);
    expect(stack.canUndo).toBe(false); // genau ein Schritt, nicht neun
    expect(zurueck!.individuals.size).toBe(1);
    expect(zurueck!.families.size).toBe(0);
  });

  it('ohne Partner-Eltern-Eingabe entsteht deren Familie gar nicht erst', () => {
    // Additiv: eine Vorlage, die die neuen Rollen nicht nutzt, verhält sich unverändert.
    const nurPaar = { ...WERTE };
    for (const k of Object.keys(nurPaar)) if (k.startsWith('spouseFather') || k.startsWith('spouseMother')) delete nurPaar[k];

    const res = applyEntryTemplate(makeDatabase(), TRAUUNG, makeEntryDraft({ values: nurPaar }));

    expect(res.db.individuals.size).toBe(4);
    expect(res.db.families.size).toBe(2);
    expect(res.families.spouseParentFamily).toBeUndefined();
  });

  it('verknüpft statt anzulegen, wenn der Partner schon im Bestand steht', () => {
    const db = makeDatabase();
    db.individuals.set('@I9@', makePerson('@I9@', { given: 'Anna', surname: 'Decker' }));

    const res = applyEntryTemplate(
      db,
      TRAUUNG,
      makeEntryDraft({ values: WERTE, persons: { spouse: '@I9@' } }),
    );

    // Anna ist EINMAL da — und hängt jetzt an ihrer neu angelegten Elternfamilie.
    expect([...res.db.individuals.values()].filter((p) => p.given === 'Anna')).toHaveLength(1);
    const elternSpouse = res.db.families.get(res.families.spouseParentFamily!)!;
    expect(elternSpouse.children).toEqual(['@I9@']);
  });
});

describe('Vorbelegt und änderbar — der dritte Modus (ADR-v9-268 E6)', () => {
  const mitStartwert = makeEntryTemplate('t-start', {
    label: 'Taufe Ochtrup',
    slots: [
      { role: 'main', field: 'given' },
      { role: 'main', field: 'surname' },
      // Ein Datum OHNE Vorbelegung: es ist die Eingabe, die das Ereignis überhaupt
      // entstehen lässt (eine Vorbelegung allein legt nichts an, [20 §2]).
      { role: 'main', field: 'date', event: 'CHR' },
      { role: 'main', field: 'place', event: 'CHR', prefill: 'Ochtrup', prefillMode: 'prefilled' },
      { role: 'main', field: 'value', event: 'CHR', prefill: 'fest', prefillMode: 'locked' },
    ],
  });
  const basis = {
    'main.given': 'Bernhard',
    'main.surname': 'Kortmann',
    'main.CHR.date': '1885',
  };

  it('unangetastet gilt der Startwert', () => {
    const res = applyEntryTemplate(makeDatabase(), mitStartwert, makeEntryDraft({ values: basis }));

    const taufe = personMit(res.db, 'Bernhard').chr;
    expect(taufe.place).toBe('Ochtrup');
  });

  it('geändert gewinnt die EINGABE — sonst wäre „änderbar" eine Anzeige-Lüge', () => {
    const res = applyEntryTemplate(
      makeDatabase(),
      mitStartwert,
      makeEntryDraft({ values: { ...basis, 'main.CHR.place': 'Metelen' } }),
    );

    const taufe = personMit(res.db, 'Bernhard').chr;
    expect(taufe.place).toBe('Metelen');
  });

  it('bei `locked` bleibt es umgekehrt: die Vorbelegung schlägt die Eingabe', () => {
    const res = applyEntryTemplate(
      makeDatabase(),
      mitStartwert,
      makeEntryDraft({ values: { ...basis, 'main.CHR.value': 'ignoriert' } }),
    );

    const taufe = personMit(res.db, 'Bernhard').chr;
    expect(taufe.value).toBe('fest');
  });

  it('ein Startwert allein legt NICHTS an (die Regel aus [20 §2] gilt für alle drei Modi)', () => {
    const res = applyEntryTemplate(makeDatabase(), mitStartwert, makeEntryDraft({ values: {} }));

    expect(res.db.individuals.size).toBe(0);
  });
});
