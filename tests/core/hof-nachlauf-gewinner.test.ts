// tests/core/hof-nachlauf-gewinner.test.ts — der AUTOMATISCHE Hof-Nachlauf nach einem
// Dorf-Merge wählt seinen Überlebenden nach derselben Kette wie der Dedup-Vorschlag
// (Spec 11 §9.2, [ADR-v9-298]).
//
// WARUM DIESER PFAD EINEN EIGENEN TEST BRAUCHT. `reconcileHofsUnderVillage` schlägt nicht
// vor, es FÜHRT ZUSAMMEN — ohne Klick, als Nachlauf von `mergePlaceObjects`. Seit
// [ADR-v9-222] behält der Gewinner nur seine EIGENEN Angaben; wählt die Heuristik hier den
// rohen Bootstrap, ist die Kuration weg, und niemand hat je eine Rückfrage gesehen. Genau
// der Schaden, den [ADR-v9-225] für den Dialog abgewendet hat — an der Stelle, die ihn
// damals nicht mitbekommen hat, weil die Heuristik in `ui/shell` lag.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mergePlaceObjects } from '../../core/places/commands';
import { place, hof, placeMap, hofMap, ev } from './places-fixtures';

/** Zwei Dörfer, die gleich zusammengeführt werden — mit je einem Hof derselben Adresse. */
function bestand(opts: { kuratiert: 'A' | 'B'; ereignisseAuf: 'A' | 'B' }) {
  const places = placeMap(
    place('@DORF_A@', { title: 'Ochtrup', type: 'Town' }),
    place('@DORF_B@', { title: 'Ochtrup', type: 'Town' }),
  );
  const roh = (id: string, village: string) =>
    hof(id, village, { addrs: [{ value: 'Wall 33', from: null, to: null }] });
  const gepflegt = (id: string, village: string) =>
    hof(id, village, {
      // Vier Facetten + zwei datierte Adressperioden: das ist die Arbeit, die es sonst
      // nirgends gibt — sie steht in keiner GEDCOM-Datei (Spec 11 §2).
      addrs: [
        { value: 'Wall 33', from: 1820, to: 1900 },
        { value: 'Wall 33 (alt)', from: 1750, to: 1820 },
      ],
      lat: 52.2,
      long: 7.18,
      note: 'Hofgeschichte, aus dem Kirchenbuch belegt.',
    });

  const hofs = hofMap(
    opts.kuratiert === 'A' ? gepflegt('@HOF_A@', '@DORF_A@') : roh('@HOF_A@', '@DORF_A@'),
    opts.kuratiert === 'B' ? gepflegt('@HOF_B@', '@DORF_B@') : roh('@HOF_B@', '@DORF_B@'),
  );
  const ziel = opts.ereignisseAuf === 'A' ? '@HOF_A@' : '@HOF_B@';
  const events = [
    ev('RESI', { hofId: ziel, date: '1850' }),
    ev('PROP', { hofId: ziel, date: '1860' }),
    ev('CENS', { hofId: ziel, date: '1870' }),
  ];
  return { places, hofs, events };
}

describe('Hof-Nachlauf nach Dorf-Merge — Gewinner (ADR-v9-298)', () => {
  it('der KURATIERTE Hof überlebt, auch wenn alle Ereignisse am rohen hängen', () => {
    // DIE Zusicherung. Vor ADR-v9-298 rangierte dieser Pfad nach Verwendungszahl zuerst —
    // der rohe Bootstrap trug drei Ereignisse, der kuratierte null, und der Merge hätte die
    // Kuration ohne Rückfrage verworfen.
    const { places, hofs, events } = bestand({ kuratiert: 'A', ereignisseAuf: 'B' });

    mergePlaceObjects(places, hofs, '@DORF_A@', ['@DORF_B@'], events);

    expect(hofs.size).toBe(1);
    const ueberlebender = [...hofs.values()][0];
    expect(ueberlebender.id).toBe('@HOF_A@');
    // Und die Kuration ist wirklich noch da, nicht nur die Id.
    expect(ueberlebender.note).not.toBe('');
    expect(ueberlebender.lat).not.toBeNull();
  });

  it('… und die Ereignisse folgen ihm (das war nie das Argument gegen ihn)', () => {
    const { places, hofs, events } = bestand({ kuratiert: 'A', ereignisseAuf: 'B' });

    const res = mergePlaceObjects(places, hofs, '@DORF_A@', ['@DORF_B@'], events);

    // ADR-v9-225: „die Ereignisse folgen dem Gewinner ohnehin" — belegt statt behauptet.
    expect(res.hofRemap.get('@HOF_B@')).toBe('@HOF_A@');
  });

  it('stehen beide gleich, entscheidet weiterhin die Verwendungszahl', () => {
    // Die Gegenprobe: die Verwendung ist nicht abgeschafft, nur nachgeordnet.
    const { places, hofs, events } = bestand({ kuratiert: 'A', ereignisseAuf: 'A' });
    // Beide roh machen, damit `curated`/Grad/Perioden gleichstehen.
    const a = hofs.get('@HOF_A@')!;
    hofs.set('@HOF_A@', { ...a, addrs: [{ value: 'Wall 33', from: null, to: null, lang: 'deu', dateRaw: null }], lat: null, long: null, note: '' });

    mergePlaceObjects(places, hofs, '@DORF_A@', ['@DORF_B@'], events);

    expect([...hofs.values()][0].id).toBe('@HOF_A@');
  });

  it('ohne jedes Unterscheidungsmerkmal bleibt die kleinste ID (deterministisch)', () => {
    const places = placeMap(
      place('@DORF_A@', { title: 'Ochtrup', type: 'Town' }),
      place('@DORF_B@', { title: 'Ochtrup', type: 'Town' }),
    );
    const hofs = hofMap(
      hof('@HOF_Z@', '@DORF_A@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }),
      hof('@HOF_A@', '@DORF_B@', { addrs: [{ value: 'Wall 33', from: null, to: null }] }),
    );

    mergePlaceObjects(places, hofs, '@DORF_A@', ['@DORF_B@'], []);

    expect([...hofs.values()][0].id).toBe('@HOF_A@');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// Der strukturelle Teil, aus demselben Grund wie in `tests/services/idb-schema.test.ts`:
// eine Regel, die an zwei Stellen steht, wird an einer nachgezogen. Genau das ist hier
// zweimal passiert (ADR-v9-225 und ADR-v9-296 haben je nur die sichtbare Hälfte erreicht).
// Ein Verhaltenstest fängt den Rückfall erst, wenn jemand ihn schon gebaut hat; diese
// beiden Zusicherungen fangen die FORM.
describe('EINE Heuristik, nicht zwei (ADR-v9-298)', () => {
  const lies = (rel: string): string => readFileSync(join(__dirname, '../../', rel), 'utf8');

  it('der automatische Pfad ruft die geteilte Kette, statt selbst zu sortieren', () => {
    const src = lies('core/places/commands.ts');
    expect(src).toMatch(/pickWinnerId\(/);
    // Kein eigener Vergleichs-Rattenschwanz mehr in `pickHofWinner`: die alte Fassung
    // rangierte dort von Hand über Koordinaten und Notiz.
    const fn = src.slice(
      src.indexOf('function pickHofWinner'),
      src.indexOf('function reconcileHofsUnderVillage'),
    );
    expect(fn.length).toBeGreaterThan(0);
    expect(fn).not.toMatch(/localeCompare/);
  });

  it('die Schale definiert sie nicht neu, sie reicht die Kern-Fassung durch', () => {
    const src = lies('ui/shell/curation-dedup.ts');
    expect(src).toMatch(/export \{ pickWinnerId/);
    expect(src).not.toMatch(/function pickWinnerId/);
  });
});
