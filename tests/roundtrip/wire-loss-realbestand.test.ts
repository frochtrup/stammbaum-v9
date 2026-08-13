// tests/roundtrip/wire-loss-realbestand.test.ts — BL-355 (ADR-v9-266): der Neubau ALLER
// Records verliert am maßgeblichen Bestand keinen Text.
//
// WARUM DIESER WÄCHTER EXISTIERT. Der Zensus („welche Zeile fehlt nach dem Neubau?") war
// gebaut — aber nur an kleinen, eingecheckten Fixturen (wire-loss-classes/-rest,
// wire-value-drift). Und am Realbestand lief zwar ein Wächter über ALLE Records
// (line-length-conc.test.ts), der prüfte aber nur die ZEILENLÄNGE. Das Fahrzeug war da, die
// Zusicherung fehlte: BL-355 (Ereigniswert ohne seine `CONC`-Fortsetzung, 118 Zeichen) lief
// durch beide Maschen und hat in einem echten Export Text vernichtet.
//
// Die Fixture-Zensen bleiben, was sie sind: die Zusicherung, die auch in CI GILT (der
// Realbestand ist gitignored, TST-20/21/23). Dieser Wächter ist ihr Gegenstück — er sieht die
// Formen, die keine kuratierte Fixture vorhersieht, und deckt die noch daten-losen
// Geschwister derselben Klasse (`DATE`/`PLAC`/`TYPE`/`PAGE` mit Fortsetzung) mechanisch mit
// ab, statt sie einzeln zu erinnern.
//
// ── Was verglichen wird, und warum nicht das Naheliegende ─────────────────────
// Verglichen wird die Multimenge der TEXT-FRAGMENTE: jede logische Zeile (`assembleLines`)
// an ihren `\n` zerlegt, jedes Stück weißraum-frei. Zwei Gründe, jeder am Bestand belegt:
//
//  (a) WEISSRAUM-FREI, weil unser Umbruch bewusst nicht neben einem Leerzeichen schneidet
//      (BL-305/ADR-v9-211), die Quelle (Ancestris) schon — und `assembleLines` trimmt jedes
//      Fragment. Drei `1 TEXT`-Zeilen des Bestands kommen deshalb um genau ein Leerzeichen
//      LÄNGER zurück, als sie gelesen wurden („zweitentapferen" → „zweiten tapferen"):
//      unsere Ausgabe ist die treuere. Byte-genau verglichen meldete das einen Verlust.
//
//  (b) FRAGMENTE statt ganzer logischer Zeilen, weil eine WAISEN-Fortsetzung beim Neubau an
//      eine andere Stelle rutscht und damit die FALTUNG verschiebt, ohne dass Text fehlt.
//      Zwei `2 OBJE` des Bestands tragen `3 CONT`-Zeilen ohne fortsetzbaren Elternwert
//      (Fremdprogramm-Artefakt); sie reisen als `MediaCitation.extra` durch und stehen danach
//      hinter `_PRIM` statt hinter `FORM>TYPE`. Zeilenweise verglichen fehlten „5 TYPE PHOTO"
//      und „3 _PRIM Y" — beide stehen aber vollständig in der Ausgabe, nur mit anderem
//      Fortsetzungs-Anhang. Ein Wächter, der so etwas als Verlust meldet, wird abgeschaltet.
//      Fragmentweise bleibt genau die Frage übrig, um die es geht: ist TEXT verschwunden?
import { describe, it, expect } from 'vitest';
import { parseGedcom, applyDatabaseToRoots, serializeGedcom } from '../../core/interop';
import { assembleLines } from './roundtrip-helpers';
import { REALBESTAND, realbestandText, realbestandVorhanden, fehlendHinweis } from '../core/realdaten';
import type { Database } from '../../core/model/types';

const speichern = (db: Database, roots: Parameters<typeof serializeGedcom>[0]['roots']): string =>
  serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots) });

/**
 * Die Zeilen, die der Test SELBST ändert (rein additiv schmutzig gemacht), plus `_DONE` —
 * der einzige Tag, den v9 bewusst NICHT mehr schreibt (ABGESCHAFFT, BL-307/ADR-v9-213; die
 * Aussage steht danach in `_TSTAT`). Alles andere ist ein echter Befund.
 */
const ERWARTET_WEG = /^\d+x (1 (_UID|ABBR|PHON) |2 _DONE )/;

const schluessel = (s: string): string => s.replace(/\s+/g, '');

/** Multimenge aller Text-Fragmente (s. Kopfkommentar, Grund (a) und (b)). */
function fragmente(t: string): { anzahl: Map<string, number>; beispiel: Map<string, string> } {
  const anzahl = new Map<string, number>();
  const beispiel = new Map<string, string>();
  for (const zeile of assembleLines(t)) {
    for (const stueck of zeile.split('\n')) {
      const k = schluessel(stueck);
      if (k === '') continue;
      anzahl.set(k, (anzahl.get(k) ?? 0) + 1);
      if (!beispiel.has(k)) beispiel.set(k, stueck);
    }
  }
  return { anzahl, beispiel };
}

describe.skipIf(!realbestandVorhanden())(`BL-355 — Verlust-Wächter am Realbestand (${REALBESTAND.datei})`, () => {
  it(`der Neubau ALLER Records verliert keinen Text — sonst: ${fehlendHinweis()}`, () => {
    const src = realbestandText();
    const p = parseGedcom(src);
    // Rein ADDITIV: die Bilanz soll echte Verluste zeigen, nicht meine Edits.
    for (const [id, x] of [...p.db.individuals]) p.db.individuals.set(id, { ...x, uid: `${x.uid}ZZ` });
    // Familien haben kein `_UID` — eine zusätzliche Inline-Notiz ist der additive Weg
    // (sie erscheint als NEUE Zeile, kann also keine fehlende vortäuschen).
    for (const [id, x] of [...p.db.families]) p.db.families.set(id, { ...x, extraNotes: [...x.extraNotes, 'ZZ'] });
    for (const [id, x] of [...p.db.sources]) p.db.sources.set(id, { ...x, abbr: `${x.abbr}ZZ` });
    for (const [id, x] of [...p.db.repositories]) p.db.repositories.set(id, { ...x, phone: `${x.phone}ZZ` });
    const out = speichern(p.db, p.roots);

    const a = fragmente(src), b = fragmente(out);
    // Ohne diese Zählung prüfte eine leere Schleife nichts (ADR-v9-200).
    expect(a.anzahl.size).toBeGreaterThan(10_000);

    const fehlend: string[] = [];
    for (const [k, n] of a.anzahl) {
      const d = n - (b.anzahl.get(k) ?? 0);
      if (d > 0) fehlend.push(`${d}x ${a.beispiel.get(k)!.slice(0, 160)}`);
    }
    expect(fehlend.filter((z) => !ERWARTET_WEG.test(z))).toEqual([]);
  });
});
