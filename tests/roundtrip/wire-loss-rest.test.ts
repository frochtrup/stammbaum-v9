// tests/roundtrip/wire-loss-rest.test.ts — BL-302 (ADR-v9-208): der Rest der
// Überlappungszone, an einer EINGECHECKTEN Datei.
//
// WORUM ES GEHT. Der Passthrough rettet per Konstruktion nur Tags, die das Modell NICHT
// beansprucht (`mergeRecord`) — und das MUSS so sein, sonst käme jeder gelöschte Wert bei
// jedem Speichern zurück. Die Verluste lagen deshalb alle in der Überlappungszone: Tags,
// die das Modell beansprucht, aber nicht vollständig HALTEN kann. Vier Formen, hier je
// eine Zeile der Fixture:
//
//   (1) ein Slot, mehrere Wire-Zeilen — zwei `NOTE` an einem Ereignis, zwei `TEXT` an
//       einer Quelle, ein `1 NAME` ohne Wert (der Emitter-Guard ließ ihn weg)
//   (2) Wertraum enger als der Draht — `QUAY 0` fiel mit dem Default 0 zusammen,
//       `SEX U` mit dem Default U
//   (3) Enum-Wert, den das Modell nicht kennt — `_RESULT not-found` (v8s Schreibweise)
//       wurde still zu `pending`, aus „Nicht gefunden" wurde „offen"
//   (4) ein Tag, den niemand liest — `_DONE 1` ohne `_TSTAT` (v8-Aufgaben von vor sw v307).
//       Seit BL-307 wird `_DONE` gelesen, aber nicht mehr geschrieben: die Aussage steht
//       danach in `_TSTAT`, und zwar nur noch dort.
//
// GEMESSEN WIRD DER NEUBAU: ein unveränderter Record gibt den Original-Knoten zurück und
// beweist über den Writer nichts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGedcom, applyDatabaseToRoots, serializeGedcom } from '../../core/interop';
import { assembleLines } from './roundtrip-helpers';
import type { Database } from '../../core/model/types';

const src = readFileSync(join(__dirname, '../fixtures/wire-loss-rest.small.ged'), 'utf8');

const speichern = (db: Database, roots: Parameters<typeof serializeGedcom>[0]['roots']): string =>
  serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots) });

/** Rein ADDITIV schmutzig machen — die Bilanz soll echte Verluste zeigen, nicht den Test. */
function alleRecordsAendern(db: Database): void {
  for (const [id, p] of [...db.individuals]) db.individuals.set(id, { ...p, uid: `${p.uid}ZZ` });
  for (const [id, s] of [...db.sources]) db.sources.set(id, { ...s, abbr: `${s.abbr}ZZ` });
}

const gebaut = (): string[] => {
  const p = parseGedcom(src);
  alleRecordsAendern(p.db);
  return assembleLines(speichern(p.db, p.roots));
};

/**
 * Zeilen, die die Eingabe hatte und die Ausgabe nicht (ohne die vom Test geänderten).
 *
 * `_DONE` ist seit BL-307/ADR-v9-213 ausgenommen, und zwar als EINZIGER Tag: v9 schreibt
 * ihn bewusst nicht mehr, weil er dieselbe Aussage trägt wie `_TSTAT` und zwei Zeilen für
 * eine Aussage widersprüchlich werden können. Das ist kein Verlust — die Aussage steht
 * danach in `_TSTAT`, und der Test darunter belegt es. Die Ausnahme steht hier NAMENTLICH
 * statt als weiche Regel: sie ist die einzige Stelle, an der dieser Wächter etwas
 * durchgehen lässt.
 */
function fehlend(): string[] {
  const zaehl = (zs: string[]): Map<string, number> => {
    const m = new Map<string, number>();
    for (const z of zs) m.set(z, (m.get(z) ?? 0) + 1);
    return m;
  };
  const ma = zaehl(assembleLines(src)), mb = zaehl(gebaut());
  const out: string[] = [];
  for (const [z, n] of ma) {
    const d = n - (mb.get(z) ?? 0);
    if (d > 0 && !/^1 (_UID|ABBR) /.test(z) && !/^\d+ _DONE /.test(z)) out.push(`${d}x ${z}`);
  }
  return out;
}

describe('BL-302 — der Record-Neubau verliert keine Zeile mehr', () => {
  it('keine einzige Zeile geht verloren', () => {
    expect(fehlend()).toEqual([]);
  });

  it('(1) das ZWEITE `NOTE` am Ereignis überlebt', () => {
    const z = gebaut();
    expect(z).toContain('2 NOTE Erste Notiz am Ereignis');
    expect(z).toContain('2 NOTE Zweite Notiz am selben Ereignis');
  });

  it('(1) das ZWEITE `TEXT` an der Quelle überlebt', () => {
    const z = gebaut();
    expect(z).toContain('1 TEXT Erster Textblock der Quelle');
    expect(z).toContain('1 TEXT Zweiter Textblock derselben Quelle');
  });

  it('(1) ein `1 NAME` OHNE Wert bleibt stehen', () => {
    expect(gebaut()).toContain('1 NAME');
  });

  it('(2) `QUAY 0` wird geschrieben — „unzuverlässig" ist eine Aussage', () => {
    expect(gebaut()).toContain('3 QUAY 0');
    // Und der Unterschied ist im Modell abgebildet: ohne QUAY-Zeile bleibt es null.
    const ohne = parseGedcom('0 HEAD\n0 @I1@ INDI\n1 BIRT\n2 SOUR @S1@\n0 TRLR\n');
    expect(ohne.db.individuals.get('@I1@')!.birth.citations[0].quay).toBeNull();
    const mit = parseGedcom(src);
    expect(mit.db.individuals.get('@I1@')!.birth.citations[0].quay).toBe(0);
  });

  it('(2) `SEX U` wird geschrieben, wenn es in der Quelle stand — sonst nicht', () => {
    expect(gebaut()).toContain('1 SEX U');
    // Die Gegenprobe: ein Record OHNE SEX-Zeile bekommt keine (sonst 3179 neue Zeilen).
    const p = parseGedcom('0 HEAD\n0 @I9@ INDI\n1 NAME X /Y/\n0 TRLR\n');
    const roh = p.db.individuals.get('@I9@')!;
    expect(roh.sexSeen).toBe(false);
    p.db.individuals.set(roh.id, { ...roh, uid: 'ZZ' });
    expect(assembleLines(speichern(p.db, p.roots)).some((z) => z.startsWith('1 SEX'))).toBe(false);
  });

  it('(3) `_RESULT not-found` bleibt „nicht gefunden" — v8s Schreibweise', () => {
    const p = parseGedcom(src);
    expect(p.db.individuals.get('@I1@')!.researchLog[0].result).toBe('notfound');
    expect(gebaut()).toContain('2 _RESULT not-found');
  });

  // PRÄZISIERT MIT BL-307 (ADR-v9-213). Die Zusicherung war und bleibt „der Status geht
  // nicht verloren" — geprüft wurde sie daran, dass BEIDE Zeilen dastehen. Genau diese
  // Doppelung ist jetzt abgeschafft: `_DONE` wird gelesen, aber nicht mehr geschrieben.
  // Geprüft wird deshalb, was die Zusicherung meint — die Aussage überlebt, und zwar
  // genau einmal.
  it('(4) `_DONE 1` ohne `_TSTAT` bleibt erledigt — jetzt allein in `_TSTAT`', () => {
    const p = parseGedcom(src);
    expect(p.db.individuals.get('@I1@')!.tasks[0].status).toBe('done');
    const z = gebaut();
    expect(z).toContain('2 _TSTAT done');
    expect(z.some((x) => /^\d+ _DONE /.test(x))).toBe(false);
    // Und die Probe darauf, dass „genau einmal" auch „vollständig" heißt.
    const wieder = parseGedcom(speichern(parseGedcom(src).db, parseGedcom(src).roots));
    expect(wieder.db.individuals.get('@I1@')!.tasks[0].status).toBe('done');
  });

  it('zweimal speichern ändert nichts mehr (out1===out2)', () => {
    const p = parseGedcom(src);
    alleRecordsAendern(p.db);
    const out1 = speichern(p.db, p.roots);
    const p2 = parseGedcom(out1);
    expect(speichern(p2.db, p2.roots)).toBe(out1);
  });
});

// Warum es BEIDE Werkzeuge braucht — der Überschuss allein reicht nicht.
//
// Beim Negativtest fiel auf: schaltet man das `quay`-Tristate ab und lässt nur den
// Überschuss laufen, bleiben alle Zeilen trotzdem erhalten — der Überschuss ist ein
// GENERELLES Netz und fängt jeden Tag, den der Emitter nicht produziert. Byte-weise sieht
// das aus, als sei das Tristate überflüssig.
//
// Ist es nicht, und dieser Test ist der Grund: sobald der Nutzer einen Wert ÄNDERT, dessen
// alte Fassung der Emitter unterdrückt hätte, zieht das Netz die ALTE Zeile zusätzlich
// wieder ein — die Ausgabe trüge `QUAY 0` UND `QUAY 2`. Das Tristate verhindert das an der
// Wurzel: `wieGelesen` gibt die alte Zeile aus, die Zählung stimmt, es gibt keinen
// Überschuss. Das Netz fängt Bytes, das Tristate hält die Bedeutung — und nur zusammen
// ergeben sie einen Writer, der beim Editieren nichts verdoppelt.
describe('BL-302 — ein geänderter Default-Wert wird nicht verdoppelt', () => {
  it('`QUAY 0` → `QUAY 2`: nur die neue Zeile steht da', () => {
    const p = parseGedcom(src);
    const person = p.db.individuals.get('@I1@')!;
    const birth = person.birth;
    p.db.individuals.set(person.id, {
      ...person,
      birth: { ...birth, citations: [{ ...birth.citations[0], quay: 2 }] },
    });
    const z = assembleLines(speichern(p.db, p.roots));
    expect(z.filter((x) => /^\d+ QUAY /.test(x))).toEqual(['3 QUAY 2']);
  });

  it('`SEX U` → `SEX F`: nur die neue Zeile steht da', () => {
    const p = parseGedcom(src);
    const person = p.db.individuals.get('@I1@')!;
    p.db.individuals.set(person.id, { ...person, sex: 'F' });
    const z = assembleLines(speichern(p.db, p.roots));
    // Zwei Personen, je EINE SEX-Zeile — die alte `1 SEX U` von @I1@ ist weg, nicht daneben.
    expect(z.filter((x) => /^1 SEX /.test(x))).toHaveLength(2);
    expect(z.some((x) => x === '1 SEX U')).toBe(false);
  });
});

// Die Gegenprobe zum Überschuss-Mechanismus, und die Falle, gegen die er abgesichert sein
// MUSS: ein Wert, den der Nutzer LÖSCHT, darf nicht zurückkommen. Genau das ist beim Bau
// von BL-217 einmal passiert (`source-data-roundtrip.test.ts` wurde rot, weil ein
// entferntes `2 EVEN MARR` wieder auftauchte).
describe('BL-302 — der Überschuss holt keine LÖSCHUNG zurück', () => {
  it('eine gelöschte Ereignis-Notiz bleibt gelöscht', () => {
    const p = parseGedcom(src);
    const person = p.db.individuals.get('@I1@')!;
    p.db.individuals.set(person.id, { ...person, birth: { ...person.birth, note: '' } });
    const z = assembleLines(speichern(p.db, p.roots));
    expect(z.some((x) => x === '2 NOTE Erste Notiz am Ereignis')).toBe(false);
    // Die ZWEITE bleibt: sie war nie im Modell, also hat sie auch niemand gelöscht.
    expect(z).toContain('2 NOTE Zweite Notiz am selben Ereignis');
  });

  it('ein gelöschter Quellentext bleibt gelöscht', () => {
    const p = parseGedcom(src);
    const s = p.db.sources.get('@S1@')!;
    p.db.sources.set(s.id, { ...s, text: '' });
    const z = assembleLines(speichern(p.db, p.roots));
    expect(z.some((x) => x === '1 TEXT Erster Textblock der Quelle')).toBe(false);
    expect(z).toContain('1 TEXT Zweiter Textblock derselben Quelle');
  });
});
