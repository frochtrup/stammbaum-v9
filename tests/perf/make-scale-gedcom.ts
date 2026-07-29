// tests/perf/make-scale-gedcom.ts — deterministischer Generator für Skalen-Fixtures
// (Spec 30 §1: "v8 verifiziert bis 20.000 Personen"; v8-Vorbild `generate-scale-test.js`).
//
// Bewusst KEINE eingecheckte 20k-Fixture: die Datei wäre mehrere MB groß, würde das
// Repo aufblähen und bei jeder Modell-Änderung veralten. Der Generator ist stattdessen
// Teil des Tests — reproduzierbar über einen festen Seed (kein Math.random, sonst
// schwankt die Messgrundlage von Lauf zu Lauf und das Gate wird unbrauchbar).
//
// WORIN DIE SCHWERE LIEGT — und worin sie bis BL-89 NICHT lag.
//
// Bis BL-89 behauptete dieser Kopfkommentar „absichtlich REALISTISCH SCHWER für den
// Orts-/Hof-Pfad", stützte das aber nur auf Schreibvarianten und Verwaltungsketten von
// SECHS Dörfern. Nachgezählt (BL-89): 20.000 Personen erzeugten **23** PlaceObjects zu
// 2.196 Höfen — der reale Bestand hat 416 zu 210. Die Kandidatenbreite auf der ORTS-Achse
// war damit um mehr als eine Größenordnung zu schmal, und genau die teuren Pfade liefen
// leer: der Konsistenz-Guard 3c und vor allem die Eltern-Disambiguierung 3c′ (Spec 11
// §4.2) brauchen MEHRERE gleichnamige Kandidaten, um überhaupt zu arbeiten; die
// Review-Klasse P entsteht nur, wenn ein atomarer PLAC mehrdeutig bleibt. Ein Gate, das
// diese Pfade nie betritt, deckt sie auch nicht ab.
//
// Seither erzeugt der Generator drei Sorten Ortsschwere nebeneinander:
//   (a) BREITE  — ~360 distinkte Dorfnamen aus realen Stamm/Endung-Kombinationen,
//                 verteilt über acht Verwaltungsketten. GEMESSEN: 520 PlaceObjects inkl.
//                 Kettenknoten (Realbestand 416) — dieselbe Größenordnung statt 23;
//   (b) VARIANTEN — Schreibvarianten desselben Dorfs (Röddensen/Roeddensen/Röddens.),
//                 die der Seed-Dedup über die Elternverträglichkeit zusammenhalten muss;
//   (c) HOMONYME — dieselben Leitnamen unter WIDERSPRÜCHLICHEN Ketten (Oldenburg in
//                 Niedersachsen vs. Holstein) plus ATOMARE Ereignisse auf genau diesen
//                 Namen. Das ist der Auslöser für 3c′ und, wo die Eltern fehlen, für
//                 Review-Klasse P.
//
// Die HOF-Zahl bleibt bewusst DEUTLICH ÜBER dem Realwert (gemessen 17.958 statt 210). Das ist
// keine übersehene Unrealistik, sondern die Gegenrichtung derselben Überlegung: der
// belegte Quadratik-Rückfall dieses Projekts saß in der Hof-Registry (ADR-v9-88 —
// `resolveOne()` baute beide Registries pro Ereignis neu), und ein Gate soll den bekannten
// Bruchpunkt unter Druck halten, nicht den Durchschnittsfall nachstellen. Realistisch
// muss die BREITE der Kandidatenmengen sein, damit die Pfade laufen; die MENGE darf
// darüber liegen.
import { normPlaceName } from '../../core/places/normalize';

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

/** Verwaltungsketten (Folgesegmente hinter dem Dorfnamen) — mehrere Territorien, damit
 *  gleichnamige Dörfer wirklich WIDERSPRECHENDE Eltern bekommen können (Veto-Fall §4.2). */
const KETTEN: readonly string[] = [
  'Amt Burgdorf (Hannover), Kurfürstentum Hannover, Heiliges Römisches Reich Deutscher Nation',
  'Amt Sassenberg, Fürstbistum Münster, Heiliges Römisches Reich Deutscher Nation',
  'Amt Ochtrup, Kreis Steinfurt, Provinz Westfalen, Königreich Preußen',
  'Kreis Steinfurt, Provinz Westfalen, Königreich Preußen',
  'Amt Vechta, Fürstbistum Münster, Heiliges Römisches Reich Deutscher Nation',
  'Amt Burgdorf (Hannover), Kurfürstentum Braunschweig-Lüneburg, Heiliges Römisches Reich Deutscher Nation',
  'Kreis Borken, Regierungsbezirk Münster, Provinz Westfalen, Königreich Preußen',
  'Amt Neuenhaus, Grafschaft Bentheim, Königreich Hannover',
];

/** Namensbausteine für die Ortsbreite — echte westfälisch/niedersächsische Formen. */
const STAMM = [
  'Ochs', 'Rödden', 'Sassen', 'Neuen', 'Stein', 'Bard', 'Verns', 'Wetter',
  'Lang', 'Hors', 'Gronen', 'Metel', 'Wettring', 'Bors', 'Schöpping', 'Alsten',
  'Dark', 'Heek', 'Lauber', 'Emsdet', 'Grafen', 'Nord', 'Süd', 'Ost',
  'Ahler', 'Billerb', 'Coesf', 'Dülmen', 'Everswink', 'Füchtorf', 'Glandorf',
  'Havix', 'Ibben', 'Lade', 'Milte', 'Nien', 'Ostbe', 'Ravens', 'Telg', 'Warendorf',
];
const ENDUNG = ['trup', 'sen', 'berg', 'kirchen', 'wedel', 'el', 'hausen', 'feld', 'beck'];

/**
 * Dörfer, die es MEHRFACH unter verschiedenen Ketten gibt (Homonyme). Für sie erzeugt der
 * Generator zusätzlich ATOMARE Ereignisse (PLAC = nur der Name), die weder 3c noch 3c′
 * auflösen können → Review-Klasse P (Spec 11 §6). Genau dieser Fall fehlte bis BL-89.
 */
const HOMONYME = ['Oldenburg', 'Neuenkirchen', 'Bergen', 'Hausen'] as const;

const HOF_STRASSEN = ['Hofstelle', 'Kirchweg', 'Mühlenstraße', 'Am Esch', 'Bauerschaft'];

export interface ScaleGedcom {
  text: string;
  personCount: number;
  familyCount: number;
  /** Wie viele DISTINKTE Dorf-Leitnamen die Fixture nennt (Untergrenze der zu erwartenden
   *  PlaceObjects — die Kettenknoten kommen obendrauf). Für die Plausibilitäts-Zusicherung
   *  des Gates, damit die Breite nicht unbemerkt wieder zusammenschrumpft (BL-89). */
  distinctVillageNames: number;
  /** Wie viele Leitnamen unter MEHREREN unverträglichen Ketten vorkommen — die Menge, für
   *  die 3c′/Review-Klasse P überhaupt zuständig ist. */
  homonymNames: number;
}

interface Dorf {
  varianten: readonly string[];
  kette: string;
}

/** Baut die Dorf-Tabelle: Breite (a) + Schreibvarianten (b) + Homonyme (c). */
function buildDoerfer(rng: () => number): Dorf[] {
  const doerfer: Dorf[] = [];
  const seen = new Set<string>();

  for (const stamm of STAMM) {
    for (const endung of ENDUNG) {
      const name = stamm + endung;
      const key = normPlaceName(name);
      if (seen.has(key)) continue;
      seen.add(key);
      const kette = KETTEN[doerfer.length % KETTEN.length];
      // Jedes dritte Dorf bekommt Schreibvarianten (Umlaut-Umschrift + Abkürzung) —
      // dieselbe Identität, die der Seed-Dedup über Elternverträglichkeit halten muss.
      const varianten =
        doerfer.length % 3 === 0
          ? [name, name.replace(/ö/g, 'oe').replace(/ü/g, 'ue'), name.slice(0, Math.max(4, name.length - 3)) + '.']
          : [name];
      doerfer.push({ varianten: [...new Set(varianten)], kette });
    }
  }

  // Homonyme: JEDER dieser Namen kommt unter zwei unverträglichen Ketten vor.
  for (const name of HOMONYME) {
    doerfer.push({ varianten: [name], kette: KETTEN[2] });
    doerfer.push({ varianten: [name], kette: KETTEN[7] });
  }

  // Reihenfolge einmal deterministisch durchmischen, damit gleichnamige Nachbarn nicht
  // zufällig immer direkt hintereinander verarbeitet werden.
  for (let i = doerfer.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [doerfer[i], doerfer[j]] = [doerfer[j], doerfer[i]];
  }
  return doerfer;
}

/**
 * Erzeugt eine GEDCOM-5.5.1-Datei mit `personCount` Personen, generationsweise zu
 * Familien verbunden (jede Familie ~4 Kinder), inkl. BIRT/DEAT/RESI mit Orten und
 * Hof-Adressen.
 */
export function makeScaleGedcom(personCount: number, seed = 20_000): ScaleGedcom {
  const rng = makeRng(seed);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
  const doerfer = buildDoerfer(rng);
  const distinctVillageNames = new Set(doerfer.flatMap((d) => d.varianten.map(normPlaceName))).size;

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
    const ort = pick(doerfer);
    const variante = pick(ort.varianten);
    const plac = `${variante}, ${ort.kette}`;
    const geburtsjahr = 1650 + Math.floor(rng() * 300);

    lines.push(`0 @I${i}@ INDI`);
    lines.push(`1 NAME ${pick(VORNAMEN)} /${pick(NACHNAMEN)}/`);
    lines.push(`1 SEX ${rng() < 0.5 ? 'M' : 'F'}`);
    lines.push('1 BIRT');
    lines.push(`2 DATE ${1 + Math.floor(rng() * 28)} JAN ${geburtsjahr}`);
    // Jede zwölfte Geburt nennt einen HOMONYMEN Ort ATOMAR (nur der Leitname, keine
    // Elternkette). Das ist der einzige Weg in Review-Klasse P (Spec 11 §4.2 3c′,
    // "atomarer PLAC ohne Elter → kein stilles Raten") — vor BL-89 kam er nie vor.
    lines.push(i % 12 === 0 ? `2 PLAC ${HOMONYME[i % HOMONYME.length]}` : `2 PLAC ${plac}`);
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
    lines.push(`2 PLAC ${(() => { const o = pick(doerfer); return `${pick(o.varianten)}, ${o.kette}`; })()}`);
    for (let k = 2; k < proFamilie; k += 1) lines.push(`1 CHIL @I${start + k}@`);
  }

  lines.push('0 TRLR');
  return {
    text: lines.join('\n') + '\n',
    personCount,
    familyCount,
    distinctVillageNames,
    homonymNames: HOMONYME.length,
  };
}
