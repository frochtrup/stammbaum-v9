// ui/views/hof/hof-review-actions.ts — die drei Aktionstypen des "Hof-Zuweisungen
// prüfen"-Reviews (Spec 11 §6): "Hof anlegen" (findOrCreateHof), "Variante zum Hof"
// (addHofVariant), "Hof wählen" (Klasse C/D). "Quelle schärfen" ist ein Navigations-Stub
// zur Person/Familie (kein eigenes Kommando hier — Event-Edit-Formular existiert in
// dieser Scheibe noch nicht, s. Auftrag). Jede Aktion mutiert am *korrekten* Ort
// persistent (Spec 11 §6): Hof-Anlage/-Variante in hofObjects (cross-stammbaum), die
// Hof-Wahl direkt am Event (stammbaum-spezifisch, läuft über AppState.touch()).
import type { Event } from '../../../core/model/types';
import type { HofObjects } from '../../../core/places';
import { findOrCreateHof, addHofVariant } from '../../../core/places';
import type { AppState } from '../../shell/app-state.svelte';
import type { HofReviewRow } from './hof-review-model';

/**
 * "Hof anlegen" (Klasse A/D): findet-oder-erzeugt einen Hof für (row.addr, villageId)
 * und verknüpft das Event direkt. Reprojektion (ev.place/ev.addr) läuft — wie überall
 * in dieser Scheibe — erst beim nächsten Laden (Spec 11 §4.1 "Re-Derivation ist die
 * Persistenz"), nicht hier parallel im View.
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
  event.hofId = res.hofId;
  event.placeId = villageId;
  appState.touch();
  return { ok: true };
}

/**
 * "Variante zum Hof" (Klasse D, Norm-Drift): hängt row.addr als neue addrs[]-
 * Bezeichnung an einen bestehenden Hof an und verknüpft das Event.
 */
export function applyAddVariant(appState: AppState, event: Event, targetHofId: string): { ok: true } | { ok: false; reason: string } {
  const hof = appState.db.hofObjects.get(targetHofId);
  if (!hof) return { ok: false, reason: 'Ziel-Hof nicht gefunden.' };
  const next = addHofVariant(hof, event.addr);
  appState.saveHof(next);
  event.hofId = targetHofId;
  appState.touch();
  return { ok: true };
}

/** "Hof wählen" (Klasse C, mehrdeutig): verknüpft das Event direkt mit dem gewählten Hof. */
export function applyChooseHof(appState: AppState, event: Event, chosenHofId: string): { ok: true } {
  event.hofId = chosenHofId;
  appState.touch();
  return { ok: true };
}

export type { HofReviewRow };
