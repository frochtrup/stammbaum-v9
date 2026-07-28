// ui/views/reports/farm-chronicle.ts — Report #12 „Hofchronik" (Ort › Hof › Eigentümer/
// Bewohner mit Zu-/Wegzug; BL-178, Spec 20 §4, Spec 11 §7). Trägt das Höfe-
// Alleinstellungsmerkmal in die Ausgabe. Nutzt den Hof-Apparat (`core/places`): Höfe aus
// `db.hofObjects`, Personen-Zuordnung über den Chokepoint `eventHofId` — kein eigener
// Hofabgleich (INV-ARCH-1). Reine Renderfunktion auf der geteilten Druck-Hülle; Erstell-
// Datum injiziert (TST-3). Verhaltens-Orakel: v8 `ui-print.js` (`_buildHofchronikHtml`).
import type { Database, Person, HofId } from '../../../core/model/types';
import type { PlaceContext } from '../../../core/places';
import { eventHofId, placeDisplayName, slugify } from '../../../core/places';
import { getSpouseFamilies } from '../../islands/tree/tree-model';
import { renderReport, esc } from '../../../services/reports';
import { renderMiniMapSvg } from '../../islands/map/mini-map';
import { personName, lifeYears, yearOf, eventLine } from './report-format';

const MARR = '⚭';

/** Eine Hof-Station einer Person (RESI/PROP-Ereignis, auf einen Hof aufgelöst). */
interface Station {
  hofId: HofId;
  type: 'RESI' | 'PROP';
  year: string;
  /** Sortierschlüssel: 4-stelliges Jahr, undatiert ans Ende ('9999'). */
  sortKey: string;
}

/** Erste Zeile / erstes Komma-Segment einer Hof-Adresse. */
function addrFirstLine(addr: string): string {
  return (addr.split('\n')[0] ?? '').split(',')[0].trim();
}

/** Aktuelle (undatierte) Adress-Bezeichnung eines Hofs, erste Zeile. */
function hofTitle(ctx: PlaceContext, hofId: HofId): string {
  return addrFirstLine(ctx.hofs.resolveAddrAsOf(hofId, null) ?? '') || '(ohne Adresse)';
}

/** Adress-Label eines Hofs inkl. Dorf in Klammern (für Zu-/Wegzug-Zeilen). */
function stationLabel(ctx: PlaceContext, hofId: HofId): string {
  const addr = hofTitle(ctx, hofId);
  const hof = ctx.hofs.byId(hofId);
  const village = hof ? placeDisplayName(ctx.places.byId(hof.villageId)) : '';
  if (village && addr && !addr.toLowerCase().includes(village.toLowerCase())) return `${addr} (${village})`;
  return addr || village || '?';
}

/** Alle RESI/PROP-Stationen einer Person, chronologisch (Orakel `_hofPersonStations`). */
function personStations(ctx: PlaceContext, p: Person): Station[] {
  const st: Station[] = [];
  for (const ev of p.events) {
    if (ev.type !== 'RESI' && ev.type !== 'PROP') continue;
    const hofId = eventHofId(ev, ctx);
    if (hofId == null) continue;
    const year = yearOf(ev);
    st.push({ hofId, type: ev.type, year, sortKey: year || '9999' });
  }
  st.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return st;
}

/** Zu-/Wegzug-Zeile für eine Person an einem Hof (Orakel `_hofMoveLine`). */
function moveLine(ctx: PlaceContext, stations: Station[], hofId: HofId): string {
  const at: number[] = [];
  stations.forEach((s, i) => {
    if (s.hofId === hofId) at.push(i);
  });
  if (!at.length) return '';
  const first = at[0];
  const last = at[at.length - 1];
  let prev: Station | null = null;
  let next: Station | null = null;
  for (let i = first - 1; i >= 0; i--) if (stations[i].hofId !== hofId) { prev = stations[i]; break; }
  for (let i = last + 1; i < stations.length; i++) if (stations[i].hofId !== hofId) { next = stations[i]; break; }
  const parts: string[] = [];
  if (prev) parts.push(`zugezogen von ${esc(stationLabel(ctx, prev.hofId))}${prev.year ? ` (${prev.year})` : ''}`);
  if (next) parts.push(`weiter nach ${esc(stationLabel(ctx, next.hofId))}${next.year ? ` (${next.year})` : ''}`);
  return parts.join(' · ');
}

/** Kompakte Familienzeile einer Person (Partner + Kinder; Orakel `_hofFamilyBrief`). */
function familyBrief(db: Database, p: Person): string {
  const lines: string[] = [];
  for (const sf of getSpouseFamilies(db, p.id)) {
    const spouse = sf.spouseId ? db.individuals.get(sf.spouseId) : null;
    const marr = db.families.get(sf.familyId)?.marriage;
    const marrLine = marr ? eventLine(marr) : '';
    let s = spouse
      ? `${MARR} ${esc(personName(spouse))}${lifeYears(spouse) ? ' ' + esc(lifeYears(spouse)) : ''}`
      : `${MARR} unbekannt`;
    if (marrLine) s += ` (${esc(marrLine)})`;
    const kids = sf.children.map((cid) => db.individuals.get(cid)).filter((c): c is Person => !!c);
    if (kids.length) {
      s += ` — Kinder: ${kids.map((c) => {
        const y = yearOf(c.birth) || yearOf(c.chr);
        return esc(personName(c)) + (y ? ` *${y}` : '');
      }).join(', ')}`;
    }
    lines.push(s);
  }
  return lines.length ? `<div class="hc-fam">${lines.join('<br>')}</div>` : '';
}

/** Eine Person-Zeile innerhalb eines Hofs (Rolle, Name, Spanne, Familie, Zu-/Wegzug). */
interface PersonRow {
  pid: string;
  years: string[];
}

function personBlock(db: Database, ctx: PlaceContext, row: PersonRow, hofId: HofId, roleLabel: string): string {
  const p = db.individuals.get(row.pid);
  if (!p) return '';
  const span = row.years.filter(Boolean).join(', ');
  const move = moveLine(ctx, personStations(ctx, p), hofId);
  return `<div class="hc-person">
  <div class="hc-pname"><span class="hc-role">${esc(roleLabel)}</span> <strong>${esc(personName(p))}</strong>${lifeYears(p) ? ` <span class="hc-yrs">${esc(lifeYears(p))}</span>` : ''}${span ? ` <span class="hc-span">${esc(span)}</span>` : ''}</div>
  ${familyBrief(db, p)}
  ${move ? `<div class="hc-move">↪ ${move}</div>` : ''}
</div>`;
}

/** Personen eines Hofs, nach Rolle (PROP=Eigentümer / RESI=Bewohner) und pid dedupliziert. */
interface HofPeople {
  owners: Map<string, PersonRow>;
  residents: Map<string, PersonRow>;
}

function addPerson(map: Map<string, PersonRow>, pid: string, year: string): void {
  let row = map.get(pid);
  if (!row) {
    row = { pid, years: [] };
    map.set(pid, row);
  }
  if (year) row.years.push(year);
}

/**
 * Baut die Hofchronik: Höfe nach Dorf gruppiert, je Hof Eigentümer/Bewohner mit Zu-/Wegzug.
 * `generatedOn` injiziert (TST-3) → deterministisch goldfile-testbar.
 */
export function buildFarmChronicle(db: Database, ctx: PlaceContext, generatedOn: string): string {
  // Personen den Höfen zuordnen (einmaliger Scan aller RESI/PROP-Ereignisse, Chokepoint).
  const peopleByHof = new Map<HofId, HofPeople>();
  const peopleFor = (hofId: HofId): HofPeople => {
    let hp = peopleByHof.get(hofId);
    if (!hp) {
      hp = { owners: new Map(), residents: new Map() };
      peopleByHof.set(hofId, hp);
    }
    return hp;
  };
  for (const p of db.individuals.values()) {
    for (const ev of p.events) {
      if (ev.type !== 'RESI' && ev.type !== 'PROP') continue;
      const hofId = eventHofId(ev, ctx);
      if (hofId == null) continue;
      const hp = peopleFor(hofId);
      addPerson(ev.type === 'PROP' ? hp.owners : hp.residents, p.id, yearOf(ev));
    }
  }

  // Nur Höfe MIT verknüpften Personen chronikwürdig (Orakel `buildHofIndex`: der Index wird
  // AUS den Ereignissen gebaut, kennt also nur bewohnte/besessene Höfe). Die vielen
  // kuratierten, aber unreferenzierten `hofObjects` (Orte-Tab „Ohne Bezug") erzeugen sonst
  // reihenweise „Keine Personen verknüpft"-Karten — Rauschen statt Chronik.
  const chronicled: HofId[] = [];
  for (const hof of db.hofObjects.values()) {
    const hp = peopleByHof.get(hof.id);
    if (hp && (hp.owners.size || hp.residents.size)) chronicled.push(hof.id);
  }
  if (!chronicled.length) {
    return renderReport({
      title: 'Hofchronik',
      meta: `erstellt am ${generatedOn}`,
      body: '<p class="report-empty">Keine Höfe mit verknüpften Personen erfasst.</p>',
    });
  }

  // Chronikwürdige Höfe nach Dorf gruppieren.
  const byVillage = new Map<string, { label: string; hofIds: HofId[] }>();
  for (const hofId of chronicled) {
    const hof = db.hofObjects.get(hofId)!;
    const label = placeDisplayName(ctx.places.byId(hof.villageId)) || 'Ohne Ortsangabe';
    const key = hof.villageId || 'ohne';
    let g = byVillage.get(key);
    if (!g) {
      g = { label, hofIds: [] };
      byVillage.set(key, g);
    }
    g.hofIds.push(hof.id);
  }

  const villages = [...byVillage.values()].sort((a, b) =>
    a.label === 'Ohne Ortsangabe' ? 1 : b.label === 'Ohne Ortsangabe' ? -1 : a.label.localeCompare(b.label, 'de'),
  );

  const toc = villages
    .map((v) => `<li><a href="#hc-${slugify(v.label)}">${esc(v.label)}</a> <em>${v.hofIds.length}</em></li>`)
    .join('');

  const body = villages
    .map((v) => {
      const hoefe = v.hofIds
        .slice()
        .sort((a, b) => hofTitle(ctx, a).localeCompare(hofTitle(ctx, b), 'de'));
      const hofHtml = hoefe
        .map((hofId) => {
          const hof = ctx.hofs.byId(hofId);
          const title = hofTitle(ctx, hofId);
          // Adress-Historie (datierte addrs außer dem aktuellen Titel) als Sub-Zeilen.
          const hist = (hof?.addrs ?? [])
            .filter((a) => a.value && addrFirstLine(a.value) !== title)
            .map((a) => (a.to != null ? `bis ${a.to}: ${a.value}` : a.from != null ? `ab ${a.from}: ${a.value}` : a.value))
            .join(' · ');
          // Geodaten: Text-Koordinate PLUS Mini-Karte (BL-09) — Höfe tragen eigene Koordinaten
          // (Binnenmigration im Dorf, Spec 11 §1); self-contained inline-SVG, gleicher Renderer
          // wie im Steckbrief/Ortsbuch (INV-UI-4).
          const geo = hof && hof.lat != null && hof.long != null
            ? `<div class="hc-hof-geo">📍 ${hof.lat.toFixed(4)}, ${hof.long.toFixed(4)}</div>` +
              `<div class="rep-mini-map">${renderMiniMapSvg({ lat: hof.lat, long: hof.long, label: title })}</div>`
            : '';
          const note = hof?.note ? `<div class="hc-hof-note">${esc(hof.note)}</div>` : '';

          const hp = peopleByHof.get(hofId);
          let people = '';
          if (hp?.owners.size) {
            people += `<div class="hc-sub">Eigentümer</div>`;
            for (const row of hp.owners.values()) people += personBlock(db, ctx, row, hofId, 'Eigentümer');
          }
          if (hp?.residents.size) {
            people += `<div class="hc-sub">Bewohner</div>`;
            for (const row of hp.residents.values()) people += personBlock(db, ctx, row, hofId, 'Bewohner');
          }
          if (!people) people = `<div class="hc-empty">Keine Personen verknüpft</div>`;

          return `<div class="hc-hof">
  <h3>${esc(title)}</h3>${hist ? `\n  <div class="hc-hof-sub">${esc(hist)}</div>` : ''}${geo}${note}
  ${people}
</div>`;
        })
        .join('\n');
      return `<section class="hc-place" id="hc-${slugify(v.label)}"><h2>${esc(v.label)}</h2>\n${hofHtml}</section>`;
    })
    .join('\n');

  return renderReport({
    title: 'Hofchronik',
    meta: `${villages.length} Ort${villages.length === 1 ? '' : 'e'} · ${chronicled.length} ${chronicled.length === 1 ? 'Hof' : 'Höfe'} · erstellt am ${generatedOn}`,
    body: `<nav class="book-toc"><h2>Orte</h2><ul class="hc-toc">${toc}</ul></nav>\n${body}`,
  });
}
