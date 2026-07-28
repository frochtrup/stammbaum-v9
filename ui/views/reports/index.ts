// ui/views/reports/index.ts — Katalog der §4-Druck-Ausgaben (Spec 20 §4). EINE Liste, aus
// der der Ausgaben-Hub (ReportsView) seine Einträge projiziert — keine zweite, in der View
// gehaltene Report-Liste. Jeder Builder ist eine reine Renderfunktion (Datenmodell → HTML),
// die die geteilte Hülle (services/reports) nach unten verwendet.
import type { Database, PersonId } from '../../../core/model/types';
import type { PlaceContext } from '../../../core/places';
import { buildAncestorList } from './ancestor-list';
import { buildFamilyGroupSheet } from './family-group-sheet';
import { buildBibliography } from './bibliography';
import { buildResearchLogReport } from './research-log-report';
import { buildDAbovilleReport } from './daboville-report';
import { buildRelationshipProof } from './relationship-proof';
import { buildFamilyBook } from './family-book';
import { buildLocalFamilyBook } from './local-family-book';
import { buildFarmChronicle } from './farm-chronicle';
import { buildPlaceGazetteer } from './place-gazetteer';

export {
  buildAncestorList, buildFamilyGroupSheet, buildBibliography, buildResearchLogReport,
  buildDAbovilleReport, buildFamilyBook, buildLocalFamilyBook, buildFarmChronicle, buildPlaceGazetteer,
};
// Report #9 (BL-175) braucht ZWEI Personen und wird deshalb NICHT über den Ein-Personen-
// Katalog (REPORTS) erzeugt, sondern aus dem Beziehungsrechner-Werkzeug heraus (die einzige
// Stelle mit beiden Personen zur Hand, INV-UI-2) — hier nur re-exportiert.
export { buildRelationshipProof };

export interface ReportDef {
  id: string;
  /** Ausgaben-Nummer aus der §4-Tabelle. */
  no: number;
  label: string;
  description: string;
  /** Braucht dieser Report eine Bezugs-/Wurzelperson (Ahnenliste/Familienbogen/Nachkommen)? */
  needsPerson: boolean;
  /** Reine Renderfunktion → standalone-HTML. `ctx` = PlaceContext für orts-/hofbezogene
   *  Ausgaben (#11/#12/#13); `personId` nur für `needsPerson`-Reports. */
  build: (db: Database, ctx: PlaceContext, generatedOn: string, personId: PersonId | null) => string;
}

/** Reihenfolge = §4-Tabelle (umgesetzt: #1–#4, #6, #7, #11, #12, #13). */
export const REPORTS: readonly ReportDef[] = [
  {
    id: 'ancestor-list', no: 1, label: 'Ahnenliste', needsPerson: true,
    description: 'Kekulé-Tabelle aller Vorfahren des Probanden.',
    build: (db, _ctx, on, pid) => buildAncestorList(db, requirePerson(pid), on),
  },
  {
    id: 'family-group-sheet', no: 2, label: 'Familienbogen', needsPerson: true,
    description: 'Druckblatt einer Person: Eltern, Geschwister, Ehen, Kinder, Quellen.',
    build: (db, _ctx, on, pid) => buildFamilyGroupSheet(db, requirePerson(pid), on),
  },
  {
    id: 'bibliography', no: 3, label: 'Quellenverzeichnis', needsPerson: false,
    description: 'Bibliographie mit Belegzählung je Quelle und Orphan-Markierung.',
    build: (db, _ctx, on) => buildBibliography(db, on),
  },
  {
    id: 'research-log', no: 4, label: 'Forschungsprotokoll', needsPerson: false,
    description: 'Gedruckte Fassung der Protokoll-Einträge, personen-/familienweise gruppiert.',
    build: (db, _ctx, on) => buildResearchLogReport(db, on),
  },
  {
    id: 'daboville', no: 6, label: 'Nachkommentafel', needsPerson: true,
    description: 'Nummerierte Nachkommenliste in d’Aboville-Nummerierung.',
    build: (db, _ctx, on, pid) => buildDAbovilleReport(db, requirePerson(pid), on),
  },
  {
    id: 'family-book', no: 7, label: 'Familienbuch', needsPerson: true,
    description: 'Buchreife Ausgabe: Coverfoto, Inhaltsverzeichnis, Ahnen-Sektionen, Glossar, Namenindex.',
    build: (db, _ctx, on, pid) => buildFamilyBook(db, requirePerson(pid), on),
  },
  {
    id: 'local-family-book', no: 11, label: 'Ortssippenbuch', needsPerson: false,
    description: 'Familien nach Ort gruppiert, je Familie ein erzählender Kurztext.',
    build: (db, ctx, on) => buildLocalFamilyBook(db, ctx, on),
  },
  {
    id: 'farm-chronicle', no: 12, label: 'Hofchronik', needsPerson: false,
    description: 'Ort › Hof › Eigentümer/Bewohner mit Zu- und Wegzug.',
    build: (db, ctx, on) => buildFarmChronicle(db, ctx, on),
  },
  {
    id: 'place-gazetteer', no: 13, label: 'Ortsbuch', needsPerson: false,
    description: 'Ortssortiertes Nachschlagewerk: Namensvarianten, Zugehörigkeit, Ereignisse samt Personen.',
    build: (db, ctx, on) => buildPlaceGazetteer(db, ctx, on),
  },
];

function requirePerson(pid: PersonId | null): PersonId {
  if (!pid) throw new Error('Dieser Report braucht eine ausgewählte Person.');
  return pid;
}
