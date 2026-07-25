// tests/ui/app-state-gramps.test.ts — BL-139: der GRAMPS-Ladepfad der Schale. AppState
// hält seit BL-139 zwei Formate; die riskante neue Logik ist der format-bewusste
// Auto-Save-Serializer + die GRAMPS-Projektion (loadGrampsDoc/buildGrampsDoc/docFormat).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAppState } from '../../ui/shell/app-state.svelte';
import { parseGedcom, parseXMLText, buildXMLText } from '../../core/interop';

const grampsXml = readFileSync(join(__dirname, '../fixtures/events-mini.small.gramps'), 'utf8');

describe('AppState — GRAMPS-Format (BL-139)', () => {
  it('loadGrampsDoc setzt docFormat=gramps und macht die db sichtbar', () => {
    const appState = createAppState();
    const { db, doc } = parseXMLText(grampsXml);
    appState.loadGrampsDoc(db, 'Unsere Familie.gramps', doc);

    expect(appState.docFormat).toBe('gramps');
    expect(appState.fileName).toBe('Unsere Familie.gramps');
    expect(appState.db.individuals.get('I0001')?.given).toBe('Max');
    expect(appState.db.individuals.get('I0001')?.birth.date).toBe('15 MAR 1901');
  });

  it('serialize() liefert im GRAMPS-Modus XML (nicht GEDCOM) und round-trippt unverändert', () => {
    const appState = createAppState();
    const parsed = parseXMLText(grampsXml);
    appState.loadGrampsDoc(parsed.db, 'x.gramps', parsed.doc);

    const text = appState.serialize();
    expect(text.trimStart()).toMatch(/^<\?xml/);
    // Unveränderter Stand: byte-treu gegenüber der reinen Passthrough-Ausgabe (INV-PT).
    expect(text).toBe(buildXMLText(parsed.doc));
  });

  it('buildGrampsDoc projiziert einen Personen-Edit in den XML-Baum', () => {
    const appState = createAppState();
    const parsed = parseXMLText(grampsXml);
    appState.loadGrampsDoc(parsed.db, 'x.gramps', parsed.doc);

    const p = appState.db.individuals.get('I0001')!;
    appState.savePerson({ ...p, given: 'Moritz' });

    const xml = buildXMLText(appState.buildGrampsDoc());
    expect(xml).toContain('<first>Moritz</first>');
    expect(xml).not.toContain('<first>Max</first>');
  });

  it('ein anschließender GEDCOM-Load stellt docFormat zurück (serialize wird wieder GEDCOM)', () => {
    const appState = createAppState();
    appState.loadGrampsDoc(parseXMLText(grampsXml).db, 'x.gramps', parseXMLText(grampsXml).doc);
    expect(appState.docFormat).toBe('gramps');

    const ged = parseGedcom('0 HEAD\n1 SOUR X\n0 @I1@ INDI\n1 NAME Anna /Test/\n0 TRLR\n');
    appState.loadDatabase(ged.db, 'anna.ged', ged.roots);

    expect(appState.docFormat).toBe('gedcom');
    expect(appState.serialize()).toMatch(/^0 HEAD/);
  });
});
