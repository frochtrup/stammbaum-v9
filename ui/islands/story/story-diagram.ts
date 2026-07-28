// ui/islands/story/story-diagram.ts — kompaktes Inline-Diagramm des Story-Modus (BL-188,
// Spec 20 §1.10). Reine Funktion db+StoryDoc → SVG-String (wie story-map-svg.ts: EIN
// Renderweg für Live-Lens und Download). Nutzt die GLEICHE Traversierung wie die Baum-Insel
// (`tree-model`: getParentIds/getSpouseFamilies) — kein zweiter Rechenweg (Orakel:
// `legacy-v8/ui-story-person.js::_sectionDiagram`, `ui-story-fam.js::_famSectionDiagram`).
//
// Bewusste v9-Vereinfachung ggü. Orakel: drei Reihen (Eltern · Proband+Partner · Kinder)
// statt zusätzlich der Großeltern — ein kompakter Familien-Schnappschuss im Lesefluss; der
// vollständige Baum ist die Baum-Lens (INV-UI-3), aus der Story per Lens-Umschalter erreichbar.
import type { Database, Person, PersonId } from '../../../core/model/types';
import { getParentIds, getSpouseFamilies } from '../tree/tree-model';
import { eventYearLabel } from '../../shell/person-display';

/** Subjekt-Bezug des Diagramms (Teilmenge von StoryDoc; inline gehalten, um einen
 *  Modul-Zyklus story-model ↔ story-diagram zu vermeiden). */
export interface StoryDiagramRef {
  subject: 'person' | 'family';
  id: string;
}

const CW = 128; // Kartenbreite
const CH = 44; // Kartenhöhe
const HG = 16; // horizontaler Abstand
const VG = 46; // vertikaler Abstand
const M = 14; // Rand
const MAX_KIDS = 6;

const COL_BG = '#eef3f6';
const COL_CARD = '#ffffff';
const COL_BORDER = '#c0a878';
const COL_MAIN = '#c8a24a';
const COL_M = '#5b8fd4';
const COL_F = '#c47a9f';
const COL_TEXT = '#2a1d08';
const COL_DIM = '#7a6a50';

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

function yearsOf(p: Person): string {
  const by = eventYearLabel(p.birth) || eventYearLabel(p.chr);
  const dy = eventYearLabel(p.death) || eventYearLabel(p.buri);
  return by && dy ? `*${by} †${dy}` : by ? `*${by}` : dy ? `†${dy}` : '';
}

interface Card {
  person: Person | null;
  x: number;
  y: number;
  main?: boolean;
}

function cardSvg(c: Card): string {
  if (!c.person) return '';
  const p = c.person;
  const stroke = c.main ? COL_MAIN : p.sex === 'M' ? COL_M : p.sex === 'F' ? COL_F : COL_BORDER;
  const sw = c.main ? 2.5 : 1.5;
  // Kompakte Karte: nur der Vorname (Fallback Nachname), auf Kartenbreite gekürzt — wie das
  // v8-Orakel (`given.substring(0,14)`); der volle Name steht im Erzähltext daneben.
  const name = (p.given || p.surname || p.name || p.id).slice(0, 15);
  const years = yearsOf(p);
  const cx = c.x + CW / 2;
  return (
    `<g data-person-id="${esc(p.id)}" style="cursor:pointer">` +
    `<rect x="${c.x}" y="${c.y}" width="${CW}" height="${CH}" rx="6" fill="${COL_CARD}" stroke="${stroke}" stroke-width="${sw}"/>` +
    `<text x="${cx}" y="${c.y + 18}" text-anchor="middle" font-size="12" font-weight="700" fill="${COL_TEXT}" font-family="Georgia, serif">${esc(name)}</text>` +
    (years ? `<text x="${cx}" y="${c.y + 34}" text-anchor="middle" font-size="10" fill="${COL_DIM}" font-family="Georgia, serif">${esc(years)}</text>` : '') +
    `</g>`
  );
}

function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${COL_BORDER}" stroke-width="1.5"/>`;
}

function centerRow(persons: (Person | null)[], y: number, contentW: number): Card[] {
  const n = persons.length;
  const rowW = n * CW + (n - 1) * HG;
  const startX = M + Math.max(0, (contentW - rowW) / 2);
  return persons.map((person, i) => ({ person, x: startX + i * (CW + HG), y }));
}

/** Kinder (sortiert nach Geburtsjahr), auf MAX_KIDS begrenzt (+N-Überlauf als Text). */
function kidCards(db: Database, kidIds: PersonId[], y: number, contentW: number): { cards: Card[]; overflow: number } {
  const kids = kidIds
    .map((id) => db.individuals.get(id))
    .filter((p): p is Person => !!p)
    .sort((a, b) => (parseInt(eventYearLabel(a.birth) || eventYearLabel(a.chr) || '9999', 10)) - (parseInt(eventYearLabel(b.birth) || eventYearLabel(b.chr) || '9999', 10)));
  const shown = kids.slice(0, MAX_KIDS);
  return { cards: centerRow(shown, y, contentW), overflow: kids.length - shown.length };
}

function svgWrap(width: number, height: number, inner: string): string {
  return (
    `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Familien-Diagramm" class="story-diagram-svg" style="width:100%;height:auto;max-height:320px;background:${COL_BG};border:1px solid ${COL_BORDER};border-radius:6px">` +
    inner +
    `</svg>`
  );
}

function overflowText(n: number, y: number, contentW: number): string {
  if (n <= 0) return '';
  return `<text x="${M + contentW / 2}" y="${y + CH + 16}" text-anchor="middle" font-size="11" fill="${COL_DIM}" font-family="Georgia, serif">+${n} weitere</text>`;
}

/** Personen-Diagramm: Eltern · Proband+Partner · Kinder. */
function personDiagram(db: Database, personId: PersonId): string {
  const proband = db.individuals.get(personId);
  if (!proband) return '';
  const { father, mother } = getParentIds(db, personId);
  const parents = [father ? db.individuals.get(father) ?? null : null, mother ? db.individuals.get(mother) ?? null : null];
  const spouseFams = getSpouseFamilies(db, personId);
  const spouses = spouseFams.map((sf) => (sf.spouseId ? db.individuals.get(sf.spouseId) ?? null : null));
  const kidIds = spouseFams.flatMap((sf) => sf.children);

  const midRow: (Person | null)[] = [proband, ...spouses];
  const maxCols = Math.max(2, midRow.length, Math.min(kidIds.length, MAX_KIDS));
  const contentW = maxCols * CW + (maxCols - 1) * HG;
  const width = M + contentW + M;

  const hasParents = !!(father || mother);
  const hasKids = kidIds.length > 0;
  let y = M;
  const rows: string[] = [];
  const links: string[] = [];

  if (hasParents) {
    rows.push(...centerRow(parents, y, contentW).map(cardSvg));
    y += CH + VG;
  }
  const midCards = centerRow(midRow, y, contentW);
  const probandCard = midCards[0];
  rows.push(...midCards.map((c, i) => cardSvg({ ...c, main: i === 0 })));
  // Verbindung Eltern → Proband.
  if (hasParents) {
    const px = probandCard.x + CW / 2;
    links.push(line(px, y - VG + CH, px, y));
  }
  const kidY = y + CH + VG;
  if (hasKids) {
    const { cards, overflow } = kidCards(db, kidIds, kidY, contentW);
    rows.push(...cards.map(cardSvg));
    rows.push(overflowText(overflow, kidY, contentW));
    const px = probandCard.x + CW / 2;
    links.push(line(px, y + CH, px, kidY));
    y = kidY;
  }
  const height = y + CH + M;
  return svgWrap(width, height, links.join('') + rows.join(''));
}

/** Familien-Diagramm: Paar · Kinder. */
function familyDiagram(db: Database, familyId: string): string {
  const fam = db.families.get(familyId);
  if (!fam) return '';
  const husb = fam.husband ? db.individuals.get(fam.husband) ?? null : null;
  const wife = fam.wife ? db.individuals.get(fam.wife) ?? null : null;
  const couple = [husb, wife];
  const maxCols = Math.max(2, Math.min(fam.children.length, MAX_KIDS));
  const contentW = maxCols * CW + (maxCols - 1) * HG;
  const width = M + contentW + M;

  let y = M;
  const rows: string[] = [];
  const links: string[] = [];
  const coupleCards = centerRow(couple, y, contentW);
  rows.push(...coupleCards.map((c) => cardSvg({ ...c, main: true })));
  const midX = M + contentW / 2;
  const kidY = y + CH + VG;
  if (fam.children.length) {
    const { cards, overflow } = kidCards(db, fam.children, kidY, contentW);
    rows.push(...cards.map(cardSvg));
    rows.push(overflowText(overflow, kidY, contentW));
    links.push(line(midX, y + CH, midX, kidY));
    y = kidY;
  }
  const height = y + CH + M;
  return svgWrap(width, height, links.join('') + rows.join(''));
}

/** Story-Diagramm als SVG-String (Person oder Familie, je nach `doc.subject`). */
export function buildStoryDiagramSvg(db: Database, doc: StoryDiagramRef): string {
  return doc.subject === 'family' ? familyDiagram(db, doc.id) : personDiagram(db, doc.id);
}

/**
 * Hängt das Diagramm in `container` ein (Insel-Muster, Spec 02 §5) und verdrahtet den Klick
 * auf eine Karte (`data-person-id`) mit `onSelect` — die DOM-Berührung lebt hier in der
 * `.ts`-Insel, nicht in der `.svelte`-Komponente (svelte/no-dom-manipulating).
 */
export function mountStoryDiagram(
  container: HTMLElement,
  db: Database,
  doc: StoryDiagramRef,
  onSelect: (personId: string) => void,
): void {
  container.innerHTML = buildStoryDiagramSvg(db, doc);
  const svg = container.querySelector('svg');
  if (!svg) return;
  svg.addEventListener('click', (ev) => {
    const g = (ev.target as Element).closest('[data-person-id]');
    const id = g?.getAttribute('data-person-id');
    if (id) onSelect(id);
  });
}
