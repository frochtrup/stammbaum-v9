// services/reports/report-shell.ts — geteilte Druck-HTML-Hülle aller §4-Ausgaben
// (BL-169, Spec 20 §4, Spec 02 §5).
//
// Trägt NUR das gemeinsame Druck-Layout: Cover (Titel/Untertitel/Meta), Seitenzahlen
// (@page-Zähler beim Druck) und das Print-CSS. Jeder konkrete Report (Ahnenliste,
// Familienbogen, Bibliographie, Forschungsprotokoll, Nachkommentafel, …) rendert nur
// seinen Rumpf-HTML und reicht ihn hier durch — KEINE zweite Berechnung hier, keine
// report-spezifische Logik.
//
// Reine Funktionen: Daten → HTML-String. Kein DOM, keine Plattform-API — „aus dem Modell
// gerechnet, nie aus dem sichtbaren DOM" (Spec 20 §4), damit headless goldfile-testbar.
// Deshalb bewusst in services/ (unterste bediente Schicht über dem Kern), nicht in ui/:
// die UI (ui/views/reports) importiert diese Hülle NACH UNTEN, nie umgekehrt (INV-ARCH-1).

/** HTML-Attribut-/Text-Escape. EINE Quelle für alle Reports (kein je-Report neu erfundenes esc). */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

/**
 * Struktur EINER Ausgabe, wie sie die Hülle erwartet. Der Rumpf (`body`) ist bereits
 * fertiges HTML des jeweiligen Report-Builders; die Hülle umgibt ihn mit Cover + Print-CSS.
 */
export interface ReportDoc {
  /** Cover-Überschrift (H1) UND `<title>` des Dokuments. */
  title: string;
  /** Zeile unter dem Titel (z. B. Proband „Otto Meyer (*1850 †1920)"). Optional. */
  subtitle?: string;
  /** Meta-Zeile (Zählungen · Erstell-Datum). Aus dem Modell gerechnet, NICHT Wall-Clock
   *  (der Builder injiziert das Datum, TST-3). Optional. */
  meta?: string;
  /** Bereits gerendertes Rumpf-HTML des konkreten Reports. */
  body: string;
  /** Dokumentsprache (`<html lang>`). Default 'de'. */
  lang?: string;
}

/** Geteiltes Print-Stylesheet aller Reports (Cover + je-Report-Klassen). Gedruckt =
 *  A4 hochkant mit Seitenzahl unten rechts; am Bildschirm eine zentrierte Blatt-Breite. */
function reportCss(): string {
  return `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 11pt; color: #1a1208; background: #fff;
      max-width: 820px; margin: 0 auto; padding: 24px 28px;
    }
    h1 { font-size: 1.8rem; font-weight: 700; margin-bottom: 4px; color: #2a1d08; }
    h2 { font-size: 1.05rem; font-weight: 700; margin: 20px 0 7px;
         border-bottom: 1.5px solid #c0a878; padding-bottom: 3px; color: #5a3e0e; }

    /* ── Cover (geteilt) ──────────────────────────────────────── */
    .report-cover { margin-bottom: 20px; }
    .report-subtitle { font-size: 1.1rem; color: #6a4a20; margin: 2px 0 6px; font-weight: 400; }
    .report-meta { font-size: 0.82rem; color: #8a7050; }
    .report-empty { color: #999; font-style: italic; font-size: 0.95rem; margin-top: 10px; }

    /* ── Ahnenliste ───────────────────────────────────────────── */
    table.ahnen { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-top: 4px; }
    table.ahnen th {
      background: #f5eedf; color: #5a3e0e; font-weight: 700;
      text-align: left; padding: 4px 6px; border: 1px solid #ddd0b8;
    }
    table.ahnen td { padding: 3px 6px; border: 1px solid #e8dfc8; vertical-align: top; }
    table.ahnen tr.gen-row td {
      background: #faf4e8; font-weight: 700; color: #5a3e0e;
      font-size: 0.82rem; padding: 5px 6px 3px;
      border-top: 2px solid #c0a878; border-bottom: 1px solid #c0a878;
    }
    .ahnen-nr { font-weight: 700; color: #8a6420; }
    .parent-ref { color: #7a5010; font-size: 0.85rem; }
    .nd { color: #bbb; font-size: 0.82rem; }

    /* ── Familienbogen ────────────────────────────────────────── */
    .fb-section { margin-bottom: 16px; }
    dl.fb-facts {
      display: grid; grid-template-columns: 140px 1fr;
      gap: 2px 8px; font-size: 10pt; margin-top: 4px;
    }
    dl.fb-facts dt { font-weight: 700; color: #6a4a20; padding-top: 1px; white-space: nowrap; }
    dl.fb-facts dd { margin: 0; }
    .fb-note { font-size: 0.88rem; color: #3a2810; white-space: pre-wrap; margin-top: 8px;
               padding: 6px 10px; border-left: 3px solid #c0a878; background: #fdf8ef; }
    ul.fb-list { list-style: none; font-size: 10pt; margin-top: 4px; }
    ul.fb-list li { padding: 2px 0; }
    ul.fb-list .role { display: inline-block; min-width: 80px; font-weight: 700; color: #6a4a20; }
    .spouse-block {
      margin: 6px 0 10px; padding: 8px 12px;
      border: 1px solid #ddd0b8; border-radius: 4px; background: #fdfaf5;
    }
    .spouse-name { font-weight: 700; font-size: 1rem; }
    .spouse-meta { font-size: 0.88rem; color: #6a4a20; margin-top: 2px; }
    .children-list { margin-top: 5px; font-size: 0.88rem; color: #3a2810; }
    .fb-sources { margin-top: 18px; font-size: 0.78rem; color: #8a7050;
                  border-top: 1px solid #ddd0b8; padding-top: 6px; }
    .no-data { color: #aaa; font-style: italic; font-size: 0.88rem; }

    /* ── Bibliographie ────────────────────────────────────────── */
    .bib-summary { font-size: 0.9rem; color: #5a3e0e; background: #faf4e8;
                   border: 1px solid #e8dfc8; border-radius: 4px;
                   padding: 8px 12px; margin-bottom: 18px; }
    .bib-summary strong { color: #6a4a20; }
    ol.bib-list { list-style: none; counter-reset: bib; }
    ol.bib-list li { counter-increment: bib; position: relative;
                     padding: 8px 8px 8px 38px; border-bottom: 1px solid #eee4cf;
                     font-size: 10pt; line-height: 1.4; }
    ol.bib-list li::before { content: counter(bib) "."; position: absolute;
                     left: 4px; top: 8px; font-weight: 700; color: #8a6420;
                     font-size: 0.85rem; }
    .bib-title { font-weight: 700; color: #2a1d08; }
    .bib-detail { color: #5a4326; }
    .bib-refs { display: inline-block; margin-left: 6px; font-size: 0.8rem;
                color: #6a4a20; background: #f0e6cf; border-radius: 3px;
                padding: 0 6px; white-space: nowrap; }
    .bib-orphan { display: inline-block; margin-left: 6px; font-size: 0.8rem;
                  color: #9a3010; background: #f6e2d8; border-radius: 3px;
                  padding: 0 6px; white-space: nowrap; }
    .bib-repo { display: block; font-size: 0.85rem; color: #7a5010; margin-top: 2px; }

    /* ── Forschungsprotokoll ──────────────────────────────────── */
    .fr-entity { margin: 14px 0 4px; page-break-inside: avoid; }
    .fr-entity h2 { margin-bottom: 4px; }
    .fr-life { font-weight: 400; font-size: 0.85rem; color: #8a7050; }
    .fr-sub { font-size: 0.8rem; font-weight: 700; color: #6a4a20;
              text-transform: uppercase; letter-spacing: 0.03em; margin: 8px 0 3px; }
    ul.fr-tasks, ul.fr-logs { list-style: none; }
    ul.fr-tasks li, ul.fr-logs li { padding: 3px 0 3px 4px; font-size: 10pt;
                     line-height: 1.4; border-bottom: 1px solid #f0e9d8; }
    .fr-badge { display: inline-block; font-size: 0.72rem; font-weight: 700;
                border-radius: 3px; padding: 0 6px; margin-right: 6px;
                vertical-align: 1px; white-space: nowrap; }
    .fr-todo  { background: #f0e6cf; color: #6a4a20; }
    .fr-doing { background: #e2ecf6; color: #1a4a7a; }
    .fr-done  { background: #dcefd8; color: #2a6a20; }
    .fr-cat   { color: #7a5010; font-size: 0.85rem; }
    .fr-date  { color: #a09070; font-size: 0.8rem; }
    .fr-found     { background: #dcefd8; color: #2a6a20; }
    .fr-partial   { background: #f6efd0; color: #7a6010; }
    .fr-notfound  { background: #f6e2d8; color: #9a3010; }
    .fr-pending   { background: #ece6da; color: #6a584a; }
    .fr-query { font-style: italic; color: #3a2810; }
    .fr-lognote { display: block; color: #5a4326; font-size: 0.88rem;
                  margin-top: 1px; white-space: pre-wrap; }

    /* ── Nachkommentafel (d'Aboville) ─────────────────────────── */
    .nk-gen-head { font-size: 0.82rem; font-weight: 700; color: #5a3e0e;
                   text-transform: uppercase; letter-spacing: 0.04em;
                   margin: 16px 0 4px; border-bottom: 1.5px solid #c0a878;
                   padding-bottom: 2px; }
    .nk-entry { margin: 5px 0; padding-left: 4px; page-break-inside: avoid;
                font-size: 10pt; line-height: 1.45; }
    .nk-num { font-weight: 700; color: #8a6420; margin-right: 5px;
              font-variant-numeric: tabular-nums; }
    .nk-name { font-weight: 700; color: #2a1d08; }
    .nk-life { color: #6a4a20; font-size: 0.9rem; }
    .nk-bio { color: #3a2810; }
    .nk-spouse { display: block; margin-left: 18px; color: #5a4326; font-size: 0.92rem; }
    .nk-spouse-mark { color: #8a6420; }
    .nk-children { display: block; margin-left: 18px; font-size: 0.85rem;
                   color: #7a6248; margin-top: 1px; }
    .nk-dup { color: #8a7050; font-style: italic; }

    /* ── Verwandtschaftsnachweis ──────────────────────────────── */
    .rc-frame { border: 2px solid #c0a878; border-radius: 6px; padding: 26px 30px; margin-top: 10px; }
    .rc-persons { display: flex; justify-content: center; align-items: center;
                  gap: 18px; margin: 6px 0 18px; text-align: center; flex-wrap: wrap; }
    .rc-person { font-size: 1.05rem; font-weight: 700; color: #2a1d08; }
    .rc-person .rc-life { display: block; font-size: 0.82rem; font-weight: 400; color: #6a4a20; }
    .rc-amp { font-size: 1.3rem; color: #8a6420; }
    .rc-verdict { text-align: center; font-size: 1.15rem; color: #5a3e0e;
                  background: #faf4e8; border: 1px solid #e8dfc8; border-radius: 5px;
                  padding: 10px 14px; margin: 12px 0; font-weight: 700; }
    .rc-common { text-align: center; font-size: 0.92rem; color: #6a4a20; margin-bottom: 16px; }
    ol.rc-path { list-style: none; counter-reset: rcp; max-width: 460px; margin: 0 auto; }
    ol.rc-path li { counter-increment: rcp; position: relative; padding: 4px 0 4px 30px; font-size: 10pt; }
    ol.rc-path li::before { content: counter(rcp) "."; position: absolute; left: 2px;
                    color: #8a6420; font-weight: 700; font-size: 0.85rem; }
    ol.rc-path li.rc-common-node { font-weight: 700; color: #5a3e0e; }
    ol.rc-path li.rc-common-node::before { content: "⬡"; }
    .rc-pname { font-weight: 600; }
    .rc-pyr { color: #8a7050; font-size: 0.85rem; }
    .rc-foot { margin-top: 20px; font-size: 0.78rem; color: #8a7050; text-align: center;
               border-top: 1px solid #ddd0b8; padding-top: 8px; }

    /* ── Story (Personen-/Familien-Biografie, BL-190) ─────────────── */
    .story-photos { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0 16px; }
    .story-photo { max-height: 180px; max-width: 100%; border: 1px solid #ddd0b8;
                   border-radius: 4px; object-fit: cover; }
    .story-map { margin: 6px 0 18px; }
    .story-map svg { width: 100%; height: auto; }
    .story-block { margin: 10px 0 6px; }
    .story-block h3 { font-size: 1rem; font-weight: 700; color: #2a1d08; margin-bottom: 2px; }
    .report-body .story-para { margin: 8px 0; line-height: 1.55; }
    .story-children { list-style: none; margin: 4px 0; }
    .story-children li { padding: 2px 0; font-size: 10pt; }
    .story-chron { list-style: none; margin: 4px 0; }
    .story-chron li { padding: 2px 0; font-size: 10pt; }

    @media print {
      .story-map, .story-block { page-break-inside: avoid; }
      /* Seitenzahl unten rechts auf jeder gedruckten Seite (Spec 20 §4 „Seitenzahlen"). */
      @page { size: A4 portrait; margin: 2cm;
              @bottom-right { content: counter(page) " / " counter(pages);
                              font-family: Georgia, serif; font-size: 9pt; color: #8a7050; } }
      body { max-width: 100%; padding: 0; }
      table.ahnen { font-size: 8.5pt; }
      table.ahnen tr.gen-row { page-break-after: avoid; }
      .fb-section, .spouse-block { page-break-inside: avoid; }
      .report-cover { page-break-after: avoid; }
    }
  `;
}

/**
 * Umschließt den Rumpf eines Reports mit Cover + Print-CSS zu einem in sich geschlossenen,
 * standalone-druckbaren HTML-Dokument (kein Server, keine externe Ressource — Spec 20 §4).
 */
export function renderReport(doc: ReportDoc): string {
  const lang = doc.lang ?? 'de';
  const subtitle = doc.subtitle ? `\n  <p class="report-subtitle">${esc(doc.subtitle)}</p>` : '';
  const meta = doc.meta ? `\n  <p class="report-meta">${esc(doc.meta)}</p>` : '';
  return `<!DOCTYPE html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.title)}</title>
<style>${reportCss()}</style>
</head>
<body>
<header class="report-cover">
  <h1>${esc(doc.title)}</h1>${subtitle}${meta}
</header>
<main class="report-body">
${doc.body}
</main>
</body>
</html>`;
}
