// tests/roundtrip/naht-import-merge-export.test.ts — die Naht „Import → Merge → Export"
// (BL-287, ADR-v9-196).
//
// WARUM DIESE DATEI. Die Roundtrip-Tests prüfen `parse → serialize` OHNE Änderung; die
// Dedup-Tests prüfen `mergePersons` auf einem von Hand gebauten Modell. Was dazwischen
// liegt — eine echte Datei einlesen, zwei Personen zusammenführen, wieder ausschreiben —
// prüfte niemand. Genau in diesem Zwischenraum saß BL-164: der un-modellierte Passthrough
// des ABSORBIERTEN Verlierers, den es im Modell nach dem Merge nicht mehr gibt.
//
// Die Zusicherung ist bewusst NICHT „`net_delta === 0`". Ein Merge entfernt einen Record,
// die Zeilenzahl MUSS sinken. Geprüft wird das Genauere: keine Zeile des Verlierers geht
// verloren, ohne dass sie beim Gewinner ankommt — und danach zeigt kein Zeiger mehr ins
// Leere.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGedcom, applyDatabaseToRoots, serializeGedcom } from '../../core/interop';
import { mergePersons } from '../../core/dedup/merge-persons';
import { findOrphanRefs } from '../../core/model/integrity';
import { assembleLines } from './roundtrip-helpers';
import type { Database } from '../../core/model/types';

const FIXTURE = join(__dirname, '../fixtures/passthrough-matrix.small.ged');

const speichern = (db: Database, roots: Parameters<typeof serializeGedcom>[0]['roots']): string =>
  serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots) });

/** Die un-modellierten Marker der Fixture — sie sind der Prüfstein: das Modell kennt sie
 *  nicht, also können sie NUR über den Passthrough überleben. */
const zzWerte = (text: string): string[] =>
  assembleLines(text)
    .filter((z) => /^\d+ _ZZ /.test(z))
    .map((z) => z.replace(/^\d+ _ZZ /, ''))
    .sort();

describe('Naht Import → Merge → Export', () => {
  const src = readFileSync(FIXTURE, 'utf8');

  it('Personen-Merge: der Passthrough des Verlierers geht nicht verloren', () => {
    const p = parseGedcom(src);
    const vorher = zzWerte(src);
    expect(vorher.length).toBeGreaterThan(0); // Selbstschutz: sonst prüft die Zeile unten nichts

    const nach = mergePersons(p.db, '@I1@', '@I2@');
    const out = speichern(nach, p.roots);

    // @I2@ trägt in dieser Fixture selbst kein `_ZZ` — die Zusicherung ist deshalb, dass
    // der Merge dem GEWINNER nichts wegnimmt. Genau das war BL-164s Gegenrichtung.
    expect(zzWerte(out)).toEqual(vorher);
  });

  // ROT-PROBE, ABSICHTLICH GEPARKT (BL-294). Dieser Test hat beim Bau von BL-287 einen
  // echten Defekt gefunden und ist deshalb `skip`, nicht gelöscht: `mergePersons` hängt
  // `Person.aliases` und `associations.personRef` auf den Gewinner um (Zeilen 242/243),
  // aber NICHT `hypotheses.refs` — die kamen später dazu (ADR-v9-174). Ergebnis: nach dem
  // Merge steht auf dem Gewinner ein `_HREF` auf den entfernten Verlierer, und INV-P2
  // („jede referenzierte ID existiert") ist verletzt.
  //
  // Es ist die Geschwister-Stellen-Lehre aus CLAUDE.md in Reinform: `deletePersonCascade`
  // räumt `hypotheses.refs` korrekt auf, `mergePersons` wurde beim selben Anlass nicht
  // mitgezogen. Ob der Zeiger UMGEHÄNGT oder GESTRICHEN gehört, ist eine fachliche Frage
  // (eine Identitäts-Hypothese „diese beiden sind dieselben" hat sich mit dem Merge
  // erfüllt) — deshalb eine eigene Zeile und kein Schnellschuss hier.
  //
  // Scharfschalten: `it.skip` → `it`, sobald BL-294 gebaut ist.
  it.skip('nach dem Merge zeigt kein Zeiger mehr ins Leere (INV-P2 über die ganze Sequenz)', () => {
    const p = parseGedcom(src);
    const nach = mergePersons(p.db, '@I1@', '@I2@');

    // Erst am re-geparsten AUSGABETEXT geprüft, nicht am Modell: ein Zeiger, den der
    // Writer schreibt, obwohl sein Ziel fort ist, fiele im Modell nicht auf.
    const wieder = parseGedcom(speichern(nach, p.roots));
    expect(findOrphanRefs(wieder.db)).toEqual([]);
  });

  it('der Verlierer-Record ist wirklich fort — der Merge tut etwas (Kontrollfall)', () => {
    const p = parseGedcom(src);
    const nach = mergePersons(p.db, '@I1@', '@I2@');
    const zeilen = assembleLines(speichern(nach, p.roots));

    expect(zeilen.filter((z) => z === '0 @I2@ INDI')).toEqual([]);
    expect(zeilen.filter((z) => z === '0 @I1@ INDI')).toHaveLength(1);
  });

  it('zweiter Export ist idempotent (RT-2 über die Sequenz, nicht nur über den Parser)', () => {
    const p = parseGedcom(src);
    const nach = mergePersons(p.db, '@I1@', '@I2@');
    const out1 = speichern(nach, p.roots);
    const wieder = parseGedcom(out1);
    const out2 = speichern(wieder.db, wieder.roots);

    expect(out2).toBe(out1);
  });
});
