// tests/services/entry-template-file.test.ts — JSON-Ex-/Import EINZELNER Erfassungs-
// Vorlagen (BL-354, Spec 20 §2, ADR-v9-264).
//
// Der Fertig-Zustand der Backlog-Zeile wörtlich: „eine exportierte Vorlage wird
// reimportiert und ergibt denselben Typ, ohne den vorhandenen Bestand zu ersetzen (v8
// überschrieb die ganze Liste)". Beide Hälften stehen unten als eigener Fall.
import { describe, expect, it, vi } from 'vitest';
import {
  serializeEntryTemplates,
  parseEntryTemplates,
  mergeImportedTemplates,
  exportEntryTemplates,
  importEntryTemplates,
  ENTRY_TEMPLATES_FILENAME,
} from '../../services/app-data/export-entry-template-file';
import { makeEntryTemplate, BUILTIN_ENTRY_TEMPLATES } from '../../core/model/entry-templates';
import type { EntryTemplate } from '../../core/model/entry-templates';
import type { PickerAdapter } from '../../services/file/types';
import type { FileService } from '../../services/file';

const TAUFE: EntryTemplate = makeEntryTemplate('t-taufe-eigen', {
  label: 'Taufe Ochtrup',
  slots: [
    { role: 'main', field: 'given' },
    { role: 'main', field: 'surname' },
    { role: 'main', field: 'place', event: 'CHR', prefill: 'Ochtrup', prefillMode: 'locked' },
  ],
});

function picker(text: string | null): PickerAdapter {
  return { pick: vi.fn(async () => (text === null ? null : { text, name: ENTRY_TEMPLATES_FILENAME })) } as PickerAdapter;
}

describe('Serialisieren und Lesen', () => {
  it('eine exportierte Vorlage ergibt beim Lesen denselben Typ (Fertig-Zustand, Hälfte 1)', () => {
    const zurueck = parseEntryTemplates(serializeEntryTemplates([TAUFE]));

    expect(zurueck).toHaveLength(1);
    expect(zurueck[0]).toEqual(TAUFE);
  });

  it('schreibt einen versionierten Umschlag, keine nackte Liste', () => {
    const roh = JSON.parse(serializeEntryTemplates([TAUFE]));

    expect(roh.schemaVersion).toBe(1);
    expect(Array.isArray(roh.templates)).toBe(true);
  });

  it('liest auch eine nackte Liste — v8 legte drei Formate derselben Datei an', () => {
    // Read-Tolerance (LP-6): v8 schrieb die Datei mal als `{version, templates}`, mal als
    // bares Array; wer eine alte Datei hat, soll sie nicht verlieren. Geschrieben wird
    // immer nur die eine Form oben.
    const zurueck = parseEntryTemplates(JSON.stringify([TAUFE]));

    expect(zurueck).toHaveLength(1);
    expect(zurueck[0].label).toBe('Taufe Ochtrup');
  });

  it('verwirft Unbrauchbares statt es halb zu übernehmen', () => {
    expect(() => parseEntryTemplates('kein json')).toThrow();
    expect(() => parseEntryTemplates(JSON.stringify({ schemaVersion: 1 }))).toThrow();
  });
});

describe('Zusammenführen mit dem Bestand', () => {
  it('ersetzt den Bestand NICHT, sondern ergänzt ihn (Fertig-Zustand, Hälfte 2)', () => {
    const vorhanden = [makeEntryTemplate('t-alt', { label: 'Sterbefall eigen', slots: [] })];

    const nachher = mergeImportedTemplates(vorhanden, [TAUFE]);

    expect(nachher).toHaveLength(2);
    expect(nachher.map((t) => t.label)).toContain('Sterbefall eigen');
    expect(nachher.map((t) => t.label)).toContain('Taufe Ochtrup');
  });

  it('eine schon bekannte id bekommt eine neue — der lokale Stand wird nie überschrieben', () => {
    const lokal = { ...TAUFE, label: 'Taufe Ochtrup (lokal bearbeitet)' };

    const nachher = mergeImportedTemplates([lokal], [TAUFE]);

    expect(nachher).toHaveLength(2);
    // Die lokale Fassung steht unverändert da …
    expect(nachher.find((t) => t.id === TAUFE.id)?.label).toBe('Taufe Ochtrup (lokal bearbeitet)');
    // … und die importierte daneben, unter einer eigenen id.
    const importiert = nachher.filter((t) => t.id !== TAUFE.id);
    expect(importiert).toHaveLength(1);
    expect(importiert[0].label).toBe('Taufe Ochtrup');
  });

  it('kollidiert auch mit einer MITGELIEFERTEN id nicht', () => {
    // Eine mitgelieferte Vorlage ist nicht überschreibbar (ADR-v9-264 E8) — eine
    // importierte Datei darf ihre id also erst recht nicht besetzen.
    const gebaut = BUILTIN_ENTRY_TEMPLATES[0];

    const nachher = mergeImportedTemplates([], [gebaut], [gebaut.id]);

    expect(nachher).toHaveLength(1);
    expect(nachher[0].id).not.toBe(gebaut.id);
  });
});

describe('Datei rein und raus', () => {
  it('exportiert durch dasselbe Rohr wie die übrigen Dateien (INV-FILE-2/3)', async () => {
    const exportToFile: FileService['exportToFile'] = vi.fn(async () => ({
      ok: true,
      tier: 'download' as const,
    }));
    const fileService = { exportToFile } as unknown as FileService;

    const res = await exportEntryTemplates(fileService, [TAUFE]);

    expect(res.ok).toBe(true);
    expect(vi.mocked(exportToFile)).toHaveBeenCalledTimes(1);
    const [text, name, mime] = vi.mocked(exportToFile).mock.calls[0];
    expect(name).toBe(ENTRY_TEMPLATES_FILENAME);
    expect(mime).toBe('application/json');
    // `exportToFile` nimmt Text ODER Bytes — hier ist es Text, und das ist die Aussage.
    expect(typeof text).toBe('string');
    expect(parseEntryTemplates(text as string)[0]).toEqual(TAUFE);
  });

  it('der Dateiname folgt dem Vorlagennamen, damit mehrere unterscheidbar sind', async () => {
    const exportToFile: FileService['exportToFile'] = vi.fn(async () => ({
      ok: true,
      tier: 'download' as const,
    }));
    const fileService = { exportToFile } as unknown as FileService;

    await exportEntryTemplates(fileService, [TAUFE], 'Taufe Ochtrup');

    expect(vi.mocked(exportToFile).mock.calls[0][1]).toBe('vorlage-taufe-ochtrup.json');
  });

  it('ein abgebrochener Picker ist kein Fehler und kein Import', async () => {
    expect(await importEntryTemplates(picker(null))).toBeNull();
  });

  it('liest die gewählte Datei über denselben Picker wie jeder andere Import', async () => {
    const p = picker(serializeEntryTemplates([TAUFE]));

    const gelesen = await importEntryTemplates(p);

    expect(gelesen).not.toBeNull();
    expect(gelesen).toHaveLength(1);
    expect(gelesen![0]).toEqual(TAUFE);
  });
});
