// core/places/geocode.ts — reine Auswertung einer Nominatim-Antwort (Spec 20 §1.7,
// BL-130). DOM-/Netzwerk-frei (INV-ARCH-1): der eigentliche `fetch` lebt hinter einem
// mockbaren Adapter in services/places; hier steht nur die Übersetzung
// Nominatim-JSON → {lat, long, Typ, Verwaltungskette}.
//
// Verhaltens-Orakel: legacy-v8/geocoding.js (_detectLevel/_parentChain, _ADDR_KEY_TYPE).

/** Nominatim `address`-Schlüssel → unser Typ-Vokabular (`PlaceObject.type`). */
const ADDR_KEY_TYPE: Readonly<Record<string, string>> = {
  hamlet: 'Hamlet',
  neighbourhood: 'Borough',
  suburb: 'Borough',
  quarter: 'Borough',
  village: 'Village',
  town: 'Town',
  city: 'City',
  municipality: 'Municipality',
  county: 'County',
  state: 'State',
  country: 'Country',
  parish: 'Parish',
};

/** Ebenen von fein nach grob — die eigene Stufe ist das tiefste besetzte Feld. */
const LEVELS = [
  'hamlet',
  'neighbourhood',
  'suburb',
  'quarter',
  'village',
  'town',
  'city',
  'municipality',
] as const;

/** Reihenfolge inkl. Verwaltungsebenen — für die Elternketten-Bestimmung. */
const CHAIN_ORDER = [...LEVELS, 'county', 'state', 'country'] as const;

/** Rohform eines Nominatim-`/search`-Treffers (nur die Felder, die wir lesen). */
export interface NominatimResult {
  lat: string;
  lon: string;
  address?: Record<string, string>;
}

/** Ein aufgelöster Geocoding-Treffer: Koordinaten, Typ und Verwaltungs-Elternkette. */
export interface GeocodeHit {
  lat: number;
  long: number;
  /** Typ des Orts (Village/Town/City/…), abgeleitet aus der tiefsten `address`-Ebene. */
  type: string;
  /** Übergeordnete Verwaltungseinheiten (County/State/Country), grob nach fein. */
  hierarchy: { title: string; type: string }[];
}

/** Tiefste besetzte Ebene → eigener Schlüssel + Typ. */
function detectLevel(addr: Record<string, string>): { ownKey: string | null; type: string } {
  for (const k of LEVELS) {
    if (addr[k]) return { ownKey: k, type: ADDR_KEY_TYPE[k] ?? 'Unknown' };
  }
  if (addr.county) return { ownKey: 'county', type: 'County' };
  if (addr.state) return { ownKey: 'state', type: 'State' };
  if (addr.country) return { ownKey: 'country', type: 'Country' };
  return { ownKey: null, type: 'Unknown' };
}

/** County/State/Country oberhalb der Eigenebene als Elternkette. */
function parentChain(
  addr: Record<string, string>,
  ownKey: string | null,
): { title: string; type: string }[] {
  const ownIdx = ownKey ? CHAIN_ORDER.indexOf(ownKey as (typeof CHAIN_ORDER)[number]) : -1;
  const chain: { title: string; type: string }[] = [];
  const above = (key: string) => !ownKey || ownIdx < CHAIN_ORDER.indexOf(key as (typeof CHAIN_ORDER)[number]);
  if (addr.county && above('county')) chain.push({ title: addr.county, type: 'County' });
  if (addr.state && above('state')) chain.push({ title: addr.state, type: 'State' });
  if (addr.country && above('country')) chain.push({ title: addr.country, type: 'Country' });
  return chain;
}

/**
 * Wertet die Nominatim-Trefferliste aus: nimmt den ersten (besten) Treffer, liest
 * Koordinaten, leitet Typ + Elternkette aus dem `address`-Objekt ab. `null`, wenn nichts
 * Brauchbares dabei ist (leere Liste oder unparsbare Koordinaten).
 */
export function parseNominatimResults(results: readonly NominatimResult[]): GeocodeHit | null {
  const best = results[0];
  if (!best) return null;
  const lat = parseFloat(best.lat);
  const long = parseFloat(best.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(long)) return null;
  const addr = best.address ?? {};
  const { ownKey, type } = detectLevel(addr);
  return { lat, long, type, hierarchy: parentChain(addr, ownKey) };
}

/** Baut die Nominatim-`/search`-Anfrage-URL (deutsche Sprache, mitteleuropäischer Fokus). */
export function nominatimSearchUrl(base: string, query: string): string {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    addressdetails: '1',
    limit: '3',
    'accept-language': 'de',
    countrycodes: 'de,at,ch,pl,cz,hu,fr,nl,be,lu',
  });
  return `${base}/search?${params.toString()}`;
}
