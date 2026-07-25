// ui/shell/source-badge.ts — Quellen-Badge-Darstellung (Spec 21 §7): `§N`, Tooltip =
// Quellentitel. N = numerischer Teil der GEDCOM-ID (z. B. `@S042@` → `§42`), belegt in
// legacy-v8/UI-DESIGN.md §"Symbole". Die QUAY-Beweiskraft wird NICHT mehr über die
// Pillen-Farbe kodiert (ADR-v9-118: q0-Rot war fast identisch mit --stb-danger, eine
// belegte Angabe sah aus wie ein Fehler; die Skala rot→orange→blau→grün war zudem nicht
// monoton lesbar), sondern über den `QuayMeter` (gefüllte Pips 0..3, Position statt Farbe).
import type { Citation, Source } from '../../core/model/types';

/** Numerischer Teil einer GEDCOM-ID (`@S042@` → `42`, `S7` → `7`, sonst roh). */
export function badgeNumber(sourceId: string): string {
  const m = /(\d+)/.exec(sourceId);
  return m ? m[1] : sourceId.replace(/[@]/g, '');
}

/** Obergrenze für die Marken-Beschriftung (Dichte-Kontrakt, ADR-v9-120): ein
 *  menschenlesbarer Quellenname ist breiter als eine ID — damit die Informationsdichte
 *  pro Ereigniszeile nicht einbricht (in den echten Daten liegt der Kurzname/Titel im
 *  Median bei ~37 Zeichen), wird das SICHTBARE Label hart gekappt. Der volle Name steht
 *  im Tooltip ({@link badgeTitle}); die Insel-Verifikation prüft die reale 3-Quellen-Zeile. */
export const MAX_BADGE_LABEL = 18;

function truncateLabel(s: string): string {
  return s.length <= MAX_BADGE_LABEL ? s : `${s.slice(0, MAX_BADGE_LABEL - 1).trimEnd()}…`;
}

/** Marken-Beschriftung: der menschenlesbare Quellenname (Kurzname bevorzugt, sonst Titel),
 *  auf {@link MAX_BADGE_LABEL} gekürzt. Nur wenn die Quelle fehlt oder namenlos ist, greift
 *  der kompakte ID-Fallback `§N` (optional `§N·Seite`, Seite ≤5 Z.). Der volle Name + Seite
 *  liegt im Tooltip ({@link badgeTitle}). Vorher zeigte die Marke die Datensatz-ID (`§42`) —
 *  für Menschen bedeutungslos (ADR-v9-120). */
export function badgeLabel(citation: Citation, source?: Source): string {
  const name = (source?.abbr || source?.title || '').trim();
  if (name) return truncateLabel(name);
  const n = `§${badgeNumber(citation.sourceId)}`;
  if (citation.page && citation.page.length <= 5) return `${n}·${citation.page}`;
  return n;
}

/** Screenreader-/Tooltip-Text für den Beweiskraft-Meter (Spec 21 §7, ADR-v9-118):
 *  die QUAY-Stufe als lesbarer Satz statt reiner Farbe. */
export function quayAriaLabel(quay: Citation['quay']): string {
  return `Beweiskraft ${quay} von 3`;
}

/** Tooltip-Text: Quellenname (Kurzname bevorzugt) + Referenz (PAGE), sofern gesetzt.
 *  Fallback auf die rohe ID, wenn die Quelle nicht (mehr) existiert. */
export function badgeTitle(citation: Citation, source: Source | undefined): string {
  const label = source?.abbr || source?.title;
  const name = label ? label.slice(0, 60) : citation.sourceId;
  return citation.page ? `${name} · ${citation.page}` : name;
}

const HTTP_RE = /^https?:\/\//i;

/** Klickbarer Weblink der Quellen-Pille (↗): erst eine Zitat-Medien-URL
 *  (`deepLinkUrl`/OBJE-FILE), dann PAGE-als-URL als Altdaten-Fallback (analog v8
 *  `citTagsHtml`). '' = kein Link, dann wird kein ↗ gerendert. */
export function badgeLinkHref(citation: Citation): string {
  const mediaUrl = citation.media.find((m) => HTTP_RE.test(m.file))?.file;
  if (mediaUrl) return mediaUrl;
  if (HTTP_RE.test(citation.deepLinkUrl)) return citation.deepLinkUrl;
  if (HTTP_RE.test(citation.page)) return citation.page;
  return '';
}
