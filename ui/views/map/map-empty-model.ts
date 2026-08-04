// ui/views/map/map-empty-model.ts — warum die Karte nichts zeigt (BL-310, Spec 20 §1.9,
// Spec 21 §5 „nie ein stiller Abbruch").
//
// WARUM DAS EINE DATEI WERT IST. Eine leere Karte ohne Text ist keine Anzeige, sondern
// ein Zustand, den der Nutzer für einen Defekt hält. Und leer ist sie beim ersten Blick
// fast immer: der Village-Seed erzeugt beim Import unangereicherte PlaceObjects OHNE
// eigene Koordinaten ([ADR-v9-28](specs/v9/04-Entscheidungslog.md)) — direkt nach dem
// Laden hat der Bestand also viele Orte und keinen Marker. Das ist der Regelfall, nicht
// der Randfall.
//
// EIN MECHANISMUS FÜR ALLE DREI MODI (INV-UI-4). Vor BL-310 trug NUR der Personen-Modus
// einen Hinweis („Keine Koordinaten für diese Person vorhanden", inline in
// MapLensView.svelte); Orte und Migrationen schwiegen. Genau das ist die Negativform der
// Invariante: ein Muster, das an drei Stellen dieselbe Rolle spielt, war an einer
// umgesetzt. Der Personen-Satz zieht deshalb hier ein, statt einen zweiten Weg daneben
// zu bekommen — sein Wortlaut bleibt unverändert, damit die Änderung nichts umbenennt,
// was schon richtig hieß.
//
// KEIN ZWEITER GEOCODING-EINSTIEG. Der Batch-Lauf lebt im Orte-Tab hinter der
// Werkzeuge-Disclosure (`PlaceList.svelte`, BL-130). Die Karte VERWEIST darauf und baut
// ihn nicht nach — ein zweiter Auslöser für denselben Vorgang wäre INV-UI-4, und ein
// Dauer-Element in der Kopfzeile zusätzlich ein INV-UI-11-Bruch ([21 §6h](specs/v9/21-UI-UX.md)).
// Der Hinweis steht auf der leeren Fläche, wo ohnehin nichts ist, und verschwindet mit
// dem ersten Marker.
//
// Rein und DOM-frei: die Funktion bekommt Zahlen, keine Register. Das hält sie ohne
// Datenbank testbar und macht sichtbar, dass sie „was ist ein Marker" NICHT selbst
// beantwortet — das tut `placesWithCoords` (map-model.ts), und zwar als einzige Stelle.

/** Welcher Kartenmodus fragt. Gleiche Werte wie `MapMode` der Leaflet-Insel. */
export type MapEmptyMode = 'orte' | 'person' | 'migr';

/** Was die Ansicht bereits ausgerechnet hat — nichts davon wird hier neu hergeleitet. */
export interface MapEmptyInput {
  mode: MapEmptyMode;
  /** Marker im Orte-Modus (`placesWithCoords(...).length`). */
  markers: number;
  /** Linien im Migrations-Modus (`migrationLines(...).length`). */
  migrations: number;
  /** Stationen der gewählten Person (`personBiographyPoints(...).length`). */
  biography: number;
  /** Ist im Personen-Modus überhaupt jemand gewählt? */
  personSelected: boolean;
  /** Orte im Bestand, UNABHÄNGIG von Koordinaten. Zusammen mit `hofs` die Zahl, die
   *  „gar nichts da" von „da, aber ohne Koordinaten" trennt. */
  places: number;
  /** Höfe im Bestand, UNABHÄNGIG von Koordinaten.
   *
   *  GETRENNT von `places`, nicht addiert: ein Hof ist in v9 eine eigene Entität und
   *  ausdrücklich KEIN Ort ([11 §1](specs/v9/11-Orte-Hoefe-Identitaet.md): `PlaceObject.type`
   *  ist nie Farm/Building). Der erste Bau-Stand reichte eine Summe herein und schrieb
   *  „626 Orte erfasst" — am Realbestand sind das 419 Orte UND 207 Höfe. Aufgefallen erst
   *  beim Blick auf die echten Daten: die Liste daneben zählte 419, der Satz behauptete
   *  626. Eine Zahl, die zwei Entitätsarten zusammenwirft, widerspricht dem Modell, das
   *  sie gerade trennt. */
  hofs: number;
}

/**
 * Warum die Fläche leer ist.
 *
 * `kein-bestand` — es gibt keine Orte, also auch nichts zu geocodieren.
 * `ohne-koordinaten` — Orte sind da, keiner trägt Koordinaten. Der einzige Fall, in dem
 *   ein Weg nach vorn existiert, und deshalb der einzige mit `offersGeocoding`.
 * `keine-stationen` — die gewählte Person hat keine verorteten Ereignisse.
 * `keine-linien` — niemand hat zwei verortete Stationen, aus denen eine Linie würde.
 */
export type MapEmptyKind = 'kein-bestand' | 'ohne-koordinaten' | 'keine-stationen' | 'keine-linien';

export interface MapEmptyState {
  kind: MapEmptyKind;
  /** Erster Satz: was der Fall ist. Nennt die Zahl, wo es eine gibt. */
  headline: string;
  /** Zweiter Satz: was daran zu tun ist. Nie leer — ein Hinweis ohne Ausweg ist keiner. */
  hint: string;
  /** true → die Ansicht zeigt zusätzlich den Weg in den Orte-Tab (dort sitzt der
   *  Batch-Geocoder). Nur bei `ohne-koordinaten` sinnvoll: sonst gäbe es dort nichts
   *  zu holen, und ein Knopf, der ins Leere führt, ist schlimmer als keiner. */
  offersGeocoding: boolean;
}

/**
 * „419 Orte und 207 Höfe" / „1 Ort" / „207 Höfe" — die Zahlen stehen im Satz, sonst ist
 * er eine Behauptung. Beide Arten werden benannt, keine eingemeindet (s. `hofs` oben).
 */
function bestand(places: number, hofs: number): string {
  const o = places === 1 ? '1 Ort' : `${places} Orte`;
  const h = hofs === 1 ? '1 Hof' : `${hofs} Höfe`;
  if (places > 0 && hofs > 0) return `${o} und ${h}`;
  return places > 0 ? o : h;
}

/**
 * Nennt den Grund für die leere Karte — oder `null`, wenn es etwas zu sehen gibt und
 * folglich nichts zu erklären.
 *
 * Bewusst KEIN Fallback-Text für „unbekannter Grund": jeder Zweig unten deckt eine
 * gezählte Lage ab. Ein generisches „Keine Daten" wäre wieder die stille Fläche, nur mit
 * Schrift darauf.
 */
export function mapEmptyReason(input: MapEmptyInput): MapEmptyState | null {
  const { mode, markers, migrations, biography, personSelected, places, hofs } = input;
  /** Gibt es überhaupt etwas, das ein Geocoding-Lauf mit Koordinaten versorgen könnte? */
  const curatable = places + hofs;

  if (mode === 'orte') {
    if (markers > 0) return null;
    if (curatable === 0) {
      return {
        kind: 'kein-bestand',
        headline: 'Noch keine Orte im Bestand.',
        hint: 'Orte entstehen beim Import automatisch aus den Ereignissen — dazu unter „Datei" eine GEDCOM- oder GRAMPS-Datei öffnen.',
        offersGeocoding: false,
      };
    }
    return {
      kind: 'ohne-koordinaten',
      headline: `${bestand(places, hofs)} erfasst, keiner davon mit Koordinaten.`,
      hint: 'Die Karte zeigt nur Orte, die Koordinaten tragen. Frisch importierte Orte haben noch keine — im Orte-Tab holt „Alle ohne Koordinaten geocodieren" sie für den ganzen Bestand auf einmal.',
      offersGeocoding: true,
    };
  }

  if (mode === 'person') {
    // Ohne Auswahl steht der Personen-Picker direkt darüber und sagt selbst, was zu tun
    // ist — ein Satz daneben wiederholte ihn nur (Leerzustand-Suppression, [21 §10 f]).
    if (!personSelected || biography > 0) return null;
    return {
      kind: 'keine-stationen',
      // Wortlaut aus der bisherigen Inline-Fassung übernommen, s. Kopfkommentar.
      headline: 'Keine Koordinaten für diese Person vorhanden.',
      hint:
        curatable > 0
          ? 'Ihre Ereignisse hängen an Orten ohne Koordinaten — der Orte-Tab kann sie für den ganzen Bestand geocodieren.'
          : 'Ihre Ereignisse tragen keinen Ort, den die Karte verorten könnte.',
      offersGeocoding: curatable > 0,
    };
  }

  if (migrations > 0) return null;
  return {
    kind: 'keine-linien',
    headline: 'Keine Wanderungen darstellbar.',
    hint:
      curatable > 0
        ? 'Eine Linie entsteht, sobald eine Person mindestens zwei Orte MIT Koordinaten hat — im Orte-Tab lassen sie sich für den ganzen Bestand geocodieren.'
        : 'Eine Linie entsteht, sobald eine Person mindestens zwei Orte mit Koordinaten hat.',
    offersGeocoding: curatable > 0,
  };
}
