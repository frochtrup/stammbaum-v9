// tests/core/realdaten.ts — die EINE Stelle, die benennt, was „der Realbestand" ist
// (BL-246, ADR-v9-178, Spec 32 TST-21).
//
// WARUM ES DIESE DATEI GIBT. Eine Aussage der Form „am Realbestand kommt X N× vor"
// entscheidet über Umfang, Klasse und Reihenfolge einer Backlog-Zeile. Sie hängt
// vollständig daran, WELCHE Datei ausgezählt wurde — und die naheliegendste ist nicht
// die richtige:
//
//   tests/fixtures/MeineDaten_ancestris.ged   7 MAR 2026, 2795 Personen  ← Orakel-Snapshot
//   tests/fixtures/Unsere Familie 2026.ged   25 JUN 2026, 3180 Personen  ← der Bestand
//
// Der Snapshot liegt IM Repo und sieht dadurch kanonisch aus (die Roundtrip-Tests laufen
// gegen ihn); die maßgebliche Datei liegt gitignored im Spec-Repo. ADR-v9-151 hat sechs
// Quellen-Zahlen am Snapshot gemessen — alle sechs waren falsch (DATA.EVEN „0×" statt
// tatsächlich 7×), was BL-217 in die falsche Klasse und Welle sortierte. Zweiter Fall
// dieser Art nach ADR-v9-62/65; die erste Konsequenz war ein Merksatz in CLAUDE.md, der
// nicht gegriffen hat — deshalb diesmal ein Wächter.
//
// WAS DAS NICHT HEISST. `MeineDaten_ancestris.ged` bleibt als **Orakel** völlig gültig:
// Roundtrip-Treue, Parser-Kanten und Skalenverhalten prüft man an einer eingefrorenen
// Datei, und dass sie sich nicht bewegt, ist dort ein Vorzug. Falsch ist nur, sie für
// eine Aussage über den AKTUELLEN Bestand zu benutzen. Die 15 bestehenden skipIf-Tests
// bleiben deshalb unverändert.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePlacesFileWrapper } from '../../services/places';
import type { PlaceObjects, HofObjects } from '../../core/places/types';

/** Der maßgebliche Bestand — Ancestris-Export, Stand 25 JUN 2026. */
export const REALBESTAND = {
  datei: 'Unsere Familie 2026.ged',
  exportiert: '25 JUN 2026',
  /** Erwartete Satzzahlen. Weicht die vorhandene Datei ab, ist sie eine andere (oder eine
   *  veraltete Kopie) — und jede daran gemessene Zahl ist es auch. */
  erwartet: { individuals: 3180, families: 987, sources: 152, repositories: 7 },
} as const;

/**
 * Der ZWEITE Realdaten-Eingang des Ladepfads (BL-287). `loadGedcomText` liest nicht nur
 * die GEDCOM-Datei, sondern legt VOR der Auflösung den kuratierten Orts-/Hof-Bestand
 * darüber (`persister.load()` → `db.placeObjects`/`db.hofObjects`). Erst diese Kombination
 * ist der Zustand, in dem die App tatsächlich läuft: ohne den Bestand legt der Seed
 * seine Orte aus dem PLAC-Text selbst an, und die Auflösung trifft nie auf einen
 * kuratierten, periodengerecht datierten Ort.
 *
 * Bis BL-287 hat KEIN Test die beiden zusammengebracht — dieselbe Lücke wie die aus
 * ADR-v9-196 („kein Test kombiniert `applyPlaceResolution` mit `serializeGedcom`"), nur
 * eine Eingabe früher. Die Zahlen in ADR-v9-197/BL-288 (668 umgeschriebene PLAC-Werte)
 * wurden von Hand mit dieser Datei gemessen, nicht von einem Test.
 */
export const ORTSBESTAND = {
  datei: 'orte-2.json',
  /** Erwarteter Umfang — dieselbe Rolle wie `REALBESTAND.erwartet`: eine andere Datei
   *  ist eine andere Aussage. Seit 2026-08-09 auch WIRKLICH geprüft, s. u. */
  erwartet: { placeObjects: 402, hofObjects: 185 },
} as const;
// WARUM DIE ZAHLEN SICH GEÄNDERT HABEN (2026-08-09, ADR-v9-242): der Symlink zeigte auf
// `orte.v9.json` — die ÄLTESTE von vier Ortsdateien im Spec-Repo (rev 63, 310 Orte),
// während der Nutzer längst mit `orte-2.json` arbeitete (rev 277, 402 Orte). Die
// Deklaration nannte dazu 139/181, also nicht einmal die Zahlen der Datei, auf die sie
// zeigte. Beides blieb liegen, weil `ORTSBESTAND.erwartet` — anders als
// `REALBESTAND.erwartet` — von KEINEM Test gelesen wurde: TST-21 war nur zur Hälfte
// gebaut. Genau die Lage, gegen die TST-21 geschrieben wurde, eine Tür weiter.

export const ortsbestandPfad = (): string => join(__dirname, '../fixtures', ORTSBESTAND.datei);

export const ortsbestandVorhanden = (): boolean => existsSync(ortsbestandPfad());

/**
 * Lädt den kuratierten Bestand so, wie `PlacesPersister.load()` ihn liefert: als die
 * beiden Maps, die der Ladepfad VOR `applyPlaceResolution` in die Datenbank legt.
 * Bewusst über `parsePlacesFileWrapper` (dieselbe Validierung wie im echten Import),
 * nicht über ein `JSON.parse` von Hand.
 */
export function ortsbestandLaden(): { placeObjects: PlaceObjects; hofObjects: HofObjects } {
  const w = parsePlacesFileWrapper(readFileSync(ortsbestandPfad(), 'utf8'));
  return {
    placeObjects: new Map(w.placeObjects.map((p) => [p.id, p])),
    hofObjects: new Map(w.hofObjects.map((h) => [h.id, h])),
  };
}

/** Der eingefrorene Orakel-Snapshot. Gültig für Roundtrip/Parser — NICHT für Bestandszahlen. */
export const ORAKEL_SNAPSHOT = {
  datei: 'MeineDaten_ancestris.ged',
  exportiert: '7 MAR 2026',
  individuals: 2795,
} as const;

export const realbestandPfad = (): string => join(__dirname, '../fixtures', REALBESTAND.datei);

export const realbestandVorhanden = (): boolean => existsSync(realbestandPfad());

export const realbestandText = (): string => readFileSync(realbestandPfad(), 'utf8');

/**
 * Zählt Top-Level-Records (`0 @X@ TAG`) roh aus dem Dateitext — bewusst OHNE den Parser:
 * der Wächter soll die DATEI prüfen, nicht das Zusammenspiel mit dem Modell. Ein
 * Parser-Bug, der Records schluckt, darf hier nicht als „falsche Datei" erscheinen.
 */
export function zaehleRecords(text: string): Record<string, number> {
  const n: Record<string, number> = {};
  for (const zeile of text.split('\n')) {
    const m = /^0 @[^@]+@ ([A-Z_]+)\s*$/.exec(zeile.replace(/\r$/, ''));
    if (m) n[m[1]] = (n[m[1]] ?? 0) + 1;
  }
  return n;
}

/**
 * Der Satz, den ein übersprungener Lauf hinterlassen muss. TST-21: ein Skip darf die
 * Frage, WELCHE Datei gemessen wurde, nicht verdecken — der Dateiname gehört deshalb in
 * den Testnamen (Vitest zeigt Namen immer, `console.log` aus grünen Tests dagegen
 * verschluckt der Standard-Reporter restlos; s. ADR-v9-91).
 */
export const fehlendHinweis = (): string =>
  `${REALBESTAND.datei} nicht in tests/fixtures/ — Symlink auf den aktuellen Export anlegen ` +
  `(gitignored). Ohne sie ist KEINE „am Realbestand"-Aussage belegt.`;
