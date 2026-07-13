// ui/islands/shared/reduced-motion.ts — zentraler prefers-reduced-motion-Check für
// ALLE imperativen SVG-/Karten-Inseln (Spec 21 §6i: "EIN zentraler Check
// (`window.matchMedia('(prefers-reduced-motion: reduce)')`), von allen Inseln
// gemeinsam gelesen (INV-UI-4), nicht pro Insel neu abgefragt"). Framework-frei,
// keine Kern-Logik (INV-ARCH-1) — reiner Zugriff auf eine Plattform-API, gehört
// deshalb neben die Inseln (`ui/islands/`), nicht in `core/`/`services/`.
//
// Bewusst EINE winzige Funktion statt eines Zustands-Objekts/Subscriptions: die
// imperativen Inseln bauen bei jeder (Re-)Zentrierung ohnehin komplett neu auf
// (Spec 02 §5, "kompletter Neu-Aufbau statt Fein-Diffing") — ein einmaliger Read pro
// Zentrierungs-/Übergangs-Aufruf reicht, kein Live-Listener auf
// `matchMedia(...).addEventListener('change', …)` nötig.
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
