// tests/ui/entry-template-capture-model.test.ts — Gruppierungs-/Beschriftungs-Helfer der
// Erfassungs-Fläche (BL-352). Reine Funktionen, kein Komponenten-Mount nötig.
import { describe, expect, it } from 'vitest';
import {
  ENTRY_ROLE_LABELS,
  fieldLabel,
  groupTemplateSlots,
  hiddenPrefillChips,
  prefillValueLabel,
} from '../../ui/shell/entry-template-capture-model';
import { EVENT_TYPE_LABELS } from '../../ui/shell/event-labels';
import { makeEntryTemplate, type EntryTemplate } from '../../core/model/entry-templates';

const HEIRAT: EntryTemplate = makeEntryTemplate('t-heirat', {
  label: 'Heirat',
  slots: [
    { role: 'spouseFamily', field: 'date', event: 'MARR' },
    { role: 'spouseFamily', field: 'place', event: 'MARR' },
    { role: 'main', field: 'surname' },
    { role: 'main', field: 'given' },
    { role: 'main', field: 'sex', prefill: 'M', prefillMode: 'hidden' },
    { role: 'spouse', field: 'surname' },
    { role: 'spouse', field: 'given' },
    { role: 'spouse', field: 'sex', prefill: 'F', prefillMode: 'hidden' },
  ],
});

const VOLL: EntryTemplate = makeEntryTemplate('t-voll', {
  label: 'Taufe mit Eltern',
  slots: [
    { role: 'main', field: 'given' },
    { role: 'main', field: 'surname' },
    { role: 'main', field: 'date', event: 'CHR', prefill: 'Ochtrup', prefillMode: 'locked' },
    { role: 'main', field: 'place', event: 'CHR', prefill: 'Ochtrup', prefillMode: 'locked' },
    { role: 'father', field: 'given' },
    { role: 'father', field: 'sex', prefill: 'M', prefillMode: 'hidden' },
    { role: 'parentFamily', field: 'date', event: 'MARR' },
  ],
});

describe('groupTemplateSlots', () => {
  it('gruppiert nach Rolle, in erster Auftrittsreihenfolge', () => {
    const groups = groupTemplateSlots(HEIRAT);
    expect(groups.map((g) => g.role)).toEqual(['spouseFamily', 'main', 'spouse']);
  });

  it('trennt Identitäts- von Ereignis-Slots je Rolle', () => {
    const groups = groupTemplateSlots(HEIRAT);
    const main = groups.find((g) => g.role === 'main')!;
    expect(main.identitySlots.map((s) => s.field)).toEqual(['surname', 'given', 'sex']);
    expect(main.eventGroups).toEqual([]);
    expect(main.isFamily).toBe(false);
  });

  it('gruppiert Ereignis-Slots einer Rolle nach GEDCOM-Tag', () => {
    const groups = groupTemplateSlots(VOLL);
    const main = groups.find((g) => g.role === 'main')!;
    expect(main.eventGroups).toHaveLength(1);
    expect(main.eventGroups[0].event).toBe('CHR');
    expect(main.eventGroups[0].label).toBe('Taufe');
    expect(main.eventGroups[0].slots.map((s) => s.field)).toEqual(['date', 'place']);
  });

  it('markiert Familien-Rollen (spouseFamily/parentFamily) als solche', () => {
    const groups = groupTemplateSlots(VOLL);
    const eltern = groups.find((g) => g.role === 'parentFamily')!;
    expect(eltern.isFamily).toBe(true);
    expect(eltern.identitySlots).toEqual([]);
    expect(eltern.eventGroups[0].event).toBe('MARR');
  });

  it('bei einer leeren Vorlage: keine Gruppen', () => {
    expect(groupTemplateSlots(makeEntryTemplate('leer'))).toEqual([]);
  });
});

describe('hiddenPrefillChips — nur prefillMode:hidden, mit lesbarem sex-Wert', () => {
  it('listet genau die hidden-Slots der ganzen Vorlage, nicht die locked-Slots', () => {
    const chips = hiddenPrefillChips(VOLL);
    expect(chips).toHaveLength(1);
    expect(chips[0].text).toContain('Vater');
    expect(chips[0].text).toContain('Geschlecht');
    expect(chips[0].text).toContain('Männlich');
  });

  it('zwei Rollen mit hidden sex ergeben zwei Chips (Heirat: main + spouse)', () => {
    const chips = hiddenPrefillChips(HEIRAT);
    expect(chips).toHaveLength(2);
    expect(chips.map((c) => c.text).join(' | ')).toContain('Männlich');
    expect(chips.map((c) => c.text).join(' | ')).toContain('Weiblich');
  });

  it('ohne jede hidden-Vorbelegung: leere Liste (keine Kopfzeilen-Chips)', () => {
    const ohneHidden = makeEntryTemplate('ohne', {
      slots: [{ role: 'main', field: 'given' }, { role: 'main', field: 'date', event: 'CHR', prefill: 'Ochtrup', prefillMode: 'locked' }],
    });
    expect(hiddenPrefillChips(ohneHidden)).toEqual([]);
  });
});

describe('fieldLabel/prefillValueLabel', () => {
  it('übersetzt Identitätsfelder ins Deutsche', () => {
    expect(fieldLabel({ role: 'main', field: 'given' })).toBe('Vorname');
    expect(fieldLabel({ role: 'main', field: 'surname' })).toBe('Nachname');
  });

  it('übersetzt Ereignisfelder ins Deutsche', () => {
    expect(fieldLabel({ role: 'main', field: 'date', event: 'CHR' })).toBe('Datum');
    expect(fieldLabel({ role: 'main', field: 'place', event: 'CHR' })).toBe('Ort');
  });

  it('prefillValueLabel übersetzt nur sex, alles andere bleibt roh', () => {
    expect(prefillValueLabel({ role: 'main', field: 'sex', prefill: 'F', prefillMode: 'hidden' })).toBe('Weiblich');
    expect(
      prefillValueLabel({ role: 'main', field: 'place', event: 'CHR', prefill: 'Ochtrup', prefillMode: 'locked' }),
    ).toBe('Ochtrup');
  });
});

describe('ENTRY_ROLE_LABELS — jede EntryRole hat ein deutsches Label (Feld-Vollständigkeit)', () => {
  it('deckt alle neun Rollen ab (ADR-v9-268 E1: beide Elternpaare)', () => {
    expect(Object.keys(ENTRY_ROLE_LABELS).sort()).toEqual(
      [
        'father',
        'main',
        'mother',
        'parentFamily',
        'spouse',
        'spouseFamily',
        'spouseFather',
        'spouseMother',
        'spouseParentFamily',
      ].sort(),
    );
  });
});

describe('Ereignistyp-Labels sind unterscheidbar (Nutzer-Befund CHR/BAPM)', () => {
  it('kein Label kommt zweimal vor — sonst greift man im Menü zum falschen Tag', () => {
    const labels = Object.values(EVENT_TYPE_LABELS);
    expect(labels.length).toBeGreaterThan(20);

    const doppelt = labels.filter((l, i) => labels.indexOf(l) !== i);
    expect([...new Set(doppelt)]).toEqual([]);
  });

  it('die Taufe des Kirchenbuchs ist CHR, nicht BAPM', () => {
    // GEDCOM 5.5.1: `CHR` = Kindstaufe (der Regelfall), `BAPM` = Glaubens-/
    // Erwachsenentaufe. Die mitgelieferte Taufe-Vorlage nutzt CHR.
    expect(EVENT_TYPE_LABELS.CHR).toBe('Taufe');
    expect(EVENT_TYPE_LABELS.BAPM).not.toBe('Taufe');
  });
});
