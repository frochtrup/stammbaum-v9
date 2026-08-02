// tests/roundtrip/media-shared-inline.test.ts — BL-306 (ADR-v9-212): die globalen Felder
// eines geteilten inline-Mediums erscheinen nur dort, wo sie standen.
//
// WORUM ES GEHT. Ein inline-Medium hat keinen eigenen Record: `FORM` und `MEDI` beschreiben
// die DATEI, stehen physisch aber am `OBJE` JEDER verweisenden Stelle — und die Stellen
// dürfen einander widersprechen. `db.media` ist nach Dateipfad geschlüsselt und hält genau
// eine Fassung (erstes Vorkommen gewinnt, `definingMediaNodes`); der Emitter schrieb sie an
// alle Fundstellen zurück, auch an die, die sie nie hatten (+5 Zeilen an
// `Unsere Familie 2026.ged`).
//
// Am Realbestand gemessen: 396 von 641 inline-Medien sind mehrfach referenziert, 6 davon
// uneinig — und **291 Records tragen zugleich die definierende und eine weitere Fundstelle
// desselben Mediums**. Deshalb ist die Frage PRO FUNDSTELLE zu stellen, nicht pro Record;
// die Fixture bildet genau das ab (@I1@ trägt beide Fundstellen).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGedcom, applyDatabaseToRoots, serializeGedcom } from '../../core/interop';
import { assembleLines } from './roundtrip-helpers';
import { REALBESTAND, realbestandText, realbestandVorhanden } from '../core/realdaten';
import type { Database } from '../../core/model/types';

const src = readFileSync(join(__dirname, '../fixtures/media-shared-inline.small.ged'), 'utf8');

const speichern = (db: Database, roots: Parameters<typeof serializeGedcom>[0]['roots']): string =>
  serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots) });

/** Rein ADDITIV schmutzig machen — geprüft wird der NEUBAU. */
function alleRecordsAendern(db: Database): void {
  for (const [id, p] of [...db.individuals]) db.individuals.set(id, { ...p, uid: `${p.uid}ZZ` });
}

const gebaut = (): string[] => {
  const p = parseGedcom(src);
  alleRecordsAendern(p.db);
  return assembleLines(speichern(p.db, p.roots));
};

describe('BL-306 — der Neubau erfindet keine globalen Medien-Zeilen', () => {
  it('die Fundstelle, die `MEDI` trug, behält es — die andere bekommt keins', () => {
    const z = gebaut();
    // Beide Fundstellen desselben Mediums liegen in @I1@ — eine mit, eine ohne MEDI.
    expect(z.filter((x) => /^\d+ MEDI photo$/.test(x))).toHaveLength(1);
    // Und `FORM` steht weiterhin an BEIDEN (dort stand es in der Quelle auch).
    expect(z.filter((x) => /^\d+ FORM bmp$/.test(x))).toHaveLength(2);
  });

  it('das Modell hält den Typ trotzdem — die Auskunft ist referenz-spezifisch', () => {
    const p = parseGedcom(src);
    const m = p.db.media.get('Pictures/familie.bmp')!;
    expect({ type: m.type, typeWire: m.typeWire }).toEqual({ type: 'photo', typeWire: 'photo' });
    const person = p.db.individuals.get('@I1@')!;
    expect(person.media[0].typeSeen).toBe(true);            // die definierende Fundstelle
    expect(person.birth.media[0].typeSeen).toBe(false);     // die zweite
    expect(person.birth.media[0].formSeen).toBe(true);      // `FORM` stand dort sehr wohl
  });

  it('die Bilanz: keine Zeile verloren, keine erfunden', () => {
    const zaehl = (zs: string[]): Map<string, number> => {
      const m = new Map<string, number>();
      for (const z of zs) m.set(z, (m.get(z) ?? 0) + 1);
      return m;
    };
    const ein = zaehl(assembleLines(src)), aus = zaehl(gebaut());
    const nurTest = (z: string): boolean => /^1 _UID /.test(z);
    const fehlend: string[] = [], erfunden: string[] = [];
    for (const [z, n] of ein) if (n - (aus.get(z) ?? 0) > 0 && !nurTest(z)) fehlend.push(z);
    for (const [z, n] of aus) if (n - (ein.get(z) ?? 0) > 0 && !nurTest(z)) erfunden.push(z);
    expect({ fehlend, erfunden }).toEqual({ fehlend: [], erfunden: [] });
  });

  it('zweimal speichern ändert nichts mehr (out1===out2)', () => {
    const p = parseGedcom(src);
    alleRecordsAendern(p.db);
    const out1 = speichern(p.db, p.roots);
    const p2 = parseGedcom(out1);
    expect(speichern(p2.db, p2.roots)).toBe(out1);
  });
});

// Die andere Hälfte, und der Grund, warum „nur wo es stand" allein FALSCH wäre: ein
// Nutzer-Edit am globalen Feld muss die Datei erreichen (BL-290/ADR-v9-207). Ohne diese
// Klausel verschwände er lautlos — der erste Bau hat genau daran einen bestehenden Test
// gebrochen.
describe('BL-306 — ein Edit am globalen Feld kommt trotzdem an', () => {
  const editiere = (mediaId: string, patch: Record<string, unknown>): string[] => {
    const p = parseGedcom(src);
    const m = p.db.media.get(mediaId)!;
    p.db.media.set(m.id, { ...m, ...patch });
    return assembleLines(speichern(p.db, p.roots));
  };

  it('ein Typ, den die Quelle NIRGENDS hatte, wird geschrieben', () => {
    // `1 OBJE` / `2 FILE` / `3 FORM` / `4 MEDI` — die Zeile hängt unter FORM, nicht unter OBJE.
    const z = editiere('Documents/urkunde.jpg', { type: 'photo' });
    expect(z).toContain('4 MEDI photo');
  });

  it('ein GEÄNDERTER Typ erscheint auch an der Fundstelle, die ihn nicht trug', () => {
    const z = editiere('Pictures/familie.bmp', { type: 'document' });
    expect(z.filter((x) => /^\d+ MEDI document$/.test(x))).toHaveLength(2);
    expect(z.some((x) => /^\d+ MEDI photo$/.test(x))).toBe(false);
  });

  it('ein geänderter Dateiname erreicht beide Fundstellen', () => {
    const z = editiere('Pictures/familie.bmp', { file: 'Pictures/familie-neu.bmp' });
    expect(z.filter((x) => /^\d+ FILE Pictures\/familie-neu\.bmp$/.test(x))).toHaveLength(2);
  });

  it('OHNE Edit bleibt die Datei unangetastet — kein grundloser Neubau', () => {
    const p = parseGedcom(src);
    expect(speichern(p.db, p.roots).replace(/\r\n/g, '\n').trimEnd()).toBe(src.trimEnd());
  });
});

// Der Wächter an der maßgeblichen Datei (TST-21): vor dem Bau ergänzte der Neubau aller
// Records dort +5 `MEDI photo`-Zeilen — der Rest der BL-304-Messung.
describe.skipIf(!realbestandVorhanden())(`BL-306 — Wächter am Realbestand (${REALBESTAND.datei})`, () => {
  it('der Neubau ALLER Records ergänzt keine `FORM`/`MEDI`-Zeile', () => {
    const quelle = realbestandText();
    const p = parseGedcom(quelle);
    for (const [id, x] of [...p.db.individuals]) p.db.individuals.set(id, { ...x, uid: `${x.uid}ZZ` });
    for (const [id, x] of [...p.db.families]) p.db.families.set(id, { ...x, lastChanged: '1 JAN 2099' });
    for (const [id, x] of [...p.db.sources]) p.db.sources.set(id, { ...x, abbr: `${x.abbr}ZZ` });
    const zaehl = (t: string): Map<string, number> => {
      const m = new Map<string, number>();
      for (const z of assembleLines(t)) {
        if (/^\d+ (FORM|MEDI)\b/.test(z)) m.set(z, (m.get(z) ?? 0) + 1);
      }
      return m;
    };
    const ein = zaehl(quelle), aus = zaehl(speichern(p.db, p.roots));
    const erfunden: string[] = [], verloren: string[] = [];
    for (const [z, n] of aus) if (n - (ein.get(z) ?? 0) > 0) erfunden.push(`+${n - (ein.get(z) ?? 0)} ${z}`);
    for (const [z, n] of ein) if (n - (aus.get(z) ?? 0) > 0) verloren.push(`-${n - (aus.get(z) ?? 0)} ${z}`);
    expect({ erfunden, verloren }).toEqual({ erfunden: [], verloren: [] });
  });
});
