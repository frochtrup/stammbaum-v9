// ui/views/place/place-review-actions.ts — die Aktionen des "Orts-Zuweisungen prüfen"-
// Reviews (Klasse P, Spec 11 §6). Gegenstück zu hof-review-actions.ts.
//
// "Ort wählen" läuft über den Kern-Chokepoint `linkEventToPlace` (core/places/commands.ts),
// der ID UND Text (`ev.place`) SOFORT atomar reprojiziert (ADR-v9-19/-42, Spec 11 §3
// INV-PLACE) — nicht erst beim nächsten Laden. Das ist bei Klasse P mehr als Kosmetik: der
// reprojizierte PLAC trägt danach die disambiguierende Kette („Oldenburg, USA"), womit der
// nächste volle Lade-Pass das Event deterministisch bindet statt es erneut als mehrdeutig
// zu melden (Spec 11 §6, "Quelle schärfen" als deterministischer Weg — hier vom Kommando
// gleich miterledigt).
//
// Spec 11 §6 nennt für P drei Aktionen: "Ort wählen" | "+ Ort anlegen" | "Quelle schärfen".
// Umgesetzt sind "Ort wählen" (hier) und "Quelle schärfen" (Navigations-Stub zur Person/
// Familie in PlaceReview.svelte, gleiches Muster wie die Hof-Review). "+ Ort anlegen"
// fehlt bewusst: bei Klasse P existieren bereits ≥1 gleichnamige Kandidaten — ein weiterer
// gleichnamiger Ort verschärft die Mehrdeutigkeit meist, statt sie zu lösen. Der
// Guard-Veto-Unterfall (der richtige Ort fehlt ganz, resolve.ts) bleibt damit vorerst über
// "Quelle schärfen" + Neuanlage im Orte-Tab lösbar.
import type { Event, PlaceId } from '../../../core/model/types';
import type { PlacesHost } from '../../shell/places-host';

/**
 * "Ort wählen" (Klasse P): verknüpft das Event mit dem gewählten der mehrdeutigen
 * Kandidaten via `linkEventToPlace` (Sofort-Reprojektion). `event` MUSS das echte, in
 * Person/Family lebende Objekt sein (über `flatEvents[row.index]`, s. place-review-model.ts)
 * — resolveEvents arbeitet auf Kopien.
 */
export function applyPlaceChoice(
  appState: PlacesHost,
  event: Event,
  chosenPlaceId: PlaceId,
): { ok: true } | { ok: false; reason: string } {
  if (!chosenPlaceId) return { ok: false, reason: 'Kein Ort gewählt.' };
  if (!appState.db.placeObjects.has(chosenPlaceId)) {
    return { ok: false, reason: 'Gewählter Ort nicht gefunden.' };
  }
  if (!appState.linkEventToPlace(event, chosenPlaceId)) {
    return { ok: false, reason: 'Ereignis nicht in der geladenen Datenbank gefunden.' };
  }
  return { ok: true };
}
