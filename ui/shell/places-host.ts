// ui/shell/places-host.ts — der Vertrag zwischen den geteilten Orts-/Hof-Views und dem
// Programm, das sie zeigt (Spec 22 §3, ADR-v9-161).
//
// WARUM ES DIESE DATEI GIBT: `ui/views/place` und `ui/views/hof` werden von ZWEI
// Programmen benutzt — dem Hauptprogramm (`app/`) und dem Standalone-Orte-Editor
// (`app-orte/`, Spec 22). Beide sollen dieselben Komponenten zeigen, nicht je eine Kopie;
// eine Kopie wäre die naheliegendste und schnellste Lösung und genau die, die den Zweck
// verfehlt (INV-ORTE-1).
//
// Der Vertrag ist nicht erfunden, sondern GEMESSEN: die 16 Orts-/Hof-Views zogen aus
// `AppState` exakt die zwölf Kommandos unten und aus `ViewState` genau zwei Methoden —
// durchweg als reine Typ-Importe, zur Laufzeit hing dort nichts. Die Naht existierte
// bereits, sie war nur unbenannt.
//
// Er ist die Naht aus Spec 02 §3, eine Ebene höher gezogen: Lese-Chokepoint (`db`,
// `placeContext`) plus Kommandos mit vollständigen Objekten — keine verstreuten
// Feld-Setter, kein Zugriff auf die Zustandsschale des jeweils anderen Programms.
//
// ER BLEIBT SCHMAL. Zwei Gates halten das, statt es zu vereinbaren:
//   - `check:arch` verbietet `ui/shell/app-state`-Importe in `ui/views/place|hof`
//   - der Fork-Guard verbietet in `app-orte/` Dateien mit Basisnamen aus diesen Views
// Ohne sie wächst `PlacesHost` beim nächsten Feature stillschweigend wieder zur ganzen
// Schale zurück — das ist der eigentliche Wert dieser Datei, nicht ihr Typ.

import type { Database, Event, HofId, PlaceId } from '../../core/model/types';
import type { GovApplyResult, HofObject, MergeResult, MoveHofResult, PlaceContext, PlaceObject } from '../../core/places';

/**
 * Was das Wirtsprogramm über die geteilten Views hinaus kann. JEDE Verhaltensabweichung
 * zwischen Hauptprogramm und Orte-Editor läuft hierüber — nie über eine programm-eigene
 * Komponente (INV-ORTE-1). Die sechs Fälle sind in Spec 22 §3.1 als D1–D6 benannt.
 */
export interface PlacesHostCaps {
  /**
   * Sind Ereignisse einer Genealogie-Datei vorhanden? Steuert D1–D4: Referenz-Sichtbarkeit
   * („Ohne Bezug", Spec 11 §9.3), Zuordnungs-Review (Klassen A/C/D/P, §6), Ortszeitgenossen
   * und Hof-Bewohner sowie die erste Stufe des Dedup-Gewinner-Vorschlags (Verwendungszahl,
   * §9.2).
   *
   * Ohne Ereignisse ist „referenzlos" für JEDES Objekt wahr — der Filter wäre nicht falsch,
   * sondern bedeutungslos. Deshalb entfallen diese Flächen, statt leer angeboten zu werden:
   * eine leere Fläche behauptet, es gäbe nichts; eine ausgeblendete sagt, die Grundlage fehlt.
   */
  hasEventContext: boolean;
  /**
   * Führt „Quelle schärfen" in einen Ereignis-Editor? (D5) Im Orte-Editor falsch — er
   * schreibt keine Genealogie-Datei, die Anreicherung hätte kein Ziel.
   */
  canEditEvents: boolean;
  /** Gibt es Karte-/Zeitleisten-Linsen zum Hinspringen? (D6) Die Kartenvorschau im
   *  Steckbrief ist davon unberührt — sie ist Teil der geteilten View. */
  canNavigateToLens: boolean;
}

/**
 * Auswahl-Zustand, soweit die Orts-/Hof-Views ihn brauchen — die zwei Methoden, die sie
 * tatsächlich von `ViewState` nutzten. Bewusst NICHT der ganze ViewState: dessen
 * Lens-/Fokus-Slots gehören zum Hauptprogramm, nicht zu einer Ortsliste.
 */
export interface PlacesNav {
  getCurrent(target: 'place' | 'hof'): string | null;
  setCurrent(target: 'place' | 'hof' | 'lensPlaceFocus', id: string | null): void;
  /**
   * Roh-Koordinaten-Slot der Karten-Lens — **optional** und damit die Typ-Form von D6
   * (Spec 22 §3.1): ein Wirt ohne Karten-Lens lässt die Methode weg, und `focusOnMap`
   * springt nicht. Kein Flag, kein toter Aufruf, keine zweite Komponente.
   *
   * `ViewState` des Hauptprogramms erfüllt beides; der Orte-Editor implementiert nur
   * `getCurrent`/`setCurrent` und ignoriert `lensPlaceFocus`.
   */
  setMapCoordFocus?(coords: { lat: number; long: number }): void;
}

/**
 * Das Wirtsprogramm aus Sicht der Orts-/Hof-Views. `AppState` (Hauptprogramm) und
 * `createOrteHost()` (Orte-Editor) erfüllen ihn; ein Kontrakt-Test prüft beide, sonst
 * liefe der Editor an einer stillschweigend erweiterten Schnittstelle vorbei.
 */
export interface PlacesHost {
  /** Aktueller Datenbestand. Im Orte-Editor ohne Kontextdatei eine leere `makeDatabase()`
   *  mit gefüllten `placeObjects`/`hofObjects` — dieselbe Form, weniger Inhalt. */
  readonly db: Database;
  /** Abgeleiteter Orts-/Hof-Chokepoint-Kontext, immer zur aktuellen `db` passend. */
  readonly placeContext: PlaceContext;
  /** Fähigkeiten des Wirts (s. o.). */
  readonly caps: PlacesHostCaps;

  savePlace(model: PlaceObject): void;
  deletePlace(id: PlaceId): void;
  mergePlace(survivorId: PlaceId, mergedIds: PlaceId | readonly PlaceId[]): MergeResult;
  importGovEntry(placeId: PlaceId, rawText: string): GovApplyResult | null;

  saveHof(model: HofObject): void;
  deleteHof(id: HofId): void;
  mergeHof(survivorId: HofId, mergedIds: HofId | readonly HofId[]): void;
  updateHofAddr(hofId: HofId, index: number, value: string, from: number | null, to: number | null): void;
  /**
   * Hängt einen Hof an ein anderes Dorf (Spec 11 §1: `villageId` ist Teil der Hof-Identität).
   * Eigenes Kommando statt eines Feldes in `saveHof`, weil zwei Nachläufe daran hängen —
   * Konsolidierung bei Adress-Kollision im Zieldorf und der `event.placeId`-Dorfanker der
   * referenzierenden Ereignisse (ADR-v9-172). Dieselbe Begründung wie bei `updateHofAddr`.
   *
   * Liefert das Ergebnis zurück, weil die View es BRAUCHT: bei einer Adress-Kollision im
   * Zieldorf wird konsolidiert, und dann muss die Ansicht (a) darauf hinweisen und (b) ggf.
   * auf die Gewinner-Id umschalten — der bearbeitete Hof kann der Verlierer gewesen sein.
   */
  moveHof(hofId: HofId, villageId: PlaceId): MoveHofResult;

  /** Nur sinnvoll bei `caps.hasEventContext` — ohne Ereignisse gibt es nichts zu verknüpfen. */
  linkEventToPlace(event: Event, placeId: PlaceId): boolean;
  linkEventToHof(event: Event, hofId: HofId, villageId?: PlaceId): boolean;
}

/** Fähigkeiten des Hauptprogramms: alles vorhanden. */
export const FULL_PLACES_CAPS: PlacesHostCaps = {
  hasEventContext: true,
  canEditEvents: true,
  canNavigateToLens: true,
};
