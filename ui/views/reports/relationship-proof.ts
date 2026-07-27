// ui/views/reports/relationship-proof.ts — Report #9 „Verwandtschaftsnachweis" (Pfad-
// diagramm mit gemeinsamem Vorfahren; BL-175, Spec 20 §4 / §1.12). Konsumiert den
// Beziehungsrechner (`findRelationshipPath`, BL-134) — kein zweiter Rechenweg. Orakel:
// v8 `ui-print.js` `_buildRelCertHtml`.
import type { Database, PersonId } from '../../../core/model/types';
import { renderReport, esc } from '../../../services/reports';
import { findRelationshipPath } from '../tools/relationship';
import { personName, lifeYears } from './report-format';

export function buildRelationshipProof(
  db: Database,
  idA: PersonId,
  idB: PersonId,
  generatedOn: string,
): string {
  const pA = db.individuals.get(idA);
  const pB = db.individuals.get(idB);
  if (!pA || !pB) throw new Error('Person nicht gefunden');

  const rel = findRelationshipPath(db, idA, idB);
  const nameA = personName(pA);
  const nameB = personName(pB);
  const verdict = rel?.label ?? 'Nicht verwandt';

  let common = '';
  if (rel?.commonId) {
    const c = db.individuals.get(rel.commonId);
    if (c) common = `Gemeinsamer Vorfahre: ${personName(c)}${lifeYears(c) ? ' ' + lifeYears(c) : ''}`;
  }

  let pathHtml = '';
  if (rel?.path.length) {
    pathHtml = `<ol class="rc-path">\n` + rel.path.map((pid) => {
      const p = db.individuals.get(pid);
      const isCommon = pid === rel.commonId;
      const yl = p ? lifeYears(p) : '';
      return `<li class="${isCommon ? 'rc-common-node' : ''}"><span class="rc-pname">${esc(p ? personName(p) : pid)}</span>${yl ? ` <span class="rc-pyr">${esc(yl)}</span>` : ''}</li>`;
    }).join('\n') + `\n</ol>`;
  }

  const multiNote = rel?.multiPath
    ? `<div class="rc-common">Mehrere Verwandtschaftspfade möglich – der kürzeste ist dargestellt.</div>`
    : '';

  const lifeA = lifeYears(pA);
  const lifeB = lifeYears(pB);
  const body = `<div class="rc-frame">
  <div class="rc-persons">
    <span class="rc-person">${esc(nameA)}${lifeA ? `<span class="rc-life">${esc(lifeA)}</span>` : ''}</span>
    <span class="rc-amp">&amp;</span>
    <span class="rc-person">${esc(nameB)}${lifeB ? `<span class="rc-life">${esc(lifeB)}</span>` : ''}</span>
  </div>
  <div class="rc-verdict">${esc(verdict)}</div>
  ${common ? `<div class="rc-common">${esc(common)}</div>` : ''}
  ${multiNote}
  ${pathHtml}
  <div class="rc-foot">Verwandtschaftspfad mit ⬡ am gemeinsamen Vorfahren · automatisch berechnet</div>
</div>`;

  return renderReport({
    title: 'Verwandtschaftsnachweis',
    subtitle: `${nameA} & ${nameB}`,
    meta: `erstellt am ${generatedOn}`,
    body,
  });
}
