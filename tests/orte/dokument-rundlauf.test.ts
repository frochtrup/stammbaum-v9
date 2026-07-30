// tests/orte/dokument-rundlauf.test.ts — INV-ORTE-3 (Spec 22 §4/§9, OE-8).
//
// Das Gegenstück zu `net_delta = 0` auf der Ortsdatei: laden → bearbeiten → speichern →
// erneut laden → identisch. Es gibt dafür einen konkreten Anlass, kein theoretisches
// Bedürfnis — `savePlace`/`saveHof` haben in diesem Projekt schon einmal gar nicht
// zurückgeschrieben, und kein Test hat es gemerkt, weil alle nur prüften, ob der Aufruf
// erfolgte (TST-8, Spec 32 §1).
//
// Läuft headless ohne Browser: alle Ein-/Ausgänge des Dokument-Moduls sind injizierte
// Adapter (Spec 32 §5).
import { describe, expect, it } from 'vitest';
import {
  buildWrapper,
  contentOf,
  newDocument,
  openFromText,
  saveDocument,
  serializeForCompare,
  type OrteContent,
  type OrteDocIO
} from '../../app-orte/orte-doc';
import { PLACES_SCHEMA_VERSION, serializePlacesFileWrapper } from '../../services/places';
import type { FileService } from '../../services/file/file-service';
import type { PickerAdapter } from '../../services/file';
import type { PlacesFileHandleStore } from '../../services/places';
import { place, hof } from '../core/places-fixtures';

/** Sammelt, was der Editor „in die Datei" schreiben würde — der Datei-Ersatz des Tests. */
function makeIO(): OrteDocIO & { written: string[] } {
  const written: string[] = [];
  const handleStore: PlacesFileHandleStore = {
    load: async () => 'handle',
    save: async () => {},
    clear: async () => {}
  };
  const fileService = {
    exportToFile: async (text: string | Uint8Array) => {
      written.push(String(text));
      return { tier: 'fs-handle' as const, ok: true };
    }
  } as unknown as FileService;
  const picker: PickerAdapter = { pick: async () => null };
  return { picker, fileService, handleStore, now: () => 1700000000000, deviceId: () => 'test-device', written };
}

function fixtureText(): string {
  return serializePlacesFileWrapper({
    schemaVersion: PLACES_SCHEMA_VERSION,
    rev: 3,
    device: 'anderes-geraet',
    ts: 1,
    placeObjects: [place('@P1@', { title: 'Ochtrup', type: 'Village' })],
    hofObjects: [hof('_hof_wall33_@P1@', '@P1@', { addrs: [{ value: 'Wall 33', from: null, to: null }] })]
  });
}

describe('Dokument-Rundlauf (INV-ORTE-3)', () => {
  it('laden → speichern → erneut laden ergibt denselben Inhalt', async () => {
    const io = makeIO();
    const opened = openFromText(fixtureText(), 'orte.json');

    const outcome = await saveDocument(io, opened.content, opened.state);
    expect(outcome.saved).toBe(true);
    expect(io.written).toHaveLength(1);

    const reopened = openFromText(io.written[0], 'orte.json');
    expect([...reopened.content.placeObjects.keys()]).toEqual([...opened.content.placeObjects.keys()]);
    expect([...reopened.content.hofObjects.keys()]).toEqual([...opened.content.hofObjects.keys()]);
    expect(reopened.content.placeObjects.get('@P1@')).toEqual(opened.content.placeObjects.get('@P1@'));
    expect(reopened.content.hofObjects.get('_hof_wall33_@P1@')).toEqual(
      opened.content.hofObjects.get('_hof_wall33_@P1@')
    );
  });

  it('eine Bearbeitung überlebt den Rundlauf (nicht nur „kein Fehler beim Speichern")', async () => {
    const io = makeIO();
    const opened = openFromText(fixtureText(), 'orte.json');

    const edited: OrteContent = {
      placeObjects: new Map(opened.content.placeObjects),
      hofObjects: opened.content.hofObjects
    };
    edited.placeObjects.set('@P1@', { ...edited.placeObjects.get('@P1@')!, note: 'geprüft am Kirchenbuch' });

    await saveDocument(io, edited, opened.state);
    const reopened = openFromText(io.written[0], 'orte.json');
    expect(reopened.content.placeObjects.get('@P1@')?.note).toBe('geprüft am Kirchenbuch');
  });

  it('zweimaliges Speichern ohne Änderung erzeugt byte-gleichen Inhalt (Sortierung stabil)', async () => {
    // Ohne stabile Reihenfolge hinge die Datei an der Einfügereihenfolge einer Map —
    // ein Sync-Byte-Vergleich (Spec 30 §4) meldete dann Änderungen, wo keine sind.
    const a = buildWrapper(contentOf(JSON.parse(fixtureText())), 4, 'd', 1);
    const shuffled: OrteContent = {
      placeObjects: new Map([...contentOf(JSON.parse(fixtureText())).placeObjects].reverse()),
      hofObjects: new Map([...contentOf(JSON.parse(fixtureText())).hofObjects].reverse())
    };
    const b = buildWrapper(shuffled, 4, 'd', 1);
    expect(serializePlacesFileWrapper(a)).toBe(serializePlacesFileWrapper(b));
  });

  it('erhöht die Revision beim Speichern und trägt die eigene Gerätekennung', async () => {
    // Damit das Hauptprogramm eine im Editor bearbeitete Datei beim Import als „Stand von
    // einem anderen Gerät" erkennt und regulär union-merged (Spec 30 §4) — statt sie für
    // unverändert zu halten.
    const io = makeIO();
    const opened = openFromText(fixtureText(), 'orte.json');
    const outcome = await saveDocument(io, opened.content, opened.state);

    const written = JSON.parse(io.written[0]);
    expect(written.rev).toBe(4);
    expect(written.device).toBe('test-device');
    expect(outcome.state.rev).toBe(4);
    expect(outcome.state.dirty).toBe(false);
  });

  it('speichert eine Datei aus neuerer Programmfassung NICHT (Nur-Lese-Schutz)', async () => {
    const io = makeIO();
    const tooNew = serializePlacesFileWrapper({
      schemaVersion: PLACES_SCHEMA_VERSION + 1,
      rev: 1,
      device: 'x',
      ts: 1,
      placeObjects: [],
      hofObjects: []
    });
    const opened = openFromText(tooNew, 'orte.json');
    expect(opened.state.readOnly).toBe(true);

    const outcome = await saveDocument(io, opened.content, opened.state);
    expect(outcome.saved).toBe(false);
    expect(io.written).toHaveLength(0);
    expect(outcome.notice).toContain('neueren');
  });

  it('ein leeres Dokument ist speicherbar und wieder ladbar', async () => {
    const io = makeIO();
    const fresh = newDocument();
    await saveDocument(io, fresh.content, fresh.state);
    const reopened = openFromText(io.written[0], 'orte.json');
    expect(reopened.content.placeObjects.size).toBe(0);
    expect(reopened.state.open).toBe(true);
  });

  it('meldet fremdes/kaputtes JSON mit klarer Meldung statt still abzustürzen', () => {
    expect(() => openFromText('{nicht mal json', 'x.json')).toThrow(/JSON/);
    expect(() => openFromText('{"was":"anderes"}', 'x.json')).toThrow(/Dateiformat/);
  });

  it('serializeForCompare blendet Revision/Gerät/Zeit aus — nur der Inhalt zählt', () => {
    // Grundlage von INV-ORTE-2: der Vergleich darf nicht an Metadaten scheitern, die sich
    // ohnehin bei jedem Speichern ändern.
    const opened = openFromText(fixtureText(), 'orte.json');
    const same = openFromText(fixtureText().replace('"rev": 3', '"rev": 99'), 'orte.json');
    expect(serializeForCompare(opened.content)).toBe(serializeForCompare(same.content));
  });
});
