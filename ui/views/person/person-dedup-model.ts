// ui/views/person/person-dedup-model.ts — Ansichts-Modell der Duplikat-Erkennung
// (BL-104, Spec 20 §1.12). Reine Funktionen über dem Kern-Finder (`core/dedup`) — keine
// eigene Scoring- oder Merge-Logik, nur Aufbereitung für die Anzeige.
import type { Person, PersonId } from '../../../core/model/types';
import type { PlaceContext } from '../../../core/places';
import type { DuplicateCandidate, PersonGraph } from '../../../core/dedup';
import { findPersonDuplicates, MERGEABLE_PERSON_FIELDS } from '../../../core/dedup';
import { displayName, eventPlaceLabel, fullDateLabel, yearPlaceSummary } from '../../shell/person-display';

export interface DedupPairRow {
  /** Stabiler Schlüssel für `{#each}` — die beiden ids, aufsteigend. */
  key: string;
  a: PersonId;
  b: PersonId;
  score: number;
  reasons: string[];
  labelA: string;
  labelB: string;
  /** Kurzkontext je Seite („* 1850, Ochtrup") — ohne ihn sind gleichnamige Zeilen blind. */
  metaA: string;
  metaB: string;
  /** Gewinner-VORSCHLAG (Datenreichtum). Der Nutzer kann im Modal tauschen. */
  suggestedWinner: PersonId;
}

/**
 * Datenreichtum einer Person — Gewinner-Vorschlag im Merge-Modal (v8 `_richness`).
 * Bewusst NICHT `pickWinnerId` aus ui/shell/curation-dedup.ts: dessen Heuristik
 * (Verwendungszahl → Koordinaten → Notiz) ist für Orte/Höfe formuliert und hat für
 * Personen keine Entsprechung. Ein gemeinsamer Mechanismus für zwei fachlich
 * verschiedene Heuristiken wäre Erfinden, nicht Wiederverwenden.
 */
export function personRichness(p: Person): number {
  return (
    (p.name ? 1 : 0) +
    (p.birth.date ? 2 : 0) +
    (p.birth.place ? 1 : 0) +
    (p.death.date ? 2 : 0) +
    (p.death.place ? 1 : 0) +
    p.events.length +
    p.topLevelCitations.length +
    p.media.length
  );
}

/**
 * Kurzkontext der Ergebniszeile. `yearPlaceSummary` (Jahr + KURZNAME), nicht
 * `dateSummary`/`eventPlaceLabel` — die Ergebnisliste ist eine Disambiguierungsliste,
 * und dort ist die volle Verwaltungskette Rauschen (INV-UI-6, so auch im Kopf von
 * `yearPlaceSummary` festgehalten).
 *
 * Am echten Bestand ist der Unterschied nicht kosmetisch: mit der vollen Kette lautete
 * eine Zeile „* 28. November 1891, Ochtrup, Amt Ochtrup, Kreis Steinfurt, Provinz
 * Westfalen, Königreich Preußen, Deutsches Reich ↔ * 1891, Ochtrup, …" und lief über
 * drei Zeilen, bevor überhaupt der zweite Name kam. Im Merge-Modal bleibt die volle
 * Kette dagegen richtig — dort wird genau dieser Wert verglichen.
 */
function meta(p: Person, ctx: PlaceContext): string {
  const summary = yearPlaceSummary(p.birth, ctx);
  return summary ? `* ${summary}` : '';
}

function toRow(db: PersonGraph, ctx: PlaceContext, hit: DuplicateCandidate): DedupPairRow | null {
  const a = db.individuals.get(hit.a);
  const b = db.individuals.get(hit.b);
  if (!a || !b) return null;
  return {
    key: `${hit.a}|${hit.b}`,
    a: hit.a,
    b: hit.b,
    score: hit.score,
    reasons: hit.reasons,
    labelA: displayName(a),
    labelB: displayName(b),
    metaA: meta(a, ctx),
    metaB: meta(b, ctx),
    suggestedWinner: personRichness(a) >= personRichness(b) ? hit.a : hit.b,
  };
}

/**
 * Baut die Ergebnisliste. `query` filtert über beide Namen und ids (Spec 20 §1.12
 * „Ergebnisliste durchsuchbar") — der Filter wirkt auf die Anzeige, nicht auf das
 * Scoring, damit die Trefferzahl unter der Suche stabil bleibt.
 */
export function buildPersonDedupRows(
  db: PersonGraph,
  ctx: PlaceContext,
  threshold: number,
  query = '',
): DedupPairRow[] {
  const rows = findPersonDuplicates(db, threshold)
    .map((hit) => toRow(db, ctx, hit))
    .filter((r): r is DedupPairRow => r !== null);
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) =>
    [r.labelA, r.labelB, r.a, r.b].some((s) => s.toLowerCase().includes(q)),
  );
}

export interface CompareRow {
  key: string;
  label: string;
  /** Anzeigewert je Seite (projiziert — Orte über den Chokepoint, INV-UI-14). */
  displayA: string;
  displayB: string;
  /** true, wenn beide Seiten denselben ROHWERT tragen — dann gibt es nichts zu wählen. */
  equal: boolean;
}

/** Rohwert eines Feldschlüssels (`surname` oder `birth.date`) — die Merge-Wahrheit. */
function rawValue(p: Person, key: string): string {
  const [head, sub] = key.split('.');
  const root = (p as unknown as Record<string, unknown>)[head];
  const value = sub ? (root as Record<string, unknown>)[sub] : root;
  return value == null ? '' : String(value);
}

/**
 * Baut die Vergleichszeilen des Merge-Modals — EINE Zeile je Eintrag in
 * `MERGEABLE_PERSON_FIELDS`, damit Modal und Kommando nicht auseinanderdriften
 * (ADR-v9-104: ein im Modal wählbares Feld, das das Kommando ignoriert, wäre eine
 * stumm verworfene Nutzerentscheidung).
 *
 * WICHTIG — Gleichheit wird am ROHWERT entschieden, angezeigt wird die Projektion:
 * zwei verschiedene Orts-Rohwerte können dieselbe Beschriftung tragen (dieselbe
 * PlaceId, andere Schreibweise). Würde die Gleichheit an der Anzeige hängen, verschwände
 * die Wahl genau dort, wo sie den Unterschied macht.
 */
export function buildCompareRows(a: Person, b: Person, ctx: PlaceContext): CompareRow[] {
  const display = (p: Person, key: string): string => {
    const [head, sub] = key.split('.');
    if (sub === 'place') {
      const ev = (p as unknown as Record<string, never>)[head];
      return eventPlaceLabel(ev, ctx);
    }
    if (sub === 'date') {
      const ev = (p as unknown as Record<string, never>)[head];
      return fullDateLabel(ev);
    }
    return rawValue(p, key);
  };
  return MERGEABLE_PERSON_FIELDS.map((f) => ({
    key: f.key,
    label: f.label,
    displayA: display(a, f.key),
    displayB: display(b, f.key),
    equal: rawValue(a, f.key) === rawValue(b, f.key),
  }));
}

/** Elternnamen einer Person, für die Kontextzeile im Modal. */
export function parentNames(db: PersonGraph, p: Person): string {
  const names: string[] = [];
  for (const link of p.childOf) {
    const fam = db.families.get(link.familyId);
    if (!fam) continue;
    const pair = [fam.husband, fam.wife]
      .map((id) => (id ? db.individuals.get(id) : undefined))
      .filter((x): x is Person => !!x)
      .map(displayName);
    if (pair.length) names.push(pair.join(' & '));
  }
  return names.join('; ');
}

/** Partnernamen einer Person, für die Kontextzeile im Modal. */
export function partnerNames(db: PersonGraph, p: Person): string {
  const names: string[] = [];
  for (const familyId of p.parentIn) {
    const fam = db.families.get(familyId);
    if (!fam) continue;
    const otherId = fam.husband === p.id ? fam.wife : fam.husband;
    const other = otherId ? db.individuals.get(otherId) : undefined;
    names.push(other ? displayName(other) : '(unbekannt)');
  }
  return names.join(', ');
}

/** Nicht wählbare Kontextzeilen (Eltern, Partner, id) — Orientierung, keine Merge-Wahl. */
export function contextRows(
  db: PersonGraph,
  a: Person,
  b: Person,
): { label: string; valueA: string; valueB: string }[] {
  return [
    { label: 'Eltern', valueA: parentNames(db, a), valueB: parentNames(db, b) },
    { label: 'Partner', valueA: partnerNames(db, a), valueB: partnerNames(db, b) },
    { label: 'ID', valueA: a.id, valueB: b.id },
  ];
}
