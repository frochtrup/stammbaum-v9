// tests/core/places-commands.test.ts — Mutations-Kommandos für PlaceObject/HofObject
// (Spec 20 §1.7/§1.8 [K] "Bearbeitung"). Reine Funktionen, deshalb Unit- statt
// Component-Test (TST-5) — analog core/model/integrity.ts-Kommandos.
import { describe, expect, it } from 'vitest';
import {
  savePlaceObject,
  deletePlaceObject,
  saveHofObject,
  deleteHofObject,
  withAddedPname,
  withRemovedPname,
  withAddedTranslation,
  withRemovedTranslation,
  withAddedEnclosedBy,
  withRemovedEnclosedBy,
  withUpdatedPname,
  withUpdatedEnclosedBy,
  withAddedHofAddr,
  withRemovedHofAddr,
  withUpdatedHofAddr,
  linkEventToPlace,
  linkEventToHof,
  mergePlaceObjects,
} from '../../core/places/commands';
import { makePlaceRegistry, makeHofRegistry } from '../../core/places/index';
import { place, hof, placeMap, hofMap, ev } from './places-fixtures';

describe('savePlaceObject/deletePlaceObject — Upsert per id', () => {
  it('legt ein neues PlaceObject an', () => {
    const places = placeMap();
    savePlaceObject(places, place('@P1@', { title: 'Ochtrup' }));
    expect(places.get('@P1@')?.title).toBe('Ochtrup');
  });

  it('ersetzt ein bestehendes PlaceObject vollständig (kein Merge)', () => {
    const places = placeMap(place('@P1@', { title: 'Alt', type: 'Village', note: 'alte Notiz' }));
    savePlaceObject(places, place('@P1@', { title: 'Neu' }));
    expect(places.get('@P1@')).toEqual(place('@P1@', { title: 'Neu' }));
  });

  it('deletePlaceObject entfernt per id', () => {
    const places = placeMap(place('@P1@'));
    deletePlaceObject(places, '@P1@');
    expect(places.has('@P1@')).toBe(false);
  });
});

describe('saveHofObject/deleteHofObject — Upsert per id', () => {
  it('legt einen neuen Hof an', () => {
    const hofs = hofMap();
    saveHofObject(hofs, hof('@H1@', '@P1@', { note: 'Hof am Bach' }));
    expect(hofs.get('@H1@')?.note).toBe('Hof am Bach');
  });

  it('deleteHofObject entfernt per id', () => {
    const hofs = hofMap(hof('@H1@', '@P1@'));
    deleteHofObject(hofs, '@H1@');
    expect(hofs.has('@H1@')).toBe(false);
  });
});

describe('withAddedPname/withRemovedPname — pnames-Zeitachse (Formular-Pfad)', () => {
  it('hängt eine datierte Namensvariante an, ohne das Original zu mutieren', () => {
    const pl = place('@P1@', { title: 'Sassenberg' });
    const next = withAddedPname(pl, 'Sassenbergk', 1600, 1750);
    expect(next.pnames).toEqual([{ value: 'Sassenbergk', from: 1600, to: 1750 , fromDate: null, toDate: null }]);
    expect(pl.pnames).toEqual([]); // Original unangetastet
  });

  it('ignoriert leere Werte (kein leerer pnames-Eintrag)', () => {
    const pl = place('@P1@');
    const next = withAddedPname(pl, '   ', null, null);
    expect(next).toBe(pl);
  });

  it('entfernt eine pnames-Variante am Index', () => {
    const pl = place('@P1@', {
      pnames: [
        { value: 'A', from: null, to: null , fromDate: null, toDate: null },
        { value: 'B', from: null, to: null , fromDate: null, toDate: null },
      ],
    });
    const next = withRemovedPname(pl, 0);
    expect(next.pnames).toEqual([{ value: 'B', from: null, to: null , fromDate: null, toDate: null }]);
  });
});

describe('withAddedTranslation/withRemovedTranslation — Sprachachse (BL-59)', () => {
  it('hängt eine Übersetzung an, ohne das Original zu mutieren', () => {
    const pl = place('@P1@', { title: 'Breslau' });
    const next = withAddedTranslation(pl, 'pl', 'Wrocław');
    expect(next.translations).toEqual([{ lang: 'pl', value: 'Wrocław' }]);
    expect(pl.translations).toEqual([]); // Original unangetastet
  });

  it('trimmt/kleinet das Sprachkürzel und trimmt den Wert', () => {
    const next = withAddedTranslation(place('@P1@'), '  PL ', '  Wrocław  ');
    expect(next.translations).toEqual([{ lang: 'pl', value: 'Wrocław' }]);
  });

  it('ignoriert leere Werte (kein leerer translations-Eintrag)', () => {
    const pl = place('@P1@');
    const next = withAddedTranslation(pl, 'pl', '   ');
    expect(next).toBe(pl);
  });

  it('toleriert ein aus feldloser orte.json geladenes PlaceObject (translations undefined)', () => {
    // Backwards-Compat: alte Datei ohne das Feld → `?? []` statt Absturz (kein Schema-Bump).
    const legacy = { ...place('@P1@'), translations: undefined } as unknown as Parameters<typeof withAddedTranslation>[0];
    const next = withAddedTranslation(legacy, 'fr', 'Strasbourg');
    expect(next.translations).toEqual([{ lang: 'fr', value: 'Strasbourg' }]);
  });

  it('entfernt eine Übersetzung am Index', () => {
    const pl = place('@P1@', {
      translations: [
        { lang: 'pl', value: 'Wrocław' },
        { lang: 'cs', value: 'Vratislav' },
      ],
    });
    const next = withRemovedTranslation(pl, 0);
    expect(next.translations).toEqual([{ lang: 'cs', value: 'Vratislav' }]);
  });
});

describe('withAddedEnclosedBy/withRemovedEnclosedBy — Verwaltungs-Zeitachse', () => {
  it('hängt eine datierte enclosedBy-Zugehörigkeit an', () => {
    const pl = place('@P1@');
    const next = withAddedEnclosedBy(pl, '@KREIS@', 1900, null);
    expect(next.enclosedBy).toEqual([{ placeId: '@KREIS@', from: 1900, to: null , fromDate: null, toDate: null }]);
  });

  it('ignoriert leere parentId', () => {
    const pl = place('@P1@');
    const next = withAddedEnclosedBy(pl, '', null, null);
    expect(next).toBe(pl);
  });

  it('entfernt eine enclosedBy-Zugehörigkeit am Index', () => {
    const pl = place('@P1@', { enclosedBy: [{ placeId: '@A@', from: null, to: null , fromDate: null, toDate: null }, { placeId: '@B@', from: null, to: null , fromDate: null, toDate: null }] });
    const next = withRemovedEnclosedBy(pl, 1);
    expect(next.enclosedBy).toEqual([{ placeId: '@A@', from: null, to: null , fromDate: null, toDate: null }]);
  });
});

describe('withAddedHofAddr/withRemovedHofAddr — Adressvarianten (Formular-Pfad)', () => {
  it('hängt eine Adressvariante an, ohne Dedup (expliziter Nutzer-Intent)', () => {
    const h = hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null , fromDate: null, toDate: null }] });
    const next = withAddedHofAddr(h, 'Wall 33 neu', 1950, null);
    expect(next.addrs).toEqual([
      { value: 'Wall 33', from: null, to: null , fromDate: null, toDate: null },
      { value: 'Wall 33 neu', from: 1950, to: null , fromDate: null, toDate: null },
    ]);
  });

  it('ignoriert leere Werte', () => {
    const h = hof('@H1@', '@P1@');
    const next = withAddedHofAddr(h, '', null, null);
    expect(next).toBe(h);
  });

  it('entfernt eine Adressvariante am Index', () => {
    const h = hof('@H1@', '@P1@', {
      addrs: [
        { value: 'A', from: null, to: null , fromDate: null, toDate: null },
        { value: 'B', from: null, to: null , fromDate: null, toDate: null },
      ],
    });
    const next = withRemovedHofAddr(h, 0);
    expect(next.addrs).toEqual([{ value: 'B', from: null, to: null , fromDate: null, toDate: null }]);
  });
});

describe('withUpdatedHofAddr — bestehende Adressvariante bearbeiten (Formular-Pfad)', () => {
  it('ersetzt Wert/from/to an gültigem Index, Rest der Liste unverändert, ohne Original zu mutieren', () => {
    const h = hof('@H1@', '@P1@', {
      addrs: [
        { value: 'Wall 33', from: 1900, to: 1950 , fromDate: null, toDate: null },
        { value: 'Wall 34', from: null, to: null , fromDate: null, toDate: null },
      ],
    });
    const next = withUpdatedHofAddr(h, 0, 'Wall 33a', 1901, 1949);
    expect(next.addrs).toEqual([
      { value: 'Wall 33a', from: 1901, to: 1949 , fromDate: null, toDate: null },
      { value: 'Wall 34', from: null, to: null , fromDate: null, toDate: null },
    ]);
    // Original unangetastet (unveränderliche Funktion).
    expect(h.addrs).toEqual([
      { value: 'Wall 33', from: 1900, to: 1950 , fromDate: null, toDate: null },
      { value: 'Wall 34', from: null, to: null , fromDate: null, toDate: null },
    ]);
  });

  it('trimmt den Wert (gleiche Trim-Disziplin wie withAddedHofAddr)', () => {
    const h = hof('@H1@', '@P1@', { addrs: [{ value: 'Alt', from: null, to: null , fromDate: null, toDate: null }] });
    const next = withUpdatedHofAddr(h, 0, '  Neu  ', null, null);
    expect(next.addrs).toEqual([{ value: 'Neu', from: null, to: null , fromDate: null, toDate: null }]);
  });

  it('ignoriert leere/nur-Whitespace Werte (kein stillschweigendes Löschen)', () => {
    const h = hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null , fromDate: null, toDate: null }] });
    expect(withUpdatedHofAddr(h, 0, '', null, null)).toBe(h);
    expect(withUpdatedHofAddr(h, 0, '   ', null, null)).toBe(h);
  });

  it('ignoriert Index außerhalb des Arrays (negativ oder >= length)', () => {
    const h = hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null , fromDate: null, toDate: null }] });
    expect(withUpdatedHofAddr(h, -1, 'X', null, null)).toBe(h);
    expect(withUpdatedHofAddr(h, 1, 'X', null, null)).toBe(h);
    expect(withUpdatedHofAddr(h, 99, 'X', null, null)).toBe(h);
  });

  it('lässt die Hof-id in jedem Fall unverändert (id ist deterministisch aus Erstanlage, kein Re-Resolve)', () => {
    const h = hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null , fromDate: null, toDate: null }] });
    expect(withUpdatedHofAddr(h, 0, 'Wall 33a', 1901, 1949).id).toBe('@H1@');
    expect(withUpdatedHofAddr(h, 0, '', null, null).id).toBe('@H1@');
    expect(withUpdatedHofAddr(h, 5, 'X', null, null).id).toBe('@H1@');
  });
});

describe('linkEventToPlace — String→PlaceObject verknüpfen (Spec 20 §1.7 [K], ADR-v9-19)', () => {
  it('setzt ev.placeId UND reprojiziert ev.place sofort (INV-PLACE, Sofort-Reprojektion)', () => {
    const places = placeMap(
      place('@P1@', {
        title: 'Ochtrup',
        type: 'Town',
        enclosedBy: [{ placeId: '@DE@', from: null, to: null , fromDate: null, toDate: null }],
      }),
      place('@DE@', { title: 'Deutschland', type: 'Country' }),
    );
    const ctx = { places: makePlaceRegistry(places), hofs: makeHofRegistry(hofMap()) };
    const e = ev('BIRT', { place: 'irgendein roher String', date: '1900' });
    linkEventToPlace(e, '@P1@', ctx);
    expect(e.placeId).toBe('@P1@');
    // ev.place ist ab sofort die Projektion aus dem Modell, nicht mehr der Rohstring.
    expect(e.place).toBe('Ochtrup, Deutschland');
  });

  it('reprojiziert periodengerecht auf die im Jahr gültige pname', () => {
    const places = placeMap(
      place('@S@', {
        title: 'Sassenberg',
        type: 'Town',
        pnames: [{ value: 'Sassenbergk', from: 1600, to: 1750 , fromDate: null, toDate: null }],
      }),
    );
    const ctx = { places: makePlaceRegistry(places), hofs: makeHofRegistry(hofMap()) };
    const e = ev('BIRT', { place: 'Sassenberg', date: '1700' });
    linkEventToPlace(e, '@S@', ctx);
    expect(e.place).toBe('Sassenbergk');
  });

  it('unbekannte placeId (kein PO) → ev.place bleibt Rohstring (kein Overwrite mit null)', () => {
    const ctx = { places: makePlaceRegistry(placeMap()), hofs: makeHofRegistry(hofMap()) };
    const e = ev('BIRT', { place: 'Ochtrup' });
    linkEventToPlace(e, '@NOPE@', ctx);
    expect(e.placeId).toBe('@NOPE@');
    expect(e.place).toBe('Ochtrup');
  });
});

describe('linkEventToHof — String→HofObject verknüpfen (ADR-v9-42, Sofort-Reprojektion)', () => {
  it('setzt ev.hofId UND reprojiziert ev.place sofort (INV-PLACE, Hof-Adresse + Dorf-Hierarchie)', () => {
    const places = placeMap(place('@V@', { title: 'Ochtrup', type: 'Village' }));
    const hofs = hofMap(hof('@H1@', '@V@', { addrs: [{ value: 'Wall 33', from: null, to: null , fromDate: null, toDate: null }] }));
    const ctx = { places: makePlaceRegistry(places), hofs: makeHofRegistry(hofs) };
    const e = ev('RESI', { place: 'roher String', date: '1900' });
    linkEventToHof(e, '@H1@', ctx);
    expect(e.hofId).toBe('@H1@');
    // ev.place ist ab sofort die Projektion (Hof-Blatt + Dorf), nicht der Rohstring.
    expect(e.place).toBe('Wall 33, Ochtrup');
  });

  it('füllt ev.addr sofort, wenn leer (voller Hof-Adresswert)', () => {
    const places = placeMap(place('@V@', { title: 'Ochtrup', type: 'Village' }));
    const hofs = hofMap(hof('@H1@', '@V@', { addrs: [{ value: 'Wall 33', from: null, to: null , fromDate: null, toDate: null }] }));
    const ctx = { places: makePlaceRegistry(places), hofs: makeHofRegistry(hofs) };
    const e = ev('RESI', { place: '', date: '1900' });
    linkEventToHof(e, '@H1@', ctx);
    expect(e.addr).toBe('Wall 33');
  });

  it('lässt eine bereits gesetzte ev.addr byte-identisch (Wire-ADDR-Roundtrip, LP-1)', () => {
    const places = placeMap(place('@V@', { title: 'Ochtrup', type: 'Village' }));
    const hofs = hofMap(hof('@H1@', '@V@', { addrs: [{ value: 'Wall 33', from: null, to: null , fromDate: null, toDate: null }] }));
    const ctx = { places: makePlaceRegistry(places), hofs: makeHofRegistry(hofs) };
    const e = ev('RESI', { place: '', addr: 'Wall 33, 48607 Ochtrup', date: '1900' });
    linkEventToHof(e, '@H1@', ctx);
    expect(e.addr).toBe('Wall 33, 48607 Ochtrup');
  });

  it('kein Zwischenzustand: hofId gesetzt UND Text reprojiziert nach EINEM Aufruf', () => {
    const places = placeMap(place('@V@', { title: 'Ochtrup', type: 'Village' }));
    const hofs = hofMap(
      hof('@H1@', '@V@', {
        addrs: [{ value: 'Alte Str 1', from: 1800, to: 1899 , fromDate: null, toDate: null }, { value: 'Neue Str 5', from: 1900, to: null , fromDate: null, toDate: null }],
      }),
    );
    const ctx = { places: makePlaceRegistry(places), hofs: makeHofRegistry(hofs) };
    const e = ev('RESI', { place: '', date: '1850' });
    linkEventToHof(e, '@H1@', ctx);
    // periodengerecht: das im Jahr 1850 gültige Adress-Blatt.
    expect(e.hofId).toBe('@H1@');
    expect(e.place).toBe('Alte Str 1, Ochtrup');
    expect(e.addr).toBe('Alte Str 1');
  });

  it('unbekannte hofId (kein HofObject) → ev.place bleibt Rohstring (kein Overwrite mit null)', () => {
    const ctx = { places: makePlaceRegistry(placeMap()), hofs: makeHofRegistry(hofMap()) };
    const e = ev('RESI', { place: 'Wall 33, Ochtrup' });
    linkEventToHof(e, '@NOPE@', ctx);
    expect(e.hofId).toBe('@NOPE@');
    expect(e.place).toBe('Wall 33, Ochtrup');
  });
});

// ADR-v9-222 — „im Orte-Dedup sollte nur der Gewinner überbleiben". Bis dahin faltete der
// Merge Titel, `pnames` und `enclosedBy` der Verlierer in den Überlebenden; am Realbestand
// entstanden daraus Orte mit mehreren gleichzeitig gültigen, undatierten Verwaltungsketten
// („Steinwedel" unter vier Regimen). Die Identitäts-Felder fallen jetzt mit dem Verlierer
// weg; was seine Nennungen an den Überlebenden bindet, meldet `mentionNames`.
describe('mergePlaceObjects — Dubletten-Merge (nur der Gewinner überlebt, ADR-v9-222)', () => {
  it('übernimmt WEDER Titel NOCH pnames des zusammengeführten Orts', () => {
    const places = placeMap(
      place('@A@', { title: 'Ochtrup', type: 'Town' }),
      place('@B@', { title: 'Ochtorp', pnames: [{ value: 'Ochtrupe', from: 1600, to: 1700 , fromDate: null, toDate: null }] }),
    );
    const res = mergePlaceObjects(places, hofMap(), '@A@', '@B@');
    expect(places.has('@B@')).toBe(false);
    expect(places.get('@A@')!.title).toBe('Ochtrup');
    expect(places.get('@A@')!.pnames).toEqual([]);
    // Die Schreibweisen sind nicht verloren, sie wechseln die Zuständigkeit: der Aufrufer
    // bindet die Nennungen, die sie tragen, an den Überlebenden.
    expect(res.mentionNames.sort()).toEqual(['ochtorp', 'ochtrup', 'ochtrupe']);
  });

  it('übernimmt die Zugehörigkeiten (enclosedBy) des Verlierers nicht — keine zweite Kette am Gewinner', () => {
    const places = placeMap(
      place('@A@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@KR_ST@', from: null, to: null , fromDate: null, toDate: null }] }),
      place('@B@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@KR_AH@', from: null, to: null , fromDate: null, toDate: null }] }),
      place('@KR_ST@', { title: 'Kreis Steinfurt' }),
      place('@KR_AH@', { title: 'Kreis Ahaus' }),
    );
    mergePlaceObjects(places, hofMap(), '@A@', '@B@');
    expect(places.get('@A@')!.enclosedBy.map((e) => e.placeId)).toEqual(['@KR_ST@']);
  });

  it('erbt die Existenzspanne des Verlierers nicht (sie datiert einen anderen Eintrag)', () => {
    const places = placeMap(
      place('@A@', { title: 'Ochtrup' }),
      place('@B@', { title: 'Ochtrup', existsFrom: 1150, existsTo: 1802 }),
    );
    mergePlaceObjects(places, hofMap(), '@A@', '@B@');
    expect(places.get('@A@')!.existsFrom).toBeNull();
    expect(places.get('@A@')!.existsTo).toBeNull();
  });

  it('meldet KEINE mentionNames, wenn außerhalb der Gruppe ein gleichnamiger Ort bleibt (Teil-Auswahl, §9.2)', () => {
    const places = placeMap(
      place('@A@', { title: 'Ochtrup' }),
      place('@B@', { title: 'Ochtrup' }),
      place('@C@', { title: 'Ochtrup' }), // nicht ausgewählt → die Mehrdeutigkeit bleibt echt
    );
    const res = mergePlaceObjects(places, hofMap(), '@A@', '@B@');
    expect(places.has('@B@')).toBe(false);
    expect(res.mentionNames).toEqual([]);
  });

  it('repointet hofObjects.villageId vom zusammengeführten auf den Überlebenden Ort', () => {
    const places = placeMap(place('@A@', { title: 'Ochtrup' }), place('@B@', { title: 'Ochtorp' }));
    const hofs = hofMap(hof('_hof_x', '@B@', { addrs: [{ value: 'Wall 33', from: null, to: null , fromDate: null, toDate: null }] }));
    mergePlaceObjects(places, hofs, '@A@', '@B@');
    expect(hofs.get('_hof_x')!.villageId).toBe('@A@');
  });

  it('repointet enclosedBy-Referenzen anderer Orte vom zusammengeführten auf den Überlebenden', () => {
    const places = placeMap(
      place('@A@', { title: 'Ochtrup' }),
      place('@B@', { title: 'Ochtorp' }),
      place('@C@', { title: 'Bauerschaft', enclosedBy: [{ placeId: '@B@', from: null, to: null , fromDate: null, toDate: null }] }),
    );
    mergePlaceObjects(places, hofMap(), '@A@', '@B@');
    expect(places.get('@C@')!.enclosedBy[0].placeId).toBe('@A@');
  });

  it('füllt fehlende Koordinaten/Notiz/Typ des Überlebenden aus dem zusammengeführten Ort', () => {
    const places = placeMap(
      place('@A@', { title: 'Ochtrup' }),
      place('@B@', { title: 'Ochtorp', type: 'Town', lat: 52.2, long: 7.2, note: 'Quelle X' }),
    );
    mergePlaceObjects(places, hofMap(), '@A@', '@B@');
    const a = places.get('@A@')!;
    expect(a.lat).toBe(52.2);
    expect(a.long).toBe(7.2);
    expect(a.note).toBe('Quelle X');
    expect(a.type).toBe('Town');
  });

  it('hängt die Notiz des Verlierers NICHT an eine vorhandene an (fill-if-empty, kein Wachstum)', () => {
    const places = placeMap(
      place('@A@', { title: 'Ochtrup', note: 'Eigene Notiz' }),
      place('@B@', { title: 'Ochtrup', note: 'Notiz des Verlierers' }),
    );
    mergePlaceObjects(places, hofMap(), '@A@', '@B@');
    expect(places.get('@A@')!.note).toBe('Eigene Notiz');
  });

  it('übernimmt translations nur, wenn der Überlebende gar keine hat (fill-if-empty statt Union)', () => {
    const mitEigenen = placeMap(
      place('@A@', { title: 'Breslau', translations: [{ lang: 'pl', value: 'Wrocław' }] }),
      place('@B@', { title: 'Breslau', translations: [{ lang: 'cs', value: 'Vratislav' }] }),
    );
    mergePlaceObjects(mitEigenen, hofMap(), '@A@', '@B@');
    expect(mitEigenen.get('@A@')!.translations).toEqual([{ lang: 'pl', value: 'Wrocław' }]);

    const ohneEigene = placeMap(
      place('@A@', { title: 'Breslau' }),
      place('@B@', { title: 'Breslau', translations: [{ lang: 'cs', value: 'Vratislav' }] }),
    );
    mergePlaceObjects(ohneEigene, hofMap(), '@A@', '@B@');
    expect(ohneEigene.get('@A@')!.translations).toEqual([{ lang: 'cs', value: 'Vratislav' }]);
  });

  it('No-Op bei gleicher ID oder fehlendem Ort', () => {
    const places = placeMap(place('@A@', { title: 'Ochtrup' }));
    const selbst = mergePlaceObjects(places, hofMap(), '@A@', '@A@');
    const fehlend = mergePlaceObjects(places, hofMap(), '@A@', '@MISSING@');
    expect(places.size).toBe(1);
    expect(places.get('@A@')!.title).toBe('Ochtrup');
    expect(places.get('@A@')!.pnames).toHaveLength(0);
    // Kein Merge → nichts umzuschreiben. Sonst bände ein No-Op-Aufruf fremde Nennungen
    // an einen Ort, an dem sich gar nichts geändert hat.
    expect(selbst.mentionNames).toEqual([]);
    expect(fehlend.mentionNames).toEqual([]);
  });
});

// ADR-v9-183 / BL-251 — Nutzerbefund „die zeitliche Gültigkeit von Ortsnamen wird weder
// angezeigt noch ist sie editierbar". Bis dahin gab es nur Anhängen und Entfernen; ein
// Tippfehler kostete Löschen + Neuanlegen und damit die Position im Array. Gleiche
// Bauform wie `withUpdatedHofAddr` (ADR-v9-81), nicht ein zweites Muster daneben.
describe('withUpdatedPname — bestehende Namensvariante bearbeiten (ADR-v9-183)', () => {
  const ochtrup = () =>
    place('@P1@', {
      title: 'Ochtrup',
      pnames: [
        { value: 'Ochtorpe', from: null, to: 1400 , fromDate: null, toDate: null },
        { value: 'Ochtrup', from: 1400, to: null , fromDate: null, toDate: null },
      ],
    });

  it('ersetzt Wert und Zeitraum am angegebenen Index', () => {
    const next = withUpdatedPname(ochtrup(), 0, 'Ochtorp', null, 1380);

    expect(next.pnames[0]).toEqual({ value: 'Ochtorp', from: null, to: 1380 , fromDate: null, toDate: null });
  });

  it('behält die Position im Array — genau der Grund für dieses Kommando', () => {
    const next = withUpdatedPname(ochtrup(), 0, 'Ochtorp', null, 1400);

    expect(next.pnames.map((p) => p.value)).toEqual(['Ochtorp', 'Ochtrup']);
  });

  it('lässt eine nach unten offene Datierung offen (null bleibt null, wird nicht zu 0)', () => {
    const next = withUpdatedPname(ochtrup(), 1, 'Ochtrup', null, null);

    expect(next.pnames[1].from).toBeNull();
    expect(next.pnames[1].to).toBeNull();
  });

  it('trimmt den Wert wie withAddedPname', () => {
    expect(withUpdatedPname(ochtrup(), 0, '  Ochtorp  ', null, 1400).pnames[0].value).toBe('Ochtorp');
  });

  it('ist No-Op bei leerem Wert — kein stillschweigendes Löschen', () => {
    const vorher = ochtrup();

    expect(withUpdatedPname(vorher, 0, '   ', null, 1400)).toBe(vorher);
  });

  it('ist No-Op bei einem Index außerhalb des Arrays', () => {
    const vorher = ochtrup();

    expect(withUpdatedPname(vorher, 5, 'Egal', null, null)).toBe(vorher);
    expect(withUpdatedPname(vorher, -1, 'Egal', null, null)).toBe(vorher);
  });

  it('mutiert das Original nicht (reine Kopie)', () => {
    const vorher = ochtrup();
    withUpdatedPname(vorher, 0, 'Ochtorp', null, 1380);

    expect(vorher.pnames[0]).toEqual({ value: 'Ochtorpe', from: null, to: 1400 , fromDate: null, toDate: null });
  });

  it('übernimmt `dateRaw` des ersetzten Eintrags NICHT — der Roh-String belegt die Datei, nicht die Eingabe', () => {
    const mitRaw = place('@P1@', {
      pnames: [{ value: 'Ochtorpe', from: null, to: 1400, dateRaw: 'TO 1400' }],
    });

    expect(withUpdatedPname(mitRaw, 0, 'Ochtorp', null, 1380).pnames[0].dateRaw).toBeUndefined();
  });
});

// ADR-v9-183 / BL-252 — Geschwister von withUpdatedPname. Der Zeitraum ist hier
// Auswertungsgrundlage (enclosureWinnerAsOf → PLAC-Projektion), nicht bloß Beschriftung.
describe('withUpdatedEnclosedBy — bestehenden Zuordnungs-Zeitraum bearbeiten (ADR-v9-183)', () => {
  const ochtrup = () =>
    place('@P1@', {
      title: 'Ochtrup',
      enclosedBy: [
        { placeId: '@FUERST@', from: null, to: 1806 , fromDate: null, toDate: null },
        { placeId: '@KREIS@', from: 1861, to: null , fromDate: null, toDate: null },
      ],
    });

  it('korrigiert ein falsch getipptes Jahr, ohne die Position zu verlieren', () => {
    const next = withUpdatedEnclosedBy(ochtrup(), 1, '@KREIS@', 1816, null);

    expect(next.enclosedBy).toEqual([
      { placeId: '@FUERST@', from: null, to: 1806 , fromDate: null, toDate: null },
      { placeId: '@KREIS@', from: 1816, to: null , fromDate: null, toDate: null },
    ]);
  });

  it('macht eine Zuordnung nach unten offen, wenn `from` geleert wird (Spec 11 §1)', () => {
    const next = withUpdatedEnclosedBy(ochtrup(), 1, '@KREIS@', null, 1974);

    expect(next.enclosedBy[1]).toEqual({ placeId: '@KREIS@', from: null, to: 1974 , fromDate: null, toDate: null });
  });

  it('kann auch den Elternort wechseln', () => {
    expect(withUpdatedEnclosedBy(ochtrup(), 0, '@ANDERER@', null, 1806).enclosedBy[0].placeId).toBe('@ANDERER@');
  });

  it('ist No-Op ohne Elternort — Leeren ist kein Löschweg (dafür gibt es withRemovedEnclosedBy)', () => {
    const vorher = ochtrup();

    expect(withUpdatedEnclosedBy(vorher, 0, '', 1700, 1806)).toBe(vorher);
  });

  it('ist No-Op bei einem Index außerhalb des Arrays', () => {
    const vorher = ochtrup();

    expect(withUpdatedEnclosedBy(vorher, 9, '@KREIS@', 1816, null)).toBe(vorher);
  });

  it('mutiert das Original nicht (reine Kopie)', () => {
    const vorher = ochtrup();
    withUpdatedEnclosedBy(vorher, 1, '@KREIS@', 1816, null);

    expect(vorher.enclosedBy[1].from).toBe(1861);
  });
});
