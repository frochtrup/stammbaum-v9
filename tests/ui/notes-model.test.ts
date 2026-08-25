// tests/ui/notes-model.test.ts — BL-381: die Notiz-Sammlung und die Längen-Schwelle.
//
// Headless und ohne DOM (das Modell ist framework-frei). Die Schwelle wird hier als KONTRAKT
// gehalten, nicht als Geschmack: sie ist an der gemessenen Längenverteilung des Bestands
// begründet, und ein späteres Verschieben soll auffallen.
import { describe, it, expect } from 'vitest';
import {
  collectNotes,
  istLangeNotiz,
  notizZeilen,
  notizAnriss,
  NOTIZ_SCHWELLE_ZEILEN,
  ZEICHEN_JE_ZEILE,
} from '../../ui/shell/notes-model';
import { makeDatabase, makePerson, makeNote, makeSource } from '../../core/model/factory';
import type { Database } from '../../core/model/types';

function db(): Database {
  return makeDatabase();
}

describe('BL-381 — collectNotes: alle Notiz-Quellen eines Datensatzes in einer Liste', () => {
  it('sammelt eigene, weitere und verwiesene Notiz in Anzeige-Reihenfolge', () => {
    const d = db();
    d.notes.set('@N1@', makeNote('@N1@', { type: 'NOTE' }));
    d.notes.get('@N1@')!.text = 'Geteilter Text';
    const p = makePerson('@I1@');
    p.noteText = 'Eigene Notiz';
    p.extraNotes = ['Zweite Inline-Notiz'];
    p.noteRefs = ['@N1@'];
    d.individuals.set(p.id, p);

    const notes = collectNotes(d, p);
    expect(notes.map((n) => [n.kind, n.text])).toEqual([
      ['own', 'Eigene Notiz'],
      ['extra', 'Zweite Inline-Notiz'],
      ['shared', 'Geteilter Text'],
    ]);
  });

  it('zählt die ANDEREN Verwender einer geteilten Notiz (die Auskunft vor dem Edit)', () => {
    const d = db();
    d.notes.set('@N1@', makeNote('@N1@', { type: 'NOTE' }));
    d.notes.get('@N1@')!.text = 'Dieselbe Quelle für drei';
    for (const id of ['@I1@', '@I2@', '@I3@']) {
      const p = makePerson(id);
      p.noteRefs = ['@N1@'];
      d.individuals.set(id, p);
    }
    const s = makeSource('@S1@');
    s.noteRefs = ['@N1@'];
    d.sources.set(s.id, s);

    const notes = collectNotes(d, d.individuals.get('@I1@')!);
    expect(notes).toHaveLength(1);
    // Drei weitere: zwei Personen und eine Quelle — der Betrachter selbst zählt nicht mit.
    expect(notes[0].alsoUsedBy).toBe(3);
  });

  it('leere Texte und tote Verweise erzeugen keine Zeile', () => {
    const d = db();
    d.notes.set('@N1@', makeNote('@N1@', { type: 'NOTE' })); // Text bleibt leer
    const p = makePerson('@I1@');
    p.noteText = '   ';
    p.extraNotes = [''];
    p.noteRefs = ['@N1@', '@N_FEHLT@'];
    d.individuals.set(p.id, p);
    expect(collectNotes(d, p)).toEqual([]);
  });

  it('ein Datensatz ohne Verweise löst keinen Durchlauf über den Bestand aus', () => {
    // Beobachtbar am Ergebnis statt an einem Spion: ohne `noteRefs` darf ein Bestand mit
    // Verweisen anderer Personen nichts beisteuern.
    const d = db();
    d.notes.set('@N1@', makeNote('@N1@', { type: 'NOTE' }));
    d.notes.get('@N1@')!.text = 'gehört jemand anderem';
    const fremd = makePerson('@I2@');
    fremd.noteRefs = ['@N1@'];
    d.individuals.set(fremd.id, fremd);
    const p = makePerson('@I1@');
    p.noteText = 'nur die eigene';
    d.individuals.set(p.id, p);

    expect(collectNotes(d, p).map((n) => n.kind)).toEqual(['own']);
  });
});

describe('BL-381 — die Längen-Schwelle', () => {
  it('kurze Notiz braucht keinen Aufklapper, lange schon', () => {
    expect(istLangeNotiz('Magendurchbruch nach Magengeschwür')).toBe(false);
    expect(istLangeNotiz('x'.repeat(ZEICHEN_JE_ZEILE * NOTIZ_SCHWELLE_ZEILEN))).toBe(false);
    expect(istLangeNotiz('x'.repeat(ZEICHEN_JE_ZEILE * NOTIZ_SCHWELLE_ZEILEN + 1))).toBe(true);
  });

  it('eigene Zeilenumbrüche zählen als Zeilen — sie sind bei den langen Notizen die Regel', () => {
    expect(notizZeilen('eins\nzwei\ndrei')).toBe(3);
    expect(istLangeNotiz('a\nb\nc\nd')).toBe(false);
    expect(istLangeNotiz('a\nb\nc\nd\ne')).toBe(true);
    // Eine leere Zeile ist eine Zeile (Absatztrenner), sonst zählte ein Absatz zu wenig.
    expect(notizZeilen('a\n\nb')).toBe(3);
  });

  it('die Schwelle passt zum Bestand: die typische Notiz klappt NICHT auf', () => {
    // Mediane aus `Testdateien/Unsere Familie 2026-4.ged` (BL-381): Ereignis 10, geteilt 32,
    // Person 84 Zeichen. Alle drei müssen unter der Schwelle bleiben — sonst wäre sie falsch
    // gewählt und die Mechanik träfe den Regelfall statt der Ausnahme.
    for (const laenge of [10, 32, 84]) expect(istLangeNotiz('w'.repeat(laenge))).toBe(false);
    // Der längste Record des Bestands (783 Zeichen) klappt auf.
    expect(istLangeNotiz('w'.repeat(783))).toBe(true);
  });

  it('der Anriss nimmt die erste eigene Zeile und zerreißt kein Wort', () => {
    expect(notizAnriss('[Hof] Der alte Duesmannhof\nZweiter Absatz')).toBe('[Hof] Der alte Duesmannhof');
    const lang = 'Der alte Duesmannhof war ein Eigentum des Hauses Asbeck und lag westlich';
    const anriss = notizAnriss(lang);
    expect(anriss.endsWith('…')).toBe(true);
    expect(anriss.length).toBeLessThanOrEqual(ZEICHEN_JE_ZEILE + 1);
    expect(lang.startsWith(anriss.slice(0, -1))).toBe(true); // kein erfundener Text
    expect(anriss).not.toContain('  ');
  });

  it('ZEICHEN_JE_ZEILE ist der im Browser gemessene Wert (Kontrakt, kein Gefühl)', () => {
    // Verschiebt eine Schriftänderung die Zeilenbreite, muss diese Zahl neu gemessen werden —
    // der Test hält fest, dass sie überhaupt eine Messung ist (BL-381, ADR-v9-91).
    expect(ZEICHEN_JE_ZEILE).toBe(46);
  });
});
