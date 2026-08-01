// core/model/media-kind.ts — WAS trägt `Media.file` eigentlich? (Spec 10 §4, Spec 14 §7,
// ADR-v9-187). Rein, framework-frei, DOM-frei (INV-ARCH-1).
//
// Der Grund für diesen Chokepoint ist gemessen, nicht ästhetisch: am Realbestand
// (`Testdateien/Unsere Familie 2026.ged`, 3180 Personen) sind von 2198 `FILE`-Werten
// **1968 Weblinks** (452 verschiedene, 1957 davon an Zitaten — Online-Fundorte wie
// matricula/archion), **228 relative Dateipfade** (189 verschiedene) und **0 `data:`-URIs**.
// Ein Feld, drei völlig verschiedene Dinge. Vor ADR-v9-187 entschied jede Anzeigestelle
// selbst, was sie damit anfängt — mit dem Ergebnis, dass derselbe String an der
// Quellen-Pille ein klickbares ↗ war und in der Medienverwaltung tote Zeichenkette.
//
// Was hier NICHT passiert: auflösen. Ob eine Datei tatsächlich auffindbar ist, weiß erst
// der Auflösungsdienst in `services/media` (der braucht Plattform-APIs und darf deshalb
// nicht hier liegen). Diese Datei beantwortet nur die Frage nach der FORM des Werts.
import { formToMime, mimeFromFileName } from '../interop/media-mime';

/**
 * Form des `Media.file`-Werts:
 * - `embedded` — `data:`-URI, trägt die Bytes selbst (direkt anzeigbar, CSP `img-src data:`)
 * - `weblink`  — `http(s):`-Adresse; wird VERLINKT, nie geladen (lokal-first LP-2 + CSP;
 *                ein Galerie-Aufruf löste sonst tausende Anfragen an fremde Archive aus)
 * - `file`     — relativer (oder absoluter) Pfad; auflösbar nur über den Medien-Ordner
 * - `empty`    — kein Wert; das Medium ist eine Hülle ohne Datei
 */
export type MediaFileKind = 'embedded' | 'weblink' | 'file' | 'empty';

const DATA_RE = /^data:/i;
const HTTP_RE = /^https?:\/\//i;

/** Die eine Klassifikation. Jede Anzeigestelle liest sie, keine entscheidet selbst. */
export function classifyMediaFile(file: string): MediaFileKind {
  const f = file.trim();
  if (f === '') return 'empty';
  if (DATA_RE.test(f)) return 'embedded';
  if (HTTP_RE.test(f)) return 'weblink';
  return 'file';
}

/** Kurzform für den häufigsten Zweig — auch die Quellen-Pille fragt so (INV-UI-4). */
export function isWebLink(file: string): boolean {
  return HTTP_RE.test(file.trim());
}

/**
 * Host einer Weblink-Adresse als Kurztext („data.matricula-online.eu"), '' wenn der Wert
 * kein Weblink oder nicht parsbar ist. `URL` ist WHATWG-Standard und in Node wie im Browser
 * global verfügbar — keine DOM-API, damit im Kern zulässig (INV-ARCH-1/-2).
 */
export function webLinkHost(file: string): string {
  const f = file.trim();
  if (!HTTP_RE.test(f)) return '';
  try {
    return new URL(f).host;
  } catch {
    return '';
  }
}

/**
 * Sprechende Kurzbezeichnung eines Weblinks, wenn das Medium keinen eigenen Titel trägt
 * (bei der 5.5.1-Inline-Altform der Regelfall). '' wenn der Wert kein Weblink ist.
 *
 * Der naheliegende „Basisname" versagt hier: bei
 * `…/muenster/KB001/?pg=10` ist das letzte Pfadstück leer und der Dateiname-Rückfall
 * liefert `?pg=10`. Am Realbestand hieß dadurch fast jede Weblink-Kachel `?pg=NN` —
 * 451 Kacheln, die sich nur durch eine Seitenzahl unterscheiden. Deshalb: letztes
 * NICHT-leeres Pfadstück (das Buch/Register) plus die Seitenangabe, sonst der Host.
 */
export function webLinkLabel(file: string): string {
  const f = file.trim();
  if (!HTTP_RE.test(f)) return '';
  try {
    const u = new URL(f);
    const seg = u.pathname.split('/').filter(Boolean).pop() ?? '';
    const name = seg ? decodeURIComponent(seg) : u.host;
    return u.search ? `${name} ${u.search}` : name;
  } catch {
    return '';
  }
}

/**
 * Wie das Medium DARGESTELLT wird, sobald seine Bytes vorliegen: als Bild oder als
 * Dokument. Entschieden über das kanonische MIME (`Media.form`, seit ADR-v9-126 an der
 * Parse-Grenze vereinheitlicht); fehlt es, entscheidet die Datei-Endung über dieselbe
 * Tabelle wie der Writer — keine zweite Endungsliste.
 *
 * Bei `data:`-URIs steht das MIME im Wert selbst und schlägt `form`, weil der Wert die
 * Bytes trägt und `form` bei der 5.5.1-Inline-Altform oft leer ist.
 */
export function isImageMedia(file: string, form: string): boolean {
  const f = file.trim();
  const inline = /^data:([^;,]+)[;,]/i.exec(f);
  if (inline) return inline[1].toLowerCase().startsWith('image/');
  const mime = form.trim() ? formToMime(form, f) : mimeFromFileName(f);
  return mime.toLowerCase().startsWith('image/');
}

/**
 * Direkt in ein `<img>` einsetzbar, ohne dass irgendetwas aufgelöst werden müsste —
 * also ausschließlich der eingebettete Fall. Ersetzt `isDisplayableImage` aus
 * `media-gallery-model.ts` (ADR-v9-136); der Unterschied zu „ist ein Bild" ist seit
 * ADR-v9-187 wesentlich: ein Pfad-Bild IST ein Bild, es braucht nur erst den Ordner.
 */
export function isEmbeddedImage(file: string): boolean {
  return classifyMediaFile(file) === 'embedded' && isImageMedia(file, '');
}
