// services/file/backup-name.ts — der Name der datierten Sicherung (Spec 14 §4.1).
//
// Reine Funktion, kein Wall-Clock: das Datum kommt herein (TST-3). Sie ist die EINE
// Quelle für Rohr und Oberfläche — dieselbe Wahl wie bei `exportFileName` in
// export-pipe.ts. Würde die Einstellungs-Fläche das Muster für ihre Vorschau nachbauen,
// hätte die Sicherung zwei Namensquellen, die auseinanderlaufen können.
//
//   Meine Familie.ged  →  Meine Familie (Backup 2026-08-28 14-32-05).ged
//
// SEKUNDEN sind Absicht, nicht Genauigkeitsfetisch: es werden ALLE Stände behalten
// (Nutzer-Entscheidung 2026-08-28), und zwei Saves innerhalb derselben Minute sind beim
// Arbeiten der Normalfall — ohne Sekunden überschriebe die zweite Sicherung die erste
// und der Schutz hätte genau dann ein Loch, wenn am meisten passiert.
//
// Der Zeitstempel steht in LOKALER Zeit. Er wird von einem Menschen gelesen, der wissen
// will, welcher seiner Stände das ist; UTC wäre für ihn eine Umrechnung.

/** Zweistellig, ohne Locale-Abhängigkeit (`toLocaleString` variiert je Umgebung). */
function zwei(n: number): string {
  return String(n).padStart(2, '0');
}

/** `2026-08-28 14-32-05` — Doppelpunkte sind in Dateinamen nicht überall zulässig. */
export function backupStamp(when: Date): string {
  return (
    `${when.getFullYear()}-${zwei(when.getMonth() + 1)}-${zwei(when.getDate())} ` +
    `${zwei(when.getHours())}-${zwei(when.getMinutes())}-${zwei(when.getSeconds())}`
  );
}

/**
 * Der Dateiname der Sicherung: Basisname + Stempel in Klammern + ursprüngliche Endung.
 *
 * Die Endung bleibt erhalten, damit die Sicherung wieder eine ladbare GEDCOM-/GRAMPS-Datei
 * ist — eine Sicherung, die man nur nach Umbenennen öffnen kann, ist im Ernstfall eine
 * Hürde. Der Klammer-Zusatz steht am ENDE des Basisnamens, damit alle Stände einer Datei
 * im Ordner beieinander und chronologisch sortiert stehen.
 */
export function backupFileName(filename: string, when: Date): string {
  const match = /\.[^./\\]+$/.exec(filename);
  const ext = match ? match[0] : '';
  const base = ext ? filename.slice(0, -ext.length) : filename;
  return `${base} (Backup ${backupStamp(when)})${ext}`;
}
