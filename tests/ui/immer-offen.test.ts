// tests/ui/immer-offen.test.ts — die zwei Zeilen, die IMMER stehen: Geburt (Person,
// BL-339) und Heirat (Familie, BL-409). Sie liegen bewusst in EINER Datei, weil sie
// zweimal dieselbe Sache sind — und weil genau das beim ersten Mal übersehen wurde: der
// Fix an der Geburt zog die Heirat nicht mit, obwohl das Spec für beide wörtlich „immer
// offen" sagt. Wer eine der beiden anfasst, sieht hier die andere.
//
// DER BEFUND (Nutzer: „Kann Geburt nicht im Personendetail ergänzen"). Keine fehlende
// Funktion, sondern eine nicht ausgeführte Entscheidung: [ADR-v9-62] Punkt 1 hält wörtlich
// fest „Geburt: bleibt immer offen". Der Code schickte `BIRT` trotzdem durch dieselbe
// `isEventPresent`-Schranke wie CHR/DEAT/BURI. Für eine ohne Geburtsdaten importierte
// Person hieß das: keine Geburtszeile — und auch kein Weg, eine anzulegen, denn das
// „+ Ereignis"-Menü führt Taufe/Beruf/Bestattung (nicht BIRT), und `PersonForm` fasst
// Ereignisse grundsätzlich nicht an. Die Geburt war damit die einzige der vier
// Sonder-Angaben ohne JEDEN Erfassungspfad.
//
// WARUM DIE ANDEREN DREI GATED BLEIBEN: CHR und BURI stehen im „+ Ereignis"-Menü; der Tod
// hat die Standing-Pill „☠ Verstorben markieren", die ADR-v9-62 bewusst von der
// Datums-Erfassung getrennt hat (81 % der Sterbeeinträge im Bestand sind nur `DEAT Y`).
// Ein leerer Platzhalter für alle vier wäre die Überladung, vor der derselbe ADR warnt.
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, makeFamily, makeEvent } from '../../core/model';
import { makePlaceRegistry, makeHofRegistry, type PlaceContext } from '../../core/places';
import { buildPersonDetail } from '../../ui/views/person/person-detail-model';
import { buildFamilyDetail } from '../../ui/views/family/family-detail-model';

function ctx(): PlaceContext {
  return { places: makePlaceRegistry(new Map()), hofs: makeHofRegistry(new Map()) };
}

function detailVon(p: ReturnType<typeof makePerson>) {
  const db = makeDatabase();
  db.individuals.set(p.id, p);
  return buildPersonDetail(db, ctx(), p.id)!;
}

describe('Geburtszeile (BL-339, ADR-v9-62 Punkt 1)', () => {
  it('steht auch an einer Person ganz ohne Geburtsdaten', () => {
    const d = detailVon(makePerson('@I1@', { given: 'Anna', surname: 'Bauer' }));
    const geburt = d.events.find((e) => e.tag === 'BIRT');

    expect(geburt, 'ohne diese Zeile gibt es keinen Weg, eine Geburt zu erfassen').toBeDefined();
    expect(geburt!.label).toBe('Geburt');
    expect(geburt!.empty, 'sie ist leer — und genau deshalb da').toBe(true);
  });

  it('die Zeile ist über den regulären ✎-Weg bearbeitbar (sie trägt einen key)', () => {
    const d = detailVon(makePerson('@I1@'));
    expect(d.events.find((e) => e.tag === 'BIRT')!.key).toBe('BIRT');
  });

  it('bringt die Gruppe „Lebensdaten" mit, damit die Zeile eine Heimat hat', () => {
    const d = detailVon(makePerson('@I1@'));
    expect(d.eventGroups.map((g) => g.type)).toContain('Lebensdaten');
  });

  it('Taufe, Tod und Bestattung bleiben unsichtbar, solange sie nichts tragen', () => {
    // Die Gegenprobe zum Test darüber: „immer offen" gilt für die Geburt, nicht für alle
    // vier — sonst stünden an jeder Person vier leere Zeilen.
    const d = detailVon(makePerson('@I1@'));
    expect(d.events.map((e) => e.tag)).toEqual(['BIRT']);
  });

  it('eine belegte Geburt sieht unverändert aus (kein zweiter Platzhalter daneben)', () => {
    const p = makePerson('@I1@');
    p.birth.date = '1 JAN 1900';
    const d = detailVon(p);
    const geburten = d.events.filter((e) => e.tag === 'BIRT');

    expect(geburten).toHaveLength(1);
    expect(geburten[0].empty).toBe(false);
    expect(geburten[0].dateLabel).toBe('1. Januar 1900');
  });

  it('stört die generischen Ereignisse nicht — sie stehen weiterhin alle da', () => {
    const p = makePerson('@I1@');
    p.events.push(makeEvent('OCCU', { value: 'Landwirt' }));
    const d = detailVon(p);
    expect(d.events.map((e) => e.tag)).toEqual(['BIRT', 'OCCU']);
  });
});

// ---------------------------------------------------------------------------------
// Die Geschwister-Stelle (BL-409, Nutzer: „kann kein Heiratsereignis eingeben ... auch
// bei einer bestehenden Familie ohne Heiratsereignis"). Identischer Befund, identische
// Ursache: [20 §2] sagt für die Familie „auf FamilyDetail immer offen ... Heirat", der
// Code schickte MARR trotzdem durch dieselbe `isEventPresent`-Schranke wie ENGA. Eine
// frisch angelegte oder ohne MARR importierte Familie hatte keine Heiratszeile UND
// keinen Weg, eine anzulegen — „+ Ereignis" führt EVEN/CENS/PROP/FACT, und ein
// Familien-Formular gibt es seit BL-382 nicht mehr. Im Realbestand betraf das 50 von
// 987 Familien.
// ---------------------------------------------------------------------------------

function familienDetail(f: ReturnType<typeof makeFamily>) {
  const db = makeDatabase();
  db.families.set(f.id, f);
  return buildFamilyDetail(db, ctx(), f.id)!;
}

describe('Heiratszeile (BL-409, Spec 20 §2 „immer offen")', () => {
  it('steht auch an einer Familie ganz ohne Heiratsdaten', () => {
    const d = familienDetail(makeFamily('@F1@'));
    const heirat = d.events.find((e) => e.key === 'MARR');

    expect(heirat, 'ohne diese Zeile gibt es keinen Weg, eine Heirat zu erfassen').toBeDefined();
    expect(heirat!.label).toBe('Heirat');
    expect(heirat!.empty, 'sie ist leer — und genau deshalb da').toBe(true);
  });

  it('die Verlobung bleibt unsichtbar, solange sie nichts trägt', () => {
    // Gegenprobe wie bei Taufe/Tod/Bestattung: „immer offen" gilt für die Heirat, nicht
    // für beide Sonder-Felder — die Verlobung hat ihren „+ Verlobung"-Pill.
    const d = familienDetail(makeFamily('@F1@'));
    expect(d.events.map((e) => e.key)).toEqual(['MARR']);
  });

  it('eine belegte Heirat sieht unverändert aus (kein zweiter Platzhalter daneben)', () => {
    const f = makeFamily('@F1@');
    f.marriage.date = '1 JAN 1900';
    const d = familienDetail(f);
    const heiraten = d.events.filter((e) => e.key === 'MARR');

    expect(heiraten).toHaveLength(1);
    expect(heiraten[0].empty).toBe(false);
    expect(heiraten[0].dateLabel).toBe('1. Januar 1900');
  });

  it('stört die generischen Ereignisse nicht — sie stehen weiterhin alle da', () => {
    const f = makeFamily('@F1@');
    f.events.push(makeEvent('CENS', { value: 'Zählung 1900' }));
    const d = familienDetail(f);
    expect(d.events.map((e) => e.key)).toEqual(['MARR', 'ev-0']);
  });
});
