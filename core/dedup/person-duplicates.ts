// core/dedup/person-duplicates.ts — Duplikat-Erkennung für Personen (BL-62, Spec 20 §1.12,
// ADR-v9-104). Framework-frei, DOM-frei, ohne I/O (INV-ARCH-1/2) — eine reine Funktion
// über einen Personen-/Familien-Graphen.
//
// HERKUNFT DER ZAHLEN: Die Gewichte sind byte-genau die des v8-Orakels
// (`legacy-v8/gedcom.js::_dedupScorePair`), nicht neu erfunden. Spec 20 §1.12 nennt nur
// den Default-Schwellenwert 65; nach der Wert-Ebenen-Regel (CLAUDE.md) genügt ein
// Spec-Bullet ohne Kodierung nicht, um eine eigene Gewichtung zu erfinden. Die Maxima
// summieren sich auf 100:
//
//   Nachname 24 · Vorname 20 · Geschlecht ±11/−15 · Geburtsjahr 16 ·
//   Geburtsort 7 · Vater 7 (5+2) · Mutter 7 (5+2) · bester Partner 8 (5+3)
//
// Drei bewusste Abweichungen vom Orakel:
//  1. `db` wird übergeben statt global gelesen (v8: `AppState.db` mitten im Scoring) —
//     INV-ARCH-1 und die Voraussetzung dafür, dass die Funktion überhaupt testbar ist.
//  2. Der Ortsvergleich nutzt `event.placeId`, wenn beide Seiten aufgelöst sind: gleiche
//     PlaceId = derselbe Ort, unabhängig von der Schreibweise (INV-PLACE). v8 konnte das
//     nicht — dort war `compactPlace` nur eine Whitespace-Normalisierung eines
//     Komma-Strings, kein Identitätsbegriff. Ohne placeId bleibt es beim Textvergleich;
//     das ist direkt nach dem Import der Regelfall (ADR-v9-28/44).
//  3. Geburtsjahr-Abstand > 5 kostet −15 (ADR-v9-106). Die einzige Änderung an der
//     Gewichtung selbst, am echten Bestand belegt — Begründung an der Fundstelle unten.
import type { Person, Family, PersonId, FamilyId } from '../model/types';
import { parseDateValue } from '../model/gedcom-date';

/**
 * Was der Finder vom Bestand braucht — bewusst NICHT `Database`: das Scoring liest
 * Personen und Familien, sonst nichts. `Database` erfüllt diesen Typ strukturell.
 */
export interface PersonGraph {
  individuals: ReadonlyMap<PersonId, Person>;
  families: ReadonlyMap<FamilyId, Family>;
}

/** Ein verdächtiges Paar. Ids statt Objekte — stabil gegenüber Copy-on-Write (ADR-v9-92). */
export interface DuplicateCandidate {
  a: PersonId;
  b: PersonId;
  /** 0..100, gerundet. Kann bei widersprüchlichem Geschlecht negativ ausfallen. */
  score: number;
  /** Klartext-Begründungen für die Ergebnisliste („Nachname identisch" …). */
  reasons: string[];
}

/** Spec 20 §1.12: „einstellbarer Schwellenwert (v8-Default 65)". */
export const DEFAULT_DUPLICATE_THRESHOLD = 65;

/**
 * Stabiler Schlüssel eines PAARES, unabhängig von der Reihenfolge der beiden ids.
 * EINE Definition für alles, was Paare adressiert: der `{#each}`-Schlüssel der
 * Ergebnisliste, die interne Dubletten-Sperre des Finders UND die persistierte
 * „kein Duplikat"-Liste (BL-105). Drei eigene Fassungen wären still inkompatibel,
 * sobald eine davon die Sortierung anders löst — die gespeicherte Liste fände ihre
 * eigenen Einträge dann nicht wieder.
 */
export function pairKey(a: PersonId, b: PersonId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Länge des Bucket-Schlüssels (normalisierter Nachname-Präfix). Der Vergleich ist
 * paarweise quadratisch; ohne Bucketing wären es bei 20.000 Personen (Spec 30 NFR-2)
 * rund 200 Mio. Paare. Der Schlüssel ist der EINE Hebel zwischen Laufzeit und
 * Trefferbreite — s. Kopf von `findPersonDuplicates`.
 */
const BUCKET_KEY_LENGTH = 3;

/**
 * Bucket für Personen ohne verwertbaren Nachnamen — sie werden mit JEDEM Bucket
 * verglichen. Der Wert muss ein Präfix sein, den `normalizeNameForMatch` NIE liefern
 * kann: sie verdichtet Whitespace und schneidet ihn ab, ein führendes Leerzeichen ist
 * also ausgeschlossen. (Vorher stand hier versehentlich ein NUL-Byte — unsichtbar im
 * Editor, und git behandelt eine Datei mit Steuerzeichen als binär, zeigt also keine
 * Diffs mehr. Als TRENNER zusammengesetzter Schlüssel ist NUL im Projekt etabliert
 * und sinnvoll, s. core/model/citation.ts — als sichtbarer Sentinel ist es falsch.)
 */
const NO_NAME_BUCKET = ' ';

// --- Normalisierung ---------------------------------------------------------------

/** Kleinschreibung, Umlaut-/ß-Faltung, Komma→Leerzeichen, Whitespace verdichtet (v8-Fassung). */
export function normalizeNameForMatch(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .trim()
    .replace(/,/g, ' ')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ');
}

/** Levenshtein-Ähnlichkeit 0..1 (1 = identisch). Zwei leere Strings gelten als identisch. */
export function nameSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  const la = a.length;
  const lb = b.length;
  // Nur zwei Zeilen der Matrix — die Namen sind kurz, aber der Aufruf ist heiß
  // (pro Paar bis zu zehn Vergleiche über alle Bucket-Paare hinweg).
  let prev = Array.from({ length: lb + 1 }, (_, j) => j);
  let curr = new Array<number>(lb + 1);
  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    for (let j = 1; j <= lb; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return 1 - prev[lb] / Math.max(la, lb);
}

/** Geburtsjahr aus einem GEDCOM-Datumsstring; `null`, wenn keins ableitbar ist. */
function birthYear(raw: string | null): number | null {
  if (!raw) return null;
  return parseDateValue(raw).year;
}

// --- Achsen des Scores ------------------------------------------------------------

/** Nachname (max 24) — Doppelnamen (Bindestrich/Leerzeichen) komponentenweise, bester Teiltreffer. */
function surnameRatio(a: string, b: string): number {
  let best = nameSimilarity(a, b);
  const partsA = a.split(/[-\s]+/).filter(Boolean);
  const partsB = b.split(/[-\s]+/).filter(Boolean);
  for (const pa of partsA) {
    for (const pb of partsB) {
      const r = nameSimilarity(pa, pb);
      if (r > best) best = r;
    }
  }
  return best;
}

/**
 * Ortsähnlichkeit 0..1. Sind BEIDE Ereignisse auf ein PlaceObject aufgelöst, entscheidet
 * die Identität (INV-PLACE) und nicht die Schreibweise — sonst Textvergleich.
 * `null`, wenn die Achse mangels Daten ganz entfällt.
 */
function placeRatio(person: Person, other: Person): number | null {
  const idA = person.birth.placeId;
  const idB = other.birth.placeId;
  if (idA && idB) return idA === idB ? 1 : 0;
  const textA = normalizeNameForMatch(person.birth.place).slice(0, 40);
  const textB = normalizeNameForMatch(other.birth.place).slice(0, 40);
  if (!textA || !textB) return null;
  return nameSimilarity(textA, textB);
}

/** Beide Elternteile der ERSTEN Elternfamilie (v8-Verhalten: `famc[0]`). */
function parentsOf(graph: PersonGraph, p: Person): { father: Person | null; mother: Person | null } {
  const familyId = p.childOf[0]?.familyId;
  const family = familyId ? graph.families.get(familyId) : undefined;
  if (!family) return { father: null, mother: null };
  return {
    father: (family.husband && graph.individuals.get(family.husband)) || null,
    mother: (family.wife && graph.individuals.get(family.wife)) || null,
  };
}

function spousesOf(graph: PersonGraph, p: Person): Person[] {
  const out: Person[] = [];
  for (const familyId of p.parentIn) {
    const family = graph.families.get(familyId);
    if (!family) continue;
    const otherId = family.husband === p.id ? family.wife : family.husband;
    const other = otherId ? graph.individuals.get(otherId) : undefined;
    if (other) out.push(other);
  }
  return out;
}

/** Namenspaar-Punkte für eine Verwandten-Achse: Nachname ×`snWeight`, Vorname ×`gnWeight`. */
function relativePoints(
  a: Person,
  b: Person,
  snWeight: number,
  gnWeight: number,
): { points: number; surnameRatio: number; givenRatio: number } {
  const sn = nameSimilarity(normalizeNameForMatch(a.surname), normalizeNameForMatch(b.surname));
  const gn = nameSimilarity(normalizeNameForMatch(a.given), normalizeNameForMatch(b.given));
  return { points: sn * snWeight + gn * gnWeight, surnameRatio: sn, givenRatio: gn };
}

// --- Scoring ----------------------------------------------------------------------

/**
 * Ähnlichkeits-Score zweier Personen (0..100, bei Geschlechts-Widerspruch auch darunter).
 * Rein: liest die Graphen, verändert nichts.
 *
 * `graphB` ist der Graph, in dem `b` lebt — Default: derselbe wie `a`. Er wird für den
 * IMPORT-VERGLEICH (BL-63) gebraucht, wo die zweite Person aus einer FREMDEN Datei
 * stammt: ihre `childOf`/`parentIn`-Ids sind Ids JENER Datei und ergeben im Basis-Bestand
 * keinen Sinn.
 *
 * Das v8-Orakel hat hier einen Fehler, der bewusst NICHT nachgebaut wird: sein
 * `_dedupScorePair` liest für beide Seiten `AppState.db` (`legacy-v8/gedcom.js`), und
 * `cmpMatchPersons` (`legacy-v8/compare-engine.js`) ruft es trotzdem mit einer Person aus
 * der Vergleichsdatei auf. Deren Familien-Ids werden damit im FALSCHEN Bestand
 * nachgeschlagen — die Eltern-/Partner-Achsen (bis 22 der 100 Punkte) liefern dort je
 * nach Id-Kollision entweder nichts oder die Verwandten einer fremden Familie.
 */
export function scorePersonPair(
  graph: PersonGraph,
  a: Person,
  b: Person,
  graphB: PersonGraph = graph,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // Nachname (max 24)
  const snA = normalizeNameForMatch(a.surname);
  const snB = normalizeNameForMatch(b.surname);
  if (snA && snB) {
    const r = surnameRatio(snA, snB);
    score += r * 24;
    if (r >= 0.9) reasons.push('Nachname identisch');
    else if (r >= 0.7) reasons.push('Nachname ähnlich');
  }

  // Vorname (max 20)
  const gnA = normalizeNameForMatch(a.given);
  const gnB = normalizeNameForMatch(b.given);
  if (gnA && gnB) {
    const r = nameSimilarity(gnA, gnB);
    score += r * 20;
    if (r >= 0.9) reasons.push('Vorname identisch');
    else if (r >= 0.7) reasons.push('Vorname ähnlich');
  }

  // Geschlecht (+11 / −15). 'U' auf einer Seite lässt die Achse ganz aus — Unwissen
  // ist kein Widerspruch.
  if (a.sex !== 'U' && b.sex !== 'U') {
    if (a.sex === b.sex) {
      score += 11;
    } else {
      score -= 15;
      reasons.push('Geschlecht verschieden');
    }
  }

  // Geburtsjahr (max 16). Fehlt eines, gibt es den neutralen +4-Zuschlag: ein
  // unbekanntes Datum spricht weder für noch gegen das Paar (v8-Verhalten).
  const yearA = birthYear(a.birth.date);
  const yearB = birthYear(b.birth.date);
  if (yearA != null && yearB != null) {
    const diff = Math.abs(yearA - yearB);
    if (diff === 0) {
      score += 16;
      reasons.push('Geburtsjahr identisch');
    } else if (diff <= 1) {
      score += 12;
      reasons.push('Geburtsjahr ±1');
    } else if (diff <= 2) {
      score += 6;
    } else if (diff <= 5) {
      score += 2;
    } else {
      // ADR-v9-106 — die eine Stelle, an der v9 über das Orakel hinausgeht.
      // Das Orakel kennt auf dieser Achse nur Boni: 60 Jahre Abstand kosten nichts,
      // sie bringen bloß nichts ein. Zusammen mit den +14 für gemeinsame Eltern
      // machte das jede Geschwisterreihe eines Dorfstammbaums verdächtig — gemessen
      // 2.436 Verdachtspaare bei 2.795 Personen, davon 942 nachweislich Geschwister.
      // Der Malus ist die Symmetrie zum bereits vorhandenen Geschlechts-Malus (−15):
      // ein BEKANNTER Widerspruch spricht gegen Identität, nicht bloß nicht dafür.
      score -= 15;
      reasons.push('Geburtsjahr weit auseinander');
    }
  } else {
    // Unwissen ist kein Widerspruch — fehlt ein Datum, gibt es weder Bonus noch Malus,
    // sondern den neutralen Zuschlag des Orakels.
    score += 4;
  }

  // Geburtsort (max 7)
  const place = placeRatio(a, b);
  if (place != null) {
    score += place * 7;
    if (place >= 0.9) reasons.push('Geburtsort identisch');
    else if (place >= 0.7) reasons.push('Geburtsort ähnlich');
  }

  // Eltern (max 7 + 7)
  const parentsA = parentsOf(graph, a);
  const parentsB = parentsOf(graphB, b);
  for (const [role, label] of [
    ['father', 'Vater'],
    ['mother', 'Mutter'],
  ] as const) {
    const relA = parentsA[role];
    const relB = parentsB[role];
    if (!relA || !relB) continue;
    const { points, surnameRatio: sn, givenRatio: gn } = relativePoints(relA, relB, 5, 2);
    score += points;
    if (sn >= 0.9 && gn >= 0.85) reasons.push(`${label} identisch`);
    else if (sn >= 0.75) reasons.push(`${label} ähnlich`);
  }

  // Partner (max 8) — nur das BESTE Paar zählt, nicht die Summe: zwei Personen mit je
  // drei Ehen sollen nicht allein durch Menge punkten.
  const spousesA = spousesOf(graph, a);
  const spousesB = spousesOf(graphB, b);
  if (spousesA.length > 0 && spousesB.length > 0) {
    let bestPoints = 0;
    let bestLabel = '';
    for (const sa of spousesA) {
      for (const sb of spousesB) {
        const { points, surnameRatio: sn, givenRatio: gn } = relativePoints(sa, sb, 5, 3);
        if (points > bestPoints) {
          bestPoints = points;
          bestLabel = sn >= 0.9 && gn >= 0.85 ? 'Partner identisch' : sn >= 0.75 ? 'Partner ähnlich' : '';
        }
      }
    }
    score += bestPoints;
    if (bestLabel) reasons.push(bestLabel);
  }

  return { score: Math.round(score), reasons };
}

// --- Finder -----------------------------------------------------------------------

function bucketKey(p: Person): string {
  const normalized = normalizeNameForMatch(p.surname || p.name);
  return normalized.slice(0, BUCKET_KEY_LENGTH) || NO_NAME_BUCKET;
}

/**
 * Sucht verdächtige Personenpaare mit Score ≥ `threshold`, absteigend sortiert.
 * Rein und deterministisch (TST-3): gleiche Eingabe → gleiche Reihenfolge.
 *
 * BUCKETING (v8-Erbe, bewusst übernommen): verglichen wird nur innerhalb eines
 * Nachname-Präfix-Buckets — sonst wären es bei 20.000 Personen (Spec 30 NFR-2) rund
 * 200 Mio. Paare. Der Preis ist benannt und real: ein Tippfehler IM PRÄFIX
 * („Decker"/„Dekker") trennt die beiden Buckets, das Paar wird nie bewertet. Personen
 * ohne verwertbaren Nachnamen liegen in einem eigenen Bucket und werden gegen ALLE
 * anderen geprüft — sie haben kein Präfix, an dem man sie einsortieren könnte, und
 * dürfen deshalb nicht stillschweigend herausfallen.
 */
export function findPersonDuplicates(
  graph: PersonGraph,
  threshold: number = DEFAULT_DUPLICATE_THRESHOLD,
  ignored: ReadonlySet<string> = new Set(),
): DuplicateCandidate[] {
  const buckets = new Map<string, Person[]>();
  for (const p of graph.individuals.values()) {
    const key = bucketKey(p);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(p);
    else buckets.set(key, [p]);
  }

  const results: DuplicateCandidate[] = [];
  const seen = new Set<string>();

  const consider = (a: Person, b: Person): void => {
    if (a.id === b.id) return;
    const key = pairKey(a.id, b.id);
    if (seen.has(key)) return;
    seen.add(key);
    // Vom Nutzer als „kein Duplikat“ abgehaktes Paar (BL-105) — gar nicht erst bewerten.
    if (ignored.has(key)) return;
    const { score, reasons } = scorePersonPair(graph, a, b);
    if (score >= threshold) {
      const [first, second] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
      results.push({ a: first, b: second, score, reasons });
    }
  };

  const nameless = buckets.get(NO_NAME_BUCKET) ?? [];
  for (const [key, bucket] of buckets) {
    for (let i = 0; i < bucket.length - 1; i++) {
      for (let j = i + 1; j < bucket.length; j++) consider(bucket[i], bucket[j]);
    }
    // Namenlose gegen jeden Benannten — s. Kopfkommentar.
    if (key === NO_NAME_BUCKET) continue;
    for (const anon of nameless) {
      for (const named of bucket) consider(anon, named);
    }
  }

  // Score absteigend; bei Gleichstand nach Ids, damit die Reihenfolge stabil ist
  // (Map-Iteration ist Einfügereihenfolge — deterministisch, aber nicht sprechend).
  return results.sort((x, y) => y.score - x.score || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
}
