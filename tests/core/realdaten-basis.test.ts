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
  ORTSBESTAND,
  REALBESTAND,
  fehlendHinweis,
  ortsbestandLaden,
  ortsbestandVorhanden,
  realbestandText,
  realbestandVorhanden,
  zaehleRecords,
} from './realdaten';

const e = REALBESTAND.erwartet;
const o = ORTSBESTAND.erwartet;

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

  // DIE ZWEITE HÄLFTE, bis 2026-08-09 nicht gebaut (ADR-v9-242). `ORTSBESTAND.erwartet`
  // stand seit BL-287 in der Deklaration und wurde von keinem Test gelesen — der Symlink
  // zeigte auf die älteste von vier Ortsdateien, und die deklarierten Zahlen passten
  // nicht einmal zu ihr. Der Ortsbestand ist der ZWEITE Realdaten-Eingang des Ladepfads
  // (s. Kommentar an ORTSBESTAND): ohne ihn trifft die Auflösung nie auf einen
  // kuratierten, periodengerecht datierten Ort. Eine Aussage „am Realbestand" hängt
  // deshalb an BEIDEN Dateien, nicht nur an der GEDCOM.
  it.skipIf(!ortsbestandVorhanden())(
    `${ORTSBESTAND.datei} trägt ${o.placeObjects} Orte / ${o.hofObjects} Höfe`,
    () => {
      const b = ortsbestandLaden();
      // Ein Vergleich, nicht zwei — gleiche Begründung wie oben.
      expect({ placeObjects: b.placeObjects.size, hofObjects: b.hofObjects.size }).toEqual({ ...o });
    },
  );

  it.skipIf(ortsbestandVorhanden())(
    `ÜBERSPRUNGEN: ${ORTSBESTAND.datei} nicht in tests/fixtures/ — Symlink auf den ` +
      `aktuellen Ortsbestand anlegen (gitignored). Ohne ihn läuft der Ladepfad ohne kuratierte Orte.`,
    () => {
      expect(ortsbestandVorhanden()).toBe(false);
    },
  );

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
