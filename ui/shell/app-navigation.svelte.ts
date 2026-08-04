// ui/shell/app-navigation.svelte.ts — die Navigations-Callbacks der App-Wurzel:
// Sidebar/BottomNav-Slots, Lens-Wechsel, Entitäts-Sprünge und der Proband.
//
// Eigene Datei aus demselben Grund wie `entity-tab-navigation.svelte.ts` daneben:
// `App.svelte` lief sonst über die 600-Zeilen-Schwelle. Und wie dort ist es eine kohäsive
// Einheit — alles, was die Frage „WOHIN geht es als Nächstes" beantwortet. Was in
// `App.svelte` BLEIBT, ist die Entscheidung, WELCHE Fläche zum aktuellen Ziel rendert,
// plus alles Datei-/Lebenszyklus-Nahe (Auto-Load, Auto-Save, Kürzel, Service-Worker).
//
// Die Mechanik der Sprünge selbst liegt weiterhin EINMAL in `entity-jump.ts` /
// `lens-jump.ts` (INV-UI-4); hier stehen nur die benannten Aufrufer, die die
// Kind-Komponenten als Callback bekommen.

import type { AppState } from './app-state.svelte';
import type { ViewState } from './view-state.svelte';
import type { Route } from './route.svelte';
import type { BottomNavSlot, NavTargetId } from './nav-model';
import type { LensId } from './lens-model';
import type { Command } from './command-palette-model';
import { focusPersonInLens } from './lens-jump';
import { jumpToEntity, jumpToFamilyStory, runPaletteCommand } from './entity-jump';
import { resolveProband } from './proband';
import { displayName } from './person-display';

export interface AppNavigation {
  navigateFromSidebar(target: NavTargetId): void;
  navigate(slot: BottomNavSlot): void;
  navigateLens(lens: LensId): void;
  openLensForPerson(personId: string, lens: LensId): void;
  openPerson(id: string): void;
  openFamily(id: string): void;
  openSource(id: string): void;
  openPlace(id: string): void;
  openHof(id: string): void;
  /** Die Orts-LISTE öffnen, nicht einen einzelnen Ort (BL-310). Geschwister von
   *  `openPlace`, aber ohne Ziel-Id: die leere Karte verweist auf den Batch-Geocoder,
   *  und der lebt in der Liste hinter der Werkzeuge-Disclosure (BL-130). Räumt die
   *  Orts-Auswahl, sonst landete der Sprung auf einem zuvor geöffneten Steckbrief statt
   *  dort, wo der Knopf hinzuführen verspricht. */
  openPlaceList(): void;
  openStoryFromFamilyDetail(familyId: string): void;
  goToProband(): void;
  runCommand(cmd: Command): void;
  /** Der effektive Proband als Palette-Befehl (id + Anzeigename), reaktiv. */
  readonly probandCommand: { id: string; label: string } | null;
}

export function createAppNavigation(appState: AppState, viewState: ViewState, route: Route): AppNavigation {
  const openPerson = (id: string) => jumpToEntity(viewState, route, 'person', id);

  // „Zum Probanden" (BL-120): auf die Detailseite der effektiven Referenzperson springen
  // (Session-Proband, sonst kleinste ID — ADR-v9-135/139). Derselbe Sprung-Mechanismus wie
  // die globale Suche (ViewState-Auswahl + Routen-Ziel setzen).
  function goToProband() {
    const pid = resolveProband(appState.db, viewState);
    if (pid) openPerson(pid);
  }

  // Die Palette selbst kennt viewState nicht; sie zeigt nur, was hier aufgelöst wurde.
  const probandCommand = $derived.by(() => {
    const pid = resolveProband(appState.db, viewState);
    const p = pid ? appState.db.individuals.get(pid) : null;
    return p ? { id: p.id, label: displayName(p) } : null;
  });

  return {
    navigateFromSidebar(target: NavTargetId) {
      route.setTarget(target);
    },

    openPlaceList() {
      viewState.setCurrent('place', null);
      route.setTarget('place');
    },

    navigate(slot: BottomNavSlot) {
      // "Personen" ist der Einstieg in die ENTITÄTEN (Spec 21 §2), nicht in die
      // Personenliste im engeren Sinn: der Slot führt auf das zuletzt offene
      // Entitäts-Segment zurück, nicht stur auf Personen.
      if (slot === 'person') route.openEntities();
      // "Baum" ist genauso der Einstieg in die LENSES, nicht in den Baum im engeren Sinn:
      // der Slot führt auf die zuletzt offene Ansicht zurück (Baum/Karte/Zeitleiste).
      // Bis ADR-v9-102 stand hier `setTarget('tree')` — der Slot sprang stur auf den Baum,
      // während der Slot direkt daneben sich sein Segment längst merkte.
      else if (slot === 'tree') route.openLens();
      // "Aufgaben" ist genauso der Einstieg in die FORSCHUNG (Spec 21 §2, ADR-v9-116), nicht
      // stur auf "Aufgaben": der Slot führt auf das zuletzt offene Forschungsziel zurück
      // (Aufgaben/Protokoll/Hypothesen/Dashboard) — dieselbe Merker-Logik wie Personen/Baum.
      else if (slot === 'tasks') route.openResearch();
      else route.setTarget(slot);
    },

    // Lens-Umschalter (Spec 21 §4, INV-UI-3) — EIN Callback für alle Lens-Wechsel aus
    // jeder Lens heraus (TreeView, MapLensView UND TimelineLensView reichen denselben
    // Callback-Namen durch). Der Fokus selbst wird NICHT hier verschoben: er lebt bereits
    // im geteilten ViewState-Slot `lensFocus` (view-state.svelte.ts) und bleibt beim
    // Wechsel automatisch erhalten, weil alle Lenses denselben Slot lesen/schreiben.
    //
    // Lens-Ids sind seit BL-90 zugleich Ziel-Ids des Registers — die frühere
    // if/else-Übersetzung entfällt. Alle vier Lenses (inkl. Story, BL-133) sind gebaut.
    navigateLens(lens: LensId) {
      route.setTarget(lens);
    },

    // Umgekehrte Richtung: Personen-Kontext-Sprung aus PersonDetail in eine Lens
    // (BL-60/ADR-v9-153; durchgereicht via EntityTab.onOpenLensForPerson ->
    // PersonDetail.onOpenLens -> PersonDetailHeader/LensSwitcher). Ersetzt die vormals
    // zwei handgeschriebenen Sprünge `openTreeFromPersonDetail`/`openStoryFromPersonDetail`
    // — Karte und Zeitleiste fehlten dort schlicht. Die Slot-Reihenfolge lebt EINMAL in
    // `lens-jump.ts` (INV-UI-4), nicht hier je Ziel nachgebaut.
    openLensForPerson(personId: string, lens: LensId) {
      focusPersonInLens(viewState, route, personId, lens);
    },

    // Sprung auf eine Entitäts-Detailseite — aus der globalen Suche, der Befehlspalette,
    // dem Baum (Zentrum-Karte -> Person, ⚭-Badge -> Familie) und „Zum Probanden".
    openPerson,
    openFamily: (id: string) => jumpToEntity(viewState, route, 'family', id),
    openSource: (id: string) => jumpToEntity(viewState, route, 'source', id),
    openPlace: (id: string) => jumpToEntity(viewState, route, 'place', id),
    openHof: (id: string) => jumpToEntity(viewState, route, 'hof', id),

    // "📖 Story" aus FamilyDetail: couple-zentrische Familien-Biografie in der Story-Lens
    // (BL-186). Setzt die explizit gewählte Familie + Familien-Modus.
    openStoryFromFamilyDetail: (familyId: string) => jumpToFamilyStory(viewState, route, familyId),

    goToProband,

    /** Ausführen eines Palette-Befehls: Navigationsziel ODER Sprung auf eine Entität.
     *  Die Entitäts-Sprünge nutzen exakt die Funktionen, die auch die Suchfläche
     *  bedienen (openPerson & Co.) — kein zweiter Sprung-Pfad. */
    runCommand: (cmd: Command) => runPaletteCommand(viewState, route, cmd, goToProband),

    get probandCommand() {
      return probandCommand;
    },
  };
}
