// tests/core/interop-place-live.test.ts — UMGEKEHRTE Zusicherung seit ADR-v9-197/BL-288.
//
// Diese Datei hielt ADR-v9-47 fest: `ev.place` sei bloßer Cache, und der Writer müsse die
// periodengerechte Hierarchie LIVE berechnen — auch dann, wenn nur ein PlaceObject
// bearbeitet wurde und kein Event-Kommando lief. Genau das schrieb die Datei bei jedem
// Speichern um (an `Unsere Familie 2026.ged` 668 PLAC-Werte an unangetasteten Ereignissen).
//
// Jetzt gilt: eine byte-verändernde Projektion braucht einen user-induzierten Anlass.
// Ein bearbeitetes PlaceObject ALLEIN ist keiner — die Datei bleibt, wie sie ist, bis ein
// Kurations-Kommando (`linkEventToPlace`, `renameHofAddrInEvents`, …) die betroffenen
// Ereignisse ausdrücklich mitzieht. Die periodengerechte Kette sieht der Nutzer trotzdem:
// die Anzeige projiziert live aus `placeId`, ohne etwas zu überschreiben.
//
// ADDR war schon immer byte-identisch (Fill-if-empty, §7) — PLAC verhält sich jetzt ebenso.

import { describe, it, expect } from 'vitest';
import { parseGedcom, serializeGedcom, applyDatabaseToRoots } from '../../core/interop';
import type { ParsedGedcom } from '../../core/interop';
import { place } from './places-fixtures';

const SRC = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '0 @I1@ INDI',
  '1 NAME Anna /Test/',
  '1 BIRT',
  '2 DATE 1830',
  '2 PLAC Ochtrup', // was buchstäblich in der Datei steht (alter Cache-Stand)
  '0 TRLR',
].join('\n');

/** roots durch Write-Back schicken und serialisieren (Editier-Pfad). */
function serializeAfterWriteBack(doc: ParsedGedcom): string {
  return serializeGedcom({ db: doc.db, roots: applyDatabaseToRoots(doc.db, doc.roots) });
}

/**
 * Simuliert den Zustand NACH einer Orts-Attribut-Anreicherung ohne Reload:
 * das BIRT-Event ist auf @OCHTRUP@ gelinkt (placeId gesetzt), sein place-Cache steht
 * aber noch auf dem alten Wert „Ochtrup". Das PlaceObject hat inzwischen eine datierte
 * enclosedBy-Periode (Kreis Steinfurt ab 1816) — reine Attribut-Änderung, gleiche placeId.
 */
function makeEnrichedDoc(): ParsedGedcom {
  const doc = parseGedcom(SRC);
  const person = doc.db.individuals.get('@I1@')!;
  // Link ohne Reprojektion des Caches (savePlaceObject-artiger Zwischenzustand):
  person.birth.placeId = '@OCHTRUP@';
  // Cache bleibt bewusst auf dem alten, hierarchielosen Stand:
  expect(person.birth.place).toBe('Ochtrup');

  doc.db.placeObjects.set(
    '@OCHTRUP@',
    place('@OCHTRUP@', {
      title: 'Ochtrup',
      type: 'Town',
      enclosedBy: [{ placeId: '@STEINFURT@', from: 1816, to: null }],
    }),
  );
  doc.db.placeObjects.set('@STEINFURT@', place('@STEINFURT@', { title: 'Kreis Steinfurt', type: 'County' }));
  return doc;
}

describe('ADR-v9-197 — ein bearbeitetes PlaceObject schreibt die Datei NICHT um', () => {
  it('exportiert den Dateiwert, nicht die neue Hierarchie', () => {
    const doc = makeEnrichedDoc();
    const out = serializeAfterWriteBack(doc);
    // Der Ort trägt jetzt eine Kreis-Zugehörigkeit — die Datei sagt trotzdem, was sie sagte.
    expect(out).toMatch(/^2 PLAC Ochtrup$/m);
    expect(out).not.toContain('2 PLAC Ochtrup, Kreis Steinfurt');
  });

  it('der Record bleibt die IDENTISCHE Referenz — es hat sich an ihm nichts geändert', () => {
    const doc = makeEnrichedDoc();
    const origIndi = doc.roots.find((r) => r.xref === '@I1@')!;
    const outRoots = applyDatabaseToRoots(doc.db, doc.roots);
    const newIndi = outRoots.find((r) => r.xref === '@I1@')!;
    // Früher galt der Record hier als „geändert" (die Projektion wich vom Cache ab) und
    // wurde neu synthetisiert. Das war der Mechanismus, über den die 668 Umschreibungen
    // in die Datei kamen — RT-1/RT-2 gelten jetzt auch für kuratierte Orte.
    expect(newIndi).toBe(origIndi);
  });
});

describe('ADR-v9-197 — der unauffällige Fall bleibt unauffällig', () => {
  it('plain PlaceObject (Projektion == Datei-Wert) → Record bleibt die IDENTISCHE Referenz', () => {
    const doc = parseGedcom(SRC);
    const person = doc.db.individuals.get('@I1@')!;
    person.birth.placeId = '@OCHTRUP@';
    // enclosedBy leer → buildPlacForGedcom liefert schlicht „Ochtrup" == ev.place == Datei.
    doc.db.placeObjects.set('@OCHTRUP@', place('@OCHTRUP@', { title: 'Ochtrup', type: 'Town' }));

    const origIndi = doc.roots.find((r) => r.xref === '@I1@')!;
    const outRoots = applyDatabaseToRoots(doc.db, doc.roots);
    const newIndi = outRoots.find((r) => r.xref === '@I1@')!;
    expect(newIndi).toBe(origIndi); // byte-identisch bewahrt (net_delta-neutral)
  });

  it('ohne placeId/hofId bleibt ev.place die Wire-Wahrheit (roher Cache-Read)', () => {
    const doc = parseGedcom(SRC); // kein Link, keine placeObjects
    const out = serializeAfterWriteBack(doc);
    expect(out).toContain('2 PLAC Ochtrup');
  });
});
