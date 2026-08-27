// tests/core/place-seed-matrix.test.ts — die Entscheidungstabelle des Seeds: „Hofstelle
// oder Ortsebene?" über das KREUZPRODUKT der Achsen, die das Ergebnis bestimmen.
//
// WARUM ES DIESE DATEI GIBT. `konvention-matrix.test.ts` ist ein Fallkatalog — „je
// Konvention ein Fixture", also eine Liste benannter Fälle. Genau daran ist der Defekt vom
// 26.08.2026 vorbeigelaufen: gemessen hatte die Matrix fünf Ereignis-Fixtures mit
// `place`+`addr`, zwei mit „Leitsegment == ADDR" (Konvention 1) und drei mit „PLAC nennt
// gar kein Hof-Segment" (Konvention 2). Die dritte mögliche Beziehung — Leitsegment und
// ADDR verschieden, aber BEIDE Adressen DESSELBEN Hofes — kam nicht vor. Sie entsteht,
// seit ein Hof eine Adressliste führt ([ADR-v9-223]): `PLAC` wird live aus `addrs`
// berechnet, `ADDR` bleibt eingefroren ([ADR-v9-47]), und die beiden Hälften laufen
// auseinander. Dazu kam eine zweite blinde Achse: JEDER Seed-Test lief gegen `hofMap()`,
// also gegen null Höfe — die Objektseite war eingefroren, wie im Property-Test
// (`resolve-determinism.property.test.ts`, „Fester Orts-/Hof-Kontext": EIN Hof, EINE
// Adresse) und mit derselben Wirkung.
//
// DIE FORM IST ABSICHT — dieselbe wie in `naht-kommando-reload.test.ts`: nicht ein Fixture
// je Fall, sondern das VOLLE Kreuzprodukt gegen eine ausgeschriebene Regel. Wer eine Regel
// im Seed ändert, ändert hier Zellen und muss sie benennen.
//
// KEIN SNAPSHOT. `erwartet()` unten ist die Spezifikation in ausführbarer Form, nicht das
// abgelesene Ist: sie schreibt die sechs Regeln in ihrer Prüfreihenfolge hin. Ein
// Abgleich „Implementierung == abgelesenes Verhalten" hätte den Defekt mit eingefroren.
//
// REALBESTAND: hier bewusst KEINER ([ADR-v9-282] — der Realbestand ist Finder, nicht
// Prüfstein). Er hat die Lücke gefunden; festgehalten wird sie an synthetischen Fixtures,
// die in CI laufen.
import { describe, expect, it } from 'vitest';
import { seedPlacesFromEvents, makePlaceRegistry, makeHofRegistry } from '../../core/places/index';
import type { PlaceContext } from '../../core/places/index';
import { hof, place, placeMap, hofMap, ev } from './places-fixtures';

const LEIT = 'Oster 60'; // das Leitsegment, über das entschieden wird
const DORF = 'Ochtrup';
const VARIANTE = 'Wigbold 14 (Oster 60)'; // zweite Bezeichnung DESSELBEN Hofes
const FREMD = 'Ganz Woanders 3'; // Adresse eines ANDEREN Hofes

/** Achse 1: bindet dieser Ereignistyp überhaupt Höfe? (Spec 11 §4.2) */
const TYPEN = [
  { label: 'Hof-Typ (RESI)', typ: 'RESI', hofTyp: true },
  { label: 'anderer (DEAT)', typ: 'DEAT', hofTyp: false },
] as const;

/** Achse 2: wie verhält sich `ev.addr` zum Leitsegment? */
const ADDRS = [
  { label: 'ADDR == Leitsegment', addr: LEIT },
  { label: 'ADDR leer', addr: '' },
  { label: 'ADDR = andere Variante', addr: VARIANTE },
  { label: 'ADDR = fremder Hof', addr: FREMD },
] as const;

/**
 * Achse 3: was weiß der BESTAND über das Leitsegment?
 *
 * `roh` ist der Bootstrap-Zustand (eine undatierte Adresse, sonst nichts) — er zählt
 * ausdrücklich NICHT als Beleg: ein gebootstrappter Hof entsteht aus demselben Text, den
 * er hier deuten soll ([ADR-v9-224]-Autoritätssatz). `kuratiert` trägt Koordinaten; am
 * Bestand ist das die Facette, die 195 von 213 Höfen kuratiert macht.
 */
const BESTAND = [
  { label: 'kein Hof', addrs: [] as string[], kuratiert: false },
  { label: 'Hof, roher Bootstrap', addrs: [LEIT], kuratiert: false },
  { label: 'Hof kuratiert, 1 Adr.', addrs: [LEIT], kuratiert: true },
  { label: 'Hof kuratiert, 2 Adr.', addrs: [LEIT, VARIANTE], kuratiert: true },
] as const;

/**
 * Achse 5: kann in dem Ort, den `segs[1..]` nennt, überhaupt ein Hof liegen?
 * (ADR-v9-293 — der Bootstrap verankerte bis dahin auch an einem Landkreis.)
 */
const ANKER = [
  { label: 'Anker: Siedlung', typ: 'Town', hofFaehig: true },
  { label: 'Anker: Kreis', typ: 'County', hofFaehig: false },
] as const;

/** Achse 4: nennt die DATEI dieselbe Stelle anderswo als Hofstelle (Konvention 1)? */
const KORPUS = [
  { label: 'ohne Geschwister-RESI', anspruch: false },
  { label: 'mit Geschwister-RESI', anspruch: true },
] as const;

type Ergebnis = 'Hof' | 'Ort';

interface Zelle {
  hofTyp: boolean;
  addr: string;
  bestandAddrs: readonly string[];
  bestandKuratiert: boolean;
  anspruch: boolean;
  ankerHofFaehig: boolean;
}

/**
 * DIE SPEZIFIKATION, in Prüfreihenfolge. „Hof" heißt: das Leitsegment wird NICHT als
 * Ortsebene angelegt.
 *
 *   R1  Ein KURATIERTER Hof im Dorf trägt diese Adresse            -> Hof
 *       Wissen über das Objekt schlägt jeden Schluss aus dem Text. Rohe Bootstraps
 *       zählen nicht (Zirkel).
 *   R2  Hof-Typ, ADDR wiederholt das Leitsegment (Konvention 1)    -> Hof
 *       OHNE Anker-Guard: die Behauptung steht an DIESEM Ereignis. Lehnt der Resolver
 *       den Bootstrap ab, wird sie dort als Review sichtbar (Klasse A) — ein Seed
 *       machte daraus stattdessen einen ORT, in dem derselbe Name noch einmal als Hof
 *       landete (die Krankheit aus [ADR-v9-294]).
 *   R3  Hof-Typ, ADDR leer (Pfad C) UND der Anker kann einen Hof tragen  -> Hof
 *       MIT Anker-Guard: hier behauptet die Datei nichts, das ist ein reiner
 *       Textschluss. Über einem Kreis entstünde sonst weder Hof noch Ort ([ADR-v9-293]).
 *   R4  Hof-Typ, ADDR nennt etwas anderes (Konvention 2)           -> Ort
 *   R5  Anderer Typ, aber die Datei nennt die Stelle anderswo
 *       per Konvention 1 als Hofstelle UND der Anker kann einen Hof tragen  -> Hof
 *       MIT Anker-Guard: für DIESES Ereignis ist das ein Schluss von außen.
 *   R6  sonst                                                      -> Ort
 */
function erwartet(z: Zelle): Ergebnis {
  const norm = (s: string) => s.trim().toLowerCase();
  if (z.bestandKuratiert && z.bestandAddrs.some((a) => norm(a) === norm(LEIT))) return 'Hof'; // R1
  if (z.hofTyp) {
    if (norm(z.addr) === norm(LEIT)) return 'Hof'; // R2
    if (!z.addr) return z.ankerHofFaehig ? 'Hof' : 'Ort'; // R3
    return 'Ort'; // R4
  }
  return z.anspruch && z.ankerHofFaehig ? 'Hof' : 'Ort'; // R5 / R6
}

function ctxMit(b: (typeof BESTAND)[number], ankerTyp = 'Town'): PlaceContext {
  const dorf = place('@DORF@', { title: DORF, type: ankerTyp });
  const hoefe = b.addrs.length
    ? [
        hof('_hof_x', '@DORF@', {
          addrs: b.addrs.map((v) => ({ value: v, from: null, to: null })),
          ...(b.kuratiert ? { lat: 52.2, long: 7.18 } : {}),
        }),
      ]
    : [];
  return { places: makePlaceRegistry(placeMap(dorf)), hofs: makeHofRegistry(hofMap(...hoefe)) };
}

function gemessen(z: Zelle, b: (typeof BESTAND)[number]): Ergebnis {
  const events = [ev(z.hofTyp ? 'RESI' : 'DEAT', { place: `${LEIT}, ${DORF}, Deutschland`, addr: z.addr })];
  if (z.anspruch) events.push(ev('RESI', { place: `${LEIT}, ${DORF}, Deutschland`, addr: LEIT }));
  const anker = ANKER.find((a) => a.hofFaehig === z.ankerHofFaehig)!;
  const created = seedPlacesFromEvents(events, ctxMit(b, anker.typ));
  return created.some((p) => p.title === LEIT) ? 'Ort' : 'Hof';
}

describe('Entscheidungstabelle des Seeds — Hofstelle oder Ortsebene?', () => {
  const zellen: { name: string; z: Zelle; b: (typeof BESTAND)[number] }[] = [];
  for (const b of BESTAND)
    for (const k of KORPUS)
      for (const t of TYPEN)
        for (const a of ADDRS)
          for (const n of ANKER)
            zellen.push({
              name: `${b.label} | ${k.label} | ${t.label} | ${a.label} | ${n.label}`,
              z: {
                hofTyp: t.hofTyp,
                addr: a.addr,
                bestandAddrs: b.addrs,
                bestandKuratiert: b.kuratiert,
                anspruch: k.anspruch,
                ankerHofFaehig: n.hofFaehig,
              },
              b,
            });

  it('spannt das volle Kreuzprodukt auf (sonst prüft die Tabelle weniger, als sie behauptet)', () => {
    expect(zellen.length).toBe(BESTAND.length * KORPUS.length * TYPEN.length * ADDRS.length * ANKER.length);
    expect(zellen.length).toBe(128);
  });

  it('beide Ausgänge kommen vor (keine entartete Tabelle)', () => {
    const alle = zellen.map(({ z }) => erwartet(z));
    expect(alle.filter((x) => x === 'Hof').length).toBeGreaterThan(0);
    expect(alle.filter((x) => x === 'Ort').length).toBeGreaterThan(0);
  });

  for (const { name, z, b } of zellen) {
    it(`${name} -> ${erwartet(z)}`, () => {
      expect(gemessen(z, b)).toBe(erwartet(z));
    });
  }
});

describe('Die Zellen, an denen der Defekt vom 26.08.2026 hing', () => {
  // Zur Sicherheit noch einmal einzeln benannt: eine Tabelle kann man versehentlich
  // umparametrisieren, einen benannten Fall nicht.
  const kuratiertZweiAdr = BESTAND[3];
  const keinHof = BESTAND[0];

  it('R1 schlägt Konvention 2: Adressvariante desselben kuratierten Hofes ist kein zweiter Ort', () => {
    const z: Zelle = {
      hofTyp: true,
      addr: VARIANTE,
      bestandAddrs: kuratiertZweiAdr.addrs,
      bestandKuratiert: true,
      anspruch: false,
      ankerHofFaehig: true,
    };
    expect(gemessen(z, kuratiertZweiAdr)).toBe('Hof');
  });

  it('R5: ein DEAT schattet die Hof-Erkennung nicht, wenn ein RESI die Stelle per ADDR nennt', () => {
    const z: Zelle = {
      hofTyp: false,
      addr: '',
      bestandAddrs: [],
      bestandKuratiert: false,
      anspruch: true,
      ankerHofFaehig: true,
    };
    expect(gemessen(z, keinHof)).toBe('Hof');
  });

  it('R6: ohne jeden Hof-Beleg bleibt das Leitsegment eine Ortsebene', () => {
    const z: Zelle = {
      hofTyp: false,
      addr: '',
      bestandAddrs: [],
      bestandKuratiert: false,
      anspruch: false,
      ankerHofFaehig: true,
    };
    expect(gemessen(z, keinHof)).toBe('Ort');
  });
});
