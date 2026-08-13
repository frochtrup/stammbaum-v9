// ui/views/entry/entry-template-builder-model.ts — reine Helfer für den Vorlagen-Builder
// (BL-353, ADR-v9-264/-265). Kein Domänenwissen, das nicht schon im Kern steht: Rollen/
// Feldnamen kommen aus `core/model/entry-templates.ts`, Ereignistyp-Labels aus
// `ui/shell/event-labels.ts` (INV-UI-8) — hier steht nur, WIE eine Vorlage im Builder
// zusammengesetzt/umgeordnet wird, damit die Komponenten selbst dünn und ohne Mount
// testbar bleiben (analog `entry-template-capture-model.ts`).
import {
  ENTRY_FAMILY_ROLES,
  ENTRY_PERSON_ROLES,
  FAMILY_EVENT_TAGS,
  IDENTITY_FIELDS,
  EVENT_FIELDS,
  isEventSlot,
  isFamilyRole,
  isIdentitySlot,
  slotKey,
  type EntryFamilyRole,
  type EntryPersonRole,
  type EntryRole,
  type EntrySlot,
  type EntrySourcePrefill,
  type EntryTemplate,
  type EventFieldName,
  type FamilyEventTag,
  type IdentityFieldName,
  type PrefillMode,
} from '../../../core/model/entry-templates';
import { otherEventMenu, type EventMenuItem } from '../person/person-event-menu';
import { eventTypeLabel } from '../../shell/event-labels';
import { ENTRY_ROLE_LABELS } from '../../shell/entry-template-capture-model';

/** Alle sechs Rollen, in der Reihenfolge, die der Builder anbietet. */
export const ALL_ENTRY_ROLES: readonly EntryRole[] = [...ENTRY_PERSON_ROLES, ...ENTRY_FAMILY_ROLES];

/** Frische, kollisionsfreie Vorlagen-Id — UI-Ebene, wie `newTaskId()`/`newHypothesisId()`
 *  (tasks-commands.ts/hypothesis-commands.ts): der Kern verlangt eine Id vom Aufrufer
 *  (`makeEntryTemplate`, TST-3 — kein Zufall/keine Uhr IM KERN), diese Fabrik lebt bewusst
 *  eine Schicht darüber. */
export function newEntryTemplateId(): string {
  return `et_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Leere Vorlage für „＋ Neue Vorlage". */
export function emptyEntryTemplate(id: string): EntryTemplate {
  return { id, label: '', slots: [] };
}

/**
 * Kombiniert die mitgelieferten (Kern-Konstante) und die eigenen (B1-Bündel) Vorlagen zu
 * EINER Liste für die Vorlagen-Liste — mitgeliefert zuerst, dann eigene in Speicher-
 * Reihenfolge. Keine zweite Sortierung erfunden: die Reihenfolge ist stabil und
 * nachvollziehbar (immer dieselben drei zuerst).
 */
export function combinedEntryTemplates(builtin: EntryTemplate[], custom: EntryTemplate[]): EntryTemplate[] {
  return [...builtin, ...custom];
}

/** Rollen-Kurzfassung für eine Listenzeile: die Rollen, die die Vorlage tatsächlich
 *  belegt, in erster Auftrittsreihenfolge, deutsch beschriftet. */
export function roleSummary(tpl: EntryTemplate): string {
  const seen: EntryRole[] = [];
  for (const slot of tpl.slots) {
    if (!seen.includes(slot.role)) seen.push(slot.role);
  }
  return seen.map((r) => ENTRY_ROLE_LABELS[r]).join(' · ');
}

/** Tiefe Kopie EINER Vorlage unter neuer Id — der Ausgangspunkt für „kopieren" (mitgelie-
 *  ferte Vorlagen sind kopierbar, nicht überschreibbar, ADR-v9-264 E8) UND für ein neues,
 *  aus einer bestehenden abgeleitetes Formular im Builder. Der Quellen-Bezug reist mit. */
export function copyEntryTemplate(tpl: EntryTemplate, newId: string): EntryTemplate {
  return {
    id: newId,
    label: tpl.label ? `${tpl.label} (Kopie)` : 'Kopie',
    slots: tpl.slots.map((s) => ({ ...s })),
    source: tpl.source ? { ...tpl.source } : undefined,
  };
}

// --- Slot-Manipulation (rein, liefert eine neue Liste statt zu mutieren) --------------

function findIndex(slots: EntrySlot[], key: string): number {
  return slots.findIndex((s) => slotKey(s) === key);
}

export function removeSlot(slots: EntrySlot[], key: string): EntrySlot[] {
  return slots.filter((s) => slotKey(s) !== key);
}

/** Vertauscht zwei Slots (identifiziert über ihren stabilen Schlüssel) — die Grundlage
 *  von „Reihenfolge änderbar". Ein unbekannter Schlüssel ist ein No-op statt eines Fehlers:
 *  die aufrufende Zeile reicht ohnehin nur benachbarte Gruppenmitglieder ein. */
export function swapSlots(slots: EntrySlot[], keyA: string, keyB: string): EntrySlot[] {
  const idxA = findIndex(slots, keyA);
  const idxB = findIndex(slots, keyB);
  if (idxA < 0 || idxB < 0 || idxA === idxB) return slots;
  const next = [...slots];
  [next[idxA], next[idxB]] = [next[idxB], next[idxA]];
  return next;
}

export function setSlotPrefill(
  slots: EntrySlot[],
  key: string,
  patch: { prefill: string; prefillMode: PrefillMode } | null,
): EntrySlot[] {
  return slots.map((s) => {
    if (slotKey(s) !== key) return s;
    if (patch === null) {
      const copy = { ...s } as EntrySlot & { prefill?: string; prefillMode?: PrefillMode };
      delete copy.prefill;
      delete copy.prefillMode;
      return copy as EntrySlot;
    }
    // `hidden`/`locked` zeigen kein änderbares Feld — ein `carry` daran hätte nichts
    // mitzuführen und ist im Typ verboten (ADR-v9-271). Wer den Modus dorthin schaltet,
    // verliert das Häkchen still statt einen ungültigen Zustand zu erzeugen.
    const carry = patch.prefillMode === 'prefilled' ? (s as { carry?: boolean }).carry : undefined;
    const naechster = { ...s, prefill: patch.prefill, prefillMode: patch.prefillMode } as EntrySlot & {
      carry?: boolean;
    };
    if (carry) naechster.carry = true;
    else delete naechster.carry;
    return naechster as EntrySlot;
  });
}

/**
 * Setzt/löscht das Mitführen an EINEM Feld (ADR-v9-271, BL-360).
 *
 * Je Feld, nicht je Rollen-Block: in einem Hofregister läuft der Nachname mit, der Vorname
 * nicht — das ist der Fall, der die Eigenschaft ausgelöst hat. `false` entfernt das Feld
 * ganz, statt es auf `false` zu setzen: eine Vorlage soll nicht mit toten Flags wachsen.
 */
export function setSlotCarry(slots: EntrySlot[], key: string, carry: boolean): EntrySlot[] {
  return slots.map((s) => {
    if (slotKey(s) !== key) return s;
    const copy = { ...s } as EntrySlot & { carry?: boolean };
    if (carry) copy.carry = true;
    else delete copy.carry;
    return copy as EntrySlot;
  });
}

export function addIdentitySlot(slots: EntrySlot[], role: EntryPersonRole, field: IdentityFieldName): EntrySlot[] {
  if (slots.some((s) => s.role === role && isIdentitySlot(s) && s.field === field)) return slots;
  return [...slots, { role, field }];
}

export function addEventSlotField(
  slots: EntrySlot[],
  role: EntryRole,
  event: string,
  field: EventFieldName,
): EntrySlot[] {
  if (slots.some((s) => s.role === role && isEventSlot(s) && s.event === event && s.field === field)) return slots;
  const neu = isFamilyRole(role)
    ? { role: role as EntryFamilyRole, field, event: event as FamilyEventTag }
    : { role: role as EntryPersonRole, field, event };
  return [...slots, neu as EntrySlot];
}

/** Welche Identitätsfelder fehlen einer Rolle noch — für die „＋ Feld"-Auswahl (kein
 *  Duplikat anbieten, das ist ein Modellwiderspruch: ein Feld gehört einer Rolle nur
 *  einmal). */
export function availableIdentityFields(slots: EntrySlot[], role: EntryPersonRole): IdentityFieldName[] {
  const used = new Set(slots.filter((s) => s.role === role && isIdentitySlot(s)).map((s) => (s as { field: IdentityFieldName }).field));
  return IDENTITY_FIELDS.filter((f) => !used.has(f));
}

/** Welche Ereignis-Unterfelder (Datum/Ort/…) fehlen einer bereits vorhandenen Ereignis-
 *  Gruppe noch. */
export function availableEventFields(slots: EntrySlot[], role: EntryRole, event: string): EventFieldName[] {
  const used = new Set(
    slots
      .filter((s) => s.role === role && isEventSlot(s) && s.event === event)
      .map((s) => (s as { field: EventFieldName }).field),
  );
  return EVENT_FIELDS.filter((f) => !used.has(f));
}

/** Bereits in der Vorlage vorhandene Ereignis-Tags einer Rolle (für die Gruppen-Anzeige im
 *  Builder — welche „＋ Feld"-Zeile zu welcher Gruppe gehört). */
export function eventTagsUsed(slots: EntrySlot[], role: EntryRole): string[] {
  const out: string[] = [];
  for (const s of slots) {
    if (s.role === role && isEventSlot(s) && !out.includes(s.event)) out.push(s.event);
  }
  return out;
}

/**
 * Wählbare Ereignistypen für eine NEUE Ereignis-Gruppe an dieser Rolle — für
 * Personen-Rollen der volle Katalog (Sonder-Ereignisse + `otherEventMenu`, INV-UI-8: KEINE
 * zweite Liste), für Familien-Rollen ausschließlich MARR/ENGA (ADR-v9-264 E2, vom Kern
 * selbst erzwungen — `FamilyEventSlot['event']` lässt nichts anderes zu).
 */
const PERSON_SPECIAL_EVENT_MENU: EventMenuItem[] = ['BIRT', 'CHR', 'DEAT', 'BURI'].map((tag) => ({
  tag,
  label: eventTypeLabel(tag),
}));

export function eventTypeChoicesFor(role: EntryRole, alreadyUsed: string[]): EventMenuItem[] {
  const catalog: EventMenuItem[] = isFamilyRole(role)
    ? FAMILY_EVENT_TAGS.map((tag) => ({ tag, label: eventTypeLabel(tag) }))
    : [...PERSON_SPECIAL_EVENT_MENU, ...otherEventMenu];
  return catalog.filter((item) => !alreadyUsed.includes(item.tag));
}

/** Minimal-Validierung fürs Speichern im Builder — ein Name und mindestens ein Feld,
 *  sonst legt „Speichern" eine Vorlage an, die nichts erfasst. */
export function entryTemplateBuilderErrors(tpl: EntryTemplate): string[] {
  const errors: string[] = [];
  if (tpl.label.trim() === '') errors.push('Die Vorlage braucht einen Namen.');
  if (tpl.slots.length === 0) errors.push('Die Vorlage braucht mindestens ein Feld.');
  return errors;
}

export function draftSourcePrefill(patch: Partial<EntrySourcePrefill> & Pick<EntrySourcePrefill, 'sourceId' | 'abbr' | 'title'>): EntrySourcePrefill {
  return {
    sourceId: patch.sourceId,
    abbr: patch.abbr,
    title: patch.title,
    quay: patch.quay ?? null,
    pagePattern: patch.pagePattern ?? '',
    urlPattern: patch.urlPattern ?? '',
    pageCarry: patch.pageCarry ?? false,
    urlCarry: patch.urlCarry ?? false,
  };
}

/**
 * Die Rollen in ihrer Anzeige-Reihenfolge — abgeleitet aus dem ersten Auftreten in der
 * Feldliste, genau wie `groupTemplateSlots` es tut (ADR-v9-268 E5). Rollen ohne Feld
 * kommen nicht vor: es gibt sie schlicht nicht.
 */
export function roleOrderOf(slots: readonly EntrySlot[]): EntryRole[] {
  const order: EntryRole[] = [];
  for (const s of slots) if (!order.includes(s.role)) order.push(s.role);
  return order;
}

/**
 * Verschiebt einen ganzen Rollen-Block um eine Position (ADR-v9-268 E5, BL-357).
 *
 * KEIN `roleOrder`-Feld am Template: die Reihenfolge steht bereits in `slots`, und ein
 * zweites Feld daneben wäre eine zweite Wahrheit, die auseinanderlaufen kann. Ein Block
 * wandert deshalb, indem seine Felder ALS GRUPPE wandern — die Reihenfolge INNERHALB des
 * Blocks bleibt dabei erhalten, und die Felder des übersprungenen Blocks ebenso.
 *
 * `richtung` −1 = nach oben, +1 = nach unten. Am Rand (oder bei unbekannter Rolle) bleibt
 * die Liste unverändert — der Aufrufer blendet den Knopf dort ohnehin aus.
 */
export function moveRoleBlock(
  slots: readonly EntrySlot[],
  role: EntryRole,
  richtung: -1 | 1,
): EntrySlot[] {
  const order = roleOrderOf(slots);
  const i = order.indexOf(role);
  const j = i + richtung;
  if (i < 0 || j < 0 || j >= order.length) return [...slots];

  const bloecke = new Map<EntryRole, EntrySlot[]>();
  for (const s of slots) {
    const liste = bloecke.get(s.role) ?? [];
    liste.push(s);
    bloecke.set(s.role, liste);
  }

  const neueOrdnung = [...order];
  [neueOrdnung[i], neueOrdnung[j]] = [neueOrdnung[j], neueOrdnung[i]];
  return neueOrdnung.flatMap((r) => bloecke.get(r) ?? []);
}
