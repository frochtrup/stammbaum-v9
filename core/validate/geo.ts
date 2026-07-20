// core/validate/geo.ts — Haversine-Distanz für die Geo-Regeln (Spec 20 §3 HOF_FAR).
//
// Warum hier und nicht importiert: `core/places/curation.ts` trägt dieselbe Rechnung als
// modul-private `distKm` (Dedup-Kandidatensuche). Sie dort zu exportieren wäre die
// naheliegende Wiederverwendung — ein Kern-Modul würde damit aber einen Teil seiner
// internen Heuristik zur öffentlichen API machen, nur weil ein zweiter Aufrufer dieselbe
// Schulformel braucht. Stattdessen liegt die Formel einmal frei zugänglich hier; die
// Dedup-Seite kann sie bei Gelegenheit übernehmen (dann fällt die dortige Kopie weg).

const EARTH_R_KM = 6371;

/** Haversine-Distanz zweier Koordinatenpaare in Kilometern. */
export function distanceKm(aLat: number, aLong: number, bLat: number, bLong: number): number {
  const rad = (d: number): number => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLong - aLong);
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.min(1, Math.sqrt(x)));
}
