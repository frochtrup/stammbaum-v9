// tests/roundtrip/event-value-conc.test.ts — BL-355 (ADR-v9-266): der EREIGNISWERT trägt
// seine `CONC`/`CONT`-Fortsetzungen — beim Lesen und beim Neubau.
//
// WORUM ES GEHT. `parseEvent` las den Ereigniswert als `node.value` statt als
// `collectText(node)` — die drei Nachbarzeilen derselben Funktion (`ADDR`, `NOTE`) machten es
// richtig. Läuft ein Wert in der Datei über `2 CONC` weiter, endete er im Modell nach dem
// ersten Fragment: am Realbestand 242 statt 360 Zeichen an einer Hofgeschichte. Der Nutzer
// sah den abgeschnittenen Text, und beim Neubau des Records schrieb der Emitter ihn so
// zurück — der Rest war aus der Datei verschwunden. Genau das ist zwischen zwei Exporten
// des Bestands passiert (11.08. trägt die Zeile, 13.08. nicht mehr); der Passthrough kann
// hier NICHTS retten, weil `CONC`/`CONT` bewusst nicht als un-modellierte Kinder übernommen
// werden (write-back.ts `FORTSETZUNG` — sonst hängten die alten Fragmente an jedem neuen
// Wert).
//
// DIE FALLE, WESHALB BEIDE HÄLFTEN ZUSAMMEN FALLEN MÜSSEN. `collectText` faltet `CONT` als
// `\n` in den Wert. Ein Wert mit `\n`, roh in `N(ev.type, ev.value, …)` gegeben, ergäbe eine
// Zeile mit eingebettetem Zeilenumbruch — kaputtere Ausgabe als vorher. Der Emitter bildet
// den Wert deshalb über `textNode` ab, UND die entstehenden `CONT`-Kinder stehen VOR
// `TYPE`/`DATE`/`PLAC`: eine Fortsetzung gehört unmittelbar an ihre Zeile, sonst setzt sie
// beim nächsten Lesen den falschen Elternwert fort.
//
// GEMESSEN WIRD DER NEUBAU: ein unveränderter Record gibt den Original-Knoten zurück und
// beweist über den Writer nichts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGedcom, applyDatabaseToRoots, serializeGedcom } from '../../core/interop';
import { assembleLines } from './roundtrip-helpers';
import type { Database } from '../../core/model/types';

const src = readFileSync(join(__dirname, '../fixtures/event-value-conc.small.ged'), 'utf8');

const speichern = (db: Database, roots: Parameters<typeof serializeGedcom>[0]['roots']): string =>
  serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots) });

/** Rein ADDITIV schmutzig machen — erzwingt den Neubau, ohne selbst etwas zu ändern. */
function alleRecordsAendern(db: Database): void {
  for (const [id, p] of [...db.individuals]) db.individuals.set(id, { ...p, uid: `${p.uid}ZZ` });
  for (const [id, f] of [...db.families]) db.families.set(id, { ...f, extraNotes: [...f.extraNotes, 'ZZ'] });
}

const gebaut = (): string => {
  const p = parseGedcom(src);
  alleRecordsAendern(p.db);
  return speichern(p.db, p.roots);
};

const ROH_ZEILEN = (t: string): string[] => t.split(/\r\n|\r|\n/).filter((z) => z !== '');

const HOF_ANFANG = '1680 zahlte der Hofbesitzer';
const HOF_SCHLUSS = ', kleines Maß, auch Coesfelder Maße, 50 Scheffel, item zwei Tage Arbeit.';

describe('BL-355 — der Ereigniswert trägt seine Fortsetzungen ins Modell', () => {
  it('die Fixture trägt die Form (sonst prüft der Test nichts)', () => {
    expect(ROH_ZEILEN(src).some((z) => /^1 EVEN 1680 zahlte/.test(z))).toBe(true);
    expect(ROH_ZEILEN(src).some((z) => /^2 CONC , kleines Maß/.test(z))).toBe(true);
    expect(ROH_ZEILEN(src).some((z) => /^2 CONT zuletzt Heuermann/.test(z))).toBe(true);
  });

  it('`CONC`: der Wert ist vollständig, ohne Trennzeichen angehängt', () => {
    const p = parseGedcom(src);
    const ev = p.db.individuals.get('@I1@')!.events.find((e) => e.type === 'EVEN')!;
    expect(ev.value.startsWith(HOF_ANFANG)).toBe(true);
    expect(ev.value.endsWith(HOF_SCHLUSS)).toBe(true);
    expect(ev.value).not.toContain('\n');
  });

  it('`CONT`: der Umbruch steht als `\\n` im Wert', () => {
    const p = parseGedcom(src);
    const ev = p.db.individuals.get('@I2@')!.events.find((e) => e.type === 'OCCU')!;
    expect(ev.value).toBe('Kötter und Tagelöhner\nzuletzt Heuermann auf dem Hof Schulte');
  });

  it('am Familien-Ereignis gilt dasselbe (die Geschwister-Stelle)', () => {
    const p = parseGedcom(src);
    const ev = p.db.families.get('@F1@')!.events.find((e) => e.type === 'EVEN')!;
    expect(ev.value.endsWith(', wie das Protokoll des Gutsherrn ausweist.')).toBe(true);
  });

  it('der Neubau ALLER Records verliert keine logische Zeile', () => {
    const zaehl = (t: string): Map<string, number> => {
      const m = new Map<string, number>();
      for (const z of assembleLines(t)) m.set(z, (m.get(z) ?? 0) + 1);
      return m;
    };
    const ma = zaehl(src), mb = zaehl(gebaut());
    const fehlend: string[] = [];
    for (const [z, n] of ma) {
      const d = n - (mb.get(z) ?? 0);
      if (d > 0 && !/^1 _UID /.test(z)) fehlend.push(`${d}x ${z}`);
    }
    expect(fehlend).toEqual([]);
  });

  it('die Fortsetzung steht direkt hinter ihrer Zeile, VOR TYPE/DATE', () => {
    const z = ROH_ZEILEN(gebaut());
    // EVEN: eine `2 CONC`-Fortsetzung (der Wert sprengt die 255-Byte-Grenze wieder).
    const iEven = z.findIndex((x) => x.startsWith('1 EVEN 1680 zahlte'));
    expect(iEven).toBeGreaterThan(-1);
    expect(z[iEven + 1].startsWith('2 CONC ')).toBe(true);
    // OCCU: die `2 CONT`-Zeile des mehrzeiligen Werts, dann erst DATE/PLAC.
    const iOccu = z.findIndex((x) => x === '1 OCCU Kötter und Tagelöhner');
    expect(iOccu).toBeGreaterThan(-1);
    expect(z[iOccu + 1]).toBe('2 CONT zuletzt Heuermann auf dem Hof Schulte');
    expect(z[iOccu + 2]).toBe('2 DATE 1900');
  });

  it('KEINE Ausgabezeile trägt einen eingebetteten Zeilenumbruch', () => {
    // Die Falle aus dem Kopfkommentar: `textNode` statt roher Wert. Ein `\n` im Wert
    // erzeugte sonst eine Zeile, die kein Leser mehr als GEDCOM-Zeile sieht.
    for (const z of ROH_ZEILEN(gebaut())) expect(z).not.toContain('\n');
    expect(ROH_ZEILEN(gebaut()).every((z) => /^\d+ /.test(z))).toBe(true);
  });

  it('zweimal speichern ändert nichts mehr (out1===out2)', () => {
    const p = parseGedcom(src);
    alleRecordsAendern(p.db);
    const out1 = speichern(p.db, p.roots);
    const p2 = parseGedcom(out1);
    expect(speichern(p2.db, p2.roots)).toBe(out1);
  });
});
