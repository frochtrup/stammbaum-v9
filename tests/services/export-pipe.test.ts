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
