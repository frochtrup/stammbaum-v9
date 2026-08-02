// tests/core/place-merge-realdaten.test.ts — die Zusicherung, die ADR-v9-195 trägt, am
// ECHTEN Bestand: ein Dubletten-Merge darf einem Ereignis seine Ortszuordnung nicht
// NEHMEN.
//
// WARUM AN REALDATEN und nicht nur synthetisch (die Fälle in `place-disambiguation.test.ts`
// decken die Regel ab): der Defekt hing an einer Eigenschaft, die synthetische Fixtures
// nicht von selbst haben — echte Dubletten unterscheiden sich in ihrer Elternkette
// (die vier „Arpke" hängen an drei verschiedenen „Amt Meinersen" plus einer „Vogtei
// Meinersen"), und ihre Zugehörigkeiten sind UNDATIERT. Genau diese Kombination ließ
// `enclosureWinnerAsOf` auf den ersten Eintrag zurückfallen. Ein Test, der die Fixture
// selbst baut, schreibt die Annahme mit, die er prüfen soll.
//
// WARUM AN DER REINEN NAHT und nicht im Browser: `applyPlaceResolution` ist rein und
// deterministisch (Spec 11 §4.1, TST-3). Dieselbe Frage im UI zu messen hieße, zwei
// Ladepässe gegen einen SICH ÄNDERNDEN persistierten Orts-Bestand zu vergleichen (der
// Seed schreibt sein Wachstum zurück) — der Ausgangszustand wäre nicht derselbe, und die
// Differenz misst dann die Persistenz mit statt den Merge.
//
// Gemessene Rot-Probe (Stand 2026-08-02, `Unsere Familie 2026.ged`): mit dem alten
// Einzelketten-Guard stieg die Review-Menge durch diesen einen Merge von 63 auf 83 —
// zwanzig Ereignisse verloren ihre Zuordnung. Mit dem Mehrpfad-Guard: 63 → 63.
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../../core/interop';
import { applyPlaceResolution } from '../../services/places';
import { mergePlaceObjects } from '../../core/places/commands';
import type { PlaceObjects, HofObjects } from '../../core/places/types';
import { realbestandText, realbestandVorhanden, fehlendHinweis } from './realdaten';

/** Tiefe Kopie der Orts-/Hof-Mengen — der Merge mutiert die übergebenen Maps. */
function kopie<T>(m: ReadonlyMap<string, T>): Map<string, T> {
  return new Map([...m].map(([id, v]) => [id, structuredClone(v)]));
}

describe.skipIf(!realbestandVorhanden())('Orts-Merge am Realbestand (ADR-v9-195)', () => {
  it(`nimmt keinem Ereignis seine Zuordnung — sonst: ${fehlendHinweis()}`, () => {
    // 1. Ladepass wie beim echten Öffnen der Datei.
    const vorherDb = parseGedcom(realbestandText()).db;
    const vorher = applyPlaceResolution(vorherDb);

    // 2. Die Dubletten-Gruppe, an der der Defekt gemessen wurde: vier „Arpke" mit
    //    unterschiedlichen, undatierten Verwaltungsketten.
    const arpke = [...vorherDb.placeObjects.values()].filter((p) => p.title === 'Arpke').map((p) => p.id);
    expect(arpke.length).toBeGreaterThan(1); // sonst prüft der Test nichts

    const places: PlaceObjects = kopie(vorherDb.placeObjects);
    const hofs: HofObjects = kopie(vorherDb.hofObjects);
    const [gewinner, ...verlierer] = arpke;
    mergePlaceObjects(places, hofs, gewinner, verlierer);

    // 3. Zweiter Ladepass — frisch geparst (wie nach einem Reload), gegen den gemergten
    //    Orts-Bestand. Das ist der Pfad, auf dem der Defekt DAUERHAFT wurde: er überlebte
    //    das Neuladen, weil beide Pässe denselben Einzelketten-Guard nahmen.
    const nachherDb = parseGedcom(realbestandText()).db;
    nachherDb.placeObjects = places;
    nachherDb.hofObjects = hofs;
    const nachher = applyPlaceResolution(nachherDb);

    // Der Merge fasst gleichnamige Orte ZUSAMMEN — er kann Mehrdeutigkeit nur abbauen,
    // niemals erzeugen. Jeder zusätzliche Review-Eintrag ist deshalb ein Regressionsbefund,
    // kein Grenzfall.
    expect(nachher.review.length).toBeLessThanOrEqual(vorher.review.length);
  });
});
