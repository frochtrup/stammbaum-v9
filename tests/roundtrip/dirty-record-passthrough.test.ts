// tests/roundtrip/dirty-record-passthrough.test.ts — BL-285: ein GEÄNDERTER Record darf
// beim Speichern nichts verlieren.
//
// WARUM DIESER TEST FEHLTE (ADR-v9-196): RT-1/RT-2 prüfen `parse → serialize` OHNE
// Änderung. Der Pfad, den die App bei jedem Speichern geht, führt aber über
// `applyDatabaseToRoots` — und der baut jeden ERKANNTEN Kindknoten aus dem Modell neu.
// Verlustfrei ist das nur, wenn das Modell den Knoten VOLLSTÄNDIG abbildet. `RELI` hält
// im Modell einen String (`religion`), `FAMC` eine Id, `OBJE.FILE` keinen Titel — was
// darunter hängt, fällt weg. Am Realbestand kostete EINE umbenannte Person 12 logische
// Zeilen: zwei komplette Quellenzitate und vier Medien-Titel.
//
// Die Fixture trägt genau die drei am Realbestand gemessenen Verlustklassen
// (`INDI>RELI>*`, `INDI>FAMC>SOUR*`, `INDI>OBJE>FILE>TITL`) — sie ist damit die
// Reproduktion in klein, nicht ein erfundener Grenzfall.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGedcom, applyDatabaseToRoots, serializeGedcom } from '../../core/interop';
import { assembleLines } from './roundtrip-helpers';
import { modellierteKinder } from '../../core/interop/write-back';
import { emitPerson, emitFamily, emitSource, emitRepository } from '../../core/interop/write-back-emit';
import type { Database } from '../../core/model/types';
import type { GedNode } from '../../core/interop/gedcom-tree';
import { realbestandText, realbestandVorhanden } from '../core/realdaten';

const FIXTURE = join(__dirname, '../fixtures/dirty-passthrough.small.ged');

/** Logische Zeilen als Multimenge — positionsunabhängig (ein Positionsvergleich verrutscht
 *  bei jeder Einfügung und meldet dann alles als Drift). */
function multiset(text: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const z of assembleLines(text)) m.set(z, (m.get(z) ?? 0) + 1);
  return m;
}

/** Was der Ausgabetext gegenüber der Quelle VERLOREN hat (erwartete Änderung ausgenommen). */
function verloren(src: string, out: string, erwartetWeg: readonly string[]): string[] {
  const a = multiset(src), b = multiset(out);
  const fehlt: string[] = [];
  for (const [k, n] of a) {
    const d = n - (b.get(k) ?? 0);
    if (d > 0 && !erwartetWeg.includes(k)) fehlt.push(`−${d}× ${k}`);
  }
  return fehlt;
}

/**
 * Sammelt Eltern-Kind-Paare der reinen EMISSION, die `MODELLIERTE_KINDER` nicht kennt.
 *
 * Zwei bewusste Ausnahmen, beide vom ersten Lauf am Realbestand erzwungen:
 * `CONC`/`CONT` sind Fortsetzungen des Elternwerts, keine Kinder; und `OBJE` führt mit
 * `MediaCitation.extra` einen PASSTHROUGH-CONTAINER — was dort hineingeparst wurde,
 * emittiert der Writer unverändert wieder (`_SCBK`, `_PRIM_CUTOUT`, `_FILESIZE` … je
 * nach Quelldatei). Solche Tags sind datenabhängig; sie in die Tabelle zu schreiben
 * hieße, den Bestand einer Datei zur Struktur zu erklären.
 *
 * `ADDR` ist seit ADR-v9-228 der zweite Container dieser Art (`Event.addrExtra`) — aus
 * demselben Grund: was der Writer dort ausgibt, hat er vorher genau so gelesen, und die
 * Tag-Menge (`ADR1`/`ADR2`/`CITY`/`POST`/`CTRY` … oder was ein fremdes Programm sonst
 * unter eine Adresse hängt) ist eine Eigenschaft der Quelldatei, nicht des Formats.
 */
function sammleDrift(db: Database, fehlend: string[]): void {
  const PASSTHROUGH_CONTAINER = new Set(['OBJE', 'ADDR']);
  const pruefe = (node: GedNode, tiefe: number) => {
    if (tiefe > 0 && !PASSTHROUGH_CONTAINER.has(node.tag)) {
      const bekannt = new Set(modellierteKinder(node.tag));
      for (const k of node.children)
        if (!bekannt.has(k.tag) && k.tag !== 'CONC' && k.tag !== 'CONT') fehlend.push(`${node.tag}>${k.tag}`);
    }
    for (const k of node.children) pruefe(k, tiefe + 1);
  };
  for (const person of db.individuals.values()) pruefe(emitPerson(person), 0);
  for (const fam of db.families.values()) pruefe(emitFamily(fam), 0);
  // Auch Quellen und Archive: der Tiefen-Passthrough greift für JEDEN Record-Typ. Dass der
  // Guard sie anfangs ausließ, war der Grund, warum die `DATA`-Lücke erst ein anderer Test
  // fand (`source-data-roundtrip.test.ts`) — ein Guard, der weniger prüft als der Fix
  // verändert, ist eine halbe Zusicherung.
  for (const q of db.sources.values()) pruefe(emitSource(q), 0);
  for (const a of db.repositories.values()) pruefe(emitRepository(a), 0);
}

describe('BL-285 — ein geänderter Record verliert nichts', () => {
  const src = readFileSync(FIXTURE, 'utf8');

  it('Umbenennung: nur der Name ändert sich, alles andere bleibt', () => {
    const p = parseGedcom(src);
    const person = p.db.individuals.get('@I1@')!;
    p.db.individuals.set('@I1@', { ...person, given: 'Geaendert' });
    const out = serializeGedcom({ db: p.db, roots: applyDatabaseToRoots(p.db, p.roots) });

    // Der Name SOLL sich ändern — alles andere nicht.
    expect(verloren(src, out, ['2 GIVN Anna', '1 NAME Anna /Muster/'])).toEqual([]);
  });

  it('unveränderter Record bleibt ohnehin byte-identisch (Kontrollfall)', () => {
    const p = parseGedcom(src);
    const out = serializeGedcom({ db: p.db, roots: applyDatabaseToRoots(p.db, p.roots) });
    expect(verloren(src, out, [])).toEqual([]);
  });

  // Die GEGENPROBE, ohne die der Fix wertlos wäre (ADR-v9-197): der Passthrough darf nur
  // retten, was das Modell NICHT kennt. Gelöscht wird deshalb ein Feld, das das Modell
  // SEHR WOHL kennt (`GIVN` → `Person.given`) — es muss verschwinden.
  //
  // Erster Anlauf dieses Tests löschte ein `FAMC>SOUR`-Zitat und schlug fehl: dieses Feld
  // ist gar nicht modelliert (der Emitter schreibt unter FAMC nur PEDI/_FREL/_MREL), es
  // KANN vom Nutzer nicht gelöscht werden, und der Passthrough hat es korrekt gerettet.
  // Ein Löschungs-Test muss ein Feld treffen, das es zu löschen gibt.
  it('LÖSCHUNG bleibt wirksam: ein entferntes modelliertes Feld kommt nicht zurück', () => {
    const p = parseGedcom(src);
    const person = p.db.individuals.get('@I1@')!;
    p.db.individuals.set('@I1@', { ...person, given: '' });
    const out = serializeGedcom({ db: p.db, roots: applyDatabaseToRoots(p.db, p.roots) });

    const zeilen = assembleLines(out);
    expect(zeilen.filter((z) => z.startsWith('2 GIVN'))).toEqual([]);
    // Gegenprobe im selben Knoten: der un-modellierte Nachbar bleibt.
    expect(zeilen.filter((z) => z === '2 SURN Muster')).toHaveLength(1);
  });

  // Drift-Guard: die statische Tabelle darf nicht hinter dem Emitter zurückbleiben. Fehlt
  // dort ein Eltern-Kind-Paar, das der Writer erzeugen kann, gilt das Kind als
  // „un-modelliert" — und eine Löschung dieses Feldes würde wirkungslos.
  //
  // Geprüft wird die REINE EMISSION (`emitPerson`/`emitFamily`), nicht der gemergte Baum:
  // der trägt den geretteten Passthrough bereits in sich und meldete genau ihn als Drift —
  // ein zirkulärer Guard, der immer rot ist. (Erster Anlauf; korrigiert.)
  it('Drift-Guard: jedes Eltern-Kind-Paar der Emission steht in MODELLIERTE_KINDER', () => {
    const p = parseGedcom(src);
    const fehlend: string[] = [];
    sammleDrift(p.db, fehlend);
    expect([...new Set(fehlend)].sort()).toEqual([]);
  });
});

// Derselbe Drift-Guard am ECHTEN Bestand: die kleine Fixture kennt nur eine Handvoll
// Konstrukte, der Realbestand alle, die real vorkommen. Skippt sauber, wenn die (gitignorte)
// Datei fehlt — dann trägt der Basisfall oben.
describe.skipIf(!realbestandVorhanden())('BL-285 — Drift-Guard am Realbestand', () => {
  it('kein Eltern-Kind-Paar der Emission fehlt in der Tabelle', () => {
    const p = parseGedcom(realbestandText());
    const fehlend: string[] = [];
    sammleDrift(p.db, fehlend);
    expect([...new Set(fehlend)].sort()).toEqual([]);
  });
});
