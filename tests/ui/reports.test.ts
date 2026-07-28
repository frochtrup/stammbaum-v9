// tests/ui/reports.test.ts — die fünf §4-Druck-Report-Builder dieses Bauabschnitts
// (BL-170…174, Spec 20 §4). Reine Renderfunktionen über das Modell → headless goldfile-
// testbar (kein DOM, injiziertes Erstell-Datum, TST-3). Jeder Test prüft die tragende
// Struktur der Ausgabe, nicht nur „läuft durch".
import { describe, expect, it } from 'vitest';
import { makeDatabase, makePerson, makeFamily, makeEvent, makeSource, makeCitation } from '../../core/model';
import { makeLogEntry } from '../../core/research';
import type { ChildLink, Database } from '../../core/model/types';
import {
  buildAncestorList,
  buildFamilyGroupSheet,
  buildBibliography,
  buildResearchLogReport,
  buildDAbovilleReport,
  buildRelationshipProof,
} from '../../ui/views/reports/index';

const ON = '27. Juli 2026';

function childLink(familyId: string): ChildLink {
  return { familyId, pedigree: 'birth', fatherRel: '', motherRel: '', fatherRelSeen: false, motherRelSeen: false, citations: [] };
}

/** Kleiner Stammbaum: Otto (I1) mit Eltern Hans/Anna (F1), Ehe mit Berta (F2), Kind Carl (I5). */
function makeTree(): Database {
  const db = makeDatabase();
  db.individuals.set('I1', makePerson('I1', {
    given: 'Otto', surname: 'Meyer', sex: 'M',
    birth: makeEvent('BIRT', { date: '1850', place: 'Detmold' }),
    death: makeEvent('DEAT', { date: '1920', place: 'Lippe' }),
    childOf: [childLink('F1')], parentIn: ['F2'],
  }));
  db.individuals.set('I2', makePerson('I2', {
    given: 'Hans', surname: 'Meyer', sex: 'M',
    birth: makeEvent('BIRT', { date: '1820' }), parentIn: ['F1'],
  }));
  db.individuals.set('I3', makePerson('I3', {
    given: 'Anna', surname: 'Schmidt', sex: 'F',
    birth: makeEvent('BIRT', { date: '1825' }), parentIn: ['F1'],
  }));
  db.individuals.set('I4', makePerson('I4', { given: 'Berta', surname: 'Klein', sex: 'F', parentIn: ['F2'] }));
  db.individuals.set('I5', makePerson('I5', {
    given: 'Carl', surname: 'Meyer', sex: 'M',
    birth: makeEvent('BIRT', { date: '1880' }), childOf: [childLink('F2')],
  }));
  db.families.set('F1', makeFamily('F1', { husband: 'I2', wife: 'I3', children: ['I1'] }));
  db.families.set('F2', makeFamily('F2', {
    husband: 'I1', wife: 'I4', children: ['I5'],
    marriage: makeEvent('MARR', { date: '1878', place: 'Detmold' }),
  }));
  return db;
}

describe('buildAncestorList (BL-170, Ahnenliste)', () => {
  const html = buildAncestorList(makeTree(), 'I1', ON);

  it('rendert Titel, Proband und Meta-Zeile', () => {
    expect(html).toContain('<title>Ahnenliste</title>');
    expect(html).toContain('Otto Meyer');
    expect(html).toContain('3 Vorfahren in 2 Generationen');
    expect(html).toContain('Erstellt 27. Juli 2026');
  });

  it('nummeriert nach Kekulé (Proband 1, Vater 2, Mutter 3) mit Eltern-Verweisen', () => {
    expect(html).toContain('<td class="ahnen-nr">1</td>');
    expect(html).toContain('Hans Meyer');
    expect(html).toContain('Anna Schmidt');
    // Der Proband verweist auf Vater 2 / Mutter 3.
    expect(html).toContain('<span class="parent-ref">2</span>');
    expect(html).toContain('<span class="parent-ref">3</span>');
  });

  it('gruppiert generationsweise', () => {
    expect(html).toContain('I. Generation – Proband/in');
    expect(html).toContain('II. Generation – Eltern');
  });

  it('ist deterministisch bei gleichem Eingabe-Datum', () => {
    expect(buildAncestorList(makeTree(), 'I1', ON)).toBe(html);
  });
});

describe('buildFamilyGroupSheet (BL-171, Familienbogen)', () => {
  const html = buildFamilyGroupSheet(makeTree(), 'I1', ON);

  it('zeigt persönliche Daten mit Lebensspanne', () => {
    expect(html).toContain('<title>Familienbogen</title>');
    expect(html).toContain('Otto Meyer (*1850 †1920)');
    expect(html).toContain('1850, Detmold');
    expect(html).toContain('männlich');
  });

  it('listet Eltern, Ehe und Kinder', () => {
    expect(html).toContain('Hans Meyer');
    expect(html).toContain('Anna Schmidt');
    expect(html).toContain('Berta Klein');
    expect(html).toContain('Heirat: 1878, Detmold');
    expect(html).toContain('Kinder: Carl Meyer *1880');
  });
});

describe('buildBibliography (BL-172, Quellenverzeichnis)', () => {
  function withSources(): Database {
    const db = makeTree();
    db.sources.set('@S1@', makeSource('@S1@', { title: 'Kirchenbuch Detmold', author: 'Meyer, Karl', date: '1901' }));
    db.sources.set('@S2@', makeSource('@S2@', { title: 'Ungenutzte Quelle' }));
    const p = db.individuals.get('I1')!;
    p.topLevelCitations = [makeCitation('@S1@', { page: '12' })];
    return db;
  }
  const html = buildBibliography(withSources(), ON);

  it('zählt Belege je Quelle und markiert Orphans (0 Zitate)', () => {
    expect(html).toContain('<title>Quellenverzeichnis</title>');
    expect(html).toContain('Kirchenbuch Detmold');
    expect(html).toContain('1 Pers.');
    expect(html).toContain('Ungenutzte Quelle');
    expect(html).toContain('⚠ kein Beleg');
    expect(html).toContain('<strong>1</strong> ohne Beleg');
  });

  it('sortiert nach Autor-Nachname', () => {
    // „Meyer, Karl" (S1) vor der autorenlosen „Ungenutzte Quelle" (S2, Titel als Schlüssel).
    expect(html.indexOf('Kirchenbuch Detmold')).toBeLessThan(html.indexOf('Ungenutzte Quelle'));
  });

  it('rendert die leere Quellenmenge ohne Absturz', () => {
    expect(buildBibliography(makeTree(), ON)).toContain('Keine Quellen vorhanden');
  });
});

describe('buildResearchLogReport (BL-173, Forschungsprotokoll)', () => {
  function withLog(): Database {
    const db = makeTree();
    db.individuals.get('I1')!.researchLog = [
      makeLogEntry({ date: '2026-01-05', query: 'Taufeintrag 1850', result: 'found', note: 'Im Kirchenbuch gefunden' }),
      makeLogEntry({ date: '2026-01-02', query: 'Sterbeeintrag', result: 'notfound' }),
    ];
    return db;
  }
  const html = buildResearchLogReport(withLog(), ON);

  it('gruppiert Protokoll-Einträge personenweise mit Ergebnis-Badges', () => {
    expect(html).toContain('<title>Forschungsprotokoll</title>');
    expect(html).toContain('Otto Meyer');
    expect(html).toContain('Gefunden');
    expect(html).toContain('Nichts gefunden');
    expect(html).toContain('Taufeintrag 1850');
    expect(html).toContain('Im Kirchenbuch gefunden');
    expect(html).toContain('2 Einträge');
  });

  it('rendert den leeren Fall ohne Absturz', () => {
    expect(buildResearchLogReport(makeTree(), ON)).toContain('Keine Protokoll-Einträge');
  });
});

describe('buildDAbovilleReport (BL-174, Nachkommentafel)', () => {
  const html = buildDAbovilleReport(makeTree(), 'I1', ON);

  it('nummeriert Nachkommen nach d’Aboville (1, 1.1)', () => {
    expect(html).toContain('<title>Nachkommentafel</title>');
    expect(html).toContain('Nachkommen von Otto Meyer');
    expect(html).toContain('<span class="nk-num">1</span><span class="nk-name">Otto Meyer</span>');
    expect(html).toContain('<span class="nk-num">1.1</span><span class="nk-name">Carl Meyer</span>');
    expect(html).toContain('1 Nachkommen');
  });

  it('zeigt Ehepartner und Kind-Verweise', () => {
    expect(html).toContain('Berta Klein');
    expect(html).toContain('Heirat 1878, Detmold');
    expect(html).toContain('1 Kind: Nr. 1.1');
  });
});

describe('buildRelationshipProof (BL-175, Verwandtschaftsnachweis)', () => {
  // makeTree: I1 Otto ist Vater von I5 Carl (F2).
  const html = buildRelationshipProof(makeTree(), 'I1', 'I5', ON);

  it('rendert Verdikt, gemeinsamen Vorfahren und markierten Pfad', () => {
    expect(html).toContain('<title>Verwandtschaftsnachweis</title>');
    expect(html).toContain('Otto Meyer &amp; Carl Meyer'); // & im Untertitel korrekt escaped
    expect(html).toContain('<div class="rc-verdict">Vater</div>');
    expect(html).toContain('Gemeinsamer Vorfahre: Otto Meyer');
    // Der gemeinsame Vorfahre (Otto = I1) trägt die ⬡-Markierung.
    expect(html).toContain('rc-common-node');
  });

  it('meldet „Nicht verwandt" ohne gemeinsamen Vorfahren', () => {
    // I4 Berta Klein ist angeheiratet (kein gemeinsamer Vorfahre mit Otto).
    const nr = buildRelationshipProof(makeTree(), 'I1', 'I4', ON);
    expect(nr).toContain('<div class="rc-verdict">Nicht verwandt</div>');
  });
});
