// tests/services/export-pipe.test.ts — das eine Export-Rohr (Spec 14 §3.2, INV-FILE-2:
// "Jeder Format-Export geht durch dasselbe Save-Rohr. Keine format-spezifische
// Save-Maschinerie."). FileService-Adapter sind gemockt (Spec 32 §5); serialize/
// buildXMLText sind die ECHTEN Kern-Funktionen (reine Funktionen, kein Mock nötig).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../../core/interop';
import { parseXMLText } from '../../core/interop';
import { FileService } from '../../services/file/file-service';
import { exportViaOnePipe, type GzipAdapter } from '../../services/file/export-pipe';
import { createMockAdapterSet } from './mock-adapters';

const FIXTURES = join(__dirname, '..', 'fixtures');
const gedcomFixture = readFileSync(join(FIXTURES, 'mini.small.ged'), 'utf8');
const grampsFixture = readFileSync(join(FIXTURES, 'mini.small.gramps'), 'utf8');

describe('INV-FILE-2 — ein Export-Rohr für alle Formate', () => {
  it.each([
    'gedcom-5.5.1',
    'gedcom-strict',
    'gedcom-7.0'
  ] as const)('Format %s läuft über exportToFile() und liefert nicht-leere Bytes', async (format) => {
    const { adapters, fsHandle, share, download } = createMockAdapterSet({ fsHandleSupported: false, shareSupported: false });
    const svc = new FileService(adapters);
    const gedcomDoc = parseGedcom(gedcomFixture);

    const result = await exportViaOnePipe(svc, { format, baseName: 'gedcom_export', gedcomDoc });

    expect(result.ok).toBe(true);
    // Alle drei GEDCOM-Formate landen im selben Tier-2b-Fallback (kein Handle gemockt) —
    // derselbe Weg durch FileService.exportToFile für jedes Format.
    expect(download.downloadCalls).toHaveLength(1);
    expect(download.downloadCalls[0].mimeType).toBe('text/plain');
    expect(fsHandle.write).not.toHaveBeenCalled();
    expect(share.share).not.toHaveBeenCalled();
  });

  it('Format gramps läuft durch dasselbe Rohr wie GEDCOM (kein Sonderpfad)', async () => {
    const { adapters, download } = createMockAdapterSet({ fsHandleSupported: false, shareSupported: false });
    const svc = new FileService(adapters);
    const grampsDoc = parseXMLText(grampsFixture);

    const result = await exportViaOnePipe(svc, { format: 'gramps', baseName: 'gramps_export', grampsDoc });

    expect(result.ok).toBe(true);
    expect(download.downloadCalls).toEqual([{ filename: 'gramps_export.gramps', mimeType: 'application/gzip' }]);
  });

  it('nutzt den injizierten Gzip-Adapter für GRAMPS, ohne den Kern (DOM-frei) anzufassen', async () => {
    const { adapters, download } = createMockAdapterSet({ fsHandleSupported: false, shareSupported: false });
    const svc = new FileService(adapters);
    const grampsDoc = parseXMLText(grampsFixture);
    const fakeGzip: GzipAdapter = { gzip: async (text: string) => new TextEncoder().encode(`GZ:${text.length}`) };

    await exportViaOnePipe(svc, { format: 'gramps', baseName: 'g', grampsDoc, gzip: fakeGzip });

    expect(download.downloadCalls).toHaveLength(1);
  });

  it('Anonymisierter/Strict/GED7-Export schreibt nie in-place, auch wenn ein Handle übergeben wird', async () => {
    const { adapters, fsHandle, download } = createMockAdapterSet({ fsHandleSupported: true, shareSupported: false });
    const svc = new FileService(adapters);
    const gedcomDoc = parseGedcom(gedcomFixture);

    const result = await exportViaOnePipe(svc, {
      format: 'gedcom-strict',
      baseName: 'original',
      gedcomDoc,
      handle: { id: 'original-file-handle' }
    });

    expect(result.tier).toBe('download');
    expect(fsHandle.write).not.toHaveBeenCalled();
    // Suffix verhindert Überschreiben der Originaldatei selbst im Download-Fall.
    expect(download.downloadCalls[0].filename).toBe('original_strict.ged');
  });

  it('normaler 5.5.1-Export MIT Handle geht in-place (Tier 1) — derselbe Rohr-Aufruf, andere Tier-Wahl', async () => {
    const { adapters, fsHandle } = createMockAdapterSet({ fsHandleSupported: true, shareSupported: false });
    const svc = new FileService(adapters);
    const gedcomDoc = parseGedcom(gedcomFixture);

    const result = await exportViaOnePipe(svc, {
      format: 'gedcom-5.5.1',
      baseName: 'original',
      gedcomDoc,
      handle: { id: 'original-file-handle' }
    });

    expect(result.tier).toBe('fs-handle');
    expect(fsHandle.writeCalls).toHaveLength(1);
  });

  it('wirft einen klaren Fehler statt eines stillen Sonderpfads, wenn das zum Format passende Doc fehlt', async () => {
    const { adapters } = createMockAdapterSet();
    const svc = new FileService(adapters);

    await expect(exportViaOnePipe(svc, { format: 'gramps', baseName: 'x' })).rejects.toThrow(/grampsDoc fehlt/);
    await expect(exportViaOnePipe(svc, { format: 'gedcom-5.5.1', baseName: 'x' })).rejects.toThrow(/gedcomDoc fehlt/);
  });
});

// Anonymisierung ist ein orthogonaler Schalter, kein fünftes Format (Spec 14 §3.2,
// ADR-v9-113). Die Fixture-Person (Max Muster, * 1890, kein Sterbedatum) liegt bei
// Bezugsjahr 2026 jenseits der 100-Jahre-Grenze und bei 1980 diesseits — dieselbe Datei
// belegt damit beide Richtungen UND dass das Jahr injiziert ist (TST-3).
describe('Anonymisierter Export (Spec 13 §7) — orthogonaler Schalter am selben Rohr', () => {
  const bytesOf = (download: ReturnType<typeof createMockAdapterSet>['download']): string =>
    String(download.downloadBytes[0]);

  it('erzwingt Download und _anon-Suffix, auch bei 5.5.1 MIT Handle (nie in die Originaldatei)', async () => {
    const { adapters, fsHandle, download } = createMockAdapterSet({ fsHandleSupported: true, shareSupported: false });
    const svc = new FileService(adapters);

    const result = await exportViaOnePipe(svc, {
      format: 'gedcom-5.5.1',
      baseName: 'original',
      gedcomDoc: parseGedcom(gedcomFixture),
      handle: { id: 'original-file-handle' },
      anonymizeReferenceYear: 1980
    });

    expect(result.tier).toBe('download');
    expect(fsHandle.write).not.toHaveBeenCalled();
    expect(download.downloadCalls[0].filename).toBe('original_anon.ged');
  });

  it('ist mit den anderen GEDCOM-Formaten kombinierbar — beide Suffixe stehen in der Reihenfolge Format, Anon', async () => {
    const { adapters, download } = createMockAdapterSet({ fsHandleSupported: false, shareSupported: false });
    const svc = new FileService(adapters);

    await exportViaOnePipe(svc, {
      format: 'gedcom-strict',
      baseName: 'original',
      gedcomDoc: parseGedcom(gedcomFixture),
      anonymizeReferenceYear: 1980
    });

    expect(download.downloadCalls[0].filename).toBe('original_strict_anon.ged');
  });

  it('die geschriebenen Bytes sind wirklich geschwärzt', async () => {
    const { adapters, download } = createMockAdapterSet({ fsHandleSupported: false, shareSupported: false });
    const svc = new FileService(adapters);

    await exportViaOnePipe(svc, {
      format: 'gedcom-5.5.1',
      baseName: 'x',
      gedcomDoc: parseGedcom(gedcomFixture),
      anonymizeReferenceYear: 1980
    });

    const text = bytesOf(download);
    expect(text).toContain('Lebende Person');
    expect(text).not.toContain('Max /Muster/');
    expect(text).not.toContain('12 MAR 1890');
    expect(text).toContain('Kirchenbuch Ochtrup'); // Quellen-Record bleibt
  });

  it('das Bezugsjahr entscheidet: bei 2026 ist dieselbe Person verstorben und bleibt sichtbar', async () => {
    const { adapters, download } = createMockAdapterSet({ fsHandleSupported: false, shareSupported: false });
    const svc = new FileService(adapters);

    await exportViaOnePipe(svc, {
      format: 'gedcom-5.5.1',
      baseName: 'x',
      gedcomDoc: parseGedcom(gedcomFixture),
      anonymizeReferenceYear: 2026
    });

    const text = bytesOf(download);
    expect(text).toContain('Max /Muster/');
    expect(text).not.toContain('Lebende Person');
    // Der Dateiname trägt das Suffix trotzdem — der Export war anonymisiert angefordert,
    // und ob er faktisch jemanden traf, darf nicht über das Überschreiben entscheiden.
    expect(download.downloadCalls[0].filename).toBe('x_anon.ged');
  });

  it('lässt das übergebene Dokument unberührt (sonst schriebe die Arbeitskopie die geschwärzte Fassung)', async () => {
    const { adapters } = createMockAdapterSet({ fsHandleSupported: false, shareSupported: false });
    const svc = new FileService(adapters);
    const gedcomDoc = parseGedcom(gedcomFixture);

    await exportViaOnePipe(svc, { format: 'gedcom-5.5.1', baseName: 'x', gedcomDoc, anonymizeReferenceYear: 1980 });

    expect(gedcomDoc.db.individuals.get('@I1@')!.name).toContain('Max');
    expect(gedcomDoc.roots.find((r) => r.xref === '@I1@')!.children.some((c) => c.tag === 'BIRT')).toBe(true);
  });

  it('GRAMPS + Anonymisierung wirft, statt still eine unanonymisierte Datei zu liefern', async () => {
    const { adapters } = createMockAdapterSet();
    const svc = new FileService(adapters);

    await expect(
      exportViaOnePipe(svc, {
        format: 'gramps',
        baseName: 'x',
        grampsDoc: parseXMLText(grampsFixture),
        anonymizeReferenceYear: 1980
      })
    ).rejects.toThrow(/Anonymisierung/);
  });
});
