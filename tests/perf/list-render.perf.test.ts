// @vitest-environment happy-dom
// tests/perf/list-render.perf.test.ts — Knoten-Wächter für die acht INDEX-Flächen
// (BL-311, ADR-v9-234; Zusicherung: Spec 30 §1 NFR-1, 20.000 Personen).
//
// WARUM DIESES GATE EXISTIERT. Die sechs Haupt-Listen, die globalen Suchtreffer und die
// Medien-Kachelgalerie rendern jede Zeile in einem `{#each}` — ohne Deckel, ohne Fenster.
// Gemessen (2026-08-09): `PersonList` erzeugt 7,0 Knoten je Zeile, streng linear bis
// 140.012 Knoten bei 20.000 Personen. Ohne Gate fällt das niemandem auf, weil der reale
// Bestand mit ~3.200 Personen bei jeder Implementierung noch trägt.
//
// GEMESSEN WIRD „KNOTEN JE ZEILE", NICHT DIE ABSOLUTE ZAHL — und das ist Absicht:
//  * Die Kennzahl trifft genau die Frage. Eine flache Liste hat einen konstanten Wert je
//    Zeile (7,0), ein Fenster über den sichtbaren Bereich lässt ihn mit steigender
//    Zeilenzahl gegen 0 fallen (der Zähler bleibt stehen, der Nenner wächst). Der Sprung
//    von O(n) auf O(sichtbar) ist damit EINE Zahl statt acht Einzelwerte.
//  * Sie ist hardware-unabhängig und deterministisch: die headless gemessene Knotenzahl
//    deckt sich mit der Browser-Messung vom 2026-08-04 (22.272 vs. 22.613 bei 3.180
//    Personen, unter 2 % Abweichung) — kein Emulator-Artefakt.
//  * Sie ist billig. Der erste Entwurf rendert alle acht Flächen bei 20.000 Einträgen und
//    sprengte reproduzierbar den Worker-Heap (OOM ab der dritten Fläche, auch mit
//    `--expose-gc` und `--max-old-space-size=4096`; jede Fläche EINZELN läuft problemlos —
//    es ist reine Anhäufung). Bei 2.000 Zeilen ist die Kennzahl dieselbe, der Lauf kostet
//    Sekunden statt Minuten, und der Speicher bleibt flach.
// EIN absoluter Anker bleibt: `PersonList` bei 20.000 — das ist die Zahl, die Spec 30 §1
// nennt, und sie soll im Log stehen, nicht nur hochgerechnet werden.
//
// DIE MOUNT-ZEIT IST KEINE PAINT-ZEIT. happy-dom hat kein Layout. Sie läuft als zweite
// Zahl mit (Größenordnungs-Wecker) mit bewusst weitem Budget und ist bis zur ersten
// CI-Messung eine Schätzung auf fremder Hardware (Lehre ADR-v9-91: eine Schwelle für
// fremde Hardware lässt sich auf eigener nicht kalibrieren).
//
// RATSCHE, NICHT ZIELWERT. Die Werte unten stehen auf dem heutigen IST plus Reserve, nicht
// auf dem Ziel aus NFR-1 — sonst wäre das Gate am Tag seiner Entstehung rot und würde
// abgeschaltet (dieselbe Erwägung wie in `scale.perf.test.ts`). Es friert den Status quo
// ein: keine Änderung darf eine Index-Fläche TEURER machen. Die Distanz zum Ziel steht in
// jeder Zeile der Ausgabe — sie ist die eigentliche Aussage, solange BL-311s
// Windowing-Primitive nicht an allen acht Flächen hängt. Danach sinkt die Ratsche auf
// O(sichtbar); die Backlog-Zeile sagt das ausdrücklich.
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import PersonList from '../../ui/views/person/PersonList.svelte';
import FamilyList from '../../ui/views/family/FamilyList.svelte';
import SourceList from '../../ui/views/source/SourceList.svelte';
import RepositoryList from '../../ui/views/repository/RepositoryList.svelte';
import PlaceList from '../../ui/views/place/PlaceList.svelte';
import HofList from '../../ui/views/hof/HofList.svelte';
import GlobalSearchView from '../../ui/views/search/GlobalSearchView.svelte';
import MediaGallery from '../../ui/views/media/MediaGallery.svelte';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { createViewState } from '../../ui/shell/view-state.svelte';
import { createGlobalSearchState } from '../../ui/views/search/global-search-state.svelte';
import {
  makeDatabase,
  makeFamily,
  makeMedia,
  makePerson,
  makeRepository,
  makeSource,
} from '../../core/model';
import type { Database } from '../../core/model/types';
import { hof, place } from '../core/places-fixtures';

/** Messgröße für die Kennzahl — groß genug, dass Fixkosten nicht durchschlagen. */
const ZEILEN = 2_000;

/** Der eine absolute Anker: die Zahl aus Spec 30 §1 („v9-Zusicherung: 20.000 Personen"). */
const ANKER_ZEILEN = 20_000;

/**
 * Ratschen je Fläche: **gemessener Ist-Wert** (2026-08-09, headless, n=2.000) plus Reserve —
 * keine Zielwerte, keine geschätzten Zahlen. Der Kommentar hinter jeder Zeile ist die
 * Messung, gegen die die Reserve gelegt wurde.
 *
 *  fällt bewusst aus der Reihe: sie gruppiert nach Dorf, und eine Gruppe mit mehr
 * als 30 Zeilen klappt automatisch ein (Spec 21 §10b/ADR-v9-78). Sie rendert deshalb schon
 * heute O(Gruppen) statt O(Zeilen) — ihre Ratsche SCHÜTZT dieses Verhalten, statt ein
 * Versäumnis festzuhalten. Aufgefallen erst in der Messung: die Backlog-Zeile hatte alle
 * sechs Listen als flach geführt.
 */
const RATSCHE_JE_ZEILE: Record<string, number> = {
  PersonList: 7.5, // gemessen 7,01
  FamilyList: 5.5, // gemessen 5,00
  SourceList: 6.5, // gemessen 6,00
  RepositoryList: 5.5, // gemessen 5,00
  PlaceList: 9.5, // gemessen 9,01
  HofList: 0.05, // gemessen 0,01 — Auto-Einklappen je Dorf-Gruppe (ADR-v9-78)
  GlobalSearchView: 5.5, // gemessen 5,00
  MediaGallery: 7.5, // gemessen 7,01
};
/** Ratsche des absoluten Ankers (Ist 140.012 + Reserve). */
const RATSCHE_ANKER_KNOTEN = 148_000;

/**
 * Ziel-Größenordnung für die Distanz-Meldung: ein Fenster über den sichtbaren Bereich
 * braucht ~40 Zeilen Reserve, bei ≤10 Knoten je Zeile also einige hundert Knoten. 5.000
 * ist die großzügige Obergrenze — wer darunter liegt, rendert erwiesen nicht den Bestand.
 */
const ZIEL_KNOTEN = 5_000;

/** Mount-Zeit: weiter Größenordnungs-Wecker, bis die erste CI-Messung ihn kalibriert. */
const BUDGET_MOUNT_MS = 30_000;

function personenDb(n: number): Database {
  const db = makeDatabase();
  for (let i = 0; i < n; i++) {
    const id = `@I${i + 1}@`;
    const p = makePerson(id, {
      given: `Vorname${i}`,
      surname: `Nachname${i % 200}`,
      name: `Vorname${i} /Nachname${i % 200}/`,
      sex: i % 2 === 0 ? 'M' : 'F',
    });
    p.birth.date = `${1700 + (i % 250)}`;
    p.birth.place = `Ort${i % 50}`;
    db.individuals.set(id, p);
  }
  return db;
}

function familienDb(n: number): Database {
  const db = personenDb(2 * n);
  for (let i = 0; i < n; i++) {
    const id = `@F${i + 1}@`;
    db.families.set(id, makeFamily(id, { husband: `@I${2 * i + 1}@`, wife: `@I${2 * i + 2}@` }));
  }
  return db;
}

function quellenDb(n: number): Database {
  const db = makeDatabase();
  for (let i = 0; i < n; i++) {
    db.sources.set(
      `@S${i + 1}@`,
      makeSource(`@S${i + 1}@`, { abbr: `KB ${i}`, author: `Pfarrer ${i % 50}` }),
    );
  }
  return db;
}

function archiveDb(n: number): Database {
  const db = makeDatabase();
  for (let i = 0; i < n; i++) {
    db.repositories.set(`@R${i + 1}@`, makeRepository(`@R${i + 1}@`, { name: `Archiv ${i}` }));
  }
  return db;
}

/**
 * Orte MIT referenzierenden Ereignissen. Ohne sie zeigt die Liste ihren Abschnitt
 * „Orte (0)" und rendert 10 Knoten — die Messung wäre still leer (beim ersten Lauf genau
 * so passiert und von der „hat nichts gerendert"-Zusicherung gefangen).
 */
function ortDb(n: number): Database {
  const db = makeDatabase();
  for (let i = 0; i < n; i++) {
    const pid = `@P${i + 1}@`;
    db.placeObjects.set(pid, place(pid, { title: `Ort ${i}`, type: 'Village' }));
    const person = makePerson(`@I${i + 1}@`, { given: `V${i}`, surname: `N${i % 200}`, name: `V${i} /N${i % 200}/` });
    person.birth.date = '1900';
    person.birth.place = `Ort ${i}`;
    person.birth.placeId = pid;
    db.individuals.set(person.id, person);
  }
  return db;
}

/** Höfe MIT Bewohner-Ereignissen — dieselbe Begründung wie bei . */
function hofDb(n: number): Database {
  const db = makeDatabase();
  db.placeObjects.set('@P1@', place('@P1@', { title: 'Ochtrup', type: 'Village' }));
  for (let i = 0; i < n; i++) {
    const hid = `@H${i + 1}@`;
    db.hofObjects.set(hid, hof(hid, '@P1@', { addrs: [{ value: `Wall ${i}`, from: null, to: null }] }));
    const person = makePerson(`@I${i + 1}@`, { given: `V${i}`, surname: `N${i % 200}`, name: `V${i} /N${i % 200}/` });
    person.birth.date = '1900';
    person.events.push({ ...person.birth, type: 'RESI', eventType: 'RESI', hofId: hid, addr: `Wall ${i}` });
    db.individuals.set(person.id, person);
  }
  return db;
}
function medienDb(n: number): Database {
  const db = makeDatabase();
  for (let i = 0; i < n; i++) {
    db.media.set(
      `@M${i + 1}@`,
      makeMedia(`@M${i + 1}@`, { file: `bild${i}.jpg`, title: `Bild ${i}`, form: 'jpg' }),
    );
  }
  return db;
}

const gemessen: string[] = [];

type Bauen = (appState: ReturnType<typeof createAppState>) => {
  container: HTMLElement;
  unmount: () => void;
};

/**
 * Misst EINE Fläche und baut sie sofort wieder ab. Das Abbauen plus das `afterEach`-GC
 * sind nicht Kosmetik: ohne sie hängen Fixture und happy-dom-Knoten am Zyklus und der
 * Worker kippt (gemessen, s. Kopfkommentar).
 */
function messen(name: string, zeilen: number, db: Database, bauen: Bauen): number {
  const appState = createAppState();
  appState.loadDatabase(db, 'scale.ged');
  const t0 = performance.now();
  const gebaut = bauen(appState);
  const ms = performance.now() - t0;
  const knoten = gebaut.container.querySelectorAll('*').length;
  gebaut.unmount();

  const jeZeile = knoten / zeilen;
  const hochgerechnet = Math.round(jeZeile * ANKER_ZEILEN);
  console.log(
    `${name.padEnd(18)} n=${String(zeilen).padStart(6)} · Knoten ${String(knoten).padStart(7)}` +
      ` · ${jeZeile.toFixed(2)}/Zeile` +
      ` · Mount ${ms.toFixed(0).padStart(5)} ms` +
      ` · bei ${ANKER_ZEILEN}: ~${hochgerechnet.toLocaleString('de-DE')} Knoten` +
      ` = ${(hochgerechnet / ZIEL_KNOTEN).toFixed(0)}× Ziel (${ZIEL_KNOTEN})`,
  );

  expect(ms, `${name}: Mount-Zeit über dem Budget`).toBeLessThan(BUDGET_MOUNT_MS);
  // Die Fläche muss überhaupt etwas gerendert haben — sonst misst das Gate einen
  // Leerzustand und meldet fröhlich „unter der Ratsche" (ADR-v9-200).
  // Etwas muss gerendert sein — sonst misst das Gate einen Leerzustand und meldet fröhlich
  // „unter der Ratsche" (ADR-v9-200). Die Schwelle ist bewusst niedrig: eine Fläche, die
  // ihre Gruppen einklappt (HofList), rendert RICHTIGERWEISE wenig.
  expect(knoten, `${name}: hat nichts gerendert`).toBeGreaterThan(10);
  return jeZeile;
}

/** Eine Fläche prüfen: Kennzahl gegen ihre Ratsche, Name fürs Vollständigkeits-Siegel. */
function pruefen(name: string, db: Database, bauen: Bauen): void {
  const jeZeile = messen(name, ZEILEN, db, bauen);
  gemessen.push(name);
  expect(jeZeile, `${name}: Knoten je Zeile über der Ratsche`).toBeLessThanOrEqual(
    RATSCHE_JE_ZEILE[name],
  );
}

const navCallbacks = () => ({
  onNavigateToPerson: vi.fn(),
  onNavigateToFamily: vi.fn(),
  onNavigateToSource: vi.fn(),
  onNavigateToPlace: vi.fn(),
  onNavigateToHof: vi.fn(),
});

describe('Index-Flächen: Knoten je Zeile (BL-311, Spec 30 §1 NFR-1)', () => {
  const vs = () => createViewState();

  // Zwischen den Flächen aufräumen. `gc` kommt über NODE_OPTIONS=--expose-gc aus dem
  // npm-Skript `test:perf` (dieselbe Voraussetzung wie undo-memory.perf.test.ts,
  // ADR-v9-92) — fehlt es, läuft der Test trotzdem, nur enger.
  afterEach(() => {
    (globalThis as { gc?: () => void }).gc?.();
  });

  it('PersonList', () =>
    pruefen('PersonList', personenDb(ZEILEN), (a) =>
      render(PersonList, { props: { appState: a, viewState: vs() } }),
    ));

  it('FamilyList', () =>
    pruefen('FamilyList', familienDb(ZEILEN), (a) =>
      render(FamilyList, { props: { appState: a, viewState: vs() } }),
    ));

  it('SourceList', () =>
    pruefen('SourceList', quellenDb(ZEILEN), (a) =>
      render(SourceList, { props: { appState: a, viewState: vs() } }),
    ));

  it('RepositoryList', () =>
    pruefen('RepositoryList', archiveDb(ZEILEN), (a) =>
      render(RepositoryList, { props: { appState: a, viewState: vs() } }),
    ));

  it('PlaceList', () =>
    pruefen('PlaceList', ortDb(ZEILEN), (a) =>
      render(PlaceList, { props: { appState: a, viewState: vs() } }),
    ));

  it('HofList', () =>
    pruefen('HofList', hofDb(ZEILEN), (a) =>
      render(HofList, { props: { appState: a, viewState: vs() } }),
    ));

  // Suchtreffer: die Anfrage trifft ALLE Personen — der Fall, den ein Nutzer mit zwei
  // Buchstaben auslöst (in `Testdateien/Unsere Familie 2026.ged` trifft „a" 2.833 von
  // 3.280). Und anders als eine Liste rendert diese Fläche je TASTENDRUCK neu.
  it('GlobalSearchView', () =>
    pruefen('GlobalSearchView', personenDb(ZEILEN), (a) => {
      const search = createGlobalSearchState();
      search.setQuery('Vorname');
      return render(GlobalSearchView, { props: { appState: a, search, ...navCallbacks() } });
    }));

  it('MediaGallery', () =>
    pruefen('MediaGallery', medienDb(ZEILEN), (a) =>
      render(MediaGallery, { props: { appState: a, viewState: vs() } }),
    ));

  it(`PersonList bei ${ANKER_ZEILEN} — der absolute Anker aus Spec 30 §1`, () => {
    const jeZeile = messen('PersonList/Anker', ANKER_ZEILEN, personenDb(ANKER_ZEILEN), (a) =>
      render(PersonList, { props: { appState: a, viewState: vs() } }),
    );
    expect(jeZeile * ANKER_ZEILEN, 'Anker über der Ratsche').toBeLessThanOrEqual(
      RATSCHE_ANKER_KNOTEN,
    );
  });

  afterAll(() => {
    // Kein stiller Teil-Lauf: acht Flächen sind der Auftrag der Zeile (BL-311). Ohne diese
    // Prüfung könnte ein `-t`-Filter oder ein entfernter Block das Gate auf eine Fläche
    // schrumpfen, und es meldete weiter grün.
    expect(gemessen.slice().sort()).toEqual(Object.keys(RATSCHE_JE_ZEILE).sort());
  });
});
