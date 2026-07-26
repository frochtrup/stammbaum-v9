// ui/islands/tree/diagram-export.ts — Diagramm-Export als eigenständiges SVG (Karten als
// `<rect>`+`<text>`, DOM-frei) und daraus PNG (BL-124, ADR-v9-123, Spec 20 §1.3 [E]).
//
// Reiner Renderer AUS dem Layout-Modell — NICHT aus dem Live-DOM: die Karten der Inseln
// sind HTML-`<div>`s über einem Linien-SVG, das Live-SVG zu serialisieren erfasste sie
// nicht. Aus demselben reinen Layout, das die Insel auch zeichnet (`computeTreeLayout`
// etc.), entsteht hier ein vollständiges, in sich geschlossenes SVG — zoom-unabhängig,
// theme-los (feste Farben, da CSS-Variablen ausserhalb der App nicht auflösen) und
// headless testbar. Die einzige DOM-Berührung ist `svgToPngBlob` (Canvas-Rasterung).
import type { Database, PersonId } from '../../../core/model/types';
import type { TreeLayoutResult } from './tree-layout';
import type { DescendantLayoutResult } from './descendant-layout';
import type { FanLayoutResult } from './fan-layout';
import type { CardRing } from './tree-cards';
import { displayNameOr } from '../../shell/person-display';

/** Feste Farbwerte (Spiegel der Dark-Theme-Tokens aus design-system.css — ein Poster ist
 *  ein festes Artefakt, CSS-Variablen lösen ausserhalb der App nicht auf). */
const C = {
  bg: '#18140f',
  card: '#211c14',
  center: '#2a2318',
  border: '#342c1e',
  gold: '#c8a84a',
  text: '#f2e8d4',
  dim: '#a0906e',
  sexM: '#4a80c8',
  sexF: '#c84a92',
  line: '#4a4030',
} as const;

const SEV_COLOR: Record<CardRing['severity'], string> = { info: C.gold, warn: '#d9a441', error: '#c04040' };

/** Zwischenform: fertiger SVG-Rumpf + Maße. Die Schale finalisiert daraus normal-/A1-SVG oder PNG. */
export interface DiagramSvg {
  width: number;
  height: number;
  body: string;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));
}

function rect(x: number, y: number, w: number, h: number, fill: string, stroke?: string, sw = 1, rx = 3): string {
  const s = stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : '';
  return `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="${rx}" fill="${fill}"${s}/>`;
}

function line(x1: number, y1: number, x2: number, y2: number, dashed = false): string {
  const d = dashed ? ' stroke-dasharray="4 3"' : '';
  return `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${C.line}" stroke-width="1.5"${d}/>`;
}

function text(t: string, x: number, y: number, size: number, fill: string, opts: { weight?: number; anchor?: string; rotate?: number } = {}): string {
  if (!t) return '';
  const w = opts.weight ? ` font-weight="${opts.weight}"` : '';
  const a = opts.anchor ?? 'middle';
  const rot = opts.rotate ? ` transform="rotate(${r1(opts.rotate)} ${r1(x)} ${r1(y)})"` : '';
  return `<text x="${r1(x)}" y="${r1(y)}" font-size="${size}" fill="${fill}" text-anchor="${a}" dominant-baseline="middle" font-family="system-ui,-apple-system,sans-serif"${w}${rot}>${esc(t)}</text>`;
}

function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Name auf die Kartenbreite kürzen (SVG-Text bricht/klippt nicht von selbst). */
function fit(name: string, width: number, size: number): string {
  const max = Math.max(3, Math.floor((width - 6) / (size * 0.55)));
  return name.length <= max ? name : name.slice(0, max - 1) + '…';
}

function years(db: Database, id: PersonId): string {
  const p = db.individuals.get(id);
  if (!p) return '';
  const by = (p.birth.date || '').match(/\d{4}/)?.[0];
  const dy = (p.death.date || '').match(/\d{4}/)?.[0];
  return [by ? `*${by}` : '', dy ? `†${dy}` : ''].filter(Boolean).join(' ');
}

/** Rechteck-Karte (Sanduhr/Nachkommen): Rahmen (Ring-/Zentrum-/Standardfarbe), Geschlechts-
 *  Akzent links, Name + Jahre. */
function cardSvg(
  db: Database,
  card: { id: PersonId | null; x: number; y: number; width: number; height: number; isCenter: boolean },
  ring: CardRing | undefined,
): string {
  const { x, y, width: w, height: h } = card;
  if (!card.id || !db.individuals.has(card.id)) {
    return rect(x, y, w, h, C.card, C.border, 1) + text('?', x + w / 2, y + h / 2, 12, C.dim);
  }
  const person = db.individuals.get(card.id)!;
  const stroke = ring ? SEV_COLOR[ring.severity] : card.isCenter ? C.gold : C.border;
  const sw = ring || card.isCenter ? 2 : 1;
  const parts = [rect(x, y, w, h, card.isCenter ? C.center : C.card, stroke, sw)];
  if (person.sex === 'M' || person.sex === 'F') parts.push(rect(x, y, 3, h, person.sex === 'M' ? C.sexM : C.sexF, undefined, 0, 0));
  const size = card.isCenter ? 11 : 9;
  const name = fit(displayNameOr(person, card.id), w, size);
  const yr = years(db, card.id);
  parts.push(text(name, x + w / 2, y + h / 2 - (yr ? 6 : 0), size, C.text, { weight: card.isCenter ? 700 : 400 }));
  if (yr) parts.push(text(yr, x + w / 2, y + h / 2 + 7, size - 1, C.dim));
  return parts.join('');
}

/** Sanduhr-Baum → SVG-Rumpf. */
export function renderHourglassSvg(db: Database, layout: TreeLayoutResult, ringByPerson?: ReadonlyMap<PersonId, CardRing>): DiagramSvg {
  const parts: string[] = [];
  for (const c of layout.connectors) parts.push(line(c.x1, c.y1, c.x2, c.y2, c.dashed));
  for (const card of layout.cards) parts.push(cardSvg(db, card, card.id ? ringByPerson?.get(card.id) : undefined));
  return { width: layout.width, height: layout.height, body: parts.join('') };
}

/** Nachkommen-Baum → SVG-Rumpf. */
export function renderDescendantSvg(db: Database, layout: DescendantLayoutResult, ringByPerson?: ReadonlyMap<PersonId, CardRing>): DiagramSvg {
  const parts: string[] = [];
  for (const c of layout.connectors) parts.push(line(c.x1, c.y1, c.x2, c.y2, false));
  for (const card of layout.cards) parts.push(cardSvg(db, card, card.id ? ringByPerson?.get(card.id) : undefined));
  return { width: layout.width, height: layout.height, body: parts.join('') };
}

/** Fächer-Diagramm → SVG-Rumpf. Das Fan-Layout trägt Pfade + platzierten/rotierten Text bereits. */
export function renderFanSvg(layout: FanLayoutResult): DiagramSvg {
  const parts: string[] = [];
  for (const seg of layout.segments) {
    const fill = seg.id ? (seg.sex === 'M' ? C.sexM : seg.sex === 'F' ? C.sexF : C.border) : C.card;
    parts.push(`<path d="${seg.d}" fill="${fill}" fill-opacity="${seg.id ? seg.fillOpacity : 0.5}" stroke="${C.bg}" stroke-width="1.5"/>`);
    for (const t of seg.texts) parts.push(text(t.text, t.x, t.y, t.fontSize, t.dim ? C.dim : C.text, { rotate: t.rotation }));
  }
  if (layout.proband) {
    const pr = layout.proband;
    parts.push(`<circle cx="${r1(pr.cx)}" cy="${r1(pr.cy)}" r="${pr.r}" fill="${pr.sex === 'M' ? C.sexM : pr.sex === 'F' ? C.sexF : C.border}" stroke="${C.bg}" stroke-width="2"/>`);
    if (pr.given) parts.push(text(pr.given, pr.cx, pr.cy - 6, 10, C.text, { weight: 600 }));
    if (pr.surname) parts.push(text(pr.surname, pr.cx, pr.cy + 7, 9, C.dim));
  }
  return { width: layout.width, height: layout.height, body: parts.join('') };
}

/** A1 hochkant/quer je nach Seitenverhältnis (594×841 mm). */
function a1Dimensions(w: number, h: number): { mmW: number; mmH: number } {
  return w >= h ? { mmW: 841, mmH: 594 } : { mmW: 594, mmH: 841 };
}

/** Fertiges, eigenständiges SVG-Dokument. `a1` → Großposter (mm-Maße, Inhalt zentriert eingepasst). */
export function finalizeSvg(d: DiagramSvg, opts: { a1?: boolean } = {}): string {
  const pad = 20;
  const w = d.width + pad * 2;
  const h = d.height + pad * 2;
  const sizeAttr = opts.a1
    ? (() => {
        const { mmW, mmH } = a1Dimensions(w, h);
        return `width="${mmW}mm" height="${mmH}mm" preserveAspectRatio="xMidYMid meet"`;
      })()
    : `width="${w}" height="${h}"`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ${sizeAttr} viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="${C.bg}"/>` +
    `<g transform="translate(${pad} ${pad})">${d.body}</g>` +
    `</svg>`
  );
}

/**
 * Rasterisiert ein SVG zu einem PNG-Blob (einzige DOM-Berührung dieser Datei — Canvas).
 * `targetWidth` skaliert das Ausgabebild (Default 2000 px für eine druckbare Auflösung).
 */
export function svgToPngBlob(svg: string, targetWidth = 2000): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      try {
        const scale = targetWidth / (img.width || targetWidth);
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = Math.max(1, Math.round((img.height || targetWidth) * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('kein 2D-Kontext');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob lieferte null'))), 'image/png');
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('SVG konnte nicht als Bild geladen werden'));
    };
    img.src = url;
  });
}
