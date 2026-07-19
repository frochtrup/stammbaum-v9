// ui/shell/nav-model.ts — das EINE Navigations-Ziel-Register (Spec 21 §3, INV-UI-15).
//
// Jedes Navigationsziel der App ist hier GENAU EINMAL beschrieben: Id, Rolle
// (Spec 21 §1 Rollenmodell), Symbol, Beschriftung, Implementiert-Status. Bottom-Nav,
// Mehr-Hub, Entitäten-Segmentreihe, die künftige Desktop-Sidebar (BL-06) und die
// künftige Command-Palette (BL-93) sind PROJEKTIONEN darauf — keine dieser Flächen
// hält eine eigene Ziel-Liste.
//
// Warum das kein Stil-Aufräumen ist: vor BL-90 lagen die Ziele in drei unabhängigen
// Listen (App.svelte `activeTarget`, EntityTab.svelte `segments`, MoreView.svelte
// `items`), und die Sidebar aus Spec 21 §3 ist exakt deren Vereinigung. Ein
// Sidebar-Klick auf "Orte" hätte in EntityTabs privaten Zustand greifen müssen — eine
// zweite Navigationsquelle neben der bestehenden, also ein direkter Bruch von INV-UI-2
// ("genau ein kanonischer Weg"). Siehe ADR-v9-101.
//
// Rein und DOM-frei, gleiche Bauform wie lens-model.ts — damit build-frei testbar
// (INV-ARCH-2). Der reaktive Teil (welches Ziel ist gerade aktiv) lebt getrennt in
// route.svelte.ts.

/** Die drei Rollen aus Spec 21 §1. Bestimmt die Sidebar-Gruppierung (BL-06). */
export type NavRole = 'entity' | 'lens' | 'work';

/** Entitäten (Spec 21 §1): Datenkategorien zum Browsen/Bearbeiten. */
export type EntityTargetId = 'person' | 'family' | 'source' | 'place' | 'hof';

/**
 * Alle Navigationsziele der App.
 *
 * Archive sind bewusst KEIN eigenes Ziel: sie sind laut Spec 20 §1.6 Teil des
 * Quellen-Ziels (Zugang über die Quellen-Detailseite bzw. den Archiv-Picker) — ebenso
 * wie Orts-/Hof-Review und Massen-Dedup Werkzeuge INNERHALB von 'place'/'hof' sind und
 * keine Ziele (INV-UI-2).
 */
export type NavTargetId =
  | EntityTargetId
  | 'tree'
  | 'map'
  | 'timeline'
  | 'stats'
  | 'story'
  | 'search'
  | 'tasks'
  | 'file'
  | 'reports'
  | 'settings';

export interface NavTargetDef {
  id: NavTargetId;
  role: NavRole;
  icon: string;
  label: string;
  implemented: boolean;
}

/**
 * Reihenfolge folgt Spec 21 §3 (Sidebar-Gruppen) wörtlich: Entitäten, dann Ansichten,
 * dann Arbeit. Die Bottom-Nav und der Mehr-Hub haben eigene, mobil begründete
 * Reihenfolgen (s. u.) — die weichen bewusst ab, ziehen ihre Beschriftungen/Symbole
 * aber aus DIESER Tabelle.
 *
 * Zur Gruppe "Ansichten": sie ist NICHT deckungsgleich mit dem Lens-Umschalter
 * (lens-model.ts). Statistik ist ein globales Dashboard ohne Personenfokus und daher
 * kein Lens-Eintrag, in der Sidebar aber sehr wohl ein Ziel dieser Gruppe — eine
 * Sidebar-Gruppe ist eine Beschriftungs-Ordnung, kein Mechanismus (Spec 21 §3).
 *
 * Die Symbole der Entitäts-Ziele werden heute nirgends gerendert (die Segmentreihe ist
 * textbasiert); sie stehen hier, weil die Sidebar sie braucht (BL-06) und das Register
 * laut INV-UI-15 die vollständige Beschreibung eines Ziels trägt — nicht die halbe.
 */
export const NAV_TARGETS: readonly NavTargetDef[] = [
  { id: 'person', role: 'entity', icon: '👤', label: 'Personen', implemented: true },
  { id: 'family', role: 'entity', icon: '👪', label: 'Familien', implemented: true },
  { id: 'source', role: 'entity', icon: '📜', label: 'Quellen', implemented: true },
  { id: 'place', role: 'entity', icon: '📍', label: 'Orte', implemented: true },
  { id: 'hof', role: 'entity', icon: '🏠', label: 'Höfe', implemented: true },
  { id: 'tree', role: 'lens', icon: '⧖', label: 'Baum', implemented: true },
  { id: 'map', role: 'lens', icon: '🗺', label: 'Karte', implemented: true },
  { id: 'timeline', role: 'lens', icon: '⏱', label: 'Zeitleiste', implemented: true },
  { id: 'stats', role: 'lens', icon: '📊', label: 'Statistik', implemented: true },
  { id: 'story', role: 'lens', icon: '📖', label: 'Story', implemented: false },
  { id: 'search', role: 'work', icon: '🔍', label: 'Suche', implemented: true },
  { id: 'tasks', role: 'work', icon: '☑', label: 'Aufgaben', implemented: true },
  { id: 'file', role: 'work', icon: '📁', label: 'Datei', implemented: true },
  { id: 'reports', role: 'work', icon: '🖨', label: 'Ausgaben', implemented: false },
  { id: 'settings', role: 'work', icon: '⚙', label: 'Einstellungen', implemented: false },
];

export function navTargetById(id: NavTargetId): NavTargetDef {
  const def = NAV_TARGETS.find((t) => t.id === id);
  // Der Typ schließt das aus; der Wurf ist die Absicherung gegen einen Aufruf aus
  // ungetyptem Kontext (Test-Fixture, künftiger JSON-Zustand) — kein stiller undefined.
  if (!def) throw new Error(`nav-model: unbekanntes Ziel "${id}"`);
  return def;
}

export function targetsByRole(role: NavRole): readonly NavTargetDef[] {
  return NAV_TARGETS.filter((t) => t.role === role);
}

export const ENTITY_TARGETS: readonly NavTargetDef[] = targetsByRole('entity');

export function isEntityTarget(id: RouteTarget): id is EntityTargetId {
  return ENTITY_TARGETS.some((t) => t.id === id);
}

/**
 * Was die Routen-Quelle halten kann: jedes Ziel — plus 'more'.
 *
 * 'more' ist KEIN Ziel im Sinne des Rollenmodells, sondern die mobile Hub-Fläche
 * selbst (das Menü, Spec 21 §2). Es steht deshalb nicht in NAV_TARGETS, aber sehr wohl
 * in der Route: der Hub ist ein Zustand, in dem die App stehen kann, und vor BL-90 war
 * genau das der dritte Ort, an dem Navigationszustand lag (MoreView `openEntry`).
 * Auf Desktop gibt es diesen Zustand nicht — dort trägt die Sidebar alle Ziele direkt.
 */
export type RouteTarget = NavTargetId | 'more';

/** Die fünf festen Bottom-Nav-Slots (Spec 21 §2). */
export type BottomNavSlot = 'tree' | 'person' | 'search' | 'tasks' | 'more';

/** Der Hub-Slot, der kein Ziel ist (s. RouteTarget) — trägt Symbol/Label selbst. */
export const MORE_SLOT = { id: 'more', icon: '⋯', label: 'Mehr', implemented: true } as const;

/** Reihenfolge der Bottom-Nav (Spec 21 §2 wörtlich: Baum · Personen · Suche · Aufgaben · Mehr). */
export const BOTTOM_NAV_SLOTS: readonly BottomNavSlot[] = ['tree', 'person', 'search', 'tasks', 'more'];

export interface NavItemView {
  id: BottomNavSlot;
  icon: string;
  label: string;
  implemented: boolean;
}

/** Projektion für BottomNav.svelte — Symbole/Beschriftungen kommen aus dem Register. */
export function bottomNavItems(): NavItemView[] {
  return BOTTOM_NAV_SLOTS.map((slot) =>
    slot === 'more'
      ? { ...MORE_SLOT }
      : { id: slot, ...pickView(navTargetById(slot)) },
  );
}

function pickView(def: NavTargetDef): { icon: string; label: string; implemented: boolean } {
  return { icon: def.icon, label: def.label, implemented: def.implemented };
}

/**
 * Projektion für MoreView.svelte: alles, was auf Mobil weder einen eigenen Bottom-Nav-
 * Slot hat noch über die Entitäten-Segmentreihe erreichbar ist.
 *
 * Die Reihenfolge weicht bewusst von NAV_TARGETS ab: Karte/Zeitleiste zuerst (die
 * beiden gebauten Lenses, häufigster Grund den Hub zu öffnen), dann Datei — Datei steht
 * vor Statistik, weil es für Erstnutzer der Einstieg ist, bevor überhaupt Daten da sind
 * (Spec 21 §2 Nachtrag 2026-07-07).
 */
export const MORE_HUB_ORDER: readonly NavTargetId[] = [
  'map',
  'timeline',
  'file',
  'stats',
  'story',
  'reports',
  'settings',
];

export function moreHubItems(): readonly NavTargetDef[] {
  return MORE_HUB_ORDER.map(navTargetById);
}

/**
 * Welcher Bottom-Nav-Slot ist bei diesem Route-Ziel aktiv?
 *
 * Hier laufen drei vormals verstreute Ad-hoc-Zuordnungen zusammen (ADR-v9-101):
 * - Karte/Zeitleiste hängen navigatorisch am Baum-Slot (sie haben keinen eigenen Slot,
 *   erreicht werden sie über den Lens-Umschalter) — war ein `$derived` in App.svelte.
 * - Familien/Quellen/Orte/Höfe hängen am Personen-Slot ("Personen ist der Einstieg in
 *   die Entitäten", Spec 21 §2) — war implizit, weil EntityTab den Slot ganz besetzte.
 * - Statistik/Datei/Story/Ausgaben/Einstellungen hängen am Mehr-Slot — war implizit,
 *   weil MoreView seinen Unter-Zustand selbst hielt.
 *
 * Auf Desktop wird diese Funktion nicht gebraucht: die Sidebar markiert das Ziel selbst.
 */
export function bottomNavSlotFor(target: RouteTarget): BottomNavSlot {
  if (isEntityTarget(target)) return 'person';
  if (target === 'tree' || target === 'map' || target === 'timeline') return 'tree';
  if (target === 'search' || target === 'tasks') return target;
  return 'more';
}

/**
 * Leerzustands-Hinweis "noch keine Daten geladen" — EINE Quelle statt vier.
 *
 * Der Satz nennt den Weg zum Datei-Öffnen, und der hängt am Formfaktor: mobil der
 * Mehr-Hub, auf Desktop die Sidebar. Vor BL-06 stand er wörtlich und mit fest
 * eingebautem „unter Mehr" in PersonList/FamilyList/SourceList/RepositoryList — vier
 * Kopien (INV-UI-4), die auf Desktop alle auf eine Fläche verwiesen, die es dort gar
 * nicht gibt. Gefunden bei der eigenen Browser-Verifikation von BL-06.
 */
export function noDataHint(entityPlural: string, isDesktop: boolean): string {
  const where = isDesktop ? 'in der Seitenleiste unter „Datei"' : 'unter „Mehr"';
  return `Keine ${entityPlural} geladen — ${where} eine Datei öffnen, um zu starten.`;
}
