// tests/orte/entwurf.test.ts — der Absturz-Entwurf ist Wiederherstellung, nie Quelle
// (OE-4, INV-ORTE-3, Spec 22 §4, ADR-v9-162).
//
// Der Entwurf ist die einzige Stelle, an der im Editor ein zweiter dauerhafter Speicher
// durch die Hintertür entstehen könnte. Diese Datei verriegelt die drei Eigenschaften,
// die ihn davon abhalten: er verfällt beim Speichern, er trägt keine eigene Revision,
// und er schreibt entprellt statt bei jedem Tastendruck.
import { describe, expect, it, vi } from 'vitest';
import { debounceDraft, type OrteDraft, type OrteDraftStore } from '../../app-orte/orte-draft-store';

function memoryStore(): OrteDraftStore & { saved: OrteDraft[] } {
  const saved: OrteDraft[] = [];
  return {
    saved,
    load: async () => saved[saved.length - 1] ?? null,
    save: async (d) => {
      saved.push(d);
    },
    clear: async () => {
      saved.length = 0;
    }
  };
}

const draft = (patch: Partial<OrteDraft> = {}): OrteDraft => ({
  fileName: 'orte.json',
  baseRev: 3,
  savedAt: 1,
  placeObjects: [],
  hofObjects: [],
  ...patch
});

describe('Absturz-Entwurf (INV-ORTE-3)', () => {
  it('schreibt entprellt: viele Änderungen ergeben EINEN Schreibvorgang', () => {
    vi.useFakeTimers();
    const store = memoryStore();
    const writer = debounceDraft(store, 1000);

    writer.write(draft({ savedAt: 1 }));
    writer.write(draft({ savedAt: 2 }));
    writer.write(draft({ savedAt: 3 }));
    expect(store.saved).toHaveLength(0);

    vi.advanceTimersByTime(1000);
    expect(store.saved).toHaveLength(1);
    expect(store.saved[0].savedAt).toBe(3);
    vi.useRealTimers();
  });

  it('ein abgebrochener Schreibvorgang schreibt gar nicht', () => {
    // Beim Speichern wird der offene Entwurf verworfen, BEVOR der Store geleert wird —
    // sonst schriebe der entprellte Timer ihn danach wieder hin und der „verfallene"
    // Entwurf wäre beim nächsten Start zurück.
    vi.useFakeTimers();
    const store = memoryStore();
    const writer = debounceDraft(store, 1000);

    writer.write(draft());
    writer.flushCancel();
    vi.advanceTimersByTime(5000);

    expect(store.saved).toHaveLength(0);
    vi.useRealTimers();
  });

  it('trägt keine eigene Revision — er nimmt an keinem Abgleich teil', () => {
    // `baseRev` ist die Revision der DATEI, aus der er hervorging (Anzeige/Plausibilität).
    // Gäbe es hier eine eigene, fortgezählte Revision, wäre der Entwurf ein Sync-Teilnehmer
    // und damit eine zweite Wahrheit.
    const d = draft();
    expect(Object.keys(d).sort()).toEqual(
      ['baseRev', 'fileName', 'hofObjects', 'placeObjects', 'savedAt'].sort()
    );
  });

  it('clear() macht ihn unauffindbar (Verfall beim Speichern)', async () => {
    const store = memoryStore();
    await store.save(draft());
    expect(await store.load()).not.toBeNull();
    await store.clear();
    expect(await store.load()).toBeNull();
  });
});
