// ui/views/story/story-templates.ts — die deutschen Erzähl-Satz-Templates des Story-Modus
// (BL-183, Spec 20 §1.10). Reine, DOM-freie Funktionen `Event → Satz` — headless
// unit-testbar. Verhaltens-Orakel: v8 `legacy-v8/ui-story.js` (`_EV_TPL`, `_pronoun`,
// `_fmtDate`/`_atDate`, die `_merge*Sentence`-Helfer). Portiert die Satz-Komposition 1:1.
//
// EINE bewusste Abweichung vom Orakel: die Templates liefern **reinen Text**, nicht
// vor-escapetes HTML (v8 rendert per innerHTML). In v9 escapet die Svelte-Schale beim
// Text-Interpolieren selbst, und der HTML-Download escapet an SEINER Grenze (`esc`,
// story-to-html) — ein einziger Escape-Punkt je Ausgabe statt doppeltem Escaping.
//
// `Event.date` ist in v9 bereits der normalisierte rohe GEDCOM-Datumsstring
// (DateValue = string, core/model/gedcom-date.ts) — genau die Form, die die v8-Helfer
// erwarten; die String-Logik (`FROM…TO…`, `ABT …`, `MAY …`) wird unverändert übernommen.
import type { Event, Person } from '../../../core/model/types';
import { EVENT_LABELS } from '../../islands/timeline/timeline-model';

/** Gegenderte Pronomen/Rollenwörter (Orakel `_pronoun`). Bei unbekanntem Geschlecht
 *  tritt der Vorname an die Stelle von „Er/Sie". */
export interface Pronoun {
  Er: string;
  er: string;
  Sein: string;
  sein: string;
  Sohn: string;
  SohnArt: string;
}

export function pronoun(p: Person): Pronoun {
  const m = p.sex === 'M';
  const f = p.sex === 'F';
  const n = p.given || (p.name || '').split(',')[1]?.trim() || p.name || '';
  return {
    Er: m ? 'Er' : f ? 'Sie' : n,
    er: m ? 'er' : f ? 'sie' : n,
    Sein: m ? 'Sein' : f ? 'Ihr' : 'Sein',
    sein: m ? 'sein' : f ? 'ihr' : 'sein',
    Sohn: m ? 'Sohn' : f ? 'Tochter' : 'Kind',
    SohnArt: m ? 'der' : f ? 'die' : 'das',
  };
}

const MONTHS_DE: Record<string, string> = {
  JAN: 'Januar', FEB: 'Februar', MAR: 'März', APR: 'April',
  MAY: 'Mai', JUN: 'Juni', JUL: 'Juli', AUG: 'August',
  SEP: 'September', OCT: 'Oktober', NOV: 'November', DEC: 'Dezember',
};

const MONTH_YEAR_RE =
  /^(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+\d{4}$/;

/** Erster nicht-leerer Ortsteil vor dem ersten Komma (Orakel `_shortPlace`). */
export function shortPlace(place: string | null | undefined): string {
  if (!place) return '';
  return place.split(',').map((s) => s.trim()).find((s) => s) || '';
}

/** „ in <Adresse, Ort>" oder '' (Orakel `_atPlace`). */
export function atPlace(ev: Pick<Event, 'addr' | 'place'>): string {
  const addrLine = ev.addr ? ev.addr.split('\n')[0].trim() : '';
  const placePart = shortPlace(ev.place);
  const pl = [addrLine, placePart].filter(Boolean).join(', ');
  return pl ? ' in ' + pl : '';
}

/** Rohes GEDCOM-Datum → deutsche Prosa mit Qualifier (Orakel `_fmtDate`). */
export function fmtDate(d: string | null | undefined): string {
  if (!d) return '';
  return d
    .replace(/^FROM\s+(.+?)\s+TO\s+(.+)$/i, 'von $1 bis $2')
    .replace(/^BET\s+(.+?)\s+AND\s+(.+)$/i, 'zwischen $1 und $2')
    .replace(/^BEF\s+/i, 'vor ')
    .replace(/^AFT\s+/i, 'nach ')
    .replace(/^ABT\s+/i, 'um ')
    .replace(/^CAL\s+/i, 'errechnet ')
    .replace(/^EST\s+/i, 'geschätzt ')
    .replace(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/g, (mm) => MONTHS_DE[mm] || mm)
    .replace(
      /\b(\d{1,2})\s+(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\b/g,
      '$1. $2',
    );
}

/** „ (1850)" / „ im Mai 1850" / „ am 10. April 1850" / „ um 1850" (Orakel `_atDate`). */
export function atDate(ev: Pick<Event, 'date'>): string {
  if (!ev.date) return '';
  const raw = ev.date.trim();
  if (/^\d{4}$/.test(raw)) return ' (' + raw + ')';
  const fmt = fmtDate(raw);
  const hasQual = /^(von|zwischen|vor|nach|um|errechnet|geschätzt)\s/.test(fmt);
  if (!hasQual && MONTH_YEAR_RE.test(fmt)) return ' im ' + fmt;
  return ' ' + (hasQual ? '' : 'am ') + fmt;
}

/** Erstes vierstelliges Jahr im Datumsstring (Orakel `_yearFromDate`). */
export function yearFromDate(d: string | null | undefined): number | null {
  if (!d) return null;
  const m = d.match(/\b(\d{4})\b/);
  return m ? parseInt(m[1], 10) : null;
}

/** Arbeitgeber-/Firmenangabe vs. Berufsbezeichnung im OCCU-Wert (Orakel `_isEmployer`). */
export function isEmployer(val: string): boolean {
  return /\b(Gebr\.|Fa\.|Firma|GmbH|AG|KG|OHG|GbR|Co\.|Ltd\.)/i.test(val);
}

/** Abschließende Satzzeichen aus GEDCOM-Werten entfernen (Orakel `_trimVal`). */
export function trimVal(s: string | null | undefined): string {
  return s ? s.replace(/[,;:\s]+$/, '') : '';
}

/** „FROM 1850 TO 1870" → „1850–1870"; gleiches Jahr → „1850" (Orakel `_occuPeriod`). */
export function occuPeriod(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const m = dateStr.match(/^FROM\s+(.+?)\s+TO\s+(.+)$/i);
  if (m) {
    const y1 = yearFromDate(m[1]);
    const y2 = yearFromDate(m[2]);
    if (y1 && y2) return y1 === y2 ? String(y1) : `${y1}–${y2}`;
    return `${fmtDate(m[1])} bis ${fmtDate(m[2])}`;
  }
  const y = yearFromDate(dateStr);
  return y ? String(y) : '';
}

/** Führende/schließende Anführungszeichen entfernen (Orakel `_stripQuotes`). */
export function stripQuotes(s: string | null | undefined): string {
  return s ? s.replace(/^["'”„‘‚]|["'”’‛]$/g, '').trim() : '';
}

/** Partner-Lebensdaten als kurze Klammer: „ (*1820, †1902)" (Orakel `_partnerSpan`). */
export function partnerSpan(birthYear: number | null, deathYear: number | null): string {
  if (!birthYear && !deathYear) return '';
  return ' (' + [birthYear ? '*' + birthYear : '', deathYear ? '†' + deathYear : ''].filter(Boolean).join(', ') + ')';
}

/** Kinderliste als natürlicher Satz (Orakel `_childSentence`). `null` bei leerer Liste. */
export function childSentence(children: readonly { name: string; year: number | null }[]): string | null {
  if (!children.length) return null;
  const withYr = children.map((c) => c.name + (c.year ? ` (*${c.year})` : ''));
  const n = withYr.length;
  const last = withYr[withYr.length - 1];
  const rest = withYr.slice(0, -1);
  if (n === 1) return `Das gemeinsame Kind war ${last}.`;
  if (n <= 3) return `Die gemeinsamen Kinder waren ${rest.join(', ')} und ${last}.`;
  if (n <= 6) return `Das Paar hatte ${n} Kinder: ${rest.join(', ')} und ${last}.`;
  return `Das Paar hatte ${n} Kinder.`;
}

/** Mehrere OCCU-Ereignisse zu einem Satz (Orakel `_mergeOccuSentence`). */
export function mergeOccuSentence(occus: readonly Event[], pr: Pronoun): string {
  const jobs = occus.filter((ev) => ev.value);
  if (!jobs.length) return '';
  if (jobs.length === 1) {
    const ev = jobs[0];
    const date = atDate(ev);
    const place = date ? atPlace(ev) : '';
    if (isEmployer(ev.value)) return `${pr.Er} arbeitete bei ${ev.value}${date}${place}.`;
    return `${pr.Er} war ${ev.value}${date}${place}.`;
  }
  const parts = jobs.map((ev) => {
    const period = occuPeriod(ev.date);
    const label = (isEmployer(ev.value) ? 'bei ' : '') + ev.value;
    return label + (period ? ` (${period})` : '');
  });
  const last = parts[parts.length - 1];
  const rest = parts.slice(0, -1);
  return `${pr.Er} war ${rest.join(', ')} und später ${last}.`;
}

/** Mehrere GRAD-Ereignisse chronologisch (Orakel `_mergeGradSentence`). */
export function mergeGradSentence(grads: readonly Event[], pr: Pronoun): string {
  if (!grads.length) return '';
  const sorted = [...grads].sort((a, b) => (yearFromDate(a.date) ?? Infinity) - (yearFromDate(b.date) ?? Infinity));
  if (sorted.length === 1) {
    const ev = sorted[0];
    const val = ev.value ? stripQuotes(ev.value) : null;
    if (val) return `${pr.Er} erlangte${atDate(ev)}${atPlace(ev)} die ${val}.`;
    return `${pr.Er} erlangte${atDate(ev)}${atPlace(ev)} einen Abschluss.`;
  }
  const parts = sorted.map((ev) => {
    const yr = yearFromDate(ev.date);
    return (ev.value ? stripQuotes(ev.value) : 'Abschluss') + (yr ? ` (${yr})` : '');
  });
  const last = parts[parts.length - 1];
  const rest = parts.slice(0, -1);
  return `${pr.Er} erlangte ${rest.join(', ')} sowie ${last}.`;
}

/** Mehrere EDUC-Ereignisse zu einem Bildungsweg (Orakel `_mergeEducSentence`). */
export function mergeEducSentence(educs: readonly Event[], pr: Pronoun): string {
  if (!educs.length) return '';
  const sorted = [...educs].sort((a, b) => (yearFromDate(a.date) ?? Infinity) - (yearFromDate(b.date) ?? Infinity));
  const educPlace = (val: string, place: string): string => {
    if (!place) return '';
    if (val && val.toLowerCase().includes(place.toLowerCase())) return '';
    return ' in ' + place;
  };
  if (sorted.length === 1) {
    const ev = sorted[0];
    const val = ev.value ? stripQuotes(ev.value) : '';
    const place = shortPlace(ev.place);
    return `${pr.Er} besuchte${val ? ' ' + val : ' eine Schule'}${educPlace(val, place)}${atDate(ev)}.`;
  }
  const parts = sorted.map((ev) => {
    const period = occuPeriod(ev.date);
    const place = shortPlace(ev.place);
    const val = ev.value ? stripQuotes(ev.value) : 'eine Schule';
    return val + educPlace(val, place) + (period ? ` (${period})` : '');
  });
  const last = parts[parts.length - 1];
  const rest = parts.slice(0, -1);
  return `${pr.Er} besuchte ${rest.join(', ')} sowie ${last}.`;
}

/** 3+ RESI-Ereignisse als kompakte Ortsliste; ≤2 bleiben Einzelsätze (Orakel `_mergeResiSentence`). */
export function mergeResiSentence(resis: readonly Event[], pr: Pronoun): string {
  if (!resis.length) return '';
  if (resis.length <= 2) {
    return resis.map((ev) => `${pr.Er} lebte${atPlace(ev)}${atDate(ev)}.`).join(' ');
  }
  const places = resis
    .map((ev) => {
      const addrLine = ev.addr ? ev.addr.split('\n')[0].trim() : '';
      const placePart = shortPlace(ev.place);
      const pl = [addrLine, placePart].filter(Boolean).join(', ');
      if (!pl) return null;
      const yr = yearFromDate(ev.date);
      if (!yr) return pl;
      const fmt = fmtDate(ev.date || '');
      const qm = fmt.match(/^(um|vor|nach|errechnet|geschätzt)\s+/);
      return pl + (qm ? ` (${qm[1]} ${yr})` : ` (${yr})`);
    })
    .filter((x): x is string => x !== null);
  if (!places.length) return '';
  const last = places[places.length - 1];
  const rest = places.slice(0, -1);
  return `${pr.Er} wohnte in ${rest.join(', ')} und ${last}.`;
}

/** FROM-TO-Stationen mit Wert: zunächst/danach/zuletzt (Orakel `_mergeCareerSentence`). */
export function mergeCareerSentence(careers: readonly Event[], pr: Pronoun): string {
  if (!careers.length) return '';
  if (careers.length === 1) {
    const ev = careers[0];
    const period = occuPeriod(ev.date);
    return `${pr.Er} war ${ev.value}${period ? ' (' + period + ')' : ''}${atPlace(ev)}.`;
  }
  const parts = careers.map((ev, i) => {
    const period = occuPeriod(ev.date);
    const val = ev.value + (period ? ` (${period})` : '') + atPlace(ev);
    if (i === 0) return `${pr.Er} war zunächst ${val}`;
    if (i === careers.length - 1) return `zuletzt ${val}`;
    return `danach ${val}`;
  });
  return parts.join('; ') + '.';
}

/** Satz-Template je Ereignistyp (Orakel `_EV_TPL`). Wert stets als reiner Text. */
const EV_TPL: Record<string, (ev: Event, pr: Pronoun) => string> = {
  OCCU: (ev, pr) => `${pr.Er} war ${ev.value || ev.eventType || ''}${atDate(ev)}.`,
  RESI: (ev, pr) => `${pr.Er} lebte${atPlace(ev)}${atDate(ev)}.`,
  EDUC: (ev, pr) => `${pr.Er} erhielt Bildung${ev.value ? ': ' + ev.value : ''}${atPlace(ev)}${atDate(ev)}.`,
  MILI: (ev, pr) => `${pr.Er} leistete Militärdienst${ev.value ? ' (' + ev.value + ')' : ''}${atPlace(ev)}${atDate(ev)}.`,
  EMIG: (ev, pr) => `${pr.Er} wanderte aus${atPlace(ev)}${atDate(ev)}.`,
  IMMI: (ev, pr) => `${pr.Er} wanderte ein${atPlace(ev)}${atDate(ev)}.`,
  NATU: (ev, pr) => `${pr.Er} wurde eingebürgert${atPlace(ev)}${atDate(ev)}.`,
  CONF: (ev, pr) => `${pr.Er} wurde konfirmiert${atPlace(ev)}${atDate(ev)}.`,
  FCOM: (ev, pr) => `${pr.Er} erhielt die Erstkommunion${atPlace(ev)}${atDate(ev)}.`,
  GRAD: (ev, pr) => `${pr.Er} erlangte${atDate(ev)}${atPlace(ev)} ${ev.value ? 'die ' + ev.value : 'einen Abschluss'}.`,
  RELI: (ev, pr) => `${pr.Er} gehörte der Religion ${ev.value || ''} an${atDate(ev)}.`,
  TITL: (ev, pr) => `${pr.Er} trug den Titel ${ev.value || ''}${atDate(ev)}.`,
  CENS: (ev, pr) => `${pr.Er} wurde in einer Volkszählung erfasst${atPlace(ev)}${atDate(ev)}.`,
  RETI: (ev, pr) => `${pr.Er} trat in den Ruhestand${atDate(ev)}.`,
  PROP: (ev, pr) => `${pr.Er} besaß ${ev.value || 'Eigentum'}${atPlace(ev)}${atDate(ev)}.`,
  WILL: (ev, pr) => `${pr.Er} verfasste ein Testament${atDate(ev)}.`,
  PROB: (ev) => `Das Testament wurde eröffnet${atDate(ev)}.`,
  ADOP: (ev, pr) => `${pr.Er} wurde adoptiert${atDate(ev)}.`,
  ORDN: (ev, pr) => `${pr.Er} wurde ordiniert${atPlace(ev)}${atDate(ev)}.`,
  BAPM: (ev, pr) => `${pr.Er} wurde getauft${atPlace(ev)}${atDate(ev)}.`,
};

/**
 * Erzählsatz für ein einzelnes Ereignis (Orakel `_eventSentence`). Nutzt `EV_TPL` je Typ;
 * sonst ein generischer Fluss-Satz aus Wert/Label. `EVENT_LABELS` (Zeitleiste, EINE Quelle
 * für Tag→deutsches Label) liefert den Fallback-Namen.
 */
export function eventSentence(ev: Event, pr: Pronoun): string {
  const fn = EV_TPL[ev.type];
  if (fn) return fn(ev, pr);
  const label = ev.eventType || EVENT_LABELS[ev.type] || ev.type || 'Ereignis';
  if (ev.value && ev.date && /^FROM\s+/i.test(ev.date)) {
    const period = occuPeriod(ev.date);
    return `${pr.Er} war ${trimVal(ev.value)}${period ? ' (' + period + ')' : ''}${atPlace(ev)}.`;
  }
  if (ev.value && ev.date) {
    const raw = ev.date.trim();
    const fmt = fmtDate(raw);
    const isYearOnly = /^\d{4}$/.test(raw);
    const hasQual = /^(von|zwischen|vor|nach|um|errechnet|geschätzt)\s/.test(fmt);
    if (!isYearOnly && !hasQual) {
      const prep = MONTH_YEAR_RE.test(fmt) ? 'Im' : 'Am';
      return `${prep} ${fmt}${atPlace(ev)}: ${trimVal(ev.value)}.`;
    }
  }
  if (ev.value) return `${pr.Er} — ${trimVal(ev.value)}${atDate(ev)}${atPlace(ev)}.`;
  return `${pr.Er} — ${label}${atDate(ev)}${atPlace(ev)}.`;
}
