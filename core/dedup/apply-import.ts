// core/dedup/apply-import.ts — Anwenden der Import-Auswahl (BL-106, Spec 20 §1.12).
//
// Gegenstück zu `compare-import.ts`: dort wird gerechnet, hier geschrieben. Die Trennung
// ist Absicht — „was unterscheidet sich" und „was übernehme ich" sind zwei Fragen, und
// eine gemeinsame Funktion könnte man für keine von beiden sauber testen.
//
// Bauweise wie `mergePersons` (BL-103): alles über `editDatabase` (Copy-on-Write,
// ADR-v9-92, der Vorzustand bleibt als Undo-Snapshot brauchbar) und Familienkanten
// AUSSCHLIESSLICH über die synchron haltenden Kommandos aus `integrity.ts` (INV-P3).
// Der Wächter in den Tests ist `findOrphanRefs`, nicht eine von Hand gepflegte Liste
// der referenzierenden Felder.
//
// KEINE UHR, KEIN ZUFALL (TST-3): das Datum der Import-Quelle und die id-Vergabe werden
// injiziert bzw. aus dem Bestand abgeleitet (`allocatorFromDatabase`).
import { editDatabase, type ReadonlyDatabase } from '../model/draft';
import { addChildToFamily, addParentToFamily } from '../model/integrity';
import { allocatorFromDatabase, nextId, type IdAllocator } from '../model/ids';
import { makeSource, makeCitation } from '../model/factory';
import type { Citation, Database, Event, Person, PersonId, RepoId, Repository, Source, SourceId } from '../model/types';
import type { PersonGraph } from './person-duplicates';
import type { ImportMatch } from './compare-import';
import { MERGEABLE_PERSON_FIELDS } from './merge-persons';

/**
 * Die Fremddatei, soweit dieses Kommando sie braucht. `sources` ist optional, aber ohne
 * sie können mitgebrachte Zitate nicht aufgelöst werden — s. `mapCitations`. `Database`
 * erfüllt diesen Typ strukturell.
 */
export interface ImportedFile extends PersonGraph {
  sources?: ReadonlyMap<SourceId, Source>;
  /** Archive der Fremddatei — eine mitgezogene Quelle kann auf eines verweisen. */
  repositories?: ReadonlyMap<RepoId, Repository>;
}

/** Was mit einem abweichenden Feld geschehen soll. Ohne Eintrag gilt `ignore`. */
export type FieldDecision = 'take' | 'both' | 'ignore';

export interface ImportSelections {
  /** Je Import-Person: je Feldschlüssel eine Entscheidung. */
  fields: Readonly<Record<PersonId, Readonly<Record<string, FieldDecision>>>>;
  /** Import-Personen, die vollständig als NEUE Person übernommen werden sollen. */
  importNew: readonly PersonId[];
}

/** Kopfdaten der automatisch angelegten Import-Quelle. `date` wird injiziert (TST-3). */
export interface ImportSourceConfig {
  title: string;
  date: string;
  note?: string;
}

export interface ApplyImportResult {
  db: Database;
  /** Bestandspersonen, an denen tatsächlich etwas geändert wurde. */
  changedPersons: number;
  /** Vollständig neu übernommene Personen. */
  importedPersons: number;
  /** Die angelegte Import-Quelle — `null`, wenn nichts zu belegen war. */
  sourceId: SourceId | null;
  /** Aus der Fremddatei mitgezogene Quellen (Belege übernommener Werte). */
  carriedSources: number;
  /** Mitgezogene Archive — eine Quelle ohne ihr Archiv wäre die nächste hängende Referenz. */
  carriedRepositories: number;
  /** Zitate, deren Quelle in der Fremddatei fehlte und die deshalb entfielen. */
  droppedCitations: number;
}

const FIELD_LABELS = new Map(MERGEABLE_PERSON_FIELDS.map((f) => [f.key, f.label]));

/** Setzt einen Feldwert (Skalar oder Ereignis-Unterfeld) auf der Zielperson. */
function setFieldValue(target: Person, key: string, value: string): void {
  const [head, sub] = key.split('.');
  if (sub) {
    const ev = (target as unknown as Record<string, Event>)[head];
    (ev as unknown as Record<string, string>)[sub] = value;
    return;
  }
  (target as unknown as Record<string, string>)[head] = value;
}

function rawValue(p: Person, key: string): string {
  const [head, sub] = key.split('.');
  const root = (p as unknown as Record<string, unknown>)[head];
  const value = sub ? (root as Record<string, unknown>)[sub] : root;
  return value == null ? '' : String(value);
}

/** Hängt eine Zeile an die Personen-Notiz an (A+B-Fall). */
function appendNote(target: Person, line: string): void {
  target.noteText = target.noteText ? `${target.noteText}\n${line}` : line;
}

/** Belegt ein Ereignis mit der Import-Quelle, sofern noch nicht geschehen. */
function citeEvent(ev: Event, sourceId: SourceId): void {
  if (ev.citations.some((c) => c.sourceId === sourceId)) return;
  ev.citations.push(makeCitation(sourceId));
}

/**
 * Wendet die Auswahl an und liefert einen NEUEN Stand.
 *
 * `matches` stammt aus `compareImport`; Auswahl-Einträge ohne passende Zuordnung werden
 * übersprungen statt zu werfen — die Ansicht kann eine Zuordnung zwischenzeitlich
 * aufgehoben haben („≠ Andere Person"), und ein Absturz wäre die schlechtere Antwort.
 *
 * Die Import-Quelle entsteht NUR, wenn tatsächlich etwas übernommen wird — sonst bliebe
 * nach einem folgenlosen Durchgang eine Karteileiche im Quellenverzeichnis.
 */
export function applyImportPatch(
  base: ReadonlyDatabase,
  imported: ImportedFile,
  matches: readonly ImportMatch[],
  selections: ImportSelections,
  sourceConfig: ImportSourceConfig | null,
): ApplyImportResult {
  const baseIdOf = new Map<PersonId, PersonId>();
  for (const m of matches) if (m.baseId) baseIdOf.set(m.importId, m.baseId);

  const neueIds = new Set(selections.importNew.filter((id) => imported.individuals.has(id)));
  const nimmtEtwas =
    neueIds.size > 0 ||
    Object.entries(selections.fields).some(
      ([importId, felder]) => baseIdOf.has(importId) && Object.values(felder).includes('take'),
    );

  const alloc: IdAllocator = allocatorFromDatabase(base as unknown as Database);
  let sourceId: SourceId | null = null;
  let changedPersons = 0;
  let importedPersons = 0;
  let carriedSources = 0;
  let carriedRepositories = 0;
  let droppedCitations = 0;
  // importId → id im Zielbestand (neu vergeben ODER zugeordnete Bestandsperson)
  const zielId = new Map<PersonId, PersonId>(baseIdOf);

  const db = editDatabase(base, (d) => {
    if (sourceConfig && nimmtEtwas) {
      sourceId = nextId(alloc, 'S');
      d.setSource(
        makeSource(sourceId, {
          title: sourceConfig.title,
          date: sourceConfig.date,
          abbr: 'Import',
          text: sourceConfig.note ?? '',
        }),
      );
    }

    /**
     * Bildet die Zitate eines mitgebrachten Objekts auf den ZIELBESTAND ab.
     *
     * Ein aus der Fremddatei kopiertes Zitat zeigt auf eine Quellen-id JENER Datei — im
     * Zielbestand gibt es sie nicht. Am echten Material (2.795 gegen 2.811 Personen)
     * hinterließ das 6 verwaiste Referenzen (INV-P2); ein Export schriebe `SOUR` auf ein
     * leeres Ziel und beschädigte die Datei.
     *
     * Die Quelle wird deshalb MITGEZOGEN statt das Zitat zu verwerfen: der Beleg ist der
     * genealogisch wertvollste Teil einer Übernahme, und ihn stillschweigend zu
     * schlucken wäre genau der Informationsverlust, den LP-1 verbietet. Jede fremde
     * Quelle wandert genau einmal unter frischer id herüber (`sourceMap`). Nur wenn die
     * Fremddatei die Quelle selbst nicht kennt, entfällt das Zitat — dann gibt es
     * nichts, worauf es zeigen könnte; die Rückgabe meldet die Zahl.
     */
    const sourceMap = new Map<SourceId, SourceId>();
    const repoMap = new Map<RepoId, RepoId>();

    /**
     * Zieht das Archiv einer mitgenommenen Quelle mit. DIESELBE Fehlerklasse eine Ebene
     * tiefer: nach dem Quellen-Fix blieb am echten Material genau EINE Waise übrig —
     * `@S133@.repo → @R02@`, das Archiv der Fremddatei. Wer eine Referenz repariert,
     * sucht die strukturgleichen Geschwister-Stellen.
     *
     * `Source.repo` ist ein Freitext ODER eine `@R…@`-Referenz (Spec 10 §4) — nur die
     * Referenz muss abgebildet werden. Fehlt das Archiv auch in der Fremddatei, wird das
     * Feld geleert statt auf ein Nichts zu zeigen.
     */
    const mapRepo = (repo: string): string => {
      if (!repo.startsWith('@R')) return repo;
      const bekannt = repoMap.get(repo);
      if (bekannt) return bekannt;
      const fremd = imported.repositories?.get(repo);
      if (!fremd) return '';
      const ziel = nextId(alloc, 'R');
      d.setRepository({ ...structuredClone(fremd), id: ziel });
      repoMap.set(repo, ziel);
      carriedRepositories++;
      return ziel;
    };

    const mapCitations = (cits: Citation[]): Citation[] => {
      const out: Citation[] = [];
      for (const c of cits) {
        let ziel = sourceMap.get(c.sourceId);
        if (!ziel) {
          const fremd = imported.sources?.get(c.sourceId);
          if (!fremd) {
            droppedCitations++;
            continue;
          }
          ziel = nextId(alloc, 'S');
          const kopie = structuredClone(fremd);
          d.setSource({ ...kopie, id: ziel, repo: mapRepo(String(kopie.repo ?? '')) });
          sourceMap.set(c.sourceId, ziel);
          carriedSources++;
        }
        out.push({ ...c, sourceId: ziel });
      }
      return out;
    };

    /** Alle Zitat-Töpfe eines Ereignisses bzw. einer Person umschreiben. */
    const mapEventCitations = (ev: Event): void => {
      ev.citations = mapCitations(ev.citations);
    };
    const mapPersonCitations = (p: Person): void => {
      p.topLevelCitations = mapCitations(p.topLevelCitations);
      p.nameCitations = mapCitations(p.nameCitations);
      for (const slot of ['birth', 'chr', 'death', 'buri'] as const) mapEventCitations(p[slot]);
      for (const ev of p.events) mapEventCitations(ev);
      for (const n of p.extraNames) n.citations = mapCitations(n.citations);
      for (const l of p.childOf) l.citations = mapCitations(l.citations);
      for (const a of p.associations) a.citations = mapCitations(a.citations);
    };

    // --- 1. Feld-Übernahmen auf zugeordnete Bestandspersonen ---
    for (const [importId, felder] of Object.entries(selections.fields)) {
      const baseId = baseIdOf.get(importId);
      const importPerson = imported.individuals.get(importId);
      if (!baseId || !importPerson) continue;
      const eintraege = Object.entries(felder).filter(([, e]) => e !== 'ignore');
      if (eintraege.length === 0) continue;

      const ziel = d.person(baseId);
      if (!ziel) continue;
      let geaendert = false;

      for (const [key, decision] of eintraege) {
        if (key.startsWith('event|')) {
          if (decision !== 'take') continue;
          // Kopie, nicht Referenz: sonst teilten Bestand und Fremddatei ein Objekt, und
          // ein späterer Edit am Bestand veränderte still die Vergleichsgrundlage.
          const quelle = importPerson.events.find((ev) => `event|${ev.type}|${ev.date ?? ''}` === key);
          if (!quelle) continue;
          const kopie = structuredClone(quelle);
          mapEventCitations(kopie);
          if (sourceId) citeEvent(kopie, sourceId);
          ziel.events.push(kopie);
          geaendert = true;
          continue;
        }

        const wert = rawValue(importPerson, key);
        if (!wert) continue;

        if (decision === 'both') {
          // Spec 20 §1.12: beide behalten, Import-Wert als Notiz — der Bestandswert
          // bleibt also unangetastet.
          appendNote(ziel, `${FIELD_LABELS.get(key) ?? key} (Import): ${wert}`);
          geaendert = true;
          continue;
        }

        setFieldValue(ziel, key, wert);
        geaendert = true;
        if (sourceId) {
          const [head, sub] = key.split('.');
          if (sub) citeEvent((ziel as unknown as Record<string, Event>)[head], sourceId);
          else if (!ziel.topLevelCitations.some((c) => c.sourceId === sourceId)) {
            ziel.topLevelCitations.push(makeCitation(sourceId));
          }
        }
      }

      if (geaendert) changedPersons++;
    }

    // --- 2. Neue Personen ---
    for (const importId of neueIds) {
      const quelle = imported.individuals.get(importId)!;
      const neueId = nextId(alloc, 'I');
      const kopie = structuredClone(quelle) as Person;
      kopie.id = neueId;
      // Die Beziehungsfelder tragen Ids der FREMDDATEI — sie werden unten aus den
      // Familien der Fremddatei neu aufgebaut, soweit die Gegenstücke mitkommen.
      kopie.childOf = [];
      kopie.parentIn = [];
      mapPersonCitations(kopie);
      if (sourceId && !kopie.topLevelCitations.some((c) => c.sourceId === sourceId)) {
        kopie.topLevelCitations.push(makeCitation(sourceId));
      }
      d.setPerson(kopie);
      zielId.set(importId, neueId);
      importedPersons++;
    }

    // --- 3. Familienbindungen rekonstruieren ---
    if (neueIds.size > 0) {
      for (const fam of imported.families.values()) {
        const husband = fam.husband ? (zielId.get(fam.husband) ?? null) : null;
        const wife = fam.wife ? (zielId.get(fam.wife) ?? null) : null;
        const children = fam.children.map((c) => zielId.get(c)).filter((c): c is PersonId => !!c);

        // Mindestens ZWEI auflösbare Beteiligte — eine Familie mit einem einzigen
        // Mitglied sagt nichts aus und wäre nur eine leere Hülle im Bestand.
        const beteiligte = [husband, wife, ...children].filter(Boolean);
        if (beteiligte.length < 2) continue;
        // Mindestens EINE davon muss neu sein: sonst legte der Import Beziehungen
        // zwischen bestehenden Personen an, die der Nutzer nie ausgewählt hat.
        const hatNeue = beteiligte.some((id) => [...neueIds].some((n) => zielId.get(n) === id));
        if (!hatNeue) continue;

        const familyId = findeOderLegeAn(d, husband, wife, alloc);
        if (husband) addParentToFamily(d, familyId, husband, 'husband');
        if (wife) addParentToFamily(d, familyId, wife, 'wife');
        for (const kind of children) addChildToFamily(d, familyId, kind);
      }
    }
  });

  return { db, changedPersons, importedPersons, sourceId, carriedSources, carriedRepositories, droppedCitations };
}

/** Vorhandene Familie mit genau diesem Elternpaar, sonst eine frische. */
function findeOderLegeAn(
  d: Parameters<Parameters<typeof editDatabase>[1]>[0],
  husband: PersonId | null,
  wife: PersonId | null,
  alloc: IdAllocator,
): string {
  for (const id of d.familyIds()) {
    const fam = d.peekFamily(id);
    if (fam && fam.husband === husband && fam.wife === wife) return id;
  }
  const neueId = nextId(alloc, 'F');
  d.setFamily({
    id: neueId,
    husband: null,
    wife: null,
    children: [],
    marriage: leeresEreignis('MARR'),
    engagement: leeresEreignis('ENGA'),
    events: [],
    noteText: '',
    citations: [],
    tasks: [],
    researchLog: [],
    hypotheses: [],
    lastChanged: '',
  });
  return neueId;
}

function leeresEreignis(type: string): Event {
  return {
    type,
    value: '',
    eventType: '',
    date: null,
    datePhrase: '',
    place: null,
    placeId: null,
    hofId: null,
    lati: null,
    long: null,
    addr: '',
    note: '',
    citations: [],
    media: [],
    seen: false,
    grampsHandle: null,
  };
}
