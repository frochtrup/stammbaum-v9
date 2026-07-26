// tests/core/media-form-canonical.test.ts — Input-Kanonisierung Media.form → MIME (ADR-v9-126).
// Narrow-Waist: GEDCOM (Endung) UND GRAMPS (MIME) landen als DASSELBE kanonische MIME im
// Modell; die native GEDCOM-Ausgabe schreibt es verlustfrei zur Datei-Endung zurück.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGedcom, serializeGedcom, applyDatabaseToRoots, parseXMLText } from '../../core/interop';
import { formToMime, mimeToGedForm } from '../../core/interop/media-mime';
import { savePerson } from '../../core/model';

const GED = readFileSync(join(__dirname, '../fixtures/media.small.ged'), 'utf8');
const GRAMPS = readFileSync(join(__dirname, '../fixtures/media.small.gramps'), 'utf8');

describe('Media.form Input-Kanonisierung → MIME (ADR-v9-126)', () => {
  it('GEDCOM-Endung und GRAMPS-MIME ergeben dasselbe kanonische MIME', () => {
    const ged = parseGedcom(GED).db;
    const gramps = parseXMLText(GRAMPS).db;
    // GEDCOM `jpg` → image/jpeg; GRAMPS `image/jpeg` → image/jpeg. EIN Modellwert.
    expect(ged.media.get('fotos/anna.jpg')!.form).toBe('image/jpeg');
    expect(gramps.media.get('O0000')!.form).toBe('image/jpeg');
    expect(ged.media.get('scans/urkunde.pdf')!.form).toBe('application/pdf');
  });

  it('native GEDCOM-Ausgabe bleibt verbatim (unveränderte Records)', () => {
    const out = serializeGedcom(parseGedcom(GED));
    expect(out).toContain('3 FORM jpg'); // Datei unverändert → Passthrough, keine MIME-Leckage
    expect(out).not.toContain('image/jpeg');
  });

  it('editierter Owner: FORM wird verlustfrei aus dem Dateinamen zur Endung zurückgeschrieben', () => {
    const doc = parseGedcom(GED);
    const p = structuredClone(doc.db.individuals.get('@I1@')!);
    p.given = 'Annette';
    doc.db.individuals = savePerson(doc.db.individuals, p);
    const out = serializeGedcom({ db: doc.db, roots: applyDatabaseToRoots(doc.db, doc.roots) });
    expect(out).toContain('3 FORM jpg'); // MIME→Endung über den echten Dateinamen
    expect(out).not.toContain('image/jpeg');
  });

  it('formToMime/mimeToGedForm: Kanten (leer bleibt leer, MIME bleibt, Endung erhält Schreibweise)', () => {
    expect(formToMime('', 'x.jpg')).toBe('');            // kein Erfinden bei leerem FORM
    expect(formToMime('jpeg', 'x.jpeg')).toBe('image/jpeg');
    expect(formToMime('image/png', 'x.png')).toBe('image/png'); // schon MIME → unverändert
    expect(mimeToGedForm('', 'x.jpg')).toBe('');
    expect(mimeToGedForm('image/jpeg', 'Foto.BMP')).toBe('BMP'); // echte Datei-Endung gewinnt (Schreibweise)
    expect(mimeToGedForm('application/pdf', 'nofile')).toBe('pdf'); // ohne Endung → Tabelle
  });
});
