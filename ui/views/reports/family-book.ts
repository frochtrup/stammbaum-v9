// ui/views/reports/family-book.ts — Report #7 „Familienbuch" (buchreif: Coverfoto,
// Seitenzahlen, Glossar; BL-176, Spec 20 §4). Die aufwendigste Ausgabe (Buch-Grad wie
// Story). Baut auf der geteilten Druck-HTML-Hülle (services/reports) auf — Seitenzahlen
// liefert deren @page-Zähler (report-shell.ts), das Cover die Hülle + ein Coverfoto im
// Rumpf. Reine Renderfunktion (Modell → HTML), kein DOM, injiziertes Erstell-Datum (TST-3).
// Ahnen-Modus: die Vorfahren des Probanden in Kekulé-Nummerierung, gleiche Traversierung
// wie Ahnenliste/Baum (`computeKekuleNumbers`) — kein zweiter Rechenweg. Fotos als
// data:-URI über dieselbe Medien-Projektion wie die Story (`collectStoryMedia`, BL-189).
// Verhaltens-Orakel: v8 `ui-book.js` (`_buildBookHtml`/`_personSectionHtml`).
import type { Citation, Database, Event, Person, PersonId } from '../../../core/model/types';
import { isEventPresent } from '../../../core/model';
import { formatDateForDisplay } from '../../../core/model/gedcom-date';
import { computeKekuleNumbers, getParentIds, getSpouseFamilies } from '../../islands/tree/tree-model';
import { collectStoryMedia } from '../story/story-model';
import { eventTypeLabel } from '../../shell/event-labels';
import { renderReport, esc } from '../../../services/reports';
import { personName, lifeYears, yearOf } from './report-format';

const MARR = '⚭';

/** Faktenwert einer Zeile „Wert, Adresse, Datum, Ort" (Orakel `_eventsTableHtml`). */
function factValue(ev: Event): string {
  return [ev.value, ev.addr, formatDateForDisplay(ev.date), (ev.place ?? '').trim()]
    .filter(Boolean)
    .join(', ');
}

/** Beschriftung eines freien Ereignisses (Orakel `evLabel`): Basis + optionaler TYPE-Text. */
function eventLabel(ev: Event): string {
  const base = eventTypeLabel(ev.type || 'EVEN');
  if (!ev.eventType) return base;
  return ev.type === 'EVEN' || ev.type === 'FACT' ? ev.eventType : `${base}: ${ev.eventType}`;
}

/** Lebensdaten-Tabelle: Geburt/Taufe/Tod/Beerdigung + freie Ereignisse (Erscheinungs-Reihenfolge). */
function factsTable(p: Person): string {
  const rows: string[] = [];
  const addRow = (label: string, ev: Event): void => {
    if (!isEventPresent(ev)) return;
    const val = factValue(ev);
    const note = ev.note ? `<br><small class="ev-note">${esc(ev.note)}</small>` : '';
    if (!val && !note) return;
    rows.push(`<tr><th>${esc(label)}</th><td>${esc(val)}${note}</td></tr>`);
  };
  addRow('Geburt', p.birth);
  addRow('Taufe', p.chr);
  addRow('Tod', p.death);
  addRow('Beerdigung', p.buri);
  for (const ev of p.events) addRow(eventLabel(ev), ev);
  return rows.length ? `<table class="facts-table">${rows.join('')}</table>` : '';
}

/** Eltern- und Ehe-/Kinder-Block, Personen als Anker-Links in dasselbe Dokument. */
function familyBlock(db: Database, p: PersonId): string {
  const link = (id: PersonId, name: string): string => `<a href="#p-${esc(id)}">${esc(name)}</a>`;
  let html = '';

  const { father, mother } = getParentIds(db, p);
  const parents = [father, mother]
    .map((id) => (id ? db.individuals.get(id) : null))
    .filter((x): x is Person => !!x)
    .map((par) => link(par.id, personName(par)));
  if (parents.length) {
    html += `<div class="family-block"><span class="fam-label">Eltern</span> ${parents.join(' &amp; ')}</div>`;
  }

  for (const sf of getSpouseFamilies(db, p)) {
    const spouse = sf.spouseId ? db.individuals.get(sf.spouseId) : null;
    const spouseName = spouse ? link(spouse.id, personName(spouse)) : '—';
    const marr = db.families.get(sf.familyId)?.marriage;
    const marrLine = marr && isEventPresent(marr) ? factValue(marr) : '';
    html += `<div class="family-block"><span class="fam-label">${MARR}</span> ${spouseName}`;
    if (marrLine) html += ` <span class="fam-meta">${esc(marrLine)}</span>`;
    const kids = sf.children
      .map((cid) => db.individuals.get(cid))
      .filter((c): c is Person => !!c)
      .map((c) => {
        const yr = yearOf(c.birth) || yearOf(c.chr);
        return `<a href="#p-${esc(c.id)}">${esc(personName(c))}${yr ? ` *${yr}` : ''}</a>`;
      });
    if (kids.length) html += `<div class="book-children">Kinder: ${kids.join(', ')}</div>`;
    html += `</div>`;
  }
  return html;
}

/** Distinkte Quellen-Kurzverweise einer Person (Orakel `_collectCitations`). */
function collectCitations(db: Database, p: Person): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (cits: Citation[]): void => {
    for (const c of cits) {
      const src = db.sources.get(c.sourceId);
      const label = [src?.title, src?.author].filter(Boolean).join(', ') || src?.abbr || c.sourceId;
      const full = label + (c.page ? ` S. ${c.page}` : '');
      if (seen.has(full)) continue;
      seen.add(full);
      out.push(full);
    }
  };
  add(p.topLevelCitations);
  add(p.nameCitations);
  for (const ev of [p.birth, p.chr, p.death, p.buri, ...p.events]) add(ev.citations);
  return out;
}

/** Eine Personen-Sektion des Buches (Kopf, Fakten, Familie, Notiz, Quellen). */
function personSection(db: Database, p: Person, kekule: number | undefined, photo: string | null): string {
  const badge = kekule != null ? `<div class="kekule-badge">${kekule}</div>` : '';
  const img = photo ? `<img class="person-photo" src="${esc(photo)}" alt="${esc(personName(p))}">` : '';
  const life = lifeYears(p);
  const cits = collectCitations(db, p);
  const srcHtml = cits.length
    ? `<div class="person-sources"><span class="src-label">Quellen:</span> ${cits.map(esc).join(' · ')}</div>`
    : '';
  const note = p.noteText ? `<div class="person-note">${esc(p.noteText)}</div>` : '';
  return `<section class="person-section" id="p-${esc(p.id)}">
  <div class="person-header">${badge}${img}<div class="person-title">
    <h2>${esc(personName(p))}</h2>${life ? `<div class="person-lifespan">${esc(life)}</div>` : ''}
  </div></div>
  ${factsTable(p)}${familyBlock(db, p.id)}${note}${srcHtml}
</section>`;
}

/**
 * Baut das druckbare Familienbuch. `probandId` ist die Bezugsperson (Cover + Kekulé-Wurzel);
 * das Buch enthält deren Vorfahren in Kekulé-Nummerierung. `generatedOn` wird injiziert
 * (kein Wall-Clock, TST-3) → deterministisch goldfile-testbar.
 */
export function buildFamilyBook(db: Database, probandId: PersonId, generatedOn: string): string {
  const proband = db.individuals.get(probandId);
  if (!proband) throw new Error('Person nicht gefunden: ' + probandId);

  const kekule = computeKekuleNumbers(db, probandId); // personId → Nummer
  const sortedIds = [...kekule.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);

  // Inhaltsverzeichnis (Kekulé-Nummer + Name + Geburtsjahr).
  const toc = sortedIds
    .map((id) => {
      const p = db.individuals.get(id)!;
      const k = kekule.get(id);
      const yr = yearOf(p.birth) || yearOf(p.chr);
      return `<li><a href="#p-${esc(id)}"><span class="book-toc-num">${k}</span>${esc(personName(p))}${yr ? ` *${yr}` : ''}</a></li>`;
    })
    .join('\n');

  // Personen-Sektionen (in Kekulé-Reihenfolge).
  const sections = sortedIds
    .map((id) => {
      const p = db.individuals.get(id)!;
      const photo = collectStoryMedia(db, id)[0]?.src ?? null;
      return personSection(db, p, kekule.get(id), photo);
    })
    .join('\n');

  // Namenindex (alphabetisch), mit Kekulé-Nummer in Klammern.
  const nameIndex = [...sortedIds]
    .map((id) => db.individuals.get(id)!)
    .sort((a, b) => personName(a).localeCompare(personName(b), 'de'))
    .map((p) => `<a href="#p-${esc(p.id)}">${esc(personName(p))} (${kekule.get(p.id)})</a>`)
    .join('');

  const coverSrc = collectStoryMedia(db, probandId)[0]?.src ?? null;
  const cover = coverSrc
    ? `<div class="book-cover"><img class="book-cover-photo" src="${esc(coverSrc)}" alt="${esc(personName(proband))}"></div>`
    : '';

  const glossary = `<div class="book-glossary">
  <h2>Glossar &amp; Zeichenerklärung</h2>
  <dl>
    <dt>*</dt><dd>geboren</dd>
    <dt>~</dt><dd>getauft</dd>
    <dt>†</dt><dd>gestorben</dd>
    <dt>${MARR}</dt><dd>verheiratet (Heirat)</dd>
    <dt>Geburt</dt><dd>Geburtsereignis (GEDCOM BIRT)</dd>
    <dt>Taufe</dt><dd>Taufereignis (GEDCOM CHR)</dd>
    <dt>Tod</dt><dd>Sterbeereignis (GEDCOM DEAT)</dd>
    <dt>Beerdigung</dt><dd>Bestattungsereignis (GEDCOM BURI)</dd>
    <dt>Kekulé-Nr.</dt><dd>Ahnennummer nach Kekulé von Stradonitz: Proband = 1, Vater = 2×Nr., Mutter = 2×Nr.+1</dd>
  </dl>
</div>`;

  const body = `${cover}
<nav class="book-toc"><h2>Inhaltsverzeichnis</h2><ul>${toc}</ul></nav>
<div class="book-persons">
${sections}
</div>
${glossary}
<h2 class="book-idx-head">Namenindex</h2>
<div class="name-index">${nameIndex}</div>`;

  return renderReport({
    title: 'Familienbuch',
    subtitle: `${personName(proband)}${lifeYears(proband) ? ' ' + lifeYears(proband) : ''}`,
    meta: `Ahnen des Probanden · ${sortedIds.length} Person${sortedIds.length === 1 ? '' : 'en'} · erstellt am ${generatedOn}`,
    body,
  });
}
