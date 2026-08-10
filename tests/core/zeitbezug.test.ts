// tests/core/zeitbezug.test.ts — die Zeitrechnung der Orts-Auflösung (BL-324,
// [ADR-v9-243]). Reine Funktionen, node-Umgebung (TST-3/INV-ARCH-2).
//
// Der Kern dieser Datei sind nicht die Tagesvergleiche, sondern die ZWEI
// Rückfall-Richtungen: Spec 11 §1 verspricht „tagegenau nur, wenn beide Seiten einen Tag
// tragen". Ein Test, der nur den Gewinn prüft, ließe genau die Hälfte offen, die den
// Bestand trägt — 2822 der 9377 Ereignisdaten haben keinen Tag.
import { describe, expect, it } from 'vitest';
import { makePlaceRegistry } from '../../core/places/place-registry';
import type { PlaceObject } from '../../core/places/types';
import { hof, place } from './places-fixtures';
import {
  alsSpanne,
  grenzeAusEingabe,
  istDatiert,
  jahresSpanne,
  leiteGrenzjahrAb,
  leiteGrenzjahreAbImHof,
  leiteGrenzjahreAbImOrt,
  spanneVonDatiert,
  spanneVonEreignis,
  tagesOrdinal,
  trifft,
} from '../../core/places/zeitbezug';

describe('tagesOrdinal — „trägt einen Tag" ist nicht „ist tagegenau"', () => {
  it('liefert ein Ordinal nur für ein exaktes Volldatum', () => {
    expect(tagesOrdinal('15 JUN 1810')).toBe(18100615);
    expect(tagesOrdinal('1 JAN 1810')).toBe(18100101);
    expect(tagesOrdinal('31 DEC 1810')).toBe(18101231);
  });

  it('verwirft jeden Qualifier, auch wenn ein Tag dasteht', () => {
    // 747 der 9377 Ereignisdaten des Realbestands tragen einen Qualifier. „Ungefähr am
    // 15. Juni" ist eine Aussage über die Unsicherheit, kein Stichtag.
    for (const roh of ['ABT 15 JUN 1810', 'CAL 15 JUN 1810', 'EST 15 JUN 1810', 'BEF 15 JUN 1810', 'AFT 15 JUN 1810']) {
      expect(tagesOrdinal(roh), roh).toBeNull();
    }
    expect(tagesOrdinal('BET 15 JUN 1810 AND 20 JUN 1810')).toBeNull();
    expect(tagesOrdinal('FROM 15 JUN 1810 TO 20 JUN 1810')).toBeNull();
  });

  it('verwirft unvollständige Daten', () => {
    expect(tagesOrdinal('JUN 1810')).toBeNull();
    expect(tagesOrdinal('1810')).toBeNull();
    expect(tagesOrdinal('')).toBeNull();
    expect(tagesOrdinal(null)).toBeNull();
  });
});

describe('spanneVonDatiert — das Jahr klemmt asymmetrisch auf seine Kanten', () => {
  it('ohne Tagesangabe ist die Spanne exakt die bisherige inklusive Jahres-Semantik', () => {
    expect(spanneVonDatiert({ from: 1512, to: 1810 })).toEqual({ von: 15120101, bis: 18101231 });
  });

  it('nach unten offen: `from` fehlt, `to` gesetzt (Spec 11 §1, mittlere Zeile)', () => {
    expect(spanneVonDatiert({ from: null, to: 1806 })).toEqual({ von: null, bis: 18061231 });
  });

  it('undatiert bleibt beidseitig offen', () => {
    expect(spanneVonDatiert({ from: null, to: null })).toEqual({ von: null, bis: null });
  });

  it('`fromDate`/`toDate` gewinnen, wo sie tagegenau sind', () => {
    expect(spanneVonDatiert({ from: 1810, to: 1813, fromDate: '1 OCT 1810', toDate: '31 MAR 1813' })).toEqual({
      von: 18101001,
      bis: 18130331,
    });
  });

  it('ein unbrauchbares `fromDate` fällt auf das Jahr zurück, statt die Angabe zu verlieren', () => {
    expect(spanneVonDatiert({ from: 1810, to: null, fromDate: 'ABT 1810' })).toEqual({
      von: 18100101,
      bis: null,
    });
  });
});

describe('trifft — der zweistufige Vergleich, ohne Fallunterscheidung', () => {
  const amtIlten = spanneVonDatiert({ from: 1512, to: 1810, toDate: '30 SEP 1810' });
  const departement = spanneVonDatiert({ from: 1810, to: 1813, fromDate: '1 OCT 1810' });

  it('GEWINN: ein tagegenaues Ereignis im Grenzjahr trifft nur noch EINE Periode', () => {
    const ereignis = spanneVonEreignis('15 JUN 1810')!;
    expect(trifft(amtIlten, ereignis)).toBe(true);
    expect(trifft(departement, ereignis)).toBe(false);
  });

  it('GEWINN, andere Seite der Grenze', () => {
    const ereignis = spanneVonEreignis('2 NOV 1810')!;
    expect(trifft(amtIlten, ereignis)).toBe(false);
    expect(trifft(departement, ereignis)).toBe(true);
  });

  it('RÜCKFALL 1: ein nur jahrgenaues Ereignis trifft weiterhin BEIDE — keine erfundene Genauigkeit', () => {
    const ereignis = spanneVonEreignis('1810')!;
    expect(trifft(amtIlten, ereignis)).toBe(true);
    expect(trifft(departement, ereignis)).toBe(true);
  });

  it('RÜCKFALL 2: eine nur jahrgenaue PERIODE bleibt mehrdeutig, auch für ein tagegenaues Ereignis', () => {
    // „bis irgendwann 1810" kann der 15. Juni nicht widerlegen. Das ist die Richtung, die
    // ein „if (ereignisHatTag)" falsch beantwortet hätte.
    const grobA = spanneVonDatiert({ from: 1512, to: 1810 });
    const grobB = spanneVonDatiert({ from: 1810, to: 1813 });
    const ereignis = spanneVonEreignis('15 JUN 1810')!;
    expect(trifft(grobA, ereignis)).toBe(true);
    expect(trifft(grobB, ereignis)).toBe(true);
  });

  it('RÜCKFALL 3: ein qualifiziertes Datum verhält sich wie sein Jahr', () => {
    const ereignis = spanneVonEreignis('ABT 15 JUN 1810')!;
    expect(ereignis).toEqual(jahresSpanne(1810));
    expect(trifft(amtIlten, ereignis)).toBe(true);
    expect(trifft(departement, ereignis)).toBe(true);
  });

  it('offene Grenzen zählen als unendlich', () => {
    const seitJeher = spanneVonDatiert({ from: null, to: 1806 });
    expect(trifft(seitJeher, spanneVonEreignis('1350')!)).toBe(true);
    expect(trifft(seitJeher, spanneVonEreignis('1807')!)).toBe(false);
    const bisHeute = spanneVonDatiert({ from: 1946, to: null });
    expect(trifft(bisHeute, spanneVonEreignis('2020')!)).toBe(true);
    expect(trifft(bisHeute, spanneVonEreignis('1945')!)).toBe(false);
  });
});

describe('spanneVonEreignis / alsSpanne / istDatiert', () => {
  it('ein Ereignis ohne erkennbares Jahr hat keine Spanne', () => {
    expect(spanneVonEreignis(null)).toBeNull();
    expect(spanneVonEreignis('')).toBeNull();
    expect(spanneVonEreignis('unbekannt')).toBeNull();
  });

  it('alsSpanne nimmt weiterhin eine nackte Jahreszahl entgegen (die 33 Altaufrufer)', () => {
    expect(alsSpanne(1810)).toEqual({ von: 18100101, bis: 18101231 });
    expect(alsSpanne(null)).toBeNull();
    expect(alsSpanne({ von: 18100615, bis: 18100615 })).toEqual({ von: 18100615, bis: 18100615 });
  });

  it('istDatiert erkennt auch eine Angabe, die NUR ein Tagesdatum trägt', () => {
    expect(istDatiert({ from: null, to: null })).toBe(false);
    expect(istDatiert({ from: 1810, to: null })).toBe(true);
    expect(istDatiert({ from: null, to: null, fromDate: '1 OCT 1810' })).toBe(true);
  });
});

// Der Fertig-Zustand von BL-324, an der ECHTEN Registry statt an den Primitiven oben:
// „ein Ereignis mit Tagesdatum an einer Randberührung löst auf die periodenrichtige Kette
// auf, ein jahrgenaues Ereignis unverändert wie heute."
describe('PlaceRegistry — die Randberührung wird durch Tagesangaben entscheidbar (BL-324)', () => {
  /** Dolgen-Muster aus dem Realbestand: Amt bis 1810, Departement ab 1810. */
  function bestand(mitStichtag: boolean) {
    const places = new Map<string, PlaceObject>();
    places.set('@AMT@', place('@AMT@', { title: 'Amt Ilten' }));
    places.set('@DEP@', place('@DEP@', { title: 'Departement Aller' }));
    places.set(
      '@P1@',
      place('@P1@', {
        title: 'Dolgen',
        enclosedBy: [
          { placeId: '@AMT@', from: 1512, to: 1810, ...(mitStichtag ? { toDate: '30 SEP 1810' } : {}) },
          { placeId: '@DEP@', from: 1810, to: 1813, ...(mitStichtag ? { fromDate: '1 OCT 1810' } : {}) },
        ],
      }),
    );
    return makePlaceRegistry(places);
  }

  it('OHNE Stichtage bleibt es mehrdeutig — der Tie-Break wählt, wie bisher', () => {
    const reg = bestand(false);
    const meta = { truncated: false, ueberlappt: false };
    expect(reg.enclosureIdsAsOf('@P1@', spanneVonEreignis('15 JUN 1810'), meta)).toEqual(['@P1@', '@DEP@']);
    expect(meta.ueberlappt, 'ohne Stichtag muss der ⚠-Hinweis stehen bleiben').toBe(true);
  });

  it('MIT Stichtagen entscheidet das Tagesdatum — und der Hinweis verschwindet', () => {
    const reg = bestand(true);
    const vorher = { truncated: false, ueberlappt: false };
    expect(reg.enclosureIdsAsOf('@P1@', spanneVonEreignis('15 JUN 1810'), vorher)).toEqual(['@P1@', '@AMT@']);
    expect(vorher.ueberlappt, 'eindeutig → kein Hinweis mehr').toBe(false);

    const nachher = { truncated: false, ueberlappt: false };
    expect(reg.enclosureIdsAsOf('@P1@', spanneVonEreignis('2 NOV 1810'), nachher)).toEqual(['@P1@', '@DEP@']);
    expect(nachher.ueberlappt).toBe(false);
  });

  it('ein jahrgenaues Ereignis bleibt trotz Stichtagen mehrdeutig — kein Rückschritt, keine Erfindung', () => {
    const reg = bestand(true);
    const meta = { truncated: false, ueberlappt: false };
    expect(reg.enclosureIdsAsOf('@P1@', spanneVonEreignis('1810'), meta)).toEqual(['@P1@', '@DEP@']);
    expect(meta.ueberlappt).toBe(true);
  });

  it('ein QUALIFIZIERTES Tagesdatum zählt als jahrgenau (`ABT 15 JUN 1810`)', () => {
    const reg = bestand(true);
    const meta = { truncated: false, ueberlappt: false };
    expect(reg.enclosureIdsAsOf('@P1@', spanneVonEreignis('ABT 15 JUN 1810'), meta)).toEqual(['@P1@', '@DEP@']);
    expect(meta.ueberlappt).toBe(true);
  });

  it('auch der periodengerechte NAME folgt dem Tagesdatum', () => {
    const places = new Map<string, PlaceObject>();
    places.set(
      '@P1@',
      place('@P1@', {
        title: 'Chocianów',
        pnames: [
          { value: 'Kotzenau', from: 1400, to: 1945, toDate: '8 MAY 1945' },
          { value: 'Chocianów', from: 1945, to: null, fromDate: '9 MAY 1945' },
        ],
      }),
    );
    const reg = makePlaceRegistry(places);
    expect(reg.resolveAsOf('@P1@', spanneVonEreignis('3 FEB 1945'))).toBe('Kotzenau');
    expect(reg.resolveAsOf('@P1@', spanneVonEreignis('20 JUN 1945'))).toBe('Chocianów');
    // Jahrgenau: der Tie-Break gewinnt weiterhin (späterer Beginn).
    expect(reg.resolveAsOf('@P1@', spanneVonEreignis('1945'))).toBe('Chocianów');
  });
});

// Nacharbeit zu BL-324 (Bewertung gegen die Spec, 2026-08-09). Die erste Fassung riet
// selbst, statt den vorhandenen Datums-Mechanismus zu benutzen — gemessen am laufenden
// System: „1. Oktober 1810" wurde still zu „1810" (der Nutzer sieht ein Datum, gespeichert
// wird ein Jahr) und „xyz" leerte die Periode. Beides sind stille Verluste an einem Feld,
// das die PLAC-Projektion speist.
describe('grenzeAusEingabe — Ablehnen statt Raten (BL-324-Nachtrag)', () => {
  const grenze = (roh: string) => {
    const l = grenzeAusEingabe(roh);
    return l.ok ? l.grenze : null;
  };

  it('liest die deutsche Schreibweise und kanonisiert sie', () => {
    // Der Alltagsfall. `normalizeMonth` (dieselbe Funktion wie im Ereignis-Formular)
    // kennt „Oktober"/„Okt" — die erste Fassung kannte sie nicht.
    expect(grenze('1. Oktober 1810')).toEqual({ jahr: 1810, datum: '1 OCT 1810' });
    expect(grenze('1 Okt 1810')).toEqual({ jahr: 1810, datum: '1 OCT 1810' });
    expect(grenze('1.10.1810')).toEqual({ jahr: 1810, datum: '1 OCT 1810' });
    expect(grenze('01.10.1810')).toEqual({ jahr: 1810, datum: '1 OCT 1810' });
  });

  it('nimmt die kanonische Form unverändert an', () => {
    expect(grenze('1 OCT 1810')).toEqual({ jahr: 1810, datum: '1 OCT 1810' });
  });

  it('leer heißt offen — der reguläre Weg zu einer offenen Grenze (Spec 11 §1)', () => {
    expect(grenze('')).toEqual({ jahr: null, datum: null });
    expect(grenze('   ')).toEqual({ jahr: null, datum: null });
  });

  it('ein Jahr bleibt ein Jahr, auch mit Qualifier — ein Qualifier ist keine Tagesangabe', () => {
    expect(grenze('1810')).toEqual({ jahr: 1810, datum: null });
    expect(grenze('ABT 1810')).toEqual({ jahr: 1810, datum: null });
  });

  it('LEHNT Unlesbares AB, statt die Periode zu leeren', () => {
    // Der eigentliche Fix: `ok: false` ist etwas anderes als „offen". Ein durchgereichtes
    // `null` hätte gelöscht — deshalb ein Ergebnisobjekt, das der Compiler auspacken lässt.
    expect(grenzeAusEingabe('xyz').ok).toBe(false);
    expect(grenzeAusEingabe('Anfang des Jahrhunderts').ok).toBe(false);
    // Gegenprobe, damit der Test nicht bloß „alles ist unlesbar" behauptet.
    expect(grenzeAusEingabe('1810').ok).toBe(true);
  });

  it('ein unmöglicher Tag wird nicht zum Stichtag erhoben', () => {
    const l = grenzeAusEingabe('32. Oktober 1810');
    // Kein Tagesdatum — aber das Jahr ist erkennbar und bleibt erhalten.
    expect(l.ok && l.grenze).toEqual({ jahr: 1810, datum: null });
  });
});

// ---------------------------------------------------------------------------------------
// leiteGrenzjahrAb — die Richtung der Zusage (BL-332, [ADR-v9-248])
//
// Spec 11 §1 sagt nicht „Jahr und Tag müssen übereinstimmen" (eine symmetrische Aussage),
// sondern „`from`/`to` sind aus `fromDate`/`toDate` ABLEITBAR". Der Tag ist die Angabe,
// das Jahr ihre gröbere Fassung. Diese Tests halten fest, dass die Ableitung genau in
// diese Richtung läuft — und dass sie NUR läuft, wo ein Tag wirklich tagegenau ist.
// ---------------------------------------------------------------------------------------
describe('leiteGrenzjahrAb — der Stichtag zieht das Jahr, nie umgekehrt', () => {
  it('zieht ein auseinandergelaufenes Jahr an den Stichtag', () => {
    // Der Realfall aus [ADR-v9-246] E3: die Periode wurde tagegenau entzerrt
    // („31 DEC 1810"), die abgeleitete Jahreszahl blieb auf der alten Randberührung
    // stehen (1811). Zehn Oldenburger Orte trugen genau das.
    expect(leiteGrenzjahrAb({ from: 1803, to: 1811, fromDate: null, toDate: '31 DEC 1810' })).toEqual({
      from: 1803,
      to: 1810,
      fromDate: null,
      toDate: '31 DEC 1810',
    });
  });

  it('füllt ein FEHLENDES Jahr aus dem Stichtag', () => {
    // Kein Auseinanderlaufen, sondern eine halbe Angabe — dieselbe Zusage, dieselbe Antwort.
    expect(leiteGrenzjahrAb({ from: null, to: null, fromDate: '1 OCT 1810', toDate: null })).toEqual({
      from: 1810,
      to: null,
      fromDate: '1 OCT 1810',
      toDate: null,
    });
  });

  it('lässt eine ungenaue Tagesangabe das Jahr NICHT ziehen', () => {
    // `ABT 1700` trägt ein Jahr, aber keine Tagesgenauigkeit — `tagesOrdinal` liefert
    // `null`, und ein Jahr ohne Tag ist keine schlechtere Angabe, sondern eine andere.
    // Ohne diesen Fall würde die Ableitung Scheingenauigkeit in den Bestand schreiben.
    const d = { from: 1750, to: null, fromDate: 'ABT 1700', toDate: null };
    expect(leiteGrenzjahrAb(d)).toBe(d);
  });

  it('gibt bei nichts zu tun die EINGABE zurück (identische Referenz)', () => {
    // Der Aufrufer zählt daran, was er geändert hat — und Copy-on-Write (ADR-v9-92)
    // kopiert nur mit Anlass. 1367 der 1506 datierten Einträge des Bestands tragen
    // gar keinen Tag; für sie muss diese Funktion nachweislich nichts tun.
    const kongruent = { from: 1810, to: 1969, fromDate: '1 OCT 1810', toDate: null };
    expect(leiteGrenzjahrAb(kongruent)).toBe(kongruent);
    const ohneTag = { from: 1810, to: 1969, fromDate: null, toDate: null };
    expect(leiteGrenzjahrAb(ohneTag)).toBe(ohneTag);
  });

  it('lässt Felder neben den Grenzen unangetastet', () => {
    // `value`/`dateRaw` sind Quelltext-Bewahrung (LP-1) — die Ableitung fasst genau zwei
    // Zahlen an, sonst nichts.
    expect(
      leiteGrenzjahrAb({ value: 'Amt Vechta', from: 1811, to: null, fromDate: '1 JAN 1810', toDate: null, dateRaw: 'FROM 1810' }),
    ).toEqual({ value: 'Amt Vechta', from: 1810, to: null, fromDate: '1 JAN 1810', toDate: null, dateRaw: 'FROM 1810' });
  });

  it('greift auf BEIDEN datierten Achsen eines Ortes', () => {
    // pnames und enclosedBy sind im Bestand beide betroffen (36 bzw. 103 Einträge mit
    // Stichtag) — eine Ableitung, die nur eine Achse kennt, wäre halb gebaut.
    const po = leiteGrenzjahreAbImOrt(
      place('P1', {
        pnames: [{ value: 'Herzogtum Oldenburg', from: 1774, to: 1815, fromDate: null, toDate: '31 DEC 1814' }],
        enclosedBy: [{ placeId: '@P9@', from: 1804, to: null, fromDate: '1 JAN 1803', toDate: null }],
      }),
    );
    expect(po.pnames[0].to).toBe(1814);
    expect(po.enclosedBy[0].from).toBe(1803);
  });

  it('lässt einen bereits kongruenten Ort/Hof unverändert (identische Referenz)', () => {
    const po = place('P1', {
      pnames: [{ value: 'Ochtrup', from: 1969, to: null, fromDate: '1 JUL 1969', toDate: null }],
    });
    expect(leiteGrenzjahreAbImOrt(po)).toBe(po);
    const ho = hof('_hof_a_b', 'P1', {
      addrs: [{ value: 'Hof Meyer 1', from: 1800, to: null, fromDate: null, toDate: null }],
    });
    expect(leiteGrenzjahreAbImHof(ho)).toBe(ho);
  });

  it('zieht auch die Hof-Adressachse', () => {
    const ho = leiteGrenzjahreAbImHof(
      hof('_hof_a_b', 'P1', {
        addrs: [{ value: 'Hof Meyer 1', from: 1800, to: 1976, fromDate: null, toDate: '31 DEC 1975' }],
      }),
    );
    expect(ho.addrs[0].to).toBe(1975);
  });
});
