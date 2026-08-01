// ui/shell/entity-jump.ts — DER EINE Sprung auf eine Entitäts-Detailseite (Spec 20 §1.1,
// Spec 21 §1/§3, INV-UI-2).
//
// Geschwister von `lens-jump.ts` (dort: „diese Person in Ansicht X") und `map-focus.ts`
// (dort: eine Koordinate in der Karte). Hier: „öffne diesen Datensatz" aus einer Fläche,
// die selbst keine Entitäten-Fläche ist — globale Suche, Befehlspalette, Baum-Karte,
// „Zum Probanden".
//
// WARUM ZUSAMMENGEZOGEN: in App.svelte standen dafür fünf fast gleiche Funktionen
// (`openPersonFromSearch` … `openHofFromSearch`) plus zwei Baum-Varianten — sieben
// Stellen, an denen dieselben zwei Zeilen „Auswahl setzen, Ziel setzen" wiederholt
// wurden, und jede neue Aufrufstelle hätte die achte gebaut. Der Unterschied zwischen
// ihnen war genau EINER (die Archiv-Auswahl beim Quellen-Segment) und lebt jetzt an
// einer Stelle statt implizit in einer Kopie.
//
// Das Ziel wird bewusst EXPLIZIT gesetzt und nicht aus der Auswahl abgeleitet: die frühere
// Ableitung beim EntityTab-Remount hatte eine Rangfolge (Familie vor Quelle vor Ort vor
// Hof) und traf bei mehreren gleichzeitig gesetzten Auswahlen nicht zwingend das gerade
// angeklickte Segment (BL-90).
import type { EntityTargetId } from './nav-model';
import type { Route } from './route.svelte';
import type { ViewState } from './view-state.svelte';

/**
 * Öffnet den Datensatz `id` im Entitäts-Segment `target` und navigiert dorthin.
 *
 * Sonderfall Quellen: das Segment zeigt wahlweise eine Quelle ODER ein Archiv
 * (`RepositoryDetail`). Ein Sprung auf eine Quelle muss die Archiv-Auswahl daher räumen,
 * sonst bliebe das Archiv-Detail sichtbar und der Sprung wirkungslos.
 */
export function jumpToEntity(
  viewState: ViewState,
  route: Route,
  target: EntityTargetId,
  id: string,
): void {
  if (target === 'source') viewState.setCurrent('repository', null);
  viewState.setCurrent(target, id);
  route.setTarget(target);
}

/**
 * Öffnet die Story-Lens im FAMILIEN-Modus für `familyId` (BL-186).
 *
 * Kein `jumpToEntity`-Fall: das Ziel ist eine Lens, keine Entitäten-Fläche — und ohne den
 * Modus-Wechsel zeigte die Story die Person-Geschichte, also eine erhaltene Auswahl unter
 * einem zweiten Zustand begraben (ADR-v9-102).
 */
export function jumpToFamilyStory(viewState: ViewState, route: Route, familyId: string): void {
  viewState.setCurrent('storyFamily', familyId);
  route.setStoryMode('family');
  route.setTarget('story');
}
