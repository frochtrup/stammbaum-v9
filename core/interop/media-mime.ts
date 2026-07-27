// core/interop/media-mime.ts — Medien-Format-Kanonisierung an der Formatgrenze (ADR-v9-126).
//
// Narrow-Waist: das Modell hält `Media.form` EINHEITLICH als MIME (Standard in GEDCOM 7.0
// und GRAMPS). Beim Parsen (Input) wird die GEDCOM-5.5.1-Endung → MIME kanonisiert; GRAMPS
// liefert bereits MIME. Beim GEDCOM-Schreiben (Output) wird MIME → Endung zurückübersetzt —
// bevorzugt aus dem echten Dateinamen (verlustfrei, erhält z. B. `BMP`/`jpeg`), sonst über
// die Tabelle. Reine Funktionen, DOM-/Plattform-frei (INV-ARCH-1).

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  tif: 'image/tiff', tiff: 'image/tiff', bmp: 'image/bmp', webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf', txt: 'text/plain', htm: 'text/html', html: 'text/html',
  mp3: 'audio/mpeg', wav: 'audio/x-wav', mp4: 'video/mp4', mov: 'video/quicktime',
};

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/tiff': 'tif',
  'image/bmp': 'bmp', 'image/webp': 'webp', 'image/svg+xml': 'svg',
  'application/pdf': 'pdf', 'text/plain': 'txt',
  'text/html': 'html', 'audio/mpeg': 'mp3', 'audio/x-wav': 'wav', 'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

/** Endung eines Dateipfads (nach dem letzten `.`), '' wenn keine. */
function extOf(file: string): string {
  const base = file.split(/[\\/]/).pop() ?? '';
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i + 1) : '';
}

/**
 * FORM-Wert (Input) → kanonisches MIME. Bereits-MIME (enthält `/`) bleibt; sonst über den
 * FORM-Wert als Endung, ersatzweise die Datei-Endung; unbekannt → `application/octet-stream`.
 * Leerer FORM-Wert bleibt leer (kein „Erfinden" eines Formats — Fidelity/TST-6).
 */
export function formToMime(form: string, file: string): string {
  const f = form.trim();
  if (f === '') return '';
  if (f.includes('/')) return f;
  const key = f.toLowerCase();
  if (EXT_TO_MIME[key]) return EXT_TO_MIME[key];
  const ext = extOf(file).toLowerCase();
  return EXT_TO_MIME[ext] ?? 'application/octet-stream';
}

/**
 * Kanonisches MIME (Modell) → GEDCOM-5.5.1-FORM-Wert (Output). Bevorzugt die **echte
 * Datei-Endung** (verlustfrei, erhält die Original-Schreibweise), sonst die MIME→Endung-
 * Tabelle, sonst der MIME-Subtyp. Leeres MIME bleibt leer.
 */
export function mimeToGedForm(mime: string, file: string): string {
  const m = mime.trim();
  if (m === '') return '';
  const ext = extOf(file);
  if (ext) return ext;
  if (MIME_TO_EXT[m.toLowerCase()]) return MIME_TO_EXT[m.toLowerCase()];
  const slash = m.indexOf('/');
  return slash >= 0 ? m.slice(slash + 1) : m;
}
