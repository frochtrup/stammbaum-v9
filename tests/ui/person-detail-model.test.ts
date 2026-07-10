// tests/ui/person-detail-model.test.ts — Personen-Detail-Projektion (Spec 20 §1.4 [K]):
// Ereignisse, Quellen-Zitate, Geo-Koordinaten, Familien-Navigationszeilen. Reine
// Funktion, deshalb Unit statt Component-Test (TST-5).
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, makeFamily, makeCitation, makeEvent } from '../../core/model';
import { makePlaceRegistry, makeHofRegistry, type PlaceContext } from '../../core/places';
import { buildPersonDetail } from '../../ui/views/person/person-detail-model';

function emptyContext(): PlaceContext {
  return { places: makePlaceRegistry(new Map()), hofs: makeHofRegistry(new Map()) };
}

describe('buildPersonDetail — Ereignisse/Quellen/Familien-Navigation', () => {
  it('gibt null zurück, wenn die id im aktuellen Datenbestand fehlt (definierter Fallback)', () => {
    const db = makeDatabase();
    expect(buildPersonDetail(db, emptyContext(), '@I999@')).toBeNull();
  });

  it('listet nur tatsächlich vorhandene Sonder-Ereignisse (Geburt/Tod), keine leeren Platzhalter', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.date = '1 JAN 1900';
    db.individuals.set('@I1@', p);

    const detail = buildPersonDetail(db, emptyContext(), '@I1@')!;

    expect(detail.events.map((e) => e.label)).toEqual(['Geburt']);
  });

  it('reicht Quellen-Zitate eines Ereignisses unverändert durch (für die §N-Badge-Darstellung)', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.date = '1 JAN 1900';
    p.birth.citations.push(makeCitation('@S1@', { quay: 2 }));
    db.individuals.set('@I1@', p);

    const detail = buildPersonDetail(db, emptyContext(), '@I1@')!;

    expect(detail.events[0].citations).toHaveLength(1);
    expect(detail.events[0].citations[0].sourceId).toBe('@S1@');
    expect(detail.events[0].citations[0].quay).toBe(2);
  });

  it('liefert Koordinaten für ein Ereignis, wenn im Modell vorhanden (Geo-Link-Voraussetzung)', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.date = '1 JAN 1900';
    p.birth.lati = 52.1;
    p.birth.long = 7.6;
    db.individuals.set('@I1@', p);

    const detail = buildPersonDetail(db, emptyContext(), '@I1@')!;

    expect(detail.events[0].coords).toEqual({ lat: 52.1, long: 7.6 });
  });

  it('reicht value (z. B. Beruf bei OCCU) und addr (Adresse bei RESI/PROP) durch, statt sie stillschweigend zu verwerfen', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.events.push(makeEvent('OCCU', { value: 'Landwirt' }));
    p.events.push(makeEvent('RESI', { date: '1950', addr: 'Nienborger Damm 1' }));
    db.individuals.set('@I1@', p);

    const detail = buildPersonDetail(db, emptyContext(), '@I1@')!;

    // Labels sind jetzt deutsch übersetzt (event-labels.ts, Nutzer-Fund 2026-07-10) —
    // "OCCU"/"RESI" erscheinen nicht mehr roh.
    const occu = detail.events.find((e) => e.label === 'Beruf')!;
    expect(occu.value).toBe('Landwirt');
    const resi = detail.events.find((e) => e.label === 'Wohnort')!;
    expect(resi.addr).toBe('Nienborger Damm 1');
  });

  it('liefert keine Koordinaten, wenn weder Event noch Ort/Hof welche tragen', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.date = '1 JAN 1900';
    db.individuals.set('@I1@', p);

    const detail = buildPersonDetail(db, emptyContext(), '@I1@')!;

    expect(detail.events[0].coords).toBeNull();
  });

  it('baut anklickbare Familien-Navigationszeilen für eigene Familie (parentIn) und Herkunftsfamilie (childOf)', () => {
    const db = makeDatabase();
    const child = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    const parent = makePerson('@I2@', { given: 'Otto', surname: 'Bauer' });
    const spouse = makePerson('@I3@', { given: 'Lisa', surname: 'Klein' });

    const famChild = makeFamily('@F1@', { husband: '@I2@', children: ['@I1@'] });
    const famOwn = makeFamily('@F2@', { husband: '@I1@', wife: '@I3@' });

    child.childOf.push({
      familyId: '@F1@',
      pedigree: 'birth',
      fatherRel: '',
      motherRel: '',
      fatherRelSeen: false,
      motherRelSeen: false,
      citations: [],
    });
    child.parentIn.push('@F2@');

    db.individuals.set('@I1@', child);
    db.individuals.set('@I2@', parent);
    db.individuals.set('@I3@', spouse);
    db.families.set('@F1@', famChild);
    db.families.set('@F2@', famOwn);

    const detail = buildPersonDetail(db, emptyContext(), '@I1@')!;

    expect(detail.families).toHaveLength(2);
    const own = detail.families.find((f) => f.role === 'parentIn')!;
    expect(own.members.map((m) => m.personId)).toEqual(['@I3@']);
    const origin = detail.families.find((f) => f.role === 'childOf')!;
    expect(origin.members.map((m) => m.personId)).toEqual(['@I2@']);
  });

  it('zeigt bei der eigenen Familie (parentIn) auch die Kinder an (ADR-v9-30 Punkt 6/Nachtrag)', () => {
    const db = makeDatabase();
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    const spouse = makePerson('@I2@', { given: 'Lisa', surname: 'Klein' });
    const child1 = makePerson('@I3@', { given: 'Julius', surname: 'Bauer' });
    const child2 = makePerson('@I4@', { given: 'Elisabeth', surname: 'Bauer' });

    const famOwn = makeFamily('@F1@', { husband: '@I1@', wife: '@I2@', children: ['@I3@', '@I4@'] });
    person.parentIn.push('@F1@');

    db.individuals.set('@I1@', person);
    db.individuals.set('@I2@', spouse);
    db.individuals.set('@I3@', child1);
    db.individuals.set('@I4@', child2);
    db.families.set('@F1@', famOwn);

    const detail = buildPersonDetail(db, emptyContext(), '@I1@')!;

    const own = detail.families.find((f) => f.role === 'parentIn')!;
    expect(own.members.map((m) => m.personId)).toEqual(['@I2@']);
    expect(own.children.map((c) => c.personId)).toEqual(['@I3@', '@I4@']);
    expect(own.children.map((c) => c.name)).toEqual(['Julius Bauer', 'Elisabeth Bauer']);
  });

  it('zeigt bei Kindern das Geburtsjahr zur Namensgleichheits-Disambiguierung (INV-UI-6, gleicher Mechanismus wie FamilyDetail)', () => {
    const db = makeDatabase();
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    const child = makePerson('@I3@', { given: 'Julius', surname: 'Bauer' });
    child.birth.date = '1955';

    const famOwn = makeFamily('@F1@', { husband: '@I1@', children: ['@I3@'] });
    person.parentIn.push('@F1@');

    db.individuals.set('@I1@', person);
    db.individuals.set('@I3@', child);
    db.families.set('@F1@', famOwn);

    const detail = buildPersonDetail(db, emptyContext(), '@I1@')!;

    const own = detail.families.find((f) => f.role === 'parentIn')!;
    expect(own.children[0].summary).toBe('1955');
  });

  it('liefert bei der Herkunftsfamilie (childOf) keine Kinder (nur Eltern, Geschwister bleiben außen vor)', () => {
    const db = makeDatabase();
    const child = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    const parent = makePerson('@I2@', { given: 'Otto', surname: 'Bauer' });
    const sibling = makePerson('@I3@', { given: 'Karl', surname: 'Bauer' });

    const famChild = makeFamily('@F1@', { husband: '@I2@', children: ['@I1@', '@I3@'] });
    child.childOf.push({
      familyId: '@F1@',
      pedigree: 'birth',
      fatherRel: '',
      motherRel: '',
      fatherRelSeen: false,
      motherRelSeen: false,
      citations: [],
    });

    db.individuals.set('@I1@', child);
    db.individuals.set('@I2@', parent);
    db.individuals.set('@I3@', sibling);
    db.families.set('@F1@', famChild);

    const detail = buildPersonDetail(db, emptyContext(), '@I1@')!;

    const origin = detail.families.find((f) => f.role === 'childOf')!;
    expect(origin.children).toEqual([]);
  });
});

describe('buildPersonDetail — deutsche Labels + Kategorie-Gruppierung (Nutzer-Fund 2026-07-10)', () => {
  it('übersetzt generische Ereignistypen (GRAD/EDUC/OCCU) statt sie roh zu zeigen', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.events.push(makeEvent('GRAD', { value: 'Dipl.-Ing.' }));
    p.events.push(makeEvent('EDUC', { date: '1975' }));
    p.events.push(makeEvent('OCCU', { value: 'Ingenieurin' }));
    db.individuals.set('@I1@', p);

    const detail = buildPersonDetail(db, emptyContext(), '@I1@')!;

    expect(detail.events.map((e) => e.label)).toEqual(['Abschluss', 'Ausbildung', 'Beruf']);
  });

  it('bevorzugt einen freien TYPE-Text (ev.eventType) vor der generischen Übersetzung', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    const educ = makeEvent('EDUC', {});
    educ.eventType = 'Schule';
    p.events.push(educ);
    db.individuals.set('@I1@', p);

    const detail = buildPersonDetail(db, emptyContext(), '@I1@')!;

    expect(detail.events[0].label).toBe('Schule');
  });

  it('gruppiert Ereignisse in feste Kategorien (Lebensdaten → Bildung → Beruf → Wohnen & Eigentum → Weitere)', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.date = '1 JAN 1900';
    // Bewusst NICHT in Kategorie-Reihenfolge hinzugefügt — die Gruppierung muss die
    // feste Reihenfolge selbst herstellen, nicht die Einfüge-Reihenfolge übernehmen.
    p.events.push(makeEvent('EMIG', { date: '1955' }));
    p.events.push(makeEvent('OCCU', { value: 'Landwirt' }));
    p.events.push(makeEvent('GRAD', { date: '1970' }));
    p.events.push(makeEvent('RESI', { addr: 'Wall 33' }));
    db.individuals.set('@I1@', p);

    const detail = buildPersonDetail(db, emptyContext(), '@I1@')!;

    expect(detail.eventGroups.map((g) => g.type)).toEqual([
      'Lebensdaten',
      'Bildung',
      'Beruf',
      'Wohnen & Eigentum',
      'Weitere Ereignisse',
    ]);
    expect(detail.eventGroups.find((g) => g.type === 'Lebensdaten')!.rows.map((r) => r.label)).toEqual(['Geburt']);
    expect(detail.eventGroups.find((g) => g.type === 'Weitere Ereignisse')!.rows.map((r) => r.label)).toEqual([
      'Auswanderung',
    ]);
  });

  it('ein EDUC-Ereignis mit freiem TYPE-Text bleibt trotzdem in Kategorie "Bildung"', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    const educ = makeEvent('EDUC', {});
    educ.eventType = 'Schule';
    p.events.push(educ);
    db.individuals.set('@I1@', p);

    const detail = buildPersonDetail(db, emptyContext(), '@I1@')!;

    const bildung = detail.eventGroups.find((g) => g.type === 'Bildung');
    expect(bildung?.rows.map((r) => r.label)).toEqual(['Schule']);
  });

  it('OCCU und EVEN mit TYPE "Beschäftigung" landen in DERSELBEN Gruppe "Beruf" (Nutzer-Vorgabe 2026-07-10)', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Klaus', surname: 'Decker' });
    p.events.push(makeEvent('OCCU', { value: 'Luft- und Raumfahrtingenieur' }));
    const beschaeftigung = makeEvent('EVEN', { date: '2007', value: 'Team Leader' });
    beschaeftigung.eventType = 'Beschäftigung';
    p.events.push(beschaeftigung);
    db.individuals.set('@I1@', p);

    const detail = buildPersonDetail(db, emptyContext(), '@I1@')!;

    expect(detail.eventGroups.map((g) => g.type)).toEqual(['Beruf']);
    const beruf = detail.eventGroups.find((g) => g.type === 'Beruf')!;
    expect(beruf.rows.map((r) => r.label)).toEqual(['Beruf', 'Beschäftigung']);
  });

  it('Beruf-Kategorie: OCCU steht IMMER vor Beschäftigung, unabhängig von der Einfüge-Reihenfolge; Beschäftigung-Zeilen chronologisch (Nutzer-Vorgabe 2026-07-10)', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Klaus', surname: 'Decker' });
    // Bewusst OCCU ZULETZT eingefügt, und Beschäftigung-Daten NICHT chronologisch
    // eingefügt — die Sortierung muss beides selbst herstellen, nicht die
    // Einfüge-Reihenfolge übernehmen (anders als jede andere Kategorie).
    const b2015 = makeEvent('EVEN', { date: '2015', value: 'Integration Manager' });
    b2015.eventType = 'Beschäftigung';
    p.events.push(b2015);
    const b2007 = makeEvent('EVEN', { date: '2007', value: 'Team Leader' });
    b2007.eventType = 'Beschäftigung';
    p.events.push(b2007);
    p.events.push(makeEvent('OCCU', { value: 'Luft- und Raumfahrtingenieur' }));

    db.individuals.set('@I1@', p);

    const detail = buildPersonDetail(db, emptyContext(), '@I1@')!;

    const beruf = detail.eventGroups.find((g) => g.type === 'Beruf')!;
    expect(beruf.rows.map((r) => r.label)).toEqual(['Beruf', 'Beschäftigung', 'Beschäftigung']);
    expect(beruf.rows.map((r) => r.year)).toEqual([null, 2007, 2015]);
  });
});
