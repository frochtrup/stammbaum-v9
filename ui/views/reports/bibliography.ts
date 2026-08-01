// ui/views/reports/bibliography.ts — Report #3 „Quellenverzeichnis / Bibliographie"
// (Belegzählung je Quelle + Orphan-Markierung bei 0 Zitaten; BL-172, Spec 20 §4 / §1.6).
// Rechnet über die vorhandenen Citation[]-Träger von Personen und Familien — kein neues
// Referenz-Register. Orakel: v8 `_buildBibliographieHtml`.
import type { Citation, Database, Family, Person, Source } from '../../../core/model/types';
import { renderReport, esc } from '../../../services/reports';

/** Alle Citation[]-Fundstellen einer Person (Spec 10 §5.3 — jeder Träger zählt). */
function personCitations(p: Person): Citation[] {
  return [
    ...p.topLevelCitations, ...p.nameCitations,
    ...p.birth.citations, ...p.chr.citations, ...p.death.citations, ...p.buri.citations,
    ...p.events.flatMap((ev) => ev.citations),
    ...p.childOf.flatMap((c) => c.citations),
    ...p.extraNames.flatMap((n) => n.citations),
    ...p.associations.flatMap((a) => a.citations),
  ];
}

/** Alle Citation[]-Fundstellen einer Familie. */
function familyCitations(f: Family): Citation[] {
  return [
    ...f.citations,
    ...f.marriage.citations, ...f.engagement.citations,
    ...f.events.flatMap((ev) => ev.citations),
  ];
}

interface RefCount {
  persons: number;
  families: number;
  total: number;
}

/** Zählt distinkte Personen + Familien, die `sid` referenzieren. */
function refCounts(db: Database, sid: string): RefCount {
  let persons = 0;
  for (const p of db.individuals.values()) {
    if (personCitations(p).some((c) => c.sourceId === sid)) persons++;
  }
  let families = 0;
  for (const f of db.families.values()) {
    if (familyCitations(f).some((c) => c.sourceId === sid)) families++;
  }
  return { persons, families, total: persons + families };
}

/** Sortierschlüssel: Autor-Nachname, sonst Titel/Kürzel/Id (Orakel `_bibSortKey`). */
function sortKey(s: Source): string {
  const author = s.author.trim();
  const surn = author.includes(',') ? author.split(',')[0] : (author.split(/\s+/).pop() || '');
  return (surn || s.title || s.abbr || s.id).toLowerCase();
}

function repoHtml(db: Database, s: Source): string {
  if (!s.repo) return '';
  const isXref = /^@[^@]+@$/.test(s.repo);
  const repo = isXref ? db.repositories.get(s.repo) : null;
  const label = repo ? repo.name || s.repo : (!isXref ? s.repo : '');
  if (!label) return '';
  const callNum = s.callNumber ? `, Sign. ${esc(s.callNumber)}` : '';
  return `<span class="bib-repo">🏛 ${esc(label)}${callNum}</span>`;
}

export function buildBibliography(db: Database, generatedOn: string): string {
  const sorted = [...db.sources.values()].sort((a, b) => sortKey(a).localeCompare(sortKey(b), 'de'));

  let orphanCount = 0;
  let refTotal = 0;
  const items = sorted.map((s) => {
    const rc = refCounts(db, s.id);
    refTotal += rc.total;
    if (rc.total === 0) orphanCount++;

    const titleTxt = s.title || s.abbr || s.id;
    const head = `<span class="bib-title">${esc(titleTxt)}</span>`;
    const detailParts: string[] = [];
    if (s.author) detailParts.unshift(esc(s.author));
    if (s.publisher) detailParts.push(esc(s.publisher));
    if (s.createdDate) detailParts.push(esc(s.createdDate));
    const detail = detailParts.length ? `<span class="bib-detail"> — ${detailParts.join('. ')}</span>` : '';

    const refBadge = rc.total
      ? `<span class="bib-refs">${rc.persons ? rc.persons + ' Pers.' : ''}${rc.persons && rc.families ? ' · ' : ''}${rc.families ? rc.families + ' Fam.' : ''}</span>`
      : `<span class="bib-orphan">⚠ kein Beleg</span>`;

    return `<li>${head}${detail}${refBadge}${repoHtml(db, s)}</li>`;
  }).join('\n');

  const summary = `<div class="bib-summary">
    <strong>${sorted.length}</strong> Quelle${sorted.length === 1 ? '' : 'n'} ·
    <strong>${refTotal}</strong> Belegverweis${refTotal === 1 ? '' : 'e'} (Personen + Familien)${
    orphanCount ? ` · <strong>${orphanCount}</strong> ohne Beleg ⚠` : ''}
  </div>`;

  const body = sorted.length
    ? `${summary}\n<ol class="bib-list">\n${items}\n</ol>`
    : `<p class="report-empty">Keine Quellen vorhanden.</p>`;

  return renderReport({
    title: 'Quellenverzeichnis',
    meta: `erstellt am ${generatedOn}`,
    body,
  });
}
