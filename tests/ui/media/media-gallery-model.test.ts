// tests/ui/media/media-gallery-model.test.ts — Spec 20 §1.4 [S] "① Kachelgalerie":
// Filter Alle/Personen/Familien/Quellen, Suche über Dateiname/Titel/Notiz. Reine
// Modell-Logik (kein DOM) — TST-5 Testpyramide.
import { describe, it, expect } from 'vitest';
import {
  buildMediaTiles,
  matchesOwnerFilter,
  matchesMediaSearch,
  buildOwnerFilterOptions,
  displayTitle,
  buildKindFilterOptions,
  initialKindFilter,
  matchesKindFilter,
  type MediaOwnerKind,
} from '../../../ui/views/media/media-gallery-model';
import {
  makeDatabase,
  makeMedia,
  makeMediaCitation,
  makePerson,
  makeFamily,
  makeSource,
  makeEvent,
} from '../../../core/model/index';
import type { Database } from '../../../core/model/types';

describe('displayTitle', () => {
  it('nutzt den globalen Titel, wenn vorhanden', () => {
    expect(displayTitle(makeMedia('fotos/anna.jpg', { title: 'Anna' }))).toBe('Anna');
  });

  it('fällt auf den Datei-Basisnamen zurück, wenn kein Titel gesetzt ist (5.5.1-Inline ohne TITL)', () => {
    expect(displayTitle(makeMedia('fotos/anna.jpg'))).toBe('anna.jpg');
    expect(displayTitle(makeMedia('scans\\urkunde.pdf'))).toBe('urkunde.pdf');
  });
});

describe('buildMediaTiles — Owner-Zuordnung über ALLE MediaCitation-Fundstellen', () => {
  function seed(): Database {
    const db = makeDatabase();
    db.media.set('a.jpg', makeMedia('a.jpg', { title: 'A' }));
    db.media.set('b.jpg', makeMedia('b.jpg', { title: 'B' }));
    db.media.set('c.jpg', makeMedia('c.jpg', { title: 'C' }));
    db.media.set('orphan.jpg', makeMedia('orphan.jpg', { title: 'Verwaist' }));

    const p = makePerson('@I1@');
    p.media = [makeMediaCitation('a.jpg')];
    const ev = makeEvent('OCCU');
    ev.media = [makeMediaCitation('b.jpg', { note: 'Beim Schmied' })];
    p.events = [ev];
    db.individuals.set(p.id, p);

    const f = makeFamily('@F1@');
    f.marriage.media = [makeMediaCitation('b.jpg')];
    db.families.set(f.id, f);

    const s = makeSource('@S1@');
    s.media = [makeMediaCitation('c.jpg')];
    db.sources.set(s.id, s);

    return db;
  }

  it('ordnet jede Kachel den referenzierenden Owner-Arten zu', () => {
    const rows = buildMediaTiles(seed());
    const a = rows.find((r) => r.id === 'a.jpg')!;
    const b = rows.find((r) => r.id === 'b.jpg')!;
    const c = rows.find((r) => r.id === 'c.jpg')!;
    const orphan = rows.find((r) => r.id === 'orphan.jpg')!;

    expect([...a.ownerKinds]).toEqual(['person']);
    expect([...b.ownerKinds].sort()).toEqual(['family', 'person']);
    expect([...c.ownerKinds]).toEqual(['source']);
    expect([...orphan.ownerKinds]).toEqual([]);
    expect(orphan.refCount).toBe(0);
  });

  it('zählt Referenzen korrekt (b.jpg: Event + Familien-Heirat = 2)', () => {
    const rows = buildMediaTiles(seed());
    expect(rows.find((r) => r.id === 'b.jpg')!.refCount).toBe(2);
  });

  it('sammelt referenz-spezifische Notizen für die Suche', () => {
    const rows = buildMediaTiles(seed());
    expect(rows.find((r) => r.id === 'b.jpg')!.notes).toContain('Beim Schmied');
  });

  it('sortiert alphabetisch nach Anzeige-Titel', () => {
    const rows = buildMediaTiles(seed());
    expect(rows.map((r) => r.title)).toEqual(['A', 'B', 'C', 'Verwaist']);
  });

  it('kaputte/verwaiste Referenz (Medium ohne jede MediaCitation) bleibt sichtbar mit refCount 0', () => {
    const rows = buildMediaTiles(seed());
    const orphan = rows.find((r) => r.id === 'orphan.jpg')!;
    expect(orphan.refCount).toBe(0);
  });

  describe('Kapazitäts-Fall (TST-7): überdurchschnittlich viele Kacheln', () => {
    it('verarbeitet 200 Medien mit dicht überlappenden Referenzen ohne Fehler/Verlust', () => {
      const db = makeDatabase();
      for (let i = 0; i < 200; i++) {
        db.media.set(`m${i}.jpg`, makeMedia(`m${i}.jpg`, { title: `Foto ${i}` }));
      }
      for (let i = 0; i < 50; i++) {
        const p = makePerson(`@I${i}@`);
        // Jede Person referenziert DREI überlappende Medien (dichte Mehrfachreferenz).
        p.media = [makeMediaCitation(`m${i}.jpg`), makeMediaCitation(`m${i + 1}.jpg`), makeMediaCitation(`m${i + 2}.jpg`)];
        db.individuals.set(p.id, p);
      }
      const rows = buildMediaTiles(db);
      expect(rows).toHaveLength(200);
      // m1.jpg wird von Person 0 UND Person 1 referenziert (überlappende Reihen).
      const m1 = rows.find((r) => r.id === 'm1.jpg')!;
      expect(m1.refCount).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('matchesOwnerFilter / buildOwnerFilterOptions', () => {
  it('"all" trifft jede Kachel; die übrigen Filter grenzen auf die Owner-Art ein', () => {
    const row = { id: 'x', title: 'X', file: 'x.jpg', form: '', type: '', ownerKinds: new Set<MediaOwnerKind>(['person']), refCount: 1, notes: '', fileKind: 'file' as const, isImage: true };
    expect(matchesOwnerFilter(row, 'all')).toBe(true);
    expect(matchesOwnerFilter(row, 'person')).toBe(true);
    expect(matchesOwnerFilter(row, 'family')).toBe(false);
    expect(matchesOwnerFilter(row, 'source')).toBe(false);
  });

  it('liefert Zähler je Filter-Option', () => {
    const rows = [
      { id: 'a', title: 'A', file: '', form: '', type: '', ownerKinds: new Set<MediaOwnerKind>(['person']), refCount: 1, notes: '', fileKind: 'empty' as const, isImage: false },
      { id: 'b', title: 'B', file: '', form: '', type: '', ownerKinds: new Set<MediaOwnerKind>(['source']), refCount: 1, notes: '', fileKind: 'empty' as const, isImage: false },
    ];
    const options = buildOwnerFilterOptions(rows);
    expect(options.find((o) => o.id === 'all')!.count).toBe(2);
    expect(options.find((o) => o.id === 'person')!.count).toBe(1);
    expect(options.find((o) => o.id === 'family')!.count).toBe(0);
    expect(options.find((o) => o.id === 'source')!.count).toBe(1);
  });
});

describe('matchesMediaSearch — Dateiname/Titel/Notiz (Spec 20 §1.4 [S])', () => {
  const row = {
    id: 'fotos/anna.jpg',
    title: 'Portrait Anna',
    file: 'fotos/anna.jpg',
    form: 'jpg',
    type: '',
    ownerKinds: new Set<MediaOwnerKind>(),
    refCount: 1,
    notes: 'Aufnahme im Garten',
    fileKind: 'file' as const,
    isImage: true,
  };

  it('leere Suche trifft immer', () => {
    expect(matchesMediaSearch(row, '')).toBe(true);
  });

  it('trifft über den Titel', () => {
    expect(matchesMediaSearch(row, 'Portrait')).toBe(true);
  });

  it('trifft über den Dateinamen', () => {
    expect(matchesMediaSearch(row, 'anna.jpg')).toBe(true);
  });

  it('trifft über die Notiz', () => {
    expect(matchesMediaSearch(row, 'Garten')).toBe(true);
  });

  it('trifft nicht bei fehlender Übereinstimmung', () => {
    expect(matchesMediaSearch(row, 'nirgendwo')).toBe(false);
  });
});

// --- BL-256 / ADR-v9-187: Art-Facette ---------------------------------------
//
// Der Anlass ist gemessen: am Realbestand sind 452 der 642 Medien Weblinks. Ohne
// Vorauswahl stehen sie vor den 189 Dateien und machen die Galerie unbrauchbar.

describe('Art-Facette (Dateien ⇄ Weblinks)', () => {
  function mixed(): Database {
    const db = makeDatabase();
    db.media.set('Pictures/a.jpg', makeMedia('Pictures/a.jpg', { title: 'A Foto' }));
    db.media.set('Documents/u.pdf', makeMedia('Documents/u.pdf', { title: 'B Urkunde' }));
    db.media.set('https://data.matricula-online.eu/x/', makeMedia('https://data.matricula-online.eu/x/', { title: 'C Kirchenbuch' }));
    db.media.set('https://www.archion.de/y', makeMedia('https://www.archion.de/y', { title: 'D Archion' }));
    return db;
  }

  it('klassifiziert jede Kachel über den Kern-Chokepoint', () => {
    const rows = buildMediaTiles(mixed());
    expect(rows.map((r) => r.fileKind)).toEqual(['file', 'file', 'weblink', 'weblink']);
    expect(rows.map((r) => r.isImage)).toEqual([true, false, false, false]);
  });

  it('zählt beide Arten und stellt „Dateien" voran', () => {
    const opts = buildKindFilterOptions(buildMediaTiles(mixed()));
    expect(opts.map((o) => [o.id, o.count])).toEqual([
      ['files', 2],
      ['weblinks', 2],
      ['all', 4],
    ]);
  });

  it('wählt „Dateien" vor, sobald beide Arten vorkommen', () => {
    const rows = buildMediaTiles(mixed());
    expect(initialKindFilter(rows)).toBe('files');
    expect(rows.filter((r) => matchesKindFilter(r, 'files')).map((r) => r.title)).toEqual([
      'A Foto',
      'B Urkunde',
    ]);
  });

  it('blendet Weblinks nicht weg, sondern nur aus der Vorauswahl — der Chip trägt die Zahl', () => {
    const rows = buildMediaTiles(mixed());
    expect(rows.filter((r) => matchesKindFilter(r, 'weblinks'))).toHaveLength(2);
    expect(rows.filter((r) => matchesKindFilter(r, 'all'))).toHaveLength(4);
  });

  it('zeigt KEINE Chip-Reihe, wenn nur eine Art vorkommt — und startet dann auf „Alle"', () => {
    const onlyFiles = makeDatabase();
    onlyFiles.media.set('Pictures/a.jpg', makeMedia('Pictures/a.jpg'));
    expect(buildKindFilterOptions(buildMediaTiles(onlyFiles))).toEqual([]);
    expect(initialKindFilter(buildMediaTiles(onlyFiles))).toBe('all');

    // Der umgekehrte Fall ist der gefährlichere: ein Bestand aus lauter Zitat-Fundorten
    // dürfte nicht in eine leere Galerie starten.
    const onlyLinks = makeDatabase();
    onlyLinks.media.set('https://a.de/x', makeMedia('https://a.de/x'));
    expect(initialKindFilter(buildMediaTiles(onlyLinks))).toBe('all');
  });

  it('eingebettete Medien zählen als Datei, nicht als Weblink', () => {
    const db = makeDatabase();
    db.media.set('data:image/png;base64,AA', makeMedia('data:image/png;base64,AA', { title: 'E' }));
    db.media.set('https://a.de/x', makeMedia('https://a.de/x', { title: 'F' }));
    const rows = buildMediaTiles(db);
    expect(rows.find((r) => r.title === 'E')?.fileKind).toBe('embedded');
    expect(rows.filter((r) => matchesKindFilter(r, 'files')).map((r) => r.title)).toEqual(['E']);
  });
});
