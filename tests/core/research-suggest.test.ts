// tests/core/research-suggest.test.ts — Forschungsschritt-Vorschlag (Spec 20 §3
// „Konfiguration", ADR-v9-165, BL-228).
//
// `suggestResearchStep` ist eine REINE Funktion: sie legt nichts an, sie belegt vor.
// Geprüft wird deshalb genau zweierlei — die Gattung (aus dem Vokabular der
// Quellen-Vorlagen, NICHT einer zweiten Liste) und der Quellenbezug, der nur bei
// Eindeutigkeit gesetzt wird.
import { describe, expect, it } from 'vitest';
import { suggestResearchStep } from '../../core/research/index';
import { SOURCE_TEMPLATES, makeDatabase, makePerson, makeFamily, makeSource } from '../../core/model';
import type { Database } from '../../core/model/types';

const STA = 1876; // dieselbe Schwelle wie BIRTH_AFTER_STAERA (config.ts `staStAera`)

function dbMit(): Database {
  return makeDatabase();
}

function person(db: Database, id: string, patch: { birth?: string; death?: string; birthPlace?: string }) {
  const p = makePerson(id);
  if (patch.birth) p.birth.date = patch.birth;
  if (patch.death) p.death.date = patch.death;
  if (patch.birthPlace) p.birth.place = patch.birthPlace;
  db.individuals.set(id, p);
  return p;
}

function quelle(db: Database, id: string, title: string) {
  const s = makeSource(id);
  s.title = title;
  db.sources.set(id, s);
  return s;
}

const label = (key: string) => SOURCE_TEMPLATES.find((t) => t.key === key)!.label;

describe('suggestResearchStep — Gattung folgt der Ära', () => {
  it('Geburt VOR der Standesamts-Ära → Kirchenbuch Taufen', () => {
    const db = dbMit();
    person(db, 'I1', { birth: '1820' });
    const s = suggestResearchStep(
      { rule: 'NO_SOURCES_AT_ALL', category: 'kirchenbuch', personId: 'I1', familyId: null },
      { db, staStAera: STA },
    );
    expect(s.category).toBe(label('kb-taufen'));
  });

  it('Geburt NACH der Standesamts-Ära → Standesamt Geburt', () => {
    const db = dbMit();
    person(db, 'I1', { birth: '1890' });
    const s = suggestResearchStep(
      { rule: 'BIRTH_AFTER_STAERA', category: 'urkunde', personId: 'I1', familyId: null },
      { db, staStAera: STA },
    );
    expect(s.category).toBe(label('standesamt-geburt'));
  });

  it('das Grenzjahr selbst zählt bereits zur Standesamts-Ära (>=, wie die Regel)', () => {
    const db = dbMit();
    person(db, 'I1', { birth: String(STA) });
    const s = suggestResearchStep(
      { rule: 'NO_SOURCES_AT_ALL', category: 'kirchenbuch', personId: 'I1', familyId: null },
      { db, staStAera: STA },
    );
    expect(s.category).toBe(label('standesamt-geburt'));
  });

  it('die Schwelle kommt aus dem Kontext, nicht aus einer eigenen Jahreszahl', () => {
    const db = dbMit();
    person(db, 'I1', { birth: '1890' });
    const arg = { rule: 'NO_SOURCES_AT_ALL', category: 'kirchenbuch', personId: 'I1', familyId: null };
    // Verschiebt der Nutzer die Schwelle hinter 1890, muss der Vorschlag mitgehen.
    expect(suggestResearchStep(arg, { db, staStAera: 1900 }).category).toBe(label('kb-taufen'));
  });

  it('Sterbe-Befund → Beerdigungen bzw. Sterbefall, je nach Ära', () => {
    const db = dbMit();
    person(db, 'I1', { birth: '1800', death: '1850' });
    person(db, 'I2', { birth: '1860', death: '1930' });
    const vor = suggestResearchStep(
      { rule: 'MISSING_DEATHPLACE', category: 'kirchenbuch', personId: 'I1', familyId: null },
      { db, staStAera: STA },
    );
    const nach = suggestResearchStep(
      { rule: 'MISSING_DEATHPLACE', category: 'kirchenbuch', personId: 'I2', familyId: null },
      { db, staStAera: STA },
    );
    expect(vor.category).toBe(label('kb-beerdigungen'));
    expect(nach.category).toBe(label('standesamt-sterbefall'));
  });

  it('Heirats-Befund an einer Familie → Heirats-Gattung nach dem Heiratsjahr', () => {
    const db = dbMit();
    const f = makeFamily('F1');
    f.marriage.date = '1901';
    db.families.set('F1', f);
    const s = suggestResearchStep(
      { rule: 'MISSING_MARRDATE', category: 'kirchenbuch', personId: 'I1', familyId: 'F1' },
      { db, staStAera: STA },
    );
    expect(s.category).toBe(label('standesamt-heirat'));
  });

  it('unbekanntes Jahr → Kirchenbuch, nicht Standesamt', () => {
    // Das Kirchenbuch deckt beide Epochen ab; ein Standesamtsregister, das es im
    // fraglichen Jahr nie gab, wäre ein Vorschlag ins Leere.
    const db = dbMit();
    person(db, 'I1', {});
    const s = suggestResearchStep(
      { rule: 'NO_SOURCES_AT_ALL', category: 'kirchenbuch', personId: 'I1', familyId: null },
      { db, staStAera: STA },
    );
    expect(s.category).toBe(label('kb-taufen'));
  });

  it('gibt immer ein Label aus dem Vorlagen-Vokabular zurück, nie den Regel-Slug', () => {
    const db = dbMit();
    person(db, 'I1', { birth: '1820' });
    const labels = SOURCE_TEMPLATES.map((t) => t.label);
    for (const rule of ['ORPHAN_CITATION', 'MISSING_SEX', 'MOTHER_TOO_YOUNG', 'ISOLATED_PERSON']) {
      const s = suggestResearchStep(
        { rule, category: 'online', personId: 'I1', familyId: null },
        { db, staStAera: STA },
      );
      expect(labels).toContain(s.category);
    }
  });
});

describe('suggestResearchStep — Quellenbezug nur bei Eindeutigkeit', () => {
  it('belegt sourceRef vor, wenn genau EINE Quelle der Gattung am Ort passt', () => {
    const db = dbMit();
    person(db, 'I1', { birth: '1820', birthPlace: 'Ochtrup' });
    quelle(db, '@S1@', 'Kirchenbuch Taufen, Ochtrup, 1800-1850');
    quelle(db, '@S2@', 'Kirchenbuch Taufen, Vreden, 1800-1850');
    const s = suggestResearchStep(
      { rule: 'NO_SOURCES_AT_ALL', category: 'kirchenbuch', personId: 'I1', familyId: null },
      { db, staStAera: STA },
    );
    expect(s.sourceRef).toBe('@S1@');
  });

  it('lässt sourceRef leer, wenn mehrere Quellen der Gattung am Ort in Frage kommen', () => {
    const db = dbMit();
    person(db, 'I1', { birth: '1820', birthPlace: 'Ochtrup' });
    quelle(db, '@S1@', 'Kirchenbuch Taufen, Ochtrup, 1800-1825');
    quelle(db, '@S2@', 'Kirchenbuch Taufen, Ochtrup, 1826-1850');
    const s = suggestResearchStep(
      { rule: 'NO_SOURCES_AT_ALL', category: 'kirchenbuch', personId: 'I1', familyId: null },
      { db, staStAera: STA },
    );
    expect(s.sourceRef).toBe('');
  });

  it('lässt sourceRef leer, wenn gar keine Quelle der Gattung existiert', () => {
    const db = dbMit();
    person(db, 'I1', { birth: '1820', birthPlace: 'Ochtrup' });
    quelle(db, '@S1@', 'Grabstein Familie Albers');
    const s = suggestResearchStep(
      { rule: 'NO_SOURCES_AT_ALL', category: 'kirchenbuch', personId: 'I1', familyId: null },
      { db, staStAera: STA },
    );
    expect(s.sourceRef).toBe('');
  });

  it('ohne bekannten Ort genügt eine eindeutige Gattungs-Quelle', () => {
    const db = dbMit();
    person(db, 'I1', { birth: '1820' });
    quelle(db, '@S1@', 'Kirchenbuch Taufen, Ochtrup');
    const s = suggestResearchStep(
      { rule: 'NO_SOURCES_AT_ALL', category: 'kirchenbuch', personId: 'I1', familyId: null },
      { db, staStAera: STA },
    );
    expect(s.sourceRef).toBe('@S1@');
  });

  it('eine Gattungs-Quelle am FALSCHEN Ort wird nicht vorgeschlagen', () => {
    const db = dbMit();
    person(db, 'I1', { birth: '1820', birthPlace: 'Ochtrup' });
    quelle(db, '@S1@', 'Kirchenbuch Taufen, Vreden');
    const s = suggestResearchStep(
      { rule: 'NO_SOURCES_AT_ALL', category: 'kirchenbuch', personId: 'I1', familyId: null },
      { db, staStAera: STA },
    );
    expect(s.sourceRef).toBe('');
  });

  it('trennt die Gattungen: eine Taufen-Quelle ist kein Vorschlag für einen Sterbe-Befund', () => {
    const db = dbMit();
    person(db, 'I1', { birth: '1800', death: '1850', birthPlace: 'Ochtrup' });
    quelle(db, '@S1@', 'Kirchenbuch Taufen, Ochtrup');
    const s = suggestResearchStep(
      { rule: 'MISSING_DEATHPLACE', category: 'kirchenbuch', personId: 'I1', familyId: null },
      { db, staStAera: STA },
    );
    expect(s.category).toBe(label('kb-beerdigungen'));
    expect(s.sourceRef).toBe('');
  });

  it('ein Befund ohne Trägerperson liefert eine Gattung, aber keinen Quellenbezug', () => {
    const db = dbMit();
    const s = suggestResearchStep(
      { rule: 'GEO_BBOX', category: 'online', personId: null, familyId: null },
      { db, staStAera: STA },
    );
    expect(s.category).toBe(label('kb-taufen'));
    expect(s.sourceRef).toBe('');
  });
});
