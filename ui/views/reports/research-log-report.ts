// ui/views/reports/research-log-report.ts — Report #4 „Forschungsprotokoll" (gedruckte
// Fassung der Protokoll-Einträge; BL-173, Spec 20 §4 / §1.11b). Die Live-Ansicht ist BL-116;
// dieser Report TEILT SICH deren Projektion (`collectAllLogEntries`/`groupLogByEntity`/
// `resultLabel`) — kein zweiter Rechenweg. Orakel: v8 `_buildForschungHtml` (dort noch mit
// Aufgaben kombiniert; v9 trennt Log-Report [BL-173] und ist damit die reine Log-Fassung).
import type { Database } from '../../../core/model/types';
import type { LogResult } from '../../../core/research/types';
import { renderReport, esc } from '../../../services/reports';
import { collectAllLogEntries, groupLogByEntity, resultLabel } from '../research-log/log-model';

const RESULT_CLASS: Record<LogResult, string> = {
  found: 'fr-found',
  partial: 'fr-partial',
  notfound: 'fr-notfound',
  pending: 'fr-pending',
};

export function buildResearchLogReport(db: Database, generatedOn: string): string {
  const rows = collectAllLogEntries(db);
  const groups = groupLogByEntity(rows);

  const body = groups.length
    ? groups.map((g) => {
        const items = g.rows.map((r) => {
          const e = r.entry;
          const meta = [e.date, e.query].filter(Boolean).map(esc).join(' · ');
          return `<li><span class="fr-badge ${RESULT_CLASS[e.result]}">${esc(resultLabel(e.result))}</span>${
            meta ? `<span class="fr-query">${meta}</span>` : ''}${
            e.note ? `<span class="fr-lognote">${esc(e.note)}</span>` : ''}</li>`;
        }).join('\n');
        const kindLbl = g.kind === 'person' ? 'Person' : 'Familie';
        return `<div class="fr-entity">
  <h2>${esc(g.entityLabel)} <span class="fr-life">(${kindLbl})</span></h2>
  <ul class="fr-logs">
${items}
  </ul>
</div>`;
      }).join('\n')
    : `<p class="report-empty">Keine Protokoll-Einträge vorhanden.</p>`;

  return renderReport({
    title: 'Forschungsprotokoll',
    meta: `${rows.length} ${rows.length === 1 ? 'Eintrag' : 'Einträge'} · ${groups.length} Personen/Familien · erstellt am ${generatedOn}`,
    body,
  });
}
