// ui/views/entity-tab-overlays.svelte.ts — welches WERKZEUG-Overlay ist im Entitäten-Tab
// offen (Spec 20 §1.7/§1.8, Spec 11 §6/§9.2, INV-UI-2).
//
// Massen-Dedup, Orts-/Hof-Zuweisungen prüfen, Personen-Dubletten und das
// Verwandtschafts-Werkzeug sind Werkzeuge INNERHALB eines Segments, keine Navigationsziele
// — deshalb liegen sie NICHT in der Routen-Quelle (ADR-v9-104: die Route trägt Auswahl und
// Anzeige-Modus, ein bewusst geöffnetes On-Demand-Werkzeug ist beides nicht), sondern hier.
//
// Eigene Datei, weil `EntityTab.svelte` sonst über die 600-Zeilen-Schwelle liefe (BL-54):
// das hier ist die kohäsive Einheit, die sich sauber herauslöst — sechs Zustände, eine
// Regel (gegenseitiger Ausschluss je Segment), kein Bezug auf Route/ViewState/Datenbank.
//
// Toolbar-Ownership (Spec 21 §10c): die ÖFFNENDEN Buttons leben in der jeweiligen Liste
// (PlaceList/HofList/PersonList), nicht in der gemeinsamen Kopfzeile. Deshalb "open"/
// "close" statt "toggle" — die Liste verschwindet aus dem DOM, sobald das Overlay
// rendert, ein Toggle-Button könnte sich also nicht selbst zurückschalten; das Schließen
// übernimmt der `onClose` der Overlay-Komponente (jede hat ihr eigenes „✕ Schließen").

export interface EntityTabOverlays {
  readonly hofReview: boolean;
  readonly hofDedup: boolean;
  readonly placeReview: boolean;
  readonly placeDedup: boolean;
  readonly personDedup: boolean;
  readonly relationshipTool: boolean;
  openHofReview(): void;
  closeHofReview(): void;
  openHofDedup(): void;
  closeHofDedup(): void;
  openPlaceReview(): void;
  closePlaceReview(): void;
  openPlaceDedup(): void;
  closePlaceDedup(): void;
  openPersonDedup(): void;
  closePersonDedup(): void;
  openRelationshipTool(): void;
  closeRelationshipTool(): void;
  /** Beim Sprung in ein Segment dessen Overlays räumen — sonst verdeckte ein offenes
   *  Werkzeug den gerade angesteuerten Datensatz. */
  closeForPerson(): void;
  closeForPlace(): void;
  closeForHof(): void;
}

export function createEntityTabOverlays(): EntityTabOverlays {
  let hofReview = $state(false);
  let hofDedup = $state(false);
  let placeReview = $state(false);
  let placeDedup = $state(false);
  let personDedup = $state(false);
  let relationshipTool = $state(false);

  return {
    get hofReview() {
      return hofReview;
    },
    get hofDedup() {
      return hofDedup;
    },
    get placeReview() {
      return placeReview;
    },
    get placeDedup() {
      return placeDedup;
    },
    get personDedup() {
      return personDedup;
    },
    get relationshipTool() {
      return relationshipTool;
    },
    // Die beiden Höfe-Overlays sind gegenseitig exklusiv — jeweils nur EIN Werkzeug
    // gleichzeitig sichtbar; für Orte gilt dasselbe.
    openHofReview() {
      hofDedup = false;
      hofReview = true;
    },
    closeHofReview() {
      hofReview = false;
    },
    openHofDedup() {
      hofReview = false;
      hofDedup = true;
    },
    closeHofDedup() {
      hofDedup = false;
    },
    openPlaceReview() {
      placeDedup = false;
      placeReview = true;
    },
    closePlaceReview() {
      placeReview = false;
    },
    openPlaceDedup() {
      placeReview = false;
      placeDedup = true;
    },
    closePlaceDedup() {
      placeDedup = false;
    },
    openPersonDedup() {
      personDedup = true;
    },
    closePersonDedup() {
      personDedup = false;
    },
    openRelationshipTool() {
      relationshipTool = true;
    },
    closeRelationshipTool() {
      relationshipTool = false;
    },
    // Beim Sprung auf eine PERSON bleiben die Personen-Werkzeuge bewusst stehen: der
    // Dubletten-Finder navigiert selbst auf eine Person und soll dabei nicht verschwinden.
    closeForPerson() {
      hofReview = false;
      placeReview = false;
    },
    closeForPlace() {
      placeDedup = false;
      placeReview = false;
    },
    closeForHof() {
      hofReview = false;
      hofDedup = false;
    },
  };
}
