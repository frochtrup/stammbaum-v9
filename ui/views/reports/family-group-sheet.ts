// ui/views/reports/family-group-sheet.ts — Report #2 „Familienbogen" (Druckblatt einer
// Person: persönliche Daten, Eltern, Geschwister, Ehen/Kinder, Quellen; BL-171, Spec 20 §4).
// Reine Renderfunktion; nutzt die vorhandenen Traversierungen aus tree-model (Eltern,
// Geschwister, Ehefamilien) — kein zweiter Rechenweg. Orakel: v8 `_buildFamilienbogenHtml`.
import type { Citation, Database, PersonId } from '../../../core/model/types';
import { getParentIds, getSiblingIds, getSpouseFamilies } from '../../islands/tree/tree-model';
import { renderReport, esc } from '../../../services/reports';
import { personName, lifeYears, eventLine, yearOf } from './report-format';

/** Ehesymbol ⚭ (GEDCOM-neutral). */
const MARR = '⚭';

function fact(label: string, val: string): string {
  return val ? `<dt>${esc(label)}</dt><dd>${esc(val)}</dd>` : '';
}

/** Distinkte Quellen-Kurzverweise über ALLE Citation[]-Fundstellen der Person. */
function collectCitations(db: Database, cits: Citation[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of cits) {
    for (const c of list) {
      const src = db.sources.get(c.sourceId);
      const label = (src?.title || src?.abbr || c.sourceId).trim();
      const key = `${label}|${c.page}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(label + (c.page ? ` (S. ${c.page})` : ''));
    }
  }
  return out;
}

export function buildFamilyGroupSheet(db: Database, personId: PersonId, generatedOn: string): string {
  const p = db.individuals.get(personId);
  if (!p) throw new Error('Person nicht gefunden: ' + personId);

  const name = personName(p);
  const life = lifeYears(p);

  // ── Persönliche Daten ────────────────────────────────────────
  const sexTxt = p.sex === 'M' ? 'männlich' : p.sex === 'F' ? 'weiblich' : '';
  const birthName = p.extraNames.find((n) => {
    const t = n.type.toLowerCase();
    return t === 'birth' || t === 'maiden' || t === 'maid' || t === 'birt' || t === 'mädchenname';
  });
  const bName = birthName
    ? (birthName.nameRaw || [birthName.given, birthName.surname].filter(Boolean).join(' ')).replace(/\//g, ' ').replace(/\s+/g, ' ').trim()
    : '';
  const occu = p.events.filter((ev) => ev.type === 'OCCU')
    .map((ev) => [ev.value, ev.date].filter(Boolean).join(', ')).filter(Boolean).join(' / ');

  const facts = [
    fact('Vorname', p.given || '—'),
    fact('Nachname', p.surname || p.name),
    fact('Geschlecht', sexTxt),
    fact('Geburtsname', bName),
    fact('Geburt', eventLine(p.birth)),
    fact('Taufe', eventLine(p.chr)),
    fact('Tod', eventLine(p.death)),
    fact('Beerdigung', eventLine(p.buri)),
    fact('Beruf', occu),
  ].join('');
  const notePart = p.noteText ? `\n<p class="fb-note">${esc(p.noteText)}</p>` : '';
  const sec1 = `<div class="fb-section"><h2>Persönliche Daten</h2>\n<dl class="fb-facts">${facts}</dl>${notePart}\n</div>`;

  // ── Eltern ───────────────────────────────────────────────────
  const { father, mother } = getParentIds(db, personId);
  const parentLine = (role: string, id: PersonId | null): string => {
    if (!id) return `<li><span class="role">${role}:</span> <span class="no-data">unbekannt</span></li>`;
    const par = db.individuals.get(id);
    if (!par) return `<li><span class="role">${role}:</span> <span class="no-data">unbekannt</span></li>`;
    const l = lifeYears(par);
    return `<li><span class="role">${role}:</span> ${esc(personName(par))}${l ? ' ' + esc(l) : ''}</li>`;
  };
  const sec2 = father || mother
    ? `<div class="fb-section"><h2>Eltern</h2>\n<ul class="fb-list">\n${parentLine('Vater', father)}\n${parentLine('Mutter', mother)}\n</ul>\n</div>`
    : `<div class="fb-section"><h2>Eltern</h2>\n<p class="no-data">Keine Elternfamilie eingetragen</p>\n</div>`;

  // ── Geschwister ──────────────────────────────────────────────
  const sibs = getSiblingIds(db, personId)
    .map((s) => db.individuals.get(s.id))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .sort((a, b) => (yearOf(a.birth) || yearOf(a.chr) || '9999').localeCompare(yearOf(b.birth) || yearOf(b.chr) || '9999'));
  const sec3 = sibs.length
    ? `<div class="fb-section"><h2>Geschwister</h2>\n<ul class="fb-list">\n${sibs.map((s) => {
        const l = lifeYears(s);
        return `<li>${esc(personName(s))}${l ? ' ' + esc(l) : ''}</li>`;
      }).join('\n')}\n</ul>\n</div>`
    : `<div class="fb-section"><h2>Geschwister</h2>\n<p class="no-data">Keine Geschwister eingetragen</p>\n</div>`;

  // ── Ehe(n) & Kinder ──────────────────────────────────────────
  const spouseFams = getSpouseFamilies(db, personId);
  let sec4 = `<div class="fb-section"><h2>Ehe(n)</h2>`;
  if (spouseFams.length) {
    for (const sf of spouseFams) {
      const spouse = sf.spouseId ? db.individuals.get(sf.spouseId) : null;
      const spouseName = spouse ? personName(spouse) : 'unbekannte Person';
      const marr = db.families.get(sf.familyId)?.marriage;
      const marrLine = marr ? eventLine(marr) : '';
      sec4 += `\n<div class="spouse-block">`;
      sec4 += `\n<div class="spouse-name">${MARR} ${esc(spouseName)}${spouse && lifeYears(spouse) ? ' ' + esc(lifeYears(spouse)) : ''}</div>`;
      if (marrLine) sec4 += `\n<div class="spouse-meta">Heirat: ${esc(marrLine)}</div>`;
      const kids = sf.children.map((cid) => db.individuals.get(cid)).filter((c): c is NonNullable<typeof c> => !!c);
      if (kids.length) {
        const kidStrs = kids.map((c) => {
          const yr = yearOf(c.birth) || yearOf(c.chr);
          return esc(personName(c)) + (yr ? ` *${yr}` : '');
        });
        sec4 += `\n<div class="children-list">Kinder: ${kidStrs.join(', ')}</div>`;
      } else {
        sec4 += `\n<div class="children-list no-data">Keine Kinder eingetragen</div>`;
      }
      sec4 += `\n</div>`;
    }
  } else {
    sec4 += `\n<p class="no-data">Keine Ehe(n) eingetragen</p>`;
  }
  sec4 += `\n</div>`;

  // ── Quellen ──────────────────────────────────────────────────
  const cits = collectCitations(db, [
    p.topLevelCitations, p.nameCitations,
    p.birth.citations, p.chr.citations, p.death.citations, p.buri.citations,
    ...p.events.map((ev) => ev.citations),
  ]);
  const srcHtml = cits.length
    ? `\n<div class="fb-sources"><strong>Quellen:</strong> ${cits.map(esc).join(' · ')}</div>`
    : '';

  return renderReport({
    title: 'Familienbogen',
    subtitle: `${name}${life ? ' ' + life : ''}`,
    meta: `Erstellt ${generatedOn}`,
    body: `${sec1}\n${sec2}\n${sec3}\n${sec4}${srcHtml}`,
  });
}
