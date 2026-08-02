// tests/roundtrip/task-done-abgeschafft.test.ts — BL-307 (ADR-v9-213): `_DONE` wird
// gelesen, aber nicht mehr geschrieben.
//
// WORUM ES GEHT. v8 führte zwei Tags für denselben Sachverhalt: `_DONE 0|1` (Erledigt-Haken)
// und, später dazugekommen, `_TSTAT todo|doing|done` (Kanban-Status, v8 `RES-PROJ 3a`).
// v8s Parser liest beide unabhängig, v8s Writer schreibt beide. v9 hat das übernommen —
// und damit zwei Zeilen für EINE Aussage.
//
// Das Modell schließt einen Widerspruch aus (`done === (status === 'done')`, Spec 12 §1,
// `tests/core/task-done-status.test.ts`); eine FREMDE Datei kann ihn aber mitbringen, und
// dann konservierte ihn der Wert-Halt aus ADR-v9-209 sogar — er hielte das abweichende
// `_DONE` für eine Modell-Normalisierung und schriebe es zurück. Deshalb trägt die Aussage
// nur noch `_TSTAT`.
//
// DIE FALLE, gegen die dieser Test vor allem abgesichert ist: einfach aufzuhören zu
// schreiben GENÜGT NICHT. `_DONE` ist ein modellierter `_TASK`-Kindtag — erzeugt der
// Emitter ihn nicht mehr, erzeugt ihn auch die Probe nicht, und der `ueberschuss` aus
// BL-302 schließt „das Modell kann ihn nicht halten" und zieht die ALTE Zeile verbatim
// wieder ein. Das Ergebnis wäre eine eingefrorene Zeile neben ihrer lebenden Nachfolgerin,
// also genau der Widerspruch, dessentwegen der Tag abgeschafft wurde.
import { describe, it, expect } from 'vitest';
import { parseGedcom, applyDatabaseToRoots, serializeGedcom } from '../../core/interop';
import { assembleLines } from './roundtrip-helpers';
import { REALBESTAND, realbestandText, realbestandVorhanden } from '../core/realdaten';
import type { Database } from '../../core/model/types';

const speichern = (db: Database, roots: Parameters<typeof serializeGedcom>[0]['roots']): string =>
  serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots) });

/** Eine Aufgabe mit BEIDEN Tags, eine nur mit `_DONE` (v8 vor sw v307), eine widersprüchlich. */
const src = [
  '0 HEAD', '1 GEDC', '2 VERS 5.5.1',
  '0 @I1@ INDI',
  '1 NAME Max /Muster/',
  '1 _TASK Beide Tags, einig',
  '2 _CAT kirchenbuch',
  '2 _DONE 1',
  '2 _TSTAT done',
  '2 _ID t_a',
  '1 _TASK Nur der alte Haken',
  '2 _CAT online',
  '2 _DONE 1',
  '2 _ID t_b',
  '1 _TASK Widersprüchlich — der Status gewinnt',
  '2 _DONE 1',
  '2 _TSTAT todo',
  '2 _ID t_c',
  '0 TRLR',
].join('\n');

const gebaut = (): string[] => {
  const p = parseGedcom(src);
  for (const [id, x] of [...p.db.individuals]) p.db.individuals.set(id, { ...x, uid: `${x.uid}ZZ` });
  return assembleLines(speichern(p.db, p.roots));
};

describe('BL-307 — `_DONE` verschwindet beim Neubau, die Aussage bleibt', () => {
  it('keine einzige `_DONE`-Zeile in der Ausgabe', () => {
    expect(gebaut().filter((z) => /^\d+ _DONE\b/.test(z))).toEqual([]);
  });

  it('die Falle: der Überschuss zieht die alte Zeile NICHT wieder ein', () => {
    // Ohne den `ABGESCHAFFT`-Eintrag stünde hier `2 _DONE 1` — verbatim aus dem Original,
    // eingefroren neben dem lebenden `_TSTAT`. Der Test ist die Wirkungsprobe.
    const z = gebaut();
    expect(z.some((x) => x === '2 _DONE 1')).toBe(false);
    expect(z.filter((x) => /^2 _TSTAT\b/.test(x))).toHaveLength(3);
  });

  it('jede der drei Aufgaben behält ihren Status über den Neubau', () => {
    const vorher = parseGedcom(src).db.individuals.get('@I1@')!.tasks;
    expect(vorher.map((t) => t.status)).toEqual(['done', 'done', 'todo']);
    const p = parseGedcom(src);
    for (const [id, x] of [...p.db.individuals]) p.db.individuals.set(id, { ...x, uid: 'ZZ' });
    const nachher = parseGedcom(speichern(p.db, p.roots)).db.individuals.get('@I1@')!.tasks;
    expect(nachher.map((t) => t.status)).toEqual(['done', 'done', 'todo']);
    expect(nachher.map((t) => t.done)).toEqual([true, true, false]);
  });

  it('der Widerspruch wird aufgelöst statt konserviert — `_TSTAT` gewinnt', () => {
    // Vorher hielt `haltWert` das abweichende `_DONE 1` fest; jetzt gibt es die Zeile nicht
    // mehr, an der sich der Widerspruch festmachen könnte.
    const z = gebaut();
    expect(z).toContain('2 _TSTAT todo');
    expect(z.some((x) => /_DONE/.test(x))).toBe(false);
  });

  it('LESEN bleibt: eine Aufgabe mit NUR `_DONE 1` ist erledigt', () => {
    const t = parseGedcom(src).db.individuals.get('@I1@')!.tasks[1];
    expect({ status: t.status, done: t.done }).toEqual({ status: 'done', done: true });
  });

  it('unverändert gespeichert bleibt die Datei unangetastet — kein grundloser Neubau', () => {
    const p = parseGedcom(src);
    const out = speichern(p.db, p.roots);
    expect(out.replace(/\r\n/g, '\n').trimEnd()).toBe(src.trimEnd());
    expect(out).toContain('_DONE'); // der Passthrough eines unberührten Records bleibt
  });

  it('zweimal speichern ändert nichts mehr (out1===out2)', () => {
    const p = parseGedcom(src);
    for (const [id, x] of [...p.db.individuals]) p.db.individuals.set(id, { ...x, uid: 'ZZ' });
    const out1 = speichern(p.db, p.roots);
    const p2 = parseGedcom(out1);
    expect(speichern(p2.db, p2.roots)).toBe(out1);
  });
});

// Der Wächter an der maßgeblichen Datei (TST-21): 21 `_TASK`, davon 16 mit `_TSTAT`.
// Nach dem Neubau tragen alle 21 genau ein `_TSTAT` und kein `_DONE` mehr.
describe.skipIf(!realbestandVorhanden())(`BL-307 — Wächter am Realbestand (${REALBESTAND.datei})`, () => {
  it('21 Aufgaben, 21 `_TSTAT`, 0 `_DONE` — und kein Status geht verloren', () => {
    const quelle = realbestandText();
    const p = parseGedcom(quelle);
    const vorher = [...p.db.individuals.values()].flatMap((x) => x.tasks.map((t) => t.status))
      .concat([...p.db.families.values()].flatMap((x) => x.tasks.map((t) => t.status)));
    for (const [id, x] of [...p.db.individuals]) p.db.individuals.set(id, { ...x, uid: `${x.uid}ZZ` });
    for (const [id, x] of [...p.db.families]) p.db.families.set(id, { ...x, lastChanged: '1 JAN 2099' });
    const out = speichern(p.db, p.roots);
    const zaehle = (t: string, re: RegExp): number => t.split(/\r?\n/).filter((z) => re.test(z)).length;
    expect({
      task: zaehle(out, /^\d+ _TASK/),
      tstat: zaehle(out, /^\d+ _TSTAT/),
      done: zaehle(out, /^\d+ _DONE/),
    }).toEqual({ task: 21, tstat: 21, done: 0 });
    const q = parseGedcom(out);
    const nachher = [...q.db.individuals.values()].flatMap((x) => x.tasks.map((t) => t.status))
      .concat([...q.db.families.values()].flatMap((x) => x.tasks.map((t) => t.status)));
    expect(nachher).toEqual(vorher);
  });
});
