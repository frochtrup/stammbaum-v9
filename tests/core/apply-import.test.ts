// tests/core/apply-import.test.ts — BL-106: Anwenden der Import-Auswahl (Spec 20 §1.12).
//
// Der Vergleich (BL-63) rechnet, dieses Kommando schreibt. Getrennt gehalten, damit „was
// unterscheidet sich" und „was übernehme ich" je für sich prüfbar bleiben.
//
// Wie `mergePersons` läuft alles über `editDatabase` (Copy-on-Write, ADR-v9-92) und die
// synchron haltenden Kommandos aus `integrity.ts` (INV-P3) — der Wächter ist auch hier
// `findOrphanRefs`, nicht eine von Hand gepflegte Aufzählung.
import { describe, it, expect } from 'vitest';
import { makeDatabase, makePerson, makeFamily, makeEvent, makeCitation, makeSource, makeRepository } from '../../core/model/factory';
import { findOrphanRefs, checkIndiFamConsistency } from '../../core/model/integrity';
import { applyImportPatch, compareImport, type ImportSelections, type PersonGraph } from '../../core/dedup';
import type { Database, Family, Person, PersonId } from '../../core/model/types';

function db(persons: Person[], families: Family[] = []): Database {
  const base = makeDatabase();
  for (const p of persons) base.individuals.set(p.id, p);
  for (const f of families) base.families.set(f.id, f);
  return base;
}

function graph(persons: Person[], families: Family[] = []): PersonGraph {
  return {
    individuals: new Map(persons.map((p) => [p.id, p])),
    families: new Map(families.map((f) => [f.id, f])),
  };
}

const QUELLE = { title: 'Import: ergaenzung.ged', date: '19 JUL 2026', note: '' };

/** Kürzel: Auswahl für genau eine Import-Person. */
function wahl(importId: PersonId, felder: Record<string, 'take' | 'both' | 'ignore'>): ImportSelections {
  return { fields: { [importId]: felder }, importNew: [] };
}

function link(familyId: string) {
  return {
    familyId,
    pedigree: '' as const,
    fatherRel: '',
    motherRel: '',
    fatherRelSeen: false,
    motherRelSeen: false,
    citations: [],
  };
}

// --- Feld-Übernahme ---------------------------------------------------------------

describe('applyImportPatch — Felder', () => {
  const basis = () => db([makePerson('@B1@', { given: 'Anna', surname: 'Decker' })]);
  const fremd = () => graph([makePerson('@N1@', { given: 'Anna', surname: 'Decker', title: 'Hebamme' })]);
  const zuordnung = [{ importId: '@N1@', baseId: '@B1@', score: 100, reasons: [], status: 'matched' as const }];

  it('übernimmt ein Feld mit „take"', () => {
    const r = applyImportPatch(basis(), fremd(), zuordnung, wahl('@N1@', { title: 'take' }), QUELLE);
    expect(r.db.individuals.get('@B1@')!.title).toBe('Hebamme');
    expect(r.changedPersons).toBe(1);
  });

  it('lässt „ignore"-Felder unangetastet — das ist auch die Voreinstellung', () => {
    const r = applyImportPatch(basis(), fremd(), zuordnung, wahl('@N1@', { title: 'ignore' }), QUELLE);
    expect(r.db.individuals.get('@B1@')!.title).toBe('');
    const ohneWahl = applyImportPatch(basis(), fremd(), zuordnung, { fields: {}, importNew: [] }, QUELLE);
    expect(ohneWahl.db.individuals.get('@B1@')!.title).toBe('');
    expect(ohneWahl.changedPersons).toBe(0);
  });

  it('„both" behält den Bestandswert und hängt den Import-Wert als Notiz an', () => {
    // Spec 20 §1.12: „bei Konflikten zusätzlich A+B (beide behalten, Import-Wert als Notiz)".
    const mitWert = db([makePerson('@B1@', { given: 'Anna', surname: 'Decker', title: 'Bäuerin' })]);
    const r = applyImportPatch(mitWert, fremd(), zuordnung, wahl('@N1@', { title: 'both' }), QUELLE);
    const p = r.db.individuals.get('@B1@')!;
    expect(p.title).toBe('Bäuerin');
    expect(p.noteText).toContain('Hebamme');
    expect(p.noteText).toContain('Titel');
  });

  it('übernimmt Ereignis-Unterfelder', () => {
    const b = db([makePerson('@B1@', { given: 'Anna', surname: 'Decker' })]);
    const f = graph([
      makePerson('@N1@', { given: 'Anna', surname: 'Decker', birth: makeEvent('BIRT', { date: '1850', place: 'Ochtrup' }) }),
    ]);
    const r = applyImportPatch(b, f, zuordnung, wahl('@N1@', { 'birth.date': 'take', 'birth.place': 'take' }), QUELLE);
    expect(r.db.individuals.get('@B1@')!.birth.date).toBe('1850');
    expect(r.db.individuals.get('@B1@')!.birth.place).toBe('Ochtrup');
  });

  it('übernimmt ein freies Ereignis als KOPIE, nicht als geteilte Referenz', () => {
    const ereignis = makeEvent('OCCU', { value: 'Schmied', date: '1880' });
    const f = graph([makePerson('@N1@', { given: 'Anna', surname: 'Decker', events: [ereignis] })]);
    const r = applyImportPatch(basis(), f, zuordnung, wahl('@N1@', { 'event|OCCU|1880': 'take' }), QUELLE);
    const uebernommen = r.db.individuals.get('@B1@')!.events;
    expect(uebernommen).toHaveLength(1);
    expect(uebernommen[0].value).toBe('Schmied');
    // Sonst änderte ein späterer Edit am Bestand still die Fremddatei mit.
    expect(uebernommen[0]).not.toBe(ereignis);
  });
});

// --- Import-Quelle ----------------------------------------------------------------

describe('applyImportPatch — Import-Quelle als Beleg', () => {
  const zuordnung = [{ importId: '@N1@', baseId: '@B1@', score: 100, reasons: [], status: 'matched' as const }];

  it('legt EINE Quelle an und belegt übernommene Werte mit ihr', () => {
    const b = db([makePerson('@B1@', { given: 'Anna', surname: 'Decker' })]);
    const f = graph([
      makePerson('@N1@', { given: 'Anna', surname: 'Decker', birth: makeEvent('BIRT', { date: '1850' }) }),
    ]);
    const r = applyImportPatch(b, f, zuordnung, wahl('@N1@', { 'birth.date': 'take' }), QUELLE);

    expect(r.sourceId).toBeTruthy();
    expect(r.db.sources.size).toBe(1);
    expect(r.db.sources.get(r.sourceId!)!.title).toBe('Import: ergaenzung.ged');
    expect(r.db.individuals.get('@B1@')!.birth.citations.some((c) => c.sourceId === r.sourceId)).toBe(true);
  });

  it('legt KEINE Quelle an, wenn nichts übernommen wurde — keine Karteileiche', () => {
    const r = applyImportPatch(
      db([makePerson('@B1@')]),
      graph([makePerson('@N1@', { title: 'X' })]),
      zuordnung,
      wahl('@N1@', { title: 'ignore' }),
      QUELLE,
    );
    expect(r.sourceId).toBeNull();
    expect(r.db.sources.size).toBe(0);
  });

  it('ohne Quellen-Konfiguration wird nichts belegt, aber trotzdem übernommen', () => {
    const r = applyImportPatch(
      db([makePerson('@B1@')]),
      graph([makePerson('@N1@', { title: 'Hebamme' })]),
      zuordnung,
      wahl('@N1@', { title: 'take' }),
      null,
    );
    expect(r.db.individuals.get('@B1@')!.title).toBe('Hebamme');
    expect(r.sourceId).toBeNull();
  });
});

// --- Neue Personen ----------------------------------------------------------------

describe('applyImportPatch — neue Personen', () => {
  it('importiert eine neue Person unter einer FRISCHEN id, ohne bestehende zu überschreiben', () => {
    // Die Fremddatei nutzt dieselbe id wie eine bestehende Person — ein direkter
    // Übernahmeversuch überschriebe sie.
    const b = db([makePerson('@I1@', { given: 'Anna', surname: 'Decker' })]);
    const f = graph([makePerson('@I1@', { given: 'Wilhelm', surname: 'Kortmann' })]);
    const r = applyImportPatch(b, f, [{ importId: '@I1@', baseId: null, score: 0, reasons: [], status: 'new' }], { fields: {}, importNew: ['@I1@'] }, QUELLE);

    expect(r.db.individuals.size).toBe(2);
    expect(r.db.individuals.get('@I1@')!.given).toBe('Anna');
    expect([...r.db.individuals.values()].some((p) => p.given === 'Wilhelm')).toBe(true);
    expect(r.importedPersons).toBe(1);
    expect(findOrphanRefs(r.db)).toEqual([]);
  });

  it('importiert nur, was in `importNew` steht — „neu" allein genügt nicht', () => {
    const f = graph([makePerson('@N1@', { given: 'Wilhelm' }), makePerson('@N2@', { given: 'Otto' })]);
    const zuordnung = [
      { importId: '@N1@', baseId: null, score: 0, reasons: [], status: 'new' as const },
      { importId: '@N2@', baseId: null, score: 0, reasons: [], status: 'new' as const },
    ];
    const r = applyImportPatch(db([]), f, zuordnung, { fields: {}, importNew: ['@N1@'] }, QUELLE);
    expect(r.db.individuals.size).toBe(1);
    expect([...r.db.individuals.values()][0].given).toBe('Wilhelm');
  });

  it('rekonstruiert die Familienbindung, wenn BEIDE Personen im selben Abgleich ankommen', () => {
    // Spec 20 §1.12: „Familienbindungen automatisch rekonstruiert, wenn die verknüpften
    // Personen im selben Abgleich vorkommen."
    const fremdFam = makeFamily('@F9@', { husband: '@N1@', children: ['@N2@'] });
    const f = graph(
      [
        makePerson('@N1@', { given: 'Josef', surname: 'Kortmann', parentIn: ['@F9@'] }),
        makePerson('@N2@', { given: 'Wilhelm', surname: 'Kortmann', childOf: [link('@F9@')] }),
      ],
      [fremdFam],
    );
    const zuordnung = [
      { importId: '@N1@', baseId: null, score: 0, reasons: [], status: 'new' as const },
      { importId: '@N2@', baseId: null, score: 0, reasons: [], status: 'new' as const },
    ];
    const r = applyImportPatch(db([]), f, zuordnung, { fields: {}, importNew: ['@N1@', '@N2@'] }, QUELLE);

    expect(r.db.families.size).toBe(1);
    const [fam] = [...r.db.families.values()];
    const vater = [...r.db.individuals.values()].find((p) => p.given === 'Josef')!;
    const sohn = [...r.db.individuals.values()].find((p) => p.given === 'Wilhelm')!;
    expect(fam.husband).toBe(vater.id);
    expect(fam.children).toContain(sohn.id);
    expect(sohn.childOf.map((l) => l.familyId)).toEqual([fam.id]);
    expect(findOrphanRefs(r.db)).toEqual([]);
    expect(checkIndiFamConsistency(r.db)).toEqual([]);
  });

  it('lässt eine Bindung weg, deren Gegenstück NICHT mitkommt — statt eine Waise zu erzeugen', () => {
    const fremdFam = makeFamily('@F9@', { husband: '@N1@', children: ['@N2@'] });
    const f = graph(
      [
        makePerson('@N1@', { given: 'Josef', surname: 'Kortmann', parentIn: ['@F9@'] }),
        makePerson('@N2@', { given: 'Wilhelm', surname: 'Kortmann', childOf: [link('@F9@')] }),
      ],
      [fremdFam],
    );
    const zuordnung = [
      { importId: '@N1@', baseId: null, score: 0, reasons: [], status: 'new' as const },
      { importId: '@N2@', baseId: null, score: 0, reasons: [], status: 'new' as const },
    ];
    // Nur der Vater kommt mit.
    const r = applyImportPatch(db([]), f, zuordnung, { fields: {}, importNew: ['@N1@'] }, QUELLE);

    expect(r.db.individuals.size).toBe(1);
    // DIE eigentliche Zusicherung: gar keine Familie. Ein früherer Anlauf prüfte nur
    // findOrphanRefs/checkIndiFamConsistency — eine Familie mit einem einzigen Mitglied
    // ist aber waisenfrei UND konsistent, der Test wäre also grün geblieben, wenn die
    // Regel „mindestens zwei Beteiligte" gefehlt hätte (im Gegentest belegt).
    expect(r.db.families.size).toBe(0);
    expect(findOrphanRefs(r.db)).toEqual([]);
    expect(checkIndiFamConsistency(r.db)).toEqual([]);
  });

  it('verknüpft eine neue Person auch mit einer BEREITS zugeordneten Bestandsperson', () => {
    // Der häufige Fall: das Kind ist neu, der Vater steht längst im Bestand.
    const fremdFam = makeFamily('@F9@', { husband: '@NV@', children: ['@NK@'] });
    const b = db([makePerson('@B1@', { given: 'Josef', surname: 'Kortmann' })]);
    const f = graph(
      [
        makePerson('@NV@', { given: 'Josef', surname: 'Kortmann', parentIn: ['@F9@'] }),
        makePerson('@NK@', { given: 'Wilhelm', surname: 'Kortmann', childOf: [link('@F9@')] }),
      ],
      [fremdFam],
    );
    const zuordnung = [
      { importId: '@NV@', baseId: '@B1@', score: 100, reasons: [], status: 'matched' as const },
      { importId: '@NK@', baseId: null, score: 0, reasons: [], status: 'new' as const },
    ];
    const r = applyImportPatch(b, f, zuordnung, { fields: {}, importNew: ['@NK@'] }, QUELLE);

    const [fam] = [...r.db.families.values()];
    expect(fam.husband).toBe('@B1@');
    expect(r.db.individuals.get('@B1@')!.parentIn).toContain(fam.id);
    expect(findOrphanRefs(r.db)).toEqual([]);
    expect(checkIndiFamConsistency(r.db)).toEqual([]);
  });
});

// --- Copy-on-Write und Robustheit -------------------------------------------------

describe('applyImportPatch — Copy-on-Write und Randfälle', () => {
  it('lässt den Vorzustand unangetastet (Undo-Tauglichkeit, ADR-v9-92)', () => {
    const vorher = db([makePerson('@B1@', { given: 'Anna', surname: 'Decker' })]);
    const f = graph([makePerson('@N1@', { given: 'Anna', surname: 'Decker', title: 'Hebamme' })]);
    applyImportPatch(vorher, f, [{ importId: '@N1@', baseId: '@B1@', score: 100, reasons: [], status: 'matched' }], wahl('@N1@', { title: 'take' }), QUELLE);
    expect(vorher.individuals.get('@B1@')!.title).toBe('');
    expect(vorher.sources.size).toBe(0);
  });

  it('lässt unbeteiligte Personen referenzgleich', () => {
    const fremder = makePerson('@X@', { given: 'Egal' });
    const vorher = db([makePerson('@B1@'), fremder]);
    const r = applyImportPatch(
      vorher,
      graph([makePerson('@N1@', { title: 'Hebamme' })]),
      [{ importId: '@N1@', baseId: '@B1@', score: 100, reasons: [], status: 'matched' }],
      wahl('@N1@', { title: 'take' }),
      QUELLE,
    );
    expect(r.db.individuals.get('@X@')).toBe(fremder);
  });

  it('ist ein No-Op ohne jede Auswahl', () => {
    const vorher = db([makePerson('@B1@')]);
    const r = applyImportPatch(vorher, graph([makePerson('@N1@')]), [], { fields: {}, importNew: [] }, QUELLE);
    expect(r.changedPersons).toBe(0);
    expect(r.importedPersons).toBe(0);
    expect(r.db.individuals.get('@B1@')).toBe(vorher.individuals.get('@B1@'));
  });

  it('überspringt eine Auswahl, deren Zuordnung fehlt, statt zu werfen', () => {
    const r = applyImportPatch(
      db([makePerson('@B1@')]),
      graph([makePerson('@N1@', { title: 'X' })]),
      [],
      wahl('@N1@', { title: 'take' }),
      QUELLE,
    );
    expect(r.changedPersons).toBe(0);
  });

  it('arbeitet für den gesamten Abgleich mit EINER Import-Quelle', () => {
    const b = db([makePerson('@B1@'), makePerson('@B2@')]);
    const f = graph([makePerson('@N1@', { title: 'A' }), makePerson('@N2@', { title: 'B' })]);
    const zuordnung = [
      { importId: '@N1@', baseId: '@B1@', score: 100, reasons: [], status: 'matched' as const },
      { importId: '@N2@', baseId: '@B2@', score: 100, reasons: [], status: 'matched' as const },
    ];
    const r = applyImportPatch(
      b,
      f,
      zuordnung,
      { fields: { '@N1@': { title: 'take' }, '@N2@': { title: 'take' } }, importNew: [] },
      QUELLE,
    );
    expect(r.db.sources.size).toBe(1);
    expect(r.changedPersons).toBe(2);
  });

  it('bleibt gegenüber compareImport anschlussfähig — die Zuordnung kommt von dort', () => {
    const b = db([makePerson('@B1@', { given: 'Anna', surname: 'Decker', birth: makeEvent('BIRT', { date: '1850' }) })]);
    const f = graph([
      makePerson('@N1@', { given: 'Anna', surname: 'Decker', birth: makeEvent('BIRT', { date: '1850' }), title: 'Hebamme' }),
    ]);
    const zuordnung = compareImport({ individuals: b.individuals, families: b.families }, f);
    const r = applyImportPatch(b, f, zuordnung, wahl('@N1@', { title: 'take' }), QUELLE);
    expect(r.db.individuals.get('@B1@')!.title).toBe('Hebamme');
  });
});

// --- Zitate aus der Fremddatei ----------------------------------------------------

describe('applyImportPatch — mitgebrachte Zitate', () => {
  // AM ECHTEN MATERIAL GEFUNDEN, nicht im Entwurf: der erste Lauf gegen 2.795/2.811
  // Personen hinterließ 6 verwaiste `indi.citation.sourceId` (INV-P2). Eine importierte
  // Person bringt Zitate mit, die auf Quellen-Ids der FREMDDATEI zeigen — im Zielbestand
  // gibt es sie nicht, und ein Export schriebe `SOUR` auf ein leeres Ziel.
  const mitZitat = (id: string) =>
    makePerson(id, { given: 'Wilhelm', surname: 'Kortmann', topLevelCitations: [makeCitation('@FREMD1@', { page: '17' })] });

  it('zieht die belegende Quelle mit, statt das Zitat zu verwerfen', () => {
    const fremd: PersonGraph & { sources: Map<string, ReturnType<typeof makeSource>> } = {
      ...graph([mitZitat('@N1@')]),
      sources: new Map([['@FREMD1@', makeSource('@FREMD1@', { title: 'Kirchenbuch Ochtrup' })]]),
    };
    const r = applyImportPatch(db([]), fremd, [{ importId: '@N1@', baseId: null, score: 0, reasons: [], status: 'new' }], { fields: {}, importNew: ['@N1@'] }, QUELLE);

    expect(r.carriedSources).toBe(1);
    expect(r.droppedCitations).toBe(0);
    expect([...r.db.sources.values()].some((q) => q.title === 'Kirchenbuch Ochtrup')).toBe(true);
    // Und vor allem: keine hängende Referenz mehr.
    expect(findOrphanRefs(r.db)).toEqual([]);
  });

  it('zieht dieselbe Quelle nur EINMAL herüber, auch bei mehreren Zitaten', () => {
    const fremd = {
      ...graph([mitZitat('@N1@'), mitZitat('@N2@')]),
      sources: new Map([['@FREMD1@', makeSource('@FREMD1@', { title: 'Kirchenbuch Ochtrup' })]]),
    };
    const zuordnung = [
      { importId: '@N1@', baseId: null, score: 0, reasons: [], status: 'new' as const },
      { importId: '@N2@', baseId: null, score: 0, reasons: [], status: 'new' as const },
    ];
    const r = applyImportPatch(db([]), fremd, zuordnung, { fields: {}, importNew: ['@N1@', '@N2@'] }, QUELLE);
    expect(r.carriedSources).toBe(1);
    expect(findOrphanRefs(r.db)).toEqual([]);
  });

  it('verwirft ein Zitat, dessen Quelle die Fremddatei selbst nicht kennt — und meldet es', () => {
    // Dann gibt es nichts, worauf es zeigen könnte. Stillschweigend behalten wäre eine
    // kaputte Datei, stillschweigend verwerfen ein unbemerkter Verlust — daher die Zahl.
    const r = applyImportPatch(
      db([]),
      graph([mitZitat('@N1@')]),
      [{ importId: '@N1@', baseId: null, score: 0, reasons: [], status: 'new' }],
      { fields: {}, importNew: ['@N1@'] },
      QUELLE,
    );
    expect(r.droppedCitations).toBe(1);
    expect(r.carriedSources).toBe(0);
    expect(findOrphanRefs(r.db)).toEqual([]);
  });

  it('zieht auch das ARCHIV der Quelle mit — die Geschwister-Stelle des Quellen-Fixes', () => {
    // Nach dem Quellen-Fix blieb am echten Material genau eine Waise: `@S133@.repo`
    // zeigte auf `@R02@`, das Archiv der Fremddatei. Wer eine Referenz repariert, sucht
    // die strukturgleichen Stellen — sonst wandert der Fehler nur eine Ebene tiefer.
    const fremd = {
      ...graph([mitZitat('@N1@')]),
      sources: new Map([['@FREMD1@', makeSource('@FREMD1@', { title: 'Kirchenbuch', repo: '@R9@' })]]),
      repositories: new Map([['@R9@', makeRepository('@R9@', { name: 'Bistumsarchiv Münster' })]]),
    };
    const r = applyImportPatch(db([]), fremd, [{ importId: '@N1@', baseId: null, score: 0, reasons: [], status: 'new' }], { fields: {}, importNew: ['@N1@'] }, QUELLE);

    expect(r.carriedRepositories).toBe(1);
    expect([...r.db.repositories.values()].some((a) => a.name === 'Bistumsarchiv Münster')).toBe(true);
    expect(findOrphanRefs(r.db)).toEqual([]);
  });

  it('leert den Archiv-Verweis, wenn das Archiv auch in der Fremddatei fehlt', () => {
    const fremd = {
      ...graph([mitZitat('@N1@')]),
      sources: new Map([['@FREMD1@', makeSource('@FREMD1@', { title: 'Kirchenbuch', repo: '@FEHLT@' })]]),
    };
    const r = applyImportPatch(db([]), fremd, [{ importId: '@N1@', baseId: null, score: 0, reasons: [], status: 'new' }], { fields: {}, importNew: ['@N1@'] }, QUELLE);
    expect(r.carriedRepositories).toBe(0);
    expect(findOrphanRefs(r.db)).toEqual([]);
  });

  it('lässt einen Freitext im repo-Feld unangetastet (Spec 10 §4: Text ODER Referenz)', () => {
    const fremd = {
      ...graph([mitZitat('@N1@')]),
      sources: new Map([['@FREMD1@', makeSource('@FREMD1@', { title: 'Kirchenbuch', repo: 'Pfarrarchiv, Karton 3' })]]),
    };
    const r = applyImportPatch(db([]), fremd, [{ importId: '@N1@', baseId: null, score: 0, reasons: [], status: 'new' }], { fields: {}, importNew: ['@N1@'] }, QUELLE);
    expect([...r.db.sources.values()].find((q) => q.title === 'Kirchenbuch')!.repo).toBe('Pfarrarchiv, Karton 3');
  });
});

// --- Record-Identität der Fremddatei ------------------------------------------------

describe('applyImportPatch — die `grampsId` der Fremddatei kommt NICHT mit (ADR-v9-260)', () => {
  // Eine `grampsId` benennt einen `<event>`/`<citation>`-Record EINER Datei. Übernimmt der
  // Import sie mit, beansprucht der Datensatz im Zielbestand eine id aus einem fremden
  // id-Raum: das Write-Back findet nichts nachzuschlagen — und trifft im schlimmsten Fall
  // eine gleichnamige, inhaltlich fremde id des Zielbestands. Der `sourceId` wird seit je
  // umgeschrieben; diese zweite Hälfte fehlte.
  function fremdePerson(id: PersonId): Person {
    return makePerson(id, {
      given: 'Anna',
      surname: 'Decker',
      birth: makeEvent('BIRT', {
        seen: true,
        date: '1880',
        grampsId: 'E9001',
        citations: [makeCitation('@S9@', { page: '7', grampsId: 'C9001' })],
      }),
      events: [
        makeEvent('RESI', {
          seen: true,
          date: '1900',
          grampsId: 'E9002',
          citations: [makeCitation('@S9@', { page: '8', grampsId: 'C9002' })],
        }),
      ],
    });
  }

  function fremdGraph(id: PersonId) {
    return {
      ...graph([fremdePerson(id)]),
      sources: new Map([['@S9@', makeSource('@S9@', { abbr: 'KB Fremd' })]]),
    };
  }

  it('streicht sie an einer NEU übernommenen Person — Ereignisse UND Zitate', () => {
    const r = applyImportPatch(
      db([]),
      fremdGraph('@N1@'),
      [{ importId: '@N1@', baseId: null, score: 0, reasons: [], status: 'new' as const }],
      { fields: {}, importNew: ['@N1@'] },
      QUELLE,
    );

    const neu = [...r.db.individuals.values()][0];
    // Zählung vor der Prüfung (ADR-v9-200): eine Zusicherung über ein leeres Array wäre
    // grün und wertlos.
    expect(neu.birth.citations.length).toBeGreaterThan(0);
    expect(neu.events[0].citations.length).toBeGreaterThan(0);

    expect(neu.birth.grampsId).toBeNull();
    expect(neu.birth.citations[0].grampsId).toBeNull();
    expect(neu.events[0].grampsId).toBeNull();
    expect(neu.events[0].citations[0].grampsId).toBeNull();
    // Die Zuordnung selbst bleibt intakt: die Quelle ist in den Ziel-id-Raum übernommen.
    expect(r.db.sources.get(neu.birth.citations[0].sourceId)).toBeTruthy();
    expect(findOrphanRefs(r.db)).toEqual([]);
  });

  it('streicht sie an einem einzeln übernommenen Ereignis', () => {
    const r = applyImportPatch(
      db([makePerson('@B1@', { given: 'Anna', surname: 'Decker' })]),
      fremdGraph('@N1@'),
      [{ importId: '@N1@', baseId: '@B1@', score: 100, reasons: [], status: 'matched' as const }],
      wahl('@N1@', { 'event|RESI|1900': 'take' }),
      QUELLE,
    );

    const ziel = r.db.individuals.get('@B1@')!;
    expect(ziel.events).toHaveLength(1);
    expect(ziel.events[0].citations.length).toBeGreaterThan(0);
    expect(ziel.events[0].grampsId).toBeNull();
    expect(ziel.events[0].citations.every((c) => c.grampsId === null)).toBe(true);
  });
});
