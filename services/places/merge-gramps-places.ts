// services/places/merge-gramps-places.ts — Merge der NATIVEN GRAMPS-Orte/Höfe (aus der
// geladenen `.gramps`-Datei, BL-143) mit dem persistierten orte.json-Stand.
//
// Grundregel (ADR-v9-114, BL-143): die `.gramps`-Datei ist die Quelle der Wahrheit für Orte
// und Höfe — sie trägt die `<placeobj>`-Records selbst und round-trippt sie (anders als
// GEDCOM, das Orts-Kuration NUR in orte.json halten kann). orte.json steuert für den
// GRAMPS-Pfad daher nur bei, was die Datei NICHT hält:
//   - Datei-FREMDE Einträge (persistierte id nicht in der Datei): aus RESI/PROP-Adressen
//     gebootete Höfe (deren Adresse im Event-`<description>` lebt, nicht als placeobj) und
//     per Hand angelegte Orte. Sie werden übernommen — die spätere `applyPlaceResolution`
//     findet gebootete Höfe idempotent wieder, kein Duplikat.
//   - der app-private `shortName` (Anzeige-Kuration, ADR-v9-90, erreicht den Export NIE)
//     und die app-privaten `translations` (Sprachachse, BL-59, ebenfalls nie im Wire):
//     werden aus dem persistierten Eintrag auf den nativen übernommen, sonst gingen sie bei
//     jedem Reload verloren (der native GRAMPS-Ort trägt sie nicht — projectPlaceobj setzt
//     `translations: []`, GRAMPS-`<pname lang>` bleibt Passthrough).
// Für alles Übrige (Typ, Koordinaten, pnames, enclosedBy, Hof-Adressen) gewinnt der native
// Datei-Stand — er ist frisch aus der Datei geparst und damit aktuell.
//
// Reine Funktion, headless testbar (INV-ARCH-1). `native` wird nicht mutiert.

import type { PlaceId, HofId } from '../../core/model/types';
import type { PlaceObject, HofObject } from '../../core/places/types';

export interface GrampsPlaceState {
  placeObjects: Map<PlaceId, PlaceObject>;
  hofObjects: Map<HofId, HofObject>;
}

export function mergeGrampsPlaces(native: GrampsPlaceState, persisted: GrampsPlaceState): GrampsPlaceState {
  const placeObjects = new Map<PlaceId, PlaceObject>(native.placeObjects);
  for (const [id, po] of persisted.placeObjects) {
    const cur = placeObjects.get(id);
    if (!cur) {
      placeObjects.set(id, po); // datei-fremd → übernehmen
      continue;
    }
    // App-private Kuration (shortName/translations) vom persistierten auf den nativen retten —
    // der native Datei-Stand kennt sie nicht (nie im Wire). Nur füllen, wenn nativ leer.
    const rescueShort = po.shortName && !cur.shortName;
    const persistedTr = po.translations ?? [];
    const rescueTr = persistedTr.length > 0 && (cur.translations ?? []).length === 0;
    if (rescueShort || rescueTr) {
      placeObjects.set(id, {
        ...cur,
        shortName: rescueShort ? po.shortName : cur.shortName,
        translations: rescueTr ? persistedTr : (cur.translations ?? []),
      });
    }
  }
  const hofObjects = new Map<HofId, HofObject>(native.hofObjects);
  for (const [id, hof] of persisted.hofObjects) {
    if (!hofObjects.has(id)) hofObjects.set(id, hof); // datei-fremd (gebootet/hand) → übernehmen
  }
  return { placeObjects, hofObjects };
}
