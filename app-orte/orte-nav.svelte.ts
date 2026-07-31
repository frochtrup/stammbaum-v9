// app-orte/orte-nav.svelte.ts — die Auswahl des Editors (PlacesNav, Spec 22 §3/§6).
//
// Der Editor hat zwei Ziele: den ausgewählten Ort und den ausgewählten Hof. Mehr braucht
// eine Liste-↔-Detail-Fläche nicht, und mehr soll sie auch nicht bekommen — der
// ViewState des Hauptprogramms trägt Lens-Fokus, Zeitleisten-Auswahl und Proband, die
// hier alle kein Ziel hätten.
//
// `setMapCoordFocus` fehlt bewusst (D6, Spec 22 §3.1): der Editor hat keine Karten-Lens.
// Der Sprung ist damit nicht abgeschaltet, sondern strukturell abwesend — `focusOnMap`
// prüft auf die Methode, nicht auf ein Flag, und der Koordinaten-Glyph bleibt still.
// `lensPlaceFocus` wird angenommen und verworfen: die geteilten Views dürfen es setzen,
// ohne zu wissen, wer sie zeigt.

import type { PlacesNav } from '../ui/shell/places-host';

export function createOrteNav(): PlacesNav {
  let place = $state<string | null>(null);
  let hof = $state<string | null>(null);

  return {
    getCurrent(target) {
      return target === 'place' ? place : hof;
    },
    setCurrent(target, id) {
      if (target === 'place') place = id;
      else if (target === 'hof') hof = id;
      // 'lensPlaceFocus': kein Ziel im Editor — bewusst folgenlos.
    }
  };
}
