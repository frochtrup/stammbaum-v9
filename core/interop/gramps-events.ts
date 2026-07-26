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

// Ereignistyp-Tabelle GRAMPS-`<type>` ↔ GEDCOM-Tag lebt seit BL-156 kanonisch in enum-maps.ts
// (gebündelt mit QUAY/PEDI/MEDI); hier importiert (interner Gebrauch) + re-exportiert, damit
// bestehende Importe unverändert bleiben (kein Native-Test berührt).
import { grampsTypeToTag, tagToGrampsType } from './enum-maps';
export { grampsTypeToTag, tagToGrampsType };

/**
 * Event-Typen, deren `<description>` eine ADRESSE ist (nicht Beruf/Notiz) — das Wohn- bzw.
 * Grundstücks-Ereignis (BL-143). GRAMPS kennt keine Event-`<address>`; die Straße/Hausnummer
 * (`Nienborger Damm 1`) steht bei diesen Typen im `<description>`. Für sie projiziert die
 * description auf `event.addr` (füttert den Hof-Apparat — Identität = villageId+addr — und
 * wird beim GEDCOM-Export zu `ADDR`), NICHT auf `value`; symmetrisch im Write-Back. Nur
 * RESI/PROP: eine OCCU-`<description>` ist der Beruf (`Diplom-Ingenieur`), eine CENS-
 * `<description>` eine Notiz — beide bleiben `value`.
 */
const ADDRESS_DESC_TAGS = new Set(['RESI', 'PROP']);
export function descriptionIsAddress(tag: string): boolean {
  return ADDRESS_DESC_TAGS.has(tag);
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
  // Fidelity-id des geteilten <event>-Records (E0000, ersatzweise Handle): stabiler
  // Zuordnungsschlüssel fürs Write-Back (BL-142/144, id-basiert wie alle Refs — BL-136).
  ev.grampsId = attr(eventNode, 'id') || attr(eventNode, 'handle') || null;
  // BL-143: bei RESI/PROP ist die <description> die Adresse → event.addr (Hof-Apparat/ADDR-
  // Export); sonst der Freitext-Wert (Beruf/Notiz) → event.value. Symmetrisch im Write-Back.
  const desc = firstChild(eventNode, 'description')?.text ?? '';
  if (descriptionIsAddress(tag)) ev.addr = desc;
  else ev.value = desc;
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
