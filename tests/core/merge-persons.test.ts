// tests/core/merge-persons.test.ts — BL-103/ADR-v9-104: `mergePersons` als eigenes
// Kern-Kommando.
//
// WARUM ES DAS KOMMANDO ÜBERHAUPT GIBT: `deletePerson` führt Familien-Referenzen
// bewusst NICHT nach (Kopfkommentar in core/model/commands.ts). Ein Merge aus
// savePerson(winner) + deletePerson(loser) ließe `Family.husband/wife/children`,
// `Person.aliases` und `Association.personRef` auf die gelöschte id zeigen — die
// Verlierer-Person verschwände aus der Liste und bliebe als Elternteil, Kind und
// Partner im Baum stehen.
//
// Der schärfste Test hier ist deshalb nicht die Feldübernahme, sondern
// `findOrphanRefs(db) === []`: diese Funktion kennt ALLE fünf Stellen, an denen eine
// PersonId im Modell vorkommt. Ein von Hand gepflegter Vergleich könnte eine vergessen —
// der Wächter nicht.
import { describe, it, expect } from 'vitest';
import { makeDatabase, makePerson, makeFamily, makeEvent, makeCitation, makeMediaCitation } from '../../core/model/factory';
import { findOrphanRefs, checkIndiFamConsistency } from '../../core/model/integrity';
import { mergePersons, MERGEABLE_PERSON_FIELDS } from '../../core/dedup';
import { savePerson, deletePerson } from '../../core/model/commands';
import { makeHypothesis } from '../../core/research';
import type { Database, Person, Family } from '../../core/model/types';

function db(persons: Person[], families: Family[] = []): Database {
  const base = makeDatabase();
  for (const p of persons) base.individuals.set(p.id, p);
  for (const f of families) base.families.set(f.id, f);
  return base;
}

// --- Familienkanten: der eigentliche Grund für das Kommando ------------------------

describe('mergePersons — Familien-Referenzen', () => {
  it('GEGENPROBE: der naive Merge aus savePerson + deletePerson hinterlässt Waisen', () => {
    // Die Existenzberechtigung dieses Kommandos, negativ belegt statt aus einem
    // Kommentar zitiert. Ohne diesen Test wäre `findOrphanRefs(next) === []` in allen
    // folgenden Tests wertlos — eine Zusicherung, die auch dann grün bliebe, wenn sie
    // gar nichts prüfen könnte.
    const build = (): Database =>
      db(
        [makePerson('@WIN@'), makePerson('@LOSER@', { parentIn: ['@F1@'] }), makePerson('@X@', { aliases: ['@LOSER@'] })],
        [makeFamily('@F1@', { husband: '@LOSER@', children: ['@LOSER@'] })],
      );

    const naiv = build();
    naiv.individuals = savePerson(naiv.individuals, naiv.individuals.get('@WIN@')!);
    naiv.individuals = deletePerson(naiv.individuals, '@LOSER@');
    // Drei kaputte Kanten: FAM.husband, FAM.children, Person.aliases.
    expect(findOrphanRefs(naiv)).toHaveLength(3);

    expect(findOrphanRefs(mergePersons(build(), '@WIN@', '@LOSER@'))).toEqual([]);
  });

  it('hängt den Verlierer als Ehepartner auf den Gewinner um', () => {
    const fam = makeFamily('@F1@', { husband: '@LOSER@', wife: '@W@' });
    const next = mergePersons(
      db(
        [makePerson('@WIN@'), makePerson('@LOSER@', { parentIn: ['@F1@'] }), makePerson('@W@', { parentIn: ['@F1@'] })],
        [fam],
      ),
      '@WIN@',
      '@LOSER@',
    );
    expect(next.families.get('@F1@')!.husband).toBe('@WIN@');
    expect(next.individuals.get('@WIN@')!.parentIn).toContain('@F1@');
    expect(next.individuals.has('@LOSER@')).toBe(false);
    expect(findOrphanRefs(next)).toEqual([]);
  });

  it('hängt den Verlierer als Kind auf den Gewinner um', () => {
    const fam = makeFamily('@F1@', { husband: '@V@', children: ['@LOSER@'] });
    const next = mergePersons(
      db(
        [makePerson('@WIN@'), makePerson('@LOSER@', { childOf: [link('@F1@')] }), makePerson('@V@', { parentIn: ['@F1@'] })],
        [fam],
      ),
      '@WIN@',
      '@LOSER@',
    );
    expect(next.families.get('@F1@')!.children).toEqual(['@WIN@']);
    expect(next.individuals.get('@WIN@')!.childOf.map((l) => l.familyId)).toEqual(['@F1@']);
    expect(findOrphanRefs(next)).toEqual([]);
  });

  it('doppelt erfasstes Kind: beide in DERSELBEN Familie — der Gewinner bleibt genau einmal Kind', () => {
    // Der häufigste echte Duplikat-Fall (ADR-v9-106: sechs der 21 Referenz-Duplikate im
    // Bestand sind genau das). Naives Umhängen erzeugte hier ein Kind, das zweimal in
    // der Kinderliste steht.
    const fam = makeFamily('@F1@', { husband: '@V@', children: ['@WIN@', '@LOSER@'] });
    const next = mergePersons(
      db(
        [
          makePerson('@WIN@', { childOf: [link('@F1@')] }),
          makePerson('@LOSER@', { childOf: [link('@F1@')] }),
          makePerson('@V@', { parentIn: ['@F1@'] }),
        ],
        [fam],
      ),
      '@WIN@',
      '@LOSER@',
    );
    expect(next.families.get('@F1@')!.children).toEqual(['@WIN@']);
    expect(next.individuals.get('@WIN@')!.childOf).toHaveLength(1);
    expect(findOrphanRefs(next)).toEqual([]);
    expect(checkIndiFamConsistency(next)).toEqual([]);
  });

  it('beide Ehepartner derselben Familie: der Slot des Verlierers wird geleert, nicht verdoppelt', () => {
    const fam = makeFamily('@F1@', { husband: '@WIN@', wife: '@LOSER@' });
    const next = mergePersons(
      db([makePerson('@WIN@', { parentIn: ['@F1@'] }), makePerson('@LOSER@', { parentIn: ['@F1@'] })], [fam]),
      '@WIN@',
      '@LOSER@',
    );
    const merged = next.families.get('@F1@')!;
    expect(merged.husband).toBe('@WIN@');
    expect(merged.wife).toBeNull();
    expect(findOrphanRefs(next)).toEqual([]);
  });

  it('zieht Referenzen aus aliases und associations mit (nicht nur die Familienkanten)', () => {
    // Die beiden leicht übersehenen Stellen — `findOrphanRefs` kennt sie, ein von Hand
    // gepflegter Umhänge-Code vergisst sie.
    const dritter = makePerson('@X@', {
      aliases: ['@LOSER@'],
      associations: [{ personRef: '@LOSER@', grampsHandle: null, role: 'Pate', note: '', citations: [] }],
    });
    const next = mergePersons(db([makePerson('@WIN@'), makePerson('@LOSER@'), dritter]), '@WIN@', '@LOSER@');
    const x = next.individuals.get('@X@')!;
    expect(x.aliases).toEqual(['@WIN@']);
    expect(x.associations[0].personRef).toBe('@WIN@');
    expect(findOrphanRefs(next)).toEqual([]);
  });

  it('erzeugt keinen Selbstbezug, wenn der Gewinner schon auf den Verlierer verwies', () => {
    const win = makePerson('@WIN@', { aliases: ['@LOSER@'] });
    const next = mergePersons(db([win, makePerson('@LOSER@')]), '@WIN@', '@LOSER@');
    expect(next.individuals.get('@WIN@')!.aliases).toEqual([]);
    expect(findOrphanRefs(next)).toEqual([]);
  });
});

// --- Feldauswahl ------------------------------------------------------------------

describe('mergePersons — Feldauswahl (ADR-v9-104: alle Skalarfelder)', () => {
  const win = makePerson('@WIN@', { given: 'Anna', surname: 'Decker', title: 'Frau', email: 'a@x.de' });
  const lose = makePerson('@LOSER@', { given: 'Anne', surname: 'Dekker', title: 'Dr.', www: 'x.de' });

  it('nimmt ohne Auswahl den Wert des Gewinners', () => {
    const next = mergePersons(db([win, lose]), '@WIN@', '@LOSER@');
    expect(next.individuals.get('@WIN@')!.given).toBe('Anna');
    expect(next.individuals.get('@WIN@')!.title).toBe('Frau');
  });

  it('füllt leere Gewinner-Felder aus dem Verlierer (prefer-nonempty, verlustfrei)', () => {
    const next = mergePersons(db([win, lose]), '@WIN@', '@LOSER@');
    expect(next.individuals.get('@WIN@')!.www).toBe('x.de');
  });

  it('folgt einer expliziten Auswahl je Feld', () => {
    const next = mergePersons(db([win, lose]), '@WIN@', '@LOSER@', { given: 'loser', title: 'loser' });
    expect(next.individuals.get('@WIN@')!.given).toBe('Anne');
    expect(next.individuals.get('@WIN@')!.title).toBe('Dr.');
    expect(next.individuals.get('@WIN@')!.surname).toBe('Decker');
  });

  it('leitet den rohen NAME-Wert aus der getroffenen Auswahl ab — MIT Schrägstrichen', () => {
    // `Person.name` ist der ROHE GEDCOM-NAME-Wert: der Parser übernimmt ihn verbatim,
    // `emitPerson` schreibt ihn verbatim in die `1 NAME`-Zeile. Die frühere Erwartung
    // "Anne Dekker" (ohne Trenner) hätte nach einem Merge eine NAME-Zeile erzeugt, in der
    // der Nachname nicht mehr als solcher erkennbar ist — ADR-v9-112.
    const next = mergePersons(db([win, lose]), '@WIN@', '@LOSER@', { given: 'loser', surname: 'loser' });
    expect(next.individuals.get('@WIN@')!.name).toBe('Anne /Dekker/');
  });

  it('behandelt Geschlecht "U" wie leer', () => {
    const u = makePerson('@WIN@', { sex: 'U' });
    const f = makePerson('@LOSER@', { sex: 'F' });
    expect(mergePersons(db([u, f]), '@WIN@', '@LOSER@').individuals.get('@WIN@')!.sex).toBe('F');
  });

  it('wählt auch Ereignis-Unterfelder je Seite', () => {
    const a = makePerson('@WIN@', { birth: makeEvent('BIRT', { date: '1850', place: 'Ochtrup' }) });
    const b = makePerson('@LOSER@', { birth: makeEvent('BIRT', { date: '3 MAR 1850', place: 'Vechta' }) });
    const next = mergePersons(db([a, b]), '@WIN@', '@LOSER@', { 'birth.date': 'loser' });
    const merged = next.individuals.get('@WIN@')!;
    expect(merged.birth.date).toBe('3 MAR 1850');
    expect(merged.birth.place).toBe('Ochtrup');
  });

  it('die Feldliste ist EINE Quelle für Kommando und Ansicht', () => {
    // BL-104 baut seine Zeilen aus derselben Liste — sonst driften Modal und Kommando
    // auseinander (ein Feld im Modal wählbar, vom Kommando ignoriert).
    const keys = MERGEABLE_PERSON_FIELDS.map((f) => f.key);
    expect(keys).toContain('surname');
    expect(keys).toContain('birth.date');
    expect(keys).toContain('death.place');
    expect(new Set(keys).size).toBe(keys.length);
    for (const f of MERGEABLE_PERSON_FIELDS) expect(f.label.length).toBeGreaterThan(0);
  });

  it('JEDER Schlüssel der Feldliste wird vom Kommando auch wirklich befolgt', () => {
    // Der Zwang hinter der ausgeschriebenen Zuweisungsliste in merge-persons.ts: ein
    // Eintrag, den nur das Modal kennt, fällt hier auf, statt sich als stumm
    // ignorierte Nutzerauswahl zu tarnen. Datengetrieben — wer die Liste erweitert,
    // erweitert den Test automatisch mit.
    const at = (p: Person, key: string): unknown => {
      const [head, sub] = key.split('.');
      const root = (p as unknown as Record<string, unknown>)[head];
      return sub ? (root as unknown as Record<string, unknown>)[sub] : root;
    };
    const evt = (date: string, place: string): ReturnType<typeof makeEvent> =>
      makeEvent('X', { date, place });
    const seite = (id: string, mark: string, sex: 'M' | 'F'): Person =>
      makePerson(id, {
        surname: `${mark}sn`, given: `${mark}gn`, nick: `${mark}nk`, prefix: `${mark}pr`,
        suffix: `${mark}su`, sex, title: `${mark}ti`, religion: `${mark}re`,
        restriction: `${mark}rs`, email: `${mark}@x.de`, www: `${mark}.de`, uid: `${mark}uid`,
        cause: `${mark}ca`,
        birth: evt(`1 JAN 180${mark === 'W' ? 1 : 2}`, `${mark}-Geburtsort`),
        chr: evt(`2 FEB 180${mark === 'W' ? 1 : 2}`, `${mark}-Taufort`),
        death: evt(`3 MAR 188${mark === 'W' ? 1 : 2}`, `${mark}-Sterbeort`),
        buri: evt(`4 APR 188${mark === 'W' ? 1 : 2}`, `${mark}-Grabort`),
      });

    for (const field of MERGEABLE_PERSON_FIELDS) {
      const w = seite('@WIN@', 'W', 'M');
      const l = seite('@LOSER@', 'L', 'F');
      // OHNE diese Zeile ist der Test wertlos: ein Schlüssel, den `seite()` nicht
      // befüllt, ist auf beiden Seiten leer, und `expect(leer).toBe(leer)` geht durch.
      // Beim Gegentest (erfundenes Feld in die Liste eingetragen) blieben alle 23 Tests
      // grün — der Wächter bewachte nichts. Jetzt schlägt ein nicht abgedeckter
      // Schlüssel hier laut fehl, statt sich als bestandene Prüfung zu tarnen.
      expect(at(w, field.key), `Fixture deckt „${field.key}" nicht ab — Test wäre wirkungslos`).not.toBe(
        at(l, field.key),
      );
      const merged = mergePersons(db([w, l]), '@WIN@', '@LOSER@', { [field.key]: 'loser' }).individuals.get('@WIN@')!;
      expect(at(merged, field.key), `Feld „${field.label}" (${field.key}) ignoriert die Auswahl`).toBe(
        at(l, field.key),
      );
    }
  });
});

// --- Mengen-Felder: verlustfrei ---------------------------------------------------

describe('mergePersons — Mengen werden vereinigt, nie gewählt', () => {
  it('führt Ereignisse, Medien, Notizen und Forschungsdaten zusammen', () => {
    const a = makePerson('@WIN@', {
      events: [makeEvent('OCCU', { value: 'Bauer' })],
      media: [makeMediaCitation('a.jpg', { title: 'A' })],
      noteText: 'Notiz A',
    });
    const b = makePerson('@LOSER@', {
      events: [makeEvent('RESI', { addr: 'Hof 1' })],
      media: [makeMediaCitation('b.jpg', { title: 'B' })],
      noteText: 'Notiz B',
      researchLog: [{ date: '2026-01-01', repoRef: '', sourceRef: '', query: 'q', result: 'pending', note: '', taskId: '' }],
    });
    const merged = mergePersons(db([a, b]), '@WIN@', '@LOSER@').individuals.get('@WIN@')!;
    expect(merged.events).toHaveLength(2);
    expect(merged.media).toHaveLength(2);
    expect(merged.noteText).toContain('Notiz A');
    expect(merged.noteText).toContain('Notiz B');
    expect(merged.researchLog).toHaveLength(1);
  });

  it('vereinigt Zitate der Sonder-Ereignisse ohne Dubletten', () => {
    const cit = makeCitation('@S1@', { page: '12' });
    const a = makePerson('@WIN@', { birth: makeEvent('BIRT', { date: '1850', citations: [cit] }) });
    const b = makePerson('@LOSER@', {
      birth: makeEvent('BIRT', { date: '1850', citations: [makeCitation('@S1@', { page: '12' }), makeCitation('@S2@', { page: '5' })] }),
    });
    const merged = mergePersons(db([a, b]), '@WIN@', '@LOSER@').individuals.get('@WIN@')!;
    expect(merged.birth.citations).toHaveLength(2);
  });

  it('erhält das seen-Flag, wenn eine der beiden Seiten es trägt (INV-P5)', () => {
    const a = makePerson('@WIN@', { death: makeEvent('DEAT', { seen: false }) });
    const b = makePerson('@LOSER@', { death: makeEvent('DEAT', { seen: true }) });
    expect(mergePersons(db([a, b]), '@WIN@', '@LOSER@').individuals.get('@WIN@')!.death.seen).toBe(true);
  });
});

// --- Copy-on-Write / Undo-Tauglichkeit --------------------------------------------

describe('mergePersons — Copy-on-Write (ADR-v9-92)', () => {
  it('lässt den Vorzustand unangetastet', () => {
    const before = db(
      [makePerson('@WIN@', { given: 'Anna' }), makePerson('@LOSER@', { given: 'Anne', www: 'x.de' })],
      [makeFamily('@F1@', { husband: '@LOSER@' })],
    );
    const snapshot = JSON.stringify([...before.individuals.keys()]);
    const beforeFam = before.families.get('@F1@')!.husband;
    mergePersons(before, '@WIN@', '@LOSER@');
    expect(JSON.stringify([...before.individuals.keys()])).toBe(snapshot);
    expect(before.families.get('@F1@')!.husband).toBe(beforeFam);
    expect(before.individuals.get('@WIN@')!.www).toBe('');
  });

  it('lässt unbeteiligte Entitäten referenzgleich (kein Deep Copy)', () => {
    const fremder = makePerson('@X@', { given: 'Egal' });
    const fremdeFamilie = makeFamily('@F9@', { husband: '@X@' });
    const before = db([makePerson('@WIN@'), makePerson('@LOSER@'), fremder], [fremdeFamilie]);
    const next = mergePersons(before, '@WIN@', '@LOSER@');
    expect(next.individuals.get('@X@')).toBe(fremder);
    expect(next.families.get('@F9@')).toBe(fremdeFamilie);
  });
});

// --- Robustheit -------------------------------------------------------------------

describe('mergePersons — Randfälle', () => {
  it('ist ein No-Op bei unbekannten ids', () => {
    const before = db([makePerson('@WIN@')]);
    expect(mergePersons(before, '@WIN@', '@FEHLT@').individuals.size).toBe(1);
    expect(mergePersons(before, '@FEHLT@', '@WIN@').individuals.has('@WIN@')).toBe(true);
  });

  it('ist ein No-Op, wenn Gewinner und Verlierer dieselbe Person sind', () => {
    const before = db([makePerson('@WIN@', { given: 'Anna' })]);
    const next = mergePersons(before, '@WIN@', '@WIN@');
    expect(next.individuals.get('@WIN@')!.given).toBe('Anna');
    expect(next.individuals.size).toBe(1);
  });

  it('hinterlässt nach dem Merge einen konsistenten Bestand (INV-P2 + INV-P3)', () => {
    const fam1 = makeFamily('@F1@', { husband: '@V@', children: ['@LOSER@', '@GESCHW@'] });
    const fam2 = makeFamily('@F2@', { husband: '@LOSER@', wife: '@W@', children: ['@K@'] });
    const next = mergePersons(
      db(
        [
          makePerson('@WIN@'),
          makePerson('@LOSER@', { childOf: [link('@F1@')], parentIn: ['@F2@'] }),
          makePerson('@GESCHW@', { childOf: [link('@F1@')] }),
          makePerson('@V@', { parentIn: ['@F1@'] }),
          makePerson('@W@', { parentIn: ['@F2@'] }),
          makePerson('@K@', { childOf: [link('@F2@')] }),
        ],
        [fam1, fam2],
      ),
      '@WIN@',
      '@LOSER@',
    );
    expect(findOrphanRefs(next)).toEqual([]);
    expect(checkIndiFamConsistency(next)).toEqual([]);
    expect(next.families.get('@F1@')!.children).toContain('@WIN@');
    expect(next.families.get('@F2@')!.husband).toBe('@WIN@');
  });
});

// --- Hypothesen-Zeiger (BL-294, ADR-v9-200) ---------------------------------------
//
// Gefunden vom Naht-Test Import→Merge→Export (BL-287): `mergePersons` hängte `aliases`
// und `associations.personRef` auf den Gewinner um — `hypotheses.refs` nicht. Die refs
// kamen mit ADR-v9-174 dazu, die Umhäng-Schleife wurde nicht mitgezogen. Geschwister-
// Stelle: `deletePersonCascade` räumte sie von Anfang an korrekt auf.
//
// Die Regel ist NICHT neu erfunden, sondern die drei Zeilen darüber: ein Alias auf sich
// selbst entfällt (`.filter((a) => a !== p.id)`), Duplikate fallen weg. Dieselbe Form wie
// ADR-v9-195 Punkt 3 bei den Orten („kein Ort enthält sich selbst").
describe('mergePersons — hypotheses.refs (BL-294)', () => {
  // Über die Fabrik, nicht als Literal: ein handgebautes Objekt driftet vom Typ ab, sobald
  // ein Feld dazukommt — genau das ist beim ersten Anlauf passiert (`conclusion` fehlte,
  // Vitest lief grün, weil esbuild Typen entfernt, und erst `tsc --noEmit` schlug an).
  const hypothese = (id: string, refs: string[]) =>
    makeHypothesis(id, {
      text: 'Vermutlich dieselbe Person',
      kind: 'identity',
      status: 'open',
      weight: 'medium',
      rationale: 'gleicher Hof, gleiche Paten',
      refs,
    });

  it('ein FREMDER Zeiger auf den Verlierer wird auf den Gewinner umgehängt', () => {
    const next = mergePersons(
      db([
        makePerson('@WIN@'),
        makePerson('@LOSER@'),
        makePerson('@X@', { hypotheses: [hypothese('H1', ['@LOSER@'])] }),
      ]),
      '@WIN@',
      '@LOSER@',
    );

    expect(next.individuals.get('@X@')!.hypotheses[0].refs).toEqual(['@WIN@']);
    expect(findOrphanRefs(next)).toEqual([]);
  });

  it('der EIGENE Zeiger des Gewinners auf den Verlierer entfällt, statt auf sich selbst zu zeigen', () => {
    // Der Fall aus der Praxis: „@WIN@ und @LOSER@ sind dieselbe Person" — die Hypothese
    // hat sich mit dem Merge erfüllt. Ein Zeiger auf den eigenen Datensatz wäre keine
    // Aussage mehr; der Text bleibt als Befund stehen (INV-H3: ohne Bezug ist es kein
    // Ausschluss mehr — genau die Entscheidung, die `deletePersonCascade` schon trifft).
    const next = mergePersons(
      db([makePerson('@WIN@', { hypotheses: [hypothese('H1', ['@LOSER@'])] }), makePerson('@LOSER@')]),
      '@WIN@',
      '@LOSER@',
    );

    const h = next.individuals.get('@WIN@')!.hypotheses[0];
    expect(h.refs).toEqual([]);
    expect(h.text).toBe('Vermutlich dieselbe Person'); // der Befund bleibt
    expect(findOrphanRefs(next)).toEqual([]);
  });

  it('die Hypothese des VERLIERERS wandert mit und zeigt danach nicht auf den Gewinner selbst', () => {
    const next = mergePersons(
      db([makePerson('@WIN@'), makePerson('@LOSER@', { hypotheses: [hypothese('H1', ['@WIN@'])] })]),
      '@WIN@',
      '@LOSER@',
    );

    const uebernommen = next.individuals.get('@WIN@')!.hypotheses;
    expect(uebernommen).toHaveLength(1);
    expect(uebernommen[0].refs).toEqual([]);
    expect(findOrphanRefs(next)).toEqual([]);
  });

  it('ein Zeiger auf einen DRITTEN bleibt unangetastet (Kontrollfall)', () => {
    const next = mergePersons(
      db([
        makePerson('@WIN@', { hypotheses: [hypothese('H1', ['@LOSER@', '@X@'])] }),
        makePerson('@LOSER@'),
        makePerson('@X@'),
      ]),
      '@WIN@',
      '@LOSER@',
    );

    expect(next.individuals.get('@WIN@')!.hypotheses[0].refs).toEqual(['@X@']);
  });
});

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
