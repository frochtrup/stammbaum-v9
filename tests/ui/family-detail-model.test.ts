// tests/ui/family-detail-model.test.ts — Familien-Detail-Projektion (Spec 20 §1.5 [K]):
// anklickbare Mitglieder, Ereignisse, Quellen-Zitate. Reine Funktion, deshalb Unit statt
// Component-Test (TST-5).
import { describe, expect, it } from 'vitest';
import { makeCitation, makeDatabase, makeEvent, makeFamily, makePerson } from '../../core/model';
import { makePlaceRegistry, makeHofRegistry, type PlaceContext } from '../../core/places';
import { buildFamilyDetail } from '../../ui/views/family/family-detail-model';

function emptyContext(): PlaceContext {
  return { places: makePlaceRegistry(new Map()), hofs: makeHofRegistry(new Map()) };
}

describe('buildFamilyDetail — Mitglieder/Ereignisse/Quellen', () => {
  it('gibt null zurück, wenn die id im aktuellen Datenbestand fehlt (definierter Fallback)', () => {
    const db = makeDatabase();
    expect(buildFamilyDetail(db, emptyContext(), '@F999@')).toBeNull();
  });

  it('baut anklickbare Mitgliederzeilen für Ehemann, Ehefrau und Kinder in dieser Reihenfolge', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Otto', surname: 'Bauer' }));
    db.individuals.set('@I2@', makePerson('@I2@', { given: 'Anna', surname: 'Klein' }));
    db.individuals.set('@I3@', makePerson('@I3@', { given: 'Karl', surname: 'Bauer' }));
    db.families.set(
      '@F1@',
      makeFamily('@F1@', { husband: '@I1@', wife: '@I2@', children: ['@I3@'] }),
    );

    const detail = buildFamilyDetail(db, emptyContext(), '@F1@')!;

    expect(detail.members.map((m) => m.role)).toEqual(['husband', 'wife', 'child']);
    expect(detail.members.map((m) => m.name)).toEqual(['Otto Bauer', 'Anna Klein', 'Karl Bauer']);
    expect(detail.label).toBe('Otto Bauer ⚭ Anna Klein');
  });

  it('reicht value/addr eines generischen Ereignisses durch, statt sie stillschweigend zu verwerfen', () => {
    const db = makeDatabase();
    db.individuals.set('@I1@', makePerson('@I1@', { given: 'Otto', surname: 'Bauer' }));
    const family = makeFamily('@F1@', { husband: '@I1@' });
    family.events.push(makeEvent('RESI', { date: '1950', addr: 'Nienborger Damm 1' }));
    db.families.set('@F1@', family);

    const detail = buildFamilyDetail(db, emptyContext(), '@F1@')!;

    expect(detail.events[0].addr).toBe('Nienborger Damm 1');
  });

  it('liefert je Mitgliedszeile eine yearPlaceSummary aus der Geburt (Nachtrag 2026-07-06 [20 §1.5])', () => {
    const db = makeDatabase();
    const husband = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    husband.birth.date = '1 JAN 1900';
    husband.birth.place = 'Ochtrup';
    const child = makePerson('@I3@', { given: 'Karl', surname: 'Bauer' });
    child.birth.date = '1 JAN 1925';
    db.individuals.set('@I1@', husband);
    db.individuals.set('@I3@', child);
    db.families.set('@F1@', makeFamily('@F1@', { husband: '@I1@', children: ['@I3@'] }));

    const detail = buildFamilyDetail(db, emptyContext(), '@F1@')!;

    expect(detail.members[0].summary).toBe('1900, Ochtrup');
    expect(detail.members[1].summary).toBe('1925');
  });

  it('überspringt Mitglieder, deren Person-Id nicht (mehr) existiert', () => {
    const db = makeDatabase();
    db.families.set('@F1@', makeFamily('@F1@', { husband: '@I-gone@' }));

    const detail = buildFamilyDetail(db, emptyContext(), '@F1@')!;

    expect(detail.members).toHaveLength(0);
    expect(detail.label).toBe('Unbekannte Familie');
  });

  it('listet nur tatsächlich vorhandene Sonder-Ereignisse (Heirat/Verlobung)', () => {
    const db = makeDatabase();
    const f = makeFamily('@F1@');
    f.marriage.date = '1 JAN 1920';
    db.families.set('@F1@', f);

    const detail = buildFamilyDetail(db, emptyContext(), '@F1@')!;

    expect(detail.events.map((e) => e.label)).toEqual(['Heirat']);
  });

  it('zeigt bei der EIGENEN Ereigniszeile (Heirat/Verlobung) das VOLLE, lokalisierte Datum, nicht nur das Jahr (INV-UI-9, ADR-v9-64, Regressionstest)', () => {
    const db = makeDatabase();
    const f = makeFamily('@F1@');
    f.marriage.date = '12 MAR 1920';
    f.engagement.date = 'ABT 1918';
    db.families.set('@F1@', f);

    const detail = buildFamilyDetail(db, emptyContext(), '@F1@')!;

    const marriage = detail.events.find((e) => e.label === 'Heirat')!;
    expect(marriage.dateLabel).toBe('12. März 1920');
    const engagement = detail.events.find((e) => e.label === 'Verlobung')!;
    expect(engagement.dateLabel).toBe('ca. 1918');
  });

  it('generische events[]-Einträge zeigen ebenfalls das volle Datum in der eigenen Ereigniszeile', () => {
    const db = makeDatabase();
    const f = makeFamily('@F1@');
    f.events.push(makeEvent('RESI', { date: '5 JUN 1950', addr: 'Nienborger Damm 1' }));
    db.families.set('@F1@', f);

    const detail = buildFamilyDetail(db, emptyContext(), '@F1@')!;

    expect(detail.events[0].dateLabel).toBe('5. Juni 1950');
  });

  it('liefert placeLabel getrennt vom Datum (ADR-v9-80 Punkt 1) — EventLine rendert "Datum, Ort" statt eines vorverknüpften Strings', () => {
    const db = makeDatabase();
    const f = makeFamily('@F1@');
    f.marriage.date = '12 MAR 1920';
    f.marriage.place = 'Ochtrup';
    db.families.set('@F1@', f);

    const detail = buildFamilyDetail(db, emptyContext(), '@F1@')!;

    const marriage = detail.events.find((e) => e.label === 'Heirat')!;
    expect(marriage.dateLabel).toBe('12. März 1920');
    expect(marriage.placeLabel).toBe('Ochtrup');
  });

  it('Mitgliederzeilen (Disambiguierung) bleiben bei Jahr-only, auch wenn das Geburtsdatum Tag+Monat trägt', () => {
    const db = makeDatabase();
    const husband = makePerson('@I1@', { given: 'Otto', surname: 'Bauer' });
    husband.birth.date = '12 MAR 1900';
    db.individuals.set('@I1@', husband);
    db.families.set('@F1@', makeFamily('@F1@', { husband: '@I1@' }));

    const detail = buildFamilyDetail(db, emptyContext(), '@F1@')!;

    expect(detail.members[0].summary).toBe('1900');
  });

  it('reicht Familien-Top-Level-Zitate unverändert durch', () => {
    const db = makeDatabase();
    const f = makeFamily('@F1@');
    f.citations.push(makeCitation('@S1@', { quay: 2 }));
    db.families.set('@F1@', f);

    const detail = buildFamilyDetail(db, emptyContext(), '@F1@')!;

    expect(detail.citations).toHaveLength(1);
    expect(detail.citations[0].sourceId).toBe('@S1@');
  });

  it('reicht Ereignis-Zitate durch (Heirats-Event)', () => {
    const db = makeDatabase();
    const f = makeFamily('@F1@');
    f.marriage.date = '1 JAN 1920';
    f.marriage.citations.push(makeCitation('@S2@', { quay: 3, page: '12' }));
    db.families.set('@F1@', f);

    const detail = buildFamilyDetail(db, emptyContext(), '@F1@')!;

    expect(detail.events[0].citations).toHaveLength(1);
    expect(detail.events[0].citations[0].page).toBe('12');
  });
});

describe('BL-199 — Kind-Verhältnis (PEDI) an der Kind-Zeile', () => {
  function ctx(): PlaceContext {
    return { places: makePlaceRegistry(new Map()), hofs: makeHofRegistry(new Map()) };
  }
  it('adoptiertes Kind → Label "adoptiert"; leibliches → leer', () => {
    const db = makeDatabase();
    const adopt = makePerson('@I1@', { given: 'Kind', surname: 'A', childOf: [{ familyId: '@F1@', pedigree: 'adopted', fatherRel: '', motherRel: '', fatherRelSeen: false, motherRelSeen: false, citations: [] }] });
    const bio = makePerson('@I2@', { given: 'Kind', surname: 'B', childOf: [{ familyId: '@F1@', pedigree: 'birth', fatherRel: '', motherRel: '', fatherRelSeen: false, motherRelSeen: false, citations: [] }] });
    db.individuals.set('@I1@', adopt);
    db.individuals.set('@I2@', bio);
    db.families.set('@F1@', makeFamily('@F1@', { children: ['@I1@', '@I2@'] }));
    const model = buildFamilyDetail(db, ctx(), '@F1@')!;
    const kids = model.members.filter((m) => m.role === 'child');
    expect(kids.find((k) => k.personId === '@I1@')?.pedigree).toBe('adoptiert');
    expect(kids.find((k) => k.personId === '@I2@')?.pedigree).toBe('');
  });
})
