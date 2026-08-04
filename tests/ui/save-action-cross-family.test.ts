// tests/ui/save-action-cross-family.test.ts — BL-160 (6/6, ADR-v9-127): Export-Wiring
// „ein geladenes db in JEDES Format exportierbar, nicht mehr ans Quell-Doc gebunden".
//
// Headless-Gate (Definition of Done §1): der Cross-Family-Export-Pfad erzeugt aus einem
// geladenen `db` einen Ziel-Format-Text, der RE-PARST — beide Richtungen, an Klein-Fixtures
// (committet) + Realdaten (skipIf gitignored). Prüft Entitätszahlen (Personen/Familien/
// Quellen) im re-geparsten Ziel gegen die Quelle. `exportViaOnePipe`/FileService bleiben
// gemockt (Spec 32 §5) — nur der Adapter ist ein Fake, Kern-Synthese/-Parser laufen echt.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { exportCrossFamily, exportGedcom, formatFamily } from '../../ui/shell/save-action';
import { FileService } from '../../services/file/file-service';
import { CompressionStreamGzipCodec } from '../../services/file/gzip-codec';
import { parseGedcom, parseXMLText } from '../../core/interop';
import { createMockAdapterSet } from '../services/mock-adapters';

const FX = (n: string) => join(__dirname, '../fixtures', n);

describe('formatFamily — die eine Familien-Regel (BL-160)', () => {
  it('gedcom-5.5.1/strict/7.0 sind Familie "gedcom", gramps ist Familie "gramps"', () => {
    expect(formatFamily('gedcom-5.5.1')).toBe('gedcom');
    expect(formatFamily('gedcom-strict')).toBe('gedcom');
    expect(formatFamily('gedcom-7.0')).toBe('gedcom');
    expect(formatFamily('gramps')).toBe('gramps');
  });
});

describe('AppState.buildCrossFamilyDoc — Synthese direkt aus dem Modell', () => {
  it('liefert für targetFamily="gramps" einen XmlDocument-Vollbaum (GEDCOM-geladen)', () => {
    const appState = createAppState();
    const parsed = parseGedcom(readFileSync(FX('mini.small.ged'), 'utf8'));
    appState.loadDatabase(parsed.db, 'mini.ged', parsed.roots);

    const built = appState.buildCrossFamilyDoc('gramps');
    expect(built.gedcomDoc).toBeUndefined();
    expect(built.grampsDoc?.root.tag).toBe('database');
  });

  it('liefert für targetFamily="gedcom" ein ParsedGedcom-Doc (GRAMPS-geladen)', () => {
    const appState = createAppState();
    const parsed = parseXMLText(readFileSync(FX('mini.small.gramps'), 'utf8'));
    appState.loadGrampsDoc(parsed.db, 'mini.gramps', parsed.doc);

    const built = appState.buildCrossFamilyDoc('gedcom');
    expect(built.grampsDoc).toBeUndefined();
    expect(built.gedcomDoc?.roots.some((r) => r.tag === 'HEAD')).toBe(true);
    expect(built.gedcomDoc?.roots.some((r) => r.tag === 'TRLR')).toBe(true);
  });
});

describe('exportCrossFamily — native Passthrough-Projektion vs. Cross-Family-Synthese', () => {
  it('nativ (Format == geladenes Doc): nutzt buildGedcomDoc/buildGrampsDoc, nicht die Synthese', () => {
    const appState = createAppState();
    const parsed = parseGedcom(readFileSync(FX('mini.small.ged'), 'utf8'));
    appState.loadDatabase(parsed.db, 'mini.ged', parsed.roots);

    const { gedcomDoc, grampsDoc } = exportCrossFamily(appState, 'gedcom-5.5.1');
    expect(grampsDoc).toBeUndefined();
    // Der native Pfad projiziert in den GEHALTENEN Passthrough-Baum — die Rekord-Reihenfolge
    // bleibt die des Original-Dokuments (Fidelity), im Unterschied zur Cross-Synthese, die
    // IMMER einen frischen Baum baut (kein Bezug zu `roots`).
    expect(gedcomDoc?.roots.map((r) => r.tag)).toEqual(parsed.roots.map((r) => r.tag));
    expect(gedcomDoc?.db).toBe(appState.db);
  });

  it('cross (Format != geladenes Doc): nutzt buildCrossFamilyDoc, nicht buildGedcomDoc/buildGrampsDoc', () => {
    const appState = createAppState();
    const parsed = parseGedcom(readFileSync(FX('mini.small.ged'), 'utf8'));
    appState.loadDatabase(parsed.db, 'mini.ged', parsed.roots);

    const { gedcomDoc, grampsDoc } = exportCrossFamily(appState, 'gramps');
    expect(gedcomDoc).toBeUndefined();
    expect(grampsDoc).toBeDefined();
  });
});

// ── Der Rundlauf über die volle UI-Kommando-Funktion (exportGedcom) ────────────────────────
// Gemockte Adapter, ECHTER Gzip-Codec (CompressionStream, verfügbar in Node/Browser — keine
// zweite, selbstgebaute Kompression fürs Gate).
const gzip = new CompressionStreamGzipCodec();

async function exportAndReparseGramps(appState: ReturnType<typeof createAppState>) {
  const { adapters, download } = createMockAdapterSet({ fsHandleSupported: false, shareSupported: false });
  const fileService = new FileService(adapters);
  // exportGedcom nutzt intern den projekteigenen gzipCodec (services/file) — hier reicht
  // ein äquivalenter echter Codec zur Kontrolle des Gates (kein zweiter Mechanismus).
  const notice = await exportGedcom(appState, fileService, { format: 'gramps' });
  expect(notice.notice).not.toMatch(/fehlgeschlagen/);
  expect(download.downloadCalls).toHaveLength(1);
  expect(download.downloadCalls[0].filename.endsWith('.gramps')).toBe(true);
  const bytes = download.downloadBytes[0] as Uint8Array;
  const xml = await gzip.gunzip(bytes);
  return parseXMLText(xml);
}

async function exportAndReparseGedcom(appState: ReturnType<typeof createAppState>) {
  const { adapters, download } = createMockAdapterSet({ fsHandleSupported: false, shareSupported: false });
  const fileService = new FileService(adapters);
  const notice = await exportGedcom(appState, fileService, { format: 'gedcom-5.5.1' });
  expect(notice.notice).not.toMatch(/fehlgeschlagen/);
  expect(download.downloadCalls).toHaveLength(1);
  expect(download.downloadCalls[0].filename.endsWith('.ged')).toBe(true);
  const text = String(download.downloadBytes[0]);
  return parseGedcom(text);
}

describe('Cross-Family-Export-Rundlauf (Klein-Fixtures, DoD §1)', () => {
  it('GEDCOM-geladen (mini.small.ged) → GRAMPS-Export → re-parst mit gleicher Personen-/Quellenzahl', async () => {
    const appState = createAppState();
    const parsed = parseGedcom(readFileSync(FX('mini.small.ged'), 'utf8'));
    appState.loadDatabase(parsed.db, 'mini.ged', parsed.roots);

    const reparsed = await exportAndReparseGramps(appState);
    expect(reparsed.db.individuals.size).toBe(parsed.db.individuals.size);
    expect(reparsed.db.sources.size).toBe(parsed.db.sources.size);
  });

  it('GRAMPS-geladen (mini.small.gramps) → GEDCOM-Export → re-parst mit gleicher Personen-/Quellenzahl', async () => {
    const appState = createAppState();
    const parsed = parseXMLText(readFileSync(FX('mini.small.gramps'), 'utf8'));
    appState.loadGrampsDoc(parsed.db, 'mini.gramps', parsed.doc);

    const reparsed = await exportAndReparseGedcom(appState);
    expect(reparsed.db.individuals.size).toBe(parsed.db.individuals.size);
    expect(reparsed.db.sources.size).toBe(parsed.db.sources.size);
  });
});

const ANCESTRIS = FX('MeineDaten_ancestris.ged');
const FAMILIE = FX('Unsere Familie.gramps');
const hasReal = existsSync(ANCESTRIS) && existsSync(FAMILIE);

describe.skipIf(!hasReal)('Cross-Family-Export-Rundlauf (Realdaten, DoD §1)', () => {
  it('GEDCOM-geladen (MeineDaten_ancestris.ged, ~2795 Pers.) → GRAMPS-Export → re-parst verlustfrei (Bulk)', async () => {
    const appState = createAppState();
    const parsed = parseGedcom(readFileSync(ANCESTRIS, 'latin1'));
    appState.loadDatabase(parsed.db, 'MeineDaten_ancestris.ged', parsed.roots);

    const reparsed = await exportAndReparseGramps(appState);
    expect(reparsed.db.individuals.size).toBe(parsed.db.individuals.size);
    expect(reparsed.db.families.size).toBe(parsed.db.families.size);
    expect(reparsed.db.sources.size).toBe(parsed.db.sources.size);
  }, 20000);

  it('GRAMPS-geladen (Unsere Familie.gramps, ~2894 Pers.) → GEDCOM-Export → re-parst verlustfrei (Bulk)', async () => {
    let buf = readFileSync(FAMILIE);
    if (buf[0] === 0x1f && buf[1] === 0x8b) buf = Buffer.from(gunzipSync(buf));
    const parsed = parseXMLText(buf.toString('utf8'));
    const appState = createAppState();
    appState.loadGrampsDoc(parsed.db, 'Unsere Familie.gramps', parsed.doc);

    const reparsed = await exportAndReparseGedcom(appState);
    expect(reparsed.db.individuals.size).toBe(parsed.db.individuals.size);
    expect(reparsed.db.families.size).toBe(parsed.db.families.size);
    expect(reparsed.db.sources.size).toBe(parsed.db.sources.size);
  }, 20000);
});
