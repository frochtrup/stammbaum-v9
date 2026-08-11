// ui/views/person/person-event-menu.ts — welche Ereignistypen bietet das
// „+ Ereignis"-Sammelmenü noch an? (Spec 20 §2, ADR-v9-62/-63). Reine Projektion über
// die Person, kein DOM — aus `PersonDetail.svelte` extrahiert (max-lines-Ratsche,
// feedback_generous_file_split: eine KOHÄSIVE Einheit herausnehmen, nicht trimmen).
//
// Die Regel dahinter ist „gefüllt schlägt selten": ein Item verschwindet, sobald sein
// Typ nicht mehr leer/abwesend ist — der generische „anderer Typ"-Fallback bleibt davon
// unberührt und trägt weiterhin ALLE Typen (auch Duplikate, z. B. ein zweiter Beruf).
import type { Person } from '../../../core/model/types';
import { isEventPresent } from '../../../core/model/event';
import { eventTypeLabel } from '../../shell/event-labels';

export interface EventMenuItem {
  tag: string;
  label: string;
}

function hasEventType(person: Person, tag: string): boolean {
  return person.events.some((e) => e.type === tag);
}

/** Zweite Häufigkeits-Gruppe: Taufe/Beruf/Bestattung (ADR-v9-62). */
export function primaryEventMenu(person: Person | null): EventMenuItem[] {
  if (!person) return [];
  const list: EventMenuItem[] = [];
  if (!isEventPresent(person.chr)) list.push({ tag: 'CHR', label: eventTypeLabel('CHR') });
  if (!hasEventType(person, 'OCCU')) list.push({ tag: 'OCCU', label: eventTypeLabel('OCCU') });
  if (!isEventPresent(person.buri)) list.push({ tag: 'BURI', label: eventTypeLabel('BURI') });
  return list;
}

export function secondaryEventMenu(person: Person | null): EventMenuItem[] {
  if (!person) return [];
  return ['EVEN', 'PROP', 'EMIG', 'GRAD', 'EDUC']
    .filter((t) => !hasEventType(person, t))
    .map((t) => ({ tag: t, label: eventTypeLabel(t) }));
}

/** Generischer „beliebiger Typ"-Fallback — bleibt für ALLE übrigen GEDCOM-Typen (inkl.
 *  der sechs, die ihren eigenen Pill-Platz verloren haben) UND für Duplikate bereits
 *  benannter Typen erreichbar (z. B. Berufswechsel).
 *
 *  Die zweite Gruppe kam mit BL-335 dazu: dieselben zehn Tags, die der Parser seitdem liest.
 *  Ein Typ, den die App aus der Datei ANZEIGEN kann, muss sie auch ANLEGEN können — sonst
 *  wäre eine importierte Priesterweihe sichtbar, eine neu erfasste unmöglich. Bewusst
 *  hierher und nicht in `secondaryEventMenu`: das ist die Häufigkeits-Vorauswahl (ADR-v9-62),
 *  und diese zehn sind selten. */
const OTHER_EVENT_TYPES = [
  'OCCU', 'RESI', 'EDUC', 'EMIG', 'IMMI', 'NATU', 'EVEN', 'GRAD', 'ADOP', 'MILI', 'FACT', 'CENS', 'PROP',
  'RELI',
  'ORDN', 'BAPM', 'CONF', 'FCOM', 'BLES', 'CHRA', 'BARM', 'BASM', 'CREM', 'PROB', 'RETI', 'WILL',
] as const;

export const otherEventMenu: EventMenuItem[] = OTHER_EVENT_TYPES.map((t) => ({
  tag: t,
  label: eventTypeLabel(t),
}));
