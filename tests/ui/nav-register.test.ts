// tests/ui/nav-register.test.ts — INV-UI-15 (Spec 21 §3, ADR-v9-101): EIN
// Navigations-Ziel-Register, mehrere Projektionen; EINE Routen-Quelle.
//
// Bewusst OHNE `@vitest-environment happy-dom`: nav-model.ts ist rein und DOM-frei,
// route.svelte.ts braucht nur den Runes-Compiler. Dass diese Tests im node-Environment
// laufen, IST der Nachweis der geforderten Bauform (INV-ARCH-2-Geist, gleiche Form wie
// lens-model.ts/view-state.svelte.ts).
//
// Die Projektionstests sind Wächter, keine Meilensteine (Backlog-Regel 6): sie schlagen
// an, sobald irgendeine Fläche wieder anfängt, eine eigene Ziel-Liste zu führen — der
// Zustand, den BL-90 aufgelöst hat.
import { describe, expect, it } from 'vitest';
import {
  BOTTOM_NAV_SLOTS,
  ENTITY_TARGETS,
  MORE_HUB_ORDER,
  NAV_TARGETS,
  bottomNavItems,
  LENS_SLOT_TARGETS,
  bottomNavSlotFor,
  isEntityTarget,
  isLensTarget,
  moreHubItems,
  navTargetById,
  targetsByRole,
  type NavTargetId,
} from '../../ui/shell/nav-model';
import { createRoute } from '../../ui/shell/route.svelte';

describe('Ziel-Register — eine Beschreibung je Ziel (INV-UI-15)', () => {
  it('vergibt jede Ziel-Id genau einmal', () => {
    const ids = NAV_TARGETS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('beschreibt jedes Ziel vollständig (Rolle, Symbol, Beschriftung)', () => {
    for (const t of NAV_TARGETS) {
      expect(t.role, t.id).toBeTruthy();
      expect(t.icon, t.id).not.toBe('');
      expect(t.label, t.id).not.toBe('');
    }
  });

  it('gruppiert nach den drei Rollen aus Spec 21 §1 — lückenlos', () => {
    const grouped = [...targetsByRole('entity'), ...targetsByRole('lens'), ...targetsByRole('work')];
    expect(grouped.length).toBe(NAV_TARGETS.length);
  });

  it('führt die fünf Entitäten aus Spec 21 §1 (Archive sind kein eigenes Ziel)', () => {
    expect(ENTITY_TARGETS.map((t) => t.id)).toEqual(['person', 'family', 'source', 'place', 'hof']);
    expect(NAV_TARGETS.some((t) => (t.id as string) === 'repository')).toBe(false);
  });

  it('wirft bei einer unbekannten Id, statt still undefined zu liefern', () => {
    expect(() => navTargetById('gibtsnicht' as NavTargetId)).toThrow(/unbekanntes Ziel/);
  });
});

describe('Projektionen — keine Fläche führt eine eigene Ziel-Liste', () => {
  it('Bottom-Nav zieht Symbol und Beschriftung aus dem Register', () => {
    const items = bottomNavItems();
    expect(items.map((i) => i.id)).toEqual([...BOTTOM_NAV_SLOTS]);
    // 'more' ist der eine Slot ohne Register-Eintrag (Hub-Fläche, kein Ziel).
    for (const item of items.filter((i) => i.id !== 'more')) {
      const def = navTargetById(item.id as NavTargetId);
      expect(item.label).toBe(def.label);
      expect(item.icon).toBe(def.icon);
    }
  });

  it('Mehr-Hub zeigt ausschließlich Register-Ziele', () => {
    for (const id of MORE_HUB_ORDER) {
      expect(() => navTargetById(id)).not.toThrow();
    }
    expect(moreHubItems().map((t) => t.id)).toEqual([...MORE_HUB_ORDER]);
  });

  it('deckt jedes Ziel genau einmal ab: Bottom-Nav ODER Mehr-Hub ODER Entitäten-Segment', () => {
    // Der eigentliche Wächter dieser Datei. Ein neu ins Register aufgenommenes Ziel,
    // das in KEINER Projektion auftaucht, wäre auf Mobil unerreichbar — genau der
    // v8-Befund B1 (~11 Ziele, 6 Slots, mehrere davon ohne Nav-Button, Spec 21 §9).
    // Ein Ziel in ZWEI Projektionen wäre B2 (zwei Wege zum selben Ziel, gegen INV-UI-2).
    //
    // 'more' und 'person' zählen auf der Bottom-Nav-Seite NICHT mit: beide sind Türen,
    // keine Ziele. 'more' öffnet den Hub (dessen Inhalt über MORE_HUB_ORDER zählt),
    // 'person' öffnet die Entitäten-Fläche ("Personen ist der Einstieg in die
    // Entitäten", Spec 21 §2) — dasselbe Ziel wird dort über ENTITY_TARGETS gezählt,
    // nicht zweimal.
    const reachable = [
      ...BOTTOM_NAV_SLOTS.filter((s) => s !== 'more' && s !== 'person'),
      ...MORE_HUB_ORDER,
      ...ENTITY_TARGETS.map((t) => t.id),
    ];
    const counted = new Map<string, number>();
    for (const id of reachable) counted.set(id, (counted.get(id) ?? 0) + 1);

    for (const t of NAV_TARGETS) {
      expect(counted.get(t.id), `Ziel "${t.id}" ist auf Mobil nicht genau einmal erreichbar`).toBe(1);
    }
    expect(counted.size).toBe(NAV_TARGETS.length);
  });
});

describe('bottomNavSlotFor — die drei vormals verstreuten Zuordnungen', () => {
  it('Entitäts-Ziele hängen am Personen-Slot', () => {
    for (const t of ENTITY_TARGETS) expect(bottomNavSlotFor(t.id)).toBe('person');
  });

  it('Karte und Zeitleiste hängen am Baum-Slot (kein eigener Slot, Spec 21 §2)', () => {
    expect(bottomNavSlotFor('map')).toBe('tree');
    expect(bottomNavSlotFor('timeline')).toBe('tree');
    expect(bottomNavSlotFor('tree')).toBe('tree');
  });

  it('Hub-Ziele und der Hub selbst hängen am Mehr-Slot', () => {
    for (const id of ['file', 'stats', 'story', 'reports', 'settings', 'more'] as const) {
      expect(bottomNavSlotFor(id), id).toBe('more');
    }
  });

  it('Suche und Aufgaben sind ihr eigener Slot', () => {
    expect(bottomNavSlotFor('search')).toBe('search');
    expect(bottomNavSlotFor('tasks')).toBe('tasks');
  });

  it('liefert für JEDES Ziel einen existierenden Slot (kein Ziel ohne Aktiv-Markierung)', () => {
    for (const t of NAV_TARGETS) {
      expect(BOTTOM_NAV_SLOTS, t.id).toContain(bottomNavSlotFor(t.id));
    }
    expect(BOTTOM_NAV_SLOTS).toContain(bottomNavSlotFor('more'));
  });
});

describe('Route — eine Quelle für "welches Ziel ist offen"', () => {
  it('startet auf Personen (Spec 21 §2: Einstieg in die Entitäten)', () => {
    const route = createRoute();
    expect(route.target).toBe('person');
    expect(route.entityTarget).toBe('person');
  });

  it('übernimmt ein abweichendes Startziel', () => {
    const route = createRoute({ target: 'place' });
    expect(route.target).toBe('place');
    expect(route.entityTarget).toBe('place');
  });

  it('merkt sich das Entitäts-Segment über einen Ausflug in eine Lens hinweg', () => {
    const route = createRoute();
    route.setTarget('place');
    route.setTarget('tree');

    expect(route.target).toBe('tree');
    expect(route.entityTarget).toBe('place');

    route.openEntities();
    expect(route.target).toBe('place');
  });

  it('lässt das Entitäts-Segment von Nicht-Entitäts-Zielen unberührt', () => {
    const route = createRoute({ target: 'hof' });
    for (const id of ['map', 'timeline', 'search', 'tasks', 'more', 'stats'] as const) {
      route.setTarget(id);
      expect(route.entityTarget, id).toBe('hof');
    }
  });

  it('isEntityTarget trennt Ziele von der Hub-Fläche', () => {
    expect(isEntityTarget('place')).toBe(true);
    expect(isEntityTarget('more')).toBe(false);
    expect(isEntityTarget('tree')).toBe(false);
  });
});

// ADR-v9-102: dieselbe Merker-Frage wie oben, für die zwei Gruppen, die BL-90 übersehen
// hat. Wächter gegen den Rückfall in "der Slot springt stur auf seinen ersten Eintrag".
describe('Route — Lens-Merker (Baum/Karte/Zeitleiste teilen einen Slot)', () => {
  it('startet auf dem Baum', () => {
    expect(createRoute().lensTarget).toBe('tree');
  });

  it('merkt sich die zuletzt offene Lens über einen Ausflug in die Entitäten hinweg', () => {
    const route = createRoute();
    route.setTarget('map');
    route.setTarget('person');

    expect(route.lensTarget).toBe('map');

    // Das ist der eigentliche Nutzer-Befund: der Baum-Slot führte stur auf den Baum
    // zurück, ein Vor-/Zurückspringen zwischen zwei Ansichten war unmöglich.
    route.openLens();
    expect(route.target).toBe('map');
  });

  it('lässt den Lens-Merker von Nicht-Lens-Zielen unberührt', () => {
    const route = createRoute({ target: 'timeline' });
    for (const id of ['person', 'place', 'search', 'tasks', 'more', 'stats'] as const) {
      route.setTarget(id);
      expect(route.lensTarget, id).toBe('timeline');
    }
  });

  it('isLensTarget deckt genau die drei Umschalter-Lenses ab (nicht stats/story)', () => {
    expect(isLensTarget('tree')).toBe(true);
    expect(isLensTarget('map')).toBe(true);
    expect(isLensTarget('timeline')).toBe(true);
    expect(isLensTarget('stats')).toBe(false);
    expect(isLensTarget('story')).toBe(false);
    expect(isLensTarget('person')).toBe(false);
  });

  it('bottomNavSlotFor und der Lens-Merker meinen dieselbe Menge', () => {
    for (const id of LENS_SLOT_TARGETS) {
      expect(bottomNavSlotFor(id), id).toBe('tree');
    }
  });
});

describe('Route — Modus-Merker der beiden Diagramm-Lenses', () => {
  it('starten auf Orte bzw. Swim-Lane', () => {
    const route = createRoute();
    expect(route.mapMode).toBe('orte');
    expect(route.timelineMode).toBe('swim');
  });

  it('merken den Modus über einen Ausflug in ein anderes Ziel hinweg', () => {
    const route = createRoute({ target: 'map' });
    route.setMapMode('person');
    route.setTimelineMode('decade');
    route.setTarget('person');
    route.setTarget('map');

    // Ohne diese Merker fiel die Karte auf "Orte" zurück und verdeckte damit ihre
    // erhaltene Personenauswahl (die es nur im Personen-Modus zu sehen gibt).
    expect(route.mapMode).toBe('person');
    expect(route.timelineMode).toBe('decade');
  });
});

describe('Route — Segment-Merker der Aufgaben-/Forschungsfläche', () => {
  it('startet auf "Aufgaben"', () => {
    expect(createRoute().researchTarget).toBe('tasks');
  });

  it('merkt sich das Segment über einen Ausflug in ein anderes Ziel hinweg', () => {
    const route = createRoute({ target: 'tasks' });
    route.setResearchTarget('hypotheses');
    route.setTarget('person');
    route.setTarget('tasks');

    expect(route.researchTarget).toBe('hypotheses');
  });
});
