// core/interop/gramps-events.ts — GRAMPS-Event-Projektion (BL-140 Stufe 1b, ADR-v9-114 D1/D5).
//
// GRAMPS-Events sind Top-Level-Records (`<events>`), von Person/Familie per `<eventref role>`
// referenziert (GETEILT), anders als die besessenen GEDCOM-Events. Die Projektion:
//   - D1: Typ-Tabelle GRAMPS-`<type>` ↔ GEDCOM-Tag (aus `gen/lib/eventtype.py::_DATAMAP`);
//     nur die Built-ins mit einem Tag, den das Modell führt (SPECIAL ∪ EVENT_TAGS,
//     s. gedcom-parse.ts), stehen direkt in der Tabelle. Alles Übrige (Built-ins ohne
//     1:1-Tag UND Custom-/deutsche Typen) → `EVEN` mit `eventType` = wörtlicher GRAMPS-Typ.
//     Bidirektional (Rückrichtung für das Write-Back, BL-142).
//   - D5: Events werden BY-REFERENCE projiziert; die Verteilung auf die Main-Slots
//     (Birth/Christening/Death/Burial bzw. Marriage/Engagement) macht `distribute*Events`.
//
// Reine Funktionen, DOM-/Plattform-frei (INV-ARCH-1).

import { makeEvent } from '../model/factory';
import type { Event } from '../model/types';
import type { XmlNode } from './xml-tree';
import { attr, firstChild } from './xml-tree';
import { grampsDateOf } from './gramps-date';

/**
 * GRAMPS-`<type>`-Wert → GEDCOM-Tag. Nur Built-ins, deren Tag das Modell kennt
 * (SPECIAL_EVENT_TAGS ∪ EVENT_TAGS in gedcom-parse.ts). GRAMPS-Strings sind die
 * `xml_str`-Spalte aus `eventtype.py::_DATAMAP`.
 */
const TAG_BY_GRAMPS: Record<string, string> = {
  Birth: 'BIRT',
  Death: 'DEAT',
  Christening: 'CHR',
  Burial: 'BURI',
  Baptism: 'BAPM',
  Confirmation: 'CONF',
  Adopted: 'ADOP',
  Census: 'CENS',
  Occupation: 'OCCU',
  Residence: 'RESI',
  Education: 'EDUC',
  Emigration: 'EMIG',
  Immigration: 'IMMI',
  Naturalization: 'NATU',
  Graduation: 'GRAD',
  Property: 'PROP',
  'Military Service': 'MILI',
  Marriage: 'MARR',
  Engagement: 'ENGA',
  Divorce: 'DIV',
};
const GRAMPS_BY_TAG: Record<string, string> = Object.fromEntries(
  Object.entries(TAG_BY_GRAMPS).map(([g, t]) => [t, g]),
);

/** GRAMPS-Typ → `{ tag, eventType }`. Nicht kartiert → `EVEN` + wörtlicher Typ. */
export function grampsTypeToTag(grampsType: string): { tag: string; eventType: string } {
  const tag = TAG_BY_GRAMPS[grampsType];
  return tag ? { tag, eventType: '' } : { tag: 'EVEN', eventType: grampsType };
}

/** GEDCOM-Tag (+ `eventType`) → GRAMPS-Typ-String. Umkehrung für das Write-Back. */
export function tagToGrampsType(tag: string, eventType: string): string {
  if (tag === 'EVEN' || tag === 'FACT') return eventType || 'Event';
  return GRAMPS_BY_TAG[tag] ?? (eventType || tag);
}

/**
 * Ein GRAMPS-`<event>`-Knoten → Modell-`Event`. `resolvePlace` liefert den Orts-String zu
 * einem `<place hlink>` (D3: nur String; die Auflösung placeobj→ptitle stellt der Aufrufer).
 * Zitate bleiben hier leer — sie kommen in Stufe 1c (`<citationref>`) dazu.
 */
export function projectGrampsEvent(eventNode: XmlNode, resolvePlace: (hlink: string) => string): Event {
  const typeStr = firstChild(eventNode, 'type')?.text ?? '';
  const { tag, eventType } = grampsTypeToTag(typeStr);
  const ev = makeEvent(tag);
  ev.seen = true;
  ev.eventType = eventType;
  ev.value = firstChild(eventNode, 'description')?.text ?? '';
  const d = grampsDateOf(eventNode);
  ev.date = d.date;
  ev.datePhrase = d.datePhrase;
  const placeRef = firstChild(eventNode, 'place');
  ev.place = placeRef ? resolvePlace(attr(placeRef, 'hlink')) : null;
  return ev;
}

/** Person-Main-Slots je GEDCOM-Tag. */
const PERSON_SLOT: Record<string, 'birth' | 'chr' | 'death' | 'buri'> = {
  BIRT: 'birth',
  CHR: 'chr',
  DEAT: 'death',
  BURI: 'buri',
};

export interface PersonEvents {
  birth: Event;
  chr: Event;
  death: Event;
  buri: Event;
  events: Event[];
}

/**
 * Verteilt die projizierten Personen-Events auf die Main-Slots; jeder Slot wird nur EINMAL
 * gefüllt (weiteres BIRT/DEAT etc. wandert in `events[]`, wie der GEDCOM-Parser). Leere
 * Main-Slots bleiben ein leerer `makeEvent(tag)` (Modell-Vertrag: Slots existieren immer).
 */
export function distributePersonEvents(events: Event[]): PersonEvents {
  const out: PersonEvents = {
    birth: makeEvent('BIRT'),
    chr: makeEvent('CHR'),
    death: makeEvent('DEAT'),
    buri: makeEvent('BURI'),
    events: [],
  };
  const filled = new Set<string>();
  for (const ev of events) {
    const slot = PERSON_SLOT[ev.type];
    if (slot && !filled.has(slot)) {
      out[slot] = ev;
      filled.add(slot);
    } else {
      out.events.push(ev);
    }
  }
  return out;
}

/** Familien-Main-Slots je GEDCOM-Tag. */
const FAMILY_SLOT: Record<string, 'marriage' | 'engagement'> = {
  MARR: 'marriage',
  ENGA: 'engagement',
};

export interface FamilyEvents {
  marriage: Event;
  engagement: Event;
  events: Event[];
}

export function distributeFamilyEvents(events: Event[]): FamilyEvents {
  const out: FamilyEvents = {
    marriage: makeEvent('MARR'),
    engagement: makeEvent('ENGA'),
    events: [],
  };
  const filled = new Set<string>();
  for (const ev of events) {
    const slot = FAMILY_SLOT[ev.type];
    if (slot && !filled.has(slot)) {
      out[slot] = ev;
      filled.add(slot);
    } else {
      out.events.push(ev);
    }
  }
  return out;
}
