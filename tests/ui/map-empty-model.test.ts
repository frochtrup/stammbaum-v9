// tests/ui/map-empty-model.test.ts — BL-310: die Karte benennt ihre Leere.
//
// Der Kern des Befundes ist nicht „es fehlt ein Text", sondern „der Text kennt den
// Grund nicht". Ein pauschales „Keine Daten" wäre die stille Fläche mit Schrift darauf:
// es sagt dem Nutzer nicht, ob er importieren, geocodieren oder gar nichts tun soll.
// Diese Suite prüft deshalb vor allem die UNTERSCHEIDUNG der Fälle — und dass ein
// Ausweg nur dort angeboten wird, wo es einen gibt.
import { describe, it, expect } from 'vitest';
import { mapEmptyReason, type MapEmptyInput } from '../../ui/views/map/map-empty-model';

/** Voll besetzte Karte — die Ausgangslage, aus der jeder Test genau ein Feld verstellt. */
const voll: MapEmptyInput = {
  mode: 'orte',
  markers: 12,
  migrations: 4,
  biography: 3,
  personSelected: true,
  places: 30,
  hofs: 10,
};

const mit = (over: Partial<MapEmptyInput>): MapEmptyInput => ({ ...voll, ...over });

describe('BL-310 — Orte-Modus: der Default-Modus schweigt nicht mehr', () => {
  it('sagt nichts, solange es Marker gibt', () => {
    expect(mapEmptyReason(voll)).toBeNull();
  });

  it('unterscheidet „gar keine Orte" von „Orte ohne Koordinaten"', () => {
    const leer = mapEmptyReason(mit({ markers: 0, places: 0, hofs: 0 }));
    const ohne = mapEmptyReason(mit({ markers: 0, places: 30, hofs: 10 }));
    expect(leer?.kind).toBe('kein-bestand');
    expect(ohne?.kind).toBe('ohne-koordinaten');
    // Der eigentliche Punkt: zwei Lagen, zwei Sätze. Wären sie gleich, wäre die
    // Funktion überflüssig und der Nutzer so ratlos wie vor dem Bau.
    expect(leer?.headline).not.toBe(ohne?.headline);
  });

  it('nennt die Zahl der Orte, statt sie zu behaupten', () => {
    expect(mapEmptyReason(mit({ markers: 0, places: 416, hofs: 0 }))?.headline).toContain('416 Orte');
  });

  it('beugt den Singular — „1 Ort", nicht „1 Orte"', () => {
    const s = mapEmptyReason(mit({ markers: 0, places: 1, hofs: 0 }))?.headline ?? '';
    expect(s).toContain('1 Ort');
    expect(s).not.toContain('1 Orte');
  });

  // Der erste Bau-Stand addierte Orte und Höfe und schrieb „626 Orte erfasst", während
  // die Ortsliste daneben 419 zählte. Ein Hof ist in v9 eine EIGENE Entität ([11 §1]) —
  // die Summe unter einem Namen zu führen widerspricht dem Modell, das sie trennt.
  // Aufgefallen erst am Realbestand, von keinem Test der ersten Fassung.
  it('wirft Orte und Höfe nicht in eine Zahl — beide werden benannt', () => {
    const s = mapEmptyReason(mit({ markers: 0, places: 419, hofs: 207 }))?.headline ?? '';
    expect(s).toContain('419 Orte');
    expect(s).toContain('207 Höfe');
    expect(s).not.toContain('626');
  });

  it('nennt nur die Art, die es gibt — kein „und 0 Höfe"', () => {
    expect(mapEmptyReason(mit({ markers: 0, places: 419, hofs: 0 }))?.headline).not.toMatch(/Höfe/);
    expect(mapEmptyReason(mit({ markers: 0, places: 0, hofs: 207 }))?.headline).not.toMatch(/Orte/);
  });

  it('beugt auch den Hof-Singular', () => {
    const s = mapEmptyReason(mit({ markers: 0, places: 0, hofs: 1 }))?.headline ?? '';
    expect(s).toContain('1 Hof');
    expect(s).not.toContain('1 Höfe');
  });

  it('bietet den Geocoding-Weg NUR an, wenn es dort etwas zu holen gibt', () => {
    expect(mapEmptyReason(mit({ markers: 0, places: 30, hofs: 10 }))?.offersGeocoding).toBe(true);
    // Ohne einen einzigen Ort führte der Weg in eine leere Liste — ein Knopf ins Leere
    // ist schlimmer als keiner.
    expect(mapEmptyReason(mit({ markers: 0, places: 0, hofs: 0 }))?.offersGeocoding).toBe(false);
  });

  it('ist der Regelfall nach dem Import: viele Orte, kein Marker (ADR-v9-28)', () => {
    // Der Village-Seed legt unangereicherte PlaceObjects ohne eigene Koordinaten an.
    // Genau diese Lage traf der Nutzer beim ersten Blick auf die Karte — 0 Marker,
    // 0 erklärende Zeichen. Sie MUSS den handlungsfähigen Fall treffen.
    const nachImport = mapEmptyReason(mit({ markers: 0, places: 416, hofs: 0 }));
    expect(nachImport?.kind).toBe('ohne-koordinaten');
    expect(nachImport?.offersGeocoding).toBe(true);
  });
});

describe('BL-310 — Personen-Modus: der bestehende Satz zieht in denselben Mechanismus', () => {
  it('schweigt ohne Auswahl — der Picker darüber sagt es bereits', () => {
    expect(mapEmptyReason(mit({ mode: 'person', personSelected: false, biography: 0 }))).toBeNull();
  });

  it('schweigt, solange die Person Stationen hat', () => {
    expect(mapEmptyReason(mit({ mode: 'person', biography: 3 }))).toBeNull();
  });

  it('behält den Wortlaut der bisherigen Inline-Fassung', () => {
    const s = mapEmptyReason(mit({ mode: 'person', biography: 0 }));
    expect(s?.kind).toBe('keine-stationen');
    expect(s?.headline).toBe('Keine Koordinaten für diese Person vorhanden.');
  });

  it('verweist aufs Geocoding nur, wenn überhaupt Orte da sind', () => {
    expect(mapEmptyReason(mit({ mode: 'person', biography: 0, places: 30, hofs: 10 }))?.offersGeocoding).toBe(true);
    expect(mapEmptyReason(mit({ mode: 'person', biography: 0, places: 0, hofs: 0 }))?.offersGeocoding).toBe(false);
  });
});

describe('BL-310 — Migrations-Modus: der Nachbar, den die Backlog-Zeile nicht nannte', () => {
  it('schweigt, solange Linien da sind', () => {
    expect(mapEmptyReason(mit({ mode: 'migr', migrations: 4 }))).toBeNull();
  });

  it('erklärt, woraus eine Linie überhaupt entsteht', () => {
    const s = mapEmptyReason(mit({ mode: 'migr', migrations: 0 }));
    expect(s?.kind).toBe('keine-linien');
    expect(s?.hint).toMatch(/zwei Orte/);
  });
});

describe('BL-310 — was für JEDEN Grund gelten muss', () => {
  // Die Schleife läuft über eine berechnete Menge — deshalb erst zählen, dann prüfen
  // (CLAUDE.md: ein grüner Test über einer leeren Menge beweist nichts).
  const alleLeerlagen: MapEmptyInput[] = [
    mit({ mode: 'orte', markers: 0, places: 0, hofs: 0 }),
    mit({ mode: 'orte', markers: 0, places: 30, hofs: 10 }),
    mit({ mode: 'person', biography: 0, places: 0, hofs: 0 }),
    mit({ mode: 'person', biography: 0, places: 30, hofs: 10 }),
    mit({ mode: 'migr', migrations: 0, places: 0, hofs: 0 }),
    mit({ mode: 'migr', migrations: 0, places: 30, hofs: 10 }),
  ];

  it('deckt alle sechs Leerlagen ab', () => {
    expect(alleLeerlagen.length).toBe(6);
    expect(alleLeerlagen.every((i) => mapEmptyReason(i) !== null)).toBe(true);
  });

  it('gibt nie einen Hinweis ohne Ausweg — beide Sätze sind besetzt', () => {
    for (const lage of alleLeerlagen) {
      const s = mapEmptyReason(lage)!;
      expect(s.headline.length, `headline bei ${s.kind}`).toBeGreaterThan(0);
      expect(s.hint.length, `hint bei ${s.kind}`).toBeGreaterThan(0);
    }
  });

  it('schreibt ganze Sätze — jeder Text endet mit einem Punkt', () => {
    for (const lage of alleLeerlagen) {
      const s = mapEmptyReason(lage)!;
      expect(s.headline.endsWith('.'), `headline bei ${s.kind}: ${s.headline}`).toBe(true);
      expect(s.hint.endsWith('.'), `hint bei ${s.kind}`).toBe(true);
    }
  });

  it('verspricht den Geocoding-Weg nie ohne kuratierbare Orte', () => {
    const versprochen = alleLeerlagen.filter((l) => mapEmptyReason(l)!.offersGeocoding);
    expect(versprochen.length).toBeGreaterThan(0);
    expect(versprochen.every((l) => l.places + l.hofs > 0)).toBe(true);
  });
});
