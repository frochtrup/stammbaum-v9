// tests/roundtrip/gramps-reporef-callno.test.ts — BL-245 (ADR-v9-180).
//
// Signatur und Signatur-Medium haben in GRAMPS ein NATIVES Zuhause — nur nicht im
// `<source>`, sondern eine Ebene tiefer am `<reporef>`:
//
//   <!ATTLIST reporef hlink IDREF #REQUIRED  callno CDATA #IMPLIED  medium CDATA #IMPLIED>
//
// v9 hat beide bis BL-245 weder gelesen noch geschrieben. Der Kommentar in
// cross-gedcom-to-gramps.test.ts führte `source.callNumber` deshalb als „kein direktes
// <source>-Gegenstück" — richtig gelesen, falsch geschlossen.
//
// Die Wertabbildung des `medium` stammt aus den GRAMPS-Quellen selbst (libgedcom.py::
// MEDIA_MAP + srcmediatype.py::_DATAMAP), nicht aus einer Bestandsdatei: `manuscript` →
// `Manuscript`. Der Realbestand nutzt `medium="Book"` an 9 `reporef`.

import { describe, it, expect } from 'vitest';
import { parseGedcom, parseXMLText, applyDatabaseToXml } from '../../core/interop';
import { buildGrampsTreeFromModel } from '../../core/interop/build-gramps-from-model';
import { grampsMediumToMedi, mediToGrampsMedium } from '../../core/interop/enum-maps';
import { attr, childrenByTag, firstChild, serializeXml } from '../../core/interop/xml-tree';
import type { XmlNode } from '../../core/interop/xml-tree';
import { REALBESTAND, realbestandText, realbestandVorhanden } from '../core/realdaten';

const GED = [
  '0 HEAD', '1 GEDC', '2 VERS 5.5.1',
  '0 @S1@ SOUR',
  '1 TITL Heiratsregister Burgsteinfurt',
  '1 REPO @R1@',
  '2 CALN P9-14, 3-2',
  '3 MEDI manuscript',
  '0 @R1@ REPO', '1 NAME Landesarchiv NRW',
  '0 TRLR',
].join('\n');

const reporefVon = (xml: string): XmlNode => {
  const { doc } = parseXMLText(xml);
  const src = childrenByTag(firstChild(doc.root, 'sources')!, 'source')[0]!;
  return firstChild(src, 'reporef')!;
};

describe('BL-245 — Signatur am <reporef>, nicht verloren', () => {
  it('Export schreibt callno + medium als native Attribute', () => {
    const xml = serializeXml(buildGrampsTreeFromModel(parseGedcom(GED).db));
    const r = reporefVon(xml);
    expect(attr(r, 'callno')).toBe('P9-14, 3-2');
    expect(attr(r, 'medium')).toBe('Manuscript'); // GRAMPS-Vokabular, nicht der GEDCOM-Rohwert
    expect(attr(r, 'hlink')).not.toBe(''); // die Archiv-Zuordnung bleibt unberührt
  });

  it('GEDCOM → GRAMPS → Modell erhält beide Werte', () => {
    const xml = serializeXml(buildGrampsTreeFromModel(parseGedcom(GED).db));
    const s = [...parseXMLText(xml).db.sources.values()][0]!;
    expect([s.callNumber, s.callMedia]).toEqual(['P9-14, 3-2', 'manuscript']);
  });

  it('die Medium-Abbildung ist auf den eindeutigen Werten umkehrbar', () => {
    for (const medi of ['book', 'manuscript', 'photo', 'newspaper', 'tombstone', 'fiche']) {
      expect(grampsMediumToMedi(mediToGrampsMedium(medi))).toBe(medi);
    }
    // Dokumentierte Grenze, von GRAMPS so gebaut: microfilm/microfiche fallen mit fiche
    // zusammen, grave mit tombstone. Der Rückweg liefert den kanonischen Wert.
    expect(mediToGrampsMedium('microfilm')).toBe('Fiche');
    expect(grampsMediumToMedi('Fiche')).toBe('fiche');
    // Unbekanntes reist wörtlich — GRAMPS legt es als CUSTOM mit genau diesem Text ab.
    expect(mediToGrampsMedium('Pergamentrolle')).toBe('Pergamentrolle');
    expect(grampsMediumToMedi('Pergamentrolle')).toBe('Pergamentrolle');
  });

  it('ein Signatur-Edit an einer GELADENEN GRAMPS-Datei kommt an (Write-Back)', () => {
    // Die eigentliche stille Lücke: der Wert wurde nicht gelesen, also verglich der
    // Dirty-Check gegen '' und hielt den Record für unverändert — der Edit verschwand
    // beim Speichern spurlos.
    const xml = serializeXml(buildGrampsTreeFromModel(parseGedcom(GED).db));
    const { db, doc } = parseXMLText(xml);
    const s = [...db.sources.values()][0]!;
    s.callNumber = 'KB 12';
    s.callMedia = 'book';

    const r = reporefVon(serializeXml(applyDatabaseToXml(db, doc)));
    expect(attr(r, 'callno')).toBe('KB 12');
    expect(attr(r, 'medium')).toBe('Book');
    expect(attr(r, 'hlink')).not.toBe('');
  });

  it('eine geleerte Signatur entfernt NUR das Attribut, nicht das <reporef>', () => {
    // setzeAttribut löscht bei leerem Wert das ganze Element — für `hlink` richtig, hier
    // fatal: die Archiv-Zuordnung hinge mit dran.
    const xml = serializeXml(buildGrampsTreeFromModel(parseGedcom(GED).db));
    const { db, doc } = parseXMLText(xml);
    const s = [...db.sources.values()][0]!;
    s.callNumber = '';
    s.callMedia = '';

    const r = reporefVon(serializeXml(applyDatabaseToXml(db, doc)));
    expect(r.attrs.map(([k]) => k)).toEqual(['hlink']);
  });

  it('unverändert geladen bleibt die Datei byte-treu (RT-2)', () => {
    const xml = serializeXml(buildGrampsTreeFromModel(parseGedcom(GED).db));
    const { db, doc } = parseXMLText(xml);
    expect(serializeXml(applyDatabaseToXml(db, doc))).toBe(xml);
  });

  // ── Am echten Bestand (BL-246 macht ihn erst greifbar) ──────────────────────────────
  // Die Cross-Family-Fixture `MeineDaten_ancestris.ged` trägt CALN 0× — sie kann diesen
  // Fall gar nicht prüfen (TST-20: eine Fixture, die eine Form nie enthält, prüft sie auch
  // nicht). Der aktuelle Bestand hat 2, davon 1 mit MEDI.
  it.skipIf(!realbestandVorhanden())(
    `${REALBESTAND.datei}: beide CALN überleben GEDCOM → GRAMPS`,
    () => {
      const db = parseGedcom(realbestandText()).db;
      const mitSignatur = [...db.sources.values()].filter((s) => s.callNumber);
      expect(mitSignatur).toHaveLength(2);

      const xml = serializeXml(buildGrampsTreeFromModel(db));
      const zurueck = [...parseXMLText(xml).db.sources.values()].filter((s) => s.callNumber);
      expect(zurueck.map((s) => s.callNumber).sort()).toEqual(
        mitSignatur.map((s) => s.callNumber).sort(),
      );
      expect(zurueck.filter((s) => s.callMedia).map((s) => s.callMedia)).toEqual(['manuscript']);
    },
  );
});
