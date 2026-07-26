// tests/islands/diagram-export.test.ts — reiner Diagramm-Export-Renderer (BL-124,
// ADR-v9-123). Prüft die DOM-freie SVG-Erzeugung aus dem Layout-Modell (die PNG-
// Rasterung `svgToPngBlob` ist die einzige DOM-Berührung und wird im Browser verifiziert).
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson } from '../../core/model';
import { computeTreeLayout } from '../../ui/islands/tree/tree-layout';
import { computeDescendantLayout } from '../../ui/islands/tree/descendant-layout';
import { computeFanLayout } from '../../ui/islands/tree/fan-layout';
import { renderHourglassSvg, renderDescendantSvg, renderFanSvg, finalizeSvg } from '../../ui/islands/tree/diagram-export';
import type { CardRing } from '../../ui/islands/tree/tree-cards';
import { buildFourGenTree } from './tree-fixtures';

describe('diagram-export', () => {
  it('Sanduhr: Rümpfe enthalten Karten (rect), Konnektoren (line) und Namen (text)', () => {
    const db = buildFourGenTree();
    const layout = computeTreeLayout(db, 'I1', { portrait: false })!;
    const d = renderHourglassSvg(db, layout);
    expect(d.width).toBe(layout.width);
    expect(d.body).toContain('<rect');
    expect(d.body).toContain('<line');
    expect(d.body).toContain('<text');
    expect(d.body).toContain('Proband'); // Proband-Name
  });

  it('Nachkommen: Karten + T-Linien', () => {
    const db = buildFourGenTree();
    const layout = computeDescendantLayout(db, 'I1', { portrait: false })!;
    const d = renderDescendantSvg(db, layout);
    expect(d.body).toContain('<rect');
    expect(d.body).toContain('<line');
  });

  it('Fächer: Segment-Pfade + Proband-Kreis', () => {
    const db = buildFourGenTree();
    const layout = computeFanLayout(db, 'I1')!;
    const d = renderFanSvg(layout);
    expect(d.body).toContain('<path');
    expect(d.body).toContain('<circle');
  });

  it('Ring färbt den Kartenrahmen nach Schwere (BL-121-Übertrag)', () => {
    const db = buildFourGenTree();
    const layout = computeTreeLayout(db, 'I1', { portrait: false })!;
    const ring = new Map<string, CardRing>([['I1', { severity: 'warn', tooltip: 'x' }]]);
    const d = renderHourglassSvg(db, layout, ring);
    expect(d.body).toContain('#d9a441'); // warn-Farbe als Rahmen
  });

  it('escaped Sonderzeichen im Namen (kein XML-Bruch)', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'A & B', surname: '<X>' }));
    const layout = computeTreeLayout(db, '@I1@', { portrait: false })!;
    const d = renderHourglassSvg(db, layout);
    expect(d.body).toContain('&amp;');
    expect(d.body).not.toContain('<X>');
  });

  it('finalizeSvg: eigenständiges SVG mit viewBox + Hintergrund', () => {
    const db = buildFourGenTree();
    const layout = computeTreeLayout(db, 'I1', { portrait: false })!;
    const svg = finalizeSvg(renderHourglassSvg(db, layout));
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0');
    expect(svg).toContain('</svg>');
  });

  it('finalizeSvg({a1}): Großposter in mm', () => {
    const db = buildFourGenTree();
    const layout = computeTreeLayout(db, 'I1', { portrait: false })!;
    const svg = finalizeSvg(renderHourglassSvg(db, layout), { a1: true });
    expect(svg).toMatch(/width="\d+mm"/);
    expect(svg).toContain('preserveAspectRatio');
  });
});
