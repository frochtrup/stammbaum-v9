// tests/core/interop-place-live.test.ts — INV-PLACE Mechanismus 2 (Spec 11 §3/§7, ADR-v9-47).
//
// Verriegelt die Lücke: `event.place`/`event.addr` sind Projektions-Cache, keine Wahrheit.
// Ändert sich das PlaceObject NACH der ersten Auflösung (neue datierte enclosedBy-Periode),
// OHNE dass ein Event-Kommando läuft (savePlaceObject reprojiziert nichts — kennt keine
// Events), muss der Writer die NEUE periodengerechte Hierarchie live über buildPlacForGedcom
// exportieren, UND der Dirty-Check (eventEqual) darf den Datensatz nicht fälschlich als
// „unverändert" behandeln (sonst synthetisiert der Struktur-Vergleich-Writer aus ADR-v9-32
// ihn gar nicht erst neu → stale PLAC im Export).
//
// ADDR bleibt bewusst byte-identisch (Fill-if-empty, §7) — NICHT Teil dieses Fixes.

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

describe('ADR-v9-47 — Writer liest PLAC live statt aus dem ev.place-Cache', () => {
  it('exportiert die NEUE periodengerechte Hierarchie, obwohl ev.place noch stale ist', () => {
    const doc = makeEnrichedDoc();
    const out = serializeAfterWriteBack(doc);
    // Live berechnet: enclosureChainAsOf(@OCHTRUP@, 1830) = [Ochtrup, Kreis Steinfurt].
    expect(out).toContain('2 PLAC Ochtrup, Kreis Steinfurt');
    // Der alte, hierarchielose Cache-Wert darf NICHT mehr allein als PLAC-Zeile erscheinen.
    expect(out).not.toMatch(/^2 PLAC Ochtrup$/m);
  });

  it('eventEqual erkennt die geänderte Projektion → Record wird neu synthetisiert (kein stale-Bewahren)', () => {
    const doc = makeEnrichedDoc();
    const origIndi = doc.roots.find((r) => r.xref === '@I1@')!;
    const outRoots = applyDatabaseToRoots(doc.db, doc.roots);
    const newIndi = outRoots.find((r) => r.xref === '@I1@')!;
    // Nicht die identische GedNode-Referenz → der Struktur-Vergleich hat „geändert" erkannt.
    expect(newIndi).not.toBe(origIndi);
  });
});

describe('ADR-v9-47 — kein falscher Rewrite, wenn die Live-Projektion dem Cache entspricht', () => {
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
