// tests/core/interop-anonymize-doc.test.ts — anonymisierter Export auf DOKUMENT-Ebene
// (Spec 13 §7, BL-138/ADR-v9-113).
//
// Die Nachbardatei interop-anonymize.test.ts prüft die Bausteine (Klassifikation einer
// Person, ein INDI-Record). Hier steht das, was den Export erst brauchbar macht:
//
//   (a) die BFS-BREMSE — ohne sie erreicht die Kante jede zusammenhängende Linie und
//       schwärzt praktisch den ganzen Bestand (gemessen 2767 statt 689 von 2795);
//   (b) FAM-Ereignisdetails lebender Paare (265 reale MARR-Daten blieben stehen);
//   (c) die REINHEIT — läuft der geschwärzte Baum in den App-Zustand zurück, schreibt
//       die stille Arbeitskopie die geschwärzte Fassung und der Export wird zum
//       Datenverlust am Original.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseGedcom, buildLivingSet, anonymizeDoc, child, children, serializeGedcom } from '../../core/interop';

// Die große Orakel-Fixture ist privat und gitignored (Datenschutz + Repo-Größe, s.
// .gitignore: nur *.small.ged wird eingecheckt) — auf dem CI-Runner fehlt sie. Der
// Mengenanker-Block läuft daher NUR lokal (skipIf, dasselbe Muster wie
// gedcom-ancestris.roundtrip.test.ts). Der eigentliche CI-Wächter gegen einen Rückfall
// der BFS-Bremse ist der synthetische „BFS-Bremse"-Block oben (inline-Fixture, kein
// File) — negativ verifiziert: Bremse raus ⇒ er wird rot.
const ANCESTRIS = join(__dirname, '..', 'fixtures', 'MeineDaten_ancestris.ged');
const ancestrisPresent = existsSync(ANCESTRIS);

/**
 * Drei Generationen an EINER Linie: die jüngste lebt, die beiden Vorfahren sind
 * datiert verstorben. Genau die Form, an der die fehlende Bremse sichtbar wird.
 */
const LINIE = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '0 @I1@ INDI',
  '1 NAME Enkel /Jung/',
  '1 SEX M',
  '1 BIRT',
  '2 DATE 1990',
  '1 FAMC @F1@',
  '0 @I2@ INDI',
  '1 NAME Vater /Alt/',
  '1 SEX M',
  '1 BIRT',
  '2 DATE 1900',
  '1 DEAT',
  '2 DATE 1980',
  '1 FAMS @F1@',
  '1 FAMC @F2@',
  '0 @I3@ INDI',
  '1 NAME Mutter /Alt/',
  '1 SEX F',
  '1 BIRT',
  '2 DATE 1905',
  '1 DEAT',
  '2 DATE 1975',
  '1 FAMS @F1@',
  '0 @I4@ INDI',
  '1 NAME Opa /Ur/',
  '1 SEX M',
  '1 BIRT',
  '2 DATE 1870',
  '1 DEAT',
  '2 DATE 1940',
  '1 FAMS @F2@',
  '0 @F1@ FAM',
  '1 HUSB @I2@',
  '1 WIFE @I3@',
  '1 CHIL @I1@',
  '1 MARR',
  '2 DATE 12 MAY 1955',
  '2 PLAC Ochtrup',
  '0 @F2@ FAM',
  '1 HUSB @I4@',
  '1 CHIL @I2@',
  '1 MARR',
  '2 DATE 3 JUN 1899',
  '2 PLAC Metelen',
  '0 TRLR',
].join('\n');

/** Ein lebendes Paar mit Heiratsdatum — der reale Fall hinter Entscheidung 3 (ADR-v9-113). */
const LEBENDES_PAAR = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '0 @I1@ INDI',
  '1 NAME Anna /Jung/',
  '1 SEX F',
  '1 BIRT',
  '2 DATE 1985',
  '1 FAMS @F1@',
  '0 @I2@ INDI',
  '1 NAME Ben /Jung/',
  '1 SEX M',
  '1 BIRT',
  '2 DATE 1983',
  '1 FAMS @F1@',
  '0 @F1@ FAM',
  '1 HUSB @I2@',
  '1 WIFE @I1@',
  '1 MARR',
  '2 DATE 4 JUL 2015',
  '2 PLAC Ochtrup',
  '1 NCHI 2',
  '0 TRLR',
].join('\n');

describe('BFS-Bremse: Propagation läuft nur über UNDATIERTE Verwandte (Spec 13 §7 Phase 2)', () => {
  const { db } = parseGedcom(LINIE);
  const living = buildLivingSet(db, 2026);

  it('der lebende Enkel gilt als lebend', () => {
    expect(living.has('@I1@')).toBe(true);
  });

  it('die datiert verstorbenen Eltern werden NICHT durch Propagation lebend', () => {
    expect(living.has('@I2@')).toBe(false);
    expect(living.has('@I3@')).toBe(false);
  });

  it('und die Kante endet dort — der Urgroßvater dahinter bleibt unberührt', () => {
    expect(living.has('@I4@')).toBe(false);
  });

  it('undatierte Verwandte leiten weiter: eine Lücke in der Linie stoppt die Kante nicht', () => {
    // Vater ohne jedes Datum (Phase 3 → lebend) — seine datierten Eltern bleiben trotzdem tot,
    // aber ein undatierter Großvater dahinter wird über ihn erreicht.
    const mitLuecke = LINIE.replace('1 BIRT\n2 DATE 1900\n1 DEAT\n2 DATE 1980\n', '');
    const l = buildLivingSet(parseGedcom(mitLuecke).db, 2026);
    expect(l.has('@I2@')).toBe(true);
    expect(l.has('@I4@')).toBe(false); // datiert verstorben — die Bremse hält auch hier
  });
});

describe.skipIf(!ancestrisPresent)('Mengenanker am echten Bestand (ADR-v9-113: 689 statt 2767 von 2795)', () => {
  it('MeineDaten_ancestris.ged, Bezugsjahr 2026', () => {
    const text = readFileSync(ANCESTRIS, 'utf8');
    const { db } = parseGedcom(text);
    expect(db.individuals.size).toBe(2795);
    // Die Zahl selbst ist der Nutzen: kippt die Bremse wieder heraus, springt sie auf 2767
    // und dieser Test sagt genau das — statt „irgendetwas hat sich geändert".
    expect(buildLivingSet(db, 2026).size).toBe(689);
  });
});

describe('anonymizeDoc: was geschwärzt wird und was bleibt (Spec 13 §7)', () => {
  const doc = parseGedcom(LEBENDES_PAAR);
  const anon = anonymizeDoc(doc, 2026);
  const rec = (xref: string) => anon.roots.find((r) => r.xref === xref)!;

  it('lebende INDI behalten nur NAME "Lebende Person" + SEX + Familienlinks', () => {
    const i1 = rec('@I1@');
    expect(child(i1, 'NAME')?.value).toBe('Lebende Person');
    expect(child(i1, 'SEX')?.value).toBe('F');
    expect(child(i1, 'FAMS')?.value).toBe('@F1@');
    expect(child(i1, 'BIRT')).toBeNull();
  });

  it('FAM mit lebendem Partner behält HUSB/WIFE/CHIL, verliert aber MARR mit Datum und Ort', () => {
    const f1 = rec('@F1@');
    expect(child(f1, 'HUSB')?.value).toBe('@I2@');
    expect(child(f1, 'WIFE')?.value).toBe('@I1@');
    expect(child(f1, 'MARR')).toBeNull();
    expect(child(f1, 'NCHI')).toBeNull();
  });

  it('Kind-Referenzen bleiben — die Familienstruktur ist kein personenbezogenes Datum', () => {
    const f1 = anonymizeDoc(parseGedcom(LINIE), 2026).roots.find((r) => r.xref === '@F1@')!;
    expect(children(f1, 'CHIL').map((c) => c.value)).toEqual(['@I1@']);
  });

  it('FAM ohne lebenden Partner bleibt unangetastet (referenzgleich, kein Neuaufbau)', () => {
    const d = parseGedcom(LINIE);
    const a = anonymizeDoc(d, 2026);
    const vorher = d.roots.find((r) => r.xref === '@F2@')!;
    const nachher = a.roots.find((r) => r.xref === '@F2@')!;
    expect(nachher).toBe(vorher);
    expect(child(nachher, 'MARR')?.children.find((c) => c.tag === 'DATE')?.value).toBe('3 JUN 1899');
  });

  it('verstorbene Personen und HEAD/TRLR bleiben unangetastet', () => {
    const d = parseGedcom(LINIE);
    const a = anonymizeDoc(d, 2026);
    for (const xref of ['@I2@', '@I3@', '@I4@']) {
      expect(a.roots.find((r) => r.xref === xref)).toBe(d.roots.find((r) => r.xref === xref));
    }
    expect(a.roots[0].tag).toBe('HEAD');
    expect(a.roots.at(-1)!.tag).toBe('TRLR');
    expect(a.roots.length).toBe(d.roots.length);
  });

  it('serialisiert: der echte Name der lebenden Person steht nirgends mehr in den Bytes', () => {
    const text = serializeGedcom(anon, { format: '5.5.1' });
    expect(text).toContain('Lebende Person');
    expect(text).not.toContain('Anna');
    expect(text).not.toContain('4 JUL 2015');
    expect(text).toContain('0 @F1@ FAM');
  });
});

describe('Reinheit: der geschwärzte Baum fließt nie ins Original zurück (ADR-v9-113)', () => {
  it('das übergebene Dokument bleibt unverändert — Original und Arbeitskopie unberührt', () => {
    const doc = parseGedcom(LEBENDES_PAAR);
    const vorher = serializeGedcom(doc, { format: '5.5.1' });
    anonymizeDoc(doc, 2026);
    expect(serializeGedcom(doc, { format: '5.5.1' })).toBe(vorher);
    expect(vorher).toContain('Anna /Jung/');
  });

  it('db wird nicht kopiert und nicht verändert (die Schwärzung lebt allein im Baum)', () => {
    const doc = parseGedcom(LEBENDES_PAAR);
    const a = anonymizeDoc(doc, 2026);
    expect(a.db).toBe(doc.db);
    expect(doc.db.individuals.get('@I1@')!.name).toContain('Anna');
  });

  it('deterministisch: gleiche Eingabe + gleiches Bezugsjahr → gleiche Bytes (TST-3)', () => {
    const doc = parseGedcom(LEBENDES_PAAR);
    const a = serializeGedcom(anonymizeDoc(doc, 2026), { format: '5.5.1' });
    const b = serializeGedcom(anonymizeDoc(doc, 2026), { format: '5.5.1' });
    expect(a).toBe(b);
  });
});
