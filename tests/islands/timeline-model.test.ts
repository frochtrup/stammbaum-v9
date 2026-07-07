// tests/islands/timeline-model.test.ts — reine Datenaufbereitungs-Tests der
// Zeitleiste-Insel (Spec 32 §2: Layout-Berechnung wird über Modell -> Positionen
// unit-getestet, nicht über gerenderte Pixel). Deckt: Swim-Lane-Zuordnung je Event-Typ,
// Overlap-Auflösung (deterministisch, Greedy Interval Scheduling, beliebig viele
// Sub-Zeilen), Lane-Höhen-Skalierung mit Personenzahl/Sub-Zeilen-Bedarf,
// Dekaden-Gruppierung inkl. Höhenberechnung, Mehrpersonen-Farbzuordnung, historische
// Ereignisse im Jahresbereich gefiltert.
import { describe, expect, it } from 'vitest';
import {
  ALL_HIST_CATEGORIES,
  MAX_TIMELINE_PERSONS,
  SL_ROW_H,
  assignOverlapRows,
  collectMultiPersonEvents,
  collectPersonEvents,
  computeDecadeLayout,
  computeSwimLaneLayout,
  historicalEventsInRange,
  overlapRowCount,
  personColor,
  personDisplayName,
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

describe('assignOverlapRows — Greedy Interval Scheduling (ersetzt Orakel _resolveSwimOverlaps)', () => {
  it('lässt weit auseinanderliegende Chips unverändert (row=0)', () => {
    const chips = [
      { pxLeft: 0, row: 0 },
      { pxLeft: 300, row: 0 },
    ];
    const out = assignOverlapRows(chips, 140);
    expect(out.map((c) => c.row)).toEqual([0, 0]);
  });

  it('weicht 2 kollidierende Chips in unterschiedliche Sub-Zeilen aus', () => {
    const chips = [
      { pxLeft: 0, row: 0 },
      { pxLeft: 50, row: 0 }, // < 140px Abstand -> Kollision
    ];
    const out = assignOverlapRows(chips, 140);
    expect(out[0].row).toBe(0);
    expect(out[1].row).toBe(1);
  });

  it('KERN-REGRESSION (Befund 2): 3 dicht beieinanderliegende Chips (pxLeft 0/50/100, chipWidth 147) — ' +
    'der Orakel-Algorithmus liefert hier Chip1=Chip3 (beide "nudge=1") und überlappt sichtbar; ' +
    'assignOverlapRows MUSS Chip3 eine dritte Sub-Zeile geben, weil Chip3 mit Chip1 (Abstand 100 < 147) kollidiert', () => {
    const chips = [
      { pxLeft: 0, row: 0 },
      { pxLeft: 50, row: 0 },
      { pxLeft: 100, row: 0 },
    ];
    const out = assignOverlapRows(chips, 147);
    expect(out.map((c) => c.row)).toEqual([0, 1, 2]);
    // Keine zwei Chips in derselben Zeile dürfen sich überlappen.
    const rows = new Map<number, { left: number; right: number }[]>();
    for (const c of out) {
      const list = rows.get(c.row) ?? [];
      list.push({ left: c.pxLeft, right: c.pxLeft + 147 });
      rows.set(c.row, list);
    }
    for (const list of rows.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const overlap = list[i].left < list[j].right && list[j].left < list[i].right;
          expect(overlap).toBe(false);
        }
      }
    }
  });

  it('behandelt 5+ eng beieinanderliegende Chips ohne dass sich zwei in derselben Zeile überlappen', () => {
    // 6 Chips im Abstand von 20px, chipWidth 140 -> alle paarweise kollidierend.
    const chips = Array.from({ length: 6 }, (_, i) => ({ pxLeft: i * 20, row: 0 }));
    const out = assignOverlapRows(chips, 140);
    // Jeder Chip kollidiert mit allen anderen (Abstand max 100 < 140) -> jede Zeile darf
    // nur genau einen Chip enthalten -> 6 unterschiedliche Zeilen.
    expect(new Set(out.map((c) => c.row)).size).toBe(6);
  });

  it('weist einer Gruppe NICHT kollidierender, aber ineinander verschachtelter Zeitfenster die niedrigste freie Zeile zu ' +
    '(z. B. Mehrlingsgeburten: 2 Chips eng beieinander, ein 3. weit entfernter Chip darf wieder Zeile 0 nutzen)', () => {
    const chips = [
      { pxLeft: 0, row: 0 },
      { pxLeft: 50, row: 0 }, // kollidiert mit 0 -> Zeile 1
      { pxLeft: 1000, row: 0 }, // weit weg von beiden -> darf Zeile 0 wiederverwenden
    ];
    const out = assignOverlapRows(chips, 140);
    expect(out[0].row).toBe(0);
    expect(out[1].row).toBe(1);
    expect(out[2].row).toBe(0);
  });

  it('behandelt undatierte Chips (pxLeft=null) als row=0, ohne die Kollisionskette zu stören', () => {
    const chips = [
      { pxLeft: null, row: 0 },
      { pxLeft: 0, row: 0 },
      { pxLeft: 50, row: 0 },
    ];
    const out = assignOverlapRows(chips, 140);
    expect(out[0].row).toBe(0);
    expect(out[1].row).toBe(0);
    expect(out[2].row).toBe(1);
  });

  it('mutiert die Eingabe nicht (reine Funktion)', () => {
    const chips = [
      { pxLeft: 0, row: 0 },
      { pxLeft: 20, row: 0 },
    ];
    assignOverlapRows(chips, 140);
    expect(chips.map((c) => c.row)).toEqual([0, 0]);
  });

  it('ist deterministisch: gleiche Eingabe -> gleiche Ausgabe', () => {
    const chips = [
      { pxLeft: 0, row: 0 },
      { pxLeft: 20, row: 0 },
      { pxLeft: 300, row: 0 },
    ];
    expect(assignOverlapRows(chips, 140)).toEqual(assignOverlapRows(chips, 140));
  });
});

describe('overlapRowCount — Sub-Zeilen-Bedarf aus assignOverlapRows-Ergebnis', () => {
  it('liefert 1 für keine oder nur row=0-Chips', () => {
    expect(overlapRowCount([])).toBe(1);
    expect(overlapRowCount([{ row: 0 }, { row: 0 }])).toBe(1);
  });

  it('liefert max(row)+1', () => {
    expect(overlapRowCount([{ row: 0 }, { row: 2 }, { row: 1 }])).toBe(3);
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

  it('löst Überlappungen innerhalb einer Lane auf (row gesetzt bei dichten Events)', () => {
    // Große Zeitspanne (200 Jahre) + schmaler Container -> niedriges px/Jahr, sodass
    // zwei Events im selben Jahr garantiert unter der Chip-Kollisionsbreite (140px) liegen.
    const events = [
      { personIdx: 0, personId: 'I1', year: 1700, date: '1 JAN 1700', type: 'event' as const, label: 'Start', title: 'Start', desc: '', place: '', gedType: 'RESI', eventType: '' },
      { personIdx: 0, personId: 'I1', year: 1850, date: '1 JAN 1850', type: 'event' as const, label: 'A', title: 'A', desc: '', place: '', gedType: 'RESI', eventType: '' },
      { personIdx: 0, personId: 'I1', year: 1851, date: '1 JAN 1851', type: 'event' as const, label: 'B', title: 'B', desc: '', place: '', gedType: 'RESI', eventType: '' },
    ];
    const result = computeSwimLaneLayout(events, [], 400);
    const rows = result.chipsByLane.resi.map((c) => c.row);
    expect(rows).toContain(0);
    expect(rows).toContain(1);
  });

  it('BEFUND 2 (Regression): 5 eng beieinanderliegende Events in derselben Lane überlappen sich in KEINER Sub-Zeile ' +
    'und die Lane-Höhe wächst mit dem tatsächlichen Sub-Zeilen-Bedarf statt konstant zu bleiben', () => {
    const events = Array.from({ length: 5 }, (_, i) => ({
      personIdx: 0,
      personId: 'I1',
      year: 1900 + i, // 5 Jahre eng beieinander
      date: `1 JAN ${1900 + i}`,
      type: 'event' as const,
      label: `Wohnort ${i}`,
      title: 'Wohnort',
      desc: '',
      place: '',
      gedType: 'RESI',
      eventType: '',
    }));
    // Schmaler Container -> niedriges px/Jahr -> benachbarte Events liegen garantiert
    // unter der Chip-Kollisionsbreite (140px) beieinander -> viele Sub-Zeilen nötig (das
    // frühere 2-Ebenen-Schema hätte hier den 3./5. Chip auf eine belegte Zeile zurückfallen
    // lassen und sich überlappt).
    const result = computeSwimLaneLayout(events, [], 300);
    const chips = result.chipsByLane.resi;
    // KERN-ASSERTION: keine zwei Chips in derselben Zeile dürfen sich überlappen (echte
    // Positionsprüfung, nicht nur "row wurde irgendwie gesetzt").
    for (let i = 0; i < chips.length; i++) {
      for (let j = i + 1; j < chips.length; j++) {
        if (chips[i].row !== chips[j].row) continue;
        const li = chips[i].pxLeft as number;
        const lj = chips[j].pxLeft as number;
        const overlap = Math.abs(li - lj) < 140;
        expect(overlap).toBe(false);
      }
    }
    // Mit 5 im Abstand von je 40px liegenden Chips (pxPerYear=40) kollidiert jeder Chip
    // mit seinen unmittelbaren Nachbarn (Abstand 40 < 140) -> mind. 4 unterschiedliche
    // Sub-Zeilen nötig, bevor eine Zeile wieder frei genug für Wiederverwendung ist
    // (nur weit genug entfernte Chips dürfen eine Zeile recyceln, das ist KEIN Rückfall
    // auf eine belegte Zeile wie beim Orakel-Bug, sondern effiziente Wiederverwendung).
    const rowCount = new Set(chips.map((c) => c.row)).size;
    expect(rowCount).toBeGreaterThanOrEqual(4);
    const resiLane = result.lanes.find((l) => l.id === 'resi')!;
    const baseHeight = 58; // SWIM_LANES resi-Basishöhe
    expect(resiLane.height).toBeGreaterThan(baseHeight);
    expect(resiLane.height).toBeGreaterThanOrEqual(rowCount * SL_ROW_H);
  });

  it('BEFUND 1 (Regression): die "life"-Lane wächst mit der Personenzahl (Orakel: `numPersons*16`), ' +
    'bleibt bei einer einzelnen Person bei der Basishöhe (50px)', () => {
    const singlePerson = [
      { personIdx: 0, personId: 'I1', year: 1900, date: '1 JAN 1900', type: 'birth' as const, label: 'Geburt', title: 'Geburt', desc: '', place: '' },
    ];
    const single = computeSwimLaneLayout(singlePerson, []);
    expect(single.lanes.find((l) => l.id === 'life')!.height).toBe(50);

    // 5 Personen (Spec-Obergrenze) mit je Geburt+Tod -> life-Lane muss mit numPersons
    // wachsen, sonst werden gestaffelte Lebensspannen-Balken bei vielen Personen zu eng
    // (Aufgaben-Befund 1, Orakel `_renderTlH`: `lifeH = max(50, numPersons*16)`).
    const fivePersons = Array.from({ length: 5 }, (_, idx) => [
      { personIdx: idx, personId: `I${idx}`, year: 1848 + idx, date: `1 JAN ${1848 + idx}`, type: 'birth' as const, label: 'Geburt', title: 'Geburt', desc: '', place: '' },
      { personIdx: idx, personId: `I${idx}`, year: 1900 + idx, date: `1 JAN ${1900 + idx}`, type: 'death' as const, label: 'Tod', title: 'Tod', desc: '', place: '' },
    ]).flat();
    const multi = computeSwimLaneLayout(fivePersons, []);
    const lifeLane = multi.lanes.find((l) => l.id === 'life')!;
    expect(lifeLane.height).toBeGreaterThanOrEqual(Math.max(50, 5 * 16));
    expect(lifeLane.height).toBeGreaterThan(single.lanes.find((l) => l.id === 'life')!.height);
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

  it('Lane-Höhe ist eine reine Funktion des Sub-Zeilen-Bedarfs: mehr Sub-Zeilen -> größere Höhe (SL_ROW_H-Vielfaches)', () => {
    const dense = Array.from({ length: 8 }, (_, i) => ({
      personIdx: 0,
      personId: 'I1',
      year: 1900 + i,
      date: `1 JAN ${1900 + i}`,
      type: 'event' as const,
      label: `E${i}`,
      title: `E${i}`,
      desc: '',
      place: '',
      gedType: 'OCCU',
      eventType: '',
    }));
    const result = computeSwimLaneLayout(dense, [], 300);
    const workLane = result.lanes.find((l) => l.id === 'work')!;
    const rowCount = new Set(result.chipsByLane.work.map((c) => c.row)).size;
    expect(rowCount).toBeGreaterThan(1);
    expect(workLane.height).toBeGreaterThanOrEqual(rowCount * SL_ROW_H);
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
