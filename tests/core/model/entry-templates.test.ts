// tests/core/model/entry-templates.test.ts — Erfassungs-Vorlagen: das Modell
// (Spec 20 §2 „Erfassungs-Vorlagen", ADR-v9-264 Entscheidungen 1/2/3/7/8, BL-232).
//
// Was hier verriegelt wird, ist die Kernaussage der Entscheidung: das Feld-Vokabular IST
// das Modell. Ein Test, der nur „die Vorlage hat vier Felder" prüfte, ließe genau die
// zweite Feldtyp-Liste zu, die ADR-v9-264 abschafft — deshalb prüft jeder Test unten die
// Feldnamen gegen `keyof Person`/`keyof Event`, nicht gegen eine eigene Aufzählung.
import { describe, it, expect } from 'vitest';
import {
  BUILTIN_ENTRY_TEMPLATES,
  ENTRY_FAMILY_ROLES,
  ENTRY_PERSON_ROLES,
  EVENT_FIELDS,
  FAMILY_EVENT_TAGS,
  IDENTITY_FIELDS,
  isBuiltinEntryTemplate,
  isEventSlot,
  makeEntryTemplate,
  normalizeEntryTemplate,
  resolveEntrySourcePrefill,
  slotKey,
  type EntrySlot,
  type EntryTemplate,
} from '../../../core/model/entry-templates';
import { makeSource } from '../../../core/model/factory';

const alleSlots = (): { tpl: EntryTemplate; slot: EntrySlot }[] =>
  BUILTIN_ENTRY_TEMPLATES.flatMap((tpl) => tpl.slots.map((slot) => ({ tpl, slot })));

describe('Erfassungs-Vorlagen — das Feld-Vokabular ist das Modell (ADR-v9-264 E1)', () => {
  it('jedes Feld einer mitgelieferten Vorlage ist ein Feldname des Modells', () => {
    const slots = alleSlots();
    expect(slots.length).toBeGreaterThan(0); // ADR-v9-200: nie über eine leere Menge grün
    const erlaubt = new Set<string>([...IDENTITY_FIELDS, ...EVENT_FIELDS]);
    for (const { tpl, slot } of slots) {
      expect(erlaubt.has(slot.field), `${tpl.id}: ${slot.field}`).toBe(true);
    }
  });

  it('ein Identitätsfeld trägt KEINEN Ereignistyp, ein Ereignisfeld immer einen', () => {
    const slots = alleSlots();
    expect(slots.length).toBeGreaterThan(0);
    for (const { slot } of slots) {
      const identitaet = (IDENTITY_FIELDS as readonly string[]).includes(slot.field);
      expect(isEventSlot(slot)).toBe(!identitaet);
    }
  });

  it('`slotKey` adressiert (Rolle, Feld[, Tag]) eindeutig — je Vorlage kollisionsfrei', () => {
    expect(BUILTIN_ENTRY_TEMPLATES.length).toBeGreaterThan(0);
    for (const tpl of BUILTIN_ENTRY_TEMPLATES) {
      const keys = tpl.slots.map(slotKey);
      expect(keys.length).toBeGreaterThan(0);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('Neun Rollen, davon drei für Familien (ADR-v9-264 E2, erweitert durch ADR-v9-268 E1)', () => {
  it('Familien-Rollen tragen ausschließlich Familien-Ereignis-Slots (MARR/ENGA)', () => {
    const familienSlots = alleSlots().filter(({ slot }) =>
      (ENTRY_FAMILY_ROLES as readonly string[]).includes(slot.role),
    );
    expect(familienSlots.length).toBeGreaterThan(0);
    for (const { slot } of familienSlots) {
      expect(isEventSlot(slot)).toBe(true);
      const tag = isEventSlot(slot) ? slot.event : '';
      expect(FAMILY_EVENT_TAGS as readonly string[]).toContain(tag);
    }
  });

  it('der Heiratsort ist ein `place`-Slot der Familien-Rolle, kein Sonderziel an einer Person', () => {
    // Genau der v8-Defekt (Ort + Ziel `marr` fiel durch die Whitelist): in v9 kann die
    // Kombination gar nicht mehr an einer Personen-Rolle entstehen.
    const heirat = BUILTIN_ENTRY_TEMPLATES.find((t) => t.id === 'heirat');
    expect(heirat).toBeDefined();
    const ort = heirat!.slots.find((s) => s.field === 'place');
    expect(ort).toBeDefined();
    expect(ort!.role).toBe('spouseFamily');
  });

  it('alle neun Rollen sind benannt und disjunkt (ADR-v9-268 E1)', () => {
    // Erweitert um die Eltern des Partners: `spouseFather`/`spouseMother` samt ihrer
    // Familie `spouseParentFamily` (die FAMC des Partners) — die symmetrische Ergänzung
    // zu `father`/`mother`/`parentFamily`, weil ein Trauregister beide Elternpaare nennt.
    expect([...ENTRY_PERSON_ROLES]).toEqual([
      'main',
      'father',
      'mother',
      'spouse',
      'spouseFather',
      'spouseMother',
    ]);
    expect([...ENTRY_FAMILY_ROLES]).toEqual(['parentFamily', 'spouseParentFamily', 'spouseFamily']);
    expect(new Set([...ENTRY_PERSON_ROLES, ...ENTRY_FAMILY_ROLES]).size).toBe(9);
  });
});

describe('Vorbelegung ist ein Slot-Attribut (ADR-v9-264 E3)', () => {
  it('`prefill` steht je Feld, nicht je Vorlage — mit eigenem Anzeigemodus', () => {
    const mitPrefill = alleSlots().filter(({ slot }) => slot.prefill !== undefined);
    expect(mitPrefill.length).toBeGreaterThan(0);
    for (const { slot } of mitPrefill) {
      expect(['hidden', 'locked']).toContain(slot.prefillMode);
    }
    // Und die Vorlage selbst trägt KEINEN globalen Schalter (v8 `implicitMode`).
    for (const tpl of BUILTIN_ENTRY_TEMPLATES) {
      expect(Object.keys(tpl)).not.toContain('implicitMode');
      expect(Object.keys(tpl)).not.toContain('prefillMode');
    }
  });
});

describe('Die drei Standard-Vorlagen sind Daten, kein Code (ADR-v9-264 E8)', () => {
  it('Heirat · Taufe · Sterbefall, ohne Quellen-Vorbelegung', () => {
    expect(BUILTIN_ENTRY_TEMPLATES.map((t) => t.id)).toEqual(['heirat', 'taufe', 'sterbefall']);
    for (const tpl of BUILTIN_ENTRY_TEMPLATES) {
      expect(tpl.source).toBeUndefined(); // bestandsabhängig — nicht mitgeliefert
      expect(tpl.label).not.toBe('');
      expect(isBuiltinEntryTemplate(tpl.id)).toBe(true);
    }
    expect(isBuiltinEntryTemplate('eigene-vorlage')).toBe(false);
  });

  it('eine mit `makeEntryTemplate` gebaute Vorlage ist von einer mitgelieferten nicht unterscheidbar', () => {
    // Die Zusage aus ADR-v9-69 Punkt 4: KEIN eigener Codepfad für die Festvorlagen.
    const heirat = BUILTIN_ENTRY_TEMPLATES[0];
    const nachgebaut = makeEntryTemplate(heirat.id, { label: heirat.label, slots: heirat.slots });
    expect(nachgebaut).toEqual(heirat);
  });

  it('jede mitgelieferte Vorlage erhebt das Geschlecht — gefragt ODER aus der Rolle', () => {
    // Nutzer-Befund: im Taufe-Template fehlte es ganz, jede so erfasste Person bekam
    // `sex: 'U'`. Bei der Heirat legt die ROLLE es fest (vorbelegt), sonst wird gefragt —
    // beides ist zulässig, nur gar nicht erheben ist es nicht.
    for (const tpl of BUILTIN_ENTRY_TEMPLATES) {
      const sexSlots = tpl.slots.filter((s) => s.field === 'sex');
      expect(sexSlots.length, tpl.id).toBeGreaterThan(0);
      for (const s of sexSlots) {
        const gefragt = s.prefill === undefined;
        const ausDerRolle = s.prefill === 'M' || s.prefill === 'F';
        expect(gefragt || ausDerRolle, `${tpl.id}: ${s.role}`).toBe(true);
      }
    }
  });

  it('die Feldauswahl folgt dem v8-Orakel (QT_BASE_PATTERNS), nicht seiner Form', () => {
    const taufe = BUILTIN_ENTRY_TEMPLATES.find((t) => t.id === 'taufe')!;
    // Orakel: Taufdatum + Nachname + Vorname (die Seite ist die Zitation, kein Feld).
    expect(taufe.slots.map(slotKey)).toContain('main.CHR.date');
    expect(taufe.slots.map(slotKey)).toContain('main.surname');
    expect(taufe.slots.map(slotKey)).toContain('main.given');
    // v8s zweiter Rollenraum (h/w/p in den Festvorlagen) existiert nicht mehr: jede Rolle
    // jeder mitgelieferten Vorlage stammt aus DEM einen Katalog. (Dass `h`/`w`/`p` gar
    // nicht mehr formulierbar sind, sagt der Compiler — hier steht die Datenprobe.)
    const rollen = [...new Set(alleSlots().map(({ slot }) => slot.role as string))];
    expect(rollen.length).toBeGreaterThan(0);
    const katalog = [...ENTRY_PERSON_ROLES, ...ENTRY_FAMILY_ROLES] as readonly string[];
    for (const r of rollen) expect(katalog).toContain(r);
  });
});

describe('Quellen-Vorbelegung: Fingerabdruck statt nackter Id (ADR-v9-264 E7)', () => {
  const quelle = makeSource('@S1@', { abbr: 'KB Heiraten', title: 'Kirchenbuch Heiraten, Ochtrup' });
  const vorbelegung = {
    sourceId: '@S1@',
    abbr: 'KB Heiraten',
    title: 'Kirchenbuch Heiraten, Ochtrup',
    quay: 3 as const,
    pagePattern: 'Nr. […]',
    urlPattern: '',
    pageCarry: false,
    urlCarry: false,
  };

  it('passt der Fingerabdruck, gilt die Vorbelegung', () => {
    expect(resolveEntrySourcePrefill(vorbelegung, quelle)).toBe(quelle);
  });

  it('trägt die Id im fremden Bestand eine ANDERE Quelle, ist die Vorbelegung wirkungslos', () => {
    const fremd = makeSource('@S1@', { abbr: 'StA Geburten', title: 'Geburtenregister' });
    expect(resolveEntrySourcePrefill(vorbelegung, fremd)).toBeNull();
  });

  it('fehlt die Id im Bestand ganz, ist die Vorbelegung wirkungslos', () => {
    expect(resolveEntrySourcePrefill(vorbelegung, undefined)).toBeNull();
  });

  it('ohne Fingerabdruck (Altbestand/Handarbeit) bleibt sie unprüfbar und gilt', () => {
    const ohne = { ...vorbelegung, abbr: '', title: '' };
    expect(resolveEntrySourcePrefill(ohne, quelle)).toBe(quelle);
  });

  it('der Titel entscheidet nur, wenn BEIDE Seiten ihn kennen', () => {
    const ohneTitel = makeSource('@S1@', { abbr: 'KB Heiraten', title: '' });
    expect(resolveEntrySourcePrefill(vorbelegung, ohneTitel)).toBe(ohneTitel);
    const andererTitel = makeSource('@S1@', { abbr: 'KB Heiraten', title: 'Kirchenbuch Taufen' });
    expect(resolveEntrySourcePrefill(vorbelegung, andererTitel)).toBeNull();
  });
});

describe('Gespeicherte Vorlagen kommen als `unknown` an (BL-239-Muster)', () => {
  it('hebt eine von Hand bearbeitete Vorlage auf die aktuelle Form', () => {
    const roh = {
      id: 'eigene',
      label: 'Eigene',
      slots: [
        { role: 'main', field: 'given' },
        { role: 'main', field: 'date', event: 'BIRT', prefill: 'x', prefillMode: 'hidden' },
        { role: 'main', field: 'kaputt' }, // kein Modell-Feldname → fällt raus
        { role: 'phantom', field: 'given' }, // keine bekannte Rolle → fällt raus
        { role: 'spouseFamily', field: 'given' }, // Identität an Familien-Rolle → fällt raus
        'unfug',
      ],
    };
    const tpl = normalizeEntryTemplate(roh);
    expect(tpl.slots.map(slotKey)).toEqual(['main.given', 'main.BIRT.date']);
    expect(tpl.slots[1].prefillMode).toBe('hidden');
  });

  it('ein völlig fremdes Objekt ergibt eine leere, aber gültige Vorlage', () => {
    const tpl = normalizeEntryTemplate({ nichts: true });
    expect(tpl.id).toBe('');
    expect(tpl.slots).toEqual([]);
    expect(tpl.source).toBeUndefined();
  });

  // ADR-v9-271: `carry` ist eine ZWEITE Achse, unabhängig von der Vorbelegung — ein Feld
  // OHNE Vorbelegung kann mitlaufen (der Nachname im Hofregister), und an einem nicht
  // änderbaren Feld fällt das Flag weg, statt einen ungültigen Zustand zu erzeugen.
  it('liest `carry` unabhängig von der Vorbelegung — und wirft es an gesperrten/versteckten Feldern weg', () => {
    const tpl = normalizeEntryTemplate({
      id: 'hof',
      label: 'Hofregister',
      slots: [
        { role: 'main', field: 'surname', carry: true },
        { role: 'main', field: 'given', prefill: 'A', prefillMode: 'prefilled', carry: true },
        { role: 'main', field: 'place', event: 'CHR', prefill: 'B', prefillMode: 'locked', carry: true },
        { role: 'main', field: 'sex', prefill: 'C', prefillMode: 'hidden', carry: true },
      ],
    });
    expect(tpl.slots.map((s) => s.carry)).toEqual([true, true, undefined, undefined]);
    // Die Vorbelegungen selbst bleiben davon unberührt.
    expect(tpl.slots.map((s) => s.prefillMode)).toEqual([undefined, 'prefilled', 'locked', 'hidden']);
  });

  it('ohne `carry` in der Datei läuft nichts mit — eine ältere Vorlage verhält sich unverändert', () => {
    const tpl = normalizeEntryTemplate({
      id: 'alt',
      label: 'Alt',
      slots: [{ role: 'main', field: 'given' }],
      source: { sourceId: '@S1@', abbr: 'KB', title: '', quay: null, pagePattern: '', urlPattern: '' },
    });
    expect(tpl.slots[0].carry).toBeUndefined();
    expect(tpl.source?.pageCarry).toBe(false);
    expect(tpl.source?.urlCarry).toBe(false);
  });
});
