// ui/views/reports/daboville-report.ts — Report #6 „Nachkommentafel" in d'Aboville-
// Nummerierung (nummerierte Textliste, abgegrenzt vom Nachkommen-DIAGRAMM BL-122; BL-174,
// Spec 20 §4 / §1.10). Nutzt dieselbe Nachkommen-Traversierung wie die Diagramm-Insel
// (`getSpouseFamilies` aus tree-model) — kein zweiter Rechenweg. Orakel: v8 `_buildNachkommenHtml`.
import type { Database, PersonId } from '../../../core/model/types';
import { getSpouseFamilies } from '../../islands/tree/tree-model';
import { renderReport, esc } from '../../../services/reports';
import { personName, lifeYears, eventLine } from './report-format';

const MARR = '⚭';
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];

interface Entry {
  num: string;
  pid: PersonId;
  gen: number;
  dup: boolean;
}

/** Kompakte Biografie-Zeile „* Geburt, † Tod" (Orakel `_nkBio`). */
function bio(db: Database, pid: PersonId): string {
  const p = db.individuals.get(pid);
  if (!p) return '';
  const birth = eventLine(p.birth) || eventLine(p.chr);
  const death = eventLine(p.death) || eventLine(p.buri);
  return [birth ? '* ' + birth : '', death ? '† ' + death : ''].filter(Boolean).join(', ');
}

export function buildDAbovilleReport(db: Database, rootId: PersonId, generatedOn: string): string {
  const root = db.individuals.get(rootId);
  if (!root) throw new Error('Person nicht gefunden: ' + rootId);

  const entries: Entry[] = [];
  const visited = new Set<PersonId>();
  let genMax = 1;
  let total = 0;

  const walk = (pid: PersonId, num: string, gen: number): void => {
    const p = db.individuals.get(pid);
    if (!p) return;
    if (visited.has(pid)) {
      entries.push({ num, pid, gen, dup: true });
      return;
    }
    visited.add(pid);
    total++;
    if (gen > genMax) genMax = gen;
    entries.push({ num, pid, gen, dup: false });

    let ci = 0;
    for (const fam of getSpouseFamilies(db, pid)) {
      for (const cid of fam.children) {
        ci++;
        walk(cid, num + '.' + ci, gen + 1);
      }
    }
  };
  walk(rootId, '1', 1);

  // Generationsweise, d'Aboville-Reihenfolge innerhalb der Generation (stabile Sortierung).
  entries.sort((a, b) => a.gen - b.gen);

  let lastGen = 0;
  const body = entries.map((e) => {
    let head = '';
    if (e.gen !== lastGen) {
      head = `<div class="nk-gen-head">${ROMAN[e.gen] || e.gen}. Generation</div>\n`;
      lastGen = e.gen;
    }
    const p = db.individuals.get(e.pid)!;
    const name = personName(p);
    const indent = ` style="margin-left:${Math.min((e.gen - 1) * 1.2, 12)}em"`;

    if (e.dup) {
      return `${head}<div class="nk-entry"${indent}><span class="nk-num">${e.num}</span><span class="nk-name">${esc(name)}</span> <span class="nk-dup">(bereits aufgeführt)</span></div>`;
    }

    const life = lifeYears(p);
    const bioTxt = bio(db, e.pid);
    const fams = getSpouseFamilies(db, e.pid);
    let spouseHtml = '';
    let kidCount = 0;
    for (const fam of fams) {
      const spouse = fam.spouseId ? db.individuals.get(fam.spouseId) : null;
      const spouseName = spouse ? personName(spouse) : 'unbekannte Person';
      const marr = db.families.get(fam.familyId)?.marriage;
      const marrLine = marr ? eventLine(marr) : '';
      const sl = spouse ? lifeYears(spouse) : '';
      spouseHtml += `<span class="nk-spouse"><span class="nk-spouse-mark">${MARR}</span> ${esc(spouseName)}${sl ? ' ' + esc(sl) : ''}${marrLine ? ` — Heirat ${esc(marrLine)}` : ''}</span>`;
      kidCount += fam.children.length;
    }
    let childRefs = '';
    if (kidCount) {
      const nums: string[] = [];
      for (let i = 1; i <= kidCount; i++) nums.push(e.num + '.' + i);
      childRefs = `<span class="nk-children">${kidCount} Kind${kidCount === 1 ? '' : 'er'}: Nr. ${nums.join(', ')}</span>`;
    }

    return `${head}<div class="nk-entry"${indent}>
  <span class="nk-num">${e.num}</span><span class="nk-name">${esc(name)}</span>${life ? ` <span class="nk-life">${esc(life)}</span>` : ''}${bioTxt ? ` — <span class="nk-bio">${esc(bioTxt)}</span>` : ''}
  ${spouseHtml}${childRefs}
</div>`;
  }).join('\n');

  const rootLife = lifeYears(root);
  return renderReport({
    title: 'Nachkommentafel',
    subtitle: `Nachkommen von ${personName(root)}${rootLife ? ' ' + rootLife : ''}`,
    meta: `${Math.max(total - 1, 0)} Nachkommen · ${genMax} Generation${genMax === 1 ? '' : 'en'} · erstellt am ${generatedOn} · Nummerierung nach d'Aboville (1 = Proband, 1.1 = erstes Kind, 1.1.2 = zweites Enkelkind dieser Linie)`,
    body,
  });
}
