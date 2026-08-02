// tests/roundtrip/gedcom-untagged.roundtrip.test.ts — RT-1/RT-2 auf einer Datei OHNE
// `GIVN`/`SURN`-Untertags, plus der Editier-Pfad (Spec 13 §1/§2.1, ADR-v9-112).
//
// WARUM DIESE DATEI EXISTIERT: alle bisherigen Fixtures (mini.small.ged, demo.ged,
// MeineDaten_ancestris.ged) tragen die Untertags nahezu durchgängig — deshalb hat KEIN
// Test je bemerkt, dass `Person.given`/`Person.surname` bei der verbreiteten Form
// `1 NAME Anna /Decker/` leer blieben (dreimal aufgetreten: BL-108, ADR-v9-18, und der
// hier behobene Anlass). Die Fixture führt den untagged-Fall als eigene Vertragsfläche.
//
// Die beiden Hälften des Vertrags:
//   (a) UNBERÜHRT laden→schreiben ⇒ net_delta=0. Die Zerlegung darf NIEMALS in einen
//       nicht editierten Record lecken — das ist die eigentliche LP-1-Zusicherung.
//   (b) EDITIERT ⇒ der Edit kommt konsistent in der Datei an. Ein bewusster Nutzer-Edit
//       ist keine automatische Änderung; LP-1 schützt vor Letzterem, nicht vor Ersterem
//       (ADR-v9-81-Lehre, ADR-v9-112 §Diskussion). Seit BL-304/ADR-v9-210 heißt das:
//       er landet im `NAME`-Wert, und die Untertags entstehen NICHT erst durch ihn.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGedcom, serializeGedcom, applyDatabaseToRoots } from '../../core/interop';
import { savePerson } from '../../core/model';
import { assembleLines, calcNetDelta, firstDiff } from './roundtrip-helpers';

const UNTAGGED = readFileSync(join(__dirname, '../fixtures/mini.untagged.small.ged'), 'utf8');

describe('(a) unberührt: die Zerlegung leckt nicht in die Datei', () => {
  it('RT-1: out1 === out2 (Byte-Idempotenz)', () => {
    const out1 = serializeGedcom(parseGedcom(UNTAGGED));
    const out2 = serializeGedcom(parseGedcom(out1));
    expect(firstDiff(out1, out2)).toBeNull();
    expect(out1).toBe(out2);
  });

  it('RT-2: net_delta === 0 gegen die Ur-Quelle', () => {
    const out1 = serializeGedcom(parseGedcom(UNTAGGED));
    expect(calcNetDelta(UNTAGGED, out1).normDelta).toBe(0);
  });

  it('kein GIVN/SURN erscheint, obwohl das Modell beide Felder trägt', () => {
    const doc = parseGedcom(UNTAGGED);
    expect(doc.db.individuals.get('@I1@')?.given).toBe('Theodor Hermann'); // Modell: gefüllt
    const logical = assembleLines(serializeGedcom(doc));
    expect(logical).toContain('1 NAME Theodor Hermann /Zurloh/');
    expect(logical.some((l) => /^2 (GIVN|SURN)\b/.test(l))).toBe(false); // Datei: unverändert
  });

  it('auch der Write-Back-Pfad (ohne Edit) lässt die Datei unangetastet', () => {
    const doc = parseGedcom(UNTAGGED);
    const out = serializeGedcom({ db: doc.db, roots: applyDatabaseToRoots(doc.db, doc.roots) });
    expect(calcNetDelta(UNTAGGED, out).normDelta).toBe(0);
    expect(assembleLines(out).some((l) => /^2 (GIVN|SURN)\b/.test(l))).toBe(false);
  });
});

describe('(b) editiert: der Nutzer-Edit kommt konsistent in der Datei an', () => {
  // PRÄZISIERT MIT BL-304 (ADR-v9-210). Die Zusicherung war und bleibt „der Edit kommt
  // KONSISTENT an" — bis dahin geprüft daran, dass `NAME`, `GIVN` und `SURN` denselben
  // Namen tragen. Genau diese Form war das Problem: an einem Record, dessen Quelle die
  // Untertags nie hatte, entstanden sie erst durch den Edit (am Realbestand 200 Zeilen).
  // Konsistenz braucht sie nicht — sie entsteht hier dadurch, dass die Datei den Namen
  // GENAU EINMAL nennt. Geprüft wird deshalb, was die Zusicherung eigentlich meint:
  // der Edit ist da, er ist eindeutig, und der Re-Parse liefert dasselbe Modell zurück.
  it('Nachname-Umbenennung kommt eindeutig in der Datei an — ohne erfundene Untertags', () => {
    const doc = parseGedcom(UNTAGGED);
    const p = doc.db.individuals.get('@I1@')!;
    doc.db.individuals = savePerson(doc.db.individuals, {
      ...p,
      surname: 'Zurloh-Meyer',
      name: 'Theodor Hermann /Zurloh-Meyer/',
    });
    const out = serializeGedcom({ db: doc.db, roots: applyDatabaseToRoots(doc.db, doc.roots) });
    const logical = assembleLines(out);
    expect(logical).toContain('1 NAME Theodor Hermann /Zurloh-Meyer/');
    // Der Edit steht in der Zeile, die ihn trägt — und nicht ein zweites Mal daneben.
    expect(logical.some((l) => /^2 (GIVN|SURN)\b/.test(l))).toBe(false);
    // Der alte NAME-Wert des EDITIERTEN Records überlebt nicht. (Der gleichnamige
    // Sohn @I3@ behält seinen `/Zurloh/` zu Recht — er wurde nicht editiert.)
    expect(logical).not.toContain('1 NAME Theodor Hermann /Zurloh/');
    // Und die Probe darauf, dass „eindeutig" auch „vollständig" heißt: der Re-Parse
    // liefert Vor- und Nachnamen unverändert zurück, obwohl keine Untertag-Zeile da ist.
    const wieder = parseGedcom(out).db.individuals.get('@I1@')!;
    expect({ given: wieder.given, surname: wieder.surname })
      .toEqual({ given: 'Theodor Hermann', surname: 'Zurloh-Meyer' });
  });

  it('nicht editierte Geschwister-Records bleiben untagged', () => {
    const doc = parseGedcom(UNTAGGED);
    const p = doc.db.individuals.get('@I1@')!;
    doc.db.individuals = savePerson(doc.db.individuals, {
      ...p,
      surname: 'Zurloh-Meyer',
      name: 'Theodor Hermann /Zurloh-Meyer/',
    });
    const logical = assembleLines(
      serializeGedcom({ db: doc.db, roots: applyDatabaseToRoots(doc.db, doc.roots) }),
    );
    expect(logical).toContain('1 NAME Elisabeth /Wellmann/');
    expect(logical.some((l) => l === '2 SURN Wellmann')).toBe(false);
  });

  it('INV-PT: Passthrough des editierten Records überlebt', () => {
    const doc = parseGedcom(UNTAGGED);
    const p = doc.db.individuals.get('@I1@')!;
    doc.db.individuals = savePerson(doc.db.individuals, {
      ...p,
      surname: 'Zurloh-Meyer',
      name: 'Theodor Hermann /Zurloh-Meyer/',
    });
    const logical = assembleLines(
      serializeGedcom({ db: doc.db, roots: applyDatabaseToRoots(doc.db, doc.roots) }),
    );
    expect(logical).toContain('1 _WEIRD unbekannter passthrough tag');
  });
});
