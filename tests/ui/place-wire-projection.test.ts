// tests/ui/place-wire-projection.test.ts — der zweite kommando-übergreifende Wächter der
// Orts-/Hof-Kommandos (ADR-v9-223), Geschwister von `place-ref-integrity.test.ts`.
//
// DIE ZUSICHERUNG: nach jedem Kommando, das Orts-/Hof-INHALT ändert, stimmt der
// Ereignis-TEXT (`ev.place` — was in die Datei geht) mit der ANZEIGE überein (der
// live projizierten periodengerechten Kette). Nicht, weil Gleichheit ein Selbstzweck
// wäre, sondern weil `ev.place` die EINGABE des nächsten Ladepasses ist (Spec 11 §2/§4:
// `placeId` steht nie in der Datei, „Re-Derivation ist die Persistenz"). Ein Text, der
// eine Kette nennt, die es nicht mehr gibt, lässt den nächsten Ladepass eine Dublette
// anlegen — die Korrektur erzeugt, was sie auflösen sollte.
//
// WARUM KOMMANDO-ÜBERGREIFEND. ADR-v9-197 hat die Reprojektion aus dem Ladepass entfernt
// (668 stille PLAC-Umschreibungen bei einem reinen Öffnen-und-Speichern) und den Preis
// benannt: „jedes künftige Kurations-Kommando muss seine Ereignisse selbst mitziehen."
// Eine Pflicht je Kommando ist eine Erinnerungspflicht, und drei von sieben Kommandos
// haben sie vergessen — gefunden erst durch einen Nutzerbefund („in der gespeicherten
// Datei ist eine andere Kette angegeben als angezeigt wird"), nicht durch einen Test:
//   `replacePlacesAndHofs` (orte.json-Import), `saveHof` (Adressvariante), `mergeHof`.
// Deshalb prüft diese Datei ALLE inhaltsändernden Kommandos gegen dieselbe Frage. Wer ein
// neues baut, trägt es hier ein und bekommt die Frage gestellt, statt sich an sie erinnern
// zu müssen (ADR-v9-83: Zwang schlägt Dokumentation).
//
// ABGRENZUNG: `place-ref-integrity.test.ts` prüft die REFERENZ (keine tote id),
// `app-state-cow.test.ts` den VORZUSTAND (Undo unversehrt), diese Datei den TEXT.
import { describe, expect, it } from 'vitest';
import { createAppState, type AppState } from '../../ui/shell/app-state.svelte';
import { makeDatabase, makePerson, makeEvent } from '../../core/model/index';
import { makePlaceRegistry, makeHofRegistry, buildPlacForGedcom, eventYear } from '../../core/places';
import { place, hof } from '../core/places-fixtures';

/**
 * Ein Hof-Ereignis mit voller Kette: Hof unter Dorf unter Kreis. Es hängt am Hof, ist also
 * von JEDER Ebene abhängig — Hof-Adresse, Dorfname, Elternname.
 */
function seeded(): AppState {
  const s = createAppState();
  const db = makeDatabase();
  db.individuals.set(
    '@I1@',
    makePerson('@I1@', {
      birth: makeEvent('RESI', { place: 'Wall 33, Ochtrup, Kreis X', addr: 'Wall 33', date: '3 MAR 1750' }),
    }),
  );
  s.loadDatabase(db, 'test.ged');
  s.savePlace(place('@KREIS@', { title: 'Kreis X' }));
  s.savePlace(place('@DORF@', { title: 'Ochtrup', enclosedBy: [{ placeId: '@KREIS@', from: null, to: null }] }));
  s.savePlace(place('@DORF2@', { title: 'Nachbardorf', enclosedBy: [{ placeId: '@KREIS@', from: null, to: null }] }));
  s.saveHof(hof('_hof_a', '@DORF@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
  s.saveHof(hof('_hof_b', '@DORF2@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }));
  s.linkEventToHof(s.db.individuals.get('@I1@')!.birth!, '_hof_a');
  return s;
}

const wire = (s: AppState): string | null => s.db.individuals.get('@I1@')!.birth!.place;

/** Die periodengerechte Kette, die jede Ansicht live baut (Spec 11 §5). */
const anzeige = (s: AppState): string | null => {
  const ev = s.db.individuals.get('@I1@')!.birth!;
  return buildPlacForGedcom(ev, eventYear(ev), {
    places: makePlaceRegistry(s.db.placeObjects),
    hofs: makeHofRegistry(s.db.hofObjects),
  });
};

/** Beides zugleich: die Änderung ist angekommen UND Datei und Anzeige sagen dasselbe. */
function erwarteGleichlauf(s: AppState, enthaelt: string): void {
  expect(anzeige(s)).toContain(enthaelt); // die Änderung wirkt überhaupt
  expect(wire(s)).toBe(anzeige(s));
}

describe('Wire folgt der Anzeige nach jedem inhaltsändernden Orts-/Hof-Kommando (ADR-v9-223)', () => {
  it('Ausgangslage: Datei und Anzeige stimmen überein (sonst prüft der Rest nichts)', () => {
    const s = seeded();
    expect(wire(s)).toBe(anzeige(s));
  });

  it('savePlace am Dorf — datierte Umbenennung', () => {
    const s = seeded();
    const dorf = s.db.placeObjects.get('@DORF@')!;
    s.savePlace({ ...dorf, pnames: [{ value: 'Ochtorp', from: 1700, to: 1800 }] });
    erwarteGleichlauf(s, 'Ochtorp');
  });

  it('savePlace am ELTERNGLIED — die Kette des Kindes trägt den Elternnamen mit', () => {
    const s = seeded();
    const kreis = s.db.placeObjects.get('@KREIS@')!;
    s.savePlace({ ...kreis, pnames: [{ value: 'Amt X', from: 1700, to: 1800 }] });
    erwarteGleichlauf(s, 'Amt X');
  });

  it('saveHof — Adressvariante ersetzt (HofDetail speichert das ganze Objekt)', () => {
    const s = seeded();
    const h = s.db.hofObjects.get('_hof_a')!;
    s.saveHof({ ...h, addrs: [{ value: 'Wall 33a', from: null, to: null }] });
    erwarteGleichlauf(s, 'Wall 33a');
  });

  it('updateHofAddr — der dedizierte Umbenenn-Pfad (ADR-v9-81)', () => {
    const s = seeded();
    s.updateHofAddr('_hof_a', 0, 'Wall 33b', null, null);
    erwarteGleichlauf(s, 'Wall 33b');
  });

  it('mergeHof — der Überlebende liegt in einem ANDEREN Dorf', () => {
    const s = seeded();
    s.mergeHof('_hof_b', ['_hof_a']);
    erwarteGleichlauf(s, 'Nachbardorf');
  });

  it('moveHof — Dorfwechsel (ADR-v9-172)', () => {
    const s = seeded();
    s.moveHof('_hof_a', '@DORF2@');
    erwarteGleichlauf(s, 'Nachbardorf');
  });

  it('mergePlace — der Verlierer verschwindet, der Gewinner benennt die Kette (ADR-v9-222)', () => {
    const s = seeded();
    s.mergePlace('@DORF2@', ['@DORF@']);
    erwarteGleichlauf(s, 'Nachbardorf');
  });

  it('replacePlacesAndHofs — orte.json-Import mit datierter Umbenennung am Elternglied', () => {
    const s = seeded();
    const places = new Map(s.db.placeObjects);
    const kreis = places.get('@KREIS@')!;
    places.set('@KREIS@', { ...kreis, pnames: [{ value: 'Amt X', from: 1700, to: 1800 }] });
    s.replacePlacesAndHofs(places, new Map(s.db.hofObjects));
    erwarteGleichlauf(s, 'Amt X');
  });

  // Die Gegenprobe zur vorigen Zeile — und der Grund, warum der Nachlauf dort DIFFT statt
  // pauschal zu reprojizieren: ein Import, der inhaltlich nichts ändert, darf keine einzige
  // Zeile der Datei anfassen. Genau das war der Defekt hinter ADR-v9-197 (668 PLAC-Werte
  // bei einem reinen Öffnen-und-Speichern).
  it('replacePlacesAndHofs ohne inhaltliche Änderung fasst den Text NICHT an', () => {
    const s = seeded();
    const vorher = wire(s);
    const places = new Map(s.db.placeObjects);
    // Ein Ort mit anderem Namen kommt NEU hinzu — bestehende Objekte bleiben unverändert.
    places.set('@NEU@', place('@NEU@', { title: 'Irgendwo' }));
    s.replacePlacesAndHofs(places, new Map(s.db.hofObjects));
    expect(wire(s)).toBe(vorher);
  });
});
