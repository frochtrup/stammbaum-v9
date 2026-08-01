// tests/ui/entity-media.test.ts — BL-260/BL-261: EINE Bild-Auswahl für Steckbrief,
// Ereigniszeile und Ausgaben. Reine Projektion, kein DOM (TST-5).
//
// Warum das eine eigene Datei wert ist: vor BL-260 traf `collectStoryMedia` diese Wahl
// allein — MIT eingebautem `data:`-Filter. Am Realbestand (0 `data:`-URIs) lieferte sie
// deshalb nie ein Bild, und niemand merkte es, weil die Auswahl nur einen Konsumenten
// hatte. Jetzt hat sie drei, und die Auswahl ist von der Auflösung getrennt.
import { describe, it, expect } from 'vitest';
import { personImages, personPortrait, eventImages } from '../../ui/shell/entity-media';
import { collectStoryMedia, storyMediaFiles, buildPersonStory } from '../../ui/views/story/story-model';
import { makePlaceRegistry, makeHofRegistry, type PlaceContext } from '../../core/places';
import { makeDatabase, makeEvent, makeMedia, makeMediaCitation, makePerson } from '../../core/model';
import type { Database } from '../../core/model/types';

/** Der Story-Builder braucht einen PlaceContext; für die Foto-Frage ist er belanglos. */
const CTX: PlaceContext = { places: makePlaceRegistry(new Map()), hofs: makeHofRegistry(new Map()) };

function seeded(): Database {
  const db = makeDatabase();
  db.media.set('Pictures/anna.jpg', makeMedia('Pictures/anna.jpg', { title: 'Anna 1904' }));
  db.media.set('Pictures/anna2.bmp', makeMedia('Pictures/anna2.bmp'));
  db.media.set('Documents/urkunde.pdf', makeMedia('Documents/urkunde.pdf', { form: 'application/pdf' }));
  db.media.set('https://a.de/x', makeMedia('https://a.de/x'));
  db.media.set('data:image/png;base64,AA', makeMedia('data:image/png;base64,AA'));
  return db;
}

describe('personImages — was zur Person gehört', () => {
  it('liefert nur BILDER, keine Dokumente', () => {
    const db = seeded();
    const p = makePerson('@I1@');
    p.media.push(makeMediaCitation('Pictures/anna.jpg'), makeMediaCitation('Documents/urkunde.pdf'));
    db.individuals.set('@I1@', p);
    expect(personImages(db, '@I1@').map((i) => i.file)).toEqual(['Pictures/anna.jpg']);
  });

  it('nimmt Pfad-Bilder MIT — sie sind Bilder, sie brauchen nur den Ordner', () => {
    // Genau hier lag die alte Grenze: `collectStoryMedia` warf sie weg. Am Realbestand
    // sind 76 der 85 Personen-Medien Dateipfade — ohne sie bliebe fast alles unsichtbar.
    const db = seeded();
    const p = makePerson('@I1@');
    p.media.push(makeMediaCitation('Pictures/anna.jpg'));
    db.individuals.set('@I1@', p);
    expect(personImages(db, '@I1@')).toHaveLength(1);
  });

  it('nimmt eingebettete Bilder ebenso mit', () => {
    const db = seeded();
    const p = makePerson('@I1@');
    p.media.push(makeMediaCitation('data:image/png;base64,AA'));
    db.individuals.set('@I1@', p);
    expect(personImages(db, '@I1@')).toHaveLength(1);
  });

  it('lässt Weblinks aus — sie werden verlinkt, nie geladen (LP-2)', () => {
    const db = seeded();
    const p = makePerson('@I1@');
    p.media.push(makeMediaCitation('https://a.de/x'));
    db.individuals.set('@I1@', p);
    expect(personImages(db, '@I1@')).toEqual([]);
  });

  it('ignoriert Verweise auf gelöschte Medien', () => {
    const db = seeded();
    const p = makePerson('@I1@');
    p.media.push(makeMediaCitation('gibtsnicht.jpg'));
    db.individuals.set('@I1@', p);
    expect(personImages(db, '@I1@')).toEqual([]);
  });
});

describe('personPortrait — welches Bild die Person vertritt', () => {
  it('das als `primary` markierte führt, unabhängig von der Reihenfolge', () => {
    const db = seeded();
    const p = makePerson('@I1@');
    p.media.push(
      makeMediaCitation('Pictures/anna.jpg'),
      makeMediaCitation('Pictures/anna2.bmp', { primary: true }),
    );
    db.individuals.set('@I1@', p);
    expect(personPortrait(db, '@I1@')?.file).toBe('Pictures/anna2.bmp');
  });

  it('ohne `primary` gilt das erste — die Reihenfolge im Bestand bleibt', () => {
    const db = seeded();
    const p = makePerson('@I1@');
    p.media.push(makeMediaCitation('Pictures/anna.jpg'), makeMediaCitation('Pictures/anna2.bmp'));
    db.individuals.set('@I1@', p);
    expect(personPortrait(db, '@I1@')?.file).toBe('Pictures/anna.jpg');
  });

  it('nimmt den Referenz-Titel vor dem globalen', () => {
    const db = seeded();
    const p = makePerson('@I1@');
    p.media.push(makeMediaCitation('Pictures/anna.jpg', { title: 'Am Hochzeitstag' }));
    db.individuals.set('@I1@', p);
    expect(personPortrait(db, '@I1@')?.title).toBe('Am Hochzeitstag');
  });

  it('fällt auf den globalen Titel zurück', () => {
    const db = seeded();
    const p = makePerson('@I1@');
    p.media.push(makeMediaCitation('Pictures/anna.jpg'));
    db.individuals.set('@I1@', p);
    expect(personPortrait(db, '@I1@')?.title).toBe('Anna 1904');
  });

  it('null, wenn die Person kein Bild hat oder gar nicht existiert', () => {
    const db = seeded();
    db.individuals.set('@I2@', makePerson('@I2@'));
    expect(personPortrait(db, '@I2@')).toBeNull();
    expect(personPortrait(db, '@I404@')).toBeNull();
  });
});

describe('eventImages — Bilder AM Ereignis', () => {
  it('liest die Medien des Ereignisses, nicht die der Person', () => {
    const db = seeded();
    const ev = makeEvent('RESI');
    ev.media.push(makeMediaCitation('Pictures/anna.jpg'));
    expect(eventImages(db, ev).map((i) => i.file)).toEqual(['Pictures/anna.jpg']);
  });

  it('kommt mit einem fehlenden Ereignis zurecht', () => {
    expect(eventImages(seeded(), null)).toEqual([]);
    expect(eventImages(seeded(), makeEvent('BIRT'))).toEqual([]);
  });
});

// --- BL-261: der Vorlauf ----------------------------------------------------

describe('collectStoryMedia — Auswahl getrennt von Auflösung', () => {
  function personWith(files: string[]): Database {
    const db = seeded();
    const p = makePerson('@I1@');
    for (const f of files) p.media.push(makeMediaCitation(f));
    db.individuals.set('@I1@', p);
    return db;
  }

  it('OHNE Vorlauf bleibt nur das Eingebettete — der Zustand, der am Realbestand 0 Fotos lieferte', () => {
    const db = personWith(['Pictures/anna.jpg', 'data:image/png;base64,AA']);
    expect(collectStoryMedia(db, '@I1@').map((p) => p.src)).toEqual(['data:image/png;base64,AA']);
  });

  it('MIT Vorlauf kommt das Pfad-Bild dazu — als eingebetteter data:-URI', () => {
    const db = personWith(['Pictures/anna.jpg']);
    const embed = new Map([['Pictures/anna.jpg', 'data:image/jpeg;base64,ZZZ']]);
    expect(collectStoryMedia(db, '@I1@', embed)).toEqual([
      { src: 'data:image/jpeg;base64,ZZZ', title: 'Anna 1904' },
    ]);
  });

  it('lässt ein Bild weg, das der Vorlauf nicht auflösen konnte — kein toter Verweis in der Ausgabe', () => {
    const db = personWith(['Pictures/anna.jpg', 'Pictures/anna2.bmp']);
    const embed = new Map([['Pictures/anna.jpg', 'data:image/jpeg;base64,ZZZ']]);
    expect(collectStoryMedia(db, '@I1@', embed)).toHaveLength(1);
  });

  it('storyMediaFiles nennt genau die Dateien, die der Vorlauf holen muss', () => {
    const db = personWith(['Pictures/anna.jpg', 'https://a.de/x', 'Documents/urkunde.pdf']);
    // Weblinks und Dokumente gehören nicht dazu: der eine wird nie geladen (LP-2), das
    // andere ist kein Bild.
    expect(storyMediaFiles(db, ['@I1@'])).toEqual(['Pictures/anna.jpg']);
  });

  it('WÄCHTER: der Builder bleibt synchron — sonst ist er nicht mehr goldfile-testbar', () => {
    // ADR-v9-138: die §4-Builder sind reine Funktionen. Würde jemand die Auflösung IN den
    // Builder ziehen (statt in den Vorlauf), gäbe `buildPersonStory` ein Promise zurück
    // und dieser Test bräche — genau die Grenze, um die es BL-261 geht.
    const db = personWith(['Pictures/anna.jpg']);
    const doc = buildPersonStory(db, CTX, '@I1@', new Map());
    expect(doc).not.toBeInstanceOf(Promise);
    expect(Array.isArray(doc.photos)).toBe(true);
  });
});
