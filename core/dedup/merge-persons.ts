// core/dedup/merge-persons.ts — Personen-Merge (BL-103, Spec 20 §1.12, ADR-v9-104).
//
// WARUM EIN EIGENES KOMMANDO: `deletePerson` führt Familien-Referenzen bewusst NICHT nach
// (so dokumentiert in core/model/commands.ts). Ein Merge aus `savePerson(winner)` +
// `deletePerson(loser)` ließe jede Referenz auf den Verlierer stehen — die Person wäre aus
// der Liste verschwunden und bliebe als Elternteil, Kind, Partner, Alias und Assoziation
// im Baum. Das ist keine Kosmetik: `findOrphanRefs` (INV-P2) meldete danach Treffer.
//
// FÜNF STELLEN, an denen eine PersonId im Modell vorkommt — die Liste stammt nicht aus
// eigener Anschauung, sondern aus `findOrphanRefs` selbst, das genau diese Referenzen
// prüft: Family.husband · Family.wife · Family.children · Person.aliases ·
// Association.personRef. Der Test spiegelt das zurück, indem er nach jedem Merge
// `findOrphanRefs(db) === []` fordert statt die fünf Stellen von Hand aufzuzählen.
//
// COPY-ON-WRITE (ADR-v9-92): läuft vollständig über `editDatabase`. Der Vorzustand bleibt
// unangetastet und damit als Undo-Snapshot brauchbar; nur tatsächlich berührte Entitäten
// werden geklont.
import { editDatabase, type ReadonlyDatabase } from '../model/draft';
import {
  addChildToFamily,
  addParentToFamily,
  removeChildFromFamily,
  removeParentFromFamily,
} from '../model/integrity';
import type { Citation, Database, Event, Person, PersonId } from '../model/types';

/** Welche Seite ein Feld beisteuert. Ohne Eintrag gilt „Gewinner, sonst Verlierer". */
export type MergeSide = 'winner' | 'loser';

/** Feld-Schlüssel → gewählte Seite. Schlüssel sind die aus `MERGEABLE_PERSON_FIELDS`. */
export type MergeSelections = Readonly<Record<string, MergeSide>>;

export interface MergeableField {
  /** Feldpfad: `surname` (Skalar) oder `birth.date` (Ereignis-Unterfeld). */
  key: string;
  label: string;
}

/**
 * Die wählbaren Felder — ADR-v9-104 Entscheidung 2: ALLE Skalarfelder, nicht nur die
 * sieben des v8-Orakels. Mengen-Felder stehen bewusst NICHT hier: eine A/B-Wahl über
 * Listen wäre eine Löschentscheidung und widerspräche dem „verlustfrei"-Versprechen des
 * Dubletten-Merges; sie werden immer vereinigt.
 *
 * EINE Liste für Kommando UND Merge-Modal (BL-104) — sonst driften die beiden
 * auseinander, und ein im Modal wählbares Feld wird vom Kommando ignoriert.
 */
export const MERGEABLE_PERSON_FIELDS: readonly MergeableField[] = [
  { key: 'surname', label: 'Nachname' },
  { key: 'given', label: 'Vorname' },
  { key: 'nick', label: 'Rufname' },
  { key: 'prefix', label: 'Namenspräfix' },
  { key: 'suffix', label: 'Namenssuffix' },
  { key: 'sex', label: 'Geschlecht' },
  { key: 'title', label: 'Titel' },
  { key: 'religion', label: 'Religion' },
  { key: 'restriction', label: 'Schutzstatus' },
  { key: 'email', label: 'E-Mail' },
  { key: 'www', label: 'Website' },
  { key: 'uid', label: 'UID' },
  { key: 'birth.date', label: 'Geburt — Datum' },
  { key: 'birth.place', label: 'Geburt — Ort' },
  { key: 'chr.date', label: 'Taufe — Datum' },
  { key: 'chr.place', label: 'Taufe — Ort' },
  { key: 'death.date', label: 'Tod — Datum' },
  { key: 'death.place', label: 'Tod — Ort' },
  { key: 'cause', label: 'Todesursache' },
  { key: 'buri.date', label: 'Beerdigung — Datum' },
  { key: 'buri.place', label: 'Beerdigung — Ort' },
];

/** Die vier Sonder-Ereignisslots (identisch zu draft.ts — dort privat). */
const EVENT_SLOTS = ['birth', 'chr', 'death', 'buri'] as const;
type EventSlot = (typeof EVENT_SLOTS)[number];

/** `sex: 'U'` heißt „unbekannt" und zählt beim Auffüllen wie leer. */
function isEmpty(value: unknown): boolean {
  return value === '' || value === null || value === undefined || value === 'U';
}

/** Gewählte Seite, sonst der nicht-leere Wert — nie ein Wert gegen einen leeren getauscht. */
function pick<T>(selections: MergeSelections, key: string, winnerValue: T, loserValue: T): T {
  const preferLoser = selections[key] === 'loser';
  const first = preferLoser ? loserValue : winnerValue;
  const second = preferLoser ? winnerValue : loserValue;
  return isEmpty(first) ? second : first;
}

/** Zitate ohne Dubletten (gleiche Quelle + gleiche Seite zählt einmal). */
function unionCitations(a: readonly Citation[], b: readonly Citation[]): Citation[] {
  const seen = new Set(a.map((c) => `${c.sourceId}|${c.page}`));
  return [...a, ...b.filter((c) => !seen.has(`${c.sourceId}|${c.page}`))];
}

/**
 * Führt einen Ereignis-Slot zusammen: `date`/`place` folgen der Auswahl, alle übrigen
 * Felder werden verlustfrei aufgefüllt, Zitate/Medien vereinigt, `seen` bleibt gesetzt,
 * sobald EINE Seite es trägt (INV-P5 — ein vorhandener leerer Block darf nicht verloren gehen).
 */
function mergeEventSlot(slot: EventSlot, selections: MergeSelections, w: Event, l: Event): Event {
  return {
    ...w,
    type: w.type || l.type,
    date: pick(selections, `${slot}.date`, w.date, l.date),
    place: pick(selections, `${slot}.place`, w.place, l.place),
    datePhrase: isEmpty(w.datePhrase) ? l.datePhrase : w.datePhrase,
    value: isEmpty(w.value) ? l.value : w.value,
    addr: isEmpty(w.addr) ? l.addr : w.addr,
    note: isEmpty(w.note) ? l.note : w.note,
    placeId: w.placeId ?? l.placeId,
    hofId: w.hofId ?? l.hofId,
    lati: w.lati ?? l.lati,
    long: w.long ?? l.long,
    citations: unionCitations(w.citations, l.citations),
    media: [...w.media, ...l.media.filter((m) => !w.media.some((x) => x.file === m.file))],
    seen: w.seen || l.seen,
  };
}

/**
 * Kommando: führt `loserId` in `winnerId` zusammen und liefert einen NEUEN Stand.
 *
 * Skalarfelder folgen `selections` (Default: Gewinner, leere Felder aus dem Verlierer
 * aufgefüllt). Mengen-Felder werden IMMER vereinigt — nie gewählt, s. Kopf von
 * `MERGEABLE_PERSON_FIELDS`. Alle Referenzen auf den Verlierer werden umgehängt, danach
 * wird er entfernt.
 *
 * No-Op-tolerant: unbekannte ids oder `winnerId === loserId` lassen den Bestand unberührt.
 */
export function mergePersons(
  db: ReadonlyDatabase,
  winnerId: PersonId,
  loserId: PersonId,
  selections: MergeSelections = {},
): Database {
  return editDatabase(db, (d) => {
    if (winnerId === loserId) return;
    if (!d.peekPerson(winnerId) || !d.peekPerson(loserId)) return;

    const winner = d.person(winnerId)!;
    // Nur-lesender Blick auf den Verlierer — er wird ohnehin entfernt, ein Klon wäre Ballast.
    const loser = d.peekPerson(loserId)! as unknown as Person;

    // --- Skalarfelder ---
    // Bewusst ausgeschrieben statt über eine Schlüssel-Schleife mit Cast: die Schleife
    // bräuchte ein `as Record<string, unknown>`, das genau die Typprüfung abschaltet, die
    // ein neu hinzukommendes Person-Feld auffallen ließe. Dass diese Liste vollständig
    // zu MERGEABLE_PERSON_FIELDS passt, prüft ein Test mechanisch (jeder Schlüssel der
    // Liste muss eine 'loser'-Auswahl auch wirklich befolgen) — Zwang statt Erinnerung.
    winner.surname = pick(selections, 'surname', winner.surname, loser.surname);
    winner.given = pick(selections, 'given', winner.given, loser.given);
    winner.nick = pick(selections, 'nick', winner.nick, loser.nick);
    winner.prefix = pick(selections, 'prefix', winner.prefix, loser.prefix);
    winner.suffix = pick(selections, 'suffix', winner.suffix, loser.suffix);
    winner.sex = pick(selections, 'sex', winner.sex, loser.sex);
    winner.title = pick(selections, 'title', winner.title, loser.title);
    winner.religion = pick(selections, 'religion', winner.religion, loser.religion);
    winner.restriction = pick(selections, 'restriction', winner.restriction, loser.restriction);
    winner.email = pick(selections, 'email', winner.email, loser.email);
    winner.www = pick(selections, 'www', winner.www, loser.www);
    winner.uid = pick(selections, 'uid', winner.uid, loser.uid);
    winner.cause = pick(selections, 'cause', winner.cause, loser.cause);
    // Der Anzeigename folgt der getroffenen Namenswahl, statt den alten Stand zu behalten.
    winner.name = [winner.given, winner.surname].filter(Boolean).join(' ') || winner.name || loser.name;

    // --- Sonder-Ereignisse ---
    for (const slot of EVENT_SLOTS) {
      winner[slot] = mergeEventSlot(slot, selections, winner[slot], loser[slot]);
    }

    // --- Mengen: immer vereinigen, nie wählen ---
    winner.events = [...winner.events, ...loser.events];
    winner.extraNames = [...winner.extraNames, ...loser.extraNames];
    winner.aliaNames = [...new Set([...winner.aliaNames, ...loser.aliaNames])];
    winner.nameTrans = [...winner.nameTrans, ...loser.nameTrans];
    winner.media = [...winner.media, ...loser.media.filter((m) => !winner.media.some((x) => x.file === m.file))];
    winner.noteRefs = [...new Set([...winner.noteRefs, ...loser.noteRefs])];
    winner.exids = [...winner.exids, ...loser.exids];
    winner.tasks = [...winner.tasks, ...loser.tasks];
    winner.researchLog = [...winner.researchLog, ...loser.researchLog];
    winner.hypotheses = [...winner.hypotheses, ...loser.hypotheses];
    winner.associations = [...winner.associations, ...loser.associations];
    winner.topLevelCitations = unionCitations(winner.topLevelCitations, loser.topLevelCitations);
    winner.nameCitations = unionCitations(winner.nameCitations, loser.nameCitations);
    winner.noEvents = new Set([...winner.noEvents, ...loser.noEvents]);
    winner.noteText = [winner.noteText, loser.noteText].filter(Boolean).join('\n');
    winner.aliases = [...winner.aliases, ...loser.aliases];
    if (isEmpty(winner.createdDate)) winner.createdDate = loser.createdDate;

    // --- Familienkanten (INV-P3 über die synchron haltenden Kommandos, nie direkt) ---
    for (const familyId of d.familyIds()) {
      const fam = d.peekFamily(familyId);
      if (!fam) continue;

      for (const slot of ['husband', 'wife'] as const) {
        if (fam[slot] !== loserId) continue;
        const otherSlot = slot === 'husband' ? 'wife' : 'husband';
        if (fam[otherSlot] === winnerId) {
          // Beide waren Eltern DERSELBEN Familie — der Slot des Verlierers wird geleert,
          // sonst säße der Gewinner auf beiden Seiten seiner eigenen Ehe.
          removeParentFromFamily(d, familyId, slot);
        } else {
          addParentToFamily(d, familyId, winnerId, slot);
        }
      }

      if (fam.children.includes(loserId)) {
        // Reihenfolge: erst lösen, dann setzen. `addChildToFamily` ist idempotent, der
        // häufige Fall „beide sind Kind derselben Familie" (ein doppelt erfasstes Kind,
        // ADR-v9-106) ergibt damit genau EINEN Eintrag statt zweier.
        removeChildFromFamily(d, familyId, loserId);
        addChildToFamily(d, familyId, winnerId);
      }
    }

    // --- Verweise anderer Personen (aliases/associations) ---
    for (const personId of d.personIds()) {
      if (personId === loserId) continue;
      const frozen = d.peekPerson(personId)!;
      const touchesAlias = frozen.aliases.includes(loserId);
      const touchesAssoc = frozen.associations.some((a) => a.personRef === loserId);
      if (!touchesAlias && !touchesAssoc) continue;

      const p = d.person(personId)!;
      // Ein Alias auf sich selbst wäre nach dem Umhängen sinnlos — er entfällt.
      p.aliases = [...new Set(p.aliases.map((a) => (a === loserId ? winnerId : a)))].filter((a) => a !== p.id);
      p.associations = p.associations.map((a) => (a.personRef === loserId ? { ...a, personRef: winnerId } : a));
    }

    d.removePerson(loserId);
  });
}
