// ui/shell/onboarding-model.ts — der Erstnutzer-Rundgang als reine Funktionen
// (Spec 20 §1.1, Spec 21 §2, BL-213, ADR-v9-190).
//
// WARUM NICHT DIE v8-FORM: das Orakel (`legacy-v8/ui-onboarding.js`) trägt eine
// handgeschriebene Liste aus `targetId` + Titel + Text — vier fest verdrahtete
// Element-Ids und vier Beschriftungen neben der Navigation. Zwei davon zeigen in v9
// ins Leere (`bnav-tree` gibt es nicht mehr, der Slot heißt „Ansichten" und führt auf
// die zuletzt offene Lens; das „☰ Menü oben rechts" wurde 2026-07-07 bewusst
// abgeschafft), und die Liste selbst wäre eine ZWEITE Navigationsquelle neben
// `nav-model.ts` — genau die Drift, die Altlast §10 benennt („Doku und Code driften:
// bnav-search vs. bnav-tasks") und die INV-UI-15 seit BL-90 ausschließt.
//
// Deshalb: die Schritte nennen ihre Ziele NICHT selbst, sondern lesen sie aus dem einen
// Register. Wird ein Segment umbenannt oder kommt eines dazu, ändert sich der Text des
// Rundgangs mit — ohne dass jemand daran denken muss. Was bleibt, ist der ANKER
// (`data-tour="…"`), und dass jeder Anker im echten UI existiert, hält ein Wächter fest
// (`tests/ui/onboarding-anchors.component.test.ts`).
//
// DOM-frei bis auf die Rechtecke — die Geometrie ist Arithmetik, kein Layout, und damit
// ohne Browser prüfbar (v8 rechnete sie inline zwischen `style.setProperty`-Aufrufen).
import { ENTITY_TARGETS, LENS_SLOT_TARGETS, MORE_SLOT, NAV_ROLE_LABELS, navTargetById } from './nav-model';

/** Die Stellen im UI, auf die der Rundgang zeigt. Jede trägt im Markup ein
 *  `data-tour="<id>"`; mehr Kopplung gibt es zwischen Rundgang und Fläche nicht. */
export type TourAnchor = 'list' | 'segments' | 'lens' | 'more';

export interface TourStep {
  anchor: TourAnchor;
  title: string;
  text: string;
}

/** „Familien, Quellen, Orte, Höfe und Medien" — aus dem Register, nicht abgeschrieben. */
function aufzaehlung(labels: readonly string[]): string {
  if (labels.length < 2) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} und ${labels[labels.length - 1]}`;
}

/**
 * Die vier Schritte. Reihenfolge folgt dem, was ein Erstnutzer nacheinander braucht:
 * was sehe ich · was gibt es noch · wie sieht es anders aus · wie kommen MEINE Daten
 * herein. Das ist die Absicht des v8-Rundgangs; die Ziele sind die von v9.
 */
export function tourSteps(): TourStep[] {
  const weitereEntitaeten = ENTITY_TARGETS.filter((t) => t.id !== 'person').map((t) => t.label);
  const lenses = LENS_SLOT_TARGETS.map((id) => navTargetById(id).label);
  return [
    {
      anchor: 'list',
      title: 'Die Liste',
      text: 'Hier stehen alle Personen des geladenen Bestands. Ein Tipp auf einen Namen öffnet den Steckbrief.',
    },
    {
      anchor: 'segments',
      title: 'Nicht nur Personen',
      text: `Dieselbe Fläche trägt auch ${aufzaehlung(weitereEntitaeten)} — die Reihe darüber schaltet um.`,
    },
    {
      anchor: 'lens',
      title: NAV_ROLE_LABELS.lens,
      text: `${aufzaehlung(lenses)} zeigen denselben Bestand aus einem anderen Blickwinkel.`,
    },
    {
      anchor: 'more',
      title: 'Eigene Daten',
      text: `Unter „${MORE_SLOT.label} → ${navTargetById('file').label}" lädst du deine eigene GEDCOM- oder GRAMPS-Datei. Die Demo-Daten bleiben unberührt.`,
    },
  ];
}

/** „Schritt 2 von 4" — die Fortschrittsanzeige aus dem v8-Rundgang, die bleibt. */
export function stepLabel(index: number, total: number): string {
  return `Schritt ${index + 1} von ${total}`;
}

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** Abstand zwischen Ziel-Element und Loch-Rand (v8: `_OB_PAD`). */
export const HOLE_PAD = 8;

/**
 * Das freigestellte Rechteck um ein Ziel-Element, auf den sichtbaren Bereich begrenzt.
 * `null`, wenn das Ziel keine Fläche hat (nicht gerendert, ausgeblendet) — dann zeigt
 * der Rundgang nur die Karte, wie in v8.
 *
 * Das Loch selbst entsteht später mit EINEM Element (`box-shadow` nach außen) statt mit
 * vier Streifen wie in v8: dieselbe Wirkung, ein Viertel der Rechnung und keine vier
 * Elemente, die einzeln falsch stehen können.
 */
export function spotlightHole(target: Box, viewport: Viewport, pad = HOLE_PAD): Box | null {
  if (target.width <= 0 || target.height <= 0) return null;
  const left = Math.max(0, target.left - pad);
  const top = Math.max(0, target.top - pad);
  const right = Math.min(viewport.width, target.left + target.width + pad);
  const bottom = Math.min(viewport.height, target.top + target.height + pad);
  if (right <= left || bottom <= top) return null;
  return { top, left, width: right - left, height: bottom - top };
}

/**
 * Wohin die Erklär-Karte gehört: unter das Loch, wenn sie dort ganz hineinpasst, sonst
 * darüber; passt sie nirgends, klebt sie am oberen Rand. Ohne Loch steht sie mittig.
 *
 * `null` bedeutet „mittig" — die Komponente zentriert dann per CSS statt mit gerechneten
 * Koordinaten (v8 setzte dafür `top/left: 50%` + `transform` von Hand).
 */
export function cardPosition(
  hole: Box | null,
  viewport: Viewport,
  card: { width: number; height: number },
  opts: { gap?: number; margin?: number; bottomInset?: number } = {},
): { top: number; left: number } | null {
  if (!hole) return null;
  const { gap = 12, margin = 8, bottomInset = 0 } = opts;
  const unten = hole.top + hole.height + gap;
  const oben = hole.top - card.height - gap;
  const untenPasst = unten + card.height <= viewport.height - bottomInset - margin;
  const obenPasst = oben >= margin;

  // Passt sie nirgends daneben (bildschirmhohes Ziel wie die Liste), MUSS sie überlappen
  // — dann unten andocken, nicht oben. Oben stehen die tragenden Teile: Kopfzeile und
  // Segment-Umschalter, und ausgerechnet der ist das Ziel des nächsten Schritts. Bei der
  // eigenen Verifikation lag die Karte genau darüber (BL-213).
  let top: number;
  if (untenPasst) top = unten;
  else if (obenPasst) top = oben;
  else top = viewport.height - bottomInset - card.height - margin;
  if (top < margin) top = margin;

  const left = Math.max(margin, Math.min(hole.left, viewport.width - card.width - margin));
  return { top, left };
}
