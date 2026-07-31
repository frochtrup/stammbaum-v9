// services/app-data/app-data-wrapper.ts — Parsen + Validieren des `app-data.json`-Wire-
// Formats (Spec 30 §2.3, BL-180). Reine Funktionen, kein Plattform-Zugriff — Gegenstück
// zu services/places/places-file-wrapper.ts, gleiche Fehler-Haltung: eine fremde oder
// beschädigte Datei wirft eine klare Meldung, statt still einen halben Zustand zu laden.
import type { AppDataWrapper } from './types';

function isShape(v: unknown): v is AppDataWrapper {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.schemaVersion === 'number' &&
    typeof o.rev === 'number' &&
    typeof o.device === 'string' &&
    typeof o.ts === 'number' &&
    typeof o.sections === 'object' &&
    o.sections !== null &&
    !Array.isArray(o.sections)
  );
}

/** Parst einen importierten `app-data.json`-Text. Wirft mit klarer Nutzer-Meldung. */
export function parseAppDataWrapper(text: string): AppDataWrapper {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('app-data.json: Datei enthält kein gültiges JSON.');
  }
  if (!isShape(raw)) {
    throw new Error('app-data.json: unerwartetes Dateiformat (kein gültiger App-Daten-Wrapper).');
  }
  return raw;
}

/** Serialisiert für den Export — das Gegenstück zu `parseAppDataWrapper`. */
export function serializeAppDataWrapper(wrapper: AppDataWrapper): string {
  return JSON.stringify(wrapper, null, 2);
}
