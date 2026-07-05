// tests/islands/timeline-model.test.ts — reine Datenaufbereitungs-Tests der
// Zeitleiste-Insel (Spec 32 §2: Layout-Berechnung wird über Modell -> Positionen
// unit-getestet, nicht über gerenderte Pixel). Deckt: Swim-Lane-Zuordnung je Event-Typ,
// Overlap-Auflösung (deterministisch), Dekaden-Gruppierung inkl. Höhenberechnung,
// Mehrpersonen-Farbzuordnung, historische Ereignisse im Jahresbereich gefiltert.
import { describe, expect, it } from 'vitest';
import {
  ALL_HIST_CATEGORIES,
  MAX_TIMELINE_PERSONS,
  collectMultiPersonEvents,
  collectPersonEvents,
  computeDecadeLayout,
  computeSwimLaneLayout,
  historicalEventsInRange,
  personColor,
  personDisplayName,
  resolveSwimOverlaps,
  swimLane,
  TIMELINE_PERSON_COLORS,
} from '../../ui/islands/timeline/timeline-model';
import { HIST_EVENTS } from '../../ui/islands/timeline/historical-events';
import { addPlace, contextFor, makeDatabase, makeEvent, makeFamily, makePerson } from './timeline-fixtures';

describe('swimLane — Kategorie-Zuordnung (Orakel: _swimLane)', () => {
  it('ordnet BIRT/CHR/DEAT/BURI der Lane "life" zu', () => {
    expect(swimLane({ type: 'birth' })).toBe('life');
    expect(swimLane({ type: 'chr' })).toBe('life');
    expect(swimLane({ type: 'death' })).toBe('life');
    expect(swimLane({ type: 'buri' })).toBe('life');
  });

  it('ordnet Heirat und Kind der Lane "family" zu', () => {
    expect(swimLane({ type: 'marr' })).toBe('family');
    expect(swimLane({ type: 'child' })).toBe('family');
  });

  it('ordnet RESI/EMIG/IMMI/NATU der Lane "resi" zu', () => {
    for (const t of ['RESI', 'EMIG', 'IMMI', 'NATU']) {
      expect(swimLane({ type: 'event', gedType: t })).toBe('resi');
    }
  });

  it('ordnet OCCU/TITL/EDUC/GRAD/RETI der Lane "work" zu', () => {
    for (const t of ['OCCU', 'TITL', 'EDUC', 'GRAD', 'RETI']) {
      expect(swimLane({ type: 'event', gedType: t })).toBe('work');
    }
  });

  it('ordnet EVEN mit Berufs-artigem eventType der Lane "work" zu', () => {
    expect(swimLane({ type: 'event', gedType: 'EVEN', eventType: 'Beruf' })).toBe('work');
    expect(swimLane({ type: 'event', gedType: 'EVEN', eventType: 'Beschäftigung' })).toBe('work');
    expect(swimLane({ type: 'event', gedType: 'EVEN', eventType: 'Sonstiges' })).toBe('other');
  });

  it('ordnet RELI/CONF/FCOM/ORDN/CENS/MILI/ADOP der Lane "church" zu', () => {
    for (const t of ['RELI', 'CONF', 'FCOM', 'ORDN', 'CENS', 'MILI', 'ADOP']) {
      expect(swimLane({ type: 'event', gedType: t })).toBe('church');
    }
  });

  it('fällt für unbekannte GEDCOM-Tags auf "other" zurück', () => {
    expect(swimLane({ type: 'event', gedType: 'FOO' })).toBe('other');
  });
});

describe('resolveSwimOverlaps — Kollisions-Auflösung (Orakel: _resolveSwimOverlaps)', () => {
  it('lässt weit auseinanderliegende Chips unverändert (nudge=0)', () => {
    const chips = [
      { pxLeft: 0, nudge: 0 },
      { pxLeft: 300, nudge: 0 },
    ];
    const out = resolveSwimOverlaps(chips, 140);
    expect(out.map((c) => c.nudge)).toEqual([0, 0]);
  });

  it('weicht kollidierende Chips in entgegengesetzte Richtungen aus', () => {
    const chips = [
      { pxLeft: 0, nudge: 0 },
      { pxLeft: 50, nudge: 0 }, // < 140px Abstand -> Kollision
    ];
    const out = resolveSwimOverlaps(chips, 140);
    expect(out[0].nudge).toBe(1);
    expect(out[1].nudge).toBe(-1);
  });

  it('behandelt eine Kette von 3 kollidierenden Chips deterministisch', () => {
    const chips = [
      { pxLeft: 0, nudge: 0 },
      { pxLeft: 20, nudge: 0 },
      { pxLeft: 40, nudge: 0 },
    ];
    const out = resolveSwimOverlaps(chips, 140);
    expect(out.map((c) => c.nudge)).toEqual([1, -1, 1]);
  });

  it('behandelt undatierte Chips (pxLeft=null) als nudge=0, ohne die Kollisionskette zu stören', () => {
    const chips = [
      { pxLeft: null, nudge: 0 },
      { pxLeft: 0, nudge: 0 },
      { pxLeft: 50, nudge: 0 },
    ];
    const out = resolveSwimOverlaps(chips, 140);
    expect(out[0].nudge).toBe(0);
    expect(out[1].nudge).toBe(1);
    expect(out[2].nudge).toBe(-1);
  });

  it('mutiert die Eingabe nicht (reine Funktion)', () => {
    const chips = [
      { pxLeft: 0, nudge: 0 },
      { pxLeft: 20, nudge: 0 },
    ];
    resolveSwimOverlaps(chips, 140);
    expect(chips.map((c) => c.nudge)).toEqual([0, 0]);
  });

  it('ist deterministisch: gleiche Eingabe -> gleiche Ausgabe', () => {
    const chips = [
      { pxLeft: 0, nudge: 0 },
      { pxLeft: 20, nudge: 0 },
      { pxLeft: 300, nudge: 0 },
    ];
    expect(resolveSwimOverlaps(chips, 140)).toEqual(resolveSwimOverlaps(chips, 140));
  });
});

describe('collectPersonEvents — Ereignis-Sammlung (Orakel: _buildPersonEvents)', () => {
  it('sammelt Geburt/Tod mit Jahr, Ort und Label', () => {
    const db = makeDatabase();
    addPlace(db, 'P1', 'Geburtsort');
    addPlace(db, 'P2', 'Sterbeort');
    db.individuals.set(
      'I1',
      makePerson('I1', {
        birth: makeEvent('BIRT', { placeId: 'P1', date: '1 JAN 1850', seen: true }),
        death: makeEvent('DEAT', { placeId: 'P2', date: '1 JAN 1920', seen: true }),
      }),
    );

    const evs = collectPersonEvents(db, contextFor(db), 'I1');

    expect(evs.map((e) => e.type)).toEqual(['birth', 'death']);
    expect(evs[0]).toMatchObject({ year: 1850, label: 'Geburt', place: 'Geburtsort' });
    expect(evs[1]).toMatchObject({ year: 1920, label: 'Tod', place: 'Sterbeort' });
  });

  it('ignoriert Sonder-Events ohne Datum (Orakel: `ev.seen && ev.date`)', () => {
    const db = makeDatabase();
    db.individuals.set('I1', makePerson('I1', { birth: makeEvent('BIRT', { seen: true, date: null }) }));

    expect(collectPersonEvents(db, contextFor(db), 'I1')).toEqual([]);
  });

  it('baut das Label aus eventType + Wert (Orakel: baseLabel + ": " + desc)', () => {
    const db = makeDatabase();
    db.individuals.set(
      'I1',
      makePerson('I1', {
        events: [makeEvent('OCCU', { eventType: '', value: 'Bauer', date: '1 JAN 1870' })],
      }),
    );
    // OCCU ohne eventType nutzt EVENT_LABELS-Fallback "Beruf".
    const evs = collectPersonEvents(db, contextFor(db), 'I1');
    expect(evs[0].label).toBe('Beruf: Bauer');
    expect(evs[0].title).toBe('Beruf');
  });

  it('sammelt Heirat aus der Familie mit Partnername', () => {
    const db = makeDatabase();
    db.individuals.set('I1', makePerson('I1', { given: 'Otto', parentIn: ['F1'] }));
    db.individuals.set('I2', makePerson('I2', { given: 'Anna', surname: 'Meyer' }));
    db.families.set(
      'F1',
      makeFamily('F1', {
        husband: 'I1',
        wife: 'I2',
        marriage: makeEvent('MARR', { date: '1 JAN 1875', seen: true }),
      }),
    );

    const evs = collectPersonEvents(db, contextFor(db), 'I1');

    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ type: 'marr', year: 1875, label: 'Heirat: Meyer' });
  });

  it('sammelt Kinder mit Geburtsjahr aus allen Familien der Person', () => {
    const db = makeDatabase();
    db.individuals.set('I1', makePerson('I1', { parentIn: ['F1'] }));
    db.individuals.set('C1', makePerson('C1', { given: 'Karl', birth: makeEvent('BIRT', { date: '1 JAN 1880', seen: true }) }));
    db.families.set('F1', makeFamily('F1', { husband: 'I1', children: ['C1'] }));

    const evs = collectPersonEvents(db, contextFor(db), 'I1');

    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ type: 'child', year: 1880, label: 'Kind: Karl' });
  });

  it('liefert [] für unbekannte Person-ID (kein Crash)', () => {
    expect(collectPersonEvents(makeDatabase(), contextFor(makeDatabase()), 'I999')).toEqual([]);
  });
});

describe('collectMultiPersonEvents — Mehrpersonen-Sammlung (bis 5)', () => {
  it('hängt den korrekten personIdx an jedes Ereignis', () => {
    const db = makeDatabase();
    db.individuals.set('I1', makePerson('I1', { birth: makeEvent('BIRT', { date: '1 JAN 1800', seen: true }) }));
    db.individuals.set('I2', makePerson('I2', { birth: makeEvent('BIRT', { date: '1 JAN 1850', seen: true }) }));

    const evs = collectMultiPersonEvents(db, contextFor(db), ['I1', 'I2']);

    expect(evs.find((e) => e.personId === 'I1')?.personIdx).toBe(0);
    expect(evs.find((e) => e.personId === 'I2')?.personIdx).toBe(1);
  });

  it('kappt auf MAX_TIMELINE_PERSONS (5), ignoriert überzählige IDs', () => {
    const db = makeDatabase();
    const ids = ['I1', 'I2', 'I3', 'I4', 'I5', 'I6'];
    for (const id of ids) {
      db.individuals.set(id, makePerson(id, { birth: makeEvent('BIRT', { date: '1 JAN 1800', seen: true }) }));
    }

    const evs = collectMultiPersonEvents(db, contextFor(db), ids);

    expect(MAX_TIMELINE_PERSONS).toBe(5);
    expect(new Set(evs.map((e) => e.personId)).size).toBe(5);
    expect(evs.some((e) => e.personId === 'I6')).toBe(false);
  });
});

describe('historicalEventsInRange — Kontext-Ereignisse gefiltert (Orakel: minYear-2/maxYear+2)', () => {
  it('liefert nur Ereignisse innerhalb [minYear-2, maxYear+2]', () => {
    const evs = historicalEventsInRange(1914, 1918, ALL_HIST_CATEGORIES);
    expect(evs.every((e) => e.year >= 1912 && e.year <= 1920)).toBe(true);
    expect(evs.some((e) => e.year === 1914)).toBe(true);
  });

  it('respektiert die Randgrenzen exakt (minYear-2 und maxYear+2 eingeschlossen)', () => {
    // 1914 (WWI beginnt) liegt in HIST_EVENTS; Bereich [1916,1916] -> Rand [1914,1918].
    const evs = historicalEventsInRange(1916, 1916, ALL_HIST_CATEGORIES);
    expect(evs.some((e) => e.year === 1914)).toBe(true);
    expect(evs.some((e) => e.year === 1918)).toBe(true);
    expect(evs.some((e) => e.year === 1913)).toBe(false);
  });

  it('filtert nach aktiven Kategorien', () => {
    const onlyWar = new Set(['war'] as const);
    const evs = historicalEventsInRange(0, 9999, onlyWar);
    expect(evs.every((e) => e.cat === 'war')).toBe(true);
    expect(evs.length).toBeGreaterThan(0);
    expect(evs.length).toBeLessThan(HIST_EVENTS.length);
  });

  it('liefert [] wenn keine Kategorie aktiv ist', () => {
    expect(historicalEventsInRange(0, 9999, new Set())).toEqual([]);
  });
});

describe('computeSwimLaneLayout — horizontales Layout (Orakel: _renderTlH)', () => {
  it('aktiviert die Lane "life" immer, andere Lanes nur bei Inhalt', () => {
    const events = [
      { personIdx: 0, personId: 'I1', year: 1850, date: '1 JAN 1850', type: 'birth' as const, label: 'Geburt', title: 'Geburt', desc: '', place: '' },
    ];
    const result = computeSwimLaneLayout(events, []);
    expect(result.lanes.map((l) => l.id)).toEqual(['life']);
  });

  it('aktiviert "hist" nur wenn historische Ereignisse im Bereich liegen', () => {
    const events = [
      { personIdx: 0, personId: 'I1', year: 1900, date: '1 JAN 1900', type: 'birth' as const, label: 'Geburt', title: 'Geburt', desc: '', place: '' },
    ];
    const withHist = computeSwimLaneLayout(events, historicalEventsInRange(1900, 1900, ALL_HIST_CATEGORIES));
    expect(withHist.lanes.map((l) => l.id)).toContain('hist');

    const withoutHist = computeSwimLaneLayout(events, []);
    expect(withoutHist.lanes.map((l) => l.id)).not.toContain('hist');
  });

  it('platziert Chips in der jeweils korrekten Lane', () => {
    const events = [
      { personIdx: 0, personId: 'I1', year: 1850, date: '1 JAN 1850', type: 'birth' as const, label: 'Geburt', title: 'Geburt', desc: '', place: '' },
      { personIdx: 0, personId: 'I1', year: 1870, date: '1 JAN 1870', type: 'event' as const, label: 'Beruf: Bauer', title: 'Beruf', desc: 'Bauer', place: '', gedType: 'OCCU', eventType: '' },
    ];
    const result = computeSwimLaneLayout(events, []);
    expect(result.chipsByLane.life).toHaveLength(1);
    expect(result.chipsByLane.work).toHaveLength(1);
  });

  it('berechnet minYear/maxYear aus Personen- UND historischen Ereignissen', () => {
    const events = [
      { personIdx: 0, personId: 'I1', year: 1900, date: '1 JAN 1900', type: 'birth' as const, label: 'Geburt', title: 'Geburt', desc: '', place: '' },
    ];
    const hist = [{ year: 1850, label: 'Test', cat: 'political' as const }];
    const result = computeSwimLaneLayout(events, hist);
    expect(result.minYear).toBe(1850);
    expect(result.maxYear).toBe(1900);
  });

  it('löst Überlappungen innerhalb einer Lane auf (nudge gesetzt bei dichten Events)', () => {
    // Große Zeitspanne (200 Jahre) + schmaler Container -> niedriges px/Jahr, sodass
    // zwei Events im selben Jahr garantiert unter der Chip-Kollisionsbreite (140px) liegen.
    const events = [
      { personIdx: 0, personId: 'I1', year: 1700, date: '1 JAN 1700', type: 'event' as const, label: 'Start', title: 'Start', desc: '', place: '', gedType: 'RESI', eventType: '' },
      { personIdx: 0, personId: 'I1', year: 1850, date: '1 JAN 1850', type: 'event' as const, label: 'A', title: 'A', desc: '', place: '', gedType: 'RESI', eventType: '' },
      { personIdx: 0, personId: 'I1', year: 1851, date: '1 JAN 1851', type: 'event' as const, label: 'B', title: 'B', desc: '', place: '', gedType: 'RESI', eventType: '' },
    ];
    const result = computeSwimLaneLayout(events, [], 400);
    const nudges = result.chipsByLane.resi.map((c) => c.nudge);
    expect(nudges).toContain(1);
    expect(nudges).toContain(-1);
  });

  it('ist deterministisch: gleiche Eingabe -> gleiche Ausgabe', () => {
    const events = [
      { personIdx: 0, personId: 'I1', year: 1850, date: '1 JAN 1850', type: 'birth' as const, label: 'Geburt', title: 'Geburt', desc: '', place: '' },
    ];
    expect(computeSwimLaneLayout(events, [])).toEqual(computeSwimLaneLayout(events, []));
  });

  it('liefert eine sinnvolle Breite auch ohne jegliche datierte Ereignisse', () => {
    const result = computeSwimLaneLayout([], []);
    expect(result.totalWidth).toBeGreaterThan(0);
    expect(result.minYear).toBe(0);
    expect(result.maxYear).toBe(0);
  });
});

describe('computeDecadeLayout — Dekaden-Gruppierung (Orakel: _renderTlV)', () => {
  it('gruppiert Ereignisse nach Jahrzehnt-Start', () => {
    const events = [
      { personIdx: 0, personId: 'I1', year: 1852, date: '1 JAN 1852', type: 'birth' as const, label: 'Geburt', title: 'Geburt', desc: '', place: '' },
      { personIdx: 0, personId: 'I1', year: 1918, date: '1 JAN 1918', type: 'death' as const, label: 'Tod', title: 'Tod', desc: '', place: '' },
    ];
    const result = computeDecadeLayout(events, []);
    expect(result.decades[0].decadeStart).toBe(1850);
    expect(result.decades.at(-1)!.decadeStart).toBe(1910);
    // Lückenlos von 1850 bis 1910 in 10er-Schritten.
    expect(result.decades.map((d) => d.decadeStart)).toEqual([1850, 1860, 1870, 1880, 1890, 1900, 1910]);
  });

  it('gibt leeren Dekaden die Mindesthöhe TL_PX_EMPTY (36px)', () => {
    const events = [
      { personIdx: 0, personId: 'I1', year: 1850, date: '1 JAN 1850', type: 'birth' as const, label: 'Geburt', title: 'Geburt', desc: '', place: '' },
      { personIdx: 0, personId: 'I1', year: 1880, date: '1 JAN 1880', type: 'death' as const, label: 'Tod', title: 'Tod', desc: '', place: '' },
    ];
    const result = computeDecadeLayout(events, []);
    const emptyDecade = result.decades.find((d) => d.decadeStart === 1860);
    expect(emptyDecade?.height).toBe(36);
  });

  it('berechnet die Höhe belegter Dekaden proportional zur Ereignisdichte (min. 90px)', () => {
    const events = [
      { personIdx: 0, personId: 'I1', year: 1850, date: '1 JAN 1850', type: 'birth' as const, label: 'Geburt', title: 'Geburt', desc: '', place: '' },
    ];
    const single = computeDecadeLayout(events, []);
    // 1 Event: max(1*58+20, 90) = 90
    expect(single.decades[0].height).toBe(90);

    const many = [
      ...events,
      { personIdx: 0, personId: 'I1', year: 1851, date: '1 JAN 1851', type: 'event' as const, label: 'A', title: 'A', desc: '', place: '' },
      { personIdx: 0, personId: 'I1', year: 1852, date: '1 JAN 1852', type: 'event' as const, label: 'B', title: 'B', desc: '', place: '' },
    ];
    const dense = computeDecadeLayout(many, []);
    // 3 Events: max(3*58+20, 90) = 194
    expect(dense.decades[0].height).toBe(194);
  });

  it('zählt historische Ereignisse zur Dichte einer Dekade dazu', () => {
    const events = [
      { personIdx: 0, personId: 'I1', year: 1850, date: '1 JAN 1850', type: 'birth' as const, label: 'Geburt', title: 'Geburt', desc: '', place: '' },
    ];
    const hist = [{ year: 1855, label: 'Historisch', cat: 'political' as const }];
    const result = computeDecadeLayout(events, hist);
    // 1 Personen-Event + 1 Hist-Event = 2: max(2*58+20, 90) = 136
    expect(result.decades[0].height).toBe(136);
  });

  it('summiert totalHeight aus allen Dekaden-Höhen', () => {
    const events = [
      { personIdx: 0, personId: 'I1', year: 1850, date: '1 JAN 1850', type: 'birth' as const, label: 'Geburt', title: 'Geburt', desc: '', place: '' },
      { personIdx: 0, personId: 'I1', year: 1870, date: '1 JAN 1870', type: 'death' as const, label: 'Tod', title: 'Tod', desc: '', place: '' },
    ];
    const result = computeDecadeLayout(events, []);
    const sum = result.decades.reduce((s, d) => s + d.height, 0);
    expect(result.totalHeight).toBe(sum);
  });

  it('ignoriert undatierte Ereignisse (Dekaden-Modus zeigt nur datierte)', () => {
    const events = [
      { personIdx: 0, personId: 'I1', year: 1850, date: '1 JAN 1850', type: 'birth' as const, label: 'Geburt', title: 'Geburt', desc: '', place: '' },
      { personIdx: 0, personId: 'I1', year: null, date: null, type: 'event' as const, label: 'Undatiert', title: 'Undatiert', desc: '', place: '' },
    ];
    const result = computeDecadeLayout(events, []);
    expect(result.decades[0].personEvents).toHaveLength(1);
  });

  it('liefert leeres Ergebnis ohne datierte Ereignisse', () => {
    expect(computeDecadeLayout([], [])).toEqual({ decades: [], totalHeight: 0 });
  });
});

describe('personColor — Mehrpersonen-Farbzuordnung', () => {
  it('liefert für jeden Index 0..4 eine feste, unterschiedliche Farbe', () => {
    const colors = [0, 1, 2, 3, 4].map(personColor);
    expect(new Set(colors).size).toBe(5);
    expect(colors).toEqual(TIMELINE_PERSON_COLORS.slice(0, 5));
  });

  it('ist deterministisch: gleicher Index -> gleiche Farbe', () => {
    expect(personColor(2)).toBe(personColor(2));
  });

  it('wiederholt sich zyklisch, falls der Index die Palettenlänge übersteigt', () => {
    expect(personColor(5)).toBe(personColor(0));
  });
});

describe('personDisplayName', () => {
  it('bevorzugt given+surname vor dem rohen name-Feld', () => {
    const p = makePerson('I1', { given: 'Otto', surname: 'Meyer', name: 'Otto /Meyer/' });
    expect(personDisplayName(p)).toBe('Otto Meyer');
  });

  it('fällt auf name zurück, wenn given/surname leer sind', () => {
    const p = makePerson('I1', { name: 'Unbekannt' });
    expect(personDisplayName(p)).toBe('Unbekannt');
  });

  it('fällt auf die id zurück, wenn gar kein Name vorhanden ist', () => {
    const p = makePerson('I1', {});
    expect(personDisplayName(p)).toBe('I1');
  });
});
