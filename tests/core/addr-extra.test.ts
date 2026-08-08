// tests/core/addr-extra.test.ts — die strukturierte Adresse (ADR-v9-228).
//
// Der Anlass war ein Nutzer-Befund: „ADR2 / vollständige Adresse wird im RESI event nicht
// angezeigt". Geprüft wird deshalb die ganze Kette — parsen, anzeigen, bearbeiten,
// zurückschreiben — und NICHT nur, dass ein Feld existiert.
import { describe, expect, it } from 'vitest';
import { parseGedcom, serializeGedcom, applyDatabaseToRoots } from '../../core/interop';
import { addrDisplay, isEventEmpty, makeEvent } from '../../core/model';

/** Eine Person mit genau der Form, die im Bestand 83× vorkommt: ADDR ohne Wert, Inhalt
 *  ausschließlich in den Index-Tags. */
const GED = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '1 CHAR UTF-8',
  '0 @I1@ INDI',
  '1 NAME Anna /Bauer/',
  '1 RESI',
  '2 DATE 1920',
  '2 ADDR',
  '3 ADR1 Osterbauernschaft 41',
  '3 CITY Ochtrup',
  '3 POST 48607',
  '0 TRLR',
].join('\n');

function ersteResi(text: string) {
  const p = parseGedcom(text);
  const person = p.db.individuals.get('@I1@')!;
  return { p, ev: person.events.find((e) => e.type === 'RESI')! };
}

describe('Parser — die Index-Tags landen in addrExtra', () => {
  it('trennt Adresstext und Index-Tags: addr bleibt leer, addrExtra trägt die drei Knoten', () => {
    const { ev } = ersteResi(GED);
    expect(ev.addr).toBe(''); // Tristate: Zeile vorhanden, ohne Wert
    expect(ev.addrExtra.map((n) => n.tag)).toEqual(['ADR1', 'CITY', 'POST']);
    expect(ev.addrExtra.map((n) => n.value)).toEqual(['Osterbauernschaft 41', 'Ochtrup', '48607']);
  });

  it('CONT/CONC bleiben im Text und NICHT in addrExtra — sie sind Fortsetzungen, keine Kinder', () => {
    const mitCont = GED.replace('2 ADDR\n', '2 ADDR Hauptstr. 1\n3 CONT Hinterhaus\n');
    const { ev } = ersteResi(mitCont);
    expect(ev.addr).toBe('Hauptstr. 1\nHinterhaus');
    expect(ev.addrExtra.map((n) => n.tag)).toEqual(['ADR1', 'CITY', 'POST']);
  });

  it('ein Ereignis ohne ADDR bekommt ein leeres Array, kein null', () => {
    const ohne = GED.replace('2 ADDR\n3 ADR1 Osterbauernschaft 41\n3 CITY Ochtrup\n3 POST 48607\n', '');
    const { ev } = ersteResi(ohne);
    expect(ev.addr).toBeNull();
    expect(ev.addrExtra).toEqual([]);
  });
});

// Das Kronjuwel (LP-1): die Datei darf sich nicht verändern, solange niemand etwas ändert.
describe('Roundtrip — unverändert heißt byte-identisch', () => {
  it('lesen → schreiben lässt die strukturierte Adresse unangetastet', () => {
    const p = parseGedcom(GED);
    const out = serializeGedcom({ db: p.db, roots: applyDatabaseToRoots(p.db, p.roots) });
    for (const zeile of ['2 ADDR', '3 ADR1 Osterbauernschaft 41', '3 CITY Ochtrup', '3 POST 48607']) {
      expect(out).toContain(zeile);
    }
  });

  it('auch wenn der Record als GEÄNDERT gilt und neu gebaut wird (der eigentliche Verlustfall)', () => {
    const p = parseGedcom(GED);
    const person = p.db.individuals.get('@I1@')!;
    // Eine Änderung AN ANDERER STELLE zwingt den Writer zum Neubau des Records.
    p.db.individuals.set('@I1@', { ...person, given: 'Anna Maria' });
    const out = serializeGedcom({ db: p.db, roots: applyDatabaseToRoots(p.db, p.roots) });
    expect(out).toContain('3 ADR1 Osterbauernschaft 41');
    expect(out).toContain('3 CITY Ochtrup');
  });
});

describe('addrDisplay — die Anzeige-Projektion', () => {
  it('setzt die Index-Tags in Umschlag-Reihenfolge zusammen, wenn addr leer ist', () => {
    const { ev } = ersteResi(GED);
    expect(addrDisplay(ev)).toBe('Osterbauernschaft 41, 48607 Ochtrup');
  });

  it('reicht einen vorhandenen addr-Wert unverändert durch — keine Projektion, wo nichts fehlt', () => {
    expect(addrDisplay(makeEvent('RESI', { addr: 'Wall 33' }))).toBe('Wall 33');
  });

  it('nur ADR2 (im Bestand 10×): die zweite Zeile ohne erste erscheint trotzdem', () => {
    const nurAdr2 = GED.replace('3 ADR1 Osterbauernschaft 41\n3 CITY Ochtrup\n3 POST 48607\n', '3 ADR2 Ray Township, Indiana\n');
    const { ev } = ersteResi(nurAdr2);
    expect(addrDisplay(ev)).toBe('Ray Township, Indiana');
  });

  it('nur CITY (im Bestand 16×)', () => {
    const nurCity = GED.replace('3 ADR1 Osterbauernschaft 41\n', '').replace('3 POST 48607\n', '');
    const { ev } = ersteResi(nurCity);
    expect(addrDisplay(ev)).toBe('Ochtrup');
  });

  it('unbekannte Tags unter ADDR ergeben KEINE Kommazeile — dann lieber der rohe Wert', () => {
    const fremd = GED.replace('3 ADR1 Osterbauernschaft 41\n3 CITY Ochtrup\n3 POST 48607\n', '3 _FREMD irgendwas\n');
    const { ev } = ersteResi(fremd);
    expect(addrDisplay(ev)).toBe('');
    // …die Knoten bleiben trotzdem erhalten, sie sind nur nicht anzeigbar.
    expect(ev.addrExtra.map((n) => n.tag)).toEqual(['_FREMD']);
  });
});

describe('isEventEmpty — eine strukturierte Adresse ist kein leeres Ereignis', () => {
  it('zählt addrExtra als Inhalt (sonst bekäme die Zeile das folgenlose ✕)', () => {
    const { ev } = ersteResi(GED);
    const ohneDatum = { ...ev, date: null };
    expect(isEventEmpty(ohneDatum)).toBe(false);
  });

  it('ein Ereignis ohne alles bleibt leer', () => {
    expect(isEventEmpty(makeEvent('RESI'))).toBe(true);
  });
});

// Entscheidung 3 des ADR: ein Edit verwirft die Index-Kopien, ein Nicht-Edit rührt nichts an.
// Beides ist hier eine Zusicherung, weil beide Richtungen schiefgehen können — Verwerfen,
// wo nichts geändert wurde (Datenverlust), und Stehenlassen nach einer Änderung
// (widersprüchliche Datei).
describe('Editieren — Save-Time-No-Op vs. bewusste Änderung', () => {
  const ctx = { places: new Map(), hofs: new Map() } as never;

  it('unangetastet: das Feld zeigt die abgeleitete Fassung, das Speichern ändert NICHTS', async () => {
    const { toEditable, fromEditable } = await import('../../ui/shell/event-edit');
    const { ev } = ersteResi(GED);
    const e = toEditable('ev-0', ev, ctx);
    // Was der Nutzer sieht …
    expect(e.addr).toBe('Osterbauernschaft 41, 48607 Ochtrup');
    // … und was beim Speichern ohne Zutun herauskommt: der unveränderte Zustand.
    const zurueck = fromEditable(ev, e);
    expect(zurueck.addr).toBe('');
    expect(zurueck.addrExtra).toBe(ev.addrExtra);
  });

  it('geändert: addr trägt den neuen Text, die Index-Kopien sind weg', async () => {
    const { toEditable, fromEditable } = await import('../../ui/shell/event-edit');
    const { ev } = ersteResi(GED);
    const e = toEditable('ev-0', ev, ctx);
    e.addr = 'Neuer Weg 7';
    const zurueck = fromEditable(ev, e);
    expect(zurueck.addr).toBe('Neuer Weg 7');
    expect(zurueck.addrExtra).toEqual([]);
  });

  it('geleert: der Nutzer hat die Adresse entfernt — auch dann bleiben keine Kopien zurück', async () => {
    const { toEditable, fromEditable } = await import('../../ui/shell/event-edit');
    const { ev } = ersteResi(GED);
    const e = toEditable('ev-0', ev, ctx);
    e.addr = '';
    const zurueck = fromEditable(ev, e);
    expect(zurueck.addrExtra).toEqual([]);
  });

  // Der Grund, warum ADDR in SELBSTVERWALTETER_PASSTHROUGH steht: ohne den Eintrag holte
  // der Tiefen-Passthrough die gerade verworfenen Zeilen beim Schreiben zurück.
  it('nach dem Edit steht die neue Adresse in der Datei — und die alten Index-Tags nicht mehr', async () => {
    const { toEditable, fromEditable } = await import('../../ui/shell/event-edit');
    const p = parseGedcom(GED);
    const person = p.db.individuals.get('@I1@')!;
    const ev = person.events.find((x) => x.type === 'RESI')!;
    const e = toEditable('ev-0', ev, ctx);
    e.addr = 'Neuer Weg 7';
    const neu = fromEditable(ev, e);
    p.db.individuals.set('@I1@', { ...person, events: [neu] });

    const out = serializeGedcom({ db: p.db, roots: applyDatabaseToRoots(p.db, p.roots) });
    expect(out).toContain('2 ADDR Neuer Weg 7');
    expect(out).not.toContain('ADR1 Osterbauernschaft 41');
    expect(out).not.toContain('CITY Ochtrup');
  });
});

// Entscheidung 4: der Mangel wird gemeldet. Geprüft wird die Regel selbst, nicht nur ihre
// Existenz — ein Prädikat, das immer false liefert, wäre grün und wertlos.
describe('Validierungsregel ADDR_INDEX_ONLY', () => {
  async function pruefe(text: string) {
    const { RULES } = await import('../../core/validate/rules');
    const regel = RULES.find((r) => r.id === 'ADDR_INDEX_ONLY')!;
    const p = parseGedcom(text);
    return regel.person!(p.db.individuals.get('@I1@')!, { db: p.db } as never);
  }

  it('schlägt an, wenn die Adresse nur in den Index-Tags steht', async () => {
    const hits = await pruefe(GED);
    expect(hits).toHaveLength(1);
    expect(hits[0].text).toContain('nur in den Index-Tags');
  });

  it('schweigt bei einer regulären ADDR-Zeile', async () => {
    const ok = GED.replace('2 ADDR\n3 ADR1 Osterbauernschaft 41\n3 CITY Ochtrup\n3 POST 48607\n', '2 ADDR Wall 33\n');
    expect(await pruefe(ok)).toHaveLength(0);
  });

  it('schweigt, wenn ADR1 die ADDR-Zeile korrekt spiegelt (die Kopie IST eine)', async () => {
    const konform = GED.replace('2 ADDR\n', '2 ADDR Osterbauernschaft 41\n').replace('3 CITY Ochtrup\n3 POST 48607\n', '');
    expect(await pruefe(konform)).toHaveLength(0);
  });

  it('schlägt an, wenn ADR1 von der ADDR-Zeile ABWEICHT (heute 0×, morgen möglich)', async () => {
    const abweichend = GED.replace('2 ADDR\n', '2 ADDR Wall 33\n');
    const hits = await pruefe(abweichend);
    expect(hits).toHaveLength(1);
  });

  it('ist ℹ Hinweis und gehört zur Gruppe „format"', async () => {
    const { RULES } = await import('../../core/validate/rules');
    const regel = RULES.find((r) => r.id === 'ADDR_INDEX_ONLY')!;
    expect(regel.severity).toBe('info');
    expect(regel.group).toBe('format');
    expect(regel.defaultEnabled).toBe(true);
  });
});
