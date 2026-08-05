// tests/roundtrip/kurations-rundlauf-realdaten.test.ts — der VOLLE Kurations-Rundlauf am
// Realbestand, headless: lesen (GEDCOM + orte.json) → Massen-Dedup → Klasse-P-Auflösungen
// → schreiben (beide Dateien) → erneut lesen → schreiben. Geprüft wird, was danach in den
// beiden Dateien steht.
//
// WARUM DIESE NAHT. Die bestehenden Tests decken je EINE Hälfte ab: die Roundtrip-Tests
// den Writer ohne Kuration (`gedcom-ancestris.roundtrip.test.ts`), die Merge-Tests die
// Kuration ohne Schreiben. Der Defekt, den ADR-v9-222 behebt, saß genau dazwischen — er
// wurde erst beim ZWEITEN Lesen sichtbar (der Seed legte die zusammengeführten Orte neu
// an), und die Faltung, die ihn bis dahin verdeckte, hinterließ ihrerseits Orte mit
// mehreren gleichzeitig gültigen, undatierten Verwaltungsketten. Beide Symptome sind nur
// über den ganzen Kreis zu sehen.
//
// DREI ZUSICHERUNGEN:
//   1. GEDCOM stabil — Text nach dem zweiten Schreiben === Text nach dem ersten
//      (Idempotenz ÜBER den Ladepass hinweg, nicht nur über den Writer), und der Writer
//      selbst bleibt byte-idempotent (out1 === out2, LP-1).
//   2. orte.json stabil — kein Wachstum beim zweiten Lesen: keine neuen Orte/Höfe (der
//      Seed legt nichts nach), keine neuen Namen, keine neuen Zugehörigkeiten.
//   3. orte.json ohne Müll — die zwei Formen, die die Faltung tatsächlich erzeugte: zwei
//      gleichzeitig gültige UNDATIERTE Elternketten an einem Ort, und eine in Wert UND
//      Zeitraum identische Namensvariante. Beide müssen null sein.
//
// ZWEI KRITERIEN, DIE HIER BEWUSST NICHT STEHEN — erst erfunden, dann am Bestand widerlegt:
// eine `\n`-haltige Notiz ist kein Merge-Artefakt, sondern ein ABSATZ (der kuratierte
// Bestand führt sieben handgeschriebene Ortsgeschichten mit Aufzählungen und Warnhinweisen);
// und eine undatierte Namensvariante gleich dem Titel ist die dokumentierte GOV-Konvention
// „undatierter Rückfall" neben den datierten Formen (13 Fundstellen, `_ep_`-Objekte mit
// `dateRaw`). Wer ein Müll-Kriterium erfindet, statt es aus dem Bestand abzuleiten, erzeugt
// Arbeit statt sie zu finden.
import { describe, expect, it } from 'vitest';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { parseGedcom, serializeGedcom } from '../../core/interop';
import { applyPlaceResolution } from '../../services/places';
import { PlacesSyncService } from '../../services/places';
import { createPlacesPersister } from '../../ui/shell/places-persister';
import { findPlaceDuplicates, makePlaceRegistry, makeHofRegistry, normPlaceName } from '../../core/places';
import type { PlaceContext, PlaceObject, HofObject } from '../../core/places';
import { buildPlaceReview } from '../../ui/views/place/place-review-model';
import { applyPlaceChoice } from '../../ui/views/place/place-review-actions';
import type { Database, PlaceId } from '../../core/model/types';
import { createMockClock, createMockDeviceId, createMockPlacesStore } from '../services/mock-places-store';
import {
  REALBESTAND,
  fehlendHinweis,
  ortsbestandLaden,
  ortsbestandVorhanden,
  realbestandText,
  realbestandVorhanden,
} from '../core/realdaten';
import { firstDiff } from './roundtrip-helpers';

const vorhanden = (): boolean => realbestandVorhanden() && ortsbestandVorhanden();

const ctxVon = (db: Database): PlaceContext => ({
  places: makePlaceRegistry(db.placeObjects),
  hofs: makeHofRegistry(db.hofObjects),
});

/** Ein Ladepass wie beim echten Öffnen: kuratierter Orts-Bestand VOR der Auflösung. */
function laden(gedText: string, places: Map<string, PlaceObject>, hofs: Map<string, HofObject>): Database {
  const { db } = parseGedcom(gedText);
  db.placeObjects = new Map(places);
  db.hofObjects = new Map(hofs);
  applyPlaceResolution(db);
  return db;
}

/** Bindet jede offene Klasse-P-Zeile auf ihren ersten Kandidaten (deterministisch —
 *  welcher gewählt wird, ist für den Rundlauf gleichgültig; dass GEWÄHLT wird, nicht). */
function pAufloesen(appState: ReturnType<typeof createAppState>): number {
  const review = buildPlaceReview(appState.db, ctxVon(appState.db));
  let gebunden = 0;
  for (const row of review.rows) {
    const ziel = row.candidates[0];
    if (!ziel) continue;
    if (applyPlaceChoice(appState, review.flatEvents[row.index], ziel.placeId).ok) gebunden += 1;
  }
  return gebunden;
}

/**
 * Was der Nutzer im Werkzeug tut — beide Kurations-Wege, in beiden Reihenfolgen berührt:
 * erst die offenen Klasse-P-Zeilen binden (§6 „Ort wählen", `linkEventToPlace` mit
 * Sofort-Reprojektion), dann jede Dubletten-Gruppe zusammenführen, dann noch einmal P.
 * Der zweite P-Lauf ist die eigentliche Aussage: nach dem Dedup soll nichts mehr offen
 * sein — die Mehrdeutigkeit war das Dubletten-Problem (Spec 11 §6).
 */
function kuratieren(appState: ReturnType<typeof createAppState>): {
  gruppen: number;
  pVorDedup: number;
  pNachDedup: number;
} {
  const pVorDedup = pAufloesen(appState);

  const gruppen = findPlaceDuplicates(appState.db.placeObjects, 'places');
  for (const g of gruppen) {
    const ids = g.ids as PlaceId[];
    const [gewinner, ...rest] = ids;
    if (!appState.db.placeObjects.has(gewinner)) continue;
    const offen = rest.filter((id) => appState.db.placeObjects.has(id));
    if (offen.length > 0) appState.mergePlace(gewinner, offen);
  }

  return { gruppen: gruppen.length, pVorDedup, pNachDedup: pAufloesen(appState) };
}

/** Der orte.json-Stand, wie ihn der Persister schreiben würde (derselbe Pfad wie im IDB). */
async function orteSchreiben(db: Database): Promise<{ wrapper: string; places: number; hofs: number }> {
  const store = createMockPlacesStore(null);
  const persister = createPlacesPersister(
    new PlacesSyncService(store, createMockDeviceId('test-device'), createMockClock(1_700_000_000_000)),
  );
  await persister.load();
  await persister.persist(new Map(db.placeObjects), new Map(db.hofObjects));
  const w = store._peek()!;
  // rev/ts/device sind Sync-Metadaten und ändern sich per Definition bei jedem Schreiben —
  // verglichen wird der INHALT.
  return {
    wrapper: JSON.stringify({ placeObjects: w.placeObjects, hofObjects: w.hofObjects }),
    places: w.placeObjects.length,
    hofs: w.hofObjects.length,
  };
}

/** Die zwei Müll-Formen der früheren Faltung. Rückgabe: Fundstellen je Form. */
function muellBefunde(places: Iterable<PlaceObject>): {
  zweiUndatierteKetten: string[];
  doppelteNamen: string[];
} {
  const zweiUndatierteKetten: string[] = [];
  const doppelteNamen: string[] = [];
  for (const p of places) {
    // Die Form, die der alte Merge erzeugte: mehrere Elternketten OHNE Zeitraum, also
    // gleichzeitig gültig („Steinwedel" unter vier Regimen). Datierte Mehrfach-
    // Zugehörigkeiten sind dagegen die normale Modellierung eines Gebietswechsels.
    const undatiert = (p.enclosedBy ?? []).filter((e) => e.from == null && e.to == null);
    if (undatiert.length >= 2) zweiUndatierteKetten.push(`${p.title} (${undatiert.length})`);

    // Ein Name DARF mehrfach vorkommen, solange die Perioden ihn unterscheiden — „Kreis
    // Steinfurt" steht zweimal, für 1816–1974 und ab 1975. Müll ist allein die in Wert UND
    // Zeitraum identische Wiederholung.
    const schluessel = (p.pnames ?? []).map((n) => `${normPlaceName(n.value)}|${n.from}|${n.to}`);
    if (new Set(schluessel).size !== schluessel.length) {
      doppelteNamen.push(`${p.title}: ${schluessel.join(' | ')}`);
    }
  }
  return { zweiUndatierteKetten, doppelteNamen };
}

describe.skipIf(!vorhanden())('Kurations-Rundlauf am Realbestand (ADR-v9-222)', () => {
  it(`lesen → dedup → P-Auflösung → schreiben → erneut lesen → schreiben bleibt stabil und müllfrei — sonst: ${fehlendHinweis()}`, async () => {
    const bestand = ortsbestandLaden();
    const vorher = muellBefunde(bestand.placeObjects.values());

    // ---- Durchgang 1: lesen, kuratieren, schreiben -------------------------------------
    const db1 = laden(realbestandText(), bestand.placeObjects, bestand.hofObjects);
    expect(db1.individuals.size).toBe(REALBESTAND.erwartet.individuals);

    const appState = createAppState();
    appState.loadDatabase(db1, REALBESTAND.datei);
    const arbeit = kuratieren(appState);
    console.log('Kuration:', JSON.stringify(arbeit), '| Orte danach:', appState.db.placeObjects.size);
    expect(arbeit.gruppen).toBeGreaterThan(0); // sonst prüft der Rundlauf keine Kuration
    expect(arbeit.pVorDedup).toBeGreaterThan(0);

    const gedText1 = serializeGedcom(appState.buildGedcomDoc());
    const orte1 = await orteSchreiben(appState.db);
    const ortsstand = new Map(appState.db.placeObjects);
    const hofstand = new Map(appState.db.hofObjects);

    // ---- Durchgang 2: dieselben Bytes erneut lesen und wieder schreiben ----------------
    const db2 = laden(gedText1, ortsstand, hofstand);
    const gedText2 = serializeGedcom({ db: db2, roots: parseGedcom(gedText1).roots });
    const orte2 = await orteSchreiben(db2);

    // 1. GEDCOM stabil — der zweite Kreis schreibt dieselbe Datei.
    expect(firstDiff(gedText1, gedText2)).toBeNull();
    expect(gedText2).toBe(gedText1);

    // 2. orte.json stabil — der zweite Ladepass legt nichts nach und ändert nichts.
    expect(orte2.places).toBe(orte1.places);
    expect(orte2.hofs).toBe(orte1.hofs);
    expect(orte2.wrapper).toBe(orte1.wrapper);

    // 3. Kein Müll — beide Formen sind vor wie nach dem Rundlauf leer (s. Kopfkommentar).
    const nachher = muellBefunde(db2.placeObjects.values());
    expect(vorher.zweiUndatierteKetten).toEqual([]);
    expect(vorher.doppelteNamen).toEqual([]);
    expect(nachher.zweiUndatierteKetten).toEqual([]);
    expect(nachher.doppelteNamen).toEqual([]);
  });
});
