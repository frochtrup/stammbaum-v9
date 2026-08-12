// tests/core/model/apply-entry-template.test.ts — Anwenden einer Erfassungs-Vorlage
// (Spec 20 §2, ADR-v9-264 Entscheidungen 4/6, BL-232).
//
// Die drei Fragen, an denen die Entscheidung hängt:
//   (a) EIN Durchlauf, EIN Undo-Schritt — geprüft mit dem ECHTEN Undo-Stack
//       (services/undo, framework-frei), nicht mit einer nachgebauten Attrappe.
//   (b) INV-P2/INV-P3 gelten danach — geprüft über findOrphanRefs/checkIndiFamConsistency,
//       nicht über einen selbstgeschriebenen Konsistenz-Blick.
//   (c) Bei ≥2 Familien-Kandidaten wird NICHT geraten (ADR-v9-29-Leitlinie).
import { describe, expect, it } from 'vitest';
import {
  applyEntryTemplate,
  findFamilyFor,
  makeEntryDraft,
  type EntryTemplateDraft,
} from '../../../core/model/apply-entry-template';
import { makeEntryTemplate, type EntryTemplate } from '../../../core/model/entry-templates';
import { makeDatabase, makeFamily, makePerson, makeSource } from '../../../core/model/factory';
import { checkIndiFamConsistency, findOrphanRefs } from '../../../core/model/integrity';
import { editDatabase } from '../../../core/model/draft';
import type { Database, Person } from '../../../core/model/types';
import { createUndoStack } from '../../../services/undo';

// --- Vorlagen für die Tests: dieselbe Form, die auch der Builder erzeugt --------------

/** Trauregister-Eintrag: Ehepaar + Heiratsdatum/-ort. */
const HEIRAT: EntryTemplate = makeEntryTemplate('t-heirat', {
  label: 'Heirat',
  slots: [
    { role: 'spouseFamily', field: 'date', event: 'MARR' },
    { role: 'spouseFamily', field: 'place', event: 'MARR' },
    { role: 'main', field: 'surname' },
    { role: 'main', field: 'given' },
    { role: 'main', field: 'sex', prefill: 'M', prefillMode: 'hidden' },
    { role: 'spouse', field: 'surname' },
    { role: 'spouse', field: 'given' },
    { role: 'spouse', field: 'sex', prefill: 'F', prefillMode: 'hidden' },
  ],
});

/** Der volle Fall aus dem Fertig-Zustand von BL-232: Eltern- UND Ehefamilie. */
const VOLL: EntryTemplate = makeEntryTemplate('t-voll', {
  label: 'Taufe mit Eltern und Ehe',
  slots: [
    { role: 'main', field: 'given' },
    { role: 'main', field: 'surname' },
    { role: 'main', field: 'date', event: 'CHR' },
    { role: 'main', field: 'place', event: 'CHR', prefill: 'Ochtrup', prefillMode: 'locked' },
    { role: 'father', field: 'given' },
    { role: 'father', field: 'surname' },
    { role: 'father', field: 'sex', prefill: 'M', prefillMode: 'hidden' },
    { role: 'mother', field: 'given' },
    { role: 'mother', field: 'surname' },
    { role: 'mother', field: 'sex', prefill: 'F', prefillMode: 'hidden' },
    { role: 'spouse', field: 'given' },
    { role: 'spouse', field: 'surname' },
    { role: 'parentFamily', field: 'date', event: 'MARR' },
    { role: 'spouseFamily', field: 'date', event: 'MARR' },
  ],
});

const VOLL_WERTE: Record<string, string> = {
  'main.given': 'Anna',
  'main.surname': 'Decker',
  'main.CHR.date': '12 MAR 1801',
  'father.given': 'Bernd',
  'father.surname': 'Decker',
  'mother.given': 'Maria',
  'mother.surname': 'Wolters',
  'spouse.given': 'Josef',
  'spouse.surname': 'Zurloh',
  'parentFamily.MARR.date': '1799',
  'spouseFamily.MARR.date': '1822',
};

function draft(patch: Partial<EntryTemplateDraft> = {}): EntryTemplateDraft {
  return makeEntryDraft(patch);
}

function personen(db: Database): Person[] {
  return [...db.individuals.values()];
}
function personMit(db: Database, given: string): Person {
  const p = personen(db).find((x) => x.given === given);
  expect(p, `Person "${given}" fehlt`).toBeDefined();
  return p!;
}

// --- findFamilyFor ---------------------------------------------------------------------

describe('findFamilyFor — wiederverwenden statt neu anlegen (ADR-v9-264 E6)', () => {
  function bestand(): Database {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Bernd', sex: 'M', parentIn: ['@F1@'] }));
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Maria', sex: 'F' }));
    db.families.set('@F1@', makeFamily('@F1@', { husband: '@I1@', wife: null }));
    return db;
  }

  it('eine Familie mit NUR gesetztem Vater ist für "Vater+Mutter" verwendbar (mehr als v8 konnte)', () => {
    const kandidaten = findFamilyFor(bestand(), {
      husband: { kind: 'person', id: '@I1@' },
      wife: { kind: 'person', id: '@I2@' },
    });
    expect(kandidaten).toEqual(['@F1@']);
  });

  it('eine NEUE Person verdrängt keinen fremden Slot-Insassen', () => {
    const db = bestand();
    db.families.set('@F1@', makeFamily('@F1@', { husband: '@I1@', wife: '@I9@' }));
    const kandidaten = findFamilyFor(db, {
      husband: { kind: 'person', id: '@I1@' },
      wife: { kind: 'new' },
    });
    expect(kandidaten).toEqual([]);
  });

  it('ein nicht beanspruchter Slot schränkt nicht ein', () => {
    const db = bestand();
    db.families.set('@F1@', makeFamily('@F1@', { husband: '@I1@', wife: '@I9@' }));
    const kandidaten = findFamilyFor(db, {
      husband: { kind: 'person', id: '@I1@' },
      wife: { kind: 'none' },
    });
    expect(kandidaten).toEqual(['@F1@']);
  });

  it('ohne bekannten Elternteil gibt es keine Kandidaten (kein Treffer ins Blaue)', () => {
    const kandidaten = findFamilyFor(bestand(), { husband: { kind: 'new' }, wife: { kind: 'new' } });
    expect(kandidaten).toEqual([]);
  });

  it('mehrere passende Familien werden ALLE gemeldet — die Funktion wählt nicht aus', () => {
    const db = bestand();
    db.families.set('@F2@', makeFamily('@F2@', { husband: '@I1@' }));
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Bernd', sex: 'M', parentIn: ['@F1@', '@F2@'] }));
    const kandidaten = findFamilyFor(db, {
      husband: { kind: 'person', id: '@I1@' },
      wife: { kind: 'new' },
    });
    expect(kandidaten.length).toBe(2);
    expect(kandidaten.sort()).toEqual(['@F1@', '@F2@']);
  });

  function mitKind(): Database {
    const db = bestand();
    db.individuals.set(
      '@I3@',
      makePerson('@I3@', {
        given: 'Anna',
        childOf: [{ familyId: '@F1@', pedigree: '', fatherRel: '', motherRel: '', fatherRelSeen: false, motherRelSeen: false, citations: [] }],
      }),
    );
    db.families.get('@F1@')!.children.push('@I3@');
    return db;
  }

  it('das Kind ist der Anker: seine bestehende FAMC wird ergänzt statt gedoppelt', () => {
    // Annas Elternfamilie kennt den Vater, der Mutter-Slot ist frei; die Vorlage bringt
    // eine NEUE Mutter. Ohne diesen Anker bekäme Anna eine zweite FAMC.
    const kandidaten = findFamilyFor(
      mitKind(),
      { husband: { kind: 'none' }, wife: { kind: 'new' } },
      '@I3@',
    );
    expect(kandidaten).toEqual(['@F1@']);
  });

  it('verdrängt dabei niemanden: ein besetzter Slot schließt die Familie aus', () => {
    // Die Vorlage brächte einen NEUEN Vater, F1 hat aber schon einen. Lieber eine zweite
    // Familie (die der Nutzer zusammenführen kann) als ein stiller Elternteil-Tausch.
    const kandidaten = findFamilyFor(
      mitKind(),
      { husband: { kind: 'new' }, wife: { kind: 'new' } },
      '@I3@',
    );
    expect(kandidaten).toEqual([]);
  });
});

// --- applyEntryTemplate ----------------------------------------------------------------

describe('applyEntryTemplate — EIN Durchlauf, EIN Undo-Schritt (ADR-v9-264 E4)', () => {
  it('legt Ehepaar und Ehefamilie an; INV-P2/INV-P3 gelten danach', () => {
    const res = applyEntryTemplate(makeDatabase(), HEIRAT, draft({
      values: {
        'spouseFamily.MARR.date': '4 MAY 1820',
        'spouseFamily.MARR.place': 'Ochtrup',
        'main.given': 'Josef',
        'main.surname': 'Zurloh',
        'spouse.given': 'Anna',
        'spouse.surname': 'Decker',
      },
    }));

    expect(res.ambiguous).toEqual([]);
    expect(res.db.individuals.size).toBe(2);
    expect(res.db.families.size).toBe(1);
    expect(findOrphanRefs(res.db)).toEqual([]);
    expect(checkIndiFamConsistency(res.db)).toEqual([]);

    const fam = [...res.db.families.values()][0];
    expect(fam.marriage.date).toBe('4 MAY 1820');
    expect(fam.marriage.place).toBe('Ochtrup');
    // `sex`-Vorbelegung (hidden) besetzt die Eltern-Slots.
    expect(res.db.individuals.get(fam.husband!)!.given).toBe('Josef');
    expect(res.db.individuals.get(fam.wife!)!.given).toBe('Anna');
  });

  it('Eltern- UND Ehefamilie: EIN Undo-Schritt führt zum Ausgangszustand zurück', () => {
    // Der Fertig-Zustand aus BL-232, wörtlich. Der Undo-Stack ist der echte
    // (services/undo) — die Schale legt vor dem Kommando ab und setzt danach.
    const vorher = makeDatabase();
    vorher.individuals.set('@I1@', makePerson('@I1@', { given: 'Bestand', surname: 'Alt' }));
    const stack = createUndoStack();

    stack.push(vorher);
    const res = applyEntryTemplate(vorher, VOLL, draft({ values: VOLL_WERTE }));
    const nachher = res.db;

    // Angelegt: main + Vater + Mutter + Ehepartner (4) neben der Bestandsperson.
    expect(nachher.individuals.size).toBe(5);
    expect(nachher.families.size).toBe(2); // Eltern- und Ehefamilie
    expect(findOrphanRefs(nachher)).toEqual([]);
    expect(checkIndiFamConsistency(nachher)).toEqual([]);

    const zurueck = stack.undo(nachher);
    expect(zurueck).toBe(vorher);
    expect(stack.canUndo).toBe(false); // GENAU ein Schritt, nicht sechs
    expect(zurueck!.individuals.size).toBe(1);
    expect(zurueck!.families.size).toBe(0);
  });

  it('lässt den Vorzustand unangetastet (Copy-on-Write, ADR-v9-92)', () => {
    const vorher = makeDatabase();
    vorher.individuals.set('@I1@', makePerson('@I1@', { given: 'Bestand' }));
    const kopie = JSON.stringify([...vorher.individuals.values()]);

    applyEntryTemplate(vorher, VOLL, draft({ values: VOLL_WERTE }));

    expect(vorher.individuals.size).toBe(1);
    expect(JSON.stringify([...vorher.individuals.values()])).toBe(kopie);
  });

  it('verdrahtet die Rollen richtig: main ist Kind der Eltern- und Partner der Ehefamilie', () => {
    const res = applyEntryTemplate(makeDatabase(), VOLL, draft({ values: VOLL_WERTE }));
    const anna = personMit(res.db, 'Anna');
    const bernd = personMit(res.db, 'Bernd');
    const maria = personMit(res.db, 'Maria');
    const josef = personMit(res.db, 'Josef');

    expect(res.persons.main).toBe(anna.id);
    const eltern = res.db.families.get(res.families.parentFamily!)!;
    expect(eltern.husband).toBe(bernd.id);
    expect(eltern.wife).toBe(maria.id);
    expect(eltern.children).toEqual([anna.id]);
    expect(anna.childOf.map((l) => l.familyId)).toEqual([eltern.id]);
    expect(eltern.marriage.date).toBe('1799');

    const ehe = res.db.families.get(res.families.spouseFamily!)!;
    expect([ehe.husband, ehe.wife].sort()).toEqual([anna.id, josef.id].sort());
    expect(anna.parentIn).toEqual([ehe.id]);
    expect(ehe.marriage.date).toBe('1822');
  });

  it('Vorbelegungen fließen ein — versteckt wie gesperrt', () => {
    const res = applyEntryTemplate(makeDatabase(), VOLL, draft({ values: VOLL_WERTE }));
    // `locked`: Ort steht im Feld und wird übernommen.
    expect(personMit(res.db, 'Anna').chr.place).toBe('Ochtrup');
    // `hidden`: das Geschlecht hat gar kein Feld und wird trotzdem gesetzt.
    expect(personMit(res.db, 'Bernd').sex).toBe('M');
    expect(personMit(res.db, 'Maria').sex).toBe('F');
  });

  it('zieht `name` nach, wenn given/surname gesetzt werden (ADR-v9-112-Geschwisterstelle)', () => {
    const res = applyEntryTemplate(makeDatabase(), VOLL, draft({ values: VOLL_WERTE }));
    expect(personMit(res.db, 'Anna').name).toBe('Anna /Decker/');
  });

  it('legt für eine leere Rolle KEINEN Datensatz an (keine unsichtbaren Leichen)', () => {
    const nurMain = { 'main.given': 'Anna', 'main.surname': 'Decker' };
    const res = applyEntryTemplate(makeDatabase(), VOLL, draft({ values: nurMain }));
    expect(res.db.individuals.size).toBe(1);
    expect(res.db.families.size).toBe(0);
    expect(res.families.parentFamily).toBeUndefined();
  });

  it('ein leerer Entwurf ändert nichts', () => {
    const res = applyEntryTemplate(makeDatabase(), VOLL, draft());
    expect(res.db.individuals.size).toBe(0);
    expect(res.db.families.size).toBe(0);
    expect(res.persons).toEqual({});
  });
});

describe('Verknüpfte Bestandsperson: verknüpfen statt anlegen, ergänzen statt überschreiben', () => {
  function mitBernd(): Database {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Bernhard', surname: 'Decker', sex: 'M' }));
    return db;
  }

  it('eine per Dubletten-Treffer verknüpfte Rolle legt keine zweite Person an', () => {
    const res = applyEntryTemplate(mitBernd(), VOLL, draft({
      values: VOLL_WERTE,
      persons: { father: '@I1@' },
    }));
    expect(res.persons.father).toBe('@I1@');
    expect(personen(res.db).filter((p) => p.surname === 'Decker' && p.sex === 'M').length).toBe(1);
    // Der bestehende Vorname bleibt stehen — die Vorlage ergänzt, sie überschreibt nicht.
    expect(res.db.individuals.get('@I1@')!.given).toBe('Bernhard');
    expect(findOrphanRefs(res.db)).toEqual([]);
    expect(checkIndiFamConsistency(res.db)).toEqual([]);
  });

  it('leere Felder der Bestandsperson werden gefüllt (fill-if-empty)', () => {
    const db = mitBernd();
    db.individuals.set('@I1@', makePerson('@I1@', { given: '', surname: '', sex: 'U' }));
    const res = applyEntryTemplate(db, VOLL, draft({ values: VOLL_WERTE, persons: { father: '@I1@' } }));
    const bernd = res.db.individuals.get('@I1@')!;
    expect(bernd.given).toBe('Bernd');
    expect(bernd.surname).toBe('Decker');
    expect(bernd.sex).toBe('M');
  });
});

describe('Bei ≥2 Kandidaten wird nicht geraten (ADR-v9-264 E6, ADR-v9-29-Leitlinie)', () => {
  function zweiFamilien(): Database {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Bernd', sex: 'M', parentIn: ['@F1@', '@F2@'] }));
    db.families.set('@F1@', makeFamily('@F1@', { husband: '@I1@' }));
    db.families.set('@F2@', makeFamily('@F2@', { husband: '@I1@' }));
    return db;
  }

  it('meldet die Mehrdeutigkeit und schreibt NICHTS', () => {
    const vor = zweiFamilien();
    const res = applyEntryTemplate(vor, VOLL, draft({ values: VOLL_WERTE, persons: { father: '@I1@' } }));

    expect(res.ambiguous.length).toBe(1);
    expect(res.ambiguous[0].role).toBe('parentFamily');
    expect(res.ambiguous[0].candidates.sort()).toEqual(['@F1@', '@F2@']);
    // Kein halb geschriebener Zustand: weder Personen noch Familien sind dazugekommen.
    expect(res.db.individuals.size).toBe(1);
    expect(res.db.families.size).toBe(2);
    expect(res.persons).toEqual({});
  });

  it('mit entschiedener Familie im Entwurf läuft derselbe Aufruf durch', () => {
    const res = applyEntryTemplate(zweiFamilien(), VOLL, draft({
      values: VOLL_WERTE,
      persons: { father: '@I1@' },
      families: { parentFamily: '@F2@' },
    }));
    expect(res.ambiguous).toEqual([]);
    expect(res.families.parentFamily).toBe('@F2@');
    expect(res.db.families.get('@F2@')!.children.length).toBe(1);
    expect(res.db.families.get('@F1@')!.children).toEqual([]);
    expect(checkIndiFamConsistency(res.db)).toEqual([]);
  });
});

describe('Quellen-Vorbelegung am Ereignis (ADR-v9-264 E7)', () => {
  const mitQuelle: EntryTemplate = makeEntryTemplate('t-quelle', {
    label: 'Taufe mit Quelle',
    slots: [
      { role: 'main', field: 'given' },
      { role: 'main', field: 'date', event: 'CHR' },
    ],
    source: {
      sourceId: '@S1@',
      abbr: 'KB Taufen',
      title: '',
      quay: 3,
      pagePattern: '',
      urlPattern: '',
    },
  });
  const werte = { 'main.given': 'Anna', 'main.CHR.date': '1801' };

  function mitBestand(abbr: string): Database {
    const db = makeDatabase();
    db.sources.set('@S1@', makeSource('@S1@', { abbr }));
    return db;
  }

  it('passt der Fingerabdruck, hängt die Zitation am berührten Ereignis', () => {
    const res = applyEntryTemplate(mitBestand('KB Taufen'), mitQuelle, draft({ values: werte, page: 'S. 17' }));
    const cits = personMit(res.db, 'Anna').chr.citations;
    expect(cits.length).toBe(1);
    expect(cits[0].sourceId).toBe('@S1@');
    expect(cits[0].page).toBe('S. 17');
    expect(cits[0].quay).toBe(3);
    expect(findOrphanRefs(res.db)).toEqual([]);
  });

  it('jedes berührte Ereignis bekommt eine EIGENE Zitation, kein geteiltes Objekt', () => {
    // Ein geteiltes Zitat-Objekt teilte auch sein `media`-Array — ein Edit an einer
    // Fundstelle schlüge auf die andere durch (Aliasing, gegen das draft.ts klont).
    const zwei = makeEntryTemplate('t-zwei', {
      label: 'Sterbefall mit Quelle',
      slots: [
        { role: 'main', field: 'given' },
        { role: 'main', field: 'date', event: 'DEAT' },
        { role: 'main', field: 'date', event: 'BURI' },
      ],
      source: { sourceId: '@S1@', abbr: 'KB Taufen', title: '', quay: null, pagePattern: '', urlPattern: '' },
    });
    const res = applyEntryTemplate(mitBestand('KB Taufen'), zwei, draft({
      values: { 'main.given': 'Anna', 'main.DEAT.date': '1870', 'main.BURI.date': '1870' },
    }));
    const anna = personMit(res.db, 'Anna');
    expect(anna.death.citations).toHaveLength(1);
    expect(anna.buri.citations).toHaveLength(1);
    expect(anna.death.citations[0]).not.toBe(anna.buri.citations[0]);
    expect(anna.death.citations[0].media).not.toBe(anna.buri.citations[0].media);
  });

  it('passt er nicht, bleibt sie wirkungslos — die Vorlage funktioniert weiter', () => {
    const res = applyEntryTemplate(mitBestand('Ganz andere Quelle'), mitQuelle, draft({ values: werte }));
    expect(personMit(res.db, 'Anna').chr.citations).toEqual([]);
    expect(personMit(res.db, 'Anna').chr.date).toBe('1801');
    // Wirkungslos heißt: keine verwaiste Referenz (INV-P2).
    expect(findOrphanRefs(res.db)).toEqual([]);
  });
});

describe('Das Kommando ist eine reine Funktion über dem Modell (INV-ARCH-1/2)', () => {
  it('derselbe Entwurf liefert zweimal dasselbe Ergebnis (kein Zufall, keine Uhr, TST-3)', () => {
    const a = applyEntryTemplate(makeDatabase(), VOLL, draft({ values: VOLL_WERTE }));
    const b = applyEntryTemplate(makeDatabase(), VOLL, draft({ values: VOLL_WERTE }));
    expect(JSON.stringify([...a.db.individuals.values()])).toBe(
      JSON.stringify([...b.db.individuals.values()]),
    );
    expect(a.families).toEqual(b.families);
  });

  it('läuft auf einem Vorzustand, der als `ReadonlyDatabase` gehalten wird', () => {
    // Die Signatur nimmt den eingefrorenen Stand entgegen (wie saveFamily) — dieser Test
    // hält fest, dass ein aus editDatabase kommender Stand direkt weitergereicht wird.
    const eingefroren = editDatabase(makeDatabase(), () => {});
    const res = applyEntryTemplate(eingefroren, HEIRAT, draft({ values: { 'main.given': 'Josef' } }));
    expect(res.db.individuals.size).toBe(1);
  });
});
