// ui/views/stats/stats-model.ts — reine Aggregation für die Statistik-Lens
// (Spec 20 §4 "Statistik-Report (Lebensspannen, Heiratsalter, Histogramme)", Spec 21
// §1.1: Statistik ist eine der fünf Lenses, hier erreichbar über den "Mehr"-Hub-Eintrag —
// Nutzer-Entscheidung: KEIN gemeinsamer Lens-Umschalter für diese Slice, s. Auftrag).
//
// Verhaltens-Orakel: legacy-v8/ui-views-stats.js (renderStatsTab). Portiert die
// Datenaggregation (Kacheln, Geschlecht, Vollständigkeit, Lebensspannen, Heiratsalter,
// Ereignisse/Jahrzehnt, Kinderzahl, Top-Listen, Zeitliche-Verteilung-Fallback) — KEIN
// HTML-String wie im Orakel, stattdessen strukturierte Daten (StatisticsResult), die
// StatisticsView.svelte rendert. Reine Funktion, DOM-frei, damit sie ohne Component-
// Test-Overhead unit-testbar bleibt (Testpyramide, Spec 32 §6).
//
// Bewusste v9-Abweichungen vom Orakel (s. Auftrag):
// - Orte-Kachel: db.placeObjects.size statt einer neu gebauten collectPlaces()-Portierung
//   (die war v8-spezifisch, es gibt in v9 keine Entsprechung).
// - Häufigste Geburts-/Sterbeorte: eventPlaceId(ev,ctx) -> places.byId(placeId)?.title,
//   sonst ev.place roh — KEINE canonicalPlaceLabel()-Portierung (Überbau für diese Slice).
// - Jahr-Extraktion: eventYear() aus core/places (Chokepoint-Nachbarschaft), keine zweite
//   _yearFrom()-Parsing-Funktion.
// - Nachname-Aggregation: surnameCandidate() (ADR-v9-18) statt p.surname direkt — konsistent
//   mit Personen-/Familien-Sortierung (sonst leer bei reiner GEDCOM-Slash-Form).
// - Medien-Zählung: MediaRef.file (core/model/types.ts) — dasselbe Feld wie im Orakel.
// - Quellen-Vorhanden-Check: Person.topLevelCitations/nameCitations + birth/death.citations
//   + events[].citations (alle Citation[]-Fundstellen aus core/model/types.ts).
import type { Database, Event, Person } from '../../../core/model/types';
import type { PlaceContext } from '../../../core/places';
import { eventPlaceId, eventYear } from '../../../core/places';
import { surnameCandidate } from '../../shell/person-display';

export interface Kachel {
  label: string;
  value: number;
}

export interface GenderStats {
  male: number;
  female: number;
  unknown: number;
  total: number;
  malePct: number;
  femalePct: number;
  unknownPct: number;
}

export interface CompletenessRow {
  label: string;
  count: number;
  total: number;
  pct: number;
}

export interface LifespanStats {
  count: number;
  avg: number;
  median: number;
  min: number;
  max: number;
  /** 10-Jahres-Bins, aufsteigend sortiert nach Bin-Start. */
  histogram: { bin: number; count: number }[];
}

export interface MarriageAgeStats {
  count: number;
  avgMale: number | null;
  avgFemale: number | null;
  /** 5-Jahres-Bins, aufsteigend sortiert nach Bin-Start. */
  bins: { bin: number; male: number; female: number }[];
}

export interface DecadeEventStats {
  /** Jahrzehnte (z. B. 1900 für "1900er"), aufsteigend sortiert. */
  decades: number[];
  births: Record<number, number>;
  deaths: Record<number, number>;
  marriages: Record<number, number>;
}

export interface ChildCountRow {
  /** "0".."9" oder "10+". */
  label: string;
  count: number;
}

export interface TopEntry {
  label: string;
  count: number;
}

/** 50-Jahres-Bins (Geburten) — NUR als Fallback gezeigt, wenn dec.decades.length < 3 (Orakel-Parität). */
export interface FallbackTimelineStats {
  bins: { bin: number; count: number }[];
}

export interface StatisticsResult {
  isEmpty: boolean;
  overview: Kachel[];
  gender: GenderStats;
  completeness: CompletenessRow[];
  lifespans: LifespanStats | null;
  marriageAges: MarriageAgeStats | null;
  decadeEvents: DecadeEventStats | null;
  childCounts: ChildCountRow[];
  topSurnames: TopEntry[];
  topGivenNames: TopEntry[];
  topBirthPlaces: TopEntry[];
  topDeathPlaces: TopEntry[];
  /** nur gefüllt, wenn decadeEvents null/leer ist (Orakel-Parität: sonst redundant). */
  fallbackTimeline: FallbackTimelineStats | null;
}

function topN(map: Map<string, number>, n: number): TopEntry[] {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([label, count]) => ({ label, count }));
}

function bump(map: Map<string, number>, key: string | null | undefined): void {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + 1);
}

function hasCitations(ev: Event): boolean {
  return ev.citations.length > 0;
}

function personHasSources(p: Person): boolean {
  if (p.topLevelCitations.length > 0) return true;
  if (p.nameCitations.length > 0) return true;
  if (hasCitations(p.birth) || hasCitations(p.death)) return true;
  return p.events.some(hasCitations);
}

const PHOTO_RE = /\.(jpe?g|png|gif|webp|heic|heif)$/i;

function personHasPhoto(p: Person): boolean {
  return p.media.some((m) => PHOTO_RE.test(m.file));
}

/** Ortsname eines Events: places.byId(placeId)?.title, sonst der rohe ev.place-String. */
function placeLabel(ev: Event, ctx: PlaceContext): string | null {
  const placeId = eventPlaceId(ev, ctx);
  if (placeId != null) {
    const title = ctx.places.byId(placeId)?.title;
    if (title) return title;
  }
  return ev.place ?? null;
}

/** Erstes Namens-Token (Vorname) aus Person.given — Trennzeichen/Satzzeichen entfernt. */
function firstGivenToken(given: string): string {
  const token = (given || '').trim().split(/\s+/)[0] ?? '';
  return token.replace(/[,;.]+$/, '');
}

export function computeStatistics(db: Database, ctx: PlaceContext): StatisticsResult {
  const persons = Array.from(db.individuals.values());
  const families = Array.from(db.families.values());
  const n = persons.length;

  if (n === 0) {
    return {
      isEmpty: true,
      overview: [],
      gender: { male: 0, female: 0, unknown: 0, total: 0, malePct: 0, femalePct: 0, unknownPct: 0 },
      completeness: [],
      lifespans: null,
      marriageAges: null,
      decadeEvents: null,
      childCounts: [],
      topSurnames: [],
      topGivenNames: [],
      topBirthPlaces: [],
      topDeathPlaces: [],
      fallbackTimeline: null,
    };
  }

  // ── Übersicht ──
  const mediaFiles = new Set<string>();
  for (const p of persons) for (const m of p.media) if (m.file) mediaFiles.add(m.file);
  for (const f of families) if (f.marriage.media) for (const m of f.marriage.media) if (m.file) mediaFiles.add(m.file);
  for (const s of db.sources.values()) for (const m of s.media) if (m.file) mediaFiles.add(m.file);

  const overview: Kachel[] = [
    { label: 'Personen', value: n },
    { label: 'Familien', value: families.length },
    { label: 'Quellen', value: db.sources.size },
    { label: 'Orte', value: db.placeObjects.size },
    { label: 'Archive', value: db.repositories.size },
    { label: 'Medien', value: mediaFiles.size },
  ];

  // ── Geschlecht ──
  const male = persons.filter((p) => p.sex === 'M').length;
  const female = persons.filter((p) => p.sex === 'F').length;
  const unknown = n - male - female;
  const malePct = Math.round((male / n) * 100);
  const femalePct = Math.round((female / n) * 100);
  const unknownPct = 100 - malePct - femalePct;
  const gender: GenderStats = { male, female, unknown, total: n, malePct, femalePct, unknownPct };

  // ── Datenvollständigkeit ──
  const hasBirth = persons.filter((p) => p.birth.date || p.birth.place).length;
  const hasDeath = persons.filter((p) => p.death.date || p.death.place).length;
  const hasSex = male + female;
  const hasSrc = persons.filter(personHasSources).length;
  const hasPhoto = persons.filter(personHasPhoto).length;
  const completeness: CompletenessRow[] = [
    { label: 'Geburtsdatum/-ort', count: hasBirth, total: n, pct: Math.round((hasBirth / n) * 100) },
    { label: 'Sterbedatum/-ort', count: hasDeath, total: n, pct: Math.round((hasDeath / n) * 100) },
    { label: 'Geschlecht bekannt', count: hasSex, total: n, pct: Math.round((hasSex / n) * 100) },
    { label: 'Mind. 1 Quelle', count: hasSrc, total: n, pct: Math.round((hasSrc / n) * 100) },
    { label: 'Foto vorhanden', count: hasPhoto, total: n, pct: Math.round((hasPhoto / n) * 100) },
  ];

  // ── Lebensspannen (>= 5 Datenpunkte, plausibles Sterbealter 0..119) ──
  const lifespanValues: number[] = [];
  for (const p of persons) {
    const by = eventYear(p.birth) ?? eventYear(p.chr);
    const dy = eventYear(p.death) ?? eventYear(p.buri);
    if (by != null && dy != null && dy > by && dy - by < 120) lifespanValues.push(dy - by);
  }
  lifespanValues.sort((a, b) => a - b);
  let lifespans: LifespanStats | null = null;
  if (lifespanValues.length >= 5) {
    const avg = Math.round(lifespanValues.reduce((s, v) => s + v, 0) / lifespanValues.length);
    const min = lifespanValues[0];
    const max = lifespanValues[lifespanValues.length - 1];
    const median = lifespanValues[Math.floor(lifespanValues.length / 2)];
    const histMap = new Map<number, number>();
    for (const v of lifespanValues) {
      const bin = Math.floor(v / 10) * 10;
      histMap.set(bin, (histMap.get(bin) ?? 0) + 1);
    }
    const histogram = Array.from(histMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([bin, count]) => ({ bin, count }));
    lifespans = { count: lifespanValues.length, avg, median, min, max, histogram };
  }

  // ── Heiratsalter (>= 3 belegte 5-Jahres-Bins, Alter 10..80 plausibel) ──
  const marrAges: { sex: 'M' | 'F'; age: number }[] = [];
  for (const f of families) {
    const my = eventYear(f.marriage);
    if (my == null) continue;
    const husb = f.husband ? db.individuals.get(f.husband) : null;
    const wife = f.wife ? db.individuals.get(f.wife) : null;
    const hby = husb ? (eventYear(husb.birth) ?? eventYear(husb.chr)) : null;
    const wby = wife ? (eventYear(wife.birth) ?? eventYear(wife.chr)) : null;
    if (hby != null && my - hby >= 10 && my - hby <= 80) marrAges.push({ sex: 'M', age: my - hby });
    if (wby != null && my - wby >= 10 && my - wby <= 80) marrAges.push({ sex: 'F', age: my - wby });
  }
  const marrBinMap = new Map<number, { male: number; female: number }>();
  for (const { sex, age } of marrAges) {
    const bin = Math.floor(age / 5) * 5;
    const row = marrBinMap.get(bin) ?? { male: 0, female: 0 };
    if (sex === 'M') row.male++;
    else row.female++;
    marrBinMap.set(bin, row);
  }
  let marriageAges: MarriageAgeStats | null = null;
  if (marrBinMap.size >= 3) {
    const marrM = marrAges.filter((a) => a.sex === 'M').map((a) => a.age);
    const marrF = marrAges.filter((a) => a.sex === 'F').map((a) => a.age);
    const avgMale = marrM.length ? Math.round(marrM.reduce((s, v) => s + v, 0) / marrM.length) : null;
    const avgFemale = marrF.length ? Math.round(marrF.reduce((s, v) => s + v, 0) / marrF.length) : null;
    const bins = Array.from(marrBinMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([bin, v]) => ({ bin, male: v.male, female: v.female }));
    marriageAges = { count: marrAges.length, avgMale, avgFemale, bins };
  }

  // ── Ereignisse pro Jahrzehnt (>= 3 belegte Jahrzehnte) ──
  const decBirth = new Map<number, number>();
  const decDeath = new Map<number, number>();
  const decMarr = new Map<number, number>();
  for (const p of persons) {
    const y = eventYear(p.birth) ?? eventYear(p.chr);
    if (y != null) {
      const d = Math.floor(y / 10) * 10;
      decBirth.set(d, (decBirth.get(d) ?? 0) + 1);
    }
  }
  for (const p of persons) {
    const y = eventYear(p.death);
    if (y != null) {
      const d = Math.floor(y / 10) * 10;
      decDeath.set(d, (decDeath.get(d) ?? 0) + 1);
    }
  }
  for (const f of families) {
    const y = eventYear(f.marriage);
    if (y != null) {
      const d = Math.floor(y / 10) * 10;
      decMarr.set(d, (decMarr.get(d) ?? 0) + 1);
    }
  }
  const decadeKeys = Array.from(new Set([...decBirth.keys(), ...decDeath.keys(), ...decMarr.keys()])).sort(
    (a, b) => a - b,
  );
  let decadeEvents: DecadeEventStats | null = null;
  if (decadeKeys.length >= 3) {
    decadeEvents = {
      decades: decadeKeys,
      births: Object.fromEntries(decBirth),
      deaths: Object.fromEntries(decDeath),
      marriages: Object.fromEntries(decMarr),
    };
  }

  // ── Kinderzahl pro Familie (>= 2 belegte Werte) ──
  const childMap = new Map<string, number>();
  for (const f of families) {
    const c = f.children.length;
    const key = c >= 10 ? '10+' : String(c);
    childMap.set(key, (childMap.get(key) ?? 0) + 1);
  }
  const childCounts: ChildCountRow[] =
    childMap.size >= 2
      ? Array.from(childMap.entries())
          .sort((a, b) => {
            const av = a[0] === '10+' ? 10 : Number(a[0]);
            const bv = b[0] === '10+' ? 10 : Number(b[0]);
            return av - bv;
          })
          .map(([label, count]) => ({ label, count }))
      : [];

  // ── Top-Listen ──
  const surnMap = new Map<string, number>();
  for (const p of persons) bump(surnMap, surnameCandidate(p).trim() || null);
  const topSurnames = topN(surnMap, 10);

  const givenMap = new Map<string, number>();
  for (const p of persons) bump(givenMap, firstGivenToken(p.given) || null);
  const topGivenNames = topN(givenMap, 10);

  const bplMap = new Map<string, number>();
  for (const p of persons) bump(bplMap, placeLabel(p.birth, ctx));
  const topBirthPlaces = topN(bplMap, 8);

  const dplMap = new Map<string, number>();
  for (const p of persons) bump(dplMap, placeLabel(p.death, ctx));
  const topDeathPlaces = topN(dplMap, 8);

  // ── Fallback "Zeitliche Verteilung" (50-Jahres-Bins, Geburten) — nur wenn das
  // Jahrzehnt-Diagramm mangels Daten nicht gezeigt wird (Orakel-Parität, sonst redundant).
  let fallbackTimeline: FallbackTimelineStats | null = null;
  if (!decadeEvents) {
    const binMap = new Map<number, number>();
    for (const p of persons) {
      const y = eventYear(p.birth) ?? eventYear(p.chr);
      if (y != null) {
        const bin = Math.floor(y / 50) * 50;
        binMap.set(bin, (binMap.get(bin) ?? 0) + 1);
      }
    }
    if (binMap.size > 1) {
      fallbackTimeline = {
        bins: Array.from(binMap.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([bin, count]) => ({ bin, count })),
      };
    }
  }

  return {
    isEmpty: false,
    overview,
    gender,
    completeness,
    lifespans,
    marriageAges,
    decadeEvents,
    childCounts,
    topSurnames,
    topGivenNames,
    topBirthPlaces,
    topDeathPlaces,
    fallbackTimeline,
  };
}
