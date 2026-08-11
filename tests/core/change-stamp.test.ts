// tests/core/change-stamp.test.ts — BL-337: `CHAN` wird gelesen, geschrieben und gepflegt.
//
// DIE GEFÄHRLICHE STELLE IST DIE IDEMPOTENZ, nicht das Schreiben. Ein Änderungsstempel, der
// bei jedem Speichern weiterwandert, bricht RT-1 (`out1===out2`) und macht aus jedem
// stillen Auto-Save eine Dateiänderung — bei einer Arbeitskopie, die im Hintergrund läuft,
// also aus jedem Wimpernschlag. Genau deshalb sitzt der Stempel an der MUTATION
// (`withChangeStamps`, aufgerufen aus `commit`) und nicht im Writer: das Modell trägt den
// Wert, der Writer sieht ihn als gewöhnliches Feld, und ein Speichern ohne Edit findet
// nichts vor, was sich geändert hätte. Der dritte Test unten ist der, der das festhält.
import { describe, it, expect } from 'vitest';
import {
  parseGedcom, serializeGedcom, applyDatabaseToRoots,
  gedcomChangeStamp, changeStampToEpoch, epochToChangeStamp,
} from '../../core/interop';
import { withChangeStamps, savePerson } from '../../core/model';

const STAMP = '11 AUG 2026 07:30:00';

const DOK = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '1 CHAR UTF-8',
  '0 @I1@ INDI',
  '1 NAME Anna /Muster/',
  '1 FAMS @F1@',
  '1 CHAN',
  '2 DATE 3 APR 2026',
  '3 TIME 12:03:12',
  '0 @I2@ INDI',
  '1 NAME Bernd /Muster/',
  '1 FAMS @F1@',
  '1 CHAN',
  '2 DATE 1 JAN 2020',
  '0 @F1@ FAM',
  '1 HUSB @I2@',
  '1 WIFE @I1@',
  '1 CHAN',
  '2 DATE 5 MAY 2025',
  '3 TIME 08:00:00',
  '0 @S1@ SOUR',
  '1 TITL Kirchenbuch',
  '1 CHAN',
  '2 DATE 6 JUN 2024',
  '0 @R1@ REPO',
  '1 NAME Bistumsarchiv',
  '1 CHAN',
  '2 DATE 7 JUL 2023',
  '0 TRLR',
  '',
].join('\n');

describe('CHAN lesen (BL-337)', () => {
  it('füllt lastChanged an allen vier vormals stummen Record-Arten', () => {
    const { db } = parseGedcom(DOK);
    // Die Person konnte es schon immer …
    expect(db.individuals.get('@I1@')!.lastChanged).toBe('3 APR 2026 12:03:12');
    // … diese vier hatten das Modellfeld, aber keinen Parser dafür.
    expect(db.families.get('@F1@')!.lastChanged).toBe('5 MAY 2025 08:00:00');
    expect(db.sources.get('@S1@')!.lastChanged).toBe('6 JUN 2024');
    expect(db.repositories.get('@R1@')!.lastChanged).toBe('7 JUL 2023');
  });

  it('kommt ohne TIME aus (der Tag allein ist ein gültiges CHAN)', () => {
    const { db } = parseGedcom(DOK);
    expect(db.individuals.get('@I2@')!.lastChanged).toBe('1 JAN 2020');
  });
});

describe('withChangeStamps (BL-337)', () => {
  it('datiert nur, was ein Kommando angefasst hat', () => {
    const { db } = parseGedcom(DOK);
    const p = db.individuals.get('@I1@')!;
    const next = { ...db, individuals: savePerson(db.individuals, { ...p, name: 'Anna /Anders/' }) };
    const gestempelt = withChangeStamps(db, next, STAMP);

    expect(gestempelt.individuals.get('@I1@')!.lastChanged).toBe(STAMP);
    // Die unberührte zweite Person behält ihren Stempel — und bleibt REFERENZGLEICH:
    // daran hängt der Kurzschluss des Writers, der sie byte-treu durchreicht.
    expect(gestempelt.individuals.get('@I2@')!.lastChanged).toBe('1 JAN 2020');
    expect(gestempelt.individuals.get('@I2@')).toBe(db.individuals.get('@I2@'));
    expect(gestempelt.families.get('@F1@')!.lastChanged).toBe('5 MAY 2025 08:00:00');
  });

  it('gibt bei unverändertem Stand denselben Stand zurück (kein neues Objekt)', () => {
    const { db } = parseGedcom(DOK);
    expect(withChangeStamps(db, db, STAMP)).toBe(db);
  });

  it('datiert auch eine NEU angelegte Entität', () => {
    const { db } = parseGedcom(DOK);
    const p = { ...db.individuals.get('@I1@')!, id: '@I9@', lastChanged: '' };
    const next = { ...db, individuals: savePerson(db.individuals, p) };
    expect(withChangeStamps(db, next, STAMP).individuals.get('@I9@')!.lastChanged).toBe(STAMP);
  });
});

describe('CHAN schreiben und stabil bleiben (BL-337)', () => {
  it('ein gestempelter Record bekommt sein CHAN in die Datei — auf allen vier Arten', () => {
    const doc = parseGedcom(DOK);
    // Alle Entitäten „anfassen" (neue Objektidentität), wie es ein Kommando täte.
    const angefasst = {
      ...doc.db,
      individuals: new Map([...doc.db.individuals].map(([k, v]) => [k, { ...v }])),
      families: new Map([...doc.db.families].map(([k, v]) => [k, { ...v }])),
      sources: new Map([...doc.db.sources].map(([k, v]) => [k, { ...v }])),
      repositories: new Map([...doc.db.repositories].map(([k, v]) => [k, { ...v }])),
    };
    const db = withChangeStamps(doc.db, angefasst, STAMP);
    const out = serializeGedcom({ db, roots: applyDatabaseToRoots(db, doc.roots) });
    const zeilen = out.split('\n').map((z) => z.trim());

    expect(zeilen.filter((z) => z === '2 DATE 11 AUG 2026')).toHaveLength(5);
    expect(zeilen.filter((z) => z === '3 TIME 07:30:00')).toHaveLength(5);
    for (const alt of ['3 APR 2026', '5 MAY 2025', '6 JUN 2024', '7 JUL 2023']) {
      expect(out, `der alte Stempel ${alt} muss ersetzt sein, nicht ergänzt`).not.toContain(alt);
    }
  });

  it('RT-1: Speichern OHNE Edit lässt jeden Stempel stehen — auch zweimal hintereinander', () => {
    // Das ist der Test, für den dieser ganze Aufbau existiert. Läge der Stempel im Writer,
    // wanderte er hier bei jedem Durchlauf weiter und `out1 === out2` fiele.
    const doc = parseGedcom(DOK);
    const roots1 = applyDatabaseToRoots(doc.db, doc.roots);
    const out1 = serializeGedcom({ db: doc.db, roots: roots1 });
    const roots2 = applyDatabaseToRoots(doc.db, roots1);
    const out2 = serializeGedcom({ db: doc.db, roots: roots2 });

    expect(out1).toBe(out2);
    expect(out1).toContain('2 DATE 3 APR 2026');
    expect(out1).toContain('2 DATE 5 MAY 2025');
  });

  it('nach einem Edit ist der Stand ebenfalls wieder stabil (kein Weiterwandern)', () => {
    const doc = parseGedcom(DOK);
    const p = doc.db.individuals.get('@I1@')!;
    const db = withChangeStamps(
      doc.db,
      { ...doc.db, individuals: savePerson(doc.db.individuals, { ...p, name: 'Anna /Anders/' }) },
      STAMP,
    );
    const roots1 = applyDatabaseToRoots(db, doc.roots);
    const out1 = serializeGedcom({ db, roots: roots1 });
    // Zweiter Durchlauf, KEIN weiterer Edit, KEIN neuer Stempel (commit lief nicht).
    const out2 = serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots1) });

    expect(out1).toBe(out2);
    expect(out1).toContain('2 DATE 11 AUG 2026');
    // Nur die bearbeitete Person ist neu datiert — die andere trägt ihren Dateiwert.
    expect(out1).toContain('2 DATE 1 JAN 2020');
  });
});

describe('Stempel-Umrechnung GEDCOM ↔ GRAMPS (BL-337)', () => {
  it('gedcomChangeStamp liefert die Form, die parseChan wieder liest', () => {
    expect(gedcomChangeStamp(new Date(Date.UTC(2026, 7, 11, 7, 30, 0)))).toBe(STAMP);
  });

  it('rechnet verlustfrei in GRAMPS-Epochensekunden und zurück', () => {
    const epoch = changeStampToEpoch(STAMP);
    expect(epoch).toBe(String(Date.UTC(2026, 7, 11, 7, 30, 0) / 1000));
    expect(epochToChangeStamp(epoch)).toBe(STAMP);
  });

  it('ein Stempel ohne Uhrzeit rechnet auf Mitternacht', () => {
    expect(changeStampToEpoch('1 JAN 2020')).toBe(String(Date.UTC(2020, 0, 1) / 1000));
  });

  it('unlesbar oder leer → „0" bzw. leerer Stempel, nicht 1.1.1970 in der Anzeige', () => {
    // GRAMPS' eigener Wert für „unbekannt" ist 0 — der Rückweg darf daraus KEIN Datum
    // machen, sonst stünde an jedem GRAMPS-Record „Geändert 1. Januar 1970".
    expect(changeStampToEpoch('')).toBe('0');
    expect(changeStampToEpoch('irgendwann letztes Jahr')).toBe('0');
    expect(changeStampToEpoch('3 FOO 2026')).toBe('0');
    expect(epochToChangeStamp('0')).toBe('');
    expect(epochToChangeStamp('')).toBe('');
    expect(epochToChangeStamp('keine Zahl')).toBe('');
  });
});
