// ui/shell/source-badge.ts — Quellen-Badge-Darstellung (Spec 21 §7): `§N` mit
// QUAY-Farbindikator q0–q3, Tooltip = Quellentitel. N = numerischer Teil der
// GEDCOM-ID (z. B. `@S042@` → `§42`), belegt in legacy-v8/UI-DESIGN.md §"Symbole".
import type { Citation, Source } from '../../core/model/types';

/** Numerischer Teil einer GEDCOM-ID (`@S042@` → `42`, `S7` → `7`, sonst roh). */
export function badgeNumber(sourceId: string): string {
  const m = /(\d+)/.exec(sourceId);
  return m ? m[1] : sourceId.replace(/[@]/g, '');
}

/** `§N`, optional mit Seiten-Suffix `§N·Seite` wenn die Seite kurz genug ist (≤5 Z.). */
export function badgeLabel(citation: Citation): string {
  const n = `§${badgeNumber(citation.sourceId)}`;
  if (citation.page && citation.page.length <= 5) return `${n}·${citation.page}`;
  return n;
}

/** QUAY→CSS-Modifier-Klasse (Spec 21 §7: rot/orange/blau/grün = q0–q3). */
export function quayClass(citation: Citation): string {
  return quayClassFor(citation.quay);
}

/** Wie {@link quayClass}, aber direkt aus dem QUAY-Wert (für Kontexte ohne volles Citation-Objekt). */
export function quayClassFor(quay: Citation['quay']): string {
  return `src-badge--q${quay}`;
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
