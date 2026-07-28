// ui/views/reports/local-family-book.ts — Report #11 „Ortssippenbuch" (Familien nach Ort,
// je Familie ein erzählender Kurztext; BL-177, Spec 20 §4, Spec 11 §4). Nutzt die Orts-/
// Hof-Bindung über den Chokepoint (`eventPlaceId`) — kein eigener Ortsabgleich (INV-ARCH-1).
// Reine Renderfunktion auf der geteilten Druck-Hülle (services/reports); Erstell-Datum
// injiziert (TST-3). Verhaltens-Orakel: v8 `ui-print.js` (`_buildOrtssippenbuchHtml`).
import type { Database, Family, Person } from '../../../core/model/types';
import type { PlaceContext } from '../../../core/places';
import { eventPlaceId, placeDisplayName, normPlaceName, slugify } from '../../../core/places';
import { isEventPresent } from '../../../core/model';
import { formatDateForDisplay } from '../../../core/model/gedcom-date';
import { renderReport, esc } from '../../../services/reports';
import { personName, lifeYears, yearOf } from './report-format';

/** Erstes Komma-Segment eines rohen Ortsstrings (atomarer Name ohne Hierarchie). */
function firstSegment(s: string): string {
  return s.split(',')[0].trim();
}

interface PlaceKey {
  /** Gruppierungsschlüssel (stabil: aufgelöste id oder normalisierter Rohtext). */
  key: string;
  /** Anzeigename der Ortsgruppe. */
  label: string;
}

/**
 * Ort einer Familie: Heiratsort, sonst Geburtsort des Mannes, sonst der Frau (Orakel
 * `_famPlace`). Bevorzugt die aufgelöste `placeId` (→ kuratierter Anzeigename), fällt auf
 * das erste Komma-Segment des Rohtexts zurück. null, wenn keine der drei Quellen einen Ort hat.
 */
function familyPlace(db: Database, ctx: PlaceContext, fam: Family): PlaceKey | null {
  const husband = fam.husband ? db.individuals.get(fam.husband) : null;
  const wife = fam.wife ? db.individuals.get(fam.wife) : null;
  const cands = [fam.marriage, husband?.birth, wife?.birth];
  for (const ev of cands) {
    if (!ev || !isEventPresent(ev)) continue;
    const pid = eventPlaceId(ev, ctx);
    if (pid != null) {
      const label = placeDisplayName(ctx.places.byId(pid));
      if (label) return { key: 'id:' + pid, label };
    }
    if (ev.place) {
      const seg = firstSegment(ev.place);
      if (seg) return { key: 'txt:' + normPlaceName(seg), label: seg };
    }
  }
  return null;
}

/** Erzählsatz einer Familie (Orakel `_osbFamNarrative`): Paar, Heirat, Kinder. */
function familyNarrative(db: Database, fam: Family): string {
  const nameOf = (p: Person | null | undefined): string => {
    if (!p) return 'unbekannt';
    const l = lifeYears(p);
    return `${personName(p)}${l ? ' ' + l : ''}`;
  };
  const husband = fam.husband ? db.individuals.get(fam.husband) : null;
  const wife = fam.wife ? db.individuals.get(fam.wife) : null;
  let txt = `<strong>${esc(nameOf(husband))}</strong> und <strong>${esc(nameOf(wife))}</strong>`;

  const marr = fam.marriage;
  const marrParts = isEventPresent(marr)
    ? [formatDateForDisplay(marr.date), firstSegment(marr.place ?? '')].filter(Boolean).join(' in ')
    : '';
  txt += marrParts ? ` heirateten ${esc(marrParts)}.` : ` bildeten eine Familie.`;

  const kids = fam.children.map((cid) => db.individuals.get(cid)).filter((c): c is Person => !!c);
  if (kids.length) {
    const names = kids.map((c) => {
      const yr = yearOf(c.birth) || yearOf(c.chr);
      return esc(personName(c)) + (yr ? ` *${yr}` : '');
    });
    const kidPhrase = kids.length === 1 ? 'ging 1 Kind' : `gingen ${kids.length} Kinder`;
    txt += ` Aus der Verbindung ${kidPhrase} hervor: ${names.join(', ')}.`;
  }
  return txt;
}

interface PlaceGroup {
  label: string;
  fams: Family[];
}

/**
 * Baut das Ortssippenbuch: alle Familien mit Ortsbezug, nach Ort gruppiert (alphabetisch),
 * je Familie ein Erzählsatz (Heirat nach Datum sortiert). `generatedOn` injiziert (TST-3).
 */
export function buildLocalFamilyBook(db: Database, ctx: PlaceContext, generatedOn: string): string {
  const byPlace = new Map<string, PlaceGroup>();
  for (const fam of db.families.values()) {
    const pl = familyPlace(db, ctx, fam);
    if (!pl) continue;
    let g = byPlace.get(pl.key);
    if (!g) {
      g = { label: pl.label, fams: [] };
      byPlace.set(pl.key, g);
    }
    g.fams.push(fam);
  }

  if (!byPlace.size) {
    return renderReport({
      title: 'Ortssippenbuch',
      meta: `erstellt am ${generatedOn}`,
      body: '<p class="report-empty">Keine Familien mit Ortsbezug gefunden.</p>',
    });
  }

  const groups = [...byPlace.values()].sort((a, b) => a.label.localeCompare(b.label, 'de'));

  const toc = groups
    .map((g) => `<li><a href="#osb-${slugify(g.label)}">${esc(g.label)}</a> <em>${g.fams.length}</em></li>`)
    .join('');

  const body = groups
    .map((g) => {
      const fams = g.fams
        .slice()
        .sort((a, b) => (a.marriage.date ?? '').localeCompare(b.marriage.date ?? ''));
      const paras = fams.map((f) => `<p class="osb-fam">${familyNarrative(db, f)}</p>`).join('\n');
      return `<section class="osb-place" id="osb-${slugify(g.label)}">
  <h2>${esc(g.label)} <span class="osb-cnt">${fams.length} Familie${fams.length === 1 ? '' : 'n'}</span></h2>
${paras}
</section>`;
    })
    .join('\n');

  return renderReport({
    title: 'Ortssippenbuch',
    meta: `${groups.length} Ort${groups.length === 1 ? '' : 'e'} · erstellt am ${generatedOn}`,
    body: `<nav class="book-toc"><h2>Orte</h2><ul class="osb-toc">${toc}</ul></nav>\n${body}`,
  });
}
