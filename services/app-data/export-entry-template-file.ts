// services/app-data/export-entry-template-file.ts — EINE Erfassungs-Vorlage raus und rein
// (Spec 20 §2, BL-354, ADR-v9-264).
//
// WOZU DIESER WEG NEBEN `app-data.json`: der laufende BESTAND an Vorlagen reist ohnehin
// im B1-Bündel über Geräte (Spec 30 §2.2/§2.3) — das braucht hier niemand nachzubauen.
// Was das Bündel nicht kann, ist EINE Vorlage weiterzugeben: an eine andere Person, in ein
// Forum, als Anhang. Genau dafür ist diese Datei da; sie ist ein Transport, kein Speicher.
//
// Läuft durch DASSELBE Export-Rohr wie die Genealogie-Datei, `orte.json` und
// `app-data.json` (`FileService.exportToFile`, INV-FILE-2/INV-FILE-3) — kein Sonderpfad,
// kein neuer Adapter-Typ, keine neue Plattform-Verzweigung.
//
// ZWEI FEHLER DES ORAKELS, BEWUSST NICHT ÜBERNOMMEN (`legacy-v8/ui-quicktpl.js`):
//  1. v8 kannte DREI Formate derselben Datei — IDB als String, OneDrive als bares Array,
//     Export als `{version, templates}` (Z. 195–244). Legte man die exportierte Datei in
//     den Konfigordner, schlug `Array.isArray` fehl und sie wurde STILL ignoriert. Hier
//     wird genau eine Form geschrieben; gelesen wird zusätzlich das bare Array, damit eine
//     alte Datei nicht verlorengeht (Read-Tolerance, LP-6).
//  2. `importQuickTemplatesFile` ERSETZTE die Liste komplett (Z. 227–244) — ein Import
//     löschte also alles, was der Nutzer selbst gebaut hatte. Hier wird zusammengeführt,
//     und eine kollidierende id bekommt eine neue statt den lokalen Stand zu überschreiben.
import type { FileService } from '../file/file-service';
import type { PickerAdapter, SaveResult } from '../file/types';
import type { EntryTemplate } from '../../core/model/entry-templates';
import { normalizeEntryTemplate } from '../../core/model/entry-templates';

export const ENTRY_TEMPLATES_FILENAME = 'vorlage.json';
export const ENTRY_TEMPLATES_SCHEMA_VERSION = 1;
const MIME_TYPE = 'application/json';

/** Die eine geschriebene Form. Eine Liste, obwohl der Normalfall eine Vorlage ist —
 *  so ist „mehrere weitergeben" dieselbe Datei und kein zweites Format. */
export interface EntryTemplateFile {
  schemaVersion: number;
  templates: EntryTemplate[];
}

export function serializeEntryTemplates(templates: readonly EntryTemplate[]): string {
  const datei: EntryTemplateFile = {
    schemaVersion: ENTRY_TEMPLATES_SCHEMA_VERSION,
    templates: [...templates],
  };
  return JSON.stringify(datei, null, 2);
}

/**
 * Liest die Datei. Wirft bei Unbrauchbarem — ein halb übernommener Import wäre schlimmer
 * als gar keiner (`normalizeEntryTemplate` verwirft einzelne kaputte Felder, nicht die
 * Struktur darum herum).
 */
export function parseEntryTemplates(text: string): EntryTemplate[] {
  const roh: unknown = JSON.parse(text);
  const liste = Array.isArray(roh)
    ? roh
    : typeof roh === 'object' && roh !== null && Array.isArray((roh as EntryTemplateFile).templates)
      ? (roh as EntryTemplateFile).templates
      : null;
  if (!liste) throw new Error('Keine Erfassungs-Vorlagen in dieser Datei.');
  return liste.map((t) => normalizeEntryTemplate(t));
}

/** Aus „Taufe Ochtrup" wird `vorlage-taufe-ochtrup.json` — mehrere Exporte im selben
 *  Download-Ordner sollen unterscheidbar sein, nicht `vorlage (3).json` heißen. */
function dateiname(label?: string): string {
  if (!label) return ENTRY_TEMPLATES_FILENAME;
  const rumpf = label
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return rumpf ? `vorlage-${rumpf}.json` : ENTRY_TEMPLATES_FILENAME;
}

/** Bytes raus. `label` benennt die Datei, wenn genau eine Vorlage geht. */
export async function exportEntryTemplates(
  fileService: FileService,
  templates: readonly EntryTemplate[],
  label?: string,
): Promise<SaveResult> {
  return fileService.exportToFile(serializeEntryTemplates(templates), dateiname(label), MIME_TYPE, {});
}

/** Bytes rein. `null` = der Nutzer hat den Picker abgebrochen (kein Fehler, kein Import). */
export async function importEntryTemplates(picker: PickerAdapter): Promise<EntryTemplate[] | null> {
  const gewaehlt = await picker.pick();
  if (!gewaehlt) return null;
  return parseEntryTemplates(gewaehlt.text);
}

/**
 * Führt importierte Vorlagen mit dem Bestand zusammen — **ergänzend, nie ersetzend**.
 *
 * Eine id, die es schon gibt (im Bestand ODER unter den mitgelieferten, `gesperrteIds`),
 * wird für den Import neu vergeben: der Nutzer hat seine Fassung vielleicht bearbeitet,
 * und eine fremde Datei darf sie nicht stillschweigend überschreiben. Das Ergebnis ist
 * dann eine zweite, sichtbar danebenstehende Vorlage — sichtbar ist besser als still.
 */
export function mergeImportedTemplates(
  vorhanden: readonly EntryTemplate[],
  importiert: readonly EntryTemplate[],
  gesperrteIds: readonly string[] = [],
): EntryTemplate[] {
  const belegt = new Set<string>([...vorhanden.map((t) => t.id), ...gesperrteIds]);
  const ergebnis = [...vorhanden];

  for (const tpl of importiert) {
    let id = tpl.id;
    if (belegt.has(id)) {
      // Deterministisch (TST-3): hochzählen statt Zufall/Uhr — dieselbe Eingabe, dasselbe
      // Ergebnis, und der Bezug zur Herkunfts-id bleibt lesbar.
      let n = 2;
      while (belegt.has(`${tpl.id}-${n}`)) n++;
      id = `${tpl.id}-${n}`;
    }
    belegt.add(id);
    ergebnis.push(id === tpl.id ? tpl : { ...tpl, id });
  }
  return ergebnis;
}
