// tests/roundtrip/wire-loss-lange-werte.test.ts — M1 (BL-378, [ADR-v9-281]): jeder Textwert,
// den das Modell hält, wird über die 255-Byte-Grenze verlängert und muss vollständig
// zurückkommen. Erste Mutation an der geteilten Naht (`wire-mutation-harness.ts`).
//
// WARUM ES DIESEN ZENSUS BRAUCHT, OBWOHL ES SCHON DREI GIBT. Die vorhandenen Zensen
// (wire-loss-classes/-rest, wire-value-drift, wire-loss-realbestand) fragen alle: „fehlt nach
// dem Neubau Text, DER IN DER DATEI STEHT?" Sie sehen deshalb nur Formen, die eine Datei
// bereits trägt. Genau daran ist BL-378 vorbeigelaufen: `_QUERY` wird von der Import-
// Vergleichs-Fläche erzeugt und kann beliebig lang werden — im gepinnten Realbestand steht
// aber kein `_QUERY` über 119 Zeichen, also keine Fortsetzung, also nichts zu sehen. Der
// Verlust entstand erst zur LAUFZEIT: die Arbeitskopie in IndexedDB ist serialisierter
// GEDCOM-Text, der Serialisierer bricht bei 255 Bytes per `CONC` um, und die nächste
// Lesung schnitt den Rest ab (306 Zeichen rein, 246 zurück).
//
// Dieser Zensus dreht die Frage um: er ERZEUGT die Form, statt auf sie zu warten. Damit deckt
// er die Klasse und nicht den Einzelfall — [ADR-v9-266] hatte die Geschwister (`PLAC`/`TYPE`/
// `PAGE`/`FILE`) bewusst liegen lassen, weil sie „heute ohne Daten im Bestand" seien; ein neues
// Textfeld im Modell ist ab jetzt automatisch mitgeprüft, ohne dass jemand daran denkt.
//
// Angehängt statt ersetzt, und ein Füller ohne Leerzeichen: der Umbruch schneidet bewusst
// nicht neben einem Leerzeichen (BL-305/[ADR-v9-211]), im x-Block liegt jeder Schnitt also
// unkritisch. Ein Leerzeichen trennt ihn vom Originalwert, damit `PLAC`/`NAME` lesbar bleiben.
import { describe, it, expect } from 'vitest';
import { parseGedcom } from '../../core/interop';
import { rundlauf, abweichungen, korpusText, mutiereTexte, schreibe } from './wire-mutation-harness';

/** 300 Zeichen — sicher über die 255-Byte-Grenze hinaus, auch hinter einem kurzen Wert. */
const FUELLER = ' ' + 'x'.repeat(300);
const verlaengern = (wert: string): string => wert + FUELLER;

describe('BL-378 — M1: lange Werte überleben den Neubau', () => {
  it('jeder verlängerte Textwert kommt vollständig zurück', () => {
    const { soll, ist } = rundlauf(verlaengern);
    // Zählung VOR der Zusicherung ([ADR-v9-200]): eine Schleife über eine leere Menge ist
    // grün und wertlos. Gemessen sind es 57 Felder; die Schwelle steht lose darunter, damit
    // sie nicht bei jeder legitimen Modell-Änderung nachgezogen werden muss — sie fängt den
    // Fall „die Fixture ist zusammengeschrumpft", nicht die Zahl selbst.
    expect(soll.size).toBeGreaterThan(50);
    expect(abweichungen(soll, ist)).toEqual([]);
  });

  // Der Gegenpart zur `file`-Ausnahme der Naht: der Medienpfad IST die Identität, er kann im
  // generischen Lauf nicht mitverlängert werden — geprüft wird er trotzdem, denn im
  // Realbestand ist er mit 202 Zeichen der Wert, der der 246-Zeichen-Klippe am nächsten steht.
  // Ginge er verloren, zeigte die Medienreferenz danach ins Nichts.
  it('ein FILE-Pfad über der Byte-Grenze überlebt (Medien-Identität)', () => {
    const lang = 'bilder/' + 'p'.repeat(300) + '.jpg';
    const src = [
      '0 HEAD', '1 GEDC', '2 VERS 5.5.1',
      '0 @I1@ INDI', '1 NAME Max /Muster/', '1 OBJE', `2 FILE ${lang}`, '3 FORM jpg',
      '0 TRLR',
    ].join('\n');
    const p = parseGedcom(src);
    const zurueck = parseGedcom(schreibe(p.db, p.roots));
    expect(zurueck.db.individuals.get('@I1@')!.media[0].mediaId).toBe(lang);
    expect(zurueck.db.media.get(lang)?.file).toBe(lang);
  });

  it('die 255-Byte-Grenze wird dabei eingehalten (der Umbruch findet statt)', () => {
    const p = parseGedcom(korpusText());
    const { db } = mutiereTexte(p.db, verlaengern);
    const out = schreibe(db, p.roots);
    const zuLang = out.split('\r\n').filter((z) => Buffer.byteLength(z, 'utf8') > 255);
    expect(zuLang).toEqual([]);
    // Und der Umbruch hat wirklich stattgefunden — sonst prüfte der Test oben nichts.
    expect(out.split('\r\n').filter((z) => /^\d+ CONC /.test(z)).length).toBeGreaterThan(30);
  });
});
