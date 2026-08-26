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
import type { HofObject, PlaceContext, PlaceObject } from '../../core/places/index';
import { hof, place, placeMap, hofMap, ev } from './places-fixtures';

function ctxFrom(...ps: PlaceObject[]): PlaceContext {
  return { places: makePlaceRegistry(placeMap(...ps)), hofs: makeHofRegistry(hofMap()) };
}

/**
 * Kontext MIT Höfen — die Objektseite, die `ctxFrom` leer lässt.
 *
 * WARUM ES DIESEN ZWEITEN HELFER GIBT. Jeder Seed-Test dieser Datei lief bisher gegen
 * `hofMap()`, also gegen NULL Höfe: der Seed konnte einen Hof nie sehen, auch wenn seine
 * Regel ihn meinte. Dieselbe eingefrorene Objektseite hat der Determinismus-Property-Test
 * (`resolve-determinism.property.test.ts`, „Fester Orts-/Hof-Kontext") — er variiert die
 * Ereignisse über 8 Typen × 7 PLAC × 4 ADDR und hält dabei EINEN Hof mit EINER Adresse
 * fest. Die beiden Zellen unten sind genau die, die dadurch nie vorkamen.
 */
function ctxMitHof(hofs: HofObject[], ...ps: PlaceObject[]): PlaceContext {
  return { places: makePlaceRegistry(placeMap(...ps)), hofs: makeHofRegistry(hofMap(...hofs)) };
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

  // ---- Die zwei Zellen, die der Matrix fehlten -------------------------------------
  //
  // Beide seeden am Realbestand eine HAUSNUMMER als Ort unter Ochtrup — gemessen 2026-08-26
  // an `orte-2.json` rev 448: `Oster 34`, `Oster 46 (9)`, `Oster 52 (15)`, `Weinerstr. 17`.
  // Der Verlauf über die Ortsstände zeigt, wann es anfing: rev 63…333 zwei Altfälle,
  // rev 347 (12.08.) der erste Zuwachs, rev 406 (21.08.) acht. Kein Wächter schlug an, weil
  // der Defekt EINMALIG zuschlägt — im Moment der Kuration — und danach als Fixpunkt
  // einfriert: „kein Wachstum beim zweiten Lesen" (kurations-rundlauf-realdaten.test.ts,
  // Zusicherung 2) ist an beiden Ständen 0. Ein falscher Zustand kann stabil sein.
  it('Hof mit ZWEI Adressvarianten: PLAC nennt die eine, ADDR die andere → KEIN Ort aus dem Leitsegment', () => {
    // Konvention 2 fragt „nennt ADDR einen ANDEREN Hof als das Leitsegment?" und vergleicht
    // dafür zwei ZEICHENKETTEN. Solange jeder Hof genau eine Adresse trug, waren sie immer
    // gleich und die Regel lag zufällig richtig. Seit ADR-v9-223 führt ein Hof eine
    // Adressliste; `PLAC` wird live aus ihr berechnet, `ADDR` bleibt eingefroren
    // (ADR-v9-47) — die beiden Hälften laufen auseinander, und die Regel liest die
    // Abweichung als zweiten Hof. Richtig ist die Frage am OBJEKT: gehören beide Werte
    // demselben `HofObject`? Die Registry weiß das, `addrs` IST diese Liste.
    const ochtrup = place('@OCHTRUP@', { title: 'Ochtrup', type: 'Town' });
    const hofMitVarianten = hof('_hof_weinerstr_17_ochtrup', '@OCHTRUP@', {
      addrs: [
        { value: 'Weinerstr. 17', from: null, to: null },
        { value: 'Wigbold 14 (Weinerstr. 17)', from: null, to: null },
      ],
    });
    const events = [
      ev('RESI', {
        place: 'Weinerstr. 17, Ochtrup, Deutschland',
        addr: 'Wigbold 14 (Weinerstr. 17)',
      }),
    ];
    const created = seedPlacesFromEvents(events, ctxMitHof([hofMitVarianten], ochtrup));
    expect(created.map((p) => p.title)).not.toContain('Weinerstr. 17');
  });

  it('Nicht-Hof-Typ am Hof: ein DEAT mit bekannter Hofadresse als Leitsegment seedet sie NICHT als Ort', () => {
    // `adminChain` schneidet das Leitsegment nur für `HOF_EVENT_TYPES` (RESI/PROP/CENS) ab;
    // jeder andere Typ macht daraus einen Ort. Am Realbestand tragen 8 Nicht-Hof-Ereignisse
    // (BIRT 5, CHR 1, DEAT 2) eine bekannte Hofadresse als Leitsegment.
    //
    // BEWUSST NICHT MITGEPRÜFT: ob das Ereignis danach AN den Hof bindet. Dass Hof-Bindung
    // auf RESI/PROP/CENS beschränkt ist, ist eine eigene Entscheidung (Spec 11 §4.2); sie
    // hier mitzuentscheiden hieße, sie durch die Hintertür zu ändern. Zugesichert wird nur
    // das Schwächere und Unstrittige: aus einer bekannten Hofadresse wird kein ORT.
    const ochtrup = place('@OCHTRUP@', { title: 'Ochtrup', type: 'Town' });
    // KURATIERT (Koordinaten gepflegt) — nur so zaehlt der Hof als Beleg, s. Kontrollprobe.
    const wall33 = hof('_hof_wall_33_ochtrup', '@OCHTRUP@', {
      addrs: [{ value: 'Wall 33', from: null, to: null }],
      lat: 52.2,
      long: 7.18,
    });
    const created = seedPlacesFromEvents(
      [ev('DEAT', { place: 'Wall 33, Ochtrup, Deutschland' })],
      ctxMitHof([wall33], ochtrup),
    );
    expect(created.map((p) => p.title)).not.toContain('Wall 33');
  });

  it('Kontrollprobe: ein ROH GEBOOTSTRAPPTER Hof zaehlt NICHT als Beleg (kein Zirkel)', () => {
    // Ein gebootstrappter Hof entsteht aus demselben Ereignistext, den er hier deuten soll.
    // Ihn als Beleg zu nehmen hiesse: ein einzelnes RESI mit ADDR=X erzeugt beim ersten
    // Laden Hof X, und beim zweiten erklaert dieser Hof das Leitsegment X aller uebrigen
    // Ereignisse zur Hofstelle — auch wenn X ein Dorf ist. Am Realbestand ist `Lehrdte`
    // genau dieser Fall: 66 BIRT/CHR/DEAT/BURI/MARR, null `ADDR=Lehrdte` in der Quelle.
    // Derselbe Autoritaets-Satz wie in `alignCuratedEventTexts` (ADR-v9-224).
    const ochtrup = place('@OCHTRUP@', { title: 'Ochtrup', type: 'Town' });
    const roh = hof('_hof_lehrdte_bootstrap', '@OCHTRUP@', {
      addrs: [{ value: 'Lehrdte', from: null, to: null }], // sonst alles leer = Rohzustand
    });
    const created = seedPlacesFromEvents(
      [ev('BIRT', { place: 'Lehrdte, Ochtrup, Deutschland' })],
      ctxMitHof([roh], ochtrup),
    );
    expect(created.map((p) => p.title)).toContain('Lehrdte');
  });

  it('Nicht-Hof-Typ schattet die Hof-Erkennung nicht: nennt ein RESI dieselbe Stelle per ADDR als Hof, seedet das DEAT keinen Ort', () => {
    // Der Seed läuft VOR dem Resolver. Das RESI unten hätte „Oster 60" per Pfad C als Hof
    // gebootstrappt — aber wenn das DEAT das Leitsegment vorher zum ORT macht, binden
    // anschließend BEIDE an diesen Ort und der Hof entsteht nie. Am Realbestand ist das
    // genau `Oster 60` (2 RESI mit `ADDR=Oster 60`, 2 DEAT ohne ADDR).
    const ochtrup = place('@OCHTRUP@', { title: 'Ochtrup', type: 'Town' });
    const events = [
      ev('DEAT', { place: 'Oster 60, Ochtrup, Deutschland' }),
      ev('RESI', { place: 'Oster 60, Ochtrup, Deutschland', addr: 'Oster 60' }),
    ];
    const created = seedPlacesFromEvents(events, ctxFrom(ochtrup));
    expect(created.map((p) => p.title)).not.toContain('Oster 60');
  });

  it('Kontrollprobe: ein Hof-Typ-Ereignis OHNE ADDR beansprucht die Stelle NICHT — ein Dorf bleibt ein Dorf', () => {
    // Die erste Fassung zählte auch ADDR-lose Hof-Typ-Ereignisse als Anspruch und erklärte
    // damit Dörfer zu Hofstellen: am Realbestand trägt `Lehrdte` 66 Nicht-Hof-Ereignisse
    // und NULL `ADDR=Lehrdte` — sie brach ADR-v9-222 (zwei `Amtsvogtei Ilten` kehrten nach
    // einem Merge zurück), weil sie den 66 Ereignissen ihr Leitsegment nahm.
    const amt = place('@AMT@', { title: 'Amtsvogtei Ilten', type: 'Region' });
    const events = [
      ev('RESI', { place: 'Lehrdte, Amtsvogtei Ilten, Deutschland' }), // ohne ADDR
      ev('BIRT', { place: 'Lehrdte, Amtsvogtei Ilten, Deutschland' }),
    ];
    const created = seedPlacesFromEvents(events, ctxFrom(amt));
    expect(created.map((p) => p.title)).toContain('Lehrdte');
  });

  // KONTROLLPROBEN zu den beiden Zellen darüber. Ohne sie stünde dort nur „seede das
  // Leitsegment nicht", und die billigste Art, das grün zu bekommen, wäre eine zu breite
  // Regel („bei RESI nie das Leitsegment seeden", „Hausnummern nie seeden") — die den
  // Fehler durch einen stilleren ersetzte: ein echtes Dorf, das der Bestand noch nicht
  // kennt, käme nie mehr an. Die zwei Proben halten fest, dass der HOF der Unterscheider
  // ist und nichts sonst: gleiche Ereignisse, Hof aus dem Kontext genommen → unverändert.
  it('Kontrollprobe: ist der Hof NICHT bekannt, darf dasselbe Leitsegment weiterhin ein Ort werden', () => {
    const ochtrup = place('@OCHTRUP@', { title: 'Ochtrup', type: 'Town' });
    const events = [
      ev('RESI', {
        place: 'Weinerstr. 17, Ochtrup, Deutschland',
        addr: 'Wigbold 14 (Weinerstr. 17)',
      }),
    ];
    // Ohne Hof-Wissen ist „ADDR nennt einen anderen Hof" die ehrliche Lesart (Konvention 2).
    const created = seedPlacesFromEvents(events, ctxFrom(ochtrup));
    expect(created.map((p) => p.title)).toContain('Weinerstr. 17');
  });

  it('Kontrollprobe: ein DEAT an einem Leitsegment, das KEINE Hofadresse ist, seedet weiter einen Ort', () => {
    const ochtrup = place('@OCHTRUP@', { title: 'Ochtrup', type: 'Town' });
    const wall33 = hof('_hof_wall_33_ochtrup', '@OCHTRUP@', {
      addrs: [{ value: 'Wall 33', from: null, to: null }],
    });
    const created = seedPlacesFromEvents(
      [ev('DEAT', { place: 'Langenhorst, Ochtrup, Deutschland' })],
      ctxMitHof([wall33], ochtrup),
    );
    expect(created.map((p) => p.title)).toContain('Langenhorst');
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
