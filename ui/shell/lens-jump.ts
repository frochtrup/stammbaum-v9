// ui/shell/lens-jump.ts — DER EINE Personen-Kontext-Sprung in eine Lens (BL-60,
// ADR-v9-153, Spec 20 §1.9 „Ebenfalls vorgesehen", Spec 21 §4/INV-UI-3).
//
// Geschwister von `map-focus.ts::focusOnMap` (dort: ein ORTS-/Koordinaten-Sprung aus
// einer Ereigniszeile/Mini-Karte). Hier: „diese PERSON in Ansicht X" aus einer Fläche
// heraus, die selbst keine Lens ist (Personen-Steckbrief).
//
// WARUM ZENTRAL UND NICHT JE ZIEL EIN CALLBACK: bis BL-60 hatte App.svelte zwei
// handgeschriebene Sprünge (`openTreeFromPersonDetail`, `openStoryFromPersonDetail`) mit
// je eigener Slot-Reihenfolge — Karte und Zeitleiste fehlten schlicht, und jeder neue
// Sprung hätte die Reihenfolge ein drittes Mal nachgebaut. Genau die Drift, die
// `map-focus.ts` schon einmal eingesammelt hat.
//
// WARUM DER SPRUNG DIE LENS-EIGENE AUSWAHL ÜBERSCHREIBT: `lensFocus` allein genügt
// nicht. Karte und Zeitleiste halten seit ADR-v9-102 eine EIGENE Auswahl (`mapPerson`
// bzw. die Zeitleisten-Liste); `lensFocus` ist für sie nur eine VORBELEGUNG, die greift,
// solange sie selbst noch nichts gewählt haben. Ein Sprung, der nur `lensFocus` setzte,
// liefe deshalb bei jeder zweiten Benutzung ins Leere — die Lens zeigte weiter ihre alte
// Auswahl. Das ist KEIN Widerspruch zu ADR-v9-102: dort ging es um die IMPLIZITE
// Übernahme einer Baum-Rezentrierung ("eine spätere Baum-Rezentrierung überschreibt eine
// getroffene Karten-Auswahl nicht"), hier um ein EXPLIZITES Nutzer-Kommando „zeig mir
// diese Person dort" — dieselbe Unterscheidung wie bei ADR-v9-81 (Freeze gegen
// Auto-Reprojektion ist kein Freeze gegen bewusste Nutzer-Edits).
//
// Auch der ANZEIGE-MODUS zieht mit (`setMapMode('person')`/`setStoryMode('person')`):
// eine erhaltene Auswahl, die ein zweiter Zustand verdeckt, ist aus Nutzersicht nicht
// erhalten (ADR-v9-102, dort für die Karte belegt) — die Karte im Orte-Modus zeigt die
// gesetzte Person nicht.
import type { ViewState } from './view-state.svelte';
import type { Route } from './route.svelte';
import type { LensId } from './lens-model';

/**
 * Öffnet `lens` mit `personId` als Fokus und navigiert dorthin.
 *
 * Setzt IMMER den geteilten Fokus-Slot `lensFocus` (Spec 21 §4: „Der Fokus bleibt beim
 * Lens-Wechsel erhalten") und zusätzlich die lens-eigene Auswahl + den Anzeige-Modus der
 * Ziel-Lens, wo es eine gibt.
 */
export function focusPersonInLens(
  viewState: ViewState,
  route: Route,
  personId: string,
  lens: LensId,
): void {
  viewState.setCurrent('lensFocus', personId);
  if (lens === 'map') {
    viewState.setCurrent('mapPerson', personId);
    route.setMapMode('person');
  } else if (lens === 'timeline') {
    viewState.setTimelinePersons([personId]);
  } else if (lens === 'story') {
    // Einen evtl. gesetzten Familien-Fokus fallen lassen, sonst zeigte der Familien-Modus
    // die Familie einer FRÜHEREN Person (Verhalten aus `openStoryFromPersonDetail`).
    viewState.setCurrent('storyFamily', null);
    route.setStoryMode('person');
  }
  route.setTarget(lens);
}
