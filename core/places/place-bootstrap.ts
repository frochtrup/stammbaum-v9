// core/places/place-bootstrap.ts — Orte-Bootstrap-Vorschlag (Spec 20 §1.7 [K], ADR-v9-27).
//
// REINE Funktion (TST-3/INV-ARCH-1): sammelt distinkte, noch UNAUFGELÖSTE PLAC-Hierarchien
// aus geladenen Events und bietet sie als PlaceObject-ENTWÜRFE zur Nutzer-Sichtung an.
// Legt NICHTS automatisch an — das Anlegen echter placeObjects läuft NACH Nutzer-Bestätigung
// über savePlaceObject/upsertPlaceObject (commands.ts). Bewahrt die kuratierte, Cross-Stammbaum-
// Natur von placeObjects (Spec 11 §2) und verhindert den v8-ADR-024-Orts-Wildwuchs.
//
// Struktur-Vorbild findOrCreateHof (hof-id.ts): Kandidat berechnen, aber NICHT selbst schreiben —
// hier NICHTS automatisch übernehmen, alles kommt als Vorschlagsliste zurück.
import type { Event } from '../model/types';
import type { PlaceContext } from './build-plac';
import { eventPlaceId } from './chokepoints';
import { normPlaceName } from './normalize';

/** Ein PlaceObject-Entwurf zur Sichtung — schlank, genug für eine Vorschlagsliste. */
export interface PlaceCandidate {
  /** Vorgeschlagener Ortstitel (Wire-Schreibweise des ersten Auftretens, unverändert). */
  title: string;
  /** Wie viele unaufgelöste Events auf diesen (norm-gleichen) Ort verweisen. */
  sourceEventCount: number;
  /** Event-Typ des ersten Auftretens (Kontext für die Sichtung, z. B. „BIRT"). */
  sampleEventType: string;
}

/** Getrimmte, nicht-leere Komma-Segmente eines PLAC-Strings. */
function segments(plac: string): string[] {
  return plac
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Wählt das Verwaltungs-Segment einer PLAC-Hierarchie als Kandidaten-Titel.
 *
 * Heuristik (bewusst einfach — dies ist ein Vorschlag zur Nutzer-Sichtung, KEIN
 * Auflösungsalgorithmus; kein Nachbau der resolve.ts-Match-Pfade):
 *   - Das LEITSEGMENT ist konsistent das spezifischste Verwaltungs-Segment einer
 *     „Ort, Kreis, Land"-Hierarchie — dieselbe Wahl trifft resolve.ts für den
 *     Verwaltungs-Match (3a atomar, 3c leadSeg als Dorf-Identität).
 *   - AUSNAHME Konvention 1 (Spec 11 §4.3): Bei hof-relevanten Event-Typen
 *     {RESI,PROP,CENS,OCCU} mit rich-PLAC „Hof, Dorf, …" ist das Leitsegment der
 *     HOF (nicht der Ort). Den behandelt der Hof-Bootstrap (Pfad C) automatisch —
 *     als ORTS-Kandidat taugt hier das ZWEITE Segment (das Dorf). Ein zusätzliches
 *     Signal für „Leitsegment = Hof" ist eine gesetzte event.addr (Konvention 1/2).
 *
 * Rückgabe null, wenn kein sinnvolles Segment bleibt.
 */
function candidateTitle(ev: Event, segs: string[]): string | null {
  if (segs.length === 0) return null;
  if (segs.length === 1) return segs[0];
  const hofTypeWithAddr = HOF_TYPES.has(ev.type) && !!ev.addr;
  // Konvention 1 (Hof, Dorf, …): Leitsegment ist der Hof → nimm das Dorf-Segment.
  if (hofTypeWithAddr) return segs[1] ?? segs[0];
  return segs[0];
}

/** Hof-relevante Event-Typen (Spec 11 §4.2) — Leitsegment kann hier ein Hof sein. */
const HOF_TYPES = new Set(['RESI', 'PROP', 'CENS', 'OCCU']);

/**
 * Sammelt PlaceObject-Kandidaten aus noch UNAUFGELÖSTEN Events (Opt-in-Vorschlag, ADR-v9-27).
 *
 * Ein Event gilt als unaufgelöst, wenn `eventPlaceId(ev, ctx) == null` — also weder
 * `ev.placeId` gesetzt ist noch `findByName(ev.place)` (inkl. pnames-Varianten) einen
 * bestehenden Ort findet. Für jeden solchen Event mit nicht-leerem PLAC wird ein
 * Verwaltungs-Segment als Titel extrahiert (siehe candidateTitle) und über normPlaceName
 * dedupliziert: ein Kandidat pro normalisiertem Namen.
 *
 * Deterministisch (TST-3): Reihenfolge = erstes Auftreten des Norm-Namens; gleiche
 * Eingabe → gleiche Ausgabe. Reine Funktion — mutiert weder Events noch Kontext.
 */
export function suggestPlaceCandidates(
  events: readonly Event[],
  ctx: PlaceContext,
): PlaceCandidate[] {
  const byNorm = new Map<string, PlaceCandidate>();

  for (const ev of events) {
    // Schon aufgelöst (placeId ODER findByName/pnames) → kein Vorschlag mehr.
    if (eventPlaceId(ev, ctx) != null) continue;
    const plac = ev.place;
    if (!plac || !plac.trim()) continue;

    const segs = segments(plac);
    const title = candidateTitle(ev, segs);
    if (!title) continue;

    // Der extrahierte Kandidat könnte selbst schon existieren (z. B. Dorf-Segment
    // einer Konvention-1-Hierarchie, dessen Blatt-PLAC nicht auflöste). Dann kein
    // Vorschlag — er ist bereits kuratiert.
    if (ctx.places.findByName(title) != null) continue;

    const key = normPlaceName(title);
    if (!key) continue;

    const existing = byNorm.get(key);
    if (existing) {
      existing.sourceEventCount += 1;
    } else {
      byNorm.set(key, { title, sourceEventCount: 1, sampleEventType: ev.type });
    }
  }

  // Map bewahrt Einfügereihenfolge (= erstes Auftreten) → deterministisch stabil.
  return [...byNorm.values()];
}
