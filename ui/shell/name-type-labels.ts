// ui/shell/name-type-labels.ts — DIE EINE deutsche Übersetzung für `NAME.TYPE`-Werte
// (Hauptname `Person.nameType`, weitere Formen `PersonName.type`). Geschwister-Modul von
// `repo-labels.ts`/`place-labels.ts`, derselbe Vertrag (INV-UI-4).
//
// Vokabular aus der öffentlichen GEDCOM-5.5.1-Definition (`NAME_TYPE`: aka · birth ·
// immigrant · maiden · married, dazu Freitext) — NICHT aus dem Bestand abgelesen: eine
// Datei zeigt, was vorkommt, nie was zulässig ist (ADR-v9-175). Die Rückabbildung nach
// GRAMPS liegt bereits in `core/interop/enum-maps.ts` und bleibt dort; hier wird nur
// beschriftet.
//
// `maiden` und `birth` sind in GEDCOM zwei Werte, in GRAMPS beide „Birth Name" — die
// Unterscheidung bleibt trotzdem stehen: sie ist im deutschen Sprachgebrauch die
// wichtigste überhaupt („Geburtsname" der Frau vor der Heirat) und geht sonst beim
// nächsten Speichern verloren.
export const NAME_TYPE_LABELS: Record<string, string> = {
  birth: 'Geburtsname',
  maiden: 'Mädchenname',
  married: 'Ehename',
  aka: 'Alias / auch bekannt als',
  immigrant: 'Name nach Einwanderung',
};

/**
 * Deutsches Label für eine Namensart — für ANZEIGE-Flächen.
 *
 * Leerer Typ liefert `''`; die Fläche blendet die Beschriftung dann aus (dieselbe
 * Polarität wie `repoTypeLabel`/`placeTypeLabel`, ADR-v9-149): „ohne Angabe" ist kein
 * Dauer-Label wert. Ein unbekannter Freitext-Wert kommt roh durch — keine erfundene
 * Übersetzung, damit ein fremder Typ nicht still zu einem unserer fünf wird.
 */
export function nameTypeLabel(type: string | null | undefined): string {
  if (!type) return '';
  return NAME_TYPE_LABELS[type.toLowerCase()] ?? type;
}

/**
 * Die kuratierte Auswahl für den Editor — „anzeigen nein, auswählen ja" (dieselbe
 * Trennung wie `REPO_TYPE_OPTIONS`). Der leere Wert IST wählbar: `TYPE` ist in GEDCOM
 * optional, und wer eine Art versehentlich gesetzt hat, muss sie wieder loswerden
 * können. Ein Bestandswert außerhalb dieser Liste bleibt erhalten — `TypeSelect` hängt
 * ihn roh beschriftet an.
 */
export const NAME_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '— ohne Angabe —' },
  { value: 'birth', label: NAME_TYPE_LABELS.birth! },
  { value: 'maiden', label: NAME_TYPE_LABELS.maiden! },
  { value: 'married', label: NAME_TYPE_LABELS.married! },
  { value: 'aka', label: NAME_TYPE_LABELS.aka! },
  { value: 'immigrant', label: NAME_TYPE_LABELS.immigrant! },
];
