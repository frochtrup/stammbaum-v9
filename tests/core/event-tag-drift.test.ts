// tests/core/event-tag-drift.test.ts — BL-335: die Ereignistag-Listen dürfen nicht
// auseinanderlaufen.
//
// DER BEFUND, DEN ES OHNE DIESEN TEST NICHT GEGEBEN HÄTTE. Der Nutzer meldete
// „Priesterweihe wird nicht angezeigt". In der Datei stand ein vollständiges Ereignis —
// `1 ORDN Priester` mit `2 TYPE`, `2 DATE`, `2 PLAC` samt Koordinaten und `2 SOUR`. Sichtbar
// war nichts. Die Ursache lag nicht dort, wo man sie sucht: `EVENT_TYPE_LABELS` kannte
// „Ordination" längst, `timeline-model.ts` ordnete ORDN einer Spur zu, `story-templates.ts`
// hatte einen Satz dafür. Nur der Parser erzeugte den Typ nie — die halbe Kette stand, das
// erste Glied fehlte. Und ORDN war nicht allein: ZEHN Tags hatten eine Übersetzung ohne
// Erzeuger.
//
// WARUM ALSO EIN TEST UND NICHT NUR EIN FIX (CLAUDE.md „Zwang statt Erinnerung",
// ADR-v9-83): die Listen liegen in vier Dateien und drei Schichten. Wer künftig ein Label
// ergänzt, arbeitet in `ui/shell/`, sieht `core/interop/` nicht und hat keinen Anlass,
// dorthin zu schauen — das nächste Auseinanderlaufen ist eine Frage der Zeit, nicht der
// Sorgfalt. Dieser Test stellt die Frage bei jedem Lauf.
//
// Die vier Richtungen unten sind bewusst getrennt: jede kann einzeln brechen und benennt
// dann genau die Datei, in der die Ergänzung fehlt.
import { describe, it, expect } from 'vitest';
import { EVENT_TAGS, SPECIAL_EVENT_TAGS } from '../../core/interop/gedcom-parse';
import { ERKANNTE_TAGS, EREIGNIS_TAGS_PUBLIC, modellierteKinder } from '../../core/interop/write-back';
import { EVENT_TYPE_LABELS } from '../../ui/shell/event-labels';
import { otherEventMenu } from '../../ui/views/person/person-event-menu';

/** Alles, was am Ende als `Event.type` im Modell landen kann: die vier festen Slots
 *  (BIRT/CHR/DEAT/BURI) plus die generischen Tags aus `events[]`. */
const ERZEUGBAR = new Set<string>([...SPECIAL_EVENT_TAGS, ...EVENT_TAGS]);

describe('Ereignistag-Drift (BL-335)', () => {
  // Richtung 1 — die, an der ORDN hing. Ein Label ohne Erzeuger ist toter Code, der
  // aussieht, als sei der Typ unterstützt.
  it('jeder übersetzte Ereignistyp wird vom Parser auch erzeugt', () => {
    const ohneErzeuger = Object.keys(EVENT_TYPE_LABELS).filter((t) => !ERZEUGBAR.has(t));
    expect(ohneErzeuger, 'Label in ui/shell/event-labels.ts, aber nicht in EVENT_TAGS (core/interop/gedcom-parse.ts)').toEqual([]);
  });

  // Richtung 2 — die Gegenrichtung, und die teurere: ein Menüpunkt, den der Parser nicht
  // zurücklesen kann, erzeugt ein Ereignis, das der nächste Ladevorgang still verschluckt.
  // Der Nutzer legt es an, speichert, lädt neu — und es ist weg.
  it('jeder anlegbare Ereignistyp wird beim Laden auch wieder erkannt', () => {
    const nichtLesbar = otherEventMenu.map((i) => i.tag).filter((t) => !ERZEUGBAR.has(t));
    expect(nichtLesbar, 'im „+ Ereignis"-Menü anlegbar, aber vom Parser nicht gelesen').toEqual([]);
  });

  // Richtung 3 — die latente Dublette. `parsePerson`/`parseFamily` legen jeden
  // EVENT_TAGS-Treffer in `events[]` ab, die Emitter schreiben `events[]` wieder heraus.
  // Fehlt der Tag zusätzlich in der Erkennungsmenge, gilt der Original-Knoten als
  // Passthrough — und ein geänderter Record bekäme ihn ZWEIMAL. Genau das war für `RELI`
  // unter FAM der Fall, bis BL-335 es nachzog; unbemerkt nur, weil keine Familie im
  // Bestand ein RELI trägt.
  it('jeder Ereignistag ist auf beiden Trägern als erkannt verzeichnet', () => {
    const fehltPerson = [...EVENT_TAGS].filter((t) => !ERKANNTE_TAGS.person.has(t));
    const fehltFamilie = [...EVENT_TAGS].filter((t) => !ERKANNTE_TAGS.family.has(t));
    expect(fehltPerson, 'in EVENT_TAGS, aber nicht in RECOGNIZED_PERSON → Knoten würde doppelt geschrieben').toEqual([]);
    expect(fehltFamilie, 'in EVENT_TAGS, aber nicht in RECOGNIZED_FAMILY → Knoten würde doppelt geschrieben').toEqual([]);
  });

  // Richtung 4 — der Passthrough unter dem Ereignis. `MODELLIERTE_KINDER` sagt dem
  // Write-Back, welche Kinder eines Ereignisses aus dem Modell kommen; ein fehlender
  // Eintrag lässt gelöschte Felder zurückkehren (die riskante Richtung, s. Kopf von
  // write-back.ts).
  it('jeder Ereignistag führt seine modellierten Kinder', () => {
    const ohneKinder = [...ERZEUGBAR].filter((t) => modellierteKinder(t).length === 0);
    expect(ohneKinder, 'Ereignistag ohne Eintrag in MODELLIERTE_KINDER').toEqual([]);
    // Und die Liste, aus der sich das speist, deckt dieselbe Menge ab.
    const fehltInEreignisTags = [...ERZEUGBAR].filter((t) => !EREIGNIS_TAGS_PUBLIC.includes(t));
    expect(fehltInEreignisTags, 'erzeugbarer Ereignistag fehlt in EREIGNIS_TAGS').toEqual([]);
  });
});
