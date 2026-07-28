// tests/core/model/media-commands.test.ts — BL-126: Medien-Kommandos (Spec 10 §4,
// Spec 20 §1.4 [S]). `saveMedia` spiegelt `saveSource` (flaches Whole-Object-Upsert);
// `deleteMedia` ist BEWUSST MIT Kaskade (anders als `deleteSource`) — 0 Waisen an JEDER
// Owner-Stelle (Person Top-Level/Events/Zitate, Familie Events/Zitate, Source Top-Level).
// `withAddedMediaCitation`/`withRemovedMediaCitation`/`withUpdatedMediaCitation` sind das
// generische Verknüpfen/Lösen/Editieren-Trio, das Person/Event/Citation/Source teilen.
import { describe, it, expect } from 'vitest';
import {
  saveMedia,
  deleteMedia,
  withAddedMediaCitation,
  withRemovedMediaCitation,
  withUpdatedMediaCitation,
} from '../../../core/model/commands';
import {
  makeMedia,
  makeMediaCitation,
  makePerson,
  makeFamily,
  makeSource,
  makeDatabase,
  makeCitation,
  makeEvent,
} from '../../../core/model/index';
import type { Database, MediaId } from '../../../core/model/types';

describe('saveMedia — Upsert per id (flaches Modell, analog saveSource)', () => {
  it('legt ein neues Medium an', () => {
    const media = saveMedia(new Map(), makeMedia('fotos/anna.jpg', { title: 'Anna' }));
    expect(media.get('fotos/anna.jpg')?.title).toBe('Anna');
    expect(media.size).toBe(1);
  });

  it('ersetzt ein bestehendes Medium vollständig (per id)', () => {
    let media = saveMedia(new Map(), makeMedia('fotos/anna.jpg', { title: 'Alt' }));
    media = saveMedia(media, makeMedia('fotos/anna.jpg', { title: 'Neu' }));
    expect(media.size).toBe(1);
    expect(media.get('fotos/anna.jpg')?.title).toBe('Neu');
  });

  it('rührt andere Medien nicht an', () => {
    let media = saveMedia(new Map(), makeMedia('a.jpg'));
    media = saveMedia(media, makeMedia('b.jpg'));
    expect(media.size).toBe(2);
  });
});

describe('withAddedMediaCitation / withRemovedMediaCitation / withUpdatedMediaCitation', () => {
  it('hängt eine Medienverknüpfung an eine Person an', () => {
    const p = makePerson('@I1@');
    const next = withAddedMediaCitation(p, makeMediaCitation('m1'));
    expect(next.media).toHaveLength(1);
    expect(next.media[0].mediaId).toBe('m1');
    // Reine Funktion — Original unangetastet.
    expect(p.media).toHaveLength(0);
  });

  it('entfernt eine Medienverknüpfung wieder (No-Op bei unbekannter id)', () => {
    const p = withAddedMediaCitation(makePerson('@I1@'), makeMediaCitation('m1'));
    const removed = withRemovedMediaCitation(p, 'm1');
    expect(removed.media).toHaveLength(0);

    const noop = withRemovedMediaCitation(p, 'unbekannt');
    expect(noop.media).toHaveLength(1);
  });

  it('editiert NUR die referenz-spezifischen Felder (Titel-Override/Datum/Notiz/Primär-Flag)', () => {
    const s = makeSource('@S1@');
    const withMedia = withAddedMediaCitation(s, makeMediaCitation('m1', { title: 'Alt' }));
    const updated = withUpdatedMediaCitation(withMedia, 'm1', { title: 'Override', primary: true, note: 'Notiz' });
    expect(updated.media[0]).toMatchObject({ mediaId: 'm1', title: 'Override', primary: true, note: 'Notiz' });
  });

  it('funktioniert identisch auf Event UND Citation (dieselbe Form {media})', () => {
    const ev = makeEvent('BIRT');
    const withMedia = withAddedMediaCitation(ev, makeMediaCitation('m1'));
    expect(withMedia.media).toHaveLength(1);

    const cit = makeCitation('@S1@');
    const citWithMedia = withAddedMediaCitation(cit, makeMediaCitation('m2'));
    expect(citWithMedia.media).toHaveLength(1);
  });

  it('Familie hat kein eigenes .media — der Aufrufer wendet die Funktion auf ein Event an (z. B. marriage)', () => {
    const f = makeFamily('@F1@');
    const marriage = withAddedMediaCitation(f.marriage, makeMediaCitation('m1'));
    const next = { ...f, marriage };
    expect(next.marriage.media).toHaveLength(1);
    // f selbst hat kein media-Feld im Typ — nur über das Event erreichbar.
  });
});

describe('deleteMedia — referenz-auflösendes Löschen (0 Waisen, BEWUSST mit Kaskade)', () => {
  const MID: MediaId = 'fotos/gemeinsam.jpg';

  function seedDb(): Database {
    const db = makeDatabase();
    db.media.set(MID, makeMedia(MID, { title: 'Gemeinsames Foto' }));
    return db;
  }

  it('entfernt das Medium aus db.media', () => {
    const db = seedDb();
    const next = deleteMedia(db, MID);
    expect(next.media.has(MID)).toBe(false);
  });

  it('No-Op bei unbekannter id (kein Wurf, Datenbank bleibt inhaltlich unverändert)', () => {
    const db = seedDb();
    const next = deleteMedia(db, 'unbekannt');
    expect(next.media.get(MID)).toBeDefined();
  });

  it('löst eine Person-Top-Level-Referenz auf', () => {
    const db = seedDb();
    const p = makePerson('@I1@');
    p.media = [makeMediaCitation(MID)];
    db.individuals.set(p.id, p);

    const next = deleteMedia(db, MID);
    expect(next.individuals.get('@I1@')!.media).toHaveLength(0);
  });

  it('löst eine Referenz an einem Sonder-Ereignis (birth) UND dessen Zitat auf', () => {
    const db = seedDb();
    const p = makePerson('@I1@');
    p.birth.media = [makeMediaCitation(MID)];
    p.birth.citations = [makeCitation('@S1@', { media: [makeMediaCitation(MID)] })];
    db.individuals.set(p.id, p);

    const next = deleteMedia(db, MID);
    const birth = next.individuals.get('@I1@')!.birth;
    expect(birth.media).toHaveLength(0);
    expect(birth.citations[0].media).toHaveLength(0);
  });

  it('löst eine Referenz an einem generischen events[]-Eintrag auf', () => {
    const db = seedDb();
    const p = makePerson('@I1@');
    const ev = makeEvent('OCCU');
    ev.media = [makeMediaCitation(MID)];
    p.events = [ev];
    db.individuals.set(p.id, p);

    const next = deleteMedia(db, MID);
    expect(next.individuals.get('@I1@')!.events[0].media).toHaveLength(0);
  });

  it('löst eine Referenz an topLevelCitations/nameCitations/childOf/associations auf', () => {
    const db = seedDb();
    const p = makePerson('@I1@');
    p.topLevelCitations = [makeCitation('@S1@', { media: [makeMediaCitation(MID)] })];
    p.nameCitations = [makeCitation('@S1@', { media: [makeMediaCitation(MID)] })];
    p.childOf = [
      {
        familyId: '@F1@',
        pedigree: '',
        fatherRel: '',
        motherRel: '',
        fatherRelSeen: false,
        motherRelSeen: false,
        citations: [makeCitation('@S1@', { media: [makeMediaCitation(MID)] })],
      },
    ];
    p.associations = [
      {
        personRef: '@I2@',
        grampsHandle: null,
        role: '',
        note: '',
        citations: [makeCitation('@S1@', { media: [makeMediaCitation(MID)] })],
      },
    ];
    db.individuals.set(p.id, p);

    const next = deleteMedia(db, MID);
    const np = next.individuals.get('@I1@')!;
    expect(np.topLevelCitations[0].media).toHaveLength(0);
    expect(np.nameCitations[0].media).toHaveLength(0);
    expect(np.childOf[0].citations[0].media).toHaveLength(0);
    expect(np.associations[0].citations[0].media).toHaveLength(0);
  });

  it('löst eine Referenz an Familien-Ereignissen (marriage/engagement/events[]) UND deren Zitaten auf — Familie hat kein eigenes .media', () => {
    const db = seedDb();
    const f = makeFamily('@F1@');
    f.marriage.media = [makeMediaCitation(MID)];
    f.engagement.citations = [makeCitation('@S1@', { media: [makeMediaCitation(MID)] })];
    const ev = makeEvent('EVEN');
    ev.media = [makeMediaCitation(MID)];
    f.events = [ev];
    f.citations = [makeCitation('@S1@', { media: [makeMediaCitation(MID)] })];
    db.families.set(f.id, f);

    const next = deleteMedia(db, MID);
    const nf = next.families.get('@F1@')!;
    expect(nf.marriage.media).toHaveLength(0);
    expect(nf.engagement.citations[0].media).toHaveLength(0);
    expect(nf.events[0].media).toHaveLength(0);
    expect(nf.citations[0].media).toHaveLength(0);
  });

  it('löst eine Source-Top-Level-Referenz auf', () => {
    const db = seedDb();
    const s = makeSource('@S1@');
    s.media = [makeMediaCitation(MID)];
    db.sources.set(s.id, s);

    const next = deleteMedia(db, MID);
    expect(next.sources.get('@S1@')!.media).toHaveLength(0);
  });

  it('rührt UNBETEILIGTE Personen/Familien/Quellen nicht an (Copy-on-Write, referenzgleich)', () => {
    const db = seedDb();
    const untouchedPerson = makePerson('@I2@');
    db.individuals.set(untouchedPerson.id, untouchedPerson);
    const touchedPerson = makePerson('@I1@');
    touchedPerson.media = [makeMediaCitation(MID)];
    db.individuals.set(touchedPerson.id, touchedPerson);

    const next = deleteMedia(db, MID);
    expect(next.individuals.get('@I2@')).toBe(untouchedPerson);
    expect(next.individuals.get('@I1@')).not.toBe(touchedPerson);
  });

  it('0 Waisen über ALLE Owner-Stellen gleichzeitig (Integrations-Fall)', () => {
    const db = seedDb();
    const p = makePerson('@I1@');
    p.media = [makeMediaCitation(MID)];
    p.death.media = [makeMediaCitation(MID)];
    db.individuals.set(p.id, p);

    const f = makeFamily('@F1@');
    f.marriage.media = [makeMediaCitation(MID)];
    db.families.set(f.id, f);

    const s = makeSource('@S1@');
    s.media = [makeMediaCitation(MID)];
    db.sources.set(s.id, s);

    const next = deleteMedia(db, MID);
    expect(next.media.has(MID)).toBe(false);
    expect(next.individuals.get('@I1@')!.media).toHaveLength(0);
    expect(next.individuals.get('@I1@')!.death.media).toHaveLength(0);
    expect(next.families.get('@F1@')!.marriage.media).toHaveLength(0);
    expect(next.sources.get('@S1@')!.media).toHaveLength(0);
  });
});
