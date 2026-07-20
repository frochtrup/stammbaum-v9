// Kern-Tests des Qualitäts-Dashboards (Spec 20 §1.11g, BL-05).
//
// Das Dashboard rechnet NICHT selbst — es aggregiert die Befunde der Engine (BL-04)
// und zählt daneben direkt am `db` die Vollständigkeits-Merkmale des Lückenradars.
// Beide Hälften werden hier getrennt geprüft: die Aggregation über eingespeiste
// Befunde (unabhängig davon, welche Regel sie erzeugt hat), das Radar über den db.
import { describe, expect, it } from 'vitest';
import { makeEvent } from '../../core/model/index';
import { makeHypothesis } from '../../core/research/index';
import {
  buildQualityDashboard,
  filterFocus,
  type Finding,
  type Severity,
} from '../../core/validate/index';
import { cite, dbWith, personWith } from './validate-fixtures';
import type { Database, PersonId } from '../../core/model/types';

function finding(personId: string | null, severity: Severity, text = 'Befund'): Finding {
  return {
    rule: 'MISSING_BIRTH',
    severity,
    text,
    category: 'kirche',
    personId,
    familyId: null,
    placeId: null,
    hofId: null,
  };
}

/** N Personen ohne jede Angabe — die neutrale Grundmenge für die Zähl-Tests. */
function people(n: number): Database {
  return dbWith(Array.from({ length: n }, (_, i) => personWith(`@I${i + 1}@`)));
}

describe('Vollständigkeits-Score und Ampel', () => {
  it('zählt eine Person mit Fehler UND Warnung nur einmal — als Fehler (schwerster Befund gewinnt)', () => {
    const db = people(4);
    const d = buildQualityDashboard(db, [
      finding('@I1@', 'error'),
      finding('@I1@', 'warn'),
      finding('@I2@', 'warn'),
      finding('@I3@', 'info'),
    ]);
    expect(d.ampel).toEqual({ error: 1, warn: 1, infoOnly: 1, clean: 1 });
    // Die Befund-Summen zählen dagegen jeden Befund einzeln — zwei verschiedene Fragen.
    expect(d.counts).toEqual({ error: 1, warn: 2, info: 1 });
  });

  it('rechnet den Score als Anteil befundfreier Personen', () => {
    const d = buildQualityDashboard(people(5), [finding('@I1@', 'error')]);
    expect(d.total).toBe(5);
    expect(d.cleanPct).toBe(80);
  });

  it('liefert bei leerer Datenbank 0 % statt NaN', () => {
    const d = buildQualityDashboard(people(0), []);
    expect(d.total).toBe(0);
    expect(d.cleanPct).toBe(0);
    expect(d.focus).toEqual([]);
  });

  it('ignoriert Befunde ohne Trägerperson — Orts-/Hof-Befunde gehören in den vollständigen Bericht', () => {
    // v8-Parität (`if (!r.personId) continue;`): Score, Ampel und Brennpunkte sind
    // personbezogen. Ein GEO_BBOX-Befund an einem Ort würde den Nenner sonst
    // stillschweigend verfälschen.
    const d = buildQualityDashboard(people(2), [finding(null, 'error')]);
    expect(d.ampel).toEqual({ error: 0, warn: 0, infoOnly: 0, clean: 2 });
    expect(d.cleanPct).toBe(100);
  });

  it('ignoriert Befunde an Personen ausserhalb der Datenbank', () => {
    const d = buildQualityDashboard(people(2), [finding('@I99@', 'error')]);
    expect(d.ampel.error).toBe(0);
    expect(d.focus).toEqual([]);
  });
});

describe('Lückenradar', () => {
  function bar(db: Database, label: string) {
    return buildQualityDashboard(db, []).radar.find((b) => b.label === label);
  }

  it('wertet die Taufe als Ersatz für ein fehlendes Geburtsdatum', () => {
    const p = personWith('@I1@');
    p.chr = makeEvent('CHR', { date: '1850', seen: true });
    expect(bar(dbWith([p, personWith('@I2@')]), 'Geburts-/Taufdatum')).toMatchObject({
      n: 1,
      base: 2,
      pct: 50,
    });
  });

  it('zählt „Geschlecht bestimmt" nur für M/F, nicht für U', () => {
    const db = dbWith([
      personWith('@I1@', { sex: 'M' }),
      personWith('@I2@', { sex: 'F' }),
      personWith('@I3@', { sex: 'U' }),
    ]);
    expect(bar(db, 'Geschlecht bestimmt')).toMatchObject({ n: 2, base: 3 });
  });

  it('bezieht QUAY- und Evidenz-Balken auf die Personen MIT Quellen, nicht auf alle', () => {
    // Sonst bestraft der Balken das Fehlen von Quellen ein zweites Mal — die Frage
    // lautet „wie gut sind die vorhandenen Quellen belegt", nicht „wie viele gibt es".
    const mitQuay = personWith('@I1@');
    mitQuay.topLevelCitations = [cite('@S1@', { quay: 3 })];
    const ohneQuay = personWith('@I2@');
    ohneQuay.topLevelCitations = [cite('@S1@', { quay: 0 })];
    const ohneQuelle = personWith('@I3@');
    const db = dbWith([mitQuay, ohneQuay, ohneQuelle]);

    expect(bar(db, 'mind. 1 Quelle')).toMatchObject({ n: 2, base: 3 });
    expect(bar(db, 'Quellen mit Bewertung (QUAY)')).toMatchObject({ n: 1, base: 2, pct: 50 });
  });

  it('blendet den Hypothesen-Balken aus, solange keine Hypothese existiert', () => {
    expect(bar(people(3), 'Hypothesen aufgelöst')).toBeUndefined();
  });

  it('bezieht den Hypothesen-Balken auf die Personen MIT Hypothesen', () => {
    // Informiert, ohne zu strafen (v8/ADR-023): wer keine Hypothese hat, taucht weder
    // im Zähler noch im Nenner auf.
    const aufgeloest = personWith('@I1@');
    aufgeloest.hypotheses = [makeHypothesis('@H1@', { text: 'a', status: 'confirmed' })];
    const offen = personWith('@I2@');
    offen.hypotheses = [makeHypothesis('@H2@', { text: 'b', status: 'open' })];
    const db = dbWith([aufgeloest, offen, personWith('@I3@')]);
    expect(bar(db, 'Hypothesen aufgelöst')).toMatchObject({ n: 1, base: 2, pct: 50 });
  });

  it('meldet 0 % statt NaN, wenn die Bezugsmenge eines Balkens leer ist', () => {
    expect(bar(people(2), 'Quellen mit Bewertung (QUAY)')).toMatchObject({ base: 0, pct: 0 });
  });
});

describe('Brennpunkte', () => {
  it('sortiert nach Dringlichkeit: ein Fehler wiegt schwerer als beliebig viele Warnungen', () => {
    const db = people(2);
    const d = buildQualityDashboard(db, [
      finding('@I1@', 'warn', 'w1'),
      finding('@I1@', 'warn', 'w2'),
      finding('@I1@', 'warn', 'w3'),
      finding('@I2@', 'error', 'e1'),
    ]);
    expect(d.focus.map((f) => f.personId)).toEqual(['@I2@', '@I1@']);
  });

  it('hält die Befunde je Person nach Schwere getrennt', () => {
    const d = buildQualityDashboard(people(1), [
      finding('@I1@', 'info', 'i1'),
      finding('@I1@', 'error', 'e1'),
    ]);
    expect(d.focus[0].error.map((f) => f.text)).toEqual(['e1']);
    expect(d.focus[0].info.map((f) => f.text)).toEqual(['i1']);
    expect(d.focus[0].warn).toEqual([]);
  });

  it('trägt Anzeigename und Lebensspanne für die Zeile', () => {
    const p = personWith('@I1@', { given: 'Anna', surname: 'Meier', birthDate: '1850', deathDate: '1920' });
    const d = buildQualityDashboard(dbWith([p]), [finding('@I1@', 'error')]);
    expect(d.focus[0].label).toBe('Anna Meier');
    expect(d.focus[0].life).toBe('✶1850 †1920');
  });

  it('lässt die Lebensspanne leer, wenn beide Jahre fehlen', () => {
    const d = buildQualityDashboard(people(1), [finding('@I1@', 'error')]);
    expect(d.focus[0].life).toBe('');
  });

  it('ist deterministisch: gleiche Eingabe, gleiche Reihenfolge', () => {
    const db = people(3);
    const findings = [finding('@I1@', 'warn'), finding('@I2@', 'warn'), finding('@I3@', 'warn')];
    const a = buildQualityDashboard(db, findings);
    const b = buildQualityDashboard(db, findings);
    expect(a.focus.map((f) => f.personId)).toEqual(b.focus.map((f) => f.personId));
  });
});

describe('filterFocus', () => {
  const db = people(3);
  const d = buildQualityDashboard(db, [
    finding('@I1@', 'error', 'e'),
    finding('@I1@', 'info', 'i'),
    finding('@I2@', 'warn', 'w'),
    finding('@I3@', 'info', 'i3'),
  ]);

  it('„attention" zeigt Fehler und Warnungen, aber keine reinen Hinweis-Personen', () => {
    const rows = filterFocus(d.focus, 'attention');
    expect(rows.map((r) => r.personId)).toEqual(['@I1@', '@I2@']);
    // Der Hinweis-Befund von @I1@ wird in dieser Auswahl auch nicht mitgezeigt.
    expect(rows[0].findings.map((f) => f.text)).toEqual(['e']);
  });

  it('„red" zeigt nur Personen mit Fehlern', () => {
    expect(filterFocus(d.focus, 'red').map((r) => r.personId)).toEqual(['@I1@']);
  });

  it('„all" zeigt alle Personen mit Befunden, Fehler zuerst innerhalb der Zeile', () => {
    const rows = filterFocus(d.focus, 'all');
    expect(rows.map((r) => r.personId)).toEqual(['@I1@', '@I2@', '@I3@']);
    expect(rows[0].findings.map((f) => f.text)).toEqual(['e', 'i']);
  });
});

describe('Projekt-Scope (Spec 20 §1.11g „Respektiert aktives Projekt als Scope")', () => {
  // Die Scope-Herkunft (Forschungsprojekt) ist BL-58; das Dashboard nimmt hier nur die
  // fertige Personenmenge entgegen. Ohne Scope: alle Personen.
  it('schränkt Grundmenge, Radar und Brennpunkte gemeinsam ein', () => {
    const db = people(4);
    const scope = new Set<PersonId>(['@I1@', '@I2@']);
    const d = buildQualityDashboard(db, [finding('@I1@', 'error'), finding('@I3@', 'error')], {
      scope,
    });
    expect(d.total).toBe(2);
    expect(d.cleanPct).toBe(50);
    expect(d.focus.map((f) => f.personId)).toEqual(['@I1@']);
    expect(d.radar[0].base).toBe(2);
  });
});
