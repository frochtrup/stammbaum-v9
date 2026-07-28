// ui/views/reports/place-gazetteer.ts — Report #13 „Ortsbuch" (ortssortiertes
// Nachschlagewerk: Namensvarianten, Verwaltungszugehörigkeit, alle dort verzeichneten
// Ereignisse samt Personen; BL-179, Spec 20 §4, Spec 11 §1). Nachschlage-Struktur,
// abgegrenzt vom Ortssippenbuch #11 (das nach Familien-Narrativ gliedert). Zuordnung über
// den Chokepoint `eventPlaceId` — kein eigener Ortsabgleich (INV-ARCH-1). Reine
// Renderfunktion auf der geteilten Druck-Hülle; Erstell-Datum injiziert (TST-3).
// Verhaltens-Orakel: v8 `ui-print.js` (`_buildOrtsbuchHtml`).
import type { Database, Event, PlaceId } from '../../../core/model/types';
import type { PlaceContext } from '../../../core/places';
import { eventPlaceId, eventYear, placeDisplayName, slugify } from '../../../core/places';
import { isEventPresent } from '../../../core/model';
import { renderReport, esc } from '../../../services/reports';
import { personName } from './report-format';

/** GEDCOM/GRAMPS-Ortstyp → deutsches Substantiv (Orakel `TYPE_LBL`). */
const TYPE_DE: Record<string, string> = {
  Country: 'Land', State: 'Bundesland', Region: 'Region', Province: 'Provinz',
  County: 'Kreis', District: 'Bezirk', Municipality: 'Gemeinde', City: 'Stadt',
  Town: 'Stadt', Village: 'Dorf', Hamlet: 'Weiler', Parish: 'Pfarrei',
  Borough: 'Stadtteil', Locality: 'Ortslage', Neighborhood: 'Nachbarschaft',
  Building: 'Gebäude', Farm: 'Hof', Cemetery: 'Friedhof', Church: 'Kirche',
};

interface PlaceEvent {
  typeLabel: string;
  pid: string;
  year: number | null;
}

/**
 * Baut das Ortsbuch: jeder erfasste Ort mit Typ, Verwaltungszugehörigkeit, historischen
 * Namen, häufigsten Familiennamen und den dort verzeichneten Ereignissen (nach Jahrzehnt).
 * Orte nach Personenzahl absteigend, dann alphabetisch. `generatedOn` injiziert (TST-3).
 */
export function buildPlaceGazetteer(db: Database, ctx: PlaceContext, generatedOn: string): string {
  if (!db.placeObjects.size) {
    return renderReport({
      title: 'Ortsbuch',
      meta: `erstellt am ${generatedOn}`,
      body: '<p class="report-empty">Keine Orte erfasst.</p>',
    });
  }

  // Ereignisse einmalig nach Ort bündeln (Chokepoint eventPlaceId löst id ODER Namen auf).
  const eventsByPlace = new Map<PlaceId, PlaceEvent[]>();
  const push = (pid: PlaceId | null, e: PlaceEvent): void => {
    if (pid == null) return;
    const arr = eventsByPlace.get(pid);
    if (arr) arr.push(e);
    else eventsByPlace.set(pid, [e]);
  };
  for (const p of db.individuals.values()) {
    const at = (label: string, ev: Event): void => {
      if (!isEventPresent(ev)) return;
      push(eventPlaceId(ev, ctx), { typeLabel: label, pid: p.id, year: eventYear(ev) });
    };
    at('Geburt', p.birth);
    at('Taufe', p.chr);
    at('Tod', p.death);
    at('Beerdigung', p.buri);
    for (const ev of p.events) at(ev.eventType || ev.type || 'Ereignis', ev);
  }
  for (const f of db.families.values()) {
    if (!isEventPresent(f.marriage)) continue;
    const pid = eventPlaceId(f.marriage, ctx);
    const year = eventYear(f.marriage);
    for (const sp of [f.husband, f.wife]) {
      if (sp && db.individuals.has(sp)) push(pid, { typeLabel: 'Heirat', pid: sp, year });
    }
  }

  interface Row {
    id: PlaceId;
    label: string;
    events: PlaceEvent[];
    persons: number;
  }
  const rows: Row[] = [];
  for (const po of db.placeObjects.values()) {
    const events = eventsByPlace.get(po.id) ?? [];
    const persons = new Set(events.map((e) => e.pid)).size;
    rows.push({ id: po.id, label: placeDisplayName(po), events, persons });
  }
  rows.sort((a, b) => b.persons - a.persons || a.label.localeCompare(b.label, 'de'));

  const toc = rows
    .map((r) => `<li><a href="#ob-${slugify(r.label)}">${esc(r.label)}</a>${r.persons ? ` <em>${r.persons}</em>` : ''}</li>`)
    .join('');

  const body = rows.map((r) => sectionHtml(db, ctx, r.id, r.label, r.events, r.persons)).join('\n');

  return renderReport({
    title: 'Ortsbuch',
    meta: `${rows.length} Ort${rows.length === 1 ? '' : 'e'} · erstellt am ${generatedOn}`,
    body: `<nav class="book-toc"><h2>Inhaltsverzeichnis</h2><ul class="ob-toc">${toc}</ul></nav>\n${body}`,
  });
}

function sectionHtml(
  db: Database,
  ctx: PlaceContext,
  placeId: PlaceId,
  label: string,
  events: PlaceEvent[],
  persons: number,
): string {
  const po = ctx.places.byId(placeId)!;
  const typeLbl = TYPE_DE[po.type] ?? po.type;

  // Verwaltungszugehörigkeit (Kette ohne den Ort selbst).
  const chain = ctx.places.enclosureChainAsOf(placeId, null).slice(1);
  const hier = chain.length ? `<div class="ob-hier">${esc(chain.join(' › '))}</div>` : '';

  // Historische / datierte Namensvarianten (pnames = zeitliche Achse; DatedName trägt
  // keine Sprache — Übersetzungen wären `translations`, BL-59, noch nicht gebaut).
  const dated = po.pnames.filter((pn) => pn.from != null || pn.to != null);
  let namesHtml = '';
  if (dated.length) {
    const trs = dated
      .map((pn) => {
        const span = pn.from != null && pn.to != null ? `${pn.from}–${pn.to}`
          : pn.from != null ? `ab ${pn.from}` : pn.to != null ? `bis ${pn.to}` : '–';
        return `<tr><td>${esc(span)}</td><td>${esc(pn.value)}</td></tr>`;
      })
      .join('');
    namesHtml = `<div class="ob-sub">Historische Namen</div><table class="ob-table"><tr><th>Zeitraum</th><th>Name</th></tr>${trs}</table>`;
  }

  // Häufigste Familiennamen (distinkte Personen an diesem Ort).
  const surnCount = new Map<string, number>();
  const seenP = new Set<string>();
  for (const e of events) {
    if (seenP.has(e.pid)) continue;
    seenP.add(e.pid);
    const surname = db.individuals.get(e.pid)?.surname;
    if (surname) surnCount.set(surname, (surnCount.get(surname) ?? 0) + 1);
  }
  const topSurn = [...surnCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de')).slice(0, 8);
  const surnHtml = topSurn.length
    ? `<div class="ob-sub">Häufigste Familiennamen</div><div class="ob-surns">${topSurn
        .map(([n, c]) => `<span class="ob-surn-chip">${esc(n)} <em>${c}</em></span>`)
        .join('')}</div>`
    : '';

  // Ereignisse nach Jahrzehnt.
  let evHtml = '';
  if (events.length) {
    const years = events.map((e) => e.year).filter((y): y is number => y != null);
    if (years.length) {
      const bStart = Math.floor(Math.min(...years) / 10) * 10;
      const bEnd = Math.floor(Math.max(...years) / 10) * 10;
      const undated = events.filter((e) => e.year == null);
      const trs: string[] = [];
      for (let d = bStart; d <= bEnd; d += 10) {
        const bevs = events.filter((e) => e.year != null && Math.floor(e.year / 10) * 10 === d);
        if (!bevs.length) continue;
        const pCnt = new Set(bevs.map((e) => e.pid)).size;
        const sample = bevs
          .slice(0, 3)
          .map((e) => `${e.typeLabel}: ${personName(db.individuals.get(e.pid)!)}`)
          .join('; ');
        trs.push(`<tr><td>${d}–${d + 9}</td><td title="${esc(sample)}">${bevs.length}</td><td>${pCnt}</td></tr>`);
      }
      if (undated.length) {
        trs.push(`<tr><td>Ohne Datum</td><td>${undated.length}</td><td>${new Set(undated.map((e) => e.pid)).size}</td></tr>`);
      }
      evHtml = `<div class="ob-sub">Ereignisse nach Zeitraum</div><table class="ob-table"><tr><th>Zeitraum</th><th>Ereignisse</th><th>Personen</th></tr>${trs.join('')}</table>`;
    } else {
      evHtml = `<div class="ob-sub">Ereignisse</div><p>${events.length} Ereignisse (keine Jahreszahlen erfasst)</p>`;
    }
  }

  return `<section class="ob-place" id="ob-${slugify(label)}">
  <h2>${esc(label)}</h2>
  <div class="ob-meta">${typeLbl ? `<span class="ob-badge">${esc(typeLbl)}</span>` : ''}${po.govId ? ` <span class="ob-badge">GOV: ${esc(po.govId)}</span>` : ''} <span class="ob-badge ob-badge--cnt">${persons} Personen · ${events.length} Ereignisse</span></div>
  ${hier}${namesHtml}${surnHtml}${evHtml}
</section>`;
}
