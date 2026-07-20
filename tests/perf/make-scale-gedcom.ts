// tests/perf/make-scale-gedcom.ts — deterministischer Generator für Skalen-Fixtures
// (Spec 30 §1: "v8 verifiziert bis 20.000 Personen"; v8-Vorbild `generate-scale-test.js`).
//
// Bewusst KEINE eingecheckte 20k-Fixture: die Datei wäre mehrere MB groß, würde das
// Repo aufblähen und bei jeder Modell-Änderung veralten. Der Generator ist stattdessen
// Teil des Tests — reproduzierbar über einen festen Seed (kein Math.random, sonst
// schwankt die Messgrundlage von Lauf zu Lauf und das Gate wird unbrauchbar).
//
// Die erzeugten Daten sind absichtlich REALISTISCH SCHWER für den Orts-/Hof-Pfad, nicht
// nur groß: Schreibvarianten desselben Dorfs, mehrstufige Verwaltungsketten, Hof-Adressen
// in RESI-Ereignissen. Ein Generator mit 20.000 mal demselben PLAC-String würde den
// Seed-/Resolver-Pfad (den teuersten Teil, Spec 11 §4.2) trivial durchlaufen lassen und
// eine Performance vortäuschen, die bei echten Daten nicht existiert.

/** Kleiner, deterministischer PRNG (mulberry32) — fester Seed = feste Fixture. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VORNAMEN = [
  'Johann', 'Anna', 'Heinrich', 'Maria', 'Wilhelm', 'Catharina', 'Friedrich',
  'Elisabeth', 'Hermann', 'Margaretha', 'Bernhard', 'Gertrud',
];
const NACHNAMEN = [
  'Ahlvers', 'Albers', 'Decker', 'Rohtrup', 'Sassenberg', 'Meyer', 'Schulte',
  'Brinkmann', 'Wessling', 'Hagedorn',
];

/** Dorf + Schreibvarianten + mehrstufige Verwaltungskette (der teure Resolver-Fall). */
const ORTE: ReadonlyArray<{ varianten: readonly string[]; kette: string }> = [
  { varianten: ['Röddensen', 'Roeddensen', 'Röddens.'], kette: 'Amt Burgdorf (Hannover), Kurfürstentum Hannover, Heiliges Römisches Reich Deutscher Nation' },
  { varianten: ['Sassenberg', 'Sassenbergk'], kette: 'Amt Sassenberg, Fürstbistum Münster, Heiliges Römisches Reich Deutscher Nation' },
  { varianten: ['Ochtrup', 'Ochtrupp'], kette: 'Amt Ochtrup, Kreis Steinfurt, Provinz Westfalen, Königreich Preußen' },
  { varianten: ['Neuenkirchen'], kette: 'Kreis Steinfurt, Provinz Westfalen, Königreich Preußen' },
  { varianten: ['Vechta', 'Vechte'], kette: 'Amt Vechta, Fürstbistum Münster, Heiliges Römisches Reich Deutscher Nation' },
  { varianten: ['Steinwedel'], kette: 'Amt Burgdorf (Hannover), Kurfürstentum Braunschweig-Lüneburg, Heiliges Römisches Reich Deutscher Nation' },
];

const HOF_STRASSEN = ['Hofstelle', 'Kirchweg', 'Mühlenstraße', 'Am Esch', 'Bauerschaft'];

export interface ScaleGedcom {
  text: string;
  personCount: number;
  familyCount: number;
}

/**
 * Erzeugt eine GEDCOM-5.5.1-Datei mit `personCount` Personen, generationsweise zu
 * Familien verbunden (jede Familie ~4 Kinder), inkl. BIRT/DEAT/RESI mit Orten und
 * Hof-Adressen.
 */
export function makeScaleGedcom(personCount: number, seed = 20_000): ScaleGedcom {
  const rng = makeRng(seed);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

  const lines: string[] = [
    '0 HEAD',
    '1 SOUR Stammbaum-v9-ScaleTest',
    '1 GEDC',
    '2 VERS 5.5.1',
    '2 FORM LINEAGE-LINKED',
    '1 CHAR UTF-8',
  ];

  // Personen
  for (let i = 1; i <= personCount; i += 1) {
    const ort = pick(ORTE);
    const variante = pick(ort.varianten);
    const plac = `${variante}, ${ort.kette}`;
    const geburtsjahr = 1650 + Math.floor(rng() * 300);

    lines.push(`0 @I${i}@ INDI`);
    lines.push(`1 NAME ${pick(VORNAMEN)} /${pick(NACHNAMEN)}/`);
    lines.push(`1 SEX ${rng() < 0.5 ? 'M' : 'F'}`);
    lines.push('1 BIRT');
    lines.push(`2 DATE ${1 + Math.floor(rng() * 28)} JAN ${geburtsjahr}`);
    lines.push(`2 PLAC ${plac}`);
    lines.push('1 DEAT');
    lines.push(`2 DATE ${geburtsjahr + 40 + Math.floor(rng() * 40)}`);
    lines.push(`2 PLAC ${plac}`);
    // RESI mit Hof-Adresse — der Hof-Bootstrap-Pfad (Spec 11 §4.2 A/A'/C/B').
    lines.push('1 RESI');
    lines.push(`2 DATE ${geburtsjahr + 20}`);
    lines.push(`2 PLAC ${plac}`);
    // ADDR-Wert INLINE, nicht als `3 ADR1`-Kind: `collectText()` in gedcom-parse.ts
    // folgt nur CONC/CONT, ein ADR1-Kind würde still verworfen und der Hof-Pfad liefe
    // gar nicht (beim ersten Bau genau so passiert — 0 HofObjects trotz 20.000 RESI).
    // Form geprüft gegen die echte Fixture tests/fixtures/MeineDaten_ancestris.ged
    // ("2 ADDR Nienborger Damm 1"), nicht geraten.
    lines.push(`2 ADDR ${pick(HOF_STRASSEN)} ${1 + Math.floor(rng() * 40)}`);
  }

  // Familien: je 2 Eltern + ~4 Kinder, fortlaufend über den Personenbestand.
  let familyCount = 0;
  const proFamilie = 6;
  for (let start = 1; start + proFamilie <= personCount; start += proFamilie) {
    familyCount += 1;
    lines.push(`0 @F${familyCount}@ FAM`);
    lines.push(`1 HUSB @I${start}@`);
    lines.push(`1 WIFE @I${start + 1}@`);
    lines.push('1 MARR');
    lines.push(`2 DATE ${1680 + Math.floor(rng() * 280)}`);
    lines.push(`2 PLAC ${(() => { const o = pick(ORTE); return `${pick(o.varianten)}, ${o.kette}`; })()}`);
    for (let k = 2; k < proFamilie; k += 1) lines.push(`1 CHIL @I${start + k}@`);
  }

  lines.push('0 TRLR');
  return { text: lines.join('\n') + '\n', personCount, familyCount };
}
