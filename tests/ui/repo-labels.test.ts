// tests/ui/repo-labels.test.ts — kanonische deutsche Archivtyp-Übersetzung (BL-203).
//
// Geschwister von place-labels.test.ts: derselbe Vertrag (EINE Quelle, `Unknown` liefert
// "", Custom-Wert kommt roh durch), nur für `Repository.type` statt `PlaceObject.type`.
// Der Wert reist über GRAMPS `<type>` und GEDCOM `_RTYPE` — die kuratierte Liste hält
// deshalb die ECHTEN GRAMPS-Enum-Werte (gramps/gen/lib/repotype.py), nicht die teils
// erfundenen des v8-Orakels (`Registry`/`Private`/`Website` sind dort keine Enum-Werte).
import { describe, expect, it } from 'vitest';
import {
  REPO_TYPE_LABELS,
  REPO_TYPE_OPTIONS,
  repoTypeLabel,
} from '../../ui/shell/repo-labels';

describe('repoTypeLabel — deutsche Archivtyp-Labels (BL-203)', () => {
  it('übersetzt die GRAMPS-Standardwerte', () => {
    expect(repoTypeLabel('Library')).toBe('Bibliothek');
    expect(repoTypeLabel('Archive')).toBe('Archiv');
    expect(repoTypeLabel('Church')).toBe('Kirche / Pfarramt');
    expect(repoTypeLabel('Cemetery')).toBe('Friedhof');
    expect(repoTypeLabel('Collection')).toBe('Sammlung');
    expect(repoTypeLabel('Web site')).toBe('Webseite');
  });

  it('kein bekannter Typ kommt als englischer Rohwert durch (der eigentliche Punkt)', () => {
    for (const [raw, de] of Object.entries(REPO_TYPE_LABELS)) {
      if (raw === 'Unknown') continue; // eigene Polarität, s. u.
      expect(repoTypeLabel(raw)).toBe(de);
      // „Album" heißt in beiden Sprachen gleich — nur echte Anglizismen prüfen.
      if (raw !== de) expect(repoTypeLabel(raw)).not.toBe(raw);
    }
  });

  it('`Unknown` liefert "" — dieselbe Polarität wie placeTypeLabel (ADR-v9-149)', () => {
    // Der Nicht-Informations-Zustand bekommt kein Dauer-Label; die Zeile blendet aus.
    expect(repoTypeLabel('Unknown')).toBe('');
  });

  it('leerer/fehlender Typ liefert ""', () => {
    expect(repoTypeLabel('')).toBe('');
    expect(repoTypeLabel(null)).toBe('');
    expect(repoTypeLabel(undefined)).toBe('');
  });

  it('unbekannter Custom-Typ kommt roh durch — keine Übersetzung erfunden', () => {
    expect(repoTypeLabel('Sondersammlung Bistum')).toBe('Sondersammlung Bistum');
  });

  it('hält die v8-Erfindungen NICHT als GRAMPS-Werte (Registry/Private/Website)', () => {
    // Sie sind keine Enum-Werte von gramps/gen/lib/repotype.py. Der Bedarf bleibt, aber
    // als deutscher Custom-Wert (Wert === Anzeige), nicht als englischer Pseudo-Standard.
    expect(REPO_TYPE_LABELS['Registry']).toBeUndefined();
    expect(REPO_TYPE_LABELS['Private']).toBeUndefined();
    expect(REPO_TYPE_LABELS['Website']).toBeUndefined();
    expect(REPO_TYPE_LABELS['Standesamt']).toBe('Standesamt');
    expect(REPO_TYPE_LABELS['Privatbesitz']).toBe('Privatbesitz');
  });
});

describe('REPO_TYPE_OPTIONS — die kuratierte Auswahl (auswählen ja, anzeigen nein)', () => {
  it('beginnt mit dem leeren Zustand und bietet jeden Eintrag der Tabelle an', () => {
    expect(REPO_TYPE_OPTIONS[0]).toEqual({ value: '', label: '— kein Typ —' });
    for (const raw of Object.keys(REPO_TYPE_LABELS)) {
      expect(REPO_TYPE_OPTIONS.some((o) => o.value === raw)).toBe(true);
    }
  });

  it('`Unknown` ist WÄHLBAR („Unbekannt"), obwohl es nichts anzeigt', () => {
    // GRAMPS unterscheidet „kein Typ gesetzt" von „ausdrücklich unbekannt"; beide müssen
    // darstellbar bleiben, sonst wandelt ein Speichern den einen still in den anderen
    // (LP-1 — kein stiller Wertverlust über den Editor).
    expect(REPO_TYPE_OPTIONS.find((o) => o.value === 'Unknown')?.label).toBe('Unbekannt');
    expect(repoTypeLabel('Unknown')).toBe('');
  });

  it('kein Options-Label ist ein englischer Rohwert', () => {
    for (const o of REPO_TYPE_OPTIONS) {
      if (!o.value) continue;
      if (o.value === o.label) continue; // Album / Standesamt / Privatbesitz
      expect(o.label).not.toBe(o.value);
    }
  });
});
