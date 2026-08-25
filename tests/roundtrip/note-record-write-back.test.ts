// tests/roundtrip/note-record-write-back.test.ts — BL-380: ein Edit an einem
// `0 @N@ NOTE`-Record kommt in der Datei an.
//
// WAS VORHER WAR. `applyDatabaseToRoots` kannte fünf Record-Arten (INDI/FAM/SOUR/REPO/OBJE);
// ein Notiz-Record fiel in den `default`-Zweig und ging unangetastet durch. Das war für den
// ROUNDTRIP richtig (der Record blieb byte-gleich) und für jeden EDIT falsch: die Änderung
// verschwand still. Gefunden hat es nicht ein Test dieser Datei, sondern die generische
// Edit-Mutation M3 an `Testdateien/Unsere Familie 2026-4.ged` — 219 von 32.030 mutierten
// Feldern kamen nicht zurück, alle dieser einen Art ([ADR-v9-282](../../specs/v9/04-Entscheidungslog.md)).
//
// WARUM DER PASSTHROUGH HIER MEHR TRÄGT ALS SONST. Das Modell beansprucht an einem
// Notiz-Record NUR den Text; `RECOGNIZED_NOTE` ist deshalb leer, und alles andere reist als
// Passthrough mit. Im Bestand sind das `CHAN` (8×), `REFN` (1×) und `_VALID` (1×) —
// gemessen, nicht vermutet.
import { describe, it, expect } from 'vitest';
import { parseGedcom, serializeGedcom, applyDatabaseToRoots } from '../../core/interop';
import type { ParsedGedcom } from '../../core/interop';

function schreibe(doc: ParsedGedcom): string {
  return serializeGedcom({ db: doc.db, roots: applyDatabaseToRoots(doc.db, doc.roots) });
}

const FIXTURE = [
  '0 HEAD', '1 GEDC', '2 VERS 5.5.1',
  '0 @I1@ INDI',
  '1 NAME Max /Muster/',
  '1 NOTE @N1@',
  '0 @N1@ NOTE Aus dem Kirchenbuch St. Lamberti.',
  '1 CONT Zweite Zeile der Notiz.',
  '1 CHAN',
  '2 DATE 3 APR 2026',
  '1 REFN Non_Duplicates',
  '1 _VALID Y',
  '0 @N2@ NOTE Eine zweite, von niemandem verwiesene Notiz.',
  '0 TRLR',
].join('\n');

describe('BL-380 — Write-Back für Notiz-Records', () => {
  it('ohne Änderung bleibt die Datei byte-gleich (der Roundtrip war nie das Problem)', () => {
    const doc = parseGedcom(FIXTURE);
    const out = schreibe(doc);
    expect(out).toBe(serializeGedcom({ db: doc.db, roots: doc.roots }));
  });

  it('ein geänderter Notiz-Text steht nach dem Speichern in der Datei', () => {
    const doc = parseGedcom(FIXTURE);
    const n = doc.db.notes.get('@N1@')!;
    doc.db.notes.set('@N1@', { ...n, text: 'Korrigiert: aus dem Taufregister, Seite 214.' });

    const out = schreibe(doc);
    expect(out).toContain('0 @N1@ NOTE Korrigiert: aus dem Taufregister, Seite 214.');
    expect(out).not.toContain('Aus dem Kirchenbuch St. Lamberti.');
    // Und er kommt auch zurück, nicht nur in die Datei.
    expect(parseGedcom(out).db.notes.get('@N1@')!.text).toBe('Korrigiert: aus dem Taufregister, Seite 214.');
  });

  it('der Edit lässt den un-modellierten Passthrough des Records stehen', () => {
    const doc = parseGedcom(FIXTURE);
    const n = doc.db.notes.get('@N1@')!;
    doc.db.notes.set('@N1@', { ...n, text: 'Neuer Text' });

    const out = schreibe(doc);
    for (const zeile of ['1 CHAN', '2 DATE 3 APR 2026', '1 REFN Non_Duplicates', '1 _VALID Y']) {
      expect(out).toContain(zeile);
    }
  });

  it('ein mehrzeiliger Notiz-Text wird als CONT geschrieben und kommt ganz zurück', () => {
    const doc = parseGedcom(FIXTURE);
    const n = doc.db.notes.get('@N1@')!;
    const mehrzeilig = 'Erster Absatz.\nZweiter Absatz.\nDritter Absatz.';
    doc.db.notes.set('@N1@', { ...n, text: mehrzeilig });

    const out = schreibe(doc);
    expect(out).toContain('0 @N1@ NOTE Erster Absatz.');
    expect(out).toContain('1 CONT Zweiter Absatz.');
    expect(parseGedcom(out).db.notes.get('@N1@')!.text).toBe(mehrzeilig);
  });

  it('ein Text über der Byte-Grenze überlebt (dieselbe Klasse wie BL-378)', () => {
    const doc = parseGedcom(FIXTURE);
    const lang = 'Der alte Duesmannhof war ein Eigentum des Hauses Asbeck. '.repeat(6).trim();
    expect(Buffer.byteLength(lang, 'utf8')).toBeGreaterThan(255);
    doc.db.notes.set('@N1@', { ...doc.db.notes.get('@N1@')!, text: lang });

    const round = parseGedcom(schreibe(doc));
    expect(round.db.notes.get('@N1@')!.text).toBe(lang);
  });

  it('`SNOTE` bleibt `SNOTE` — der Tag ist Modellwissen, keine Vermutung', () => {
    const src = FIXTURE.replace('0 @N1@ NOTE Aus dem', '0 @N1@ SNOTE Aus dem');
    const doc = parseGedcom(src);
    doc.db.notes.set('@N1@', { ...doc.db.notes.get('@N1@')!, text: 'Geändert' });
    expect(schreibe(doc)).toContain('0 @N1@ SNOTE Geändert');
  });

  it('ein neuer Notiz-Record landet im Baum, vor TRLR', () => {
    const doc = parseGedcom(FIXTURE);
    doc.db.notes.set('@N9@', { id: '@N9@', type: 'NOTE', text: 'Frisch angelegt.' });

    const out = schreibe(doc);
    const zeilen = out.split('\r\n');
    expect(zeilen).toContain('0 @N9@ NOTE Frisch angelegt.');
    expect(zeilen.indexOf('0 @N9@ NOTE Frisch angelegt.')).toBeLessThan(zeilen.indexOf('0 TRLR'));
  });

  /**
   * Die Löschsemantik ist eine ENTSCHEIDUNG, keine Selbstverständlichkeit — deshalb steht sie
   * als Test da: ein Record, den das Modell nicht mehr führt, verschwindet aus der Datei,
   * genau wie bei den fünf anderen Record-Arten. Heute ist der Pfad unerreichbar (keine Fläche
   * entfernt etwas aus `db.notes`); er wird es mit BL-382, und dann soll er sich verhalten
   * wie seine Geschwister statt eine eigene Regel zu haben.
   */
  it('ein aus dem Modell entfernter Record fällt aus der Datei (wie bei INDI/FAM/SOUR/REPO/OBJE)', () => {
    const doc = parseGedcom(FIXTURE);
    doc.db.notes.delete('@N2@');
    const out = schreibe(doc);
    expect(out).not.toContain('@N2@');
    expect(out).toContain('0 @N1@ NOTE'); // der andere bleibt
  });

  it('ein von niemandem verwiesener Record bleibt erhalten, solange er im Modell steht', () => {
    // Im Bestand sind 35 der 219 Records unreferenziert (`Testdateien/Unsere Familie 2026-4.ged`).
    // Sie zu verwerfen wäre eine Datenentscheidung, die dieser Bau nicht trifft.
    const doc = parseGedcom(FIXTURE);
    doc.db.notes.set('@N1@', { ...doc.db.notes.get('@N1@')!, text: 'nur der andere wird angefasst' });
    expect(schreibe(doc)).toContain('0 @N2@ NOTE Eine zweite, von niemandem verwiesene Notiz.');
  });
});
