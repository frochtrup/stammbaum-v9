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

// Seit BL-339 steht die GEBURTSZEILE immer — auch leer (ADR-v9-62 Punkt 1 „Geburt: bleibt
// immer offen"). Ein Positions-Zugriff (`events[0]`) sagt damit nichts mehr über die
// gemeinte Zeile: fünf Tests hier griffen auf `[0]` zu und meinten das generische Ereignis,
// das sie selbst angelegt hatten. Sie fragen jetzt nach dem TAG statt nach dem Platz — das
// ist auch gegen jede künftige Zeile robust, die vorne dazukommt.
type Detail = NonNullable<ReturnType<typeof buildPersonDetail>>;
const zeile = (d: Detail, tag: string): Detail['events'][number] => d.events.find((e) => e.tag === tag)!;
/** Alles außer der immer vorhandenen Geburtszeile. */
const ohneGeburt = (d: Detail): Detail['events'] => d.events.filter((e) => e.tag !== 'BIRT');

describe('buildPersonDetail — Ereignisse/Quellen/Familien-Navigation', () => {
  it('gibt null zurück, wenn die id im aktuellen Datenbestand fehlt (definierter Fallback)', () => {
    const db = makeDatabase();
    expect(buildPersonDetail(db, emptyContext(), '@I999@')).toBeNull();
  });

  it('zeigt CHR/DEAT/BURI nur wenn belegt — die Geburt dagegen immer (ADR-v9-62 Punkt 1)', () => {
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

  it('zeigt bei der EIGENEN Ereigniszeile das VOLLE, lokalisierte Datum (Tag+Monat+Qualifier), nicht nur das Jahr (INV-UI-9, ADR-v9-64, Regressionstest)', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.date = '12 MAR 1890';
    p.death.date = 'ABT 1960';
    db.individuals.set('@I1@', p);

    const detail = buildPersonDetail(db, emptyContext(), '@I1@')!;

    const birth = detail.events.find((e) => e.label === 'Geburt')!;
    expect(birth.dateLabel).toBe('12. März 1890');
    const death = detail.events.find((e) => e.label === 'Tod')!;
    expect(death.dateLabel).toBe('ca. 1960');
  });

  it('Ereignisse[]-Einträge zeigen ebenfalls das volle Datum in der eigenen Ereigniszeile (nicht nur BIRT/DEAT-Sonderfelder)', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.events.push(makeEvent('RESI', { date: '5 JUN 1950', addr: 'Nienborger Damm 1' }));
    db.individuals.set('@I1@', p);

    const detail = buildPersonDetail(db, emptyContext(), '@I1@')!;

    expect(zeile(detail, 'RESI').dateLabel).toBe('5. Juni 1950');
  });

  it('liefert placeLabel getrennt vom Datum (ADR-v9-80 Punkt 1) — EventLine rendert "Datum, Ort" statt eines vorverknüpften Strings', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.events.push(makeEvent('RESI', { date: '5 JUN 1950', place: 'Ochtrup' }));
    db.individuals.set('@I1@', p);

    const detail = buildPersonDetail(db, emptyContext(), '@I1@')!;

    expect(zeile(detail, 'RESI').dateLabel).toBe('5. Juni 1950');
    expect(zeile(detail, 'RESI').placeLabel).toBe('Ochtrup');
  });

  it('Kinder-Zeile (Disambiguierung, INV-UI-6) bleibt bei Jahr-only, auch wenn das Geburtsdatum Tag+Monat trägt', () => {
    const db = makeDatabase();
    const person = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    const child = makePerson('@I3@', { given: 'Julius', surname: 'Bauer' });
    child.birth.date = '12 MAR 1955';

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

    expect(ohneGeburt(detail).map((e) => e.label)).toEqual(['Abschluss', 'Ausbildung', 'Beruf']);
  });

  it('bevorzugt einen freien TYPE-Text (ev.eventType) vor der generischen Übersetzung', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    const educ = makeEvent('EDUC', {});
    educ.eventType = 'Schule';
    p.events.push(educ);
    db.individuals.set('@I1@', p);

    const detail = buildPersonDetail(db, emptyContext(), '@I1@')!;

    expect(zeile(detail, 'EDUC').label).toBe('Schule');
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

    // 'Lebensdaten' steht seit BL-339 auch ohne Geburtsdaten da (die Zeile ist immer offen).
    expect(detail.eventGroups.map((g) => g.type)).toEqual(['Lebensdaten', 'Beruf']);
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

describe('buildPersonDetail — INV-UI-6 bei Ehepartner und Eltern (BL-64)', () => {
  // Spec 21 §6c benennt die Lücke wörtlich: `PersonDetail`s `fam.members` (Ehepartner
  // bei parentIn, Eltern bei childOf) trugen kein Geburtsjahr, obwohl `FamilyDetail`
  // es für DIESELBEN Personen längst zeigt — zwei Aufrufketten derselben fachlichen
  // Entscheidung, auseinandergelaufen.
  function dbMitZweiGleichnamigen() {
    const db = makeDatabase();
    db.individuals.set('@ICH@', makePerson('@ICH@', { given: 'Kind', surname: 'Decker' }));
    db.individuals.set(
      '@P1@',
      makePerson('@P1@', { given: 'Anna', surname: 'Decker', birth: makeEvent('BIRT', { date: '1850' }) }),
    );
    db.individuals.set(
      '@P2@',
      makePerson('@P2@', { given: 'Anna', surname: 'Decker', birth: makeEvent('BIRT', { date: '1875' }) }),
    );
    return db;
  }

  it('gibt dem Ehepartner ein Geburtsjahr (role parentIn)', () => {
    const db = dbMitZweiGleichnamigen();
    db.families.set('@F1@', makeFamily('@F1@', { husband: '@ICH@', wife: '@P1@' }));
    db.individuals.get('@ICH@')!.parentIn = ['@F1@'];

    const modell = buildPersonDetail(db, emptyContext(), '@ICH@')!;
    const partner = modell.families[0].members[0];
    expect(partner.name).toBe('Anna Decker');
    expect(partner.summary).toBe('1850');
  });

  it('gibt den Eltern ein Geburtsjahr (role childOf)', () => {
    const db = dbMitZweiGleichnamigen();
    db.families.set('@F1@', makeFamily('@F1@', { wife: '@P2@', children: ['@ICH@'] }));
    db.individuals.get('@ICH@')!.childOf = [
      { familyId: '@F1@', pedigree: '', fatherRel: '', motherRel: '', fatherRelSeen: false, motherRelSeen: false, citations: [] },
    ];

    const modell = buildPersonDetail(db, emptyContext(), '@ICH@')!;
    const mutter = modell.families[0].members[0];
    expect(mutter.name).toBe('Anna Decker');
    expect(mutter.summary).toBe('1875');
  });

  it('macht zwei gleichnamige Personen tatsächlich unterscheidbar — der Zweck der Regel', () => {
    // Ohne `summary` stünde in beiden Zeilen dasselbe: „Anna Decker".
    const db = dbMitZweiGleichnamigen();
    db.families.set('@F1@', makeFamily('@F1@', { husband: '@ICH@', wife: '@P1@' }));
    db.families.set('@F2@', makeFamily('@F2@', { husband: '@ICH@', wife: '@P2@' }));
    db.individuals.get('@ICH@')!.parentIn = ['@F1@', '@F2@'];

    const modell = buildPersonDetail(db, emptyContext(), '@ICH@')!;
    const beschriftungen = modell.families.map((f) => `${f.members[0].name} ${f.members[0].summary}`);
    expect(new Set(beschriftungen).size).toBe(2);
  });

  it('bleibt leer, wenn kein Geburtsdatum bekannt ist — kein erfundener Platzhalter', () => {
    const db = makeDatabase();
    db.individuals.set('@ICH@', makePerson('@ICH@', { given: 'Kind', surname: 'Decker' }));
    db.individuals.set('@P1@', makePerson('@P1@', { given: 'Anna', surname: 'Decker' }));
    db.families.set('@F1@', makeFamily('@F1@', { husband: '@ICH@', wife: '@P1@' }));
    db.individuals.get('@ICH@')!.parentIn = ['@F1@'];

    const modell = buildPersonDetail(db, emptyContext(), '@ICH@')!;
    expect(modell.families[0].members[0].summary).toBe('');
  });
});

describe('BL-199 — Kind-Verhältnis der Person zu ihren Eltern (childOf-Zeile)', () => {
  function ctx(): PlaceContext {
    return { places: makePlaceRegistry(new Map()), hofs: makeHofRegistry(new Map()) };
  }
  it('Pflegekind → pedigree "Pflegekind" an der Herkunftsfamilie; parentIn bleibt leer', () => {
    const db = makeDatabase();
    const father = makePerson('@I2@', { given: 'Otto', surname: 'Bauer' });
    const person = makePerson('@I1@', { given: 'Anna', surname: 'Bauer', childOf: [{ familyId: '@F1@', pedigree: 'foster', fatherRel: '', motherRel: '', fatherRelSeen: false, motherRelSeen: false, citations: [] }], parentIn: ['@F2@'] });
    db.individuals.set('@I1@', person);
    db.individuals.set('@I2@', father);
    db.families.set('@F1@', makeFamily('@F1@', { husband: '@I2@', children: ['@I1@'] }));
    db.families.set('@F2@', makeFamily('@F2@', { husband: '@I1@' }));
    const model = buildPersonDetail(db, ctx(), '@I1@')!;
    expect(model.families.find((f) => f.role === 'childOf')?.pedigree).toBe('Pflegekind');
    expect(model.families.find((f) => f.role === 'parentIn')?.pedigree).toBe('');
  });
})

describe('BL-196/197 — Alter + datePhrase in der Ereigniszeile', () => {
  function ctx(): PlaceContext {
    return { places: makePlaceRegistry(new Map()), hofs: makeHofRegistry(new Map()) };
  }
  it('Nicht-Geburts-Ereignis trägt Alter; Geburt selbst nicht; datePhrase durchgereicht', () => {
    const db = makeDatabase();
    const p = makePerson('@I1@', { given: 'Anna', surname: 'Bauer' });
    p.birth.date = '1 JAN 1850';
    p.death.date = '1 JAN 1920';
    p.death.datePhrase = 'kurz vor Weihnachten';
    db.individuals.set('@I1@', p);
    const model = buildPersonDetail(db, ctx(), '@I1@')!;
    const birth = model.events.find((e) => e.key === 'BIRT')!;
    const death = model.events.find((e) => e.key === 'DEAT')!;
    expect(birth.age).toBe('');
    expect(death.age).toBe('70 J.');
    expect(death.datePhrase).toBe('kurz vor Weihnachten');
  });
});

describe('Familien-Zeile: Hochzeitsdatum und Kinder-Reihenfolge (Nutzer-Befund 2026-08-13)', () => {
  function ctx(): PlaceContext {
    return { places: makePlaceRegistry(new Map()), hofs: makeHofRegistry(new Map()) };
  }

  /** Vater mit eigener Familie; die Kinder stehen in der Datei BEWUSST unsortiert. */
  function familieMitKindern() {
    const db = makeDatabase();
    const vater = makePerson('@I1@', { given: 'Anton', surname: 'Meyer', parentIn: ['@F1@'] });
    db.individuals.set('@I1@', vater);
    const kinder: [string, string, string][] = [
      ['@I10@', 'Clara', '1885'],
      ['@I11@', 'Anna', '1880'],
      ['@I12@', 'Bertha', '12 MAR 1882'],
      ['@I13@', 'Dora', ''],
      ['@I14@', 'Emil', '3 JAN 1882'],
    ];
    for (const [id, given, datum] of kinder) {
      const k = makePerson(id, { given, surname: 'Meyer' });
      k.birth.date = datum;
      db.individuals.set(id, k);
    }
    const fam = makeFamily('@F1@', { husband: '@I1@', children: kinder.map(([id]) => id) });
    fam.marriage.date = '5 MAY 1879';
    db.families.set('@F1@', fam);
    return db;
  }

  it('die eigene Familie nennt ihr Hochzeitsdatum', () => {
    const model = buildPersonDetail(familieMitKindern(), ctx(), '@I1@')!;
    const eigene = model.families.find((f) => f.role === 'parentIn')!;
    expect(eigene.marriage).toBe('5. Mai 1879');
  });

  it('ohne Heiratsdatum bleibt das Feld leer (kein „unbekannt“-Text)', () => {
    const db = familieMitKindern();
    db.families.get('@F1@')!.marriage.date = '';
    const model = buildPersonDetail(db, ctx(), '@I1@')!;
    expect(model.families.find((f) => f.role === 'parentIn')!.marriage).toBe('');
  });

  it('auch die Herkunftsfamilie nennt das Hochzeitsdatum der Eltern', () => {
    const db = familieMitKindern();
    // Das erste Kind aus Sicht des KINDES betrachten.
    db.individuals.get('@I10@')!.childOf.push({
      familyId: '@F1@', pedigree: 'birth', fatherRel: '', motherRel: '',
      fatherRelSeen: false, motherRelSeen: false, citations: [],
    });
    const model = buildPersonDetail(db, ctx(), '@I10@')!;
    expect(model.families.find((f) => f.role === 'childOf')!.marriage).toBe('5. Mai 1879');
  });

  it('Kinder stehen nach Geburtsdatum, nicht in Dateireihenfolge — taggenau innerhalb desselben Jahres', () => {
    const model = buildPersonDetail(familieMitKindern(), ctx(), '@I1@')!;
    const kinder = model.families.find((f) => f.role === 'parentIn')!.children.map((c) => c.name);
    expect(kinder).toEqual([
      'Anna Meyer',   // 1880
      'Emil Meyer',   // 3 JAN 1882
      'Bertha Meyer', // 12 MAR 1882
      'Clara Meyer',  // 1885
      'Dora Meyer',   // ohne Datum → ans Ende
    ]);
  });

  it('sortiert eine KOPIE — die Kinderliste der Familie selbst bleibt unangetastet (LP-1)', () => {
    const db = familieMitKindern();
    const vorher = [...db.families.get('@F1@')!.children];
    buildPersonDetail(db, ctx(), '@I1@');
    expect(db.families.get('@F1@')!.children).toEqual(vorher);
  });
});
