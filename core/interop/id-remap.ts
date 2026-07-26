// core/interop/id-remap.ts — deterministische Modell-id → Ziel-id-Abbildung (BL-156, ADR-v9-127 E2).
//
// Cross-Family-Emission (BL-157/158) baut den Ziel-Baum VON GRUND AUF aus dem Modell. Die
// Modell-`id` bleibt dabei quell-nativ (ADR-v9-127 Entscheidung 2 — Input-IDs werden NICHT
// kanonisiert, weil sie die Korrespondenz zum nativen Passthrough-Baum verankern). Der Output
// vergibt daher FRISCHE ziel-native IDs (GEDCOM `@I1@/@F1@/@S1@/…`; GRAMPS `I0001/F0001/…`
// + Handles) und schreibt jede Referenz über diese Abbildung um.
//
// Verallgemeinerung von `assignNewIds` (gramps-write-back.ts): jenes vergibt nur den NEUEN
// (grampsId-losen) geteilten Records id+Handle in einen BESTEHENDEN Quell-Baum; hier bekommt
// JEDE Modell-Entität eine frische Ziel-id für einen From-Scratch-Baum, formatgeneriseh. Der
// native Write-Back-Pfad bleibt unangetastet (kein Native-Test berührt).
//
// Deterministisch: die Store-Maps (`db.individuals` …) iterieren in Einfüge-Reihenfolge; geteilte
// Events/Zitate werden in fester Owner-Reihenfolge (Personen → Familien; Slots → events[];
// Zitatlisten) durchlaufen — gleiche Eingabe ⇒ gleiche Ausgabe, keine Zufalls-/Zeit-Abhängigkeit.
//
// Reine Funktionen, DOM-/Plattform-frei (INV-ARCH-1), build-frei testbar (INV-ARCH-2).

import type { Database, Person, Family, Event, Citation } from '../model/types';
import { isEventPresent } from '../model/event';

export type TargetFormat = 'gedcom' | 'gramps';

/**
 * Deterministische `Modell-id → Ziel-id`-Abbildung je Entitätsklasse. Record-Entitäten
 * (Person/Familie/Quelle/Repo/Notiz/Medium) sind in JEDEM Zielformat vertreten; Orte/Höfe und
 * geteilte Events/Zitate tragen NUR in GRAMPS eine eigene Wire-ID (GEDCOM: inline → leere Maps).
 * `handle` bildet jede Ziel-id auf ihr GRAMPS-Handle ab (GEDCOM: leer).
 */
export interface IdRemap {
  format: TargetFormat;
  person: Map<string, string>;
  family: Map<string, string>;
  source: Map<string, string>;
  repo: Map<string, string>;
  note: Map<string, string>;
  media: Map<string, string>;
  /** placeobj-`id` → P-id (GRAMPS); GEDCOM: leer (PLAC ist inline-String, kein Xref). */
  place: Map<string, string>;
  /** Hof-`id` → P-id im placeobj-Namespace (GRAMPS, Höfe SIND placeobjs); GEDCOM: leer. */
  hof: Map<string, string>;
  /** geteiltes Event (Objekt-Identität) → E-id (GRAMPS); GEDCOM: leer (Events owned inline). */
  event: Map<Event, string>;
  /** geteiltes Zitat (Objekt-Identität) → C-id (GRAMPS); GEDCOM: leer (Zitate owned inline). */
  citation: Map<Citation, string>;
  /** Ziel-id → GRAMPS-Handle (jede vergebene Ziel-id); GEDCOM: leer. */
  handle: Map<string, string>;
}

/** Fortlaufender Ziel-id-Generator je Präfix. GEDCOM: `@I1@` (1-basiert, unpadded); GRAMPS: `I0001` (4-stellig). */
function makeGen(prefix: string, format: TargetFormat): () => string {
  let n = 0;
  return () => {
    n += 1;
    return format === 'gedcom' ? `@${prefix}${n}@` : `${prefix}${String(n).padStart(4, '0')}`;
  };
}

/**
 * GRAMPS-Handle einer frischen Ziel-id (`_stb` + alphanumerische id). Da die Ziel-ids alle
 * frisch und paarweise verschieden sind, sind auch die Handles kollisionsfrei — dieselbe
 * Konvention wie `neuesHandle` im nativen Write-Back (gramps-write-back.ts).
 */
function handleOf(targetId: string): string {
  return `_stb${targetId.replace(/[^A-Za-z0-9]/g, '')}`;
}

/** Alle „vorhandenen" besessenen Events eines Owners (Slots gefüllt + events[]), Emit-Reihenfolge. */
function personEvents(p: Person): Event[] {
  return [p.birth, p.chr, p.death, p.buri, ...p.events].filter(isEventPresent);
}
function familyEvents(f: Family): Event[] {
  return [f.marriage, f.engagement, ...f.events].filter(isEventPresent);
}

/** Zitate eines Owners in stabiler Reihenfolge — parallel zu buildCitationMap (gramps-write-back). */
function forEachCitationOwner(db: Database, visit: (c: Citation) => void): void {
  for (const p of db.individuals.values()) {
    p.nameCitations.forEach(visit);
    p.topLevelCitations.forEach(visit);
    p.extraNames.forEach((n) => n.citations.forEach(visit));
    p.childOf.forEach((cl) => cl.citations.forEach(visit));
    p.associations.forEach((a) => a.citations.forEach(visit));
    for (const e of personEvents(p)) e.citations.forEach(visit);
  }
  for (const f of db.families.values()) {
    f.citations.forEach(visit);
    for (const e of familyEvents(f)) e.citations.forEach(visit);
  }
}

/**
 * Vergibt jeder Modell-Entität eine frische ziel-native ID (+ GRAMPS-Handle) und liefert die
 * deterministische, injektive Abbildung. Mutiert `db` NICHT — die Zuordnung lebt im Ergebnis;
 * das Referenz-Rewriting geschieht beim Emittieren über `mappedOr(remap.<klasse>, origId)`.
 */
export function remapIdsForFormat(db: Database, format: TargetFormat): IdRemap {
  const r: IdRemap = {
    format,
    person: new Map(),
    family: new Map(),
    source: new Map(),
    repo: new Map(),
    note: new Map(),
    media: new Map(),
    place: new Map(),
    hof: new Map(),
    event: new Map(),
    citation: new Map(),
    handle: new Map(),
  };
  const gramps = format === 'gramps';
  const g = {
    person: makeGen('I', format),
    family: makeGen('F', format),
    source: makeGen('S', format),
    repo: makeGen('R', format),
    note: makeGen('N', format),
    media: makeGen(gramps ? 'O' : 'M', format),
    place: makeGen('P', format),
    event: makeGen('E', format),
    citation: makeGen('C', format),
  };
  // Jede vergebene Ziel-id bekommt (nur GRAMPS) ihr Handle.
  const withHandle = (id: string): string => {
    if (gramps) r.handle.set(id, handleOf(id));
    return id;
  };

  // ── Record-Entitäten: in Store-Reihenfolge (Map = Einfüge-Ordnung) ──
  for (const id of db.individuals.keys()) r.person.set(id, withHandle(g.person()));
  for (const id of db.families.keys()) r.family.set(id, withHandle(g.family()));
  for (const id of db.sources.keys()) r.source.set(id, withHandle(g.source()));
  for (const id of db.repositories.keys()) r.repo.set(id, withHandle(g.repo()));
  for (const id of db.notes.keys()) r.note.set(id, withHandle(g.note()));
  for (const id of db.media.keys()) r.media.set(id, withHandle(g.media()));

  if (gramps) {
    // Orte/Höfe: eigene placeobj-Records (P), Höfe teilen den Namespace mit Orten.
    for (const id of db.placeObjects.keys()) r.place.set(id, withHandle(g.place()));
    for (const id of db.hofObjects.keys()) r.hof.set(id, withHandle(g.place()));
    // Geteilte Events/Zitate: eigene Top-Level-Records (E/C) — Owner-stabile Reihenfolge.
    for (const p of db.individuals.values()) for (const e of personEvents(p)) {
      if (!r.event.has(e)) r.event.set(e, withHandle(g.event()));
    }
    for (const f of db.families.values()) for (const e of familyEvents(f)) {
      if (!r.event.has(e)) r.event.set(e, withHandle(g.event()));
    }
    forEachCitationOwner(db, (c) => {
      if (!r.citation.has(c)) r.citation.set(c, withHandle(g.citation()));
    });
  }

  return r;
}

/**
 * Referenz-Auflösung über die Abbildung: gemappte Original-id → Ziel-id, sonst der
 * Original-Wert unverändert (hängende/Fremd-Referenz bleibt erkennbar, wird NICHT erfunden —
 * dasselbe Prinzip wie `resolveRef` beim GRAMPS-Parse).
 */
export function mappedOr(map: Map<string, string>, origId: string): string {
  return map.get(origId) ?? origId;
}
