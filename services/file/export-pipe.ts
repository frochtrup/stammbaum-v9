// services/file/export-pipe.ts — das eine Export-Rohr (Spec 14 §3.2, INV-FILE-2).
//
//   Modell → serialize(format) → Bytes → FileService.exportToFile()
//
// Format-Auswahl ('gedcom-5.5.1' | 'gedcom-strict' | 'gedcom-7.0' | 'gramps') entscheidet
// NUR, welche reine Kern-Funktion die Bytes erzeugt (core/interop) — serialize() ist dem
// Kern schon INV-FILE-2-konform gebaut, hier wird kein zweiter Pfad daneben eröffnet. Nach
// der Serialisierung läuft JEDER Format-Export durch dieselbe FileService.exportToFile().
//
// GRAMPS behandelt Bytes, nicht Text (Spec 14 §3.2): buildXMLText() liefert einen String;
// die Gzip-Hülle wird HIER (Plattform-Schicht) addiert, per injizierbarem Gzip-Adapter
// (kein DOM/CompressionStream-Zugriff im Kern, s. core/interop/gramps.ts Kommentarkopf).
//
// Anonymisierter/Strict/GED7-Export ist KEIN Sonderpfad (INV-FILE-2) — nur ein anderes
// `format` im selben Rohr. Er zwingt lediglich forceDownload/Suffix, damit nie in-place
// in die Originaldatei geschrieben wird (Spec 14 §4, letzter Punkt) — das ist Aufgabe des
// Aufrufers (dieser Datei), nicht der FileService-Tier-Logik.

import { serializeGedcom, buildXMLText } from '../../core/interop';
import type { ParsedGedcom, GedFormat } from '../../core/interop';
import type { GrampsParsed, XmlDocument } from '../../core/interop';
import type { FileService } from './file-service';
import type { SaveResult } from './types';

export type ExportFormat = 'gedcom-5.5.1' | 'gedcom-strict' | 'gedcom-7.0' | 'gramps';

const GED_FORMAT_BY_EXPORT: Record<Exclude<ExportFormat, 'gramps'>, GedFormat> = {
  'gedcom-5.5.1': '5.5.1',
  'gedcom-strict': 'strict',
  'gedcom-7.0': '7.0'
};

const SUFFIX_BY_EXPORT: Record<ExportFormat, string> = {
  'gedcom-5.5.1': '',
  'gedcom-strict': '_strict',
  'gedcom-7.0': '_ged7',
  gramps: ''
};

/** Injizierbare Gzip-Hülle für GRAMPS-Export (Plattform-Seam, kein Kern-Zugriff). */
export interface GzipAdapter {
  gzip(text: string): Promise<Uint8Array>;
}

export interface ExportRequest {
  format: ExportFormat;
  /** Basisdateiname OHNE Endung, z. B. "Meine Familie". */
  baseName: string;
  gedcomDoc?: ParsedGedcom;
  grampsDoc?: GrampsParsed | XmlDocument;
  /** Nur für in-place-fähige Formate (5.5.1) relevant; strict/ged7/gramps ignorieren handle. */
  handle?: unknown;
  gzip?: GzipAdapter;
}

function extensionFor(format: ExportFormat): string {
  return format === 'gramps' ? 'gramps' : 'ged';
}

function mimeTypeFor(format: ExportFormat): string {
  return format === 'gramps' ? 'application/gzip' : 'text/plain';
}

/**
 * Das eine Export-Rohr (INV-FILE-2). Serialisiert je nach `format` über den Kern und
 * reicht die entstandenen Bytes an EIN gemeinsames FileService.exportToFile() weiter.
 * Wirft, wenn das zum Format passende *Doc fehlt (Aufrufer-Fehler, kein Laufzeit-Rätsel).
 */
export async function exportViaOnePipe(fileService: FileService, req: ExportRequest): Promise<SaveResult> {
  const suffix = SUFFIX_BY_EXPORT[req.format];
  const filename = `${req.baseName}${suffix}.${extensionFor(req.format)}`;
  const isInPlaceCapable = req.format === 'gedcom-5.5.1';

  let bytes: string | Uint8Array;
  if (req.format === 'gramps') {
    if (!req.grampsDoc) throw new Error('exportViaOnePipe: grampsDoc fehlt für format="gramps"');
    const xmlText = buildXMLText(req.grampsDoc);
    bytes = req.gzip ? await req.gzip.gzip(xmlText) : xmlText;
  } else {
    if (!req.gedcomDoc) throw new Error(`exportViaOnePipe: gedcomDoc fehlt für format="${req.format}"`);
    bytes = serializeGedcom(req.gedcomDoc, { format: GED_FORMAT_BY_EXPORT[req.format] });
  }

  return fileService.exportToFile(bytes, filename, mimeTypeFor(req.format), {
    handle: isInPlaceCapable ? req.handle : undefined,
    forceDownload: !isInPlaceCapable
  });
}
