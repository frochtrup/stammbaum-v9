// ui/views/reports/index.ts — Katalog der §4-Druck-Ausgaben (Spec 20 §4). EINE Liste, aus
// der der Ausgaben-Hub (ReportsView) seine Einträge projiziert — keine zweite, in der View
// gehaltene Report-Liste. Jeder Builder ist eine reine Renderfunktion (Datenmodell → HTML),
// die die geteilte Hülle (services/reports) nach unten verwendet.
import type { Database, PersonId } from '../../../core/model/types';
import { buildAncestorList } from './ancestor-list';
import { buildFamilyGroupSheet } from './family-group-sheet';
import { buildBibliography } from './bibliography';
import { buildResearchLogReport } from './research-log-report';
import { buildDAbovilleReport } from './daboville-report';
import { buildRelationshipProof } from './relationship-proof';

export { buildAncestorList, buildFamilyGroupSheet, buildBibliography, buildResearchLogReport, buildDAbovilleReport };
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
  /** Reine Renderfunktion → standalone-HTML. `personId` nur für `needsPerson`-Reports. */
  build: (db: Database, generatedOn: string, personId: PersonId | null) => string;
}

/** Reihenfolge = §4-Tabelle (soweit in diesem Bauabschnitt umgesetzt: #1–#4, #6). */
export const REPORTS: readonly ReportDef[] = [
  {
    id: 'ancestor-list', no: 1, label: 'Ahnenliste', needsPerson: true,
    description: 'Kekulé-Tabelle aller Vorfahren des Probanden.',
    build: (db, on, pid) => buildAncestorList(db, requirePerson(pid), on),
  },
  {
    id: 'family-group-sheet', no: 2, label: 'Familienbogen', needsPerson: true,
    description: 'Druckblatt einer Person: Eltern, Geschwister, Ehen, Kinder, Quellen.',
    build: (db, on, pid) => buildFamilyGroupSheet(db, requirePerson(pid), on),
  },
  {
    id: 'bibliography', no: 3, label: 'Quellenverzeichnis', needsPerson: false,
    description: 'Bibliographie mit Belegzählung je Quelle und Orphan-Markierung.',
    build: (db, on) => buildBibliography(db, on),
  },
  {
    id: 'research-log', no: 4, label: 'Forschungsprotokoll', needsPerson: false,
    description: 'Gedruckte Fassung der Protokoll-Einträge, personen-/familienweise gruppiert.',
    build: (db, on) => buildResearchLogReport(db, on),
  },
  {
    id: 'daboville', no: 6, label: 'Nachkommentafel', needsPerson: true,
    description: 'Nummerierte Nachkommenliste in d’Aboville-Nummerierung.',
    build: (db, on, pid) => buildDAbovilleReport(db, requirePerson(pid), on),
  },
];

function requirePerson(pid: PersonId | null): PersonId {
  if (!pid) throw new Error('Dieser Report braucht eine ausgewählte Person.');
  return pid;
}
