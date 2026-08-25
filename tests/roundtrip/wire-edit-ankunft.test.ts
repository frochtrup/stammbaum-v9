// tests/roundtrip/wire-edit-ankunft.test.ts — M3 (BL-379): jeder Nutzer-Edit kommt an, und
// zwar ÜBERALL. Zweite Mutation an der geteilten Naht (`wire-mutation-harness.ts`).
//
// WARUM DIESE MUTATION, UND WARUM SIE NICHT DASSELBE FRAGT WIE M1. M1 hängt an jeden Wert an
// und fragt „ist mein Text noch da?" — das fängt Verlust. M3 ERSETZT jeden Wert und fragt zwei
// Dinge, von denen nur das erste offensichtlich ist:
//
//   (a) Kommt der neue Wert zurück? (Der Edit ist angekommen.)
//   (b) Steht der ALTE Wert danach noch irgendwo? (Er hat einen zweiten, nicht mitgezogenen
//       Wohnsitz — eine eingefrorene Kopie.)
//
// (b) ist der Grund für diesen Test. [ADR-v9-81] ist genau dieser Fall, und er ist teuer
// gewesen: die Hof-Umbenennung schrieb `PLAC` live aus dem Modell, `ADDR` aber aus dem
// eingefrorenen `event.addr` (Fill-if-empty, [ADR-v9-47]). Der Edit war „gebaut", von mir
// selbst live verifiziert und gemeldet — auf drei Anzeigen, die alle die MODELL-Hälfte zeigten.
// Unsichtbar blieb: jede referenzierende Ereigniszeile, der Export (PLAC und ADDR
// widersprachen sich) und der nächste Ladepass, der den ALTEN Namen wieder hochbootstrappte.
// Aufgedeckt hat es eine fachliche Nutzer-Rückfrage, keine Prüfung.
//
// Ein Test je Spiegelung zu schreiben, hätte das nicht gefangen — man schreibt ihn für die
// Spiegelungen, die man kennt. Diese Mutation kennt keine einzige und findet sie trotzdem:
// wenn nach dem Ersetzen ALLER beanspruchten Werte noch ein alter Wert im Draht steht, dann
// hat ihn etwas festgehalten, das das Modell nicht mitgezogen hat.
import { describe, it, expect } from 'vitest';
import { parseGedcom } from '../../core/interop';
import { rundlauf, abweichungen, korpusText, mutiereTexte, schreibe, sammleTexte, unberuehrteWerte } from './wire-mutation-harness';
import { realbestandText, realbestandVorhanden } from '../core/realdaten';

/**
 * Der Ersatzwert trägt den Pfad in sich: schlägt (b) an, nennt der Fehlschlag nicht nur den
 * alten Wert, sondern auch das Feld, dessen Edit ihn hätte mitziehen müssen. Kein Leerzeichen
 * und keine Sonderzeichen — die haben ihre eigene Mutation (M6), hier wären sie Rauschen.
 */
const edit = (_wert: string, pfad: string): string => `EDIT${pfad.replace(/[^a-zA-Z0-9]/g, '-')}`;

/**
 * Alte Werte, die zu kurz oder zu allgemein sind, um eine Fundstelle zu BEWEISEN. `1900` steht
 * als Jahr in jeder zweiten Zeile, `jpg` auch im nicht mutierten `FORM` — ein Treffer sagt
 * dort nichts über eine eingefrorene Kopie aus. Die Grenze ist bewusst am Wert und nicht am
 * Feld gezogen: sie nimmt keinem Feld die Prüfung, sie verlangt nur einen Wert, der lang genug
 * ist, um eindeutig zu sein. Gemessen bleiben damit 40 der 57 Werte in der Probe.
 */
const EINDEUTIG_AB = 8;

describe('BL-379 — M3: ein Nutzer-Edit kommt an, und der alte Wert bleibt nirgends stehen', () => {
  it('(a) jeder ersetzte Wert kommt als neuer Wert zurück', () => {
    const { soll, ist } = rundlauf(edit);
    expect(soll.size).toBeGreaterThan(50); // Zählung vor der Zusicherung ([ADR-v9-200])
    expect(abweichungen(soll, ist)).toEqual([]);
  });

  /**
   * Die Probe (b) als Funktion, damit der Wächter unten an einem GEPFLANZTEN Fall vorgeführt
   * werden kann. Ein Finder, der nur grün war, ist unbelegt — er könnte auch nichts tun.
   */
  function altwerteImDraht(quelle: string): string[] {
    const p = parseGedcom(quelle);
    const vorher = sammleTexte(p.db);
    const { db } = mutiereTexte(p.db, edit);
    const ausgabe = schreibe(db, p.roots);
    // Ein Vorkommen ist nur dann ein Befund, wenn es NICHT durch ein unangetastetes Feld
    // erklärt ist (s. `unberuehrteWerte`) — sonst meldete der Wächter den `CHAN`-Stempel.
    const unberuehrt = unberuehrteWerte(p.db);
    const geprueft = [...vorher].filter(
      ([, w]) => w.length >= EINDEUTIG_AB && !unberuehrt.some((u) => u.includes(w)),
    );
    return [
      `${geprueft.length} Werte geprüft`,
      ...geprueft
        .filter(([, alt]) => ausgabe.includes(alt))
        .map(([pfad, alt]) => `${pfad}: „${alt}" steht nach dem Edit noch in der Ausgabe`),
    ];
  }

  it('(b) kein alter Wert steht nach dem Edit noch im Draht (keine eingefrorene Kopie)', () => {
    const [anzahl, ...befunde] = altwerteImDraht(korpusText());
    expect(parseInt(anzahl, 10)).toBeGreaterThan(20); // sonst prüft die Schleife fast nichts
    expect(befunde).toEqual([]);
  });

  /**
   * Der Wächter, vorgeführt: hier trägt eine un-modellierte Zeile (`_SPIEGEL`) denselben Text
   * wie die Notiz daneben — die Bauform von [ADR-v9-81], in der eine zweite Fundstelle den
   * alten Wert festhält, während das Modell die erste umschreibt. (b) muss sie melden.
   *
   * Was das NICHT beweist: dass jede gemeldete Zeile ein Fehler ist. Zwei Felder dürfen
   * denselben Text tragen, ohne einander zu spiegeln — ein Treffer ist ein Befund zum
   * EINORDNEN, kein Urteil. Genau so ist der `CHAN`-Stempel oben eingeordnet worden.
   */
  it('(b) meldet eine gepflanzte Spiegelung — der Wächter tut wirklich etwas', () => {
    const text = 'Kirchenbuch Ochtrup, Band 3, Seite 214 — dieselbe Angabe zweimal abgelegt';
    const mitSpiegel = [
      '0 HEAD', '1 GEDC', '2 VERS 5.5.1',
      '0 @I1@ INDI', '1 NAME Max /Muster/',
      `1 NOTE ${text}`,
      `1 _SPIEGEL ${text}`,
      '0 TRLR',
    ].join('\n');
    const [, ...befunde] = altwerteImDraht(mitSpiegel);
    expect(befunde).toHaveLength(1);
    expect(befunde[0]).toContain('/individuals/@I1@/noteText');
  });

  /**
   * Derselbe Edit am Realbestand — hier ist die Mutation FINDER, nicht Zusicherung: der Korpus
   * hat jede Form einmal, der Bestand hat sie tausendfach und in Kombinationen, die keine
   * kuratierte Fixture vorsieht. Geprüft wird nicht „welche Zahl", sondern „welche ARTEN von
   * Pfaden kommen nicht an" — die Menge ist LEER. Kommt eine neue Art hinzu, wird der Test rot
   * und nennt sie.
   *
   * BIS BL-380 stand hier eine benannte Ausnahme: 219 der 32.030 mutierten Felder kamen nicht
   * zurück, alle unter den Notiz-Records — `applyDatabaseToRoots` kannte den Record nicht.
   * Dass diese Zeile jetzt `[]` sagt, IST die Fertig-Bedingung jener Zeile; sie hat sich
   * selbst geprüft, statt dass jemand sie für erledigt erklären musste.
   */
  it.skipIf(!realbestandVorhanden())('(d) am Realbestand kommt jeder Edit an — ohne Ausnahme (BL-380 geschlossen)', () => {
    const p = parseGedcom(realbestandText());
    const { db, soll } = mutiereTexte(p.db, edit);
    const ist = sammleTexte(parseGedcom(schreibe(db, p.roots)).db);
    expect(soll.size).toBeGreaterThan(20000); // Zählung vor der Zusicherung ([ADR-v9-200])

    const arten = new Set<string>();
    for (const [pfad, s] of soll) {
      if (ist.get(pfad) === s) continue;
      arten.add(pfad.replace(/\/@[^/]+@/g, '/*').replace(/\/\d+/g, '/N'));
    }
    expect([...arten]).toEqual([]);
  });

  it('(c) der Stand nach dem Edit ist stabil (out2 === out3)', () => {
    const p = parseGedcom(korpusText());
    const { db } = mutiereTexte(p.db, edit);
    const out2 = schreibe(db, p.roots);
    const wieder = parseGedcom(out2);
    const out3 = schreibe(wieder.db, wieder.roots);
    expect(out3).toBe(out2);
  });
});
