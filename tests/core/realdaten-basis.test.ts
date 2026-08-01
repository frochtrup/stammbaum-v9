// tests/core/realdaten-basis.test.ts — der Wächter über die Messgrundlage
// (BL-246, ADR-v9-178, Spec 32 TST-21). Deklaration: tests/core/realdaten.ts.
//
// Er prüft KEIN Verhalten des Programms, sondern die Voraussetzung jeder Aussage der
// Form „am Realbestand kommt X N× vor". Zwei Zustände, zwei Reaktionen:
//
//   Datei fehlt (CI, fremder Rechner)  → skip, aber der Testname nennt sie
//   Datei da, Zahlen weichen ab        → FEHLER, nicht skip
//
// Der zweite Fall ist der eigentliche Zweck: eine veraltete oder schlicht andere Kopie
// unter dem richtigen Namen ist genau die Lage, aus der ADR-v9-151 sechs falsche Zahlen
// gezogen hat — sie sieht von außen exakt so aus wie die richtige.

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  ORAKEL_SNAPSHOT,
  REALBESTAND,
  fehlendHinweis,
  realbestandText,
  realbestandVorhanden,
  zaehleRecords,
} from './realdaten';

const e = REALBESTAND.erwartet;

describe('Messgrundlage (TST-21)', () => {
  it.skipIf(!realbestandVorhanden())(
    `${REALBESTAND.datei} (${REALBESTAND.exportiert}) trägt ${e.individuals} Personen / ` +
      `${e.families} Familien / ${e.sources} Quellen / ${e.repositories} Archive`,
    () => {
      const n = zaehleRecords(realbestandText());
      // Als EIN Vergleich, nicht vier: schlägt er an, sollen alle Abweichungen zugleich
      // sichtbar sein — sonst führt der erste Fehlschlag in die Irre („nur die Personen
      // stimmen nicht"), obwohl die Datei insgesamt eine andere ist.
      expect({
        individuals: n.INDI ?? 0,
        families: n.FAM ?? 0,
        sources: n.SOUR ?? 0,
        repositories: n.REPO ?? 0,
      }).toEqual({ ...e });
    },
  );

  it.skipIf(realbestandVorhanden())(`ÜBERSPRUNGEN: ${fehlendHinweis()}`, () => {
    // Läuft nur, wenn die Datei FEHLT. Er ist absichtlich grün: das Fehlen der
    // Privatdatei ist kein Defekt (CI hat sie nie). Sein Zweck ist der Name — er steht
    // im Protokoll und beantwortet die Frage, die zweimal unbeantwortet blieb: gegen
    // welche Datei lief das hier eigentlich? (TST-21; ein stiller Skip ist die Form, in
    // der die Lücke überlebt hat.)
    expect(realbestandVorhanden()).toBe(false);
  });

  it('der Orakel-Snapshot ist NICHT der Realbestand — die Zahlen dürfen nie zusammenfallen', () => {
    // Bewacht den naheliegenden „Fix", wenn der Test oben rot ist: den vorhandenen
    // Snapshot unter den neuen Namen kopieren. Dann stimmten die Zahlen wieder mit sich
    // selbst überein — und die Verwechslung wäre festgeschrieben statt behoben.
    expect(ORAKEL_SNAPSHOT.individuals).not.toBe(e.individuals);

    const snapshot = join(__dirname, '../fixtures', ORAKEL_SNAPSHOT.datei);
    if (existsSync(snapshot) && realbestandVorhanden()) {
      const a = zaehleRecords(realbestandText()).INDI ?? 0;
      expect(a, `${REALBESTAND.datei} zählt wie der Snapshot — vermutlich dieselbe Datei`).not.toBe(
        ORAKEL_SNAPSHOT.individuals,
      );
    }
  });
});
