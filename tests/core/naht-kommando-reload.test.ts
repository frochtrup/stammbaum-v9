// tests/core/naht-kommando-reload.test.ts — die Naht „Kommando → Speichern → Neu laden"
// (BL-287, ADR-v9-196).
//
// WARUM DIESE DATEI. Ein Orts-/Hof-Kommando ist erst dann etwas wert, wenn sein Ergebnis
// den nächsten Ladepass überlebt. Genau dort saßen die beiden Defekte, die ADR-v9-196
// ausgelöst haben: `mergePlaceObjectPair` ließ `event.placeId` auf dem gelöschten
// Verlierer stehen (ADR-v9-195), und eine korrigierte Ortskette wurde beim nächsten Laden
// nicht wiedererkannt, weil die Datei ihren alten Text behielt (ADR-v9-198). Beide
// Kommandos waren einzeln geprüft; die Sequenz war es nicht.
//
// DIE FORM IST ABSICHT: eine TABELLE über die Kommandos, kein Einzelfall je Kommando.
// Wer ein neues zustandsänderndes Orts-/Hof-Kommando baut, trägt es hier ein und bekommt
// die Frage gestellt — dieselbe Bauform wie `tests/ui/place-ref-integrity.test.ts`
// (ADR-v9-83: Zwang schlägt Dokumentation). Der Wächter am Ende prüft, dass die Tabelle
// nicht hinter dem Modul zurückbleibt.
//
// EINGECHECKTE FIXTURE, KEIN REALBESTAND: die Zusicherung muss in CI gelten, nicht nur auf
// dem Rechner, auf dem die Privatdaten liegen.
import { describe, it, expect } from 'vitest';
import { parseGedcom, serializeGedcom, applyDatabaseToRoots } from '../../core/interop';
import {
  applyPlaceResolution,
  reprojectEventsOfPlace,
  reprojectEventsOf,
  reprojectHofAddrInEvents,
  renameHofAddrInEvents,
  relinkHofVillageInEvents,
  deletePlaceCascade,
  deleteHofCascade,
} from '../../services/places';
import {
  savePlaceObject,
  saveHofObject,
  mergePlaceObjects,
  mergeHofObjects,
  moveHofToVillage,
  withUpdatedHofAddr,
} from '../../core/places/index';
import type { Database } from '../../core/model/types';
import type { GedNode } from '../../core/interop';

const SRC = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '1 CHAR UTF-8',
  '0 @I1@ INDI',
  '1 NAME Franz /Ohle/',
  '1 BIRT',
  '2 DATE 10 NOV 1700',
  '2 PLAC Arpke, Amt Meinersen',
  '1 RESI',
  '2 DATE 1720',
  '2 PLAC Arpke, Amt Meinersen',
  '2 ADDR Hof Nr. 3',
  '0 @I2@ INDI',
  '1 NAME Anna /Ohle/',
  '1 BIRT',
  '2 DATE 1705',
  '2 PLAC Dolgen, Amt Meinersen',
  '0 TRLR',
  '',
].join('\n');

/** Der echte Ladepfad: parsen + voller Auflösungspass, optional über einem bereits
 *  kuratierten Orts-/Hof-Bestand (so, wie `loadGedcomText` den orte.json-Spiegel darüberlegt). */
function laden(text: string, bestand?: Pick<Database, 'placeObjects' | 'hofObjects'>) {
  const doc = parseGedcom(text);
  if (bestand) {
    doc.db.placeObjects = new Map(bestand.placeObjects);
    doc.db.hofObjects = new Map(bestand.hofObjects);
  }
  applyPlaceResolution(doc.db);
  return doc;
}

const speichern = (db: Database, roots: GedNode[]): string =>
  serializeGedcom({ db, roots: applyDatabaseToRoots(db, roots) });

const geburt = (db: Database, id = '@I1@') => db.individuals.get(id)!.birth;
const wohnsitz = (db: Database, id = '@I1@') => db.individuals.get(id)!.events.find((e) => e.type === 'RESI')!;
const ortNamens = (db: Database, titel: string) =>
  [...db.placeObjects.values()].find((p) => p.title === titel)!;

/**
 * EIN Durchgang der Naht: laden → Kommando → speichern → neu laden.
 *
 * Der kuratierte Bestand wandert mit (zweiter Eingang des Ladepfads) — ohne ihn beginnt
 * der zweite Lauf wieder beim Seed und die Frage, ob die Kuration überlebt, stellt sich
 * gar nicht erst.
 */
function durchNaht(kommando: (db: Database) => Database) {
  const erst = laden(SRC);
  const nach = kommando(erst.db);
  const datei = speichern(nach, erst.roots);
  const zweit = laden(datei, nach);
  return { erst, nach, datei, zweit };
}

describe('Naht Kommando → Speichern → Neu laden (Orte/Höfe)', () => {
  it('savePlaceObject (Kette KORRIGIEREN): derselbe Ort, keine Dublette', () => {
    const { erst, zweit } = durchNaht((db) => {
      const amt = ortNamens(db, 'Amt Meinersen');
      const orte = new Map(db.placeObjects);
      savePlaceObject(orte, { ...amt, title: 'Vogtei Meinersen' });
      return reprojectEventsOfPlace({ ...db, placeObjects: orte }, amt.id);
    });

    expect(geburt(zweit.db).placeId).toBe(geburt(erst.db).placeId);
    expect(zweit.db.placeObjects.size).toBe(erst.db.placeObjects.size);
    expect(geburt(zweit.db).place).toContain('Vogtei Meinersen');
  });

  it('mergePlaceObjects: die Ereignisse des Verlierers hängen nach dem Reload am Überlebenden', () => {
    const { erst, zweit } = durchNaht((db) => {
      const arpke = ortNamens(db, 'Arpke');
      const dolgen = ortNamens(db, 'Dolgen');
      const orte = new Map(db.placeObjects);
      const hofs = new Map(db.hofObjects);
      const res = mergePlaceObjects(orte, hofs, arpke.id, [dolgen.id]);
      // Der Aufrufer zieht die Fremdreferenzen copy-on-write nach (`placeRemap`,
      // ADR-v9-195 Punkt 1) — genau der Schritt, dessen Fehlen den Defekt ausmachte.
      const umgehaengt: Database = {
        ...db,
        placeObjects: orte,
        hofObjects: hofs,
        individuals: new Map(
          [...db.individuals].map(([id, p]) => {
            const ziel = p.birth.placeId != null ? res.placeRemap.get(p.birth.placeId) : undefined;
            return [id, ziel ? { ...p, birth: { ...p.birth, placeId: ziel } } : p];
          }),
        ),
      };
      return reprojectEventsOfPlace(umgehaengt, arpke.id);
    });

    const ueberlebender = ortNamens(zweit.db, 'Arpke').id;
    expect(geburt(zweit.db, '@I2@').placeId).toBe(ueberlebender);
    // Kein toter Zeiger und keine neu geseedete Dublette.
    expect(zweit.db.placeObjects.has(geburt(zweit.db, '@I2@').placeId!)).toBe(true);
    expect(zweit.db.placeObjects.size).toBeLessThanOrEqual(erst.db.placeObjects.size);
  });

  it('renameHofAddrInEvents: der neue Hofname steht nach dem Reload in der Datei UND am Ereignis', () => {
    const { datei, zweit } = durchNaht((db) => {
      const hof = [...db.hofObjects.values()][0];
      const hofs = new Map(db.hofObjects);
      const neu = withUpdatedHofAddr(hof, 0, 'Hof Nr. 7', null, null);
      saveHofObject(hofs, neu);
      return renameHofAddrInEvents({ ...db, hofObjects: hofs }, hof.id, 'Hof Nr. 3', 'Hof Nr. 7');
    });

    expect(datei).toContain('Hof Nr. 7');
    expect(wohnsitz(zweit.db).addr).toBe('Hof Nr. 7');
    // Und die Bindung hält: das Ereignis findet seinen Hof nach dem Reload wieder.
    expect(wohnsitz(zweit.db).hofId).not.toBeNull();
  });

  // ADR-v9-223: die Mengen-Fassung. Anlass war ein Nutzerbefund am Import-Weg — dort gibt
  // es keinen EINEN geänderten Ort, sondern einen eingespielten Stand, aus dem der Aufrufer
  // die geänderten Objekte erst herausdifft. Hier in der schärfsten Form: ein HOF ändert
  // sich, ohne dass sein Dorf sich ändert — er liegt dann in keinem Orts-Teilbaum, den die
  // Einzel-Fassung aufspannen würde.
  it('reprojectEventsOf (Hof-Menge): die neue Adressvariante steht nach dem Reload in der Datei', () => {
    const { datei, zweit } = durchNaht((db) => {
      const hof = [...db.hofObjects.values()][0];
      const hofs = new Map(db.hofObjects);
      // Vollspeicherung des Objekts, wie `HofDetail` sie beim Anlegen/Entfernen einer
      // Adressvariante auslöst — NICHT der dedizierte Umbenenn-Pfad daneben.
      saveHofObject(hofs, { ...hof, addrs: [{ value: 'Hof Nr. 9', from: null, to: null }] });
      // Beide Repräsentationen, wie `saveHof` sie nachzieht: der eingefrorene `ADDR`-Wert
      // (nur wo er einen entfallenen Wert trägt) und danach die `PLAC`-Projektion.
      const mitAddr = reprojectHofAddrInEvents({ ...db, hofObjects: hofs }, hof.id, ['Hof Nr. 3']);
      return reprojectEventsOf(mitAddr, { hofs: [hof.id] });
    });

    expect(datei).toContain('Hof Nr. 9');
    expect(wohnsitz(zweit.db).addr).toBe('Hof Nr. 9');
    expect(wohnsitz(zweit.db).hofId).not.toBeNull();
  });

  it('moveHofToVillage + relinkHofVillageInEvents: das Ereignis liegt nach dem Reload im neuen Dorf', () => {
    const { zweit } = durchNaht((db) => {
      const hof = [...db.hofObjects.values()][0];
      const dolgen = ortNamens(db, 'Dolgen');
      const hofs = new Map(db.hofObjects);
      moveHofToVillage(hofs, hof.id, dolgen.id);
      return relinkHofVillageInEvents({ ...db, hofObjects: hofs }, hof.id, dolgen.id);
    });

    const hof = [...zweit.db.hofObjects.values()].find((h) => h.addrs.some((a) => a.value === 'Hof Nr. 3'));
    expect(hof).toBeDefined();
    expect(wohnsitz(zweit.db).placeId).toBe(hof!.villageId);
  });

  // Beide Kaskaden mit SELBSTSCHUTZ: eine „kein toter Zeiger"-Schleife über eine leere
  // Menge ist grün und beweist nichts (an genau dieser Stelle ist es dem Merge-Fall
  // nebenan passiert). Erst wird gezählt, dann geprüft.
  it('deletePlaceCascade: kein toter Zeiger übersteht den Reload', () => {
    const { zweit } = durchNaht((db) => deletePlaceCascade(db, ortNamens(db, 'Dolgen').id));

    const gebunden = [...zweit.db.individuals.values()]
      .flatMap((p) => [p.birth, p.chr, p.death, p.buri, ...p.events])
      .filter((ev) => ev.placeId != null);
    expect(gebunden.length).toBeGreaterThan(0);
    for (const ev of gebunden) expect(zweit.db.placeObjects.has(ev.placeId!)).toBe(true);
  });

  it('deleteHofCascade: dito für die Hof-Seite', () => {
    const { erst, zweit } = durchNaht((db) => deleteHofCascade(db, [...db.hofObjects.values()][0].id));

    // Hier ist die Ausgangslage der Beleg: VOR dem Kommando gab es einen gebundenen Hof.
    expect([...erst.db.hofObjects.values()].length).toBeGreaterThan(0);
    for (const p of zweit.db.individuals.values())
      for (const ev of [p.birth, p.chr, p.death, p.buri, ...p.events])
        if (ev.hofId != null) expect(zweit.db.hofObjects.has(ev.hofId)).toBe(true);
  });

  it('mergeHofObjects: der Überlebende trägt die Adresse, kein Ereignis verliert seinen Hof', () => {
    const { zweit } = durchNaht((db) => {
      // `mergeHofObjects` mutiert die übergebene Map (Copy-on-Write im Inneren) und liefert
      // den Remap zurück — NICHT die Map. Die erste Fassung dieses Tests las `res.hofs`,
      // bekam `undefined` und lud damit einen leeren Hof-Bestand: alle Assertions liefen
      // ins Leere und der Test war grün, ohne etwas zu prüfen.
      const hofs = new Map(db.hofObjects);
      const erster = [...hofs.values()][0];
      // Ein zweiter Hof im selben Dorf, damit es etwas zu mergen gibt.
      const zweiter = { ...erster, id: `${erster.id}-b`, addrs: [{ value: 'Hof Nr. 3a', from: null, to: null }] };
      saveHofObject(hofs, zweiter);
      const remap = mergeHofObjects(hofs, erster.id, [zweiter.id]);

      return {
        ...db,
        hofObjects: hofs,
        individuals: new Map(
          [...db.individuals].map(([id, p]) => [
            id,
            {
              ...p,
              events: p.events.map((e) =>
                e.hofId != null && remap.has(e.hofId) ? { ...e, hofId: remap.get(e.hofId)! } : e,
              ),
            },
          ]),
        ),
      };
    });

    // Selbstschutz zuerst: ohne einen gebundenen Hof prüfen die Zeilen darunter nichts.
    const gebunden = [...zweit.db.individuals.values()].flatMap((p) => p.events).filter((e) => e.hofId != null);
    expect(gebunden.length).toBeGreaterThan(0);
    for (const ev of gebunden) expect(zweit.db.hofObjects.has(ev.hofId!)).toBe(true);
  });
});

// Der Wächter über die Tabelle selbst: ein neues zustandsänderndes Kommando in
// `services/places/apply-resolution.ts` muss hier eine Zeile bekommen. Ohne ihn bliebe die
// Naht auf dem Stand, den sie am Bautag hatte — und genau so entstehen die Lücken, die
// ADR-v9-196 beschreibt.
describe('Wächter: jedes Nachlauf-Kommando steht in der Naht-Tabelle', () => {
  const GEPRUEFT = [
    'reprojectEventsOfPlace',
    'reprojectEventsOf',
    'reprojectHofAddrInEvents',
    'renameHofAddrInEvents',
    'relinkHofVillageInEvents',
    'deletePlaceCascade',
    'deleteHofCascade',
  ];

  it('kein exportiertes Nachlauf-Kommando fehlt', async () => {
    const mod = await import('../../services/places/apply-resolution');
    const exportiert = Object.keys(mod).filter(
      (k) => typeof (mod as Record<string, unknown>)[k] === 'function' && k !== 'applyPlaceResolution',
    );
    expect(exportiert.filter((k) => !GEPRUEFT.includes(k)).sort()).toEqual([]);
  });
});
