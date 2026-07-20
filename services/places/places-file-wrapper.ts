// services/places/places-file-wrapper.ts — Parsen + Validieren des orte.json-Wire-
// Formats aus einer importierten Datei (ADR-v9-70, Spec 14 §6). Reine Funktion, kein
// Plattform-Zugriff — nimmt Text (bereits vom PickerAdapter gelesen), gibt einen
// getypten PlacesFileWrapper zurück oder wirft einen klaren Fehler (kein stiller
// Absturz bei kaputtem/fremdem JSON, s. Aufgabenstellung).

import type { PlacesFileWrapper } from './types';

function isPlaceObjectArray(v: unknown): v is PlacesFileWrapper['placeObjects'] {
  return Array.isArray(v) && v.every((p) => typeof p === 'object' && p !== null && typeof (p as { id?: unknown }).id === 'string');
}

function isHofObjectArray(v: unknown): v is PlacesFileWrapper['hofObjects'] {
  return Array.isArray(v) && v.every((h) => typeof h === 'object' && h !== null && typeof (h as { id?: unknown }).id === 'string');
}

function isPlacesFileWrapperShape(v: unknown): v is PlacesFileWrapper {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.schemaVersion === 'number' &&
    typeof o.rev === 'number' &&
    typeof o.device === 'string' &&
    typeof o.ts === 'number' &&
    isPlaceObjectArray(o.placeObjects) &&
    isHofObjectArray(o.hofObjects)
  );
}

/**
 * Parst einen importierten orte.json-Dateitext zu einem PlacesFileWrapper. Wirft eine
 * `Error` mit klarer Nutzer-Meldung, wenn der Text kein gültiges JSON ist ODER kein
 * orte.json-Wrapper-Format hat (z. B. eine fremde/beschädigte Datei) — kein stiller
 * Absturz, der Aufrufer fängt/zeigt die Meldung (analog parseGedcom-Fehlerpfad).
 */
export function parsePlacesFileWrapper(text: string): PlacesFileWrapper {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('orte.json: Datei enthält kein gültiges JSON.');
  }
  if (!isPlacesFileWrapperShape(raw)) {
    throw new Error('orte.json: unerwartetes Dateiformat (kein gültiger Orte-/Höfe-Wrapper).');
  }
  return raw;
}

/** Serialisiert einen PlacesFileWrapper für den Export — das Gegenstück zu parsePlacesFileWrapper. */
export function serializePlacesFileWrapper(wrapper: PlacesFileWrapper): string {
  return JSON.stringify(wrapper, null, 2);
}
