// tests/core/interop-ged7.test.ts — GED7-Downgrade/Export (Spec 13 §4, GEDCOM.md §2).

import { describe, it, expect } from 'vitest';
import { parseGedcom, serializeGedcom } from '../../core/interop';
import { ged7Role } from '../../core/interop/ged7-adapter';

function logical(text: string): string[] {
  return text.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
}

const SRC = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '2 FORM LINEAGE-LINKED',
  '1 CHAR UTF-8',
  '0 @I1@ INDI',
  '1 NAME A /B/',
  '1 REFN 12345',
  '2 TYPE alt-id',
  '1 NOTE Kein bekanntes Ereignis: BIRT',
  '1 ASSO @I2@',
  '2 RELA Pate',
  '1 _TRAN Übersetzter Name',
  '0 @N1@ NOTE geteilte Notiz',
  '0 TRLR',
].join('\n');

describe('GED7-Export (opt-in, Spec 13 §4)', () => {
  const out = logical(serializeGedcom(parseGedcom(SRC), { format: '7.0' }));

  it('GEDC/VERS wird 7.0', () => {
    expect(out).toContain('2 VERS 7.0');
    expect(out).not.toContain('2 VERS 5.5.1');
  });

  it('CHAR UTF-8 und FORM LINEAGE-LINKED entfallen im HEAD', () => {
    expect(out).not.toContain('1 CHAR UTF-8');
    expect(out).not.toContain('2 FORM LINEAGE-LINKED');
  });

  it('REFN + TYPE → EXID + TYPE', () => {
    expect(out).toContain('1 EXID 12345');
    expect(out).toContain('2 TYPE alt-id');
    expect(out).not.toContain('1 REFN 12345');
  });

  it('NOTE "Kein bekanntes Ereignis: BIRT" → NO BIRT', () => {
    expect(out).toContain('1 NO BIRT');
    expect(out).not.toContain('1 NOTE Kein bekanntes Ereignis: BIRT');
  });

  it('ASSO/RELA → ASSO/ROLE als ENUM, Wortlaut in PHRASE (BL-241)', () => {
    // `ROLE` ist in GEDCOM 7 eine Enumeration (gedcom.io/terms/v7/enumset-ROLE) —
    // „Pate" ist kein zulässiger Wert. Der Enum-Wert kodiert, die PHRASE bewahrt.
    expect(out).toContain('2 ROLE GODP');
    expect(out).toContain('3 PHRASE Pate');
    expect(out).not.toContain('2 ROLE Pate');
    expect(out).not.toContain('2 RELA Pate');
  });

  it('_TRAN → TRAN', () => {
    expect(out).toContain('1 TRAN Übersetzter Name');
    expect(out).not.toContain('1 _TRAN Übersetzter Name');
  });

  it('geteilte 0-Level-NOTE → SNOTE', () => {
    expect(out).toContain('0 @N1@ SNOTE geteilte Notiz');
  });

  it('GED5-Standardausgabe bleibt unverändert (Regressions-Guard)', () => {
    const ged5 = logical(serializeGedcom(parseGedcom(SRC)));
    expect(ged5).toContain('2 VERS 5.5.1');
    expect(ged5).toContain('1 REFN 12345');
    expect(ged5).toContain('1 NOTE Kein bekanntes Ereignis: BIRT');
    expect(ged5).toContain('2 RELA Pate');
  });
});

// --- ROLE ist eine Enumeration (BL-241) -------------------------------------------------
// Die Liste stammt aus der öffentlichen Definition (gedcom.io/terms/v7/enumset-ROLE), nicht
// aus dem Gedächtnis — dieselbe Lehre wie ADR-v9-124: eine Bestandsdatei zeigt „kommt vor",
// nie „ist zulässig".
describe('GED7 ASSO/ROLE — Enum statt Freitext (BL-241)', () => {
  const ROLE_ENUM = [
    'CHIL', 'CLERGY', 'FATH', 'FRIEND', 'GODP', 'HUSB', 'MOTH', 'MULTIPLE',
    'NGHBR', 'OFFICIATOR', 'PARENT', 'SPOU', 'WIFE', 'WITN', 'OTHER',
  ];

  it('bildet JEDES Preset der Assoziations-Eingabe auf einen zulässigen Enum-Wert ab', () => {
    // Die acht Presets aus ui/views/person/PersonAssociations.svelte — sie sind der
    // realistische Eingabeweg und allesamt deutscher Klartext.
    const presets = ['Taufpate', 'Taufpatin', 'Zeuge', 'Zeugin', 'Informant', 'Freund', 'Freundin', 'Bekannte(r)'];
    for (const p of presets) {
      const { role, phrase } = ged7Role(p);
      expect(ROLE_ENUM).toContain(role);
      // Verlustfrei: der Wortlaut überlebt in der PHRASE.
      expect(phrase).toBe(p);
    }
  });

  it('kodiert Bekanntes und lässt Unbekanntes ehrlich auf OTHER fallen', () => {
    expect(ged7Role('Taufpate').role).toBe('GODP');
    expect(ged7Role('godmother').role).toBe('GODP');
    expect(ged7Role('Trauzeugin').role).toBe('WITN');
    expect(ged7Role('Informant').role).toBe('OTHER');
    expect(ged7Role('Bekannte(r)').role).toBe('OTHER');
  });

  it('lässt einen bereits gültigen Enum-Wert unverändert und ohne PHRASE', () => {
    // Sonst wüchse bei jedem GED7→GED7-Durchlauf eine redundante PHRASE-Zeile nach.
    expect(ged7Role('GODP')).toEqual({ role: 'GODP', phrase: null });
    expect(ged7Role('OTHER')).toEqual({ role: 'OTHER', phrase: null });
  });

  it('liest den Wortlaut aus der PHRASE zurück, nicht das Enum', () => {
    const src = [
      '0 HEAD', '1 GEDC', '2 VERS 7.0',
      '0 @I1@ INDI', '1 ASSO @I2@', '2 ROLE GODP', '3 PHRASE Taufpate',
      '0 @I2@ INDI', '0 TRLR', '',
    ].join('\n');
    const { db } = parseGedcom(src);
    expect(db.individuals.get('@I1@')!.associations[0].role).toBe('Taufpate');
  });

  it('ohne PHRASE bleibt der Enum-Wert die Rolle', () => {
    const src = [
      '0 HEAD', '1 GEDC', '2 VERS 7.0',
      '0 @I1@ INDI', '1 ASSO @I2@', '2 ROLE WITN',
      '0 @I2@ INDI', '0 TRLR', '',
    ].join('\n');
    const { db } = parseGedcom(src);
    expect(db.individuals.get('@I1@')!.associations[0].role).toBe('WITN');
  });
});

// BL-242: GEDCOM 7 kennt zwei Sorten Extension-Tags. Ein `_`-Tag OHNE SCHMA-Eintrag ist
// ein „undokumentierter" Tag — erlaubt, aber die öffentliche Spec empfiehlt ausdrücklich,
// keine zu verwenden: seine Bedeutung ist nur datei-lokal. Erst die URI im SCHMA-Block
// gibt ihm eine Identität über die Datei hinaus.
describe('GED7-SCHMA: die eigenen `_`-Tags werden deklariert (BL-242)', () => {
  const MIT_EXT = [
    '0 HEAD',
    '1 GEDC',
    '2 VERS 5.5.1',
    '2 FORM LINEAGE-LINKED',
    '1 CHAR UTF-8',
    '0 @I1@ INDI',
    '1 NAME A /B/',
    '1 _UID ABC',
    '1 BIRT',
    '2 SOUR @S1@',
    '3 _EVAL',
    '4 _STYP original',
    '4 _EVID direct',
    '0 TRLR',
  ].join('\n');

  const out = logical(serializeGedcom(parseGedcom(MIT_EXT), { format: '7.0' }));

  it('schreibt einen SCHMA-Block im HEAD', () => {
    expect(out).toContain('1 SCHMA');
    // …und zwar genau einen.
    expect(out.filter((l) => l === '1 SCHMA')).toHaveLength(1);
  });

  it('deklariert JEDEN tatsächlich geschriebenen `_`-Tag genau einmal', () => {
    const deklariert = out.filter((l) => l.startsWith('2 TAG ')).map((l) => l.split(' ')[2]);
    expect(new Set(deklariert)).toEqual(new Set(['_UID', '_EVAL', '_STYP', '_EVID']));
    expect(deklariert).toHaveLength(4); // keine Dubletten trotz mehrfachen Vorkommens
  });

  it('jede Deklaration trägt eine URI (sonst wäre der Tag weiter undokumentiert)', () => {
    for (const l of out.filter((l) => l.startsWith('2 TAG '))) {
      expect(l).toMatch(/^2 TAG _[A-Z0-9]+ https:\/\/\S+$/);
    }
  });

  it('deklariert NUR was wirklich dasteht — nicht eine gepflegte Wunschliste', () => {
    // Die v8-Fassung schrieb eine feste 29er-Liste; sie deklarierte damit Tags, die in
    // der Datei gar nicht vorkommen, und verfehlte die seither hinzugekommenen.
    const deklariert = out.filter((l) => l.startsWith('2 TAG ')).map((l) => l.split(' ')[2]);
    for (const tag of deklariert) {
      expect(out.some((l) => l.includes(` ${tag}`) && !l.startsWith('2 TAG '))).toBe(true);
    }
    expect(deklariert).not.toContain('_RUFNAME');
  });

  it('GEDC bleibt die erste HEAD-Unterstruktur (Empfehlung der Spec)', () => {
    const head = out.slice(0, out.findIndex((l) => l.startsWith('0 @')));
    expect(head[1]).toBe('1 GEDC');
  });

  it('ohne `_`-Tags entsteht KEIN leerer SCHMA-Block', () => {
    const ohne = logical(
      serializeGedcom(
        parseGedcom(['0 HEAD', '1 GEDC', '2 VERS 5.5.1', '0 @I1@ INDI', '1 NAME A /B/', '0 TRLR'].join('\n')),
        { format: '7.0' },
      ),
    );
    expect(ohne).not.toContain('1 SCHMA');
    expect(ohne.some((l) => l.startsWith('2 TAG '))).toBe(false);
  });

  it('der SCHMA-Block erscheint NUR in GED7 — nicht in 5.5.1, nicht in Strict', () => {
    const ged5 = logical(serializeGedcom(parseGedcom(MIT_EXT), { format: '5.5.1' }));
    const strict = logical(serializeGedcom(parseGedcom(MIT_EXT), { format: 'strict' }));
    expect(ged5).not.toContain('1 SCHMA');
    expect(strict).not.toContain('1 SCHMA');
    // Strict wirft die `_`-Tags ohnehin weg — es gäbe nichts zu deklarieren.
    expect(strict.some((l) => l.includes('_EVAL'))).toBe(false);
  });

  it('ist stabil: ein zweiter Durchlauf erzeugt keinen zweiten Block', () => {
    // GED7-Ausgabe erneut parsen und wieder als GED7 schreiben — der SCHMA-Block darf
    // weder doppelt erscheinen noch sich selbst als `_`-Tag deklarieren.
    const wieder = logical(serializeGedcom(parseGedcom(out.join('\n')), { format: '7.0' }));
    expect(wieder.filter((l) => l === '1 SCHMA')).toHaveLength(1);
    expect(wieder.filter((l) => l.startsWith('2 TAG '))).toHaveLength(4);
  });
});
