// ui/views/hof/hof-review-actions.ts — die drei Aktionstypen des "Hof-Zuweisungen
// prüfen"-Reviews (Spec 11 §6): "Hof anlegen" (findOrCreateHof), "Variante zum Hof"
// (addHofVariant), "Hof wählen" (Klasse C/D). "Quelle schärfen" ist ein Navigations-Stub
// zur Person/Familie (kein eigenes Kommando hier — Event-Edit-Formular existiert in
// dieser Scheibe noch nicht, s. Auftrag). Jede Aktion mutiert am *korrekten* Ort
// persistent (Spec 11 §6): Hof-Anlage/-Variante in hofObjects (cross-stammbaum), die
// Hof-Wahl direkt am Event (stammbaum-spezifisch, läuft über PlacesHost.touch()).
import type { Event } from '../../../core/model/types';
import type { HofObjects } from '../../../core/places';
import { findOrCreateHof, addHofVariant } from '../../../core/places';
import type { PlacesHost } from '../../shell/places-host';
import type { HofReviewRow } from './hof-review-model';

/** Das übergebene Event lebt nicht in der geladenen Datenbank — die Verknüpfung kann nicht
 *  greifen (Copy-on-Write adressiert den Owner über die Objekt-Identität, ADR-v9-92).
 *  Wird gemeldet statt still übergangen (Spec 21 "nie stiller Abbruch"). */
const NOT_IN_DB = { ok: false as const, reason: 'Ereignis nicht in der geladenen Datenbank gefunden.' };

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
  appState: PlacesHost,
  event: Event,
  villageId: string,
): { ok: true } | { ok: false; reason: string } {
  if (!villageId) return { ok: false, reason: 'Kein Dorf für diese Zeile ermittelbar.' };
  const hofObjects: HofObjects = appState.db.hofObjects;
  const res = findOrCreateHof(event.addr ?? '', villageId, hofObjects);
  if (!res) return { ok: false, reason: 'Adresse kann nicht als Hof angelegt werden (leer?).' };
  if (res.created) appState.saveHof(res.created);
  // Dorf-Anker + Hof-Verknüpfung laufen als EIN Kommando (Copy-on-Write, ADR-v9-92):
  // die frühere Direkt-Mutation `event.placeId = …` schrieb in gehaltene Undo-Snapshots.
  if (!appState.linkEventToHof(event, res.hofId, villageId)) return NOT_IN_DB;
  return { ok: true };
}

/**
 * "Variante zum Hof" (Klasse D, Norm-Drift): hängt row.addr als neue addrs[]-
 * Bezeichnung an einen bestehenden Hof an und verknüpft das Event (Sofort-Reprojektion).
 */
export function applyAddVariant(appState: PlacesHost, event: Event, targetHofId: string): { ok: true } | { ok: false; reason: string } {
  const hof = appState.db.hofObjects.get(targetHofId);
  if (!hof) return { ok: false, reason: 'Ziel-Hof nicht gefunden.' };
  const next = addHofVariant(hof, event.addr ?? '');
  appState.saveHof(next);
  // placeContext wird im Kommando NACH saveHof gelesen — enthält die neue Adressvariante.
  if (!appState.linkEventToHof(event, targetHofId)) return NOT_IN_DB;
  return { ok: true };
}

/** "Hof wählen" (Klasse C, mehrdeutig): verknüpft das Event via `linkEventToHof` (Sofort-Reprojektion). */
export function applyChooseHof(
  appState: PlacesHost,
  event: Event,
  chosenHofId: string,
): { ok: true } | { ok: false; reason: string } {
  if (!appState.linkEventToHof(event, chosenHofId)) return NOT_IN_DB;
  return { ok: true };
}

export type { HofReviewRow };
