// core/dedup/compare-import.ts — Import-Vergleich, Kern (BL-63, Spec 20 §1.12).
// Framework-frei, DOM-frei, ohne I/O (INV-ARCH-1/2) — reine Funktionen über zwei
// Personen-/Familien-Graphen. Schreibt NICHTS: das Anwenden der Nutzer-Auswahl ist ein
// eigener Bauabschnitt, damit „was unterscheidet sich" und „was übernehme ich" getrennt
// prüfbar bleiben.
//
// WIEDERVERWENDUNG statt zweitem Scoring: Zuordnung läuft über `scorePersonPair` und
// dasselbe Nachname-Bucketing wie die Duplikat-Erkennung (BL-62) — das Orakel macht es
// ebenso (`cmpMatchPersons` ruft `_dedupScorePair`). Nur die Schwellen unterscheiden
// sich, und die stehen im Spec: ≥75 Übereinstimmung, 40–74 unsicher, <40 neu.
//
// EIN ORAKEL-FEHLER WIRD BEWUSST NICHT NACHGEBAUT: v8 wertet die Eltern-/Partner-Achsen
// für BEIDE Seiten gegen `AppState.db` aus, obwohl die zweite Person aus der Fremddatei
// stammt (s. Kopf von `scorePersonPair`). Hier bekommt jede Seite ihren eigenen Graphen.
import type { Event, Person, PersonId } from '../model/types';
import { scorePersonPair, bucketKey, NAMELESS_BUCKET, type PersonGraph } from './person-duplicates';
import { MERGEABLE_PERSON_FIELDS } from './merge-persons';

/** Spec 20 §1.12: „Übereinstimmung (≥75)". */
export const IMPORT_MATCH_THRESHOLD = 75;
/** Spec 20 §1.12: „Unsicher (40–74)" — darunter gilt die Person als neu. */
export const IMPORT_UNCERTAIN_THRESHOLD = 40;

export type ImportStatus = 'matched' | 'uncertain' | 'new';

export interface ImportMatch {
  /** Person der Fremddatei — der Anker, jede kommt genau einmal vor. */
  importId: PersonId;
  /** Bestandsperson mit dem höchsten Score; `null` bei „new". */
  baseId: PersonId | null;
  score: number;
  reasons: string[];
  status: ImportStatus;
}

export interface FieldDiff {
  /** Feldpfad (`title`, `birth.date`) oder `event|<Typ>|<Datum>` für freie Ereignisse. */
  key: string;
  label: string;
  baseValue: string;
  importValue: string;
}

export interface PersonDiff {
  /** Nur in der Import-Datei gefüllt — im Bestand fehlt der Wert. */
  additions: FieldDiff[];
  /** Beide Seiten gefüllt, aber verschieden. */
  conflicts: FieldDiff[];
  /** Beide Seiten gleich — in der Ansicht ausblendbar, aber nicht verschwiegen. */
  identical: FieldDiff[];
}

// --- Zuordnung --------------------------------------------------------------------

// Bucketing kommt aus dem Finder — dieselbe Schlüsselbildung, EINE Definition
// (s. dort: eine lokale Kopie war bereits still inkompatibel geworden).

/**
 * Ordnet jede Person aus `imported` der bestpassenden Person aus `base` zu und
 * klassifiziert das Ergebnis. Rein und deterministisch (TST-3).
 *
 * Eine Bestandsperson wird HÖCHSTENS EINMAL als sichere Übereinstimmung vergeben
 * (v8-Verhalten): sonst schlüge das Werkzeug vor, zwei Import-Personen auf dasselbe Ziel
 * zu übernehmen, und die zweite Übernahme überschriebe die erste. Für „unsicher" gilt
 * die Sperre NICHT — dort entscheidet ohnehin der Mensch, und ein zweiter Kandidat auf
 * dieselbe Person ist genau die Information, die er zum Entscheiden braucht.
 *
 * Reihenfolge: absteigend nach Score, damit die klarsten Fälle oben stehen. Die Vergabe
 * selbst läuft in Id-Reihenfolge der Import-Datei — sonst hinge das Ergebnis daran,
 * welche Person zuerst iteriert wurde.
 */
export function compareImport(base: PersonGraph, imported: PersonGraph): ImportMatch[] {
  const buckets = new Map<string, Person[]>();
  for (const p of base.individuals.values()) {
    const key = bucketKey(p);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(p);
    else buckets.set(key, [p]);
  }
  const namenlose = buckets.get(NAMELESS_BUCKET) ?? [];

  const belegt = new Set<PersonId>();
  const ergebnis: ImportMatch[] = [];

  for (const importPerson of [...imported.individuals.values()].sort((x, y) => x.id.localeCompare(y.id))) {
    const key = bucketKey(importPerson);
    const kandidaten = key === NAMELESS_BUCKET ? [...base.individuals.values()] : [...(buckets.get(key) ?? []), ...namenlose];

    let bester: { person: Person; score: number; reasons: string[] } | null = null;
    for (const kandidat of kandidaten) {
      if (belegt.has(kandidat.id)) continue;
      const { score, reasons } = scorePersonPair(base, kandidat, importPerson, imported);
      if (!bester || score > bester.score) bester = { person: kandidat, score, reasons };
    }

    if (bester && bester.score >= IMPORT_MATCH_THRESHOLD) {
      belegt.add(bester.person.id);
      ergebnis.push({
        importId: importPerson.id,
        baseId: bester.person.id,
        score: bester.score,
        reasons: bester.reasons,
        status: 'matched',
      });
    } else if (bester && bester.score >= IMPORT_UNCERTAIN_THRESHOLD) {
      ergebnis.push({
        importId: importPerson.id,
        baseId: bester.person.id,
        score: bester.score,
        reasons: bester.reasons,
        status: 'uncertain',
      });
    } else {
      ergebnis.push({ importId: importPerson.id, baseId: null, score: bester?.score ?? 0, reasons: [], status: 'new' });
    }
  }

  return ergebnis.sort((a, b) => b.score - a.score || a.importId.localeCompare(b.importId));
}

// --- Feld-Diff --------------------------------------------------------------------

/** Rohwert eines Feldschlüssels (`surname` oder `birth.date`). */
function rawValue(p: Person, key: string): string {
  const [head, sub] = key.split('.');
  const root = (p as unknown as Record<string, unknown>)[head];
  const value = sub ? (root as Record<string, unknown>)[sub] : root;
  return value == null ? '' : String(value);
}

/** Identität eines freien Ereignisses für den Mengenvergleich (v8: `type|date`). */
function eventKey(ev: Event): string {
  return `event|${ev.type}|${ev.date ?? ''}`;
}

/** Einzeiler eines Ereignisses für die Anzeige. */
function eventSummary(ev: Event): string {
  return [ev.value, ev.addr, ev.date, ev.place, ev.note].filter(Boolean).join(' · ');
}

/**
 * Zerlegt ein zugeordnetes Paar in Ergänzungen · Konflikte · Identisch (Spec 20 §1.12).
 *
 * Die Skalarfelder kommen aus `MERGEABLE_PERSON_FIELDS` — dieselbe Liste wie der
 * Duplikat-Merge. Ein Feld, das das eine Werkzeug kennt und das andere nicht, wäre für
 * den Nutzer nicht erklärbar (ADR-v9-104: EINE Liste).
 *
 * EIN LEERER Import-Wert erzeugt KEINEN Eintrag: „die zweite Datei weiß nichts darüber"
 * ist keine Information, die eine Übernahme rechtfertigt. Sonst böte das Werkzeug an,
 * einen gepflegten Wert durch nichts zu ersetzen.
 */
export function diffPerson(base: Person, imported: Person): PersonDiff {
  const additions: FieldDiff[] = [];
  const conflicts: FieldDiff[] = [];
  const identical: FieldDiff[] = [];

  for (const feld of MERGEABLE_PERSON_FIELDS) {
    const baseValue = rawValue(base, feld.key);
    const importValue = rawValue(imported, feld.key);
    if (!importValue) continue;
    const eintrag: FieldDiff = { key: feld.key, label: feld.label, baseValue, importValue };
    if (!baseValue) additions.push(eintrag);
    else if (baseValue === importValue) identical.push(eintrag);
    else conflicts.push(eintrag);
  }

  // Freie Ereignisse: nur Ergänzungen. Ein Ereignis, das beide Seiten kennen, ist
  // identisch; ein abweichendes ist ein EIGENES Ereignis, kein Konflikt — zwei Berufe
  // in verschiedenen Jahren widersprechen sich nicht.
  const bekannt = new Set(base.events.map(eventKey));
  for (const ev of imported.events) {
    const key = eventKey(ev);
    const eintrag: FieldDiff = {
      key,
      label: ev.type,
      baseValue: '',
      importValue: eventSummary(ev),
    };
    if (bekannt.has(key)) identical.push({ ...eintrag, baseValue: eintrag.importValue });
    else additions.push(eintrag);
  }

  return { additions, conflicts, identical };
}
