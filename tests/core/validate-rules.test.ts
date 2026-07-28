// Regeltests der Validierungs-Engine (Spec 20 §3).
//
// Jede Regel der Registry hat hier mindestens einen Treffer- UND einen Nicht-Treffer-Fall.
// Der Nicht-Treffer ist der wichtigere Teil: eine Regel, die immer anschlägt, wäre in
// einem reinen Treffer-Test genauso grün.
import { describe, expect, it } from 'vitest';
import { runValidation, defaultConfig, RULES, type RuleId } from '../../core/validate/index';
import { makeEvent } from '../../core/model/index';
import { makeHypothesis, makeTask } from '../../core/research/index';
import {
  cite,
  dbWith,
  familyTriple,
  familyWith,
  hof,
  personWith,
  place,
} from './validate-fixtures';
import type { Database } from '../../core/model/types';
import type { ValidationConfig } from '../../core/validate/index';

/** Alle Regeln ausser den genannten abschalten — isoliert die Regel unter Test. */
function only(rule: RuleId, patch: Partial<ValidationConfig> = {}): ValidationConfig {
  const base = defaultConfig();
  return {
    ...base,
    disabled: new Set(RULES.map((r) => r.id).filter((id) => id !== rule)),
    ...patch,
  };
}

function texts(db: Database, rule: RuleId, patch: Partial<ValidationConfig> = {}): string[] {
  return runValidation(db, only(rule, patch)).map((f) => f.text);
}

describe('Logische Fehler', () => {
  it('DEATH_BEFORE_BIRTH schlägt an, wenn das Sterbejahr vor dem Geburtsjahr liegt', () => {
    const db = dbWith([personWith('@I1@', { birthDate: '1900', deathDate: '1880' })]);
    expect(texts(db, 'DEATH_BEFORE_BIRTH')).toEqual([
      'Sterbejahr 1880 liegt vor Geburtsjahr 1900',
    ]);
  });

  it('DEATH_BEFORE_BIRTH schweigt bei plausibler Reihenfolge und bei fehlendem Datum', () => {
    const ok = dbWith([personWith('@I1@', { birthDate: '1880', deathDate: '1900' })]);
    expect(texts(ok, 'DEATH_BEFORE_BIRTH')).toEqual([]);
    const undated = dbWith([personWith('@I1@', { birthDate: '1880' })]);
    expect(texts(undated, 'DEATH_BEFORE_BIRTH')).toEqual([]);
  });

  it('EVENT_AFTER_DEATH meldet Taufe und Sonder-Ereignis nach dem Tod', () => {
    const p = personWith('@I1@', { birthDate: '1800', deathDate: '1850' });
    p.chr = makeEvent('CHR', { date: '1860', seen: true });
    p.events = [makeEvent('RESI', { date: '1870', seen: true })];
    const db = dbWith([p]);
    expect(texts(db, 'EVENT_AFTER_DEATH')).toEqual([
      'Taufdatum 1860 nach Sterbejahr 1850',
      'Ereignis RESI (1870) nach Sterbejahr 1850',
    ]);
  });

  it('EVENT_AFTER_DEATH lässt die Bestattung nach dem Tod in Ruhe', () => {
    const p = personWith('@I1@', { birthDate: '1800', deathDate: '1850' });
    p.buri = makeEvent('BURI', { date: '1850', seen: true });
    expect(texts(dbWith([p]), 'EVENT_AFTER_DEATH')).toEqual([]);
  });

  it('MARR_BEFORE_BIRTH meldet beide Gatten getrennt', () => {
    const { db } = familyTriple({ fatherBirth: '1850', motherBirth: '1860', marrDate: '1840' });
    expect(texts(db, 'MARR_BEFORE_BIRTH')).toEqual([
      'Heiratsjahr 1840 liegt vor eigener Geburt 1850',
      'Heiratsjahr 1840 liegt vor eigener Geburt 1860',
    ]);
  });

  it('MARR_BEFORE_BIRTH schweigt bei Heirat nach der Geburt', () => {
    const { db } = familyTriple({ fatherBirth: '1850', motherBirth: '1860', marrDate: '1885' });
    expect(texts(db, 'MARR_BEFORE_BIRTH')).toEqual([]);
  });

  it('MARR_AFTER_DEATH meldet die Heirat nach dem Tod des Mannes', () => {
    const { db } = familyTriple({ fatherBirth: '1800', fatherDeath: '1850', marrDate: '1860' });
    expect(texts(db, 'MARR_AFTER_DEATH')).toEqual([
      'Heiratsjahr 1860 nach Tod des Mannes (1850)',
    ]);
  });

  it('CHILD_BEFORE_PARENT meldet ein Kind, das nicht jünger als die Eltern ist', () => {
    const { db } = familyTriple({ fatherBirth: '1850', motherBirth: '1850', childBirth: '1850' });
    expect(texts(db, 'CHILD_BEFORE_PARENT')).toEqual([
      'Kind Test Person (1850) nicht jünger als Mutter (1850)',
      'Kind Test Person (1850) nicht jünger als Vater (1850)',
    ]);
  });

  it('CHILD_AFTER_FATHER_DEATH duldet das nachgeborene Kind im Folgejahr', () => {
    const nachgeboren = familyTriple({ fatherDeath: '1850', childBirth: '1851' });
    expect(texts(nachgeboren.db, 'CHILD_AFTER_FATHER_DEATH')).toEqual([]);
    const zuSpaet = familyTriple({ fatherDeath: '1850', childBirth: '1853' });
    expect(texts(zuSpaet.db, 'CHILD_AFTER_FATHER_DEATH')).toEqual([
      'Kind Test Person (1853) mehr als 1 Jahr nach Tod des Vaters (1850)',
    ]);
  });

  it('MOTHER_TOO_YOUNG nutzt den konfigurierten Schwellenwert', () => {
    const { db } = familyTriple({ motherBirth: '1850', childBirth: '1862' });
    // Default 14: 12 Jahre ist zu jung.
    expect(texts(db, 'MOTHER_TOO_YOUNG')).toEqual([
      'Zu jung bei Geburt von Test Person: 12 Jahre (Grenze: 14)',
    ]);
    // Auf 10 gesenkt schweigt dieselbe Konstellation.
    const cfg = only('MOTHER_TOO_YOUNG');
    const lowered = { ...cfg, thresholds: { ...cfg.thresholds, minMotherAge: 10 } };
    expect(runValidation(db, lowered)).toEqual([]);
  });
});

describe('Plausibilität', () => {
  it('AGE_OVER_MAX schlägt oberhalb der Altersgrenze an, nicht darunter', () => {
    const alt = dbWith([personWith('@I1@', { birthDate: '1800', deathDate: '1920' })]);
    expect(texts(alt, 'AGE_OVER_MAX')).toEqual([
      'Alter unrealistisch: 120 Jahre (Grenze: 110)',
    ]);
    const normal = dbWith([personWith('@I1@', { birthDate: '1800', deathDate: '1880' })]);
    expect(texts(normal, 'AGE_OVER_MAX')).toEqual([]);
  });

  it('MOTHER_TOO_OLD / FATHER_TOO_OLD melden zu hohe Elternalter', () => {
    const mutter = familyTriple({ motherBirth: '1800', childBirth: '1860' });
    expect(texts(mutter.db, 'MOTHER_TOO_OLD')).toEqual([
      'Alter bei Geburt von Test Person: 60 Jahre (Grenze: 55)',
    ]);
    const vater = familyTriple({ fatherBirth: '1800', childBirth: '1890' });
    expect(texts(vater.db, 'FATHER_TOO_OLD')).toEqual([
      'Alter bei Geburt von Test Person: 90 Jahre (Grenze: 80)',
    ]);
  });

  it('FATHER_TOO_YOUNG meldet zu junge Väter', () => {
    const { db } = familyTriple({ fatherBirth: '1850', childBirth: '1862' });
    expect(texts(db, 'FATHER_TOO_YOUNG')).toEqual([
      'Zu jung bei Geburt von Test Person: 12 Jahre (Grenze: 14)',
    ]);
  });

  it('Elternalter-Regeln schweigen, wenn das Kind nicht jünger ist (→ CHILD_BEFORE_PARENT)', () => {
    // Sonst erzeugte EIN Datenfehler zwei Befunde in zwei Regeln.
    const { db } = familyTriple({ motherBirth: '1860', childBirth: '1850' });
    expect(texts(db, 'MOTHER_TOO_YOUNG')).toEqual([]);
    expect(texts(db, 'MOTHER_TOO_OLD')).toEqual([]);
  });

  it('MARR_TOO_YOUNG meldet zu junge Gatten, aber nicht die Heirat vor der Geburt', () => {
    const jung = familyTriple({ fatherBirth: '1850', marrDate: '1860' });
    expect(texts(jung.db, 'MARR_TOO_YOUNG')).toEqual([
      'Heiratsalter Mann: 10 Jahre (Grenze: 14)',
    ]);
    const vorGeburt = familyTriple({ fatherBirth: '1850', marrDate: '1840' });
    expect(texts(vorGeburt.db, 'MARR_TOO_YOUNG')).toEqual([]);
  });

  it('MISSING_SURNAME und MISSING_SEX prüfen getrennte Felder', () => {
    const ohneName = dbWith([personWith('@I1@', { surname: '  ' })]);
    expect(texts(ohneName, 'MISSING_SURNAME')).toEqual(['Nachname fehlt']);
    const ohneSex = dbWith([personWith('@I1@', { sex: 'U' })]);
    expect(texts(ohneSex, 'MISSING_SEX')).toEqual(['Geschlecht unbekannt']);
    const vollstaendig = dbWith([personWith('@I1@')]);
    expect(texts(vollstaendig, 'MISSING_SURNAME')).toEqual([]);
    expect(texts(vollstaendig, 'MISSING_SEX')).toEqual([]);
  });

  it('MANY_CHILDREN schlägt oberhalb der Grenze an', () => {
    const kinder = Array.from({ length: 16 }, (_, i) => personWith(`@C${i}@`));
    const f = familyWith('@F1@', { husband: '@I1@', children: kinder.map((k) => k.id) });
    const db = dbWith([personWith('@I1@'), ...kinder], [f]);
    expect(texts(db, 'MANY_CHILDREN')).toEqual([
      'Ungewöhnlich viele Kinder: 16 (Grenze: 15)',
    ]);
  });

  it('MULTI_FAMC meldet mehr als eine Herkunftsfamilie', () => {
    const p = personWith('@I1@');
    const link = (familyId: string) => ({
      familyId, pedigree: '' as const, fatherRel: '', motherRel: '',
      fatherRelSeen: false, motherRelSeen: false, citations: [],
    });
    p.childOf = [link('@F1@'), link('@F2@')];
    expect(texts(dbWith([p]), 'MULTI_FAMC')).toEqual([
      '2 Herkunftsfamilien eingetragen (erwartet: max. 1)',
    ]);
  });
});

describe('Vollständigkeit', () => {
  it('MISSING_BIRTH schweigt, wenn wenigstens die Taufe datiert ist', () => {
    const ohne = dbWith([personWith('@I1@')]);
    expect(texts(ohne, 'MISSING_BIRTH')).toEqual(['Geburtsdatum/-taufe fehlt']);
    const nurTaufe = personWith('@I1@');
    nurTaufe.chr = makeEvent('CHR', { date: '1850', seen: true });
    expect(texts(dbWith([nurTaufe]), 'MISSING_BIRTH')).toEqual([]);
  });

  it('MISSING_BIRTHPLACE/MISSING_DEATHPLACE greifen nur bei bekanntem Datum', () => {
    const mitDatum = personWith('@I1@', { birthDate: '1850', deathDate: '1900' });
    expect(texts(dbWith([mitDatum]), 'MISSING_BIRTHPLACE')).toEqual(['Geburtsort fehlt']);
    expect(texts(dbWith([mitDatum]), 'MISSING_DEATHPLACE')).toEqual(['Sterbeort fehlt']);
    // Ohne Datum ist der fehlende Ort keine Lücke, sondern schlicht kein Ereignis.
    const ohneDatum = personWith('@I1@');
    expect(texts(dbWith([ohneDatum]), 'MISSING_BIRTHPLACE')).toEqual([]);
    // Mit Ort schweigt die Regel ebenfalls.
    const mitOrt = personWith('@I1@', { birthDate: '1850' });
    mitOrt.birth = makeEvent('BIRT', { date: '1850', place: 'Münster', seen: true });
    expect(texts(dbWith([mitOrt]), 'MISSING_BIRTHPLACE')).toEqual([]);
  });

  it('MISSING_GIVEN meldet nur bei vorhandenem Nachnamen', () => {
    const nurNachname = dbWith([personWith('@I1@', { given: '' })]);
    expect(texts(nurNachname, 'MISSING_GIVEN')).toEqual(['Vorname fehlt']);
    const garNichts = dbWith([personWith('@I1@', { given: '', surname: '' })]);
    expect(texts(garNichts, 'MISSING_GIVEN')).toEqual([]);
  });

  it('MISSING_MARRDATE greift nur, wenn beide Gatten bekannt sind', () => {
    const beide = familyTriple({});
    expect(texts(beide.db, 'MISSING_MARRDATE')).toEqual(['Heiratsdatum fehlt']);
    const einer = dbWith([personWith('@I1@')], [familyWith('@F1@', { husband: '@I1@' })]);
    expect(texts(einer, 'MISSING_MARRDATE')).toEqual([]);
  });

  it('MISSING_QUAY meldet nur bei vorhandenen, aber unbewerteten Quellen', () => {
    const unbewertet = personWith('@I1@', { topLevelCitations: [cite('@S1@')] });
    expect(texts(dbWith([unbewertet]), 'MISSING_QUAY')).toEqual([
      'Quellenangaben ohne Qualitätsbewertung (kein QUAY)',
    ]);
    const bewertet = personWith('@I1@', { topLevelCitations: [cite('@S1@', { quay: 3 })] });
    expect(texts(dbWith([bewertet]), 'MISSING_QUAY')).toEqual([]);
    // Ohne jede Quelle ist NO_SOURCES_AT_ALL zuständig, nicht MISSING_QUAY.
    expect(texts(dbWith([personWith('@I1@')]), 'MISSING_QUAY')).toEqual([]);
  });
});

describe('Quellen', () => {
  it('NO_SOURCES_AT_ALL meldet die quellenlose Person', () => {
    expect(texts(dbWith([personWith('@I1@')]), 'NO_SOURCES_AT_ALL')).toEqual([
      'Keine Quellenangabe vorhanden',
    ]);
    const mitQuelle = personWith('@I1@', { topLevelCitations: [cite('@S1@')] });
    expect(texts(dbWith([mitQuelle]), 'NO_SOURCES_AT_ALL')).toEqual([]);
  });

  it('BIRTH_AFTER_STAERA greift ab dem Standesamt-Jahr und nur ohne Quelle', () => {
    const nach = dbWith([personWith('@I1@', { birthDate: '1880' })]);
    expect(texts(nach, 'BIRTH_AFTER_STAERA')).toEqual([
      'Geburt 1880 — Standesamtsurkunde suchen',
    ]);
    const davor = dbWith([personWith('@I1@', { birthDate: '1850' })]);
    expect(texts(davor, 'BIRTH_AFTER_STAERA')).toEqual([]);
    const belegt = personWith('@I1@', { birthDate: '1880', topLevelCitations: [cite('@S1@')] });
    expect(texts(dbWith([belegt]), 'BIRTH_AFTER_STAERA')).toEqual([]);
  });

  it('NO_FAM_SOURCES meldet die quellenlose Familie am Anker-Gatten', () => {
    const { db, family, father } = familyTriple({});
    const findings = runValidation(db, only('NO_FAM_SOURCES'));
    expect(findings).toHaveLength(1);
    expect(findings[0].text).toBe('Familie ohne Quellenangabe');
    expect(findings[0].personId).toBe(father.id);
    expect(findings[0].familyId).toBe(family.id);
  });

  it('ORPHAN_CITATION meldet Quellbezüge auf fehlende Quellen an Person UND Familie', () => {
    const p = personWith('@I1@', { topLevelCitations: [cite('@S_WEG@')] });
    const f = familyWith('@F1@', { husband: p.id, citations: [cite('@S_AUCH_WEG@')] });
    p.parentIn = [f.id];
    expect(texts(dbWith([p], [f]), 'ORPHAN_CITATION')).toEqual([
      'Quellbezug auf nicht vorhandene Quelle: @S_WEG@',
      'Quellbezug auf nicht vorhandene Quelle: @S_AUCH_WEG@',
    ]);
  });

  it('ORPHAN_CITATION schweigt, wenn die Quelle existiert', () => {
    const p = personWith('@I1@', { topLevelCitations: [cite('@S1@')] });
    const db = dbWith([p]);
    db.sources.set('@S1@', {
      id: '@S1@', abbr: '', title: 'Kirchenbuch', author: '', date: '', publisher: '',
      text: '', repo: '', callNumber: '', callMedia: '', dataEvents: [], externalRefs: [],
      media: [], lastChanged: '',
    });
    expect(texts(db, 'ORPHAN_CITATION')).toEqual([]);
  });

  it('MISSING_EVAL und OPEN_HYPO sind ab Werk deaktiviert (Spec 20 §3)', () => {
    const p = personWith('@I1@', { topLevelCitations: [cite('@S1@')] });
    p.hypotheses = [makeHypothesis('h1', { created: '2026-01-01', text: 'offen' })];
    const findings = runValidation(dbWith([p]), defaultConfig());
    expect(findings.map((f) => f.rule)).not.toContain('MISSING_EVAL');
    expect(findings.map((f) => f.rule)).not.toContain('OPEN_HYPO');
  });

  it('MISSING_EVAL meldet unbewertete Quellen, wenn eingeschaltet', () => {
    const p = personWith('@I1@', { topLevelCitations: [cite('@S1@')] });
    expect(texts(dbWith([p]), 'MISSING_EVAL')).toEqual([
      'Quellenangaben ohne Evidenzbewertung (Quellentyp/Information/Evidenz)',
    ]);
    const bewertet = personWith('@I1@', {
      topLevelCitations: [
        cite('@S1@', { eval: { source: 'original', information: 'primary', evidence: 'direct' } }),
      ],
    });
    expect(texts(dbWith([bewertet]), 'MISSING_EVAL')).toEqual([]);
  });

  it('OPEN_HYPO zählt nur offene Hypothesen, wenn eingeschaltet', () => {
    const p = personWith('@I1@');
    p.hypotheses = [
      makeHypothesis('h1', { created: '2026-01-01', text: 'offen' }),
      makeHypothesis('h2', { created: '2026-01-01', text: 'erledigt', status: 'confirmed' }),
    ];
    expect(texts(dbWith([p]), 'OPEN_HYPO')).toEqual([
      '1 offene Hypothese — Evidenz prüfen/auflösen',
    ]);
  });
});

describe('Vernetzung', () => {
  it('ISOLATED_PERSON meldet die Person ohne jede Familienkante', () => {
    const allein = dbWith([personWith('@I1@')]);
    expect(texts(allein, 'ISOLATED_PERSON')).toEqual([
      'Person ist mit keiner Familie verknüpft (weder Eltern- noch eigene Familie)',
    ]);
    const { db } = familyTriple({});
    expect(texts(db, 'ISOLATED_PERSON')).toEqual([]);
  });

  it('DISCONNECTED_FROM_ROOT findet die vom Probanden aus unerreichbare Person', () => {
    const { db, father } = familyTriple({});
    const fremd = personWith('@I9@');
    db.individuals.set(fremd.id, fremd);
    const findings = runValidation(db, only('DISCONNECTED_FROM_ROOT', { probandId: father.id }));
    expect(findings).toHaveLength(1);
    expect(findings[0].personId).toBe('@I9@');
  });

  it('DISCONNECTED_FROM_ROOT erreicht Geschwister über die gemeinsame Familie', () => {
    const { db, family, father } = familyTriple({});
    const zweitesKind = personWith('@I4@');
    zweitesKind.childOf = [{
      familyId: family.id, pedigree: '', fatherRel: '', motherRel: '',
      fatherRelSeen: false, motherRelSeen: false, citations: [],
    }];
    db.individuals.set(zweitesKind.id, zweitesKind);
    db.families.get(family.id)!.children.push(zweitesKind.id);
    expect(runValidation(db, only('DISCONNECTED_FROM_ROOT', { probandId: father.id }))).toEqual([]);
  });
});

describe('Geo (Orte/Höfe)', () => {
  it('GEO_BBOX meldet Koordinaten ausserhalb des erwarteten Gebiets — an Ort UND Hof', () => {
    const db = dbWith([], [], {
      placeObjects: new Map([['@P1@', place('@P1@', { title: 'Fern', lat: -33.9, long: 151.2 })]]),
      hofObjects: new Map([['@H1@', hof('@H1@', '@P1@', { lat: -33.9, long: 151.2 })]]),
    });
    // Nur der Ort: der Hof hat kein RESI/PROP-Ereignis, GEO_BBOX prüft ihn dennoch —
    // die Wohn-Semantik-Einschränkung gilt allein für HOF_NO_COORD/HOF_FAR.
    expect(texts(db, 'GEO_BBOX')).toHaveLength(2);
  });

  it('GEO_BBOX schweigt bei plausiblen und bei fehlenden Koordinaten', () => {
    const db = dbWith([], [], {
      placeObjects: new Map([
        ['@P1@', place('@P1@', { lat: 51.96, long: 7.63 })],
        ['@P2@', place('@P2@', { lat: null, long: null })],
      ]),
    });
    expect(texts(db, 'GEO_BBOX')).toEqual([]);
  });

  it('PNAME_DATE meldet Startjahr nach Endjahr', () => {
    const db = dbWith([], [], {
      placeObjects: new Map([
        ['@P1@', place('@P1@', { pnames: [{ value: 'Alt', from: 1900, to: 1850 }] })],
      ]),
    });
    expect(texts(db, 'PNAME_DATE')).toEqual(['Name „Alt": Startjahr 1900 > Endjahr 1850']);
  });

  it('PNAME_OVERLAP meldet überlappende Perioden, ignoriert undatierte Varianten', () => {
    const ueberlappend = dbWith([], [], {
      placeObjects: new Map([
        ['@P1@', place('@P1@', {
          pnames: [
            { value: 'Alt', from: 1800, to: 1900 },
            { value: 'Neu', from: 1850, to: 1950 },
          ],
        })],
      ]),
    });
    expect(texts(ueberlappend, 'PNAME_OVERLAP')).toEqual([
      'Namen „Alt" und „Neu" überlappen zeitlich',
    ]);
    // Zwei undatierte Schreibvarianten sind der Normalfall, kein Widerspruch.
    const undatiert = dbWith([], [], {
      placeObjects: new Map([
        ['@P1@', place('@P1@', {
          pnames: [
            { value: 'Muenster', from: null, to: null },
            { value: 'Münster', from: null, to: null },
          ],
        })],
      ]),
    });
    expect(texts(undatiert, 'PNAME_OVERLAP')).toEqual([]);
  });

  it('ENCLOSURE_CYCLE findet den direkten und den indirekten Zirkel', () => {
    const direkt = dbWith([], [], {
      placeObjects: new Map([
        ['@P1@', place('@P1@', { enclosedBy: [{ placeId: '@P1@', from: null, to: null }] })],
      ]),
    });
    expect(texts(direkt, 'ENCLOSURE_CYCLE')).toEqual(['Zirkelreferenz in „Teil von"-Kette']);

    const indirekt = dbWith([], [], {
      placeObjects: new Map([
        ['@P1@', place('@P1@', { enclosedBy: [{ placeId: '@P2@', from: null, to: null }] })],
        ['@P2@', place('@P2@', { enclosedBy: [{ placeId: '@P1@', from: null, to: null }] })],
      ]),
    });
    expect(texts(indirekt, 'ENCLOSURE_CYCLE')).toHaveLength(2);
  });

  it('ENCLOSURE_CYCLE schweigt bei einer gesunden Kette', () => {
    const db = dbWith([], [], {
      placeObjects: new Map([
        ['@P1@', place('@P1@', { enclosedBy: [{ placeId: '@P2@', from: null, to: null }] })],
        ['@P2@', place('@P2@', { enclosedBy: [{ placeId: '@P3@', from: null, to: null }] })],
        ['@P3@', place('@P3@')],
      ]),
    });
    expect(texts(db, 'ENCLOSURE_CYCLE')).toEqual([]);
  });

  it('HOF_NO_COORD meldet nur Höfe mit Wohn-Semantik (RESI/PROP)', () => {
    const bewohnt = personWith('@I1@');
    bewohnt.events = [makeEvent('RESI', { hofId: '@H1@', seen: true })];
    const db = dbWith([bewohnt], [], {
      placeObjects: new Map([['@P1@', place('@P1@')]]),
      hofObjects: new Map([
        ['@H1@', hof('@H1@', '@P1@')],
        // Kein RESI/PROP zeigt hierher → kein Kartenbefund.
        ['@H2@', hof('@H2@', '@P1@')],
      ]),
    });
    const findings = runValidation(db, only('HOF_NO_COORD'));
    expect(findings.map((f) => f.hofId)).toEqual(['@H1@']);
  });

  it('HOF_NO_COORD erkennt den Hof über den eventHofId-Chokepoint (ev.hofId ungesetzt)', () => {
    // Realfall (Nutzer-Fund 2026-07-28): ev.hofId ist laufzeit-only und nach Reload/Import
    // oft null — der Hof wird erst per findByAddr aufgelöst. hofsWithResidence MUSS über den
    // eventHofId-Chokepoint lesen (§11), sonst bleibt der koordinatenlose Hof stumm. Das
    // hofId-vorsetzende Nachbar-Testchen oben maskierte die Lücke.
    const bewohnt = personWith('@I1@');
    bewohnt.events = [makeEvent('RESI', { addr: 'Hauptstr. 1', placeId: '@P1@', seen: true })];
    const db = dbWith([bewohnt], [], {
      placeObjects: new Map([['@P1@', place('@P1@')]]),
      hofObjects: new Map([
        ['@H1@', hof('@H1@', '@P1@', { addrs: [{ value: 'Hauptstr. 1', from: null, to: null }] })],
      ]),
    });
    const findings = runValidation(db, only('HOF_NO_COORD'));
    expect(findings.map((f) => f.hofId)).toEqual(['@H1@']);
  });

  it('HOF_FAR misst die Distanz zum umschließenden Ort', () => {
    const bewohnt = personWith('@I1@');
    bewohnt.events = [makeEvent('RESI', { hofId: '@H1@', seen: true })];
    // Münster (51.96/7.63) vs. Hamburg (53.55/9.99) — rund 250 km.
    const weit = dbWith([bewohnt], [], {
      placeObjects: new Map([['@P1@', place('@P1@', { title: 'Münster', lat: 51.96, long: 7.63 })]]),
      hofObjects: new Map([['@H1@', hof('@H1@', '@P1@', { lat: 53.55, long: 9.99 })]]),
    });
    expect(texts(weit, 'HOF_FAR')).toHaveLength(1);
    expect(texts(weit, 'HOF_FAR')[0]).toContain('vom Ort „Münster" entfernt');

    // 2 km entfernt → unauffällig.
    const nah = dbWith([bewohnt], [], {
      placeObjects: new Map([['@P1@', place('@P1@', { title: 'Münster', lat: 51.96, long: 7.63 })]]),
      hofObjects: new Map([['@H1@', hof('@H1@', '@P1@', { lat: 51.97, long: 7.65 })]]),
    });
    expect(texts(nah, 'HOF_FAR')).toEqual([]);
  });
});

describe('Engine-Kontrakte', () => {
  it('ändert die Datenbank nicht (Spec 20 §3: RAM-Bericht, keine Datenänderung)', () => {
    const { db } = familyTriple({ fatherBirth: '1850', childBirth: '1855' });
    const vorher = JSON.stringify([...db.individuals].map(([k, v]) => [k, v.tasks.length]));
    runValidation(db, defaultConfig());
    const nachher = JSON.stringify([...db.individuals].map(([k, v]) => [k, v.tasks.length]));
    expect(nachher).toBe(vorher);
  });

  it('ist deterministisch: zwei Läufe liefern dieselbe Befundfolge', () => {
    const { db } = familyTriple({ fatherBirth: '1850', motherBirth: '1860', childBirth: '1855' });
    const a = runValidation(db, defaultConfig());
    const b = runValidation(db, defaultConfig());
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('sortiert Fehler vor Warnungen vor Hinweisen', () => {
    const { db } = familyTriple({ fatherBirth: '1850', motherBirth: '1860', childBirth: '1840' });
    const sev = runValidation(db, defaultConfig()).map((f) => f.severity);
    const rank = { error: 0, warn: 1, info: 2 };
    for (let i = 1; i < sev.length; i++) {
      expect(rank[sev[i]]).toBeGreaterThanOrEqual(rank[sev[i - 1]]);
    }
  });

  it('eine abgeschaltete Regel erzeugt keinen Befund', () => {
    const db = dbWith([personWith('@I1@', { birthDate: '1900', deathDate: '1880' })]);
    const cfg = defaultConfig();
    expect(runValidation(db, cfg).map((f) => f.rule)).toContain('DEATH_BEFORE_BIRTH');
    const aus = { ...cfg, disabled: new Set([...cfg.disabled, 'DEATH_BEFORE_BIRTH' as RuleId]) };
    expect(runValidation(db, aus).map((f) => f.rule)).not.toContain('DEATH_BEFORE_BIRTH');
  });

  it('jede Regel der Registry hat mindestens ein Prädikat', () => {
    for (const r of RULES) {
      expect(!!(r.person || r.family || r.place || r.hof), `Regel ${r.id} ohne Prädikat`).toBe(true);
    }
  });

  it('Regel-IDs sind eindeutig', () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('withoutAlreadyTasked', () => {
  it('blendet Befunde aus, die bereits als Aufgabe übernommen wurden', async () => {
    const { withoutAlreadyTasked } = await import('../../core/validate/index');
    const p = personWith('@I1@', { birthDate: '1900', deathDate: '1880' });
    const db = dbWith([p]);
    const findings = runValidation(db, only('DEATH_BEFORE_BIRTH'));
    expect(withoutAlreadyTasked(findings, db)).toHaveLength(1);

    p.tasks = [makeTask('t1', { text: findings[0].text, created: '2026-01-01' })];
    expect(withoutAlreadyTasked(findings, db)).toHaveLength(0);
  });
});
