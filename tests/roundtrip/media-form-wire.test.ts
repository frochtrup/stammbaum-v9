// tests/roundtrip/media-form-wire.test.ts — BL-290 / ADR-v9-207:
// der GEDCOM-`FORM`-Wert überlebt den NEUBAU eines Records, nicht nur das Nichtstun.
//
// WARUM DIESE DATEI. Der Wächter aus `no-silent-normalization.test.ts` misst das
// Speichern OHNE Nutzeränderung — dort bleiben fast alle Records byte-identisch stehen,
// und die Zusicherung sagt entsprechend wenig über den Writer. Der Verlust entsteht erst,
// wenn ein Record tatsächlich neu gebaut wird: dann läuft `Media.form` (kanonisiertes
// MIME, ADR-v9-126) durch die Rückübersetzung, und `JPEG` kommt als `jpg` heraus.
//
// UND WARUM EINE EIGENE FIXTURE. Alle bestehenden Medien-Fixtures tragen `FORM jpg` /
// `FORM pdf` — also genau die Schreibweise, die die Rückübersetzung ohnehin erzeugt. An
// ihnen ist der Verlust unsichtbar (TST-20: „eine Fixture-Familie, die eine Formvariante
// nie enthält, prüft sie auch nicht"). Die Variante steckt im Realbestand, der in CI
// fehlt — deshalb hier eine kleine eingecheckte Datei mit den vier am Bestand belegten
// Klassen: Großschreibung (`JPEG`/`PNG`/`BMP`/`TIFF`), abweichende Endung (`JPEG` an
// `.jpg`, `TIFF` an `.tif`) und die beiden Werte, die überhaupt kein Format bezeichnen
// (`FILE`, `URL` — Ancestris-Eigenheiten, 9× bzw. 1× in `Unsere Familie 2026.ged`).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGedcom, applyDatabaseToRoots, serializeGedcom } from '../../core/interop';
import { gedFormValue } from '../../core/interop/media-mime';
import { assembleLines } from './roundtrip-helpers';
import type { Database } from '../../core/model/types';

const FIXTURE = join(__dirname, '../fixtures/media-form-wire.small.ged');
const src = readFileSync(FIXTURE, 'utf8');

/** Alle `FORM`-Werte der Medien — die HEAD-Zeile `2 FORM LINEAGE-LINKED` gehört nicht dazu. */
function formWerte(text: string): string[] {
  return assembleLines(text)
    .map((z) => /^\d+ FORM (.*)$/.exec(z)?.[1])
    .filter((v): v is string => !!v && v !== 'LINEAGE-LINKED')
    .sort();
}

const speichern = (db: Database, roots: Parameters<typeof serializeGedcom>[0]['roots']): string =>
  serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots) });

/** Macht jeden Record schmutzig — nur dann baut der Writer neu und der FORM-Wert läuft
 *  überhaupt durch die Rückübersetzung. Ein unveränderter Record gibt den Original-Knoten
 *  zurück und beweist nichts. */
function alleRecordsAendern(db: Database): void {
  for (const [id, p] of [...db.individuals]) db.individuals.set(id, { ...p, given: `${p.given}-neu` });
  for (const [id, s] of [...db.sources]) db.sources.set(id, { ...s, title: `${s.title} (neu)` });
  for (const [id, m] of [...db.media]) db.media.set(id, { ...m, title: `${m.title} (neu)` });
}

const ERWARTET = ['BMP', 'FILE', 'JPEG', 'PNG', 'TIFF', 'URL'];

describe('BL-290 — der FORM-Wire-Wert überlebt den Record-Neubau', () => {
  it('die Fixture trägt alle vier Klassen (sonst prüft der Test nichts)', () => {
    expect(formWerte(src)).toEqual(ERWARTET);
  });

  it('Neubau JEDES Records: kein FORM-Wert wird umgeschrieben', () => {
    const p = parseGedcom(src);
    alleRecordsAendern(p.db);
    expect(formWerte(speichern(p.db, p.roots))).toEqual(ERWARTET);
  });

  it('alle vier Positionen sind abgedeckt: Record, Person-OBJE, Ereignis-OBJE, Zitat-OBJE', () => {
    const p = parseGedcom(src);
    alleRecordsAendern(p.db);
    const out = speichern(p.db, p.roots);
    // Jeder Wert steht unter EINEM bestimmten FILE — der Test benennt die Position, damit
    // ein Fehlschlag sagt, welcher Emit-Pfad seinen Wire-Wert verloren hat.
    for (const [datei, form] of [
      ['Pictures/anna.jpg', 'JPEG'],                    // Person-OBJE (inline)
      ['Pictures/hof.bmp', 'FILE'],                     // Person-OBJE, Wert ohne Format
      ['https://data.example.org/kb/1?pg=7', 'URL'],    // Person-OBJE, Weblink
      ['Documents/urkunde.bmp', 'BMP'],                 // Ereignis-OBJE
      ['Pictures/zitat.tif', 'TIFF'],                   // Zitat-OBJE (unter SOUR/PAGE)
      ['Pictures/gemeinsam.png', 'PNG'],                // Top-Level-Record @M1@
    ] as const) {
      const zeilen = assembleLines(out);
      const i = zeilen.findIndex((z) => z.endsWith(` FILE ${datei}`));
      expect(i, `FILE ${datei} fehlt in der Ausgabe`).toBeGreaterThanOrEqual(0);
      expect(zeilen[i + 1], `FORM unter ${datei}`).toMatch(new RegExp(`^\\d+ FORM ${form}$`));
    }
  });

  it('MEDI unter FORM bleibt erhalten (der Wire-Wert verdrängt den Untertag nicht)', () => {
    const p = parseGedcom(src);
    alleRecordsAendern(p.db);
    const zeilen = assembleLines(speichern(p.db, p.roots));
    expect(zeilen).toContain('2 FORM PNG');   // im Record @M1@ (FILE auf Ebene 1)
    expect(zeilen).toContain('3 MEDI PHOTO');
    expect(zeilen).toContain('5 FORM TIFF');  // im Zitat-OBJE (FILE auf Ebene 4)
    expect(zeilen).toContain('6 MEDI photo');
  });

  it('zweimal speichern ändert nichts mehr (out1===out2)', () => {
    const p1 = parseGedcom(src);
    alleRecordsAendern(p1.db);
    const out1 = speichern(p1.db, p1.roots);
    const p2 = parseGedcom(out1);
    const out2 = speichern(p2.db, p2.roots);
    expect(out2).toBe(out1);
  });
});

// Die Gegenprobe: das Feld darf einen Nutzer-Edit nicht einfrieren. Das ist der Fehler,
// den ADR-v9-197 ausdrücklich NICHT machen wollte — ein Freeze gegen automatische
// Reprojektion ist kein Freeze gegen bewusste Änderungen (CLAUDE.md, ADR-v9-81).
describe('BL-290 — der erhaltene Wert weicht einem Nutzer-Edit', () => {
  it('Format geändert (MediaDetail-Feldgruppe): die Rückübersetzung gewinnt', () => {
    const p = parseGedcom(src);
    const m = p.db.media.get('Pictures/anna.jpg')!;
    expect(m.form).toBe('image/jpeg');
    expect(m.formWire).toBe('JPEG');
    p.db.media.set(m.id, { ...m, form: 'application/pdf' });
    const zeilen = assembleLines(speichern(p.db, p.roots));
    expect(zeilen.some((z) => /^\d+ FORM JPEG$/.test(z))).toBe(false);
    // Was STATTDESSEN dasteht, entscheidet `mimeToGedForm` — und das bevorzugt die echte
    // Datei-Endung vor der MIME-Tabelle (ADR-v9-126). Hier also `jpg`, nicht `pdf`: die
    // Datei heißt weiterhin `.jpg`. Geprüft wird die Freigabe des Wire-Werts, nicht diese
    // Vorrangregel — sie ist älter als BL-290 und von ihm unberührt.
    expect(zeilen).toContain('3 FORM jpg');
  });

  it('Datei umbenannt: ein Wire-Wert ohne eigenes Format (`FILE`) verfällt mit der Endung', () => {
    // `FILE` bezog sein Format nur aus `hof.bmp`. Nach der Umbenennung auf `.pdf` bezeichnet
    // es nicht mehr dasselbe wie `Media.form` — genau die Frage, die `gedFormValue` stellt.
    expect(gedFormValue('image/bmp', 'Pictures/hof.bmp', 'FILE')).toBe('FILE');
    expect(gedFormValue('image/bmp', 'Pictures/hof.pdf', 'FILE')).toBe('pdf');
  });

  it('in der App angelegtes Medium (kein Wire-Wert): unverändert die Rückübersetzung', () => {
    expect(gedFormValue('image/jpeg', 'fotos/neu.jpeg', '')).toBe('jpeg');
    expect(gedFormValue('', 'fotos/neu.jpeg', '')).toBe('');
  });
});

// BL-301 — beim Bau von BL-290 aufgefallen und in derselben Naht: die Gegenprobe oben war
// zunächst grün, OBWOHL der Edit die Datei gar nicht erreichte. Ein inline-Medium hat
// keinen eigenen Record; die Dirty-Prüfung des verweisenden Records vergleicht nur die
// `MediaCitation`s und ließ eine Änderung an `db.media` als „unverändert" durchgehen.
describe('BL-301 — ein Edit am inline-Medium erreicht die Datei', () => {
  const edit = (mediaId: string, patch: Record<string, unknown>): string[] => {
    const p = parseGedcom(src);
    const m = p.db.media.get(mediaId)!;
    p.db.media.set(m.id, { ...m, ...patch });
    return assembleLines(speichern(p.db, p.roots));
  };

  it('Person-OBJE: Dateipfad geändert', () => {
    const zeilen = edit('Pictures/anna.jpg', { file: 'Pictures/anna-neu.jpg' });
    expect(zeilen).toContain('2 FILE Pictures/anna-neu.jpg');
  });

  it('Ereignis-OBJE: Medientyp (MEDI) ergänzt', () => {
    const zeilen = edit('Documents/urkunde.bmp', { type: 'PHOTO' });
    expect(zeilen).toContain('5 MEDI PHOTO');
  });

  it('Zitat-OBJE unter SOUR: Format geändert (Wire-Wert `TIFF` fällt)', () => {
    const zeilen = edit('Pictures/zitat.tif', { form: 'application/pdf' });
    expect(zeilen.some((z) => /^\d+ FORM TIFF$/.test(z))).toBe(false);
    expect(zeilen).toContain('5 FORM tif'); // Endung schlägt MIME-Tabelle, s. oben
  });

  it('unangetastet bleibt unangetastet — der Record wird nicht grundlos neu gebaut', () => {
    const p = parseGedcom(src);
    // Zeilenenden/Schluss-Newline sind Sache des Serializers (CRLF, kein Abschluss-\n) —
    // hier interessiert der INHALT: keine einzige Zeile darf sich bewegt haben.
    expect(speichern(p.db, p.roots).replace(/\r\n/g, '\n').trimEnd()).toBe(src.trimEnd());
  });
});

// Die Grenze derselben Naht — und der Grund, warum die Frage aus BL-301 NUR an der
// definierenden Fundstelle gestellt wird. In der 5.5.1-Inline-Form IST die Datei die
// Identität; dieselbe Datei darf aber mehrfach mit abweichenden Untertags dastehen. Der
// erste Bau von `inlineMediaChanged` verglich an JEDER Fundstelle und löschte damit am
// Realbestand eine `FORM URL`-Zeile — eine Änderung, die niemand gemacht hatte.
//
// Die Fixture bildet genau diese Stelle nach (`Unsere Familie 2026.ged`: dieselbe
// Matricula-URL 3× ohne FORM in Zitaten, 1× mit `FORM URL` unter der Quelle). Sie steht
// hier eingecheckt, weil der Realbestand in CI fehlt — gefunden hat den Fall er, halten
// muss ihn eine Datei, die immer da ist.
describe('BL-301 — mehrere Fundstellen derselben Datei widersprechen sich', () => {
  const kollision = readFileSync(join(__dirname, '../fixtures/media-inline-collision.small.ged'), 'utf8');

  it('die Fixture trägt den Widerspruch (sonst prüft der Test nichts)', () => {
    const p = parseGedcom(kollision);
    const m = p.db.media.get('https://data.example.org/kb/KB002_1/?pg=126')!;
    // Die ERSTE Fundstelle definiert — und die trägt kein FORM.
    expect(m.formWire).toBe('');
    expect(assembleLines(kollision).filter((z) => /^\d+ FORM URL$/.test(z))).toHaveLength(1);
  });

  it('Speichern ohne Nutzeränderung lässt die abweichende Fundstelle in Ruhe', () => {
    const p = parseGedcom(kollision);
    expect(speichern(p.db, p.roots).replace(/\r\n/g, '\n').trimEnd()).toBe(kollision.trimEnd());
  });

  it('ein globaler Edit landet an der definierenden Fundstelle, nicht an den übrigen', () => {
    const p = parseGedcom(kollision);
    const m = p.db.media.get('https://data.example.org/kb/KB002_1/?pg=126')!;
    p.db.media.set(m.id, { ...m, file: 'https://data.example.org/kb/KB002_1/?pg=200' });
    const zeilen = assembleLines(speichern(p.db, p.roots));
    expect(zeilen.filter((z) => z.endsWith('?pg=200'))).toHaveLength(1);
    // Die Quelle behält ihre eigene, abweichende Fundstelle samt FORM-Zeile.
    expect(zeilen).toContain('3 FORM URL');
  });
});
