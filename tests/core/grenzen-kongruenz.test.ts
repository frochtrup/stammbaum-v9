// tests/core/grenzen-kongruenz.test.ts — der Boden unter einer Spec-Zusage, die bis
// hierher nur Prosa war (BL-324-Nachtrag, [ADR-v9-243]).
//
// DIE ZUSAGE. Spec 11 §1: „`from`/`to` sind aus `fromDate`/`toDate` ABLEITBAR und müssen
// dazu passen — das Jahr ist nie eine zweite, unabhängige Angabe." Sie trägt die ganze
// Zweistufigkeit: die Auflösung vergleicht tagegenau, wo ein Tag steht, und JAHRESWEISE,
// wo keiner steht. Driften die beiden Hälften auseinander, liefert dieselbe Periode je
// nach Genauigkeit der Gegenseite zwei verschiedene Antworten — und nichts würde es sagen.
//
// WARUM ES EINEN WÄCHTER BRAUCHT. Erzwungen war die Zusage nur im Helfer `datiert()`, also
// für die vier `with…`-Kommandos. Die GOV-Anreicherung setzt beide Hälften an FÜNF Stellen
// direkt (`gov.ts`) — heute kongruent, aber weil derselbe String zufällig zweimal geparst
// wird, nicht weil ein Mechanismus es garantiert. Genau die Sorte Regel, die
// [ADR-v9-239](../../specs/v9/04-Entscheidungslog.md) als „ohne Durchsetzung" verwirft.
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { applyGovEntry, parseGovText, placeYear, tagesOrdinal } from '../../core/places';
import {
  withAddedEnclosedBy,
  withAddedPname,
  withUpdatedEnclosedBy,
  withUpdatedPname,
} from '../../core/places';
import type { PlaceObject } from '../../core/places/types';
import { place } from './places-fixtures';
import { ORTSBESTAND, ortsbestandLaden, ortsbestandPfad } from './realdaten';

/** Alle datierten Angaben eines Ortes als flache Liste (pnames + enclosedBy). */
function datierteAngaben(pl: PlaceObject): { was: string; from: number | null; to: number | null; fromDate?: string | null; toDate?: string | null }[] {
  return [
    ...pl.pnames.map((p) => ({ was: `${pl.id} pname „${p.value}"`, ...p })),
    ...pl.enclosedBy.map((e) => ({ was: `${pl.id} enclosedBy ${e.placeId}`, ...e })),
  ];
}

/** Die Zusage selbst: wo ein Tagesdatum steht, ist das Jahr sein Jahr. */
function verstoesse(
  angaben: { was: string; from: number | null; to: number | null; fromDate?: string | null; toDate?: string | null }[],
): string[] {
  const raus: string[] = [];
  for (const a of angaben) {
    if (a.fromDate && tagesOrdinal(a.fromDate) != null && placeYear(a.fromDate) !== a.from) {
      raus.push(`${a.was}: fromDate „${a.fromDate}" gegen from ${a.from}`);
    }
    if (a.toDate && tagesOrdinal(a.toDate) != null && placeYear(a.toDate) !== a.to) {
      raus.push(`${a.was}: toDate „${a.toDate}" gegen to ${a.to}`);
    }
  }
  return raus;
}

describe('Kongruenz von Jahr und Stichtag (Spec 11 §1)', () => {
  // GOV ist der Pfad mit den fünf direkten Settern — und der einzige, der heute überhaupt
  // Stichtage in den Bestand bringt. Der Text stammt aus tests/core/gov.test.ts (Ochtrup,
  // Kreisreform 1969) und trägt beide Formen: tagegenau und nur jahrgenau.
  const OCHTRUP = [
    'object_162795',
    'heißt (auf deu) Ochtrup,',
    'ist ab 1969-07-01 (auf deu) Stadt,',
    'gehört ab 1803 bis 1969-06-30 zu object_279180,',
    'gehört ab 1969-07-01 zu object_190334,',
  ].join('\n');

  it('die GOV-Anreicherung erzeugt kongruente Grenzen', () => {
    const entry = parseGovText(OCHTRUP)!;
    const places = new Map<string, PlaceObject>([['P1', place('P1', { title: 'Ochtrup' })]]);

    applyGovEntry(places, 'P1', entry);

    const angaben = datierteAngaben(places.get('P1')!);
    // Nicht leer laufen lassen (TST-26): ohne diese Zeile prüfte der Test nichts.
    const mitTag = angaben.filter((a) => a.fromDate || a.toDate);
    expect(mitTag.length, 'der GOV-Text muss Stichtage liefern, sonst prüft dieser Fall nichts').toBeGreaterThan(0);
    expect(verstoesse(angaben)).toEqual([]);
  });

  it('die vier `with…`-Kommandos erzeugen kongruente Grenzen', () => {
    let pl = place('P1', { title: 'Dolgen' });
    pl = withAddedPname(pl, 'Thologun', { jahr: 973, datum: null }, { jahr: 1500, datum: '30 SEP 1500' });
    pl = withUpdatedPname(pl, 0, 'Thologun', { jahr: 973, datum: '1 JAN 973' }, { jahr: 1500, datum: '30 SEP 1500' });
    pl = withAddedEnclosedBy(pl, '@AMT@', { jahr: 1512, datum: '1 OCT 1512' }, 1810);
    pl = withUpdatedEnclosedBy(pl, 0, '@AMT@', { jahr: 1512, datum: '1 OCT 1512' }, { jahr: 1810, datum: '30 SEP 1810' });

    const angaben = datierteAngaben(pl);
    expect(angaben.filter((a) => a.fromDate || a.toDate).length).toBeGreaterThan(0);
    expect(verstoesse(angaben)).toEqual([]);
  });

  // Die Gegenprobe: der Wächter muss einen echten Verstoß auch SEHEN. Ohne sie wüsste
  // niemand, ob `verstoesse` überhaupt etwas findet (TST-22-Geist).
  it('erkennt eine auseinandergelaufene Grenze', () => {
    const kaputt = place('P1', {
      pnames: [{ value: 'Falsch', from: 1800, to: null, fromDate: '1 OCT 1810', toDate: null }],
    });
    expect(verstoesse(datierteAngaben(kaputt))).toEqual([
      'P1 pname „Falsch": fromDate „1 OCT 1810" gegen from 1800',
    ]);
  });

  it.skipIf(!existsSync(ortsbestandPfad()))(
    `${ORTSBESTAND.datei}: kein Ort trägt eine auseinandergelaufene Grenze`,
    () => {
      const { placeObjects } = ortsbestandLaden();
      const alle = [...placeObjects.values()].flatMap(datierteAngaben);
      expect(alle.length, 'der Bestand muss datierte Angaben haben, sonst prüft der Fall nichts').toBeGreaterThan(0);
      expect(verstoesse(alle)).toEqual([]);
    },
  );
});
