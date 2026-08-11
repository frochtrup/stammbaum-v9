// tests/roundtrip/mehrfach-note.test.ts — BL-338: zwei Notizen bleiben zwei Notizen.
//
// DER BEFUND (eigene Nachprüfung von ADR-v9-250, nicht von einem Gate gefangen). `NOTE_STRUCTURE`
// ist in GEDCOM 5.5.1 `{0:M}`: zwei `1 NOTE`-Zeilen an einem Record sind zwei UNABHÄNGIGE
// Notizen. Der Parser faltete sie zu einem `\n`-getrennten `noteText`, der Emitter schrieb
// daraus EINE `NOTE` mit `CONT` — und weil das eine Zeile weniger ist, als das Original
// trug, hängte der Überschuss-Mechanismus (ADR-v9-208) den zweiten Original-Knoten
// zusätzlich an. Ergebnis: der zweite Text stand danach ZWEIMAL in der Datei, und bei
// jeder weiteren Bearbeitung wuchs er weiter.
//
// Der Überschuss war hier das falsche Werkzeug — er rettet, was das Modell nicht halten
// KANN; `noteText` hielt den Inhalt aber bereits, nur an der falschen Stelle. Die Lösung
// ist die aus [13 §2]: ein Modell-Slot je Wire-Zeile (`extraNotes`), Vorbild `extraNames`.
//
// KEIN erfundener Grenzfall, aber auch kein Bestandsfall: an
// `Testdateien/Unsere Familie 2026-4.ged` kommt er 0× vor (die 7 Personen mit zwei
// NOTE-Zeilen tragen ZEIGER, und die lagen schon immer in einem Array). Der Test hält
// deshalb einen Fall, den jede Fremddatei mitbringen kann.
import { describe, it, expect } from 'vitest';
import { parseGedcom, serializeGedcom, applyDatabaseToRoots } from '../../core/interop';
import { savePerson, saveFamily, saveSource } from '../../core/model';
import type { Database } from '../../core/model/types';

const DOK = [
  '0 HEAD', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8',
  '0 @I1@ INDI',
  '1 NAME Anna /Muster/',
  '1 NOTE erste Notiz',
  '1 NOTE zweite Notiz',
  '2 CONT mit Fortsetzung',
  '1 NOTE @N1@',
  '0 @F1@ FAM',
  '1 HUSB @I1@',
  '1 NOTE Familie A',
  '1 NOTE Familie B',
  '0 @S1@ SOUR',
  '1 TITL Kirchenbuch',
  '1 NOTE Quelle A',
  '1 NOTE Quelle B',
  '0 @N1@ NOTE Freitext-Record',
  '0 TRLR', '',
].join('\n');

function zeilenNach(db: Database, roots: Parameters<typeof serializeGedcom>[0]['roots']): string[] {
  return serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots) })
    .split(/\r?\n/).map((z) => z.trim());
}

describe('Mehrere NOTE-Zeilen an einem Record (BL-338)', () => {
  it('der Parser gibt jeder eigenständigen Notiz einen eigenen Platz', () => {
    const { db } = parseGedcom(DOK);
    const p = db.individuals.get('@I1@')!;
    expect(p.noteText).toBe('erste Notiz');
    expect(p.extraNotes).toEqual(['zweite Notiz\nmit Fortsetzung']);
    // Der Zeiger bleibt davon unberührt — er lag schon immer in seinem eigenen Array.
    expect(p.noteRefs).toEqual(['@N1@']);

    expect(db.families.get('@F1@')!.extraNotes).toEqual(['Familie B']);
    expect(db.sources.get('@S1@')!.extraNotes).toEqual(['Quelle B']);
  });

  it('ein GEÄNDERTER Record schreibt beide Notizen — je einmal, nicht gefaltet', () => {
    // Der eigentliche Regressionsfall: vor BL-338 stand „zweite Notiz" hier zweimal —
    // einmal als `2 CONT` unter der ersten, einmal als erhaltener Überschuss-Knoten.
    const doc = parseGedcom(DOK);
    const p = doc.db.individuals.get('@I1@')!;
    const db = { ...doc.db, individuals: savePerson(doc.db.individuals, { ...p, name: 'Anna /Anders/' }) };
    const z = zeilenNach(db, doc.roots);

    expect(z.filter((x) => x === '1 NOTE erste Notiz')).toHaveLength(1);
    expect(z.filter((x) => x === '1 NOTE zweite Notiz')).toHaveLength(1);
    expect(z.filter((x) => x === '2 CONT mit Fortsetzung')).toHaveLength(1);
    expect(z.filter((x) => x === '1 NOTE @N1@')).toHaveLength(1);
    // Und nirgends als Fortsetzung der ERSTEN Notiz.
    expect(z).not.toContain('2 CONT zweite Notiz');
  });

  it('gilt genauso für Familie und Quelle (dieselbe Faltung, dieselbe Lücke)', () => {
    const doc = parseGedcom(DOK);
    const f = doc.db.families.get('@F1@')!;
    const s = doc.db.sources.get('@S1@')!;
    const db = {
      ...saveFamily(doc.db, { ...f, noteText: 'Familie A' }),
      sources: saveSource(doc.db.sources, { ...s, title: 'Anderer Titel' }),
    };
    const z = zeilenNach(db, doc.roots);

    for (const zeile of ['1 NOTE Familie A', '1 NOTE Familie B', '1 NOTE Quelle A', '1 NOTE Quelle B']) {
      expect(z.filter((x) => x === zeile), zeile).toHaveLength(1);
    }
  });

  it('RT-1: ohne Bearbeitung bleibt die Datei byte-identisch', () => {
    const doc = parseGedcom(DOK);
    const out1 = serializeGedcom({ db: doc.db, roots: applyDatabaseToRoots(doc.db, doc.roots) });
    const out2 = serializeGedcom({ db: doc.db, roots: applyDatabaseToRoots(doc.db, doc.roots) });
    expect(out1).toBe(out2);
    expect(out1).toContain('1 NOTE zweite Notiz');
  });

  it('ein Edit an der ERSTEN Notiz lässt die zweite unangetastet', () => {
    // Die Arbeitsteilung, die `extraNotes` von `extraNames` erbt: der Editor führt
    // `noteText`, alles Weitere reist unverändert mit (LP-1).
    const doc = parseGedcom(DOK);
    const p = doc.db.individuals.get('@I1@')!;
    const db = { ...doc.db, individuals: savePerson(doc.db.individuals, { ...p, noteText: 'neu getippt' }) };
    const z = zeilenNach(db, doc.roots);

    expect(z).toContain('1 NOTE neu getippt');
    expect(z.filter((x) => x === '1 NOTE zweite Notiz')).toHaveLength(1);
    expect(z).not.toContain('1 NOTE erste Notiz');
  });
});
