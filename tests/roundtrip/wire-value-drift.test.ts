// tests/roundtrip/wire-value-drift.test.ts — BL-303 (ADR-v9-209): ein Wert, den das Modell
// nicht kennt, überlebt das Speichern — ohne dass sein Tag namentlich bekannt sein muss.
//
// WORUM ES GEHT. Der Überschuss aus BL-302 ist ZÄHL-basiert: er fängt „ein Knoten ist
// verschwunden". Eine WERT-Umschreibung sieht er nicht, denn dort stimmt die Anzahl. Genau
// dort saßen die stillen Umdeutungen, die bis dahin einzeln behoben werden mussten (`FORM`,
// `QUAY 0`, `SEX U`, `_RESULT`) — und der Nutzer hat die richtige Frage gestellt:
// optimieren wir für die vorliegenden Dateien oder allgemein?
//
// Diese Fixture beantwortet sie mit Werten, die in KEINER vorliegenden Datei stehen: eine
// deutsche Aufgaben-Status-Angabe, eine deutsche Hypothesen-Status-Angabe, ein numerisches
// Gewicht, eine abweichende Schreibweise des Suchergebnisses. Alle vier wurden vorher still
// umgeschrieben, ohne dass ein Test anschlug:
//
//   2 _TSTAT erledigt  → todo       (Bedeutung INVERTIERT — aus „erledigt" wurde „offen")
//   2 _HSTAT offen     → open       (Bedeutung erhalten, Bytes geändert)
//   2 _HWGT 7          → medium     (eine Zahl wird zur Kategorie)
//   2 _RESULT Not_Found→ not-found  (Bedeutung erhalten, Bytes geändert)
//
// GEMESSEN WIRD DER NEUBAU: ein unveränderter Record gibt den Original-Knoten zurück und
// beweist über den Writer nichts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGedcom, applyDatabaseToRoots, serializeGedcom } from '../../core/interop';
import { assembleLines } from './roundtrip-helpers';
import type { Database } from '../../core/model/types';

const src = readFileSync(join(__dirname, '../fixtures/wire-value-drift.small.ged'), 'utf8');

const speichern = (db: Database, roots: Parameters<typeof serializeGedcom>[0]['roots']): string =>
  serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots) });

/** Rein ADDITIV schmutzig machen — erzwingt den Neubau, ohne selbst etwas zu ändern. */
function alleRecordsAendern(db: Database): void {
  for (const [id, p] of [...db.individuals]) db.individuals.set(id, { ...p, uid: `${p.uid}ZZ` });
  for (const [id, s] of [...db.sources]) db.sources.set(id, { ...s, abbr: `${s.abbr}ZZ` });
}

const gebaut = (): string[] => {
  const p = parseGedcom(src);
  alleRecordsAendern(p.db);
  return assembleLines(speichern(p.db, p.roots));
};

const FREMDE_WERTE = ['2 _TSTAT erledigt', '2 _HSTAT offen', '2 _HWGT 7', '2 _RESULT Not_Found'];

describe('BL-303 — fremde Werte überleben, ohne dass ihr Tag bekannt sein muss', () => {
  it('die Fixture trägt die vier Werte (sonst prüft der Test nichts)', () => {
    const z = assembleLines(src);
    for (const w of FREMDE_WERTE) expect(z).toContain(w);
  });

  it('alle vier stehen nach dem Neubau unverändert da', () => {
    const z = gebaut();
    for (const w of FREMDE_WERTE) expect(z).toContain(w);
  });

  it('das MODELL liest sie weiterhin normalisiert — der Halt betrifft nur die Datei', () => {
    // Wichtig für die Erwartungshaltung: BL-303 heilt nicht die ANZEIGE. Eine Aufgabe mit
    // `_TSTAT erledigt` steht in der App weiter auf „offen"; sie geht nur nicht mehr
    // verloren. Das Modell zu erweitern, ist eine andere Frage.
    const p = parseGedcom(src);
    const person = p.db.individuals.get('@I1@')!;
    expect(person.tasks[0].status).toBe('todo');
    expect(person.hypotheses[0].status).toBe('open');
    expect(person.hypotheses[0].weight).toBe('medium');
  });

  it('zweimal speichern ändert nichts mehr (out1===out2)', () => {
    const p = parseGedcom(src);
    alleRecordsAendern(p.db);
    const out1 = speichern(p.db, p.roots);
    const p2 = parseGedcom(out1);
    expect(speichern(p2.db, p2.roots)).toBe(out1);
  });
});

// Die Gegenprobe, ohne die der Halt eine Sperre wäre: eine NUTZER-Änderung muss den
// festgehaltenen Wert schlagen. Sonst wäre ein Feld mit fremdem Wert für immer eingefroren
// — der Fehler, den ADR-v9-81 benennt (ein Freeze gegen Automatik ist kein Freeze gegen
// bewusste Änderungen).
describe('BL-303 — ein Nutzer-Edit schlägt den festgehaltenen Wert', () => {
  it('Aufgabenstatus geändert: `erledigt` weicht dem neuen Wert', () => {
    const p = parseGedcom(src);
    const person = p.db.individuals.get('@I1@')!;
    p.db.individuals.set(person.id, {
      ...person,
      tasks: [{ ...person.tasks[0], status: 'done', done: true }],
    });
    const z = speichern(p.db, p.roots);
    const zeilen = assembleLines(z);
    expect(zeilen).toContain('2 _TSTAT done');
    expect(zeilen.some((x) => x === '2 _TSTAT erledigt')).toBe(false);
  });

  it('Hypothesen-Gewicht geändert: `7` weicht dem neuen Wert', () => {
    const p = parseGedcom(src);
    const person = p.db.individuals.get('@I1@')!;
    p.db.individuals.set(person.id, {
      ...person,
      hypotheses: [{ ...person.hypotheses[0], weight: 'high' }],
    });
    const zeilen = assembleLines(speichern(p.db, p.roots));
    expect(zeilen).toContain('2 _HWGT high');
    expect(zeilen.some((x) => x === '2 _HWGT 7')).toBe(false);
  });
});

// Die Falle, in die der erste Bau des Wert-Halts prompt gelaufen ist: `CONC`/`CONT` machen
// den Wert zum FRAGMENT. Den Wert allein zurückzusetzen, während der Emitter die
// Fortsetzungs-Kinder neu baut, schneidet den Rest ab. Am Realbestand sofort sichtbar
// geworden (die `TEXT`-Bilanz fiel von −3 auf −4) — hier als eingecheckter Wächter.
describe('BL-303 — mehrzeiliger Text bleibt vollständig', () => {
  it('CONC-Fortsetzung überlebt den Neubau, Inhalt unverändert', () => {
    const p = parseGedcom(src);
    const vorher = p.db.sources.get('@S1@')!.text;
    expect(vorher).toContain('und hier ohne Zeilenumbruch weitergeht.');
    expect(vorher).toContain('Zweite Zeile nach einem echten Umbruch.');

    alleRecordsAendern(p.db);
    const p2 = parseGedcom(speichern(p.db, p.roots));
    expect(p2.db.sources.get('@S1@')!.text).toBe(vorher);
  });
});
