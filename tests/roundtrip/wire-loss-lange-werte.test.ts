// tests/roundtrip/wire-loss-lange-werte.test.ts — BL-378 (ADR-v9-281): ERZEUGTER Verlust-
// Zensus. Jeder Textwert, den das Modell hält, wird über die 255-Byte-Grenze verlängert und
// muss vollständig zurückkommen.
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
// ── Wie er arbeitet ──────────────────────────────────────────────────────────
// Modell-Ebene, nicht Wire-Ebene: an JEDEN nicht-leeren String im geparsten `db` wird ein
// 300-Zeichen-Füller ANGEHÄNGT (nicht ersetzt — der Rest des Werts bleibt semantisch heil),
// dann Write-Back → Serialisieren → neu Parsen → dieselben Pfade wieder einsammeln. Wer den
// Füller verloren hat, hat Text verloren.
//
// Angehängt statt ersetzt, und ein Füller ohne Leerzeichen: der Umbruch schneidet bewusst
// nicht neben einem Leerzeichen (BL-305/[ADR-v9-211]), im x-Block liegt jeder Schnitt also
// unkritisch. Ein Leerzeichen trennt ihn vom Originalwert, damit `PLAC`/`NAME` lesbar bleiben.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGedcom, applyDatabaseToRoots, serializeGedcom } from '../../core/interop';
import type { Database } from '../../core/model/types';

const FIXTURE = join(__dirname, '../fixtures/passthrough-matrix.small.ged');
/** 300 Zeichen — sicher über die 255-Byte-Grenze hinaus, auch hinter einem kurzen Wert. */
const FUELLER = ' ' + 'x'.repeat(300);

/**
 * Schlüssel, die KEIN Freitext sind und deshalb nicht verlängert werden. Jede Zeile nennt den
 * Grund; die Liste ist bewusst kurz und wächst nur mit Beleg (ein „sicherheitshalber"
 * ausgenommenes Feld ist ein ungeprüftes Feld).
 */
const KEINE_TEXTE = new Set([
  // Identitäten und Verweise: ein verlängerter Schlüssel zeigt ins Leere, das prüft nichts.
  'id', 'xref', 'mediaId', 'personRef', 'sourceId', 'sourceRef', 'repoRef', 'taskId',
  'husband', 'wife', 'children', 'parentIn', 'aliases', 'noteRefs', 'grampsHandle',
  'grampsId', 'famId', 'placeId', 'hofId', 'familyId', 'refs',
  // `Media.file` IST die Identität (`db.media` ist danach geschlüsselt, ADR-v9-124) — ein
  // verlängerter Pfad legt einen anderen Datensatz an, der Pfad-Vergleich liefe ins Leere.
  // Der lange FILE-Pfad hat deshalb einen eigenen, gezielten Test weiter unten; er ist im
  // Realbestand mit 202 Zeichen der Wert, der der 246er-Klippe am nächsten steht.
  'file',
  // Aus dem HEAD abgeleitet, und der HEAD wird VERBATIM geschrieben (TST-3, `writeHead`):
  // das Modell speist diese zwei nicht zurück, ein Füller könnte gar nicht ankommen.
  'gedVersion', 'placForm',
  // Aufzählungen: das Modell normalisiert sie beim Lesen (`_RESULT`→pending, `SEX U`,
  // `_HSTAT`, `PEDI`, MIME aus `FORM`). Ein Füller macht daraus einen Default — das wäre
  // Wert-Drift, nicht Textverlust, und dafür ist `wire-value-drift` zuständig.
  'result', 'sex', 'status', 'weight', 'kind', 'pedigree', 'form', 'formWire', 'quay',
  'restriction', 'wireOrigin',
  // `_EVAL`-Achsen (Spec 12 §3): drei feste Vokabeln. `informant` daneben IST Freitext und
  // wird geprüft — die Ausnahme gilt der Aufzählung, nicht dem ganzen Block.
  'source', 'information', 'evidence',
  // `Event.type` ist der TAG-Name (`BIRT`/`OCCU`), `Media.type` die `MEDI`-Vokabel — beides
  // Struktur, kein Text. Der Freitext daneben heißt `eventType` (`2 TYPE …`) und wird geprüft.
  'type',
  // Abgeleitet bzw. beim Lesen eingefroren, nie geschrieben: `deepLinkUrl` ist die `mediaId`
  // des ersten Mediums, `typeWire` der Vergleichswert für „hat jemand den Typ angefasst?"
  // (BL-306). Beide entstehen beim Parsen neu — ein Füller kann sie nicht erreichen.
  'deepLinkUrl', 'typeWire',
  // Vom Modell erzeugte Stempel/Struktur, keine Nutzereingabe.
  'lastChanged', 'seen', 'sexSeen', 'formSeen', 'typeSeen', 'primary',
  // Roher Passthrough-Baum (GedNode[]): er reist unverändert durch, das prüfen andere Tests.
  'extra', 'addrExtra', 'dataExtra', 'raw', 'roots', 'header',
]);

/** Rekursiv jeden Freitext verlängern; liefert die Pfad→Wert-Karte der Änderungen. */
function verlaengere(wert: unknown, pfad: string, treffer: Map<string, string>): unknown {
  if (typeof wert === 'string') {
    if (wert === '') return wert;
    const neu = wert + FUELLER;
    treffer.set(pfad, neu);
    return neu;
  }
  if (Array.isArray(wert)) return wert.map((x, i) => verlaengere(x, `${pfad}/${i}`, treffer));
  if (wert instanceof Map) {
    return new Map([...wert].map(([k, v]) => [k, verlaengere(v, `${pfad}/${String(k)}`, treffer)]));
  }
  if (wert && typeof wert === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(wert)) {
      out[k] = KEINE_TEXTE.has(k) ? v : verlaengere(v, `${pfad}/${k}`, treffer);
    }
    return out;
  }
  return wert;
}

/** Dieselben Pfade im neu gelesenen Modell wieder einsammeln (gleiche Regeln, ohne Mutation). */
function sammle(wert: unknown, pfad: string, treffer: Map<string, string>): void {
  if (typeof wert === 'string') {
    if (wert !== '') treffer.set(pfad, wert);
    return;
  }
  if (Array.isArray(wert)) {
    wert.forEach((x, i) => sammle(x, `${pfad}/${i}`, treffer));
    return;
  }
  if (wert instanceof Map) {
    for (const [k, v] of wert) sammle(v, `${pfad}/${String(k)}`, treffer);
    return;
  }
  if (wert && typeof wert === 'object') {
    for (const [k, v] of Object.entries(wert)) if (!KEINE_TEXTE.has(k)) sammle(v, `${pfad}/${k}`, treffer);
  }
}

describe('BL-378 — erzeugter Verlust-Zensus: lange Werte überleben den Neubau', () => {
  it('jeder verlängerte Textwert kommt vollständig zurück', () => {
    const src = readFileSync(FIXTURE, 'utf8');
    const p = parseGedcom(src);

    const erwartet = new Map<string, string>();
    const db = verlaengere(p.db, '', erwartet) as Database;
    // Zählung VOR der Zusicherung ([ADR-v9-200]): eine Schleife über eine leere Menge ist
    // grün und wertlos. Gemessen sind es 57 Felder; die Schwelle steht lose darunter, damit
    // sie nicht bei jeder legitimen Modell-Änderung nachgezogen werden muss — sie fängt den
    // Fall „die Fixture ist zusammengeschrumpft", nicht die Zahl selbst.
    expect(erwartet.size).toBeGreaterThan(50);

    const out = serializeGedcom({ db, roots: applyDatabaseToRoots(db, p.roots) });
    const zurueck = new Map<string, string>();
    sammle(parseGedcom(out).db, '', zurueck);

    const verloren: string[] = [];
    for (const [pfad, soll] of erwartet) {
      const ist = zurueck.get(pfad);
      if (ist !== soll) verloren.push(`${pfad}: ${ist === undefined ? '(Pfad fehlt)' : `${ist.length} statt ${soll.length} Zeichen`}`);
    }
    expect(verloren).toEqual([]);
  });

  // Der Gegenpart zur `file`-Ausnahme oben: der Medienpfad IST die Identität, er kann im
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
    const out = serializeGedcom({ db: p.db, roots: applyDatabaseToRoots(p.db, p.roots) });
    const zurueck = parseGedcom(out);
    expect(zurueck.db.individuals.get('@I1@')!.media[0].mediaId).toBe(lang);
    expect(zurueck.db.media.get(lang)?.file).toBe(lang);
  });

  it('die 255-Byte-Grenze wird dabei eingehalten (der Umbruch findet statt)', () => {
    const src = readFileSync(FIXTURE, 'utf8');
    const p = parseGedcom(src);
    const db = verlaengere(p.db, '', new Map()) as Database;
    const out = serializeGedcom({ db, roots: applyDatabaseToRoots(db, p.roots) });
    const zuLang = out.split('\r\n').filter((z) => Buffer.byteLength(z, 'utf8') > 255);
    expect(zuLang).toEqual([]);
    // Und der Umbruch hat wirklich stattgefunden — sonst prüfte der Test oben nichts.
    expect(out.split('\r\n').filter((z) => /^\d+ CONC /.test(z)).length).toBeGreaterThan(30);
  });
});
