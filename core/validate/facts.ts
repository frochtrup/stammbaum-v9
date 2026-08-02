// core/validate/facts.ts — kleine, geteilte Auskunftsfunktionen über eine Person/
// Familie. Bewusst getrennt von rules.ts: mehrere Regeln stellen dieselbe Frage
// („hat diese Person überhaupt eine Quelle?"), und diese Frage muss EINMAL beantwortet
// sein, nicht je Regel neu (INV-UI-4-Geist, hier im Kern).
import type { Citation, Event, Family, Person, SourceId } from '../model/types';
import type { Hypothesis } from '../research/types';
import { placeYear } from '../places/normalize';

/** Jahr aus einem GEDCOM-Datumsstring; null wenn undatiert/nicht parsbar. */
export function yearOf(date: string | null): number | null {
  return placeYear(date);
}

/** Geburtsjahr mit Taufe als Ersatz (v8-Parität: BIRT, sonst CHR). */
export function birthYear(p: Person): number | null {
  return yearOf(p.birth.date) ?? yearOf(p.chr.date);
}

export function deathYear(p: Person): number | null {
  return yearOf(p.death.date);
}

/** Alle Ereignisse einer Person in einer Liste (die vier Kern-Tags + events[]). */
export function personEvents(p: Person): Event[] {
  return [p.birth, p.chr, p.death, p.buri, ...p.events];
}

/** Alle Ereignisse einer Familie (MARR/ENGA + events[]). */
export function familyEvents(f: Family): Event[] {
  return [f.marriage, f.engagement, ...f.events];
}

/** Jede Zitatstelle einer Person — die vollständige Liste, an EINEM Ort. */
export function personCitations(p: Person): Citation[] {
  const out: Citation[] = [...p.topLevelCitations, ...p.nameCitations];
  for (const ev of personEvents(p)) out.push(...ev.citations);
  for (const n of p.extraNames) out.push(...n.citations);
  for (const a of p.associations) out.push(...a.citations);
  for (const c of p.childOf) out.push(...c.citations);
  return out;
}

/**
 * Ein „Faktum" im Sinne von EVIDENCE_CONFLICT: EINE Zitat-Trägerstelle samt Beschriftung.
 *
 * Geschwister von `personCitations`/`familyCitations` (direkt darüber/darunter), aber mit
 * der Gruppierung, die jene bewusst wegwerfen: dort ist die Frage „hat die Person
 * überhaupt Quellen", hier „welche Quellen sprechen über DIESELBE Aussage". Zwei Zitate
 * an verschiedenen Fakten können sich nicht widersprechen — die flache Liste könnte das
 * nicht auseinanderhalten. Beide Listen müssen dieselben Trägerstellen abdecken; wer eine
 * neue Zitatstelle am Modell ergänzt, zieht beide nach.
 */
export interface CitationFact {
  /** Menschenlesbare Herkunft, erscheint im Befundtext („Geburt", „Ereignis OCCU"). */
  label: string;
  citations: readonly Citation[];
}

/** Fest benannte Ereignis-Slots; alles andere wird über seinen GEDCOM-Tag benannt
 *  (dieselbe Konvention wie EVENT_AFTER_DEATH: „Ereignis OCCU"). */
function eventFact(ev: Event, label: string): CitationFact {
  return { label, citations: ev.citations };
}

export function personCitationFacts(p: Person): CitationFact[] {
  const out: CitationFact[] = [
    { label: 'Person', citations: p.topLevelCitations },
    { label: 'Name', citations: p.nameCitations },
    eventFact(p.birth, 'Geburt'),
    eventFact(p.chr, 'Taufe'),
    eventFact(p.death, 'Tod'),
    eventFact(p.buri, 'Bestattung'),
  ];
  for (const ev of p.events) out.push(eventFact(ev, `Ereignis ${ev.type || '?'}`));
  for (const n of p.extraNames) out.push({ label: 'Namensvariante', citations: n.citations });
  for (const a of p.associations) out.push({ label: 'Personenbezug', citations: a.citations });
  for (const c of p.childOf) out.push({ label: 'Herkunftsfamilie', citations: c.citations });
  return out;
}

export function familyCitationFacts(f: Family): CitationFact[] {
  const out: CitationFact[] = [
    { label: 'Familie', citations: f.citations },
    eventFact(f.marriage, 'Heirat'),
    eventFact(f.engagement, 'Verlobung'),
  ];
  for (const ev of f.events) out.push(eventFact(ev, `Ereignis ${ev.type || '?'}`));
  return out;
}

export function familyCitations(f: Family): Citation[] {
  const out: Citation[] = [...f.citations];
  for (const ev of familyEvents(f)) out.push(...ev.citations);
  return out;
}

/** Hat die Person überhaupt eine Quellenangabe? */
export function hasSources(p: Person): boolean {
  return personCitations(p).length > 0;
}

/**
 * Trägt mindestens ein Zitat eine QUAY-Bewertung?
 *
 * Modellbedingte Abweichung vom v8-Orakel: v8 unterschied „QUAY-Tag fehlt"
 * (`undefined`) von „QUAY 0". Das v9-Zitatmodell kennt `quay: 0 | 1 | 2 | 3` mit 0 als
 * Parser-Default für ein fehlendes Tag (core/interop/gedcom-parse.ts) — die beiden
 * Fälle sind dort nicht mehr unterscheidbar. „Bewertet" heißt deshalb `quay > 0`.
 */
export function hasAnyQuay(p: Person): boolean {
  return personCitations(p).some((c) => (c.quay ?? 0) > 0);
}

/** Trägt mindestens ein Zitat eine Evidenzbewertung (Spec 12 §3, 3-Achsen-Modell)? */
export function hasAnyEval(p: Person): boolean {
  return personCitations(p).some((c) => {
    const e = c.eval;
    return !!e && !!(e.source || e.information || e.evidence || e.informant);
  });
}

/** Offene Hypothesen: alles ausser confirmed/rejected (Spec 12 §4). */
export function openHypotheses(hs: readonly Hypothesis[]): number {
  return hs.filter((h) => h.status !== 'confirmed' && h.status !== 'rejected').length;
}

/** Quell-IDs, auf die eine Zitatliste zeigt (leere Referenzen übersprungen). */
export function citedSourceIds(cits: readonly Citation[]): SourceId[] {
  return cits.map((c) => c.sourceId).filter((s): s is SourceId => !!s);
}

/**
 * Anzeigename einer Person für Befundtexte — nie leer (Fallback: ID).
 *
 * Zuerst given/surname, ERST DANN `name`: `Person.name` ist der rohe GEDCOM-Wert und
 * trägt die Nachnamen-Schrägstriche (`Test /Person/`). Die v8-Vorlage nahm `p.name`
 * direkt und schrieb die Schrägstriche in den Befundtext; hier fallen sie weg, und der
 * Rohwert wird als letzte Rückfallebene von ihnen befreit.
 */
export function personLabel(p: Person): string {
  const composed = `${p.given} ${p.surname}`.trim();
  if (composed) return composed;
  const raw = p.name.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
  return raw || p.id;
}
