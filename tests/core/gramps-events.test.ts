// tests/core/gramps-events.test.ts — BL-140 Stufe 1b (ADR-v9-114 D1/D5).
//
// GRAMPS-Event (Top-Level `<event>`, referenziert per `<eventref role>`) → Modell-`Event`.
// D1: Typ-Tabelle GRAMPS-`<type>` ↔ GEDCOM-Tag (aus `gen/lib/eventtype.py::_DATAMAP`),
//     Nicht-Kartierte/Custom → `EVEN` mit wörtlichem `eventType` (round-trippt).
// D5: Events werden by-reference projiziert; Main-Slots (Birth/Christening/Death/Burial →
//     person.birth/chr/death/buri, Marriage/Engagement → family.marriage/engagement),
//     Übriges in `events[]`.

import { describe, it, expect } from 'vitest';
import type { XmlNode } from '../../core/interop/xml-tree';
import { makeEvent } from '../../core/model/factory';
import {
  grampsTypeToTag,
  tagToGrampsType,
  projectGrampsEvent,
  distributePersonEvents,
  distributeFamilyEvents,
} from '../../core/interop/gramps-events';

function node(tag: string, attrs: Record<string, string> = {}, children: XmlNode[] = [], text = ''): XmlNode {
  return { tag, attrs: Object.entries(attrs), children, text };
}
const noPlace = (): string => '';

describe('grampsTypeToTag — GRAMPS-Typ → GEDCOM-Tag (D1)', () => {
  it('direkt kartierte Built-ins', () => {
    expect(grampsTypeToTag('Birth')).toEqual({ tag: 'BIRT', eventType: '' });
    expect(grampsTypeToTag('Death')).toEqual({ tag: 'DEAT', eventType: '' });
    expect(grampsTypeToTag('Christening')).toEqual({ tag: 'CHR', eventType: '' });
    expect(grampsTypeToTag('Burial')).toEqual({ tag: 'BURI', eventType: '' });
    expect(grampsTypeToTag('Occupation')).toEqual({ tag: 'OCCU', eventType: '' });
    expect(grampsTypeToTag('Residence')).toEqual({ tag: 'RESI', eventType: '' });
    expect(grampsTypeToTag('Marriage')).toEqual({ tag: 'MARR', eventType: '' });
  });
  it('nicht kartierte Built-ins → EVEN + wörtlicher Typ', () => {
    expect(grampsTypeToTag('Cause Of Death')).toEqual({ tag: 'EVEN', eventType: 'Cause Of Death' });
    // `Religion` IST seit BL-289 kartiert (RELI ist ein Ereignistyp) — als zweites
    // Beispiel fuer einen nicht kartierten Built-in steht jetzt `Occupation`s Nachbar.
    expect(grampsTypeToTag('Number of Marriages')).toEqual({ tag: 'EVEN', eventType: 'Number of Marriages' });
  });
  it('Custom/deutsche Typen → EVEN + wörtlicher Typ', () => {
    expect(grampsTypeToTag('Beschäftigung')).toEqual({ tag: 'EVEN', eventType: 'Beschäftigung' });
    expect(grampsTypeToTag('Alt. Geburt')).toEqual({ tag: 'EVEN', eventType: 'Alt. Geburt' });
  });
});

describe('tagToGrampsType — Rückrichtung (Write-Back-Vorbereitung)', () => {
  it('direkt kartierte Tags', () => {
    expect(tagToGrampsType('BIRT', '')).toBe('Birth');
    expect(tagToGrampsType('OCCU', '')).toBe('Occupation');
    expect(tagToGrampsType('MARR', '')).toBe('Marriage');
  });
  it('EVEN → wörtlicher eventType', () => {
    expect(tagToGrampsType('EVEN', 'Beschäftigung')).toBe('Beschäftigung');
  });
  it('round-trippt für Built-ins UND Custom', () => {
    for (const t of ['Birth', 'Occupation', 'Marriage', 'Beschäftigung', 'Cause Of Death']) {
      const { tag, eventType } = grampsTypeToTag(t);
      expect(tagToGrampsType(tag, eventType)).toBe(t);
    }
  });
});

describe('projectGrampsEvent — ein GRAMPS-Event → Modell-Event', () => {
  it('Typ + Datum + Beschreibung + Ort', () => {
    const ev = projectGrampsEvent(
      node('event', {}, [
        node('type', {}, [], 'Birth'),
        node('dateval', { val: '1967-02-16' }),
        node('description', {}, [], 'zu Hause'),
        node('place', { hlink: '_p1' }),
      ]),
      (h) => (h === '_p1' ? 'Burgsteinfurt' : ''),
    );
    expect(ev.type).toBe('BIRT');
    expect(ev.eventType).toBe('');
    expect(ev.date).toBe('16 FEB 1967');
    expect(ev.value).toBe('zu Hause');
    expect(ev.place).toBe('Burgsteinfurt');
    expect(ev.seen).toBe(true);
  });
  it('Custom-Typ landet in eventType, Tag EVEN', () => {
    const ev = projectGrampsEvent(node('event', {}, [node('type', {}, [], 'Militärdienst')]), noPlace);
    expect(ev.type).toBe('EVEN');
    expect(ev.eventType).toBe('Militärdienst');
  });
  it('ohne <place> bleibt place null', () => {
    const ev = projectGrampsEvent(node('event', {}, [node('type', {}, [], 'Death')]), noPlace);
    expect(ev.place).toBeNull();
  });
});

describe('distributePersonEvents — Main-Slots + Rest (D5)', () => {
  it('verteilt auf birth/chr/death/buri, Rest in events[]', () => {
    const evs = [makeEvent('BIRT'), makeEvent('DEAT'), makeEvent('OCCU'), makeEvent('RESI')];
    const r = distributePersonEvents(evs);
    expect(r.birth.type).toBe('BIRT');
    expect(r.death.type).toBe('DEAT');
    expect(r.events.map((e) => e.type)).toEqual(['OCCU', 'RESI']);
  });
  it('zweites BIRT geht in events[] (Slot nur einmal)', () => {
    const r = distributePersonEvents([makeEvent('BIRT', { value: 'a' }), makeEvent('BIRT', { value: 'b' })]);
    expect(r.birth.value).toBe('a');
    expect(r.events.map((e) => e.value)).toEqual(['b']);
  });
});

describe('distributeFamilyEvents — Marriage/Engagement + Rest', () => {
  it('verteilt auf marriage/engagement, Divorce in events[]', () => {
    const r = distributeFamilyEvents([makeEvent('MARR'), makeEvent('ENGA'), makeEvent('DIV')]);
    expect(r.marriage.type).toBe('MARR');
    expect(r.engagement.type).toBe('ENGA');
    expect(r.events.map((e) => e.type)).toEqual(['DIV']);
  });
});
