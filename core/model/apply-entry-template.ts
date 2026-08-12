// core/model/apply-entry-template.ts — eine Erfassungs-Vorlage anwenden
// (Spec 20 §2, ADR-v9-264 Entscheidungen 4/6, BL-232).
//
// EIN KOMMANDO, EIN UNDO-SCHRITT (ADR-v9-264 E4). Alles — Personen, Familien, Bindungen,
// Ereignisse, Zitation — entsteht in EINEM `editDatabase`-Durchlauf. Dieselbe Bauform wie
// `saveFamily` (commands.ts:93), das Familie und beide Personenseiten schon heute in einem
// Durchlauf ändert und dafür die INV-P3-Kommandos aus `integrity.ts` ruft statt selbst zu
// schreiben. Weil der Undo-Eintrag am Zuweisungs-Chokepoint `commit` hängt
// (`ui/shell/app-state.svelte.ts`), ist v8s Reihenfolge-Fehler (`pushUndo` NACH der
// Mutation bereits verknüpfter Bestandspersonen, `legacy-v8/ui-quicktpl.js` Z. 1164)
// strukturell ausgeschlossen statt nur vermieden. Ein `commitBatch` auf `AppState` wurde
// dafür ausdrücklich NICHT gebaut (ADR-v9-264 E4): das verlagerte Transaktionslogik in die
// Schale und wäre nicht build-frei testbar (INV-ARCH-2).
//
// ERGÄNZEN STATT ÜBERSCHREIBEN. Jeder Schreibvorgang ist `fill-if-empty` — ein belegtes
// Feld einer bestehenden Person bleibt stehen (ADR-v9-47s Muster). Das ist keine
// Sonderregel für verknüpfte Personen, sondern EIN Pfad: eine frisch angelegte Person ist
// überall leer, für sie wirkt dieselbe Regel wie ein einfaches Setzen. Eine Vorlage, die
// reihenweise Personen anlegt, ist sonst der schnellste Weg, Bestandsdaten zu verlieren
// (USP: „Datenerhalt und saubere Struktur statt Eingabe-Tempo").
//
// WARUM DIE MEHRDEUTIGKEIT EIN RÜCKGABEWERT IST UND KEIN PFLICHTFELD IM ENTWURF
// (offen gelassen von ADR-v9-264 E6, hier entschieden): die Frage „welche Familie?"
// ENTSTEHT ERST beim Anwenden — sie hängt daran, welche Rollen der Nutzer mit
// Bestandspersonen verknüpft hat, und wie viele Familien diese Personen führen. Ein
// Pflichtfeld im Entwurf verlangte die Antwort, bevor die Frage gestellt werden kann; die
// Erfassungs-Fläche müsste die Kandidatensuche dann selbst nachbauen (zweite Wahrheit).
// Deshalb: `EntryTemplateDraft.families` ist die OPTIONALE Antwort, `Result.ambiguous` die
// Frage. Und solange sie offen ist, wird NICHTS geschrieben — ein halb angewandter Zug
// (Personen da, Familienbindung fehlt) wäre genau die stille Datenlücke, gegen die die
// Regel steht. Die Fläche fragt über `FamilyPicker.svelte` und ruft dasselbe Kommando
// erneut (ADR-v9-29-Leitlinie, kein neues Prinzip).
import {
  ENTRY_FAMILY_ROLES,
  ENTRY_PERSON_ROLES,
  isEventSlot,
  isIdentitySlot,
  resolveEntrySourcePrefill,
  slotKey,
  type EntryFamilyRole,
  type EntryPersonRole,
  type EntryRole,
  type EntrySlot,
  type EntryTemplate,
  type EventFieldName,
  type IdentityFieldName,
} from './entry-templates';
import { editDatabase, type ReadonlyDatabase } from './draft';
import { addChildToFamily, addParentToFamily } from './integrity';
import { allocatorFromDatabase, nextId } from './ids';
import { makeCitation, makeEvent, makeFamily, makePerson } from './factory';
import { composeGedcomName } from './name-parts';
import { dedupeCitations } from './citation';
import { normalizeSex } from './sex';
import type { Citation, Database, Event, Family, FamilyId, Person, PersonId, Sex } from './types';

// --- Familien-Wiederverwendung (ADR-v9-264 E6) ----------------------------------------

/**
 * Was eine Vorlage mit einem Eltern-Slot vorhat. Drei Fälle, weil sie sich verschieden auf
 * eine bestehende Familie auswirken:
 * - `none` — die Vorlage besetzt den Slot nicht; wer dort sitzt, ist gleichgültig.
 * - `new` — eine NEUE Person soll hinein; ein fremder Insasse dürfte dafür nicht
 *   verdrängt werden, die Familie scheidet aus.
 * - `person` — eine bekannte Person soll hinein; sie darf dort sitzen oder der Slot frei sein.
 */
export type ParentWish =
  | { kind: 'none' }
  | { kind: 'new' }
  | { kind: 'person'; id: PersonId };

export interface FamilyWish {
  husband: ParentWish;
  wife: ParentWish;
}

function slotPasst(insasse: PersonId | null, wunsch: ParentWish): boolean {
  if (wunsch.kind === 'none') return true;
  if (wunsch.kind === 'new') return insasse === null;
  return insasse === null || insasse === wunsch.id;
}

/**
 * Findet die bestehenden Familien, die zu den bekannten Eltern passen — ALLE, ohne
 * auszuwählen (ADR-v9-264 E6: bei ≥2 Kandidaten wird nicht geraten, sondern gefragt).
 *
 * Passend heißt: jeder beanspruchte Eltern-Slot ist frei oder mit genau der gewünschten
 * Person besetzt. Eine Familie mit NUR gesetztem Vater ist damit für „Vater+Mutter"
 * verwendbar — mehr als v8 konnte, das beide Partner als bereits existierend UND als
 * gemeinsame `fams` verlangte (`legacy-v8/ui-quicktpl.js` Z. 1102/1122) und deshalb bei
 * jedem neuen Ehepartner an einer bestehenden Person eine zweite Familie erzeugte.
 *
 * ZWEI ANKER, nicht einer:
 * - Ohne `child` muss mindestens EIN bekannter Elternteil tatsächlich in der Familie
 *   sitzen. Ohne diese Bedingung wäre jede Familie mit zwei freien Slots ein Treffer.
 * - Mit `child` (eine bestehende Person, deren Eltern gesucht werden) sind die Kandidaten
 *   genau ihre `childOf`-Familien: eine Person hat ihre Eltern schon: eine zweite FAMC
 *   anzulegen wäre der Fehler, nicht die Lösung.
 *
 * Nahes Vorbild: `core/places/hof-id.ts::findOrCreateHof` — suchen, und die Entscheidung
 * dem Aufrufer lassen, statt bei Mehrdeutigkeit etwas zu erfinden.
 */
export function findFamilyFor(
  db: ReadonlyDatabase,
  wish: FamilyWish,
  child?: PersonId | null,
): FamilyId[] {
  const familien = (db as unknown as Database).families;
  const passt = (fam: Family): boolean =>
    slotPasst(fam.husband, wish.husband) && slotPasst(fam.wife, wish.wife);

  if (child) {
    const kind = (db as unknown as Database).individuals.get(child);
    const eigene = kind?.childOf.map((l) => l.familyId) ?? [];
    if (eigene.length > 0) {
      return eigene.filter((fid) => {
        const fam = familien.get(fid);
        return fam !== undefined && passt(fam);
      });
    }
  }

  const anker = (fam: Family): boolean =>
    (wish.husband.kind === 'person' && fam.husband === wish.husband.id) ||
    (wish.wife.kind === 'person' && fam.wife === wish.wife.id);

  const out: FamilyId[] = [];
  for (const fam of familien.values()) {
    if (passt(fam) && anker(fam)) out.push(fam.id);
  }
  return out;
}

// --- Entwurf und Ergebnis --------------------------------------------------------------

/**
 * Der Stand der Erfassungs-Fläche zum Zeitpunkt „Speichern" (ADR-v9-264 E5: vor dem
 * Speichern existiert kein Datensatz — das hier ist ein Entwurf, keine Anlage).
 */
export interface EntryTemplateDraft {
  /** Eingegebene Werte, geschlüsselt über `slotKey(slot)`. */
  values: Record<string, string>;
  /** Rollen, die per Live-Dubletten-Treffer mit einer BESTEHENDEN Person verknüpft sind
   *  (`core/dedup/person-duplicates.ts::scorePersonPair`, die Fläche entscheidet). */
  persons: Partial<Record<EntryPersonRole, PersonId>>;
  /** Bereits entschiedene Familien — die Antwort auf ein zuvor gemeldetes `ambiguous`. */
  families: Partial<Record<EntryFamilyRole, FamilyId>>;
  /** Seitenangabe der Zitation (v8s Feldtyp `page`; im Modell ist das die Zitation, kein
   *  Feld einer Person). Leer ⇒ `pagePattern` der Quellen-Vorbelegung. */
  page: string;
  /** Weblink der Zitation. Leer ⇒ `urlPattern` der Quellen-Vorbelegung. */
  url: string;
}

export function makeEntryDraft(patch: Partial<EntryTemplateDraft> = {}): EntryTemplateDraft {
  return {
    values: patch.values ?? {},
    persons: patch.persons ?? {},
    families: patch.families ?? {},
    page: patch.page ?? '',
    url: patch.url ?? '',
  };
}

/** Eine offene Familien-Frage: mehrere bestehende Familien passen gleich gut. */
export interface EntryTemplateAmbiguity {
  role: EntryFamilyRole;
  candidates: FamilyId[];
}

export interface ApplyEntryTemplateResult {
  db: Database;
  /** Die je Rolle betroffene Person — neu angelegt oder verknüpft. */
  persons: Partial<Record<EntryPersonRole, PersonId>>;
  /** Die je Rolle betroffene Familie — neu angelegt oder wiederverwendet. */
  families: Partial<Record<EntryFamilyRole, FamilyId>>;
  /** Offene Familien-Fragen. Nicht leer ⇒ es wurde NICHTS geschrieben (s. Kopfkommentar). */
  ambiguous: EntryTemplateAmbiguity[];
}

// --- Werte und Ziele -------------------------------------------------------------------

interface AufgeloesterSlot {
  slot: EntrySlot;
  value: string;
  /** Kam der Wert aus dem Entwurf (Eingabe) — oder aus der Vorbelegung? */
  eingabe: boolean;
}

/** Vorbelegung schlägt Eingabe — und zwar in BEIDEN Anzeigemodi (ADR-v9-264 E3): bei
 *  `locked` steht derselbe Wert ohnehin im gesperrten Feld, bei `hidden` gibt es gar
 *  keines. Ein `prefill` fließt deshalb unabhängig vom Modus ein. */
function aufloesen(tpl: EntryTemplate, draft: EntryTemplateDraft): AufgeloesterSlot[] {
  return tpl.slots.map((slot) => {
    const eigen = (draft.values[slotKey(slot)] ?? '').trim();
    if (slot.prefill !== undefined) return { slot, value: slot.prefill.trim(), eingabe: false };
    return { slot, value: eigen, eingabe: eigen !== '' };
  });
}

function derRolle(alle: AufgeloesterSlot[], role: EntryRole): AufgeloesterSlot[] {
  return alle.filter((a) => a.slot.role === role);
}

/**
 * EINE VORBELEGUNG FÜLLT, SIE LEGT NICHTS AN. Ob eine Rolle (bzw. ein Ereignis) überhaupt
 * entsteht, entscheidet allein die EINGABE des Nutzers — sonst legte jede Anwendung der
 * Heirats-Vorlage schon deshalb zwei Personen an, weil die Vorlage ihnen ein Geschlecht
 * vorbelegt (`sex: 'M'/'F'`, hidden). Genau das wären die unsichtbaren Leichen, gegen die
 * ADR-v9-264 E5 die Entwurfs-Fläche gebaut hat. Die Vorbelegung wirkt trotzdem voll: sie
 * füllt jede Rolle, die durch Eingabe ODER durch eine Verknüpfung entsteht.
 */
function hatEingabe(alle: AufgeloesterSlot[], role: EntryRole): boolean {
  return derRolle(alle, role).some((a) => a.eingabe);
}

function wertVon(alle: AufgeloesterSlot[], role: EntryRole, field: string): string {
  return derRolle(alle, role).find((a) => a.slot.field === field)?.value ?? '';
}

/** Die Sonder-Ereignisslots (Spec 10 §5.1) — dieselbe kleine, bewusste Duplikation wie
 *  zwischen draft.ts und commands.ts (kein geteiltes Modul dafür). */
const PERSON_SPECIAL: Record<string, 'birth' | 'chr' | 'death' | 'buri' | undefined> = {
  BIRT: 'birth',
  CHR: 'chr',
  DEAT: 'death',
  BURI: 'buri',
};
const FAMILY_SPECIAL: Record<string, 'marriage' | 'engagement' | undefined> = {
  MARR: 'marriage',
  ENGA: 'engagement',
};

/** Ereignis-Slots nach GEDCOM-Tag gruppiert; eine Gruppe ohne EINGABE fällt weg — dieselbe
 *  Regel wie bei den Rollen (s. `hatEingabe`): ein Ereignis, das nur seine Vorbelegung
 *  trüge (etwa den Ort, aber kein Datum), hat der Nutzer nicht erfasst. */
function ereignisGruppen(slots: AufgeloesterSlot[]): Map<string, AufgeloesterSlot[]> {
  const out = new Map<string, AufgeloesterSlot[]>();
  for (const a of slots) {
    if (!isEventSlot(a.slot)) continue;
    const liste = out.get(a.slot.event) ?? [];
    liste.push(a);
    out.set(a.slot.event, liste);
  }
  for (const [tag, liste] of out) {
    if (!liste.some((a) => a.eingabe)) out.delete(tag);
  }
  return out;
}

// --- Schreiben (fill-if-empty) ---------------------------------------------------------

function istLeer(wert: string | null): boolean {
  return wert === null || wert === '';
}

/** Schreibt ein Ereignisfeld, wenn es dort noch nichts gibt. Liefert `true` bei Änderung. */
function schreibeEreignisFeld(ev: Event, field: EventFieldName, wert: string): boolean {
  if (wert === '') return false;
  switch (field) {
    case 'date':
      if (!istLeer(ev.date)) return false;
      ev.date = wert;
      return true;
    case 'place':
      // Roher Freitext, OHNE `placeId` — die Ortsauflösung ist ein eigener Mechanismus
      // (`resolveEvents()` beim nächsten Laden bzw. `linkEventToPlace` in der Fläche,
      // ADR-v9-19/42). Hier eine Id zu raten wäre ein zweiter Zuordnungsweg.
      if (!istLeer(ev.place)) return false;
      ev.place = wert;
      return true;
    case 'addr':
      if (!istLeer(ev.addr)) return false;
      ev.addr = wert;
      return true;
    case 'value':
      if (ev.value !== '') return false;
      ev.value = wert;
      return true;
    case 'note':
      if (ev.note !== '') return false;
      ev.note = wert;
      return true;
  }
}

/** Die geprüfte Quellen-Vorbelegung als FABRIK, nicht als fertiges Objekt: jedes berührte
 *  Ereignis bekommt eine eigene Zitation. Ein geteiltes Objekt hätte sein `media`-Array
 *  über mehrere Ereignisse hinweg geteilt — ein Edit an einer Fundstelle schlüge auf die
 *  anderen durch (dieselbe Aliasing-Falle, gegen die `core/model/draft.ts` klont). */
type ZitatFabrik = (() => Citation) | null;

function schreibeEreignis(ev: Event, slots: AufgeloesterSlot[], zitat: ZitatFabrik): void {
  let beruehrt = false;
  for (const a of slots) {
    if (!isEventSlot(a.slot)) continue;
    if (schreibeEreignisFeld(ev, a.slot.field, a.value)) beruehrt = true;
  }
  if (beruehrt && zitat) {
    // INV-C1: dieselbe (sourceId + page) steht nicht zweimal an einem Ereignis.
    ev.citations = dedupeCitations([...ev.citations, zitat()]);
  }
}

/** Identitätsfelder, fill-if-empty. `sex` gilt als leer, solange es `U` ist (INV-P1). */
function schreibeIdentitaet(p: Person, field: IdentityFieldName, wert: string): boolean {
  if (wert === '') return false;
  if (field === 'sex') {
    if (p.sex !== 'U') return false;
    p.sex = normalizeSex(wert);
    return true;
  }
  if (p[field] !== '') return false;
  p[field] = wert;
  return true;
}

function schreibePerson(p: Person, slots: AufgeloesterSlot[], zitat: ZitatFabrik): void {
  let nameGeaendert = false;
  for (const a of slots) {
    if (!isIdentitySlot(a.slot)) continue;
    const feld = a.slot.field;
    if (schreibeIdentitaet(p, feld, a.value) && feld !== 'sex') nameGeaendert = true;
  }
  // `Person.name` (der rohe GEDCOM-NAME-Wert) ist die zweite Hälfte derselben Sache wie
  // given/surname — jeder Schreibpfad zieht ihn über `composeGedcomName` nach, sonst
  // widersprechen sich NAME und GIVN/SURN im Export (ADR-v9-81/-112, dieselbe Stelle wie
  // in `PersonForm.svelte`). Nur bei tatsächlicher Änderung: sonst zöge ein folgenloser
  // Durchlauf einen byte-abweichenden Quellwert glatt (LP-1).
  if (nameGeaendert) {
    p.name = composeGedcomName({ given: p.given, surname: p.surname, suffix: p.suffix });
  }

  for (const [tag, gruppe] of ereignisGruppen(slots)) {
    const feld = PERSON_SPECIAL[tag];
    if (feld) {
      schreibeEreignis(p[feld], gruppe, zitat);
      continue;
    }
    // Generischer Typ: IMMER ein neuer `events[]`-Eintrag. Ein bestehendes OCCU/RESI zu
    // befüllen hieße raten, welches von mehreren gemeint ist — ein Ereignis ist ein
    // Vorkommnis, kein Feld.
    const neu = makeEvent(tag);
    schreibeEreignis(neu, gruppe, zitat);
    p.events.push(neu);
  }
}

function schreibeFamilie(fam: Family, slots: AufgeloesterSlot[], zitat: ZitatFabrik): void {
  for (const [tag, gruppe] of ereignisGruppen(slots)) {
    const feld = FAMILY_SPECIAL[tag];
    if (!feld) continue; // der Typ lässt nur MARR/ENGA zu; gespeicherte Fremdformen fallen weg
    schreibeEreignis(fam[feld], gruppe, zitat);
  }
}

// --- Planung (rein, vor dem Schreiben) -------------------------------------------------

interface FamilienPlan {
  id: FamilyId;
  neu: boolean;
  eltern: { slot: 'husband' | 'wife'; person: PersonId }[];
  kind: PersonId | null;
}

/**
 * Welcher Eltern-Slot gehört zu `main`? Das Geschlecht wählt, bei `U` fällt die Wahl auf
 * den Ehemann — eine Vorbelegung, keine Behauptung: beide Slots sind auf `FamilyDetail`
 * umbesetzbar (dieselbe Regel wie beim Anlegen einer Familie aus der Personenseite).
 */
function eheSlots(mainSex: Sex, spouseSex: Sex): { main: 'husband' | 'wife'; spouse: 'husband' | 'wife' } {
  if (mainSex === 'F') return { main: 'wife', spouse: 'husband' };
  if (mainSex === 'M') return { main: 'husband', spouse: 'wife' };
  if (spouseSex === 'M') return { main: 'wife', spouse: 'husband' };
  if (spouseSex === 'F') return { main: 'husband', spouse: 'wife' };
  return { main: 'husband', spouse: 'wife' };
}

/**
 * Wendet eine Erfassungs-Vorlage an: legt Personen, Familien und Bindungen in EINEM
 * `editDatabase`-Durchlauf an und liefert den neuen Stand (s. Kopfkommentar).
 */
export function applyEntryTemplate(
  db: ReadonlyDatabase,
  tpl: EntryTemplate,
  draft: EntryTemplateDraft,
): ApplyEntryTemplateResult {
  const basis = db as unknown as Database;
  const slots = aufloesen(tpl, draft);
  const alloc = allocatorFromDatabase(basis);

  // --- (1) Personen-Rollen: verknüpft, neu, oder gar nicht -----------------------------
  const personIds: Partial<Record<EntryPersonRole, PersonId>> = {};
  const neuePersonen = new Set<PersonId>();
  for (const role of ENTRY_PERSON_ROLES) {
    const verknuepft = draft.persons[role];
    // Eine Verknüpfung auf eine Id, die es im Bestand nicht gibt, wird ignoriert statt
    // übernommen — sie hinterließe eine verwaiste Referenz (INV-P2).
    const vorhanden = verknuepft !== undefined && basis.individuals.has(verknuepft);
    if (!vorhanden && !hatEingabe(slots, role)) continue;
    if (vorhanden) {
      personIds[role] = verknuepft;
      continue;
    }
    const id = nextId(alloc, 'I');
    personIds[role] = id;
    neuePersonen.add(id);
  }

  const wunsch = (role: EntryPersonRole): ParentWish => {
    const id = personIds[role];
    if (id === undefined) return { kind: 'none' };
    return neuePersonen.has(id) ? { kind: 'new' } : { kind: 'person', id };
  };
  const sexVon = (role: EntryPersonRole): Sex => {
    const id = personIds[role];
    const vorhanden = id !== undefined ? basis.individuals.get(id) : undefined;
    if (vorhanden && vorhanden.sex !== 'U') return vorhanden.sex;
    return normalizeSex(wertVon(slots, role, 'sex'));
  };

  // --- (2) Familien-Rollen: wiederverwenden, fragen, oder neu --------------------------
  const familienPlan: Partial<Record<EntryFamilyRole, FamilienPlan>> = {};
  const ambiguous: EntryTemplateAmbiguity[] = [];
  const main = personIds.main;

  const planen = (
    role: EntryFamilyRole,
    wish: FamilyWish,
    eltern: { slot: 'husband' | 'wife'; person: PersonId }[],
    kind: PersonId | null,
  ): void => {
    const entschieden = draft.families[role];
    if (entschieden !== undefined && basis.families.has(entschieden)) {
      familienPlan[role] = { id: entschieden, neu: false, eltern, kind };
      return;
    }
    const kandidaten = findFamilyFor(db, wish, kind && !neuePersonen.has(kind) ? kind : null);
    if (kandidaten.length > 1) {
      ambiguous.push({ role, candidates: kandidaten });
      return;
    }
    const id = kandidaten[0];
    familienPlan[role] = id !== undefined
      ? { id, neu: false, eltern, kind }
      : { id: nextId(alloc, 'F'), neu: true, eltern, kind };
  };

  if (main !== undefined) {
    const vater = personIds.father;
    const mutter = personIds.mother;
    if (vater !== undefined || mutter !== undefined || hatEingabe(slots, 'parentFamily')) {
      const eltern: FamilienPlan['eltern'] = [];
      if (vater !== undefined) eltern.push({ slot: 'husband', person: vater });
      if (mutter !== undefined) eltern.push({ slot: 'wife', person: mutter });
      planen('parentFamily', { husband: wunsch('father'), wife: wunsch('mother') }, eltern, main);
    }

    const partner = personIds.spouse;
    if (partner !== undefined || hatEingabe(slots, 'spouseFamily')) {
      const seiten = eheSlots(sexVon('main'), sexVon('spouse'));
      const eltern: FamilienPlan['eltern'] = [{ slot: seiten.main, person: main }];
      if (partner !== undefined) eltern.push({ slot: seiten.spouse, person: partner });
      const wish: FamilyWish = {
        husband: seiten.main === 'husband' ? wunsch('main') : wunsch('spouse'),
        wife: seiten.main === 'wife' ? wunsch('main') : wunsch('spouse'),
      };
      planen('spouseFamily', wish, eltern, null);
    }
  }

  // Offene Frage ⇒ nichts schreiben (s. Kopfkommentar). `editDatabase` ohne Änderung
  // liefert einen neuen Stand, der jede Map des Vorzustands unangetastet weiterreicht.
  if (ambiguous.length > 0) {
    return { db: editDatabase(db, () => {}), persons: {}, families: {}, ambiguous };
  }

  // --- (3) Quellen-Vorbelegung am Referenten prüfen (ADR-v9-264 E7) --------------------
  const quelle = tpl.source;
  const geprueft = quelle ? resolveEntrySourcePrefill(quelle, basis.sources.get(quelle.sourceId)) : null;
  const zitat: ZitatFabrik =
    geprueft && quelle
      ? () =>
          makeCitation(geprueft.id, {
            page: draft.page || quelle.pagePattern,
            quay: quelle.quay,
            deepLinkUrl: draft.url || quelle.urlPattern,
          })
      : null;

  // --- (4) Der eine Durchlauf ----------------------------------------------------------
  const next = editDatabase(db, (d) => {
    for (const id of neuePersonen) d.setPerson(makePerson(id));

    for (const role of ENTRY_PERSON_ROLES) {
      const id = personIds[role];
      if (id === undefined) continue;
      const p = d.person(id);
      if (p) schreibePerson(p, derRolle(slots, role), zitat);
    }

    for (const role of ENTRY_FAMILY_ROLES) {
      const plan = familienPlan[role];
      if (!plan) continue;
      if (plan.neu) d.setFamily(makeFamily(plan.id));
      // Beziehungen ausschließlich über die INV-P3-Kommandos — nie direkt geschrieben.
      for (const e of plan.eltern) addParentToFamily(d, plan.id, e.person, e.slot);
      if (plan.kind) addChildToFamily(d, plan.id, plan.kind);
      const fam = d.family(plan.id);
      if (fam) schreibeFamilie(fam, derRolle(slots, role), zitat);
    }
  });

  const families: Partial<Record<EntryFamilyRole, FamilyId>> = {};
  for (const role of ENTRY_FAMILY_ROLES) {
    const plan = familienPlan[role];
    if (plan) families[role] = plan.id;
  }
  return { db: next, persons: personIds, families, ambiguous: [] };
}
