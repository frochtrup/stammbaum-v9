// ui/shell/geo-link.ts — externe OpenStreetMap-Link-URL (ADR-v9-80, INV-UI-4).
// Vorher unabhängig dupliziert in PersonDetail.svelte UND FamilyDetail.svelte
// (byte-identische `geoHref`-Funktion) — jetzt EINE Quelle, von `CoordIndicator.svelte`
// genutzt (die sekundäre "↗ OpenStreetMap"-Affordanz neben dem internen Karte-Sprung).
// Reine Funktion, kein DOM/Framework (INV-ARCH-1) — lebt trotzdem in ui/, nicht core/,
// weil es reine Präsentations-/Verlinkungslogik ist, keine Domänenberechnung.
export function geoHref(coords: { lat: number; long: number }): string {
  return `https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.long}#map=12/${coords.lat}/${coords.long}`;
}
