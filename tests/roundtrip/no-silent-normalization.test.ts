// tests/roundtrip/no-silent-normalization.test.ts — BL-288 / ADR-v9-197:
// Laden + Speichern ohne Nutzeränderung darf KEINEN Wert umschreiben.
//
// Das ist die Verschärfung von LP-1 von „nichts geht verloren" auf „nichts ändert sich
// ungefragt". Gemessen wurde vorher: ein Speichern schrieb an `Unsere Familie 2026.ged`
// **668 `PLAC`-Werte** um (periodengerechte Reprojektion) und **28 `FORM`**
// (`JPEG`→`jpg`) — an Ereignissen, die der Nutzer nie angefasst hat.
//
// Die Reprojektion ist damit nicht abgeschafft, sondern VERLEGT (Lesart b): sie gehört an
// den Kurationszeitpunkt (`linkEventToPlace`, `renameHofAddrInEvents`, … — user-induziert,
// mit Undo), nicht an jedes Speichern. Die ANZEIGE bleibt unberührt: sie projiziert
// ohnehin live aus `placeId` (`eventPlaceLabel`), nicht aus `ev.place`.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGedcom, applyDatabaseToRoots, serializeGedcom } from '../../core/interop';
import { applyPlaceResolution } from '../../services/places';
import { assembleLines } from './roundtrip-helpers';
import { realbestandText, realbestandVorhanden } from '../core/realdaten';

/** Alle Werte eines Tags als Multimenge — was sich hier verschiebt, hat jemand umgeschrieben. */
function werte(text: string, tag: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const z of assembleLines(text)) {
    const t = new RegExp(`^\\d+ ${tag} (.*)$`, 's').exec(z);
    if (t) m.set(t[1], (m.get(t[1]) ?? 0) + 1);
  }
  return m;
}

function umgeschrieben(src: string, out: string, tag: string): string[] {
  const a = werte(src, tag), b = werte(out, tag);
  const diff: string[] = [];
  for (const [k, n] of a) { const d = n - (b.get(k) ?? 0); if (d > 0) diff.push(`−${d}× ${k}`); }
  for (const [k, n] of b) { const d = n - (a.get(k) ?? 0); if (d > 0) diff.push(`+${d}× ${k}`); }
  return diff;
}

/** Der echte Ladepfad der App: parsen, Orte auflösen, zurückschreiben, serialisieren. */
function ladenUndSpeichern(src: string): string {
  const p = parseGedcom(src);
  applyPlaceResolution(p.db);
  return serializeGedcom({ db: p.db, roots: applyDatabaseToRoots(p.db, p.roots) });
}

const FIXTURE = join(__dirname, '../fixtures/dirty-passthrough.small.ged');

describe('BL-288 — Speichern schreibt nichts um (ADR-v9-197)', () => {
  it('kleine Fixture: PLAC bleibt Wort für Wort', () => {
    const src = readFileSync(FIXTURE, 'utf8');
    expect(umgeschrieben(src, ladenUndSpeichern(src), 'PLAC')).toEqual([]);
  });
});

// Der eigentliche Beleg: die kleine Fixture hat einen Ort ohne Verwaltungskette, an ihr
// fällt eine Reprojektion gar nicht auf. Erst der echte Bestand mit seinen historischen
// Ketten zeigt, ob das Speichern die Quelle in Ruhe lässt.
// `realbestandText()` steht bewusst IM Test, nicht im describe-Body: `describe.skipIf`
// überspringt nur die Testfälle — der Body läuft beim Sammeln der Suite trotzdem. Ein
// `readFileSync` dort wirft in CI, wo die (gitignorte) Datei fehlt, und reißt den ganzen
// Lauf mit. Genau so ist dieser Test beim ersten Push rot geworden.
describe.skipIf(!realbestandVorhanden())('BL-288 — am Realbestand', () => {
  it('PLAC: kein einziger Wert wird umgeschrieben', () => {
    const src = realbestandText();
    expect(umgeschrieben(src, ladenUndSpeichern(src), 'PLAC')).toEqual([]);
  });

  // FORM ist die zweite Hälfte von ADR-v9-197 und braucht einen Modell-Eingriff, den
  // BL-288 nicht mehr enthält: `Media.form` hält das KANONISIERTE MIME (Narrow Waist,
  // ADR-v9-126), der Wire-Wert (`JPEG` statt `jpg`) existiert im Modell nicht mehr und
  // lässt sich nicht rekonstruieren. Nötig ist ein zusätzliches Feld neben `wireOrigin`
  // — dieselbe Rolle, dieselbe Begründung („der Writer erhält sie unverändert, LP-1").
  //
  // Bewusst als `skip` statt gelöscht: die Zusicherung ist richtig, nur noch nicht
  // eingelöst. Sie ist die fertige Rot-Probe für BL-290 — dort wieder scharfschalten.
  it('FORM: kein einziger Wert wird umgeschrieben (BL-290)', () => {
    const src = realbestandText();
    expect(umgeschrieben(src, ladenUndSpeichern(src), 'FORM')).toEqual([]);
  });
});
