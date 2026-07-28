// services/places/geocode-service.ts — Nominatim-Geocoding (Einzel + Batch, BL-130,
// Spec 20 §1.7). Die Plattform-API (`fetch`, Timer) lebt NUR hier, hinter einem
// mockbaren Adapter (Spec 02 §3.2); die reine Antwort-Auswertung steht in
// core/places/geocode.ts. Opt-in: aufgerufen wird ausschließlich auf Nutzeraktion.
//
// Verhaltens-Orakel: legacy-v8/geocoding.js (Rate-Limit 1,1 s, Batch über Orte ohne
// Koordinaten).
import {
  parseNominatimResults,
  nominatimSearchUrl,
  type GeocodeHit,
  type NominatimResult,
} from '../../core/places';

/** Kostenloser OSM-Endpoint, kein API-Key (Nominatim-Nutzungsbedingungen beachten). */
export const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

/** Nominatim erlaubt max. 1 Request/Sekunde — im Batch mit Puffer eingehalten. */
export const NOMINATIM_RATE_MS = 1100;

/** Mockbare Abhängigkeiten: Netzwerk + Zeit. Der Produktiv-Adapter ist `browserGeocodeDeps`. */
export interface GeocodeDeps {
  /** Lädt eine URL und gibt das geparste JSON zurück; wirft bei HTTP-Fehlern. */
  fetchJson: (url: string) => Promise<unknown>;
  /** Warten (ms) — im Batch zwischen den Anfragen. Fehlt es, wird `setTimeout` genutzt. */
  sleep?: (ms: number) => Promise<void>;
}

/** Produktiv-Adapter: echter `fetch` + Timer (Browser). */
export function browserGeocodeDeps(): GeocodeDeps {
  return {
    fetchJson: async (url) => {
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(`Nominatim HTTP ${r.status}`);
      return r.json();
    },
    sleep: (ms) => new Promise((res) => setTimeout(res, ms)),
  };
}

/**
 * Geocodiert EINEN Ortsnamen. Gibt den besten Treffer (Koordinaten + Typ + Elternkette)
 * zurück oder `null` (leerer Name, kein Ergebnis, unbrauchbare Antwort). Wirft die
 * Netzwerk-Fehler des Adapters durch — der Aufrufer meldet sie (Toast).
 */
export async function geocodePlace(
  name: string,
  deps: GeocodeDeps,
  base: string = NOMINATIM_BASE,
): Promise<GeocodeHit | null> {
  const q = name.trim();
  if (!q) return null;
  const json = await deps.fetchJson(nominatimSearchUrl(base, q));
  if (!Array.isArray(json)) return null;
  return parseNominatimResults(json as NominatimResult[]);
}

/** Fortschritt eines Batch-Laufs (nach jedem Schritt an `onProgress`). */
export interface BatchProgress {
  done: number;
  total: number;
  /** Der gerade bearbeitete Name; `''` beim Abschluss. */
  current: string;
}

/**
 * Geocodiert eine Liste von Namen nacheinander, ratenlimitiert (1,1 s Abstand). Einzelne
 * Fehler überspringen den Namen und brechen den Batch NICHT ab. Ergebnis: Map Name →
 * Treffer (nur die erfolgreichen).
 */
export async function batchGeocodePlaces(
  names: readonly string[],
  deps: GeocodeDeps,
  onProgress?: (p: BatchProgress) => void,
  base: string = NOMINATIM_BASE,
): Promise<Map<string, GeocodeHit>> {
  const out = new Map<string, GeocodeHit>();
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    onProgress?.({ done: i, total: names.length, current: name });
    try {
      const hit = await geocodePlace(name, deps, base);
      if (hit) out.set(name, hit);
    } catch {
      /* Einzel-Fehler überspringen — der Batch läuft weiter. */
    }
    if (i < names.length - 1) await sleep(NOMINATIM_RATE_MS);
  }
  onProgress?.({ done: names.length, total: names.length, current: '' });
  return out;
}
