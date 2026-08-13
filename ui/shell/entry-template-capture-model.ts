// ui/shell/entry-template-capture-model.ts — reine Gruppierungs-/Beschriftungs-Helfer für
// `EntryTemplateCapture.svelte` (BL-352, ADR-v9-264). Kein Domänenwissen, das nicht schon
// im Kern steht: Rollen-/Feldnamen kommen aus `core/model/entry-templates.ts`
// (ENTRY_PERSON_ROLES/ENTRY_FAMILY_ROLES/IDENTITY_FIELDS/EVENT_FIELDS), Ereignistyp-Labels
// aus `ui/shell/event-labels.ts` (INV-UI-8, keine zweite Typ-Liste) — hier steht nur, WIE
// die Slots einer Vorlage zu Abschnitten gruppiert werden, damit die Komponente selbst
// dünn bleibt (und damit testbar ist, ohne sie zu mounten).
import {
  isEventSlot,
  isFamilyRole,
  slotKey,
  type EntryFamilyRole,
  type EntryPersonRole,
  type EntryRole,
  type EntrySlot,
  type EntryTemplate,
  type FamilyEventSlot,
  type IdentitySlot,
  type PersonEventSlot,
} from '../../core/model/entry-templates';
import { eventTypeLabel } from './event-labels';

/** Deutsche Rollen-Beschriftung — UI-Vokabular, gehört nicht in den Kern (INV-ARCH-1: der
 *  Kern kennt nur die Rollen-Schlüssel, keine Anzeige-Sprache). */
export const ENTRY_ROLE_LABELS: Record<EntryRole, string> = {
  main: 'Hauptperson',
  father: 'Vater',
  mother: 'Mutter',
  spouse: 'Partner(in)',
  // „von Partner(in)" statt „Schwiegervater/-mutter": die Rolle beschreibt, WESSEN Vater
  // gemeint ist, nicht das Verhältnis zur Hauptperson — und das Schwieger-Verhältnis
  // entsteht erst durch die Ehe, die in diesem Eintrag oft gerade erst geschlossen wird.
  spouseFather: 'Vater von Partner(in)',
  spouseMother: 'Mutter von Partner(in)',
  parentFamily: 'Elternfamilie',
  spouseParentFamily: 'Elternfamilie von Partner(in)',
  spouseFamily: 'Ehefamilie/Partnerschaft',
};

const IDENTITY_FIELD_LABELS: Record<IdentitySlot['field'], string> = {
  given: 'Vorname',
  surname: 'Nachname',
  sex: 'Geschlecht',
};

const EVENT_FIELD_LABELS: Record<PersonEventSlot['field'], string> = {
  date: 'Datum',
  place: 'Ort',
  addr: 'Adresse',
  value: 'Wert',
  note: 'Notiz',
};

const SEX_VALUE_LABELS: Record<string, string> = { M: 'Männlich', F: 'Weiblich', U: 'Unbekannt' };

/** Menschenlesbares Feld-Label — Identität ODER Ereignisfeld, EIN Zugang für beide
 *  Slot-Arten (die Komponente muss nicht selbst unterscheiden). */
export function fieldLabel(slot: EntrySlot): string {
  return isEventSlot(slot) ? EVENT_FIELD_LABELS[slot.field] : IDENTITY_FIELD_LABELS[slot.field];
}

/** Lesbarer Vorbelegungs-Wert — `sex` bekommt seine Klartext-Form, alles andere bleibt
 *  roh (Datum/Ort/Wert sind bereits Freitext). */
export function prefillValueLabel(slot: EntrySlot): string {
  const raw = slot.prefill ?? '';
  if (!isEventSlot(slot) && slot.field === 'sex') return SEX_VALUE_LABELS[raw] ?? raw;
  return raw;
}

export interface EntryEventGroup {
  /** GEDCOM-Tag, z. B. `MARR`/`CHR`/`OCCU`. */
  event: string;
  label: string;
  slots: (PersonEventSlot | FamilyEventSlot)[];
}

export interface EntryRoleGroup {
  role: EntryRole;
  label: string;
  isFamily: boolean;
  /** Nur bei Personen-Rollen befüllt. */
  identitySlots: IdentitySlot[];
  eventGroups: EntryEventGroup[];
}

/**
 * Gruppiert die Slots einer Vorlage nach Rolle (in erster Auftrittsreihenfolge) und
 * innerhalb einer Rolle die Ereignis-Slots nach GEDCOM-Tag — die Erfassungs-Fläche
 * rendert je Rolle einen Abschnitt, je Ereignis-Tag eine Feldgruppe darin.
 */
export function groupTemplateSlots(tpl: EntryTemplate): EntryRoleGroup[] {
  const order: EntryRole[] = [];
  const identity = new Map<EntryRole, IdentitySlot[]>();
  const events = new Map<EntryRole, Map<string, (PersonEventSlot | FamilyEventSlot)[]>>();

  for (const slot of tpl.slots) {
    if (!order.includes(slot.role)) order.push(slot.role);
    if (isEventSlot(slot)) {
      const byRole = events.get(slot.role) ?? new Map<string, (PersonEventSlot | FamilyEventSlot)[]>();
      const list = byRole.get(slot.event) ?? [];
      list.push(slot);
      byRole.set(slot.event, list);
      events.set(slot.role, byRole);
    } else {
      const list = identity.get(slot.role) ?? [];
      list.push(slot);
      identity.set(slot.role, list);
    }
  }

  return order.map((role) => ({
    role,
    label: ENTRY_ROLE_LABELS[role],
    isFamily: isFamilyRole(role),
    identitySlots: identity.get(role) ?? [],
    eventGroups: [...(events.get(role) ?? new Map())].map(([event, slots]) => ({
      event,
      label: eventTypeLabel(event),
      slots,
    })),
  }));
}

/** Alle versteckten Vorbelegungen der ganzen Vorlage — Kopfzeilen-Chips (ADR-v9-264 E3:
 *  „das Feld wird gar nicht gerendert, der Wert erscheint als Chip im Kopf der Fläche"). */
export interface HiddenPrefillChip {
  key: string;
  text: string;
}

export function hiddenPrefillChips(tpl: EntryTemplate): HiddenPrefillChip[] {
  return tpl.slots
    .filter((s) => s.prefillMode === 'hidden')
    .map((s) => ({
      key: slotKey(s),
      text: `${ENTRY_ROLE_LABELS[s.role]} · ${fieldLabel(s)}: ${prefillValueLabel(s)}`,
    }));
}

/**
 * Der WIRKSAME Wert eines Identitätsfeldes: die Vorbelegung schlägt die Eingabe (beide
 * Anzeigemodi, ADR-v9-264 E3 — `hidden` wird gar nicht erst als Feld gerendert).
 *
 * Warum das hier steht und nicht nur im Kern: `applyEntryTemplate` löst die Vorbelegung
 * beim Speichern selbst auf, die Live-Dubletten-Suche der Fläche muss aber DIESELBE Person
 * beurteilen, die nachher entsteht. Ohne diese Funktion sah die Suche eine Person ohne
 * Geschlecht, während der Kern eine mit Geschlecht anlegte — zwei Hälften derselben Sache,
 * von denen nur eine gepflegt war.
 */
export function effectiveIdentityValue(
  group: EntryRoleGroup,
  field: IdentitySlot['field'],
  typed: string,
): string {
  const slot = group.identitySlots.find((s) => s.field === field);
  if (slot?.prefill === undefined) return typed;
  // Die Vorrang-Regel der drei Modi (ADR-v9-268 E6), hier für die Dubletten-Suche: bei
  // `hidden`/`locked` gilt die Vorbelegung, bei `prefilled` ist sie nur ein Startwert —
  // dort gewinnt, was im Feld steht. Dieselbe Reihenfolge wie in `aufloesen()`; stünde sie
  // hier anders, beurteilte die Suche wieder eine andere Person als die entstehende.
  if (slot.prefillMode === 'prefilled') return typed || slot.prefill;
  return slot.prefill;
}

export function isPersonRole(role: EntryRole): role is EntryPersonRole {
  return !isFamilyRole(role);
}

export function asFamilyRole(role: EntryRole): EntryFamilyRole | null {
  return isFamilyRole(role) ? (role as EntryFamilyRole) : null;
}
