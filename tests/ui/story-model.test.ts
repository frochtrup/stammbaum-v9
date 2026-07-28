// tests/ui/story-model.test.ts — Personen-Biografie-Aufbau (BL-133, Spec 20 §1.10).
// Reiner Aufbau Person→StoryDoc; Orakel v8 `_renderStory`. Prüft Abschnittsstruktur +
// tragende Sätze, headless (kein DOM, kein Wall-Clock). Wächter: bleibt unskipped.
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, makeFamily, makeEvent, makeMedia, makeMediaCitation } from '../../core/model';
import { makePlaceRegistry, makeHofRegistry, type PlaceContext } from '../../core/places';
import type { ChildLink, Database } from '../../core/model/types';
import { buildPersonStory, buildFamilyStory, collectStoryMedia } from '../../ui/views/story/story-model';

function childLink(familyId: string): ChildLink {
  return { familyId, pedigree: 'birth', fatherRel: '', motherRel: '', fatherRelSeen: false, motherRelSeen: false, citations: [] };
}

const CTX: PlaceContext = { places: makePlaceRegistry(new Map()), hofs: makeHofRegistry(new Map()) };

/** Otto (I1, *1850 †1920): Eltern Hans/Anna (F1) + Bruder Fritz, Ehe mit Berta (F2), Kind Carl. */
function makeTree(): Database {
  const db = makeDatabase();
  db.individuals.set('I1', makePerson('I1', {
    given: 'Otto', surname: 'Meyer', sex: 'M',
    birth: makeEvent('BIRT', { date: '1850', place: 'Detmold, Lippe' }),
    death: makeEvent('DEAT', { date: '10 MAR 1920', place: 'Lemgo' }),
    cause: 'Altersschwäche',
    events: [
      makeEvent('OCCU', { value: 'Schmied', date: '1875' }),
      makeEvent('RESI', { place: 'Lemgo', date: '1885' }),
      makeEvent('RELI', { value: 'evangelisch' }),
    ],
    childOf: [childLink('F1')], parentIn: ['F2'],
  }));
  db.individuals.set('I2', makePerson('I2', { given: 'Hans', surname: 'Meyer', sex: 'M', parentIn: ['F1'] }));
  db.individuals.set('I3', makePerson('I3', { given: 'Anna', surname: 'Schmidt', sex: 'F', parentIn: ['F1'] }));
  db.individuals.set('I6', makePerson('I6', { given: 'Fritz', surname: 'Meyer', sex: 'M', childOf: [childLink('F1')] }));
  db.individuals.set('I4', makePerson('I4', {
    given: 'Berta', surname: 'Klein', sex: 'F',
    birth: makeEvent('BIRT', { date: '1855' }), death: makeEvent('DEAT', { date: '1921' }),
    parentIn: ['F2'],
  }));
  db.individuals.set('I5', makePerson('I5', {
    given: 'Carl', surname: 'Meyer', sex: 'M',
    birth: makeEvent('BIRT', { date: '1880' }), childOf: [childLink('F2')],
  }));
  db.families.set('F1', makeFamily('F1', { husband: 'I2', wife: 'I3', children: ['I1', 'I6'] }));
  db.families.set('F2', makeFamily('F2', {
    husband: 'I1', wife: 'I4', children: ['I5'],
    marriage: makeEvent('MARR', { date: '1878', place: 'Detmold' }),
  }));
  return db;
}

describe('buildPersonStory', () => {
  const doc = buildPersonStory(makeTree(), CTX, 'I1');
  const byId = (id: string) => doc.sections.find((s) => s.id === id);

  it('trägt Titel und Lebensspanne', () => {
    expect(doc.subject).toBe('person');
    expect(doc.title).toBe('Otto Meyer');
    expect(doc.lifespan).toBe('1850 – 10. März 1920');
  });

  it('Frühes Leben: Geburt (Jahr-only „kam zur Welt"), Eltern, Geschwister', () => {
    const intro = byId('intro');
    expect(intro?.paragraphs[0]).toContain('Otto Meyer kam 1850 in Detmold zur Welt.');
    expect(intro?.paragraphs[0]).toContain('Er war der Sohn von Hans Meyer und Anna Schmidt.');
    expect(intro?.paragraphs[0]).toContain('Er wuchs mit einem Geschwister auf.');
  });

  it('Epochen-Kontext erscheint als eigener Abschnitt', () => {
    expect(byId('epoch')?.paragraphs[0]).toContain('lebte in der Zeit');
  });

  it('Lebenslauf: Beruf und Wohnort, RELI nicht hier', () => {
    const ev = byId('events');
    expect(ev?.heading).toBe('Lebenslauf');
    expect(ev?.paragraphs).toContain('Er war Schmied (1875).');
    expect(ev?.paragraphs).toContain('Er lebte in Lemgo (1885).');
    expect(ev?.paragraphs.join(' ')).not.toContain('evangelisch');
  });

  it('Familie: Heirat mit Partner-Lebensdaten + Kind', () => {
    const fam = byId('family');
    expect(fam?.heading).toBe('Familie');
    expect(fam?.paragraphs[0]).toContain('Otto Meyer heiratete Berta Klein (*1855, †1921) (1878) in Detmold.');
    expect(fam?.paragraphs[0]).toContain('Das gemeinsame Kind war Carl Meyer (*1880).');
  });

  it('Religion als eigener Abschnitt', () => {
    expect(byId('reli')?.paragraphs[0]).toBe('Er war evangelisch.');
  });

  it('Tod mit Datum, Ort und Ursache', () => {
    expect(byId('death')?.paragraphs[0]).toBe('Otto Meyer verstarb am 10. März 1920 in Lemgo an Altersschwäche.');
  });

  it('Abschnittsreihenfolge folgt dem Orakel', () => {
    expect(doc.sections.map((s) => s.id)).toEqual(['intro', 'epoch', 'events', 'family', 'reli', 'death']);
  });

  it('unbekannte Person → Fehler', () => {
    expect(() => buildPersonStory(makeTree(), CTX, 'IX')).toThrow();
  });
});

describe('buildFamilyStory', () => {
  const doc = buildFamilyStory(makeTree(), 'F2');
  const byId = (id: string) => doc.sections.find((s) => s.id === id);

  it('Titel „Familie X & Y", Spanne und ⚭-Untertitel', () => {
    expect(doc.subject).toBe('family');
    expect(doc.title).toBe('Familie Otto Meyer & Berta Klein');
    expect(doc.subtitle).toBe('⚭ 1878, Detmold');
    expect(doc.lifespan).toBe('(1850–1921)');
  });

  it('Heirat-Abschnitt nennt beide Partner', () => {
    expect(byId('marriage')?.paragraphs[0]).toBe('Otto Meyer und Berta Klein heirateten (1878) in Detmold.');
  });

  it('Eltern-Abschnitt: je Elternteil ein Block mit Rolle', () => {
    const parents = byId('parents');
    expect(parents?.blocks?.map((b) => b.subheading)).toEqual(['Otto Meyer — Vater', 'Berta Klein — Mutter']);
    expect(parents?.blocks?.[0].paragraphs[0]).toContain('Otto Meyer kam 1850 in Detmold zur Welt.');
  });

  it('Kinder-Abschnitt zählt und listet', () => {
    const kids = byId('children');
    expect(kids?.heading).toBe('Kinder (1)');
    expect(kids?.paragraphs[0]).toContain('Carl Meyer');
    expect(kids?.paragraphs[0]).toContain('*1880');
  });

  it('Familienchronik chronologisch', () => {
    const tl = byId('timeline');
    expect(tl?.paragraphs[0]).toBe('1878 — Heirat');
    expect(tl?.paragraphs.some((p) => p.startsWith('1880 — Geburt'))).toBe(true);
  });

  it('Familien-Story hat keine Karte (Orakel)', () => {
    expect(doc.mapPoints).toEqual([]);
  });

  it('unbekannte Familie → Fehler', () => {
    expect(() => buildFamilyStory(makeTree(), 'FX')).toThrow();
  });
});

describe('collectStoryMedia (BL-189)', () => {
  it('nur data:-URI-Fotos, Primärfoto zuerst; Pfad-Medien weggelassen', () => {
    const db = makeTree();
    db.media.set('M1', makeMedia('M1', { file: 'data:image/png;base64,AAA', title: 'Zweitfoto' }));
    db.media.set('M2', makeMedia('M2', { file: 'data:image/jpeg;base64,BBB', title: 'Hauptfoto' }));
    db.media.set('M3', makeMedia('M3', { file: 'foto_pfad.jpg', title: 'Nur Pfad' }));
    const p = db.individuals.get('I1')!;
    p.media.push(makeMediaCitation('M1'));
    p.media.push(makeMediaCitation('M2', { primary: true }));
    p.media.push(makeMediaCitation('M3', { primary: false }));

    const photos = collectStoryMedia(db, 'I1');
    expect(photos.map((ph) => ph.title)).toEqual(['Hauptfoto', 'Zweitfoto']);
    expect(photos.every((ph) => ph.src.startsWith('data:image/'))).toBe(true);
  });

  it('Personen-Story trägt die Fotos', () => {
    const db = makeTree();
    db.media.set('M2', makeMedia('M2', { file: 'data:image/jpeg;base64,BBB', title: 'Hauptfoto' }));
    db.individuals.get('I1')!.media.push(makeMediaCitation('M2', { primary: true }));
    expect(buildPersonStory(db, CTX, 'I1').photos[0].title).toBe('Hauptfoto');
  });
});
