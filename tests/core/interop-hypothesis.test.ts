// tests/core/interop-hypothesis.test.ts — Parse + Write-Back für Hypothesis an INDI/FAM
// (Spec 12 §4 Wire-Format `_HYPO`/`_ID`/`_HSTAT`/`_HWGT`/`_DATE`/SOUR(+PAGE)/`_RATIO`/`_CONCL`;
//  Spec 13 §2.3).
//
// Verriegelt: mehrere wiederholte `2 SOUR`(+`3 PAGE`)-Paare → evidence[] korrekt zusammengesetzt;
// `_REPO_MODELLED`-Falle (kein Doppelschreiben); Reihenfolge-Treue.

import { describe, it, expect } from 'vitest';
import { parseGedcom, serializeGedcom, applyDatabaseToRoots } from '../../core/interop';
import { makeHypothesis } from '../../core/research';
import type { ParsedGedcom } from '../../core/interop';

function serializeAfterWriteBack(doc: ParsedGedcom): string {
  return serializeGedcom({ db: doc.db, roots: applyDatabaseToRoots(doc.db, doc.roots) });
}

// INDI: ein _HYPO mit ZWEI evidence-Items (SOUR+PAGE) + mehrzeiliger _RATIO/_CONCL + Passthrough.
// FAM: ein _HYPO ohne evidence.
const FIXTURE = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '0 @I1@ INDI',
  '1 NAME Max /Muster/',
  '1 _FOO unbekannt bleibt Passthrough',
  '1 _HYPO Max ist Sohn von Anton Muster',
  '2 _ID h_aaa',
  '2 _HSTAT open',
  '2 _HWGT high',
  '2 _DATE 2026-07-01',
  '2 SOUR @S5@',
  '3 PAGE S. 12',
  '2 SOUR @S6@',
  '3 PAGE Bl. 3r',
  '2 _RATIO Namensgleichheit und Ort',
  '3 CONT plus Taufpate',
  '2 _CONCL noch offen',
  '1 _HYPO Zweite Hypothese ohne Evidenz',
  '2 _ID h_bbb',
  '2 _HSTAT rejected',
  '2 _HWGT low',
  '0 @F1@ FAM',
  '1 HUSB @I1@',
  '1 _HYPO Ehe war 1845 in Ochtrup',
  '2 _ID h_ccc',
  '2 _HSTAT confirmed',
  '2 _HWGT medium',
  '2 _DATE 2026-07-03',
  '2 SOUR @S7@',
  '3 PAGE fol. 8',
  '0 TRLR',
].join('\n');

describe('interop hypothesis — Parse', () => {
  it('parst _HYPO auf INDI/FAM inkl. evidence[] aus mehreren SOUR/PAGE-Paaren', () => {
    const { db } = parseGedcom(FIXTURE);
    const p = db.individuals.get('@I1@')!;
    expect(p.hypotheses).toEqual([
      {
        id: 'h_aaa', text: 'Max ist Sohn von Anton Muster', status: 'open', weight: 'high',
        created: '2026-07-01',
        evidence: [{ sourceId: '@S5@', page: 'S. 12' }, { sourceId: '@S6@', page: 'Bl. 3r' }],
        rationale: 'Namensgleichheit und Ort\nplus Taufpate', conclusion: 'noch offen',
      },
      {
        id: 'h_bbb', text: 'Zweite Hypothese ohne Evidenz', status: 'rejected', weight: 'low',
        created: '', evidence: [], rationale: '', conclusion: '',
      },
    ]);
    const f = db.families.get('@F1@')!;
    expect(f.hypotheses).toEqual([
      {
        id: 'h_ccc', text: 'Ehe war 1845 in Ochtrup', status: 'confirmed', weight: 'medium',
        created: '2026-07-03', evidence: [{ sourceId: '@S7@', page: 'fol. 8' }],
        rationale: '', conclusion: '',
      },
    ]);
  });

  it('unbekanntes _HSTAT/_HWGT fällt auf open/medium zurück', () => {
    const src = [
      '0 HEAD', '1 GEDC', '2 VERS 5.5.1',
      '0 @I1@ INDI',
      '1 _HYPO x',
      '2 _HSTAT quatsch',
      '2 _HWGT quatsch',
      '0 TRLR',
    ].join('\n');
    const { db } = parseGedcom(src);
    const h = db.individuals.get('@I1@')!.hypotheses[0];
    expect(h.status).toBe('open');
    expect(h.weight).toBe('medium');
  });
});

describe('interop hypothesis — Write-Back Roundtrip', () => {
  it('nicht-mutierender Roundtrip ist byte-identisch (_HYPO NICHT doppelt)', () => {
    const doc = parseGedcom(FIXTURE);
    const out = serializeAfterWriteBack(doc);
    expect(out).toBe(FIXTURE.split('\n').join('\r\n'));
    expect(out.match(/_HYPO Max ist Sohn von Anton Muster/g)!.length).toBe(1);
  });

  it('out1 === out2 (Idempotenz, RT-1)', () => {
    const doc1 = parseGedcom(FIXTURE);
    const out1 = serializeAfterWriteBack(doc1);
    const out2 = serializeAfterWriteBack(parseGedcom(out1));
    expect(out2).toBe(out1);
  });

  it('unveränderter Record bleibt die IDENTISCHE GedNode-Referenz', () => {
    const doc = parseGedcom(FIXTURE);
    const before = doc.roots.find((r) => r.xref === '@I1@')!;
    const after = applyDatabaseToRoots(doc.db, doc.roots).find((r) => r.xref === '@I1@')!;
    expect(after).toBe(before);
  });
});

describe('interop hypothesis — Mutationen überleben Roundtrip', () => {
  it('Hypothese hinzufügen: neuer _HYPO-Block mit evidence nach Re-Parse vorhanden', () => {
    const doc = parseGedcom(FIXTURE);
    doc.db.individuals.get('@I1@')!.hypotheses.push(
      makeHypothesis('h_new', {
        text: 'Neue Vermutung', status: 'open', weight: 'medium', created: '2026-07-05',
        evidence: [{ sourceId: '@S8@', page: 'S. 1' }], rationale: 'weil', conclusion: '',
      }),
    );
    const round = parseGedcom(serializeAfterWriteBack(doc));
    const hyp = round.db.individuals.get('@I1@')!.hypotheses;
    expect(hyp.length).toBe(3);
    expect(hyp[2]).toEqual({
      id: 'h_new', text: 'Neue Vermutung', status: 'open', weight: 'medium', created: '2026-07-05',
      evidence: [{ sourceId: '@S8@', page: 'S. 1' }], rationale: 'weil', conclusion: '',
    });
    expect(serializeAfterWriteBack(doc)).toContain('_FOO unbekannt bleibt Passthrough');
  });

  it('Hypothese ändern (status/conclusion): überlebt Roundtrip', () => {
    const doc = parseGedcom(FIXTURE);
    const h = doc.db.individuals.get('@I1@')!.hypotheses[0];
    h.status = 'confirmed';
    h.conclusion = 'bestätigt durch Taufeintrag';
    const round = parseGedcom(serializeAfterWriteBack(doc));
    const rh = round.db.individuals.get('@I1@')!.hypotheses[0];
    expect(rh.status).toBe('confirmed');
    expect(rh.conclusion).toBe('bestätigt durch Taufeintrag');
    expect(rh.evidence).toEqual([{ sourceId: '@S5@', page: 'S. 12' }, { sourceId: '@S6@', page: 'Bl. 3r' }]);
  });

  it('Hypothese: evidence hinzufügen überlebt Roundtrip (neues SOUR/PAGE-Paar)', () => {
    const doc = parseGedcom(FIXTURE);
    doc.db.families.get('@F1@')!.hypotheses[0].evidence.push({ sourceId: '@S99@', page: 'S. 2' });
    const round = parseGedcom(serializeAfterWriteBack(doc));
    expect(round.db.families.get('@F1@')!.hypotheses[0].evidence).toEqual([
      { sourceId: '@S7@', page: 'fol. 8' },
      { sourceId: '@S99@', page: 'S. 2' },
    ]);
  });

  it('Hypothese löschen: der _HYPO-Block ist weg, der andere bleibt', () => {
    const doc = parseGedcom(FIXTURE);
    const p = doc.db.individuals.get('@I1@')!;
    p.hypotheses = p.hypotheses.filter((x) => x.id !== 'h_aaa');
    const out = serializeAfterWriteBack(doc);
    expect(out).not.toContain('Max ist Sohn von Anton Muster');
    expect(out).toContain('Zweite Hypothese ohne Evidenz');
    const round = parseGedcom(out);
    const hyp = round.db.individuals.get('@I1@')!.hypotheses;
    expect(hyp.length).toBe(1);
    expect(hyp[0].id).toBe('h_bbb');
    expect(out).toContain('_FOO unbekannt bleibt Passthrough');
  });
});
