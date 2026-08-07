// core/model/draft.ts — Copy-on-Write-Primitive für Editier-Kommandos (ADR-v9-92, BL-01).
//
// WARUM ES DAS GIBT
// Undo/Redo hält laut ADR-v9-92 Referenz-Snapshots: ein Snapshot ist ein neues Database,
// dessen Entitäts-Maps FLACH kopiert sind — unveränderte Entitäten werden zwischen
// Snapshots geteilt (gemessen 0,43 MiB je Snapshot statt 43,8 MiB Tiefkopie). Diese
// Bauweise trägt aber nur, wenn kein Kommando eine Entität in-place ändert, die ein
// zurückgehaltener Snapshot noch referenziert. Vor diesem Modul taten das nahezu alle
// Editier-Kommandos (Aufgaben, Protokoll, Hypothesen, saveFamily/integrity, Orts-Merges) —
// am Code belegt: ein Snapshot nach ADR-Definition sah `addTask`-Änderungen sofort mit.
//
// ADR-v9-92 verwarf das Inverskommando-Muster u. a. wegen „einer dauerhaften, nicht
// mechanisch prüfbaren Sorgfaltspflicht". Genau die entstünde beim Copy-on-Write-Weg
// ebenfalls, wenn jedes künftige Kommando bloß daran DENKEN müsste zu klonen. Deshalb ist
// die Pflicht hier compiler-erzwungen statt dokumentiert (dieselbe Härtungslogik wie
// `resetKey` in ADR-v9-83 und `onUrlChange` in ADR-v9-86): ein Kommando nimmt seine
// Datenbank als `ReadonlyDatabase` entgegen — jede In-Place-Mutation ist dann ein
// TYPFEHLER — und bekommt bearbeitbare Objekte ausschließlich über den Draft.
//
// ABGRENZUNG: Der LADE-Pfad bleibt bewusst mutierbar (`Database`). Parser, Fixtures und
// `applyPlaceResolution` bauen eine Datenbank auf, statt eine bestehende zu editieren —
// und der volle Lade-Pass ist laut ADR-v9-92 Punkt 5 ausdrücklich KEIN Undo-Eintrag (der
// Stack wird beim Laden geleert). Eine pauschale Readonly-Typisierung von `Database` wurde
// gemessen und verworfen: 977 Compiler-Fehler, 692 davon in Test-Setup-Code, der mit der
// Undo-Korrektheit nichts zu tun hat.
import type {
  Database,
  Event,
  Family,
  FamilyId,
  Person,
  PersonId,
  Repository,
  RepoId,
  Source,
  SourceId,
} from './types';
import { klonen } from '../clone-diagnose';

/** Die Sonder-Ereignisslots von Person bzw. Familie (neben dem freien `events[]`-Array). */
const PERSON_EVENT_FIELDS = ['birth', 'chr', 'death', 'buri'] as const;
const FAMILY_EVENT_FIELDS = ['engagement', 'marriage'] as const;

/**
 * Rekursiv unveränderlich — greift anders als `Readonly<T>` auch eine Ebene tiefer und
 * verbietet damit `p.tasks.push(…)` / `fam.children.push(…)`, die häufigste Form der
 * versehentlichen Snapshot-Mutation.
 */
export type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends Map<infer K, infer V>
    ? ReadonlyMap<K, DeepReadonly<V>>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

/**
 * Eingefrorene Sicht auf eine Datenbank — die Eingabe jedes Editier-Kommandos.
 * `Database` ist hierauf zuweisbar, Aufrufer brauchen also keinen Cast.
 */
export type ReadonlyDatabase = DeepReadonly<Database>;

/**
 * Bearbeitbarer Entwurf innerhalb von `editDatabase`. Entitäten werden beim ERSTEN Zugriff
 * geklont und danach zwischengespeichert — wer nie zugegriffen hat, bleibt mit dem
 * Vorzustand referenzgleich (das ist die Copy-on-Write-Eigenschaft selbst).
 */
export interface DatabaseDraft {
  /** Bearbeitbare Kopie der Person; `null` bei unbekannter id (kein stiller Abbruch). */
  person(id: PersonId): Person | null;
  /** Bearbeitbare Kopie der Familie; `null` bei unbekannter id. */
  family(id: FamilyId): Family | null;
  /** Upsert einer vollständigen Person (`savePerson(model)`-Muster). */
  setPerson(next: Person): void;
  /** Entfernt eine Person. No-Op bei unbekannter id. */
  removePerson(id: PersonId): void;
  setFamily(next: Family): void;
  removeFamily(id: FamilyId): void;
  setSource(next: Source): void;
  removeSource(id: SourceId): void;
  setRepository(next: Repository): void;
  removeRepository(id: RepoId): void;
  /** IDs zum Iterieren, OHNE dabei zu klonen (für Kommandos, die viele Entitäten prüfen,
   *  aber nur wenige ändern — z. B. Orts-Merges über alle Ereignisse). */
  personIds(): PersonId[];
  familyIds(): FamilyId[];
  /**
   * NUR-LESENDER Blick auf den Vorzustand — taut nichts auf. Das Gegenstück zu
   * `personIds()` für das Muster „viele prüfen, wenige ändern": erst `peek*` zum Filtern,
   * dann `person()`/`family()` nur für die Treffer. Ohne diesen Weg müsste ein Kaskaden-
   * Kommando jede Entität auftauen, um sie überhaupt anzusehen — das wäre exakt die
   * Tiefkopie, die ADR-v9-92 vermeidet.
   */
  peekPerson(id: PersonId): DeepReadonly<Person> | null;
  peekFamily(id: FamilyId): DeepReadonly<Family> | null;
  /**
   * Bearbeitbare Kopie EINES Ereignisses, adressiert über die Objekt-Identität des im
   * Vorzustand lebenden Events (`null`, wenn es dort nicht vorkommt).
   *
   * WARUM ÜBER IDENTITÄT: Ereignisse haben keine eigene id und liegen verschachtelt in
   * `Person.birth/chr/death/buri/events[]` bzw. `Family.engagement/marriage/events[]`.
   * Die Review-/Detail-Ansichten reichen sie bereits als echte Objekt-Referenz durch
   * (place-review-model.ts: „`event` MUSS das echte, in Person/Family lebende Objekt
   * sein"). Diese vorhandene Adressierung wird hier weiterverwendet, statt quer durch
   * fünf Modelle ein zweites Adressierungs-Konzept (Owner + Slot) einzuführen — ein
   * Mechanismus, nicht pro View neu erfunden (INV-UI-4).
   *
   * Klont NUR den gefundenen Owner, nicht die durchsuchten — der Scan liest den
   * eingefrorenen Stand.
   */
  event(target: DeepReadonly<Event> | Event): Event | null;
}

/**
 * Die EINZIGE Stelle, an der die Readonly-Zusicherung aufgehoben wird — bewusst zentral,
 * damit sie prüfbar bleibt statt an ~20 Kommandos verstreut zu sein. Das Klonen trifft
 * hier immer genau EINE Entität (nicht die Datenbank), ist also der kleine, lokale Preis
 * des Copy-on-Write, nicht die verworfene Tiefkopie.
 */
function thaw<T>(frozen: DeepReadonly<T>): T {
  // `klonen` statt nacktem `structuredClone`: schlägt das Kopieren fehl, nennt die Meldung
  // Pfad und Feld statt nur „The object can not be cloned." (core/clone-diagnose.ts). Im
  // Normalfall — jedem einzelnen Edit — kostet der try-Block nichts.
  return klonen(frozen, 'Kopie eines Datensatzes zum Bearbeiten') as T;
}

/**
 * Wendet `next` auf JEDES Ereignis der Datenbank an und liefert einen neuen Stand.
 * `next` gibt `null` zurück, wenn das Ereignis unverändert bleibt — nur Owner mit
 * mindestens einer echten Änderung werden geklont, alle übrigen bleiben mit dem
 * Vorzustand referenzgleich. Genau das trennt einen 0,43-MiB-Snapshot von einer Tiefkopie.
 *
 * Deckt beide Slot-Formen ab (Person: birth/chr/death/buri + events[]; Familie:
 * engagement/marriage + events[]). Mehrere Kommandos brauchen exakt diesen Durchlauf
 * (Orts-/Hof-Kaskade, Hof-Umbenennung, Umhängen nach einem Merge) — er steht deshalb
 * EINMAL hier statt in jedem von ihnen erneut (INV-UI-4-Geist).
 *
 * `next` bekommt das Ereignis als bearbeitbares `Event`: es liest nur und BAUT ein neues
 * Objekt (`{ ...ev, … }`), statt das übergebene zu mutieren — die Umwandlung an dieser
 * Grenze ist deshalb sicher und hält die Aufrufer lesbar.
 */
export function mapAllEvents(db: ReadonlyDatabase, next: (ev: Event) => Event | null): Database {
  return editDatabase(db, (d) => {
    for (const id of d.personIds()) {
      const frozen = d.peekPerson(id)! as unknown as Person;
      const slots = PERSON_EVENT_FIELDS.map((f) => next(frozen[f]));
      const evs = frozen.events.map(next);
      if (slots.every((s) => s === null) && evs.every((e) => e === null)) continue;
      const p = d.person(id)!;
      PERSON_EVENT_FIELDS.forEach((f, i) => {
        const s = slots[i];
        if (s) p[f] = s;
      });
      evs.forEach((e, i) => {
        if (e) p.events[i] = e;
      });
    }
    for (const id of d.familyIds()) {
      const frozen = d.peekFamily(id)! as unknown as Family;
      const slots = FAMILY_EVENT_FIELDS.map((f) => next(frozen[f]));
      const evs = frozen.events.map(next);
      if (slots.every((s) => s === null) && evs.every((e) => e === null)) continue;
      const fam = d.family(id)!;
      FAMILY_EVENT_FIELDS.forEach((f, i) => {
        const s = slots[i];
        if (s) fam[f] = s;
      });
      evs.forEach((e, i) => {
        if (e) fam.events[i] = e;
      });
    }
  });
}

/**
 * Führt `fn` auf einem Entwurf aus und liefert ein NEUES Database mit dem Ergebnis.
 * Unveränderte Entitäten UND unberührte Maps bleiben referenzgleich zum Vorzustand.
 *
 * Der Vorzustand wird nie verändert — genau das macht ihn als Undo-Snapshot brauchbar.
 */
export function editDatabase(db: ReadonlyDatabase, fn: (d: DatabaseDraft) => void): Database {
  // Bis zur ersten Änderung bleibt jede Map die des Vorzustands (null = unberührt).
  let individuals: Map<PersonId, Person> | null = null;
  let families: Map<FamilyId, Family> | null = null;
  let sources: Map<SourceId, Source> | null = null;
  let repositories: Map<RepoId, Repository> | null = null;

  const base = db as unknown as Database;
  const mutIndividuals = (): Map<PersonId, Person> => (individuals ??= new Map(base.individuals));
  const mutFamilies = (): Map<FamilyId, Family> => (families ??= new Map(base.families));
  const mutSources = (): Map<SourceId, Source> => (sources ??= new Map(base.sources));
  const mutRepositories = (): Map<RepoId, Repository> => (repositories ??= new Map(base.repositories));

  // Bereits aufgetaute Entitäten — verhindert doppeltes Klonen bei mehrfachem Zugriff
  // (ein Kommando darf `d.person(id)` mehrfach aufrufen und muss dasselbe Objekt sehen).
  const thawedPersons = new Set<PersonId>();
  const thawedFamilies = new Set<FamilyId>();

  const draft: DatabaseDraft = {
    person(id) {
      const map = mutIndividuals();
      const current = map.get(id);
      if (!current) return null;
      if (!thawedPersons.has(id)) {
        map.set(id, thaw<Person>(current as DeepReadonly<Person>));
        thawedPersons.add(id);
      }
      return map.get(id)!;
    },
    family(id) {
      const map = mutFamilies();
      const current = map.get(id);
      if (!current) return null;
      if (!thawedFamilies.has(id)) {
        map.set(id, thaw<Family>(current as DeepReadonly<Family>));
        thawedFamilies.add(id);
      }
      return map.get(id)!;
    },
    setPerson(next) {
      mutIndividuals().set(next.id, next);
      thawedPersons.add(next.id); // vollständig ersetzt — kein weiteres Auftauen nötig
    },
    removePerson(id) {
      mutIndividuals().delete(id);
    },
    setFamily(next) {
      mutFamilies().set(next.id, next);
      thawedFamilies.add(next.id);
    },
    removeFamily(id) {
      mutFamilies().delete(id);
    },
    setSource(next) {
      mutSources().set(next.id, next);
    },
    removeSource(id) {
      mutSources().delete(id);
    },
    setRepository(next) {
      mutRepositories().set(next.id, next);
    },
    removeRepository(id) {
      mutRepositories().delete(id);
    },
    personIds() {
      return [...base.individuals.keys()];
    },
    familyIds() {
      return [...base.families.keys()];
    },
    // Liest die AKTUELLE Fassung (bereits aufgetaute eingeschlossen), damit ein Kommando,
    // das nach einer Änderung erneut nachsieht, keinen veralteten Stand bekommt.
    peekPerson(id) {
      const map = individuals ?? base.individuals;
      return (map.get(id) as DeepReadonly<Person> | undefined) ?? null;
    },
    peekFamily(id) {
      const map = families ?? base.families;
      return (map.get(id) as DeepReadonly<Family> | undefined) ?? null;
    },
    event(target) {
      // Scan über den EINGEFRORENEN Stand — es wird nur der Treffer-Owner aufgetaut.
      for (const [id, p] of base.individuals) {
        for (const field of PERSON_EVENT_FIELDS) {
          if (p[field] === target) return draft.person(id)![field];
        }
        const i = p.events.indexOf(target as Event);
        if (i >= 0) return draft.person(id)!.events[i]!;
      }
      for (const [id, f] of base.families) {
        for (const field of FAMILY_EVENT_FIELDS) {
          if (f[field] === target) return draft.family(id)![field];
        }
        const i = f.events.indexOf(target as Event);
        if (i >= 0) return draft.family(id)!.events[i]!;
      }
      return null;
    },
  };

  fn(draft);

  return {
    ...base,
    individuals: individuals ?? base.individuals,
    families: families ?? base.families,
    sources: sources ?? base.sources,
    repositories: repositories ?? base.repositories,
  };
}
