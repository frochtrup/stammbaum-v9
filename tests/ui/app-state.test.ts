// tests/ui/app-state.test.ts — AppState-Kommandos für Orte/Höfe (Spec 20 §1.7/§1.8 [K]
// "Bearbeitung"). Kein DOM nötig (reine Runes-Logik) — kein besonderes Test-Environment-
// Directive gesetzt (läuft mit dem globalen 'node'-Environment, s. vitest.config.ts).
import { describe, expect, it } from 'vitest';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { makePerson, makeFamily, makeSource, makeRepository, makeDatabase } from '../../core/model/index';
import { parseGedcom } from '../../core/interop';
import type { PlaceObject, HofObject } from '../../core/places';

function place(id: string, patch: Partial<PlaceObject> = {}): PlaceObject {
  return {
    id,
    title: '',
    type: '',
    pnames: [],
    enclosedBy: [],
    lat: null,
    long: null,
    note: '',
    existsFrom: null,
    existsTo: null,
    govId: null,
    govTypes: null,
    ...patch,
  };
}

function hof(id: string, villageId: string, patch: Partial<HofObject> = {}): HofObject {
  return {
    id,
    villageId,
    addrs: [],
    lat: null,
    long: null,
    note: '',
    existsFrom: null,
    existsTo: null,
    predecessor: null,
    successor: null,
    govId: null,
    govTypes: null,
    schemaVersion: 1,
    ...patch,
  };
}

describe('AppState.savePlace/deletePlace — Chokepoint-Kontext bleibt konsistent', () => {
  it('savePlace fügt ein PlaceObject hinzu, das über db + placeContext sichtbar wird', () => {
    const appState = createAppState();
    appState.savePlace(place('@P1@', { title: 'Ochtrup' }));

    expect(appState.db.placeObjects.get('@P1@')?.title).toBe('Ochtrup');
    expect(appState.placeContext.places.byId('@P1@')?.title).toBe('Ochtrup');
    expect(appState.placeContext.places.findByName('Ochtrup')).toBe('@P1@');
  });

  it('savePlace ersetzt ein bestehendes PlaceObject vollständig', () => {
    const appState = createAppState();
    appState.savePlace(place('@P1@', { title: 'Alt' }));
    appState.savePlace(place('@P1@', { title: 'Neu' }));

    expect(appState.db.placeObjects.get('@P1@')?.title).toBe('Neu');
  });

  it('deletePlace entfernt ein PlaceObject wieder', () => {
    const appState = createAppState();
    appState.savePlace(place('@P1@'));
    appState.deletePlace('@P1@');

    expect(appState.db.placeObjects.has('@P1@')).toBe(false);
  });

  it('mergePlace führt Dubletten zusammen: Variante überlebt, Hof-villageId wird umgehängt, Kontext bleibt konsistent', () => {
    const appState = createAppState();
    appState.savePlace(place('@A@', { title: 'Ochtrup', type: 'Town' }));
    appState.savePlace(place('@B@', { title: 'Ochtorp' }));
    appState.saveHof(hof('_hof_x', '@B@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));

    appState.mergePlace('@A@', '@B@');

    expect(appState.db.placeObjects.has('@B@')).toBe(false);
    expect(appState.db.placeObjects.get('@A@')?.pnames.map((p) => p.value)).toContain('Ochtorp');
    expect(appState.db.hofObjects.get('_hof_x')?.villageId).toBe('@A@');
    // Chokepoint-Kontext passt zur neuen db: die zusammengeführte Variante findet jetzt @A@.
    expect(appState.placeContext.places.findByName('Ochtorp')).toBe('@A@');
  });

  it('mergePlace akzeptiert ein Array von Verlierern (Massen-Dedup, §9.2) und gibt ein MergeResult zurück', () => {
    const appState = createAppState();
    appState.savePlace(place('@A@', { title: 'Ochtrup' }));
    appState.savePlace(place('@B@', { title: 'Ochtorp' }));
    appState.savePlace(place('@C@', { title: 'Ochtrupe' }));

    const result = appState.mergePlace('@A@', ['@B@', '@C@']);

    expect(appState.db.placeObjects.has('@B@')).toBe(false);
    expect(appState.db.placeObjects.has('@C@')).toBe(false);
    expect(result.hofsMerged).toBe(0);
    expect(result.villageId).toBeNull();
  });

  it('mergePlace meldet den automatischen Hof-Nachlauf im MergeResult (ADR-v9-45 Nachtrag 2026-07-10)', () => {
    const appState = createAppState();
    appState.savePlace(place('@A@', { title: 'Ochtrup' }));
    appState.savePlace(place('@B@', { title: 'Ochtorp' }));
    appState.saveHof(hof('_h1', '@A@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    appState.saveHof(hof('_h2', '@B@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));

    const result = appState.mergePlace('@A@', '@B@');

    expect(result.hofsMerged).toBe(1);
    expect(result.villageId).toBe('@A@');
    // Genau einer der beiden Höfe überlebt unter dem Gewinner-Dorf.
    const survivingHofs = Array.from(appState.db.hofObjects.values()).filter((h) => h.villageId === '@A@');
    expect(survivingHofs).toHaveLength(1);
  });
});

describe('AppState.persistPlaces — Orts-/Hof-Edits lösen Persistenz aus (Befund 1 / task_a82678c1)', () => {
  it('jede Orts-/Hof-Mutation ruft persistPlaces genau einmal', () => {
    let calls = 0;
    const appState = createAppState({ persistPlaces: () => (calls += 1) });
    appState.savePlace(place('@A@', { title: 'Ochtrup' }));
    appState.savePlace(place('@B@', { title: 'Wettringen' }));
    appState.mergePlace('@A@', '@B@');
    appState.saveHof(hof('_h1', '@A@'));
    appState.deleteHof('_h1');
    appState.deletePlace('@A@');
    expect(calls).toBe(6);
  });

  it('persistPlaces bekommt den aktuellen placeObjects-Stand nach der Mutation', () => {
    let lastPlaces: Map<string, unknown> | null = null;
    const appState = createAppState({ persistPlaces: (p) => (lastPlaces = p) });
    appState.savePlace(place('@A@', { title: 'Ochtrup' }));
    expect((lastPlaces as unknown as Map<string, { title: string }>)?.get('@A@')?.title).toBe('Ochtrup');
  });

  it('loadDatabase löst KEIN persistPlaces aus (der Import-Pfad persistiert separat)', () => {
    let calls = 0;
    const appState = createAppState({ persistPlaces: () => (calls += 1) });
    appState.loadDatabase(makeDatabase(), 'x.ged');
    expect(calls).toBe(0);
  });

  it('ohne injizierten Callback bleiben Edits rein in-memory (kein Fehler)', () => {
    const appState = createAppState();
    appState.savePlace(place('@A@', { title: 'Ochtrup' }));
    expect(appState.db.placeObjects.get('@A@')?.title).toBe('Ochtrup');
  });
});

describe('AppState.saveHof/deleteHof — Chokepoint-Kontext bleibt konsistent', () => {
  it('saveHof fügt einen Hof hinzu, der über placeContext.hofs sichtbar wird', () => {
    const appState = createAppState();
    appState.savePlace(place('@P1@', { title: 'Ochtrup' }));
    appState.saveHof(hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));

    expect(appState.db.hofObjects.get('@H1@')?.addrs[0]?.value).toBe('Wall 33');
    expect(appState.placeContext.hofs.byVillage('@P1@')).toEqual(['@H1@']);
  });

  it('deleteHof entfernt einen Hof wieder', () => {
    const appState = createAppState();
    appState.saveHof(hof('@H1@', '@P1@'));
    appState.deleteHof('@H1@');

    expect(appState.db.hofObjects.has('@H1@')).toBe(false);
  });

  it('mergeHof führt Dubletten zusammen (Array von Verlierern, Massen-Dedup §9.2)', () => {
    const appState = createAppState();
    appState.savePlace(place('@P1@', { title: 'Ochtrup' }));
    appState.saveHof(hof('@H1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
    appState.saveHof(hof('@H2@', '@P1@', { addrs: [{ value: 'Wall 33a', from: null, to: null }] }));

    appState.mergeHof('@H1@', ['@H2@']);

    expect(appState.db.hofObjects.has('@H2@')).toBe(false);
    expect(appState.db.hofObjects.get('@H1@')?.addrs.map((a) => a.value)).toContain('Wall 33a');
  });

  it('mergeHof: persistPlaces wird ausgelöst (TST-8-Anschluss: Persistenz-Kommando nicht vergessen)', () => {
    let calls = 0;
    const appState = createAppState({ persistPlaces: () => (calls += 1) });
    appState.saveHof(hof('@H1@', '@P1@'));
    appState.saveHof(hof('@H2@', '@P1@'));
    calls = 0;
    appState.mergeHof('@H1@', ['@H2@']);
    expect(calls).toBe(1);
  });
});

describe('AppState.mergePlace/mergeHof — Persistenz-Rundlauf (TST-8: speichern -> "neu laden" -> noch da)', () => {
  it('nach mergePlace bleibt der konsolidierte Stand über einen simulierten Reload (persistPlaces-Snapshot) erhalten', () => {
    let persisted: { places: Map<string, PlaceObject>; hofs: Map<string, HofObject> } | null = null;
    const appState = createAppState({
      persistPlaces: (places, hofs) => {
        persisted = { places: new Map(places), hofs: new Map(hofs) };
      },
    });
    appState.savePlace(place('@A@', { title: 'Ochtrup' }));
    appState.savePlace(place('@B@', { title: 'Ochtorp' }));
    appState.mergePlace('@A@', '@B@');

    // Simulierter Reload: eine frische AppState-Instanz übernimmt NUR den persistierten Snapshot.
    const reloaded = createAppState();
    const db2 = makeDatabase();
    for (const [id, po] of persisted!.places) db2.placeObjects.set(id, po);
    for (const [id, h] of persisted!.hofs) db2.hofObjects.set(id, h);
    reloaded.loadDatabase(db2, 'reload.ged');

    expect(reloaded.db.placeObjects.has('@B@')).toBe(false);
    expect(reloaded.db.placeObjects.get('@A@')?.pnames.map((p) => p.value)).toContain('Ochtorp');
  });
});

describe('AppState.savePerson/deletePerson — Personen-Editor-Kommandos (Spec 20 §2)', () => {
  it('savePerson fügt eine Person hinzu, die über db sichtbar wird', () => {
    const appState = createAppState();
    appState.savePerson(makePerson('@I1@', { given: 'Anna', surname: 'Bauer' }));

    expect(appState.db.individuals.get('@I1@')?.given).toBe('Anna');
  });

  it('savePerson ersetzt eine bestehende Person vollständig (Upsert per id)', () => {
    const appState = createAppState();
    appState.savePerson(makePerson('@I1@', { given: 'Alt' }));
    appState.savePerson(makePerson('@I1@', { given: 'Neu' }));

    expect(appState.db.individuals.get('@I1@')?.given).toBe('Neu');
  });

  it('savePerson loest KEIN persistPlaces aus (Genealogie-Persistenz ist ein separates Folge-Feature)', () => {
    let calls = 0;
    const appState = createAppState({ persistPlaces: () => (calls += 1) });
    appState.savePerson(makePerson('@I1@'));
    expect(calls).toBe(0);
  });

  it('deletePerson entfernt eine Person wieder', () => {
    const appState = createAppState();
    appState.savePerson(makePerson('@I1@'));
    appState.deletePerson('@I1@');

    expect(appState.db.individuals.has('@I1@')).toBe(false);
  });

  it('deletePerson ist ein No-Op bei unbekannter id (kein Fehler)', () => {
    const appState = createAppState();
    expect(() => appState.deletePerson('@I-gone@')).not.toThrow();
  });
});

describe('AppState.saveFamily/deleteFamily — Familien-Editor-Kommandos (Spec 20 §2, INV-P3)', () => {
  it('saveFamily fügt eine Familie hinzu, die über db sichtbar wird', () => {
    const appState = createAppState();
    appState.saveFamily(makeFamily('@F1@'));

    expect(appState.db.families.has('@F1@')).toBe(true);
  });

  it('saveFamily führt die INDI-Seite (parentIn/childOf) synchron nach — der eigentliche Beweis für INV-P3', () => {
    const appState = createAppState();
    appState.savePerson(makePerson('@I1@', { given: 'Otto' })); // Ehemann
    appState.savePerson(makePerson('@I2@', { given: 'Anna' })); // Ehefrau
    appState.savePerson(makePerson('@I3@', { given: 'Kind' })); // Kind

    const fam = makeFamily('@F1@', { husband: '@I1@', wife: '@I2@', children: ['@I3@'] });
    appState.saveFamily(fam);

    expect(appState.db.individuals.get('@I1@')?.parentIn).toContain('@F1@');
    expect(appState.db.individuals.get('@I2@')?.parentIn).toContain('@F1@');
    expect(appState.db.individuals.get('@I3@')?.childOf.map((c) => c.familyId)).toContain('@F1@');
  });

  it('saveFamily entfernt eine INDI-Seiten-Verknüpfung wieder, wenn ein Elternteil/Kind aus der Familie genommen wird', () => {
    const appState = createAppState();
    appState.savePerson(makePerson('@I1@'));
    appState.savePerson(makePerson('@I3@'));
    appState.saveFamily(makeFamily('@F1@', { husband: '@I1@', children: ['@I3@'] }));

    appState.saveFamily(makeFamily('@F1@', { husband: null, children: [] }));

    expect(appState.db.individuals.get('@I1@')?.parentIn).not.toContain('@F1@');
    expect(appState.db.individuals.get('@I3@')?.childOf.map((c) => c.familyId)).not.toContain('@F1@');
  });

  it('deleteFamily entfernt eine Familie wieder', () => {
    const appState = createAppState();
    appState.saveFamily(makeFamily('@F1@'));
    appState.deleteFamily('@F1@');

    expect(appState.db.families.has('@F1@')).toBe(false);
  });

  it('deleteFamily ist ein No-Op bei unbekannter id (kein Fehler)', () => {
    const appState = createAppState();
    expect(() => appState.deleteFamily('@F-gone@')).not.toThrow();
  });
});

describe('AppState.saveSource/deleteSource — Quellen-Editor-Kommandos (Spec 20 §2)', () => {
  it('saveSource fügt eine Quelle hinzu, die über db sichtbar wird', () => {
    const appState = createAppState();
    appState.saveSource(makeSource('@S1@', { title: 'Kirchenbuch Ochtrup' }));

    expect(appState.db.sources.get('@S1@')?.title).toBe('Kirchenbuch Ochtrup');
  });

  it('saveSource ersetzt eine bestehende Quelle vollständig (Upsert per id)', () => {
    const appState = createAppState();
    appState.saveSource(makeSource('@S1@', { title: 'Alt' }));
    appState.saveSource(makeSource('@S1@', { title: 'Neu' }));

    expect(appState.db.sources.get('@S1@')?.title).toBe('Neu');
  });

  it('deleteSource entfernt eine Quelle', () => {
    const appState = createAppState();
    appState.saveSource(makeSource('@S1@'));
    appState.deleteSource('@S1@');

    expect(appState.db.sources.has('@S1@')).toBe(false);
  });

  it('deleteSource ist ein No-Op bei unbekannter id (kein Fehler)', () => {
    const appState = createAppState();
    expect(() => appState.deleteSource('@S-gone@')).not.toThrow();
  });
});

describe('AppState.saveRepository/deleteRepository — Archiv-Editor-Kommandos (Spec 20 §2)', () => {
  it('saveRepository fügt ein Archiv hinzu, das über db sichtbar wird', () => {
    const appState = createAppState();
    appState.saveRepository(makeRepository('@R1@', { name: 'Landesarchiv NRW' }));

    expect(appState.db.repositories.get('@R1@')?.name).toBe('Landesarchiv NRW');
  });

  it('saveRepository ersetzt ein bestehendes Archiv vollständig (Upsert per id)', () => {
    const appState = createAppState();
    appState.saveRepository(makeRepository('@R1@', { name: 'Alt' }));
    appState.saveRepository(makeRepository('@R1@', { name: 'Neu' }));

    expect(appState.db.repositories.get('@R1@')?.name).toBe('Neu');
  });

  it('deleteRepository entfernt ein Archiv', () => {
    const appState = createAppState();
    appState.saveRepository(makeRepository('@R1@'));
    appState.deleteRepository('@R1@');

    expect(appState.db.repositories.has('@R1@')).toBe(false);
  });

  it('deleteRepository ist ein No-Op bei unbekannter id (kein Fehler)', () => {
    const appState = createAppState();
    expect(() => appState.deleteRepository('@R-gone@')).not.toThrow();
  });
});

describe('AppState.touch — erzwungene Aktualisierung nach In-Place-Event-Mutation', () => {
  it('gibt eine neue db-Referenz zurück, mit unverändertem Inhalt', () => {
    const appState = createAppState();
    appState.savePlace(place('@P1@', { title: 'Ochtrup' }));
    const before = appState.db;

    appState.touch();

    expect(appState.db).not.toBe(before);
    expect(appState.db.placeObjects).toBe(before.placeObjects); // Maps bleiben identisch (kein unnötiges Klonen)
    expect(appState.db.placeObjects.get('@P1@')?.title).toBe('Ochtrup');
  });
});

describe('AppState.loadDatabase/serialize — roots-Passthrough für Genealogie-Arbeitskopie/-Export (Spec 14 §3.1)', () => {
  it('loadDatabase ohne roots-Argument: serialize() liefert dennoch ein valides GEDCOM (leerer roots-Fallback)', () => {
    const appState = createAppState();
    appState.loadDatabase(makeDatabase(), 'x.ged');
    expect(() => appState.serialize()).not.toThrow();
  });

  it('serialize() projiziert einen editierten Personennamen in den zurückgegebenen Text', () => {
    const MINI_GED = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 5.5.1',
      '2 FORM LINEAGE-LINKED',
      '1 CHAR UTF-8',
      '0 @I1@ INDI',
      '1 NAME Max /Muster/',
      '1 SEX M',
      '0 TRLR',
      '',
    ].join('\n');
    const parsed = parseGedcom(MINI_GED);
    const appState = createAppState();
    appState.loadDatabase(parsed.db, 'x.ged', parsed.roots);

    const edited = appState.db.individuals.get('@I1@')!;
    appState.savePerson({ ...edited, given: 'Anna', name: 'Anna /Muster/' });

    const text = appState.serialize();
    expect(text).toContain('Anna /Muster/');
  });

  it('buildGedcomDoc() liefert {db, roots} für den expliziten Export (exportViaOnePipe)', () => {
    const parsed = parseGedcom(
      ['0 HEAD', '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8', '0 @I1@ INDI', '1 NAME Max /Muster/', '0 TRLR', ''].join(
        '\n',
      ),
    );
    const appState = createAppState();
    appState.loadDatabase(parsed.db, 'x.ged', parsed.roots);

    const doc = appState.buildGedcomDoc();
    expect(doc.db).toBe(appState.db);
    expect(doc.roots.some((r) => r.tag === 'INDI' && r.xref === '@I1@')).toBe(true);
  });

  it('zweimaliges serialize() ohne zwischenzeitliche Edits liefert denselben Text (roots bleibt stabil)', () => {
    const parsed = parseGedcom(
      ['0 HEAD', '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8', '0 TRLR', ''].join('\n'),
    );
    const appState = createAppState();
    appState.loadDatabase(parsed.db, 'x.ged', parsed.roots);

    const first = appState.serialize();
    const second = appState.serialize();
    expect(second).toBe(first);
  });
});

describe('AppState.persistWorkingCopy — stilles Auto-Save der Genealogie-Arbeitskopie (Spec 14 §3.1)', () => {
  function loadedAppState(persistWorkingCopy: (text: string) => void) {
    const appState = createAppState({ persistWorkingCopy });
    const parsed = parseGedcom(
      [
        '0 HEAD',
        '1 GEDC',
        '2 VERS 5.5.1',
        '2 FORM LINEAGE-LINKED',
        '1 CHAR UTF-8',
        '0 @I1@ INDI',
        '1 NAME Max /Muster/',
        '1 SEX M',
        '0 @F1@ FAM',
        '0 @S1@ SOUR',
        '1 TITL Kirchenbuch',
        '0 @R1@ REPO',
        '1 NAME Landesarchiv',
        '0 TRLR',
        '',
      ].join('\n'),
    );
    appState.loadDatabase(parsed.db, 'x.ged', parsed.roots);
    return appState;
  }

  it('wird nach savePerson/deletePerson aufgerufen', () => {
    let calls = 0;
    const appState = loadedAppState(() => (calls += 1));
    appState.savePerson(makePerson('@I2@', { given: 'Neu' }));
    appState.deletePerson('@I2@');
    expect(calls).toBe(2);
  });

  it('wird nach saveFamily/deleteFamily aufgerufen', () => {
    let calls = 0;
    const appState = loadedAppState(() => (calls += 1));
    appState.saveFamily(makeFamily('@F1@'));
    appState.deleteFamily('@F1@');
    expect(calls).toBe(2);
  });

  it('wird nach saveSource/deleteSource aufgerufen', () => {
    let calls = 0;
    const appState = loadedAppState(() => (calls += 1));
    appState.saveSource(makeSource('@S1@', { title: 'Neu' }));
    appState.deleteSource('@S1@');
    expect(calls).toBe(2);
  });

  it('wird nach saveRepository/deleteRepository aufgerufen', () => {
    let calls = 0;
    const appState = loadedAppState(() => (calls += 1));
    appState.saveRepository(makeRepository('@R1@', { name: 'Neu' }));
    appState.deleteRepository('@R1@');
    expect(calls).toBe(2);
  });

  it('wird NICHT nach savePlace/saveHof aufgerufen (nur persistPlaces, s. o.)', () => {
    let calls = 0;
    const appState = loadedAppState(() => (calls += 1));
    appState.savePlace(place('@P1@', { title: 'Ochtrup' }));
    appState.saveHof(hof('@H1@', '@P1@'));
    expect(calls).toBe(0);
  });

  it('wird nach touch() aufgerufen (deckt linkEventToPlace-Reprojektion von ev.place ab, Nachtrag 2026-07-07)', () => {
    let calls = 0;
    const appState = loadedAppState(() => (calls += 1));
    const person = appState.db.individuals.get('@I1@')!;
    person.birth.place = 'Ochtrup, Steinfurt, NRW, Deutschland'; // simuliert linkEventToPlace-Reprojektion
    appState.touch();
    expect(calls).toBe(1);
  });

  it('wird NICHT nach touch() aufgerufen, solange noch keine Datei geladen ist', () => {
    let calls = 0;
    const appState = createAppState({ persistWorkingCopy: () => (calls += 1) });
    appState.touch();
    expect(calls).toBe(0);
  });

  it('wird nach addTask/updateTask/setTaskStatus/deleteTask aufgerufen (Nachtrag 2026-07-07, _TASK-Write-Back)', () => {
    let calls = 0;
    const appState = loadedAppState(() => (calls += 1));
    appState.addTask('person', '@I1@', 't1', 'Kirchenbuch prüfen', 'Kirchenbuch', '2026-07-07');
    appState.updateTask('person', '@I1@', 't1', 'Kirchenbuch prüfen (aktualisiert)', 'Kirchenbuch');
    appState.setTaskStatus('person', '@I1@', 't1', 'done');
    appState.deleteTask('person', '@I1@', 't1');
    expect(calls).toBe(4);
  });

  it('serialisierter Text nach addTask enthält den _TASK-Block', () => {
    let lastText = '';
    const appState = loadedAppState((text) => (lastText = text));
    appState.addTask('person', '@I1@', 't1', 'Kirchenbuch prüfen', 'Kirchenbuch', '2026-07-07');
    expect(lastText).toContain('_TASK Kirchenbuch prüfen');
  });

  it('wird NICHT aufgerufen, solange noch keine Datei geladen ist (kein leeres Working-Copy-Save)', () => {
    let calls = 0;
    const appState = createAppState({ persistWorkingCopy: () => (calls += 1) });
    appState.savePerson(makePerson('@I1@'));
    expect(calls).toBe(0);
  });

  it('übergibt den aktuellen serialisierten Text (enthält den editierten Namen)', () => {
    let lastText = '';
    const appState = loadedAppState((text) => (lastText = text));
    appState.savePerson(makePerson('@I1@', { given: 'Anna', surname: 'Bauer', name: 'Anna /Bauer/' }));
    expect(lastText).toContain('Anna /Bauer/');
  });
});

describe('AppState.addTask/updateTask/setTaskStatus/deleteTask — Aufgaben-Kommandos (Spec 20 §1.11 [K])', () => {
  it('addTask legt eine Aufgabe an einer Person an und löst eine neue db-Referenz aus', () => {
    const appState = createAppState();
    const db = appState.db;
    db.individuals.set('@I1@', makePerson('@I1@'));
    appState.loadDatabase(db, 'test.ged');
    const before = appState.db;

    appState.addTask('person', '@I1@', 't1', 'Kirchenbuch prüfen', 'Kirchenbuch', '2026-07-04');

    expect(appState.db).not.toBe(before);
    expect(appState.db.individuals.get('@I1@')?.tasks[0]?.text).toBe('Kirchenbuch prüfen');
  });

  it('addTask legt eine Aufgabe an einer Familie an', () => {
    const appState = createAppState();
    const db = appState.db;
    db.families.set('@F1@', makeFamily('@F1@'));
    appState.loadDatabase(db, 'test.ged');

    appState.addTask('family', '@F1@', 't1', 'Heiratsurkunde beschaffen', 'Urkunde', '2026-07-04');

    expect(appState.db.families.get('@F1@')?.tasks[0]?.text).toBe('Heiratsurkunde beschaffen');
  });

  it('updateTask ersetzt Text/Kategorie', () => {
    const appState = createAppState();
    const db = appState.db;
    db.individuals.set('@I1@', makePerson('@I1@'));
    appState.loadDatabase(db, 'test.ged');
    appState.addTask('person', '@I1@', 't1', 'alt', 'Kirchenbuch', '2026-07-04');

    appState.updateTask('person', '@I1@', 't1', 'neu', 'Urkunde');

    const t = appState.db.individuals.get('@I1@')?.tasks[0];
    expect(t?.text).toBe('neu');
    expect(t?.category).toBe('Urkunde');
  });

  it('setTaskStatus hält done synchron zum Status', () => {
    const appState = createAppState();
    const db = appState.db;
    db.individuals.set('@I1@', makePerson('@I1@'));
    appState.loadDatabase(db, 'test.ged');
    appState.addTask('person', '@I1@', 't1', 'x', 'Kirchenbuch', '2026-07-04');

    appState.setTaskStatus('person', '@I1@', 't1', 'done');

    const t = appState.db.individuals.get('@I1@')?.tasks[0];
    expect(t?.status).toBe('done');
    expect(t?.done).toBe(true);
  });

  it('deleteTask entfernt die Aufgabe wieder', () => {
    const appState = createAppState();
    const db = appState.db;
    db.individuals.set('@I1@', makePerson('@I1@'));
    appState.loadDatabase(db, 'test.ged');
    appState.addTask('person', '@I1@', 't1', 'x', 'Kirchenbuch', '2026-07-04');

    appState.deleteTask('person', '@I1@', 't1');

    expect(appState.db.individuals.get('@I1@')?.tasks).toHaveLength(0);
  });
});
