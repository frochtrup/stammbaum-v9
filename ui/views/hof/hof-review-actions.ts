// ui/views/hof/hof-review-actions.ts — die drei Aktionstypen des "Hof-Zuweisungen
// prüfen"-Reviews (Spec 11 §6): "Hof anlegen" (findOrCreateHof), "Variante zum Hof"
// (addHofVariant), "Hof wählen" (Klasse C/D). "Quelle schärfen" ist ein Navigations-Stub
// zur Person/Familie (kein eigenes Kommando hier — Event-Edit-Formular existiert in
// dieser Scheibe noch nicht, s. Auftrag). Jede Aktion mutiert am *korrekten* Ort
// persistent (Spec 11 §6): Hof-Anlage/-Variante in hofObjects (cross-stammbaum), die
// Hof-Wahl direkt am Event (stammbaum-spezifisch, läuft über AppState.touch()).
import type { Event } from '../../../core/model/types';
import type { HofObjects } from '../../../core/places';
import { findOrCreateHof, addHofVariant, linkEventToHof } from '../../../core/places';
import type { AppState } from '../../shell/app-state.svelte';
import type { HofReviewRow } from './hof-review-model';

// Alle drei Aktionen setzen `ev.hofId` über das Kern-Kommando `linkEventToHof`
// (core/places/commands.ts), das ID UND Text (`ev.place`/`ev.addr`) SOFORT atomar
// reprojiziert (ADR-v9-19/-42, Spec 11 §3 INV-PLACE) — nicht erst beim nächsten Laden.
// Der frühere Kommentar begründete das Gegenteil ("Reprojektion läuft erst beim nächsten
// Laden") und widersprach damit der ratifizierten Sofort-Reprojektions-Regel; dieser Drift
// ist mit ADR-v9-42 geschlossen. `resolveEvents()` beim Laden bleibt zusätzlich die
// Vollständigkeits-Garantie (bewusst redundant-konsistent, dieselbe buildPlacForGedcom-
// Projektion). Der `PlaceContext` kommt live aus `appState.placeContext` (Chokepoint,
// Spec 11 §5) — nach `saveHof()` re-derived es frisch, enthält also den neuen Hof.

/**
 * "Hof anlegen" (Klasse A/D): findet-oder-erzeugt einen Hof für (row.addr, villageId)
 * und verknüpft das Event via `linkEventToHof` (Sofort-Reprojektion).
 */
export function applyCreateHof(
  appState: AppState,
  event: Event,
  villageId: string,
): { ok: true } | { ok: false; reason: string } {
  if (!villageId) return { ok: false, reason: 'Kein Dorf für diese Zeile ermittelbar.' };
  const hofObjects: HofObjects = appState.db.hofObjects;
  const res = findOrCreateHof(event.addr, villageId, hofObjects);
  if (!res) return { ok: false, reason: 'Adresse kann nicht als Hof angelegt werden (leer?).' };
  if (res.created) appState.saveHof(res.created);
  event.placeId = villageId;
  // placeContext NACH saveHof lesen — enthält den frisch angelegten Hof (db-Reassign).
  linkEventToHof(event, res.hofId, appState.placeContext);
  appState.touch();
  return { ok: true };
}

/**
 * "Variante zum Hof" (Klasse D, Norm-Drift): hängt row.addr als neue addrs[]-
 * Bezeichnung an einen bestehenden Hof an und verknüpft das Event (Sofort-Reprojektion).
 */
export function applyAddVariant(appState: AppState, event: Event, targetHofId: string): { ok: true } | { ok: false; reason: string } {
  const hof = appState.db.hofObjects.get(targetHofId);
  if (!hof) return { ok: false, reason: 'Ziel-Hof nicht gefunden.' };
  const next = addHofVariant(hof, event.addr);
  appState.saveHof(next);
  // placeContext NACH saveHof lesen — enthält die neue Adressvariante.
  linkEventToHof(event, targetHofId, appState.placeContext);
  appState.touch();
  return { ok: true };
}

/** "Hof wählen" (Klasse C, mehrdeutig): verknüpft das Event via `linkEventToHof` (Sofort-Reprojektion). */
export function applyChooseHof(appState: AppState, event: Event, chosenHofId: string): { ok: true } {
  linkEventToHof(event, chosenHofId, appState.placeContext);
  appState.touch();
  return { ok: true };
}

export type { HofReviewRow };
