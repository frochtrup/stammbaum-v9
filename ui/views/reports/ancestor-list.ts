// ui/views/reports/ancestor-list.ts — Report #1 „Ahnenliste" (Kekulé-Tabelle aller
// Vorfahren des Probanden, BL-170, Spec 20 §4 / §1.1). Reine Renderfunktion über die
// bereits vorhandene Ahnen-Traversierung (`computeKekuleNumbers`) — kein zweiter Rechenweg.
// Verhaltens-Orakel: v8 `ui-print.js` `_buildAhnenlisteHtml`.
import type { Database, PersonId } from '../../../core/model/types';
import { computeKekuleNumbers } from '../../islands/tree/tree-model';
import { renderReport, esc } from '../../../services/reports';
import { personName, eventLine } from './report-format';

const GEN_LABELS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI'];
const GEN_NAMES = ['Proband/in', 'Eltern', 'Großeltern', 'Urgroßeltern',
  '3× Urgroßeltern', '4× Urgroßeltern', '5× Urgroßeltern', '6× Urgroßeltern', '7× Urgroßeltern'];

/**
 * Baut die Ahnenliste als standalone-druckbares HTML. `generatedOn` ist der bereits
 * formatierte Erstell-Datums-String (injiziert, nie Wall-Clock — TST-3, goldfile-stabil).
 */
export function buildAncestorList(db: Database, probandId: PersonId, generatedOn: string): string {
  const kekule = computeKekuleNumbers(db, probandId); // personId → Nummer
  // Umkehr-Index Nummer → personId (für Vater-/Mutter-Verweiszellen 2k / 2k+1).
  const byNum = new Map<number, PersonId>();
  for (const [id, k] of kekule) byNum.set(k, id);

  const sorted = [...byNum.entries()].sort((a, b) => a[0] - b[0]);
  const maxKek = sorted.length ? sorted[sorted.length - 1][0] : 1;
  const genCount = Math.floor(Math.log2(Math.max(maxKek, 1))) + 1;

  const proband = db.individuals.get(probandId);
  const probName = proband ? personName(proband) : probandId;

  let rows = '';
  let curGen = -1;
  for (const [k, id] of sorted) {
    const gen = Math.floor(Math.log2(Math.max(k, 1)));
    if (gen !== curGen) {
      curGen = gen;
      const lbl = GEN_LABELS[gen] || String(gen + 1);
      const desc = GEN_NAMES[gen] || `${gen}. Vorfahrengeneration`;
      const kStart = 1 << gen;
      const kEnd = (1 << (gen + 1)) - 1;
      const range = kEnd > kStart ? ` (Nr. ${kStart}–${kEnd})` : ` (Nr. ${kStart})`;
      rows += `<tr class="gen-row"><td colspan="6">${lbl}. Generation – ${esc(desc)}${range}</td></tr>\n`;
    }
    const p = db.individuals.get(id);
    if (!p) continue;
    const birth = eventLine(p.birth) || eventLine(p.chr);
    const death = eventLine(p.death) || eventLine(p.buri);
    const vatCell = byNum.has(k * 2)
      ? `<span class="parent-ref">${k * 2}</span>` : `<span class="nd">—</span>`;
    const mutCell = byNum.has(k * 2 + 1)
      ? `<span class="parent-ref">${k * 2 + 1}</span>` : `<span class="nd">—</span>`;
    rows += `<tr>
      <td class="ahnen-nr">${k}</td>
      <td>${esc(personName(p))}</td>
      <td>${esc(birth)}</td>
      <td>${esc(death)}</td>
      <td>${vatCell}</td>
      <td>${mutCell}</td>
    </tr>\n`;
  }

  const body = `<table class="ahnen">
<thead>
<tr>
  <th>Nr.</th>
  <th>Name</th>
  <th>* Geburt / Taufe</th>
  <th>† Tod / Beerdigung</th>
  <th>Vater</th>
  <th>Mutter</th>
</tr>
</thead>
<tbody>
${rows}</tbody>
</table>`;

  return renderReport({
    title: 'Ahnenliste',
    subtitle: probName,
    meta: `${sorted.length} Vorfahren in ${genCount} Generation${genCount !== 1 ? 'en' : ''} · Erstellt ${generatedOn}`,
    body,
  });
}
