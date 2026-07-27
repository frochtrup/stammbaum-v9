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

/** Die vier Rollen aus Spec 21 §1. Bestimmt die Sidebar-Gruppierung (BL-06). */
export type NavRole = 'entity' | 'lens' | 'work' | 'research';

/** Entitäten (Spec 21 §1): Datenkategorien zum Browsen/Bearbeiten. `media` (BL-126,
 *  Spec 20 §1.4 [S]) ist ein EIGENES Segment neben Personen/Familien/Quellen/Orte/Höfe
 *  (Nutzer-Entscheidung) — NICHT Teil des Mehr-Hubs, obwohl die Kachelgalerie eine
 *  globale, nicht Personen-lokale Arbeitsfläche ist (genau wie Quellen bereits). */
export type EntityTargetId = 'person' | 'family' | 'source' | 'place' | 'hof' | 'media';

/**
 * Die Kontext-Fokus-Lenses, die sich EINEN Bottom-Nav-Slot teilen (Spec 21 §4:
 * "Baum ▸ Karte ▸ Zeitleiste"). Deckungsgleich mit den implementierten Einträgen des
 * Lens-Umschalters (lens-model.ts) — 'story' fehlt, weil unimplementiert, 'stats' ist
 * laut NAV_TARGETS zwar Rolle 'lens', aber kein Umschalter-Eintrag (globales Dashboard
 * ohne Personenfokus) und hängt am Mehr-Slot.
 *
 * Diese Liste ist der Grund, warum `bottomNavSlotFor` und der Lens-Merker der Route
 * (`route.svelte.ts`) dieselbe Menge meinen können, ohne sie zweimal aufzuzählen.
 */
export type LensTargetId = 'tree' | 'map' | 'timeline';

export const LENS_SLOT_TARGETS: readonly LensTargetId[] = ['tree', 'map', 'timeline'];

export function isLensTarget(id: RouteTarget): id is LensTargetId {
  return (LENS_SLOT_TARGETS as readonly string[]).includes(id);
}

/**
 * Die vier Forschungsflächen (ResearchTab.svelte): Aufgaben · Protokoll · Hypothesen ·
 * Dashboard.
 *
 * Seit ADR-v9-116 sind das ERSTKLASSIGE Nav-Ziele der Rolle 'research' (eigene
 * NAV_TARGETS-Einträge, eigene Sidebar-Gruppe „Forschung") — exakt wie die Entitäten,
 * nicht mehr Werkzeuge INNERHALB von 'tasks'. Mobil erreicht sie eine Segment-Reihe unter
 * dem ☑ Aufgaben-Slot (`bottomNavSlotFor(research) → 'tasks'`), auf Desktop führt die
 * Sidebar sie direkt; INV-UI-2 bleibt gewahrt (genau ein kanonischer Weg je Formfaktor,
 * dieselbe Bauform wie bei den Entitäten). Die Route merkt sich das zuletzt offene Ziel
 * (`researchTarget`), genau wie `entityTarget`/`lensTarget`.
 */
export type ResearchTargetId = 'tasks' | 'log' | 'hypotheses' | 'quality';
/** Rückwärtskompatibler Alias — die Route/ResearchTab sprachen bisher von „Segment". */
export type ResearchSegmentId = ResearchTargetId;

/**
 * Anzeige-Modi der beiden Diagramm-Lenses (Karte: Orte/Personen/Migrationen; Zeitleiste:
 * Swim-Lane/Dekaden). Aus demselben Grund hier wie `ResearchSegmentId`: der Modus muss
 * das Wegnavigieren überleben, und die Merker leben gesammelt in der Routen-Quelle.
 *
 * Bewusst als EIGENE Unions statt eines Typ-Imports aus `ui/islands/**`: nav-model ist
 * rein und DOM-frei (INV-ARCH-2), die Inseln sind es nicht — eine Abhängigkeit
 * ui/shell → ui/islands wäre eine Querverbindung, keine nach unten (INV-ARCH-1).
 * Gegen ein stilles Auseinanderdriften der beiden Unions schützt der Compiler an der
 * Zuweisungsstelle in MapLensView/TimelineLensView (dort treffen Insel-Typ und
 * Merker-Typ aufeinander) — kein Verlass auf Erinnerung.
 */
export type MapModeId = 'orte' | 'person' | 'migr';
export type TimelineModeId = 'swim' | 'decade';
/** Anzeige-Modus der Baum-Lens (Sanduhr · Nachkommen · Fächer, Spec 21 §1/§8, ADR-v9-123). */
export type TreeModeId = 'hourglass' | 'descendant' | 'fan';

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
  | 'log'
  | 'hypotheses'
  | 'quality'
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
 * dann Forschung, dann Arbeit. Die Bottom-Nav und der Mehr-Hub haben eigene, mobil begründete
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
  // 📎 ist laut Spec 21 §7 ausschließlich das Medien-/OBJE-Symbol (nie Quellen) — dasselbe
  // Symbol, das der Präsenz-Badge auf PersonList schon nutzt (ADR-v9-79 Punkt 3).
  { id: 'media', role: 'entity', icon: '📎', label: 'Medien', implemented: true },
  { id: 'tree', role: 'lens', icon: '⧖', label: 'Baum', implemented: true },
  { id: 'map', role: 'lens', icon: '🗺', label: 'Karte', implemented: true },
  { id: 'timeline', role: 'lens', icon: '⏱', label: 'Zeitleiste', implemented: true },
  { id: 'stats', role: 'lens', icon: '📊', label: 'Statistik', implemented: true },
  { id: 'story', role: 'lens', icon: '📖', label: 'Story', implemented: false },
  // Dashboard führt die Forschungs-Gruppe an — auf Sidebar (Desktop) UND mobiler
  // Segment-Reihe dieselbe Ordnung (ADR-v9-116). Default-Landung bleibt dennoch „Aufgaben"
  // (route-Default 'tasks'): Reihenfolge ≠ Default, s. ResearchTab/route.
  { id: 'quality', role: 'research', icon: '📈', label: 'Dashboard', implemented: true },
  { id: 'tasks', role: 'research', icon: '☑', label: 'Aufgaben', implemented: true },
  { id: 'log', role: 'research', icon: '📋', label: 'Protokoll', implemented: true },
  { id: 'hypotheses', role: 'research', icon: '💡', label: 'Hypothesen', implemented: true },
  { id: 'search', role: 'work', icon: '🔍', label: 'Suche', implemented: true },
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

/**
 * Anzeigename je Rolle/Gruppe — EINE Quelle für die Sidebar-Gruppen-Header (Desktop) UND
 * die drei Gruppen-Einstiegs-Slots der Bottom-Nav (Mobil), damit dieselbe Gruppe auf
 * beiden Formfaktoren GLEICH heißt (ADR-v9-122). Vorher gab es zwei Quellen: Sidebar.svelte
 * hielt eine eigene `GROUPS`-Liste, und die Bottom-Nav borgte sich das Label ihres Default-
 * Ziels ("Personen"/"Baum"/"Aufgaben") — dieselbe Gruppe hatte je nach Gerät zwei Namen,
 * und mobil kollidierte der Tab-Name „Personen" mit dem gleichnamigen Segment darunter.
 */
export const NAV_ROLE_LABELS: Record<NavRole, string> = {
  entity: 'Daten',
  lens: 'Ansichten',
  research: 'Forschung',
  work: 'Arbeit',
};

export const ENTITY_TARGETS: readonly NavTargetDef[] = targetsByRole('entity');

export function isEntityTarget(id: RouteTarget): id is EntityTargetId {
  return ENTITY_TARGETS.some((t) => t.id === id);
}

/** Die vier Forschungsziele der Rolle 'research' — die Sidebar-Gruppe „Forschung"
 *  (ADR-v9-116). Analog zu ENTITY_TARGETS: eine Projektion des einen Registers, keine
 *  zweite Ziel-Liste. */
export const RESEARCH_TARGETS: readonly NavTargetDef[] = targetsByRole('research');

export function isResearchTarget(id: RouteTarget): id is ResearchTargetId {
  return RESEARCH_TARGETS.some((t) => t.id === id);
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

/** Reihenfolge der Bottom-Nav-Slots (Spec 21 §2). Die drei Gruppen-Slots werden nach ihrer
 *  ROLLE beschriftet (Ansichten · Daten · … · Forschung, ADR-v9-122), die Slot-IDS bleiben
 *  aber ihr Default-Ziel (tree/person/tasks) — daher hier weiterhin diese IDs. */
export const BOTTOM_NAV_SLOTS: readonly BottomNavSlot[] = ['tree', 'person', 'search', 'tasks', 'more'];

export interface NavItemView {
  id: BottomNavSlot;
  icon: string;
  label: string;
  implemented: boolean;
}

/**
 * Drei Bottom-Slots sind Gruppen-Einstiege — sie eröffnen eine ganze Rolle (mehrere Ziele
 * über die Segment-Reihe) und werden deshalb nach ihrer ROLLE benannt (= Sidebar-Gruppe,
 * ADR-v9-122), nicht nach ihrem Default-Ziel. 'search' ist KEIN Gruppen-Einstieg
 * (Datei/Ausgaben/Einstellungen hängen am Mehr-Hub, nicht am Such-Slot) und behält sein
 * Ziel-Label „Suche".
 */
const GROUP_ENTRY_SLOT_ROLE: Partial<Record<BottomNavSlot, NavRole>> = {
  person: 'entity',
  tree: 'lens',
  tasks: 'research',
};

/** Projektion für BottomNav.svelte — Symbole aus dem Register; Gruppen-Slots tragen den
 *  Rollen-Namen (NAV_ROLE_LABELS), Einzel-Ziel-Slots ihr Ziel-Label. */
export function bottomNavItems(): NavItemView[] {
  return BOTTOM_NAV_SLOTS.map((slot) => {
    if (slot === 'more') return { ...MORE_SLOT };
    const def = navTargetById(slot);
    const role = GROUP_ENTRY_SLOT_ROLE[slot];
    return {
      id: slot,
      icon: def.icon,
      label: role ? NAV_ROLE_LABELS[role] : def.label,
      implemented: def.implemented,
    };
  });
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
  if (isLensTarget(target)) return 'tree';
  // Alle vier Forschungsziele hängen am ☑ Aufgaben-Slot — exakt wie die Entitäten am
  // Personen-Slot: „Aufgaben ist der Einstieg in die Forschung" (Spec 21 §2, ADR-v9-116).
  if (isResearchTarget(target)) return 'tasks';
  if (target === 'search') return 'search';
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
