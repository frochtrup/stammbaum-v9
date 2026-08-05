// tests/core/place-seed.test.ts — seedPlacesFromEvents (ADR-v9-28/-29, Phase 1.1a).
// Reine, deterministische Kernfunktion (TST-3/INV-ARCH-1): erzeugt Village-PlaceObjects
// aus distinkten PLAC-Hierarchien. Dedup-Regel = Name + Hierarchie-Verträglichkeit:
// gleicher Leitname + verträgliche Eltern → EIN Ort; widersprüchliche Eltern → distinkt.
// Höfe entstehen NIE im Seed.
import { describe, it, expect } from 'vitest';
import {
  seedPlacesFromEvents,
  makePlaceRegistry,
  makeHofRegistry,
  mergePlaceObjects,
  buildPlacForGedcom,
  eventYear,
} from '../../core/places/index';
import type { PlaceContext, PlaceObject } from '../../core/places/index';
import { place, placeMap, hofMap, ev } from './places-fixtures';

function ctxFrom(...ps: PlaceObject[]): PlaceContext {
  return { places: makePlaceRegistry(placeMap(...ps)), hofs: makeHofRegistry(hofMap()) };
}

/** Findet unter den erzeugten POs den (ersten) mit gegebenem Titel. */
function byTitle(created: PlaceObject[], title: string): PlaceObject | undefined {
  return created.find((p) => p.title === title);
}
/** Titel des unmittelbaren enclosedBy-Elternteils (aus den erzeugten POs). */
function parentTitle(created: PlaceObject[], po: PlaceObject): string | null {
  const pid = po.enclosedBy[0]?.placeId;
  if (!pid) return null;
  return created.find((p) => p.id === pid)?.title ?? null;
}

describe('seedPlacesFromEvents — Auto-Seed (ADR-v9-28)', () => {
  it('hunderte identische atomare PLAC "Ochtrup" → GENAU EIN PlaceObject', () => {
    const events = Array.from({ length: 200 }, () => ev('BIRT', { place: 'Ochtrup' }));
    const created = seedPlacesFromEvents(events, ctxFrom());
    const ochtrups = created.filter((p) => p.title === 'Ochtrup');
    expect(ochtrups).toHaveLength(1);
    expect(created).toHaveLength(1);
  });

  it('atomarer + reicher "Ochtrup" gemischt → EIN Ort (atomar ist Präfix, verträglich)', () => {
    const events = [
      ev('BIRT', { place: 'Ochtrup' }),
      ev('DEAT', { place: 'Ochtrup, Kreis Steinfurt, Westfalen' }),
    ];
    const created = seedPlacesFromEvents(events, ctxFrom());
    expect(created.filter((p) => p.title === 'Ochtrup')).toHaveLength(1);
    // Der reiche Zweig gewinnt: Ochtrup ist in Kreis Steinfurt eingebettet.
    const ochtrup = byTitle(created, 'Ochtrup')!;
    expect(parentTitle(created, ochtrup)).toBe('Kreis Steinfurt');
    // Elternkette wurde als eigene POs mit angelegt.
    expect(created.map((p) => p.title).sort()).toEqual(['Kreis Steinfurt', 'Ochtrup', 'Westfalen']);
  });

  it('gleichnamig, widersprüchliche Eltern: Oldenburg/Niedersachsen ≠ Oldenburg/USA → ZWEI Orte', () => {
    const events = [
      ev('BIRT', { place: 'Oldenburg, Niedersachsen, Deutschland' }),
      ev('DEAT', { place: 'Oldenburg, USA' }),
    ];
    const created = seedPlacesFromEvents(events, ctxFrom());
    const oldenburgs = created.filter((p) => p.title === 'Oldenburg');
    expect(oldenburgs).toHaveLength(2);
    // Sie sind über den unmittelbaren Elternteil unterscheidbar (Grundlage für 3c′).
    const parents = oldenburgs.map((o) => parentTitle(created, o)).sort();
    expect(parents).toEqual(['Niedersachsen', 'USA']);
    // Zwei distinkte IDs.
    expect(new Set(oldenburgs.map((o) => o.id)).size).toBe(2);
  });

  it('existiert das deutsche Oldenburg bereits, "Oldenburg, USA" wird NICHT daran gebunden, sondern neu angelegt', () => {
    const ctx = ctxFrom(
      place('@OLD_DE@', {
        title: 'Oldenburg',
        type: 'Town',
        enclosedBy: [{ placeId: '@NDS@', from: null, to: null }],
      }),
      place('@NDS@', { title: 'Niedersachsen', type: 'State' }),
    );
    const created = seedPlacesFromEvents([ev('DEAT', { place: 'Oldenburg, USA' })], ctx);
    const oldenburgs = created.filter((p) => p.title === 'Oldenburg');
    expect(oldenburgs).toHaveLength(1); // ein NEUES US-Oldenburg
    expect(oldenburgs[0].id).not.toBe('@OLD_DE@');
    expect(parentTitle(created, oldenburgs[0])).toBe('USA');
  });

  it('existiert das deutsche Oldenburg bereits, "Oldenburg, Niedersachsen" ist verträglich → KEIN neues PO', () => {
    const ctx = ctxFrom(
      place('@OLD_DE@', {
        title: 'Oldenburg',
        type: 'Town',
        enclosedBy: [{ placeId: '@NDS@', from: null, to: null }],
      }),
      place('@NDS@', { title: 'Niedersachsen', type: 'State' }),
    );
    const created = seedPlacesFromEvents([ev('BIRT', { place: 'Oldenburg, Niedersachsen' })], ctx);
    expect(created.filter((p) => p.title === 'Oldenburg')).toHaveLength(0);
  });

  it('Höfe werden NIE geseedet: Konvention 1 (Hof, Dorf, …) seedet das Dorf, nicht den Hof', () => {
    const events = [ev('RESI', { place: 'Wall 33, Ochtrup, Deutschland', addr: 'Wall 33' })];
    const created = seedPlacesFromEvents(events, ctxFrom());
    const titles = created.map((p) => p.title);
    expect(titles).toContain('Ochtrup');
    expect(titles).not.toContain('Wall 33'); // der Hof-Leitsegment wird NICHT als Ort angelegt
  });

  it('hof-relevanter Typ, reicher PLAC OHNE ADDR: Leitsegment gilt als (potenzieller) Hof → Dorf geseedet, nicht das Leitsegment (Resolver-Konsistenz Pfad C)', () => {
    const created = seedPlacesFromEvents([ev('RESI', { place: 'Wall 33, Ochtrup, Deutschland' })], ctxFrom());
    const titles = created.map((p) => p.title);
    expect(titles).toContain('Ochtrup');
    expect(titles).not.toContain('Wall 33');
  });

  it('atomar mehrdeutig gegenüber ≥2 widersprüchlichen Clustern → kein stilles Merge (kein PO aus dem atomaren Event)', () => {
    const events = [
      ev('BIRT', { place: 'Oldenburg, Niedersachsen' }),
      ev('DEAT', { place: 'Oldenburg, USA' }),
      ev('MARR', { place: 'Oldenburg' }), // atomar, uneindeutig → trägt nichts bei
    ];
    const created = seedPlacesFromEvents(events, ctxFrom());
    // Nur die zwei kontextualisierten Oldenburgs, kein drittes „nacktes".
    expect(created.filter((p) => p.title === 'Oldenburg')).toHaveLength(2);
  });

  it('bereits aufgelöste Events (placeId ODER findByName) tragen nichts bei', () => {
    const ctx = ctxFrom(place('@P1@', { title: 'Ochtrup', type: 'Town' }));
    const events = [
      ev('BIRT', { place: 'Ochtrup', placeId: '@P1@' }), // placeId gesetzt
      ev('DEAT', { place: 'Ochtrup' }), // findByName trifft → aufgelöst
    ];
    expect(seedPlacesFromEvents(events, ctx)).toEqual([]);
  });

  it('Determinismus: gleiche Eingabe → identisches Ergebnis (IDs + Reihenfolge)', () => {
    const events = [
      ev('BIRT', { place: 'Zwolle' }),
      ev('DEAT', { place: 'Oldenburg, USA' }),
      ev('MARR', { place: 'Oldenburg, Niedersachsen, Deutschland' }),
    ];
    const a = seedPlacesFromEvents(events, ctxFrom());
    const b = seedPlacesFromEvents(events, ctxFrom());
    expect(a).toEqual(b);
  });

  it('reine Funktion: mutiert die Eingabe-Events nicht', () => {
    const events = [ev('RESI', { place: 'Wall 33, Ochtrup', addr: 'Wall 33' })];
    const before = JSON.parse(JSON.stringify(events));
    seedPlacesFromEvents(events, ctxFrom());
    expect(events).toEqual(before);
  });

  // Symptom 2 (Bugfix 2026-07-12): Leerfeld-PLAC (Ancestris Fixed-Template) — der Seed
  // filtert Leer-Segmente bereits, das Leitsegment ist der erste nicht-leere Wert.
  it('führendes Leerfeld ", Ochtrup, , , NRW, Deutschland" seedet „Ochtrup" (kein Leerfeld-Titel-Ort)', () => {
    const created = seedPlacesFromEvents(
      [ev('BIRT', { place: ', Ochtrup, , , Nordrhein-Westfalen, Deutschland' })],
      ctxFrom(),
    );
    const titles = created.map((p) => p.title);
    expect(titles).toContain('Ochtrup');
    expect(titles).not.toContain(''); // kein leerer Titel geseedet
    expect(titles.every((t) => !t.startsWith(','))).toBe(true);
  });

  it('führendes Leerfeld matcht einen bereits vorhandenen atomaren Ort „Ochtrup" statt Dublette zu seeden', () => {
    const ctx = ctxFrom(place('@P1@', { title: 'Ochtrup', type: 'Town' }));
    // findByName(', Ochtrup, …') greift NICHT (Roh-String), aber der Seed filtert die
    // Leerfelder und findet „Ochtrup" über findAllByName → keine Dublette.
    const created = seedPlacesFromEvents([ev('BIRT', { place: ', Ochtrup, , , ,' })], ctx);
    expect(created.filter((p) => p.title === 'Ochtrup')).toHaveLength(0);
  });

  // Idempotenz-Fixpunkt (ADR-v9-71, Bugfix 2026-07-12): der Seed eines Laufs, als Basis-
  // Kontext eines ZWEITEN Laufs mit denselben Events übergeben, darf 0 neue Objekte
  // erzeugen. Der Bug: ein PLAC-Segment kann einen Kettenknoten über eine PNAME treffen
  // (Segment „Deutsches Reich" → Land mit title „Deutschland", pname „Deutsches Reich");
  // die Wiederverwendungs-Prüfung rekonstruierte die Elternkette aber über den TITEL und
  // mintete darum bei JEDEM Reload die gesamte Verwaltungskette neu (+115/+96 an echten
  // Daten). Verträglichkeit muss gegen die volle Namensmenge (title + pnames) jedes Knotens
  // prüfen. Synthetische mehrstufige Kette (kein Bezug auf die echte 2,2-MB-Datei nötig).
  describe('Idempotenz-Fixpunkt über wiederholtes Laden (Reprojektion, ADR-v9-71)', () => {
    // Kuratiertes Land: title „Deutschland", historische pname „Deutsches Reich".
    const country = place('@DE@', {
      title: 'Deutschland',
      type: 'Country',
      pnames: [{ value: 'Deutsches Reich', from: 1871, to: 1945 }],
    });
    // Ein reicher PLAC, dessen letztes Segment die PNAME (nicht den Titel) des Landes nennt.
    const events = [
      ev('BIRT', { place: 'Dorf, Kreis Beispiel, Provinz Muster, Deutsches Reich' }),
    ];

    it('zweiter Lauf mit dem Seed-Ergebnis als Basis-Kontext erzeugt 0 neue Objekte', () => {
      // Lauf 1: gegen das kuratierte Land.
      const created1 = seedPlacesFromEvents(events, ctxFrom(country));
      expect(created1.length).toBeGreaterThan(0); // Dorf + Kreis + Provinz werden geseedet
      // Der tiefste Zwischenknoten hängt am kuratierten Land (per PNAME-Treffer), nicht an
      // einem neu geminteten „Deutsches Reich".
      expect(created1.some((p) => p.title === 'Deutsches Reich')).toBe(false);

      // Lauf 2: das Lauf-1-Ergebnis IN den Kontext übernehmen (wie persister.load()+resolve).
      const ctx2: PlaceContext = {
        places: makePlaceRegistry(placeMap(country, ...created1)),
        hofs: makeHofRegistry(hofMap()),
      };
      const created2 = seedPlacesFromEvents(events, ctx2);
      expect(created2).toEqual([]); // FIXPUNKT: keine Dublette der Kette
    });

    it('drei aufeinanderfolgende Läufe konvergieren (Lauf 2→3 = 0 neu)', () => {
      let pool = [country];
      const sizes: number[] = [];
      for (let n = 0; n < 3; n++) {
        const ctx: PlaceContext = {
          places: makePlaceRegistry(placeMap(...pool)),
          hofs: makeHofRegistry(hofMap()),
        };
        const created = seedPlacesFromEvents(events, ctx);
        pool = [...pool, ...created];
        sizes.push(created.length);
      }
      expect(sizes[1]).toBe(0);
      expect(sizes[2]).toBe(0);
    });
  });

  // B1 (Bugfix 2026-07-12, ADR-v9-72): Verträglichkeit muss ALLE enclosedBy-Ketten eines
  // gemergten Ortes durchsuchen, nicht nur enclosedBy[0]. Nach dem Merge zweier Ochtrup-
  // Varianten mit VERSCHIEDENEN Verwaltungsketten trägt der Überlebende beide Ketten; ein
  // Event mit der ZWEITEN Kette darf keinen neuen Ort seeden (stille Verdopplung).
  describe('B1 — Mehrpfad-Verträglichkeit gegen gemergte enclosedBy-Ketten (ADR-v9-72)', () => {
    /** Kuratierter Ochtrup mit ZWEI historischen Ketten (Ergebnis eines Merges). */
    function ctxWithTwoChainOchtrup(): PlaceContext {
      const ochtrup = place('@OCH@', {
        title: 'Ochtrup',
        type: 'Town',
        enclosedBy: [
          { placeId: '@KR_STEINFURT@', from: null, to: null }, // Kette 1 (Index 0)
          { placeId: '@KR_AHAUS@', from: null, to: null }, // Kette 2 (Index 1)
        ],
      });
      const steinfurt = place('@KR_STEINFURT@', {
        title: 'Kreis Steinfurt',
        type: 'District',
        enclosedBy: [{ placeId: '@WESTF@', from: null, to: null }],
      });
      const ahaus = place('@KR_AHAUS@', {
        title: 'Kreis Ahaus',
        type: 'District',
        enclosedBy: [{ placeId: '@WESTF@', from: null, to: null }],
      });
      const westf = place('@WESTF@', { title: 'Westfalen', type: 'Region' });
      return {
        places: makePlaceRegistry(placeMap(ochtrup, steinfurt, ahaus, westf)),
        hofs: makeHofRegistry(hofMap()),
      };
    }

    it('Event mit der ZWEITEN (nicht der ersten) Kette trifft den Überlebenden — KEIN neuer Ort', () => {
      const created = seedPlacesFromEvents(
        [ev('BIRT', { place: 'Ochtrup, Kreis Ahaus, Westfalen' })],
        ctxWithTwoChainOchtrup(),
      );
      // Kette 2 ist bereits (an enclosedBy[1]) modelliert → keine Dublette der Kette.
      expect(created.filter((p) => p.title === 'Ochtrup')).toHaveLength(0);
      expect(created).toEqual([]);
    });

    it('Event mit der ERSTEN Kette trifft ebenfalls (Regression: Index-0 bleibt gültig)', () => {
      const created = seedPlacesFromEvents(
        [ev('BIRT', { place: 'Ochtrup, Kreis Steinfurt, Westfalen' })],
        ctxWithTwoChainOchtrup(),
      );
      expect(created).toEqual([]);
    });

    it('Event mit einer DRITTEN, widersprüchlichen Kette wird korrekt als neu erkannt', () => {
      const created = seedPlacesFromEvents(
        [ev('BIRT', { place: 'Ochtrup, USA' })], // keine der beiden gemergten Ketten
        ctxWithTwoChainOchtrup(),
      );
      const ochtrups = created.filter((p) => p.title === 'Ochtrup');
      expect(ochtrups).toHaveLength(1);
      expect(ochtrups[0].id).not.toBe('@OCH@');
    });

    // ADR-v9-222 hat die Arbeitsteilung dieses End-to-End-Falls gedreht. Bis dahin sammelte
    // der Merge die Ketten der Verlierer ein, und genau daran dockte der Reseed wieder an;
    // seither behält der Gewinner SEINE Kette, und der Merge meldet stattdessen die Namen der
    // Gruppe (`mentionNames`) — der Aufrufer bindet die betroffenen Nennungen an den
    // Überlebenden und schreibt ihren Text auf dessen Kette um. Das Ergebnis ist dasselbe
    // (kein Reseed), der Weg ein anderer: nicht das Objekt merkt sich jede Vergangenheit,
    // sondern die Nennung wird angefasst. Die Nachbindung selbst prüft
    // `tests/ui/app-state.test.ts` am Kommando.
    it('End-to-End: echter Merge zweier Ochtrup-Ketten → nach dem Umschreiben legt der Reseed nichts neu an', () => {
      // Ausgangslage: zwei distinkte Ochtrups (aus zwei Import-Läufen unterschiedlicher Tiefe).
      const places = placeMap(
        place('@OCH_A@', { title: 'Ochtrup', type: 'Town', enclosedBy: [{ placeId: '@KR_STEINFURT@', from: null, to: null }] }),
        place('@OCH_B@', { title: 'Ochtrup', type: 'Town', enclosedBy: [{ placeId: '@KR_AHAUS@', from: null, to: null }] }),
        place('@KR_STEINFURT@', { title: 'Kreis Steinfurt', type: 'District', enclosedBy: [{ placeId: '@WESTF@', from: null, to: null }] }),
        place('@KR_AHAUS@', { title: 'Kreis Ahaus', type: 'District', enclosedBy: [{ placeId: '@WESTF@', from: null, to: null }] }),
        place('@WESTF@', { title: 'Westfalen', type: 'Region' }),
      );
      const hofs = hofMap();
      // Nutzer merged @OCH_B@ in den kuratierten @OCH_A@.
      const res = mergePlaceObjects(places, hofs, '@OCH_A@', '@OCH_B@');
      // Der Gewinner bleibt der Gewinner: EINE Kette, nicht die vereinigte Historie beider.
      expect(places.get('@OCH_A@')!.enclosedBy.map((e) => e.placeId)).toEqual(['@KR_STEINFURT@']);
      // Stattdessen meldet der Merge die Namen, deren Nennungen umzuschreiben sind.
      expect(res.mentionNames).toContain('ochtrup');

      // Die Nennung der (vormals @OCH_B@-)Ahaus-Kette, umgeschrieben wie im Kommando:
      // binden + reprojizieren. Danach findet der Reseed nichts Neues.
      const ctx: PlaceContext = { places: makePlaceRegistry(places), hofs: makeHofRegistry(hofs) };
      // Mit Jahr, damit die Reprojektion die volle Kette baut (ohne Jahr liefert
      // `buildFormString` bewusst nur den atomaren Namen, s. build-plac.ts).
      const nennung = ev('BIRT', { place: 'Ochtrup, Kreis Ahaus, Westfalen', date: '12 MAY 1720' });
      nennung.placeId = '@OCH_A@';
      nennung.place = buildPlacForGedcom(nennung, eventYear(nennung), ctx) ?? nennung.place;
      expect(nennung.place).toBe('Ochtrup, Kreis Steinfurt, Westfalen');

      const created = seedPlacesFromEvents([nennung], ctx);
      expect(created).toEqual([]);
    });
  });
});

describe('seedPlacesFromEvents — Seed-Cluster prüft KNOTEN-Identität, nicht rohe Strings (ADR-v9-71-Lücke)', () => {
  // Befund am echten Datenbestand 2026-07-16: vier Ortspaare (Bremen/Essen/Hildesheim/
  // Bottrop) existierten doppelt — je `_plac_X__deutsches_reich` UND `_plac_X__deutschland`,
  // BEIDE mit demselben Elter `_po_de`. Ursache: der Cluster-Vergleich in `ensure()` (b)
  // nutzte `parentsCompatible`, das Elternsegmente als rohe Strings vergleicht
  // ("deutsches reich" !== "deutschland") — obwohl BEIDE über die Namensmenge auf
  // denselben kuratierten Knoten `_po_de` auflösen (title "Deutschland", pname
  // "Deutsches Reich" 1871–1945).
  //
  // ADR-v9-71 hat exakt dieses Problem bereits gelöst — aber nur im Pfad (a) (Abgleich
  // gegen KURATIERTE POs, `existingParentsCompatible`/`chainCompatibleAnyPath`). Pfad (b)
  // (Abgleich gegen im selben Lauf frisch geseedete Cluster) behielt den String-Vergleich.
  // Spec 11 §4.2 schließt genau das aus: der Dedup-Schlüssel ist "weder name-only NOCH
  // Voll-Hierarchie-String". Folge am echten Bestand: 23 Ereignisse blieben ungebunden
  // (Review-Klasse P), obwohl der Ort eindeutig war.
  const deWithPnames = place('@DE@', {
    title: 'Deutschland',
    pnames: [
      { value: 'Deutsches Reich', from: 1871, to: 1945 },
      { value: 'Deutschland', from: 1949, to: null },
    ],
  });

  it('faltet "Bremen, Deutsches Reich" und "Bremen, Deutschland" zu EINEM Ort (gleicher Knoten via pname)', () => {
    const ctx = ctxFrom(deWithPnames);
    const created = seedPlacesFromEvents(
      [ev('BIRT', { place: 'Bremen, Deutsches Reich', date: '1900' }), ev('DEAT', { place: 'Bremen, Deutschland', date: '1950' })],
      ctx,
    );

    const bremen = created.filter((p) => p.title === 'Bremen');
    expect(bremen).toHaveLength(1);
    // …und hängt am bestehenden, kuratierten Land — kein neues Land-PO daneben.
    expect(bremen[0].enclosedBy.map((e) => e.placeId)).toEqual(['@DE@']);
    expect(created.some((p) => /Deutsch/.test(p.title))).toBe(false);
  });

  it('hält widersprüchliche Eltern weiterhin auseinander (Oldenburg/Niedersachsen ≠ Oldenburg/USA)', () => {
    // Gegenprobe: der Fix darf die Veto-Regel (ADR-v9-29) nicht aufweichen.
    const ctx = ctxFrom(place('@NDS@', { title: 'Niedersachsen' }), place('@USA@', { title: 'USA' }));
    const created = seedPlacesFromEvents(
      [ev('BIRT', { place: 'Oldenburg, Niedersachsen', date: '1900' }), ev('DEAT', { place: 'Oldenburg, USA', date: '1900' })],
      ctx,
    );

    expect(created.filter((p) => p.title === 'Oldenburg')).toHaveLength(2);
  });

  it('lässt atomaren PLAC weiterhin an den reichen Cluster binden (Präfix-Semantik unverändert)', () => {
    // Gegenprobe: leere Elternkette bleibt mit allem verträglich — "hunderte Ochtrup,
    // auch atomar+reich gemischt, bleiben ein Ort" (Spec 11 §4.2).
    const ctx = ctxFrom(deWithPnames);
    const created = seedPlacesFromEvents(
      [ev('BIRT', { place: 'Ochtrup, Deutschland', date: '1900' }), ev('DEAT', { place: 'Ochtrup', date: '1900' })],
      ctx,
    );

    expect(created.filter((p) => p.title === 'Ochtrup')).toHaveLength(1);
  });
});
