// tests/orte/kontextdatei-unveraendert.test.ts — INV-ORTE-2 (Spec 22 §5/§9, OE-7).
//
// > Das Laden einer Kontextdatei verändert das Dokument nicht.
//
// Der Test ist wörtlich die Invariante: Dokument serialisieren, Kontext auflösen, erneut
// serialisieren, vergleichen. Er prüft damit nicht eine Implementierung, sondern die
// Zusage — und bleibt gültig, wenn der Ladepfad später anders gebaut wird.
//
// Zwei Schreibwege wären ohne Vorkehrung offen (beide hier belegt): der Village-Seed legt
// aus unbekannten PLAC-Angaben Orte an, der Hof-Bootstrap legt aus RESI/ADDR Höfe an.
import { describe, expect, it } from 'vitest';
import { serializeForCompare, type OrteContent } from '../../app-orte/orte-doc';
import { resolveAgainstDocument } from '../../app-orte/orte-context';
import { applyPlaceResolution } from '../../services/places';
import { makeDatabase, makePerson } from '../../core/model';
import { place } from '../core/places-fixtures';
import type { Database } from '../../core/model/types';

/** Ein Dokument mit genau einem bekannten Ort — alles andere in der Kontextdatei ist neu. */
function documentWithOchtrup(): OrteContent {
  return {
    placeObjects: new Map([['@P1@', place('@P1@', { title: 'Ochtrup', type: 'Village' })]]),
    hofObjects: new Map()
  };
}

/** Kontextdatei mit einem bekannten und einem UNBEKANNTEN Ort plus einem Hof-Kandidaten. */
function contextDb(): Database {
  const db = makeDatabase();
  const known = makePerson('@I1@');
  known.birth.place = 'Ochtrup';
  const unknown = makePerson('@I2@');
  unknown.birth.place = 'Nienberge, Münster, Westfalen';
  const farmer = makePerson('@I3@');
  farmer.events.push({ ...unknown.birth, type: 'RESI', place: 'Ochtrup', addr: 'Wall 33', placeId: null, hofId: null });
  db.individuals.set('@I1@', known);
  db.individuals.set('@I2@', unknown);
  db.individuals.set('@I3@', farmer);
  return db;
}

describe('Kontextdatei ist nur lesend (INV-ORTE-2)', () => {
  it('lässt das Dokument byte-gleich', () => {
    const doc = documentWithOchtrup();
    const before = serializeForCompare(doc);

    resolveAgainstDocument(contextDb(), doc);

    expect(serializeForCompare(doc)).toBe(before);
  });

  it('legt weder Orte noch Höfe im Dokument an', () => {
    const doc = documentWithOchtrup();
    resolveAgainstDocument(contextDb(), doc);
    expect([...doc.placeObjects.keys()]).toEqual(['@P1@']);
    expect(doc.hofObjects.size).toBe(0);
  });

  it('Gegenprobe: OHNE die Vorkehrungen würde derselbe Bestand wachsen', () => {
    // Der Beleg dafür, dass die Invariante etwas verhindert und nicht bloß behauptet.
    // Hier läuft die Auflösung so, wie der reguläre Import sie fährt — mit Seed und
    // direkt auf den Mengen. Wächst der Bestand hier nicht, prüft der Test oben nichts.
    const doc = documentWithOchtrup();
    const db: Database = { ...contextDb(), placeObjects: doc.placeObjects, hofObjects: doc.hofObjects };
    const result = applyPlaceResolution(db);
    expect(result.placeObjectsGrew || result.hofObjectsGrew).toBe(true);
  });

  it('übernimmt Verknüpfungen auf vorhandene Objekte', () => {
    // Die andere Hälfte: der Kontext soll ja WIRKEN — sonst wäre „nichts verändern"
    // trivial erfüllbar, indem man gar nichts tut.
    const doc = documentWithOchtrup();
    const resolved = resolveAgainstDocument(contextDb(), doc);
    const linked = [...resolved.individuals.values()].filter((p) => p.birth.placeId === '@P1@');
    expect(linked.length).toBeGreaterThan(0);
  });

  it('lässt keine Verknüpfung auf ein verworfenes Bootstrap-Objekt zurück', () => {
    // Ein Link auf einen Hof, den es im Dokument nicht gibt, wäre eine hängende Referenz
    // und würde die Referenz-Sichtbarkeit (D1) verfälschen.
    const doc = documentWithOchtrup();
    const resolved = resolveAgainstDocument(contextDb(), doc);
    for (const p of resolved.individuals.values()) {
      for (const ev of [p.birth, p.chr, p.death, p.buri, ...p.events]) {
        if (ev.placeId != null) expect(doc.placeObjects.has(ev.placeId)).toBe(true);
        if (ev.hofId != null) expect(doc.hofObjects.has(ev.hofId)).toBe(true);
      }
    }
  });
});

describe('applyPlaceResolution: seed abschaltbar (BL-223)', () => {
  it('legt mit seed:false keine Orte an, löst aber weiter auf', () => {
    const db = contextDb();
    db.placeObjects = new Map([['@P1@', place('@P1@', { title: 'Ochtrup', type: 'Village' })]]);
    const result = applyPlaceResolution(db, { seed: false });
    expect(result.placeObjectsGrew).toBe(false);
    expect(db.placeObjects.size).toBe(1);
    expect(db.individuals.get('@I1@')?.birth.placeId).toBe('@P1@');
  });

  it('Default bleibt seed:true — der reguläre Import lebt davon', () => {
    const db = contextDb();
    db.placeObjects = new Map();
    const result = applyPlaceResolution(db);
    expect(result.placeObjectsGrew).toBe(true);
  });
});
