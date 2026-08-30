// tests/roundtrip/namensform-edit.test.ts — der Edit an einer weiteren Namensform kommt
// in der DATEI an, und er kommt nur dort an (Nutzer-Wunsch 2026-08-30).
//
// WARUM DIESE EBENE UND NICHT NUR DER KERN-TEST. `extraNames` hat zwei Hälften — den
// `NAME`-Wert und die optionalen Untertags `GIVN`/`SURN` daneben. Ob der Edit beide
// richtig trifft, entscheidet sich erst am Emitter: ein Kern-Test kann bestätigen, dass
// das Modell stimmt, während die Ausgabe zwei sich widersprechende Zeilen trägt
// (ADR-v9-81) oder Zeilen erfindet, die die Quelle nie hatte (ADR-v9-197). Genau die
// beiden Klassen prüft diese Datei — an Zeilen, nicht an Feldern.
import { describe, it, expect } from 'vitest';
import { parseGedcom, serializeGedcom, applyDatabaseToRoots } from '../../core/interop';
import { savePerson, withAddedExtraName, withUpdatedExtraName, withRemovedExtraName } from '../../core/model';
import type { Database } from '../../core/model/types';

// Drei Formen mit ABSICHTLICH verschiedener Untertag-Ausstattung: ohne, mit
// wiederholenden, mit ENGER gesetztem Untertag.
const DOK = [
  '0 HEAD', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8',
  '0 @I1@ INDI',
  '1 NAME Anna /Decker/',
  '1 NAME Anna /Meyer/',
  '2 TYPE married',
  '1 NAME Anna /Klein/',
  '2 TYPE aka',
  '2 GIVN Anna',
  '2 SURN Klein',
  '1 NAME Anna Maria /Gross/',
  '2 TYPE birth',
  '2 GIVN Anna',
  '0 TRLR', '',
].join('\n');

function zeilenNach(db: Database, roots: Parameters<typeof serializeGedcom>[0]['roots']): string[] {
  return serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots) })
    .split(/\r?\n/).map((z) => z.trim());
}

describe('Weitere Namensformen — Bearbeitung erreicht die Datei', () => {
  it('der Parser gibt jeder weiteren NAME-Zeile ihren Platz', () => {
    const { db } = parseGedcom(DOK);
    const p = db.individuals.get('@I1@')!;
    expect(p.name).toBe('Anna /Decker/');
    expect(p.extraNames.map((n) => n.nameRaw)).toEqual(['Anna /Meyer/', 'Anna /Klein/', 'Anna Maria /Gross/']);
  });

  it('unberührt bleibt die Datei zeilengleich (LP-1)', () => {
    const { db, roots } = parseGedcom(DOK);
    expect(zeilenNach(db, roots).filter(Boolean)).toEqual(DOK.split('\n').filter(Boolean));
  });

  it('Nachname ändern schreibt die NAME-Zeile um — ohne einen Untertag zu erfinden', () => {
    const { db, roots } = parseGedcom(DOK);
    const p = db.individuals.get('@I1@')!;
    db.individuals = savePerson(db.individuals, withUpdatedExtraName(p, 0, 'Anna', 'Meier', 'married'));

    const zeilen = zeilenNach(db, roots);
    expect(zeilen).toContain('1 NAME Anna /Meier/');
    expect(zeilen).not.toContain('1 NAME Anna /Meyer/');
    // Die Quelle hatte an dieser Form kein GIVN/SURN — sie bekommt auch keins.
    const idx = zeilen.indexOf('1 NAME Anna /Meier/');
    expect(zeilen[idx + 1]).toBe('2 TYPE married');
    expect(zeilen[idx + 2]).toBe('1 NAME Anna /Klein/');
  });

  it('vorhandene, den Wert nur wiederholende Untertags ziehen mit (keine widersprüchliche Datei)', () => {
    const { db, roots } = parseGedcom(DOK);
    const p = db.individuals.get('@I1@')!;
    db.individuals = savePerson(db.individuals, withUpdatedExtraName(p, 1, 'Anna', 'Kleinert', 'aka'));

    const zeilen = zeilenNach(db, roots);
    expect(zeilen).toContain('1 NAME Anna /Kleinert/');
    expect(zeilen).toContain('2 SURN Kleinert');
    expect(zeilen).not.toContain('2 SURN Klein');
  });

  it('ein ENGER gesetzter Untertag bleibt stehen (ADR-v9-210)', () => {
    const { db, roots } = parseGedcom(DOK);
    const p = db.individuals.get('@I1@')!;
    // `GIVN Anna` sagt bewusst weniger als `NAME Anna Maria /Gross/`.
    db.individuals = savePerson(db.individuals, withUpdatedExtraName(p, 2, 'Anna Maria', 'Groß', 'birth'));

    const zeilen = zeilenNach(db, roots);
    expect(zeilen).toContain('1 NAME Anna Maria /Groß/');
    expect(zeilen).toContain('2 GIVN Anna');
  });

  it('eine reine ART-Änderung fasst die NAME-Zeile nicht an (ADR-v9-197)', () => {
    const { db, roots } = parseGedcom(DOK);
    const p = db.individuals.get('@I1@')!;
    db.individuals = savePerson(db.individuals, withUpdatedExtraName(p, 0, 'Anna', 'Meyer', 'maiden'));

    const zeilen = zeilenNach(db, roots);
    expect(zeilen).toContain('1 NAME Anna /Meyer/');
    expect(zeilen).toContain('2 TYPE maiden');
    expect(zeilen).not.toContain('2 TYPE married');
  });

  it('eine neue Form erscheint als eigene NAME-Zeile, mit TYPE und ohne Untertags', () => {
    const { db, roots } = parseGedcom(DOK);
    const p = db.individuals.get('@I1@')!;
    db.individuals = savePerson(db.individuals, withAddedExtraName(p, 'Annemarie', 'Decker', 'aka'));

    const zeilen = zeilenNach(db, roots);
    const idx = zeilen.indexOf('1 NAME Annemarie /Decker/');
    expect(idx).toBeGreaterThan(-1);
    expect(zeilen[idx + 1]).toBe('2 TYPE aka');
    expect(zeilen.filter((z) => z === '2 GIVN Annemarie')).toHaveLength(0);
  });

  it('eine entfernte Form ist aus der Datei weg (kein Passthrough-Wiedergänger)', () => {
    const { db, roots } = parseGedcom(DOK);
    const p = db.individuals.get('@I1@')!;
    db.individuals = savePerson(db.individuals, withRemovedExtraName(p, 0));

    const zeilen = zeilenNach(db, roots);
    expect(zeilen).not.toContain('1 NAME Anna /Meyer/');
    expect(zeilen).toContain('1 NAME Anna /Klein/');
    // Der HAUPTname bleibt selbstverständlich unberührt.
    expect(zeilen).toContain('1 NAME Anna /Decker/');
  });

  it('nach einem Edit ist die Ausgabe stabil (zweiter Lauf = erster Lauf)', () => {
    const { db, roots } = parseGedcom(DOK);
    const p = db.individuals.get('@I1@')!;
    db.individuals = savePerson(db.individuals, withUpdatedExtraName(p, 0, 'Anna', 'Meier', 'married'));
    const out1 = serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots) });

    const zweit = parseGedcom(out1);
    const out2 = serializeGedcom({ db: zweit.db, roots: applyDatabaseToRoots(zweit.db, zweit.roots) });
    expect(out2).toBe(out1);
  });
});
