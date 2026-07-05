// ui/shell/lens-model.ts — reine Datenbeschreibung des EINEN Lens-Umschalters
// (Spec 21 §4: "Ein einziger, überall identischer Umschalter"; INV-UI-3: "genau ein
// Lens-Umschalter-Mechanismus; kein Diagramm bringt eigene Wechsel-Buttons mit").
//
// Deckt die Kontext-Fokus-Lenses ab: dieselbe Person/derselbe Ort anders betrachtet
// (Baum ▸ Karte ▸ Zeitleiste ▸ Story, Spec 21 §4). Statistik ist bewusst NICHT Teil
// dieser Liste — Nutzer-Entscheidung: Statistik ist ein globales Dashboard, keine
// "dieselbe Person anders betrachtet"-Lens, bleibt ausschließlich über den Mehr-Hub
// erreichbar (s. MoreView.svelte).
//
// Baum, Karte UND Zeitleiste sind mit echtem Inhalt gebaut (Karte: Leaflet+OSM-Primärpfad
// + SVG-Offline-Fallback, ADR-v9-25; Zeitleiste: Swim-Lane + Dekaden-Modus, Spec 20
// §1.10 [S]); Story bleibt deaktivierter Platzhalter (analog zum `implemented:false`-
// Muster aus BottomNav.svelte/EntityTab.svelte/MoreView.svelte) — Klick tut nichts, kein
// Crash.
export type LensId = 'tree' | 'map' | 'timeline' | 'story';

export interface LensDef {
  id: LensId;
  icon: string;
  label: string;
  implemented: boolean;
}

// Reihenfolge folgt Spec 21 §4 wörtlich: "Baum ▸ Karte ▸ Zeitleiste ▸ Story".
export const LENSES: readonly LensDef[] = [
  { id: 'tree', icon: '⧖', label: 'Baum', implemented: true },
  { id: 'map', icon: '🗺', label: 'Karte', implemented: true },
  { id: 'timeline', icon: '⏱', label: 'Zeitleiste', implemented: true },
  { id: 'story', icon: '📖', label: 'Story', implemented: false },
];

export function lensById(id: LensId): LensDef | undefined {
  return LENSES.find((l) => l.id === id);
}
