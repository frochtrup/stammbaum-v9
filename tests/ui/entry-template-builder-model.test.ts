// tests/ui/entry-template-builder-model.test.ts — reine Helfer des Vorlagen-Builders
// (BL-353, ADR-v9-264/-265). Kein happy-dom nötig (INV-ARCH-2-Geist): die Logik ist rein.
import { describe, expect, it } from 'vitest';
import { makeEntryTemplate, type EntrySlot, type EntryTemplate } from '../../core/model/entry-templates';
import {
  addEventSlotField,
  addIdentitySlot,
  availableEventFields,
  availableIdentityFields,
  combinedEntryTemplates,
  copyEntryTemplate,
  emptyEntryTemplate,
  entryTemplateBuilderErrors,
  eventTagsUsed,
  eventTypeChoicesFor,
  newEntryTemplateId,
  removeSlot,
  roleSummary,
  setSlotPrefill,
  swapSlots,
  moveRoleBlock,
  roleOrderOf,
} from '../../ui/views/entry/entry-template-builder-model';

describe('newEntryTemplateId — frisch und kollisionsarm', () => {
  it('liefert zwei verschiedene Ids nacheinander', () => {
    const a = newEntryTemplateId();
    const b = newEntryTemplateId();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });
});

describe('emptyEntryTemplate / combinedEntryTemplates', () => {
  it('liefert eine leere, benannte Vorlage', () => {
    const tpl = emptyEntryTemplate('et_1');
    expect(tpl).toEqual({ id: 'et_1', label: '', slots: [] });
  });

  it('setzt mitgelieferte vor eigene Vorlagen, ohne sie zu vermischen', () => {
    const builtin = [makeEntryTemplate('heirat', { label: 'Heirat' })];
    const custom = [makeEntryTemplate('et_1', { label: 'Meine Vorlage' })];
    expect(combinedEntryTemplates(builtin, custom).map((t) => t.id)).toEqual(['heirat', 'et_1']);
  });
});

describe('roleSummary — Rollen einer Vorlage in Auftrittsreihenfolge', () => {
  it('nennt jede belegte Rolle genau einmal, deutsch beschriftet', () => {
    const tpl = makeEntryTemplate('t', {
      slots: [
        { role: 'main', field: 'given' },
        { role: 'main', field: 'surname' },
        { role: 'spouse', field: 'given' },
        { role: 'spouseFamily', field: 'date', event: 'MARR' },
      ],
    });
    expect(roleSummary(tpl)).toBe('Hauptperson · Partner(in) · Ehefamilie/Partnerschaft');
  });

  it('liefert eine leere Zeichenkette für eine Vorlage ohne Felder', () => {
    expect(roleSummary(emptyEntryTemplate('t'))).toBe('');
  });
});

describe('copyEntryTemplate — Fertig-Zustand BL-353: eine Kopie ist eine eigenständige, gleichwertige Vorlage', () => {
  it('klont Slots UND Quellen-Vorbelegung tief, unter neuer Id, mit Kopie-Suffix', () => {
    const tpl = makeEntryTemplate('heirat', {
      label: 'Heirat (Heiratsbuch)',
      slots: [{ role: 'main', field: 'given' }],
      source: { sourceId: 'S1', abbr: 'KB', title: 'Kirchenbuch', quay: 2, pagePattern: 'Nr. ', urlPattern: '', pageCarry: false, urlCarry: false },
    });
    const copy = copyEntryTemplate(tpl, 'et_copy');

    expect(copy.id).toBe('et_copy');
    expect(copy.label).toBe('Heirat (Heiratsbuch) (Kopie)');
    expect(copy.slots).toEqual(tpl.slots);
    expect(copy.slots).not.toBe(tpl.slots);
    expect(copy.slots[0]).not.toBe(tpl.slots[0]);
    expect(copy.source).toEqual(tpl.source);
    expect(copy.source).not.toBe(tpl.source);

    // Original bleibt unangetastet — eine Mutation an der Kopie darf nicht durchschlagen.
    (copy.slots[0] as { prefill?: string }).prefill = 'X';
    expect((tpl.slots[0] as { prefill?: string }).prefill).toBeUndefined();
  });

  it('gibt einer namenlosen Vorlage trotzdem einen Kopie-Namen', () => {
    expect(copyEntryTemplate(emptyEntryTemplate('t'), 'et_2').label).toBe('Kopie');
  });
});

describe('Slot-Manipulation — rein, keine Mutation der übergebenen Liste', () => {
  const base: EntryTemplate = makeEntryTemplate('t', {
    slots: [
      { role: 'main', field: 'given' },
      { role: 'main', field: 'surname' },
      { role: 'main', field: 'date', event: 'CHR' },
      { role: 'main', field: 'place', event: 'CHR' },
    ],
  });

  it('removeSlot entfernt genau den benannten Slot', () => {
    const next = removeSlot(base.slots, 'main.surname');
    expect(next.map((s) => s.field)).toEqual(['given', 'date', 'place']);
    expect(base.slots).toHaveLength(4); // Original unverändert
  });

  it('swapSlots vertauscht zwei Slots über ihren Schlüssel', () => {
    const next = swapSlots(base.slots, 'main.CHR.date', 'main.CHR.place');
    expect(next.map((s) => s.field)).toEqual(['given', 'surname', 'place', 'date']);
  });

  it('swapSlots ist ein No-op bei einem unbekannten Schlüssel', () => {
    const next = swapSlots(base.slots, 'main.given', 'gibtsnicht');
    expect(next).toEqual(base.slots);
  });

  it('setSlotPrefill setzt eine Vorbelegung und kann sie wieder entfernen', () => {
    const withPrefill = setSlotPrefill(base.slots, 'main.given', { prefill: 'Josef', prefillMode: 'locked' });
    const slot = withPrefill.find((s) => s.field === 'given')!;
    expect(slot.prefill).toBe('Josef');
    expect(slot.prefillMode).toBe('locked');

    const cleared = setSlotPrefill(withPrefill, 'main.given', null);
    const clearedSlot = cleared.find((s) => s.field === 'given')!;
    expect(clearedSlot.prefill).toBeUndefined();
    expect(clearedSlot.prefillMode).toBeUndefined();
  });

  it('addIdentitySlot fügt ein Feld an, doppelt nicht', () => {
    const once = addIdentitySlot([], 'main', 'given');
    expect(once).toHaveLength(1);
    const twice = addIdentitySlot(once, 'main', 'given');
    expect(twice).toHaveLength(1); // kein Duplikat
  });

  it('addEventSlotField fügt ein Ereignisfeld an, doppelt nicht — und respektiert Familien-Rollen', () => {
    const once = addEventSlotField([], 'spouseFamily', 'MARR', 'date');
    expect(once).toEqual([{ role: 'spouseFamily', field: 'date', event: 'MARR' }]);
    const twice = addEventSlotField(once, 'spouseFamily', 'MARR', 'date');
    expect(twice).toHaveLength(1);
  });

  it('availableIdentityFields nennt nur die noch fehlenden Felder', () => {
    const slots = addIdentitySlot([], 'main', 'given');
    expect(availableIdentityFields(slots, 'main')).toEqual(['surname', 'sex']);
  });

  it('availableEventFields nennt nur die noch fehlenden Unterfelder EINER Ereignisgruppe', () => {
    const slots = addEventSlotField([], 'main', 'CHR', 'date');
    expect(availableEventFields(slots, 'main', 'CHR')).toEqual(['place', 'addr', 'value', 'note']);
  });

  it('eventTagsUsed nennt die vorhandenen Ereignis-Tags einer Rolle, ohne Duplikate', () => {
    let slots = addEventSlotField([], 'main', 'CHR', 'date');
    slots = addEventSlotField(slots, 'main', 'CHR', 'place');
    slots = addEventSlotField(slots, 'main', 'DEAT', 'date');
    expect(eventTagsUsed(slots, 'main')).toEqual(['CHR', 'DEAT']);
  });
});

describe('eventTypeChoicesFor — INV-UI-8: keine zweite Typ-Liste', () => {
  it('Familien-Rollen bieten ausschließlich MARR/ENGA', () => {
    const choices = eventTypeChoicesFor('spouseFamily', []);
    expect(choices.map((c) => c.tag).sort()).toEqual(['ENGA', 'MARR']);
  });

  it('Personen-Rollen bieten den vollen Katalog, ohne bereits verwendete Tags', () => {
    const choices = eventTypeChoicesFor('main', ['CHR']);
    expect(choices.some((c) => c.tag === 'CHR')).toBe(false);
    expect(choices.some((c) => c.tag === 'BIRT')).toBe(true);
    expect(choices.some((c) => c.tag === 'OCCU')).toBe(true);
    expect(choices.length).toBeGreaterThan(10);
  });
});

describe('entryTemplateBuilderErrors — Fertig-Zustand: keine leere Vorlage speicherbar', () => {
  it('meldet einen fehlenden Namen', () => {
    const tpl = makeEntryTemplate('t', { slots: [{ role: 'main', field: 'given' }] });
    expect(entryTemplateBuilderErrors(tpl)).toEqual(['Die Vorlage braucht einen Namen.']);
  });

  it('meldet fehlende Felder', () => {
    const tpl = makeEntryTemplate('t', { label: 'X' });
    expect(entryTemplateBuilderErrors(tpl)).toEqual(['Die Vorlage braucht mindestens ein Feld.']);
  });

  it('ist leer, wenn Name UND mindestens ein Feld vorhanden sind', () => {
    const tpl = makeEntryTemplate('t', { label: 'X', slots: [{ role: 'main', field: 'given' }] });
    expect(entryTemplateBuilderErrors(tpl)).toEqual([]);
  });
});

describe('moveRoleBlock — ganze Rollen-Blöcke verschieben (ADR-v9-268 E5, BL-357)', () => {
  const slots = [
    { role: 'main', field: 'given' },
    { role: 'main', field: 'surname' },
    { role: 'father', field: 'given' },
    { role: 'spouse', field: 'given' },
    { role: 'spouse', field: 'surname' },
  ] as EntrySlot[];

  it('leitet die Block-Reihenfolge aus der Feldliste ab — kein zweites Feld', () => {
    expect(roleOrderOf(slots)).toEqual(['main', 'father', 'spouse']);
  });

  it('verschiebt den Block MIT seinen Feldern und behält deren Reihenfolge', () => {
    const nachher = moveRoleBlock(slots, 'father', -1);

    expect(roleOrderOf(nachher)).toEqual(['father', 'main', 'spouse']);
    // Die Felder der Hauptperson stehen weiterhin in ihrer Reihenfolge beieinander.
    expect(nachher.map((s) => `${s.role}.${s.field}`)).toEqual([
      'father.given',
      'main.given',
      'main.surname',
      'spouse.given',
      'spouse.surname',
    ]);
  });

  it('nach unten ist die Umkehrung von nach oben', () => {
    const runter = moveRoleBlock(slots, 'main', 1);
    expect(roleOrderOf(runter)).toEqual(['father', 'main', 'spouse']);
    expect(moveRoleBlock(runter, 'main', -1)).toEqual([...slots]);
  });

  it('am Rand und bei unbekannter Rolle bleibt alles, wie es war', () => {
    expect(moveRoleBlock(slots, 'main', -1)).toEqual([...slots]);
    expect(moveRoleBlock(slots, 'spouse', 1)).toEqual([...slots]);
    expect(moveRoleBlock(slots, 'spouseMother', -1)).toEqual([...slots]);
  });

  it('verliert kein Feld — die Menge bleibt gleich', () => {
    const nachher = moveRoleBlock(slots, 'spouse', -1);
    expect(nachher).toHaveLength(slots.length);
    expect([...nachher].sort((a, b) => `${a.role}${a.field}`.localeCompare(`${b.role}${b.field}`)))
      .toEqual([...slots].sort((a, b) => `${a.role}${a.field}`.localeCompare(`${b.role}${b.field}`)));
  });
});
