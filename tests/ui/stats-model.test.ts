// tests/ui/stats-model.test.ts — Statistik-Aggregation (Spec 20 §4 "Statistik-Report
// (Lebensspannen, Heiratsalter, Histogramme)"). Reine Funktion (db, ctx -> StatisticsResult),
// deshalb Unit- statt Component-Test (Testpyramide, Spec 32 §6). Ein Test pro Sektion:
// leere DB, zu wenig Datenpunkte -> Sektion fehlt, genug Datenpunkte -> korrekte Werte.
import { describe, expect, it } from 'vitest';
import { makeDatabase, makeFamily, makePerson, makeCitation, makeMediaCitation } from '../../core/model';
import { makePlaceRegistry, makeHofRegistry, savePlaceObject, type PlaceContext } from '../../core/places';
import { computeStatistics } from '../../ui/views/stats/stats-model';
// Geteilte Datenfabrik statt Inline-Literal (TST-REUSE, s. app-state.test.ts).
import { place } from '../core/places-fixtures';

function emptyContext(): PlaceContext {
  return { places: makePlaceRegistry(new Map()), hofs: makeHofRegistry(new Map()) };
}

function contextWithPlace(id: string, title: string): PlaceContext {
  const places = new Map();
  savePlaceObject(places, place(id, { title, type: 'Dorf' }));
  return { places: makePlaceRegistry(places), hofs: makeHofRegistry(new Map()) };
}

describe('computeStatistics — leerer Datenbestand', () => {
  it('liefert isEmpty=true und keine Sektionen, wenn keine Personen geladen sind', () => {
    const db = makeDatabase();
    const result = computeStatistics(db, emptyContext());

    expect(result.isEmpty).toBe(true);
    expect(result.overview).toEqual([]);
    expect(result.lifespans).toBeNull();
    expect(result.marriageAges).toBeNull();
    expect(result.decadeEvents).toBeNull();
    expect(result.childCounts).toEqual([]);
  });
});

describe('computeStatistics — Übersicht-Kacheln', () => {
  it('zählt Personen/Familien/Quellen/Orte/Archive/Medien dedupliziert', () => {
    const db = makeDatabase();
    const p1 = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    p1.media.push(makeMediaCitation('foto1.jpg'));
    const p2 = makePerson('@I2@', { given: 'Anna', surname: 'Klein' });
    p2.media.push(makeMediaCitation('foto1.jpg')); // gleiche Datei -> dedupliziert
    db.individuals.set('@I1@', p1);
    db.individuals.set('@I2@', p2);
    db.families.set('@F1@', makeFamily('@F1@', { husband: '@I1@', wife: '@I2@' }));
    db.sources.set('@S1@', { id: '@S1@', abbr: '', title: '', author: '', date: '', publisher: '', text: '', repo: '', callNumber: '', callMedia: '', dataEvents: [], externalRefs: [], media: [], lastChanged: '' });
    db.repositories.set('@R1@', { id: '@R1@', name: '', type: '', address: '', phone: '', www: '', email: '', findingAid: '', lastChanged: '' });

    const result = computeStatistics(db, emptyContext());

    expect(result.overview).toEqual([
      { label: 'Personen', value: 2 },
      { label: 'Familien', value: 1 },
      { label: 'Quellen', value: 1 },
      { label: 'Orte', value: 0 },
      { label: 'Archive', value: 1 },
      { label: 'Medien', value: 1 },
    ]);
  });

  it('zählt db.placeObjects.size für die Orte-Kachel (kein collectPlaces-Neubau)', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@'));
    const ctx = contextWithPlace('@P1@', 'Hildesheim');
    // Orte-Kachel liest db.placeObjects direkt, nicht den Registry-Umweg:
    db.placeObjects.set('@P1@', ctx.places.byId('@P1@')!);

    const result = computeStatistics(db, ctx);
    expect(result.overview.find((k) => k.label === 'Orte')?.value).toBe(1);
  });
});

describe('computeStatistics — Geschlechterverteilung', () => {
  it('berechnet Anzahl + Prozent für M/F/U', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { sex: 'M' }));
    db.individuals.set('@I2@', makePerson('@I2@', { sex: 'M' }));
    db.individuals.set('@I3@', makePerson('@I3@', { sex: 'F' }));
    db.individuals.set('@I4@', makePerson('@I4@', { sex: 'U' }));

    const result = computeStatistics(db, emptyContext());

    expect(result.gender).toEqual({
      male: 2,
      female: 1,
      unknown: 1,
      total: 4,
      malePct: 50,
      femalePct: 25,
      unknownPct: 25,
    });
  });
});

describe('computeStatistics — Datenvollständigkeit', () => {
  it('zählt Geburts-/Sterbedatum, Geschlecht, Quelle, Foto je Anzahl/Gesamt', () => {
    const db = makeDatabase();
    const p1 = makePerson('@I1@', { sex: 'M' });
    p1.birth.date = '1 JAN 1900';
    p1.death.date = '1 JAN 1970';
    p1.topLevelCitations.push(makeCitation('@S1@'));
    p1.media.push(makeMediaCitation('bild.jpg'));
    const p2 = makePerson('@I2@'); // sonst leer
    db.individuals.set('@I1@', p1);
    db.individuals.set('@I2@', p2);

    const result = computeStatistics(db, emptyContext());

    expect(result.completeness).toEqual([
      { label: 'Geburtsdatum/-ort', count: 1, total: 2, pct: 50 },
      { label: 'Sterbedatum/-ort', count: 1, total: 2, pct: 50 },
      { label: 'Geschlecht bekannt', count: 1, total: 2, pct: 50 },
      { label: 'Mind. 1 Quelle', count: 1, total: 2, pct: 50 },
      { label: 'Foto vorhanden', count: 1, total: 2, pct: 50 },
    ]);
  });
});

describe('computeStatistics — Lebensspannen', () => {
  it('fehlt, wenn weniger als 5 plausible Datenpunkte vorhanden sind', () => {
    const db = makeDatabase();
    for (let i = 0; i < 4; i++) {
      const p = makePerson(`@I${i}@`);
      p.birth.date = '1 JAN 1900';
      p.death.date = '1 JAN 1950';
      db.individuals.set(p.id, p);
    }
    const result = computeStatistics(db, emptyContext());
    expect(result.lifespans).toBeNull();
  });

  it('berechnet Ø/Median/Min/Max + 10-Jahres-Histogramm ab 5 Datenpunkten', () => {
    const db = makeDatabase();
    const ages = [50, 60, 70, 80, 90];
    ages.forEach((age, i) => {
      const p = makePerson(`@I${i}@`);
      p.birth.date = '1 JAN 1900';
      p.death.date = `1 JAN ${1900 + age}`;
      db.individuals.set(p.id, p);
    });

    const result = computeStatistics(db, emptyContext());

    expect(result.lifespans).not.toBeNull();
    expect(result.lifespans!.count).toBe(5);
    expect(result.lifespans!.avg).toBe(70);
    expect(result.lifespans!.median).toBe(70);
    expect(result.lifespans!.min).toBe(50);
    expect(result.lifespans!.max).toBe(90);
    expect(result.lifespans!.histogram).toEqual([
      { bin: 50, count: 1 },
      { bin: 60, count: 1 },
      { bin: 70, count: 1 },
      { bin: 80, count: 1 },
      { bin: 90, count: 1 },
    ]);
  });

  it('ignoriert unplausible Sterbealter (>= 120 Jahre oder negativ)', () => {
    const db = makeDatabase();
    const p1 = makePerson('@I1@');
    p1.birth.date = '1 JAN 1800';
    p1.death.date = '1 JAN 2000'; // 200 Jahre -> unplausibel
    db.individuals.set('@I1@', p1);
    // 5 plausible dazu
    [50, 60, 70, 80, 90].forEach((age, i) => {
      const p = makePerson(`@Ip${i}@`);
      p.birth.date = '1 JAN 1900';
      p.death.date = `1 JAN ${1900 + age}`;
      db.individuals.set(p.id, p);
    });

    const result = computeStatistics(db, emptyContext());
    expect(result.lifespans!.count).toBe(5); // p1 nicht mitgezählt
  });
});

describe('computeStatistics — Heiratsalter', () => {
  it('fehlt, wenn weniger als 3 belegte 5-Jahres-Bins vorhanden sind', () => {
    const db = makeDatabase();
    const husb = makePerson('@I1@', { sex: 'M' });
    husb.birth.date = '1 JAN 1900';
    const wife = makePerson('@I2@', { sex: 'F' });
    wife.birth.date = '1 JAN 1902';
    db.individuals.set('@I1@', husb);
    db.individuals.set('@I2@', wife);
    const f = makeFamily('@F1@', { husband: '@I1@', wife: '@I2@' });
    f.marriage.date = '1 JAN 1925'; // ein Bin nur
    db.families.set('@F1@', f);

    const result = computeStatistics(db, emptyContext());
    expect(result.marriageAges).toBeNull();
  });

  it('berechnet Ø Mann/Frau + Balken nach Geschlecht ab 3 belegten Bins', () => {
    const db = makeDatabase();
    const marriages = [
      { hAge: 20, wAge: 18, year: 1920 },
      { hAge: 25, wAge: 23, year: 1930 },
      { hAge: 30, wAge: 28, year: 1940 },
    ];
    marriages.forEach(({ hAge, wAge, year }, i) => {
      const husb = makePerson(`@Ih${i}@`, { sex: 'M' });
      husb.birth.date = `1 JAN ${year - hAge}`;
      const wife = makePerson(`@Iw${i}@`, { sex: 'F' });
      wife.birth.date = `1 JAN ${year - wAge}`;
      db.individuals.set(husb.id, husb);
      db.individuals.set(wife.id, wife);
      const f = makeFamily(`@F${i}@`, { husband: husb.id, wife: wife.id });
      f.marriage.date = `1 JAN ${year}`;
      db.families.set(f.id, f);
    });

    const result = computeStatistics(db, emptyContext());

    expect(result.marriageAges).not.toBeNull();
    expect(result.marriageAges!.count).toBe(6);
    expect(result.marriageAges!.avgMale).toBe(25); // (20+25+30)/3
    expect(result.marriageAges!.avgFemale).toBe(23); // (18+23+28)/3
    expect(result.marriageAges!.bins.length).toBeGreaterThanOrEqual(3);
  });
});

describe('computeStatistics — Ereignisse pro Jahrzehnt', () => {
  it('fehlt, wenn weniger als 3 belegte Jahrzehnte vorhanden sind', () => {
    const db = makeDatabase();
    const p1 = makePerson('@I1@');
    p1.birth.date = '1 JAN 1900';
    const p2 = makePerson('@I2@');
    p2.birth.date = '1 JAN 1905'; // gleiches Jahrzehnt wie p1
    db.individuals.set('@I1@', p1);
    db.individuals.set('@I2@', p2);

    const result = computeStatistics(db, emptyContext());
    expect(result.decadeEvents).toBeNull();
  });

  it('aggregiert Geburten/Sterbefälle/Heiraten je Jahrzehnt ab 3 belegten Jahrzehnten', () => {
    const db = makeDatabase();
    const p1 = makePerson('@I1@');
    p1.birth.date = '1 JAN 1900';
    const p2 = makePerson('@I2@');
    p2.birth.date = '1 JAN 1910';
    p2.death.date = '1 JAN 1920';
    db.individuals.set('@I1@', p1);
    db.individuals.set('@I2@', p2);
    const f = makeFamily('@F1@');
    f.marriage.date = '1 JAN 1930';
    db.families.set('@F1@', f);

    const result = computeStatistics(db, emptyContext());

    expect(result.decadeEvents).not.toBeNull();
    expect(result.decadeEvents!.decades).toEqual([1900, 1910, 1920, 1930]);
    expect(result.decadeEvents!.births[1900]).toBe(1);
    expect(result.decadeEvents!.births[1910]).toBe(1);
    expect(result.decadeEvents!.deaths[1920]).toBe(1);
    expect(result.decadeEvents!.marriages[1930]).toBe(1);
  });
});

describe('computeStatistics — Kinderzahl pro Familie', () => {
  it('ist leer, wenn weniger als 2 belegte Werte vorhanden sind', () => {
    const db = makeDatabase();
    db.individuals.set('@I0@', makePerson('@I0@'));
    db.families.set('@F1@', makeFamily('@F1@', { children: ['@I1@'] }));
    db.families.set('@F2@', makeFamily('@F2@', { children: ['@I2@'] })); // auch 1 Kind -> nur 1 Wert

    const result = computeStatistics(db, emptyContext());
    expect(result.childCounts).toEqual([]);
  });

  it('gruppiert 0,1,2,...,10+ ab 2 belegten Werten', () => {
    const db = makeDatabase();
    db.individuals.set('@I0@', makePerson('@I0@'));
    db.families.set('@F1@', makeFamily('@F1@', { children: [] }));
    db.families.set('@F2@', makeFamily('@F2@', { children: ['@I1@'] }));
    db.families.set(
      '@F3@',
      makeFamily('@F3@', { children: Array.from({ length: 11 }, (_, i) => `@Ic${i}@`) }),
    );

    const result = computeStatistics(db, emptyContext());

    expect(result.childCounts).toEqual([
      { label: '0', count: 1 },
      { label: '1', count: 1 },
      { label: '10+', count: 1 },
    ]);
  });
});

describe('computeStatistics — Top-Listen (Sortierung + Kappung)', () => {
  it('sortiert Top-Nachnamen absteigend und kappt auf 10', () => {
    const db = makeDatabase();
    let idx = 0;
    // 11 verschiedene Nachnamen, "Bauer" 3x, Rest je 1x
    for (let i = 0; i < 3; i++) db.individuals.set(`@I${idx++}@`, makePerson(`@I${idx}@`, { given: 'X', surname: 'Bauer' }));
    for (let i = 0; i < 11; i++) db.individuals.set(`@I${idx++}@`, makePerson(`@I${idx}@`, { given: 'X', surname: `Name${i}` }));

    const result = computeStatistics(db, emptyContext());

    expect(result.topSurnames.length).toBe(10);
    expect(result.topSurnames[0]).toEqual({ label: 'Bauer', count: 3 });
  });

  it('nutzt surnameCandidate() als Nachname-Quelle (Fallback auf Slash-Form ohne GIVN/SURN)', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { name: 'Otto /Anders/' })); // given/surname leer
    db.individuals.set('@I2@', makePerson('@I2@', { name: 'Karl /Anders/' }));

    const result = computeStatistics(db, emptyContext());
    expect(result.topSurnames).toEqual([{ label: 'Anders', count: 2 }]);
  });

  it('Top-Vornamen: erstes Namens-Token, sortiert + gekappt', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Otto Wilhelm', surname: 'A' }));
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Otto', surname: 'B' }));
    db.individuals.set('@I3@', makePerson('@I3@', { given: 'Anna', surname: 'C' }));

    const result = computeStatistics(db, emptyContext());
    expect(result.topGivenNames[0]).toEqual({ label: 'Otto', count: 2 });
  });

  it('häufigste Geburts-/Sterbeorte: placeId -> places.byId(...).title, sonst ev.place roh', () => {
    const ctx = contextWithPlace('@P1@', 'Hildesheim (Kreisstadt)');
    const db = makeDatabase();
    const p1 = makePerson('@I1@');
    p1.birth.placeId = '@P1@';
    p1.birth.place = 'Hildesheim'; // roh, aber placeId hat Vorrang
    const p2 = makePerson('@I2@');
    p2.birth.place = 'Hannover'; // kein placeId -> roher String
    db.individuals.set('@I1@', p1);
    db.individuals.set('@I2@', p2);

    const result = computeStatistics(db, ctx);

    expect(result.topBirthPlaces).toContainEqual({ label: 'Hildesheim (Kreisstadt)', count: 1 });
    expect(result.topBirthPlaces).toContainEqual({ label: 'Hannover', count: 1 });
  });
});

describe('computeStatistics — Fallback "Zeitliche Verteilung" (nur ohne Jahrzehnt-Diagramm)', () => {
  it('erscheint NICHT, wenn das Jahrzehnt-Diagramm bereits gezeigt wird (Redundanz-Vermeidung)', () => {
    const db = makeDatabase();
    const p1 = makePerson('@I1@');
    p1.birth.date = '1 JAN 1900';
    const p2 = makePerson('@I2@');
    p2.birth.date = '1 JAN 1910';
    p2.death.date = '1 JAN 1920';
    db.individuals.set('@I1@', p1);
    db.individuals.set('@I2@', p2);
    const f = makeFamily('@F1@');
    f.marriage.date = '1 JAN 1930';
    db.families.set('@F1@', f);

    const result = computeStatistics(db, emptyContext());
    expect(result.decadeEvents).not.toBeNull();
    expect(result.fallbackTimeline).toBeNull();
  });

  it('erscheint als 50-Jahres-Bins (Geburten), wenn das Jahrzehnt-Diagramm mangels Daten fehlt', () => {
    const db = makeDatabase();
    const p1 = makePerson('@I1@');
    p1.birth.date = '1 JAN 1900';
    const p2 = makePerson('@I2@');
    p2.birth.date = '1 JAN 1955';
    db.individuals.set('@I1@', p1);
    db.individuals.set('@I2@', p2);

    const result = computeStatistics(db, emptyContext());

    expect(result.decadeEvents).toBeNull(); // nur 2 Jahrzehnte -> kein Jahrzehnt-Diagramm
    expect(result.fallbackTimeline).not.toBeNull();
    expect(result.fallbackTimeline!.bins).toEqual([
      { bin: 1900, count: 1 },
      { bin: 1950, count: 1 },
    ]);
  });
});
