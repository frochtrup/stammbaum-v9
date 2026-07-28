// Content-Security-Policy für den Produktions-Build (LP-8, Spec 30 §NFR-3).
// Einzige Quelle der Wahrheit: das Vite-Plugin (Meta-Tag-Injektion, csp-plugin.ts)
// und der CSP-Scanner (tests/csp/check-csp.mjs, prüft u. a. das Fehlen von
// unsafe-inline/unsafe-eval) lesen beide diese Konstante, keine zweite Abschrift.
//
// Gegenüber dem v8-Orakel (index.html, ADR-015) bewusst reduziert: kein
// OneDrive/Microsoft-Graph/OAuth-Zubehör (ADR-v9-04 — App-verwaltete Cloud
// entfällt). `connect-src` erlaubt Nominatim (OSM) für das opt-in-Geocoding
// (BL-130, Spec 20 §1.7) — nur auf Nutzeraktion aufgerufen; gov.genealogy.net
// bleibt draußen (in v9 nicht aufgerufen). `img-src`/`data:`+`blob:` sind KEIN Vorgriff: Leaflets
// gebündeltes CSS/JS (Zoom-Controls, Marker-Schatten, Drag-Ghost-Fallback)
// bettet selbst `data:image/...`-URIs ein — ohne diese zwei Quellen bliebe
// die Karten-Insel (ADR-v9-25) unter aktiver CSP kaputt (browser-verifiziert).
export const CSP_POLICY =
  "default-src 'self'; " +
  "script-src 'self'; " +
  "style-src 'self'; " +
  "font-src 'self'; " +
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org; " +
  "connect-src 'self' https://nominatim.openstreetmap.org; " +
  "object-src 'none'; " +
  "base-uri 'self'; " +
  "form-action 'self'; " +
  "frame-ancestors 'none';";
