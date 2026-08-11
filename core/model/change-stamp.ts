// core/model/change-stamp.ts — BL-337: wer einen Datensatz ändert, datiert ihn.
//
// ── DER BEFUND ───────────────────────────────────────────────────────────────────────
// `CHAN` war in fünf Ebenen widersprüchlich: das Modellfeld `lastChanged` gab es an
// Person, Familie, Quelle, Archiv und Medium — gelesen wurde es nur bei der Person,
// geschrieben bei Person und Familie (dort immer leer), angezeigt nur in der Personen-
// Kopfzeile, und GESETZT wurde es nirgends. Die Kopfzeile zeigte damit den Zeitstempel des
// FREMDPROGRAMMS, und der fror in dem Moment ein, in dem der Nutzer die Person bearbeitete.
// Der GRAMPS-Export schrieb für jeden Record hart `change="0"` (1.1.1970).
//
// ── WARUM DER STEMPEL HIER SITZT UND NICHT IM WRITER ─────────────────────────────────
// Der naheliegende Ort wäre `applyDatabaseToRoots`: der weiß per Struktur-Vergleich exakt,
// welcher Record schmutzig ist. Er hat aber zwei Nachteile, die zusammen den Ausschlag
// geben. (a) Er müsste `lastChanged` aus seinem eigenen Vergleich AUSNEHMEN — sonst gilt
// ein Record, dessen CHAN gerade in die Datei geschrieben wurde, beim nächsten Speichern
// erneut als geändert, und der Stempel wandert bei JEDEM Auto-Save weiter (RT-1 dahin).
// (b) Das Modell wüsste vom neuen Datum nichts, die Kopfzeile zeigte bis zum Neuladen den
// alten Wert — genau die eingefrorene Hälfte, die dieser Bau beseitigen soll.
//
// Der Stempel gehört deshalb an die MUTATION, nicht an die Serialisierung: `commit` in
// `ui/shell/app-state.svelte.ts` ist DER Chokepoint für jede Zustandsänderung (er trägt
// aus demselben Grund schon den Undo-Snapshot — Zwang schlägt Erinnerung, ADR-v9-83). Von
// dort aus stimmt beides: das Modell trägt den frischen Wert (sofort sichtbar), der Writer
// sieht ihn als gewöhnliche Feldänderung, erkennt den Record als schmutzig und schreibt
// `CHAN` mit — und beim nächsten Speichern ohne Edit ist alles wieder gleich, der Record
// bleibt referenzgleich. Kein Sonderpfad, kein zweites Dirty-Kriterium.
//
// ── WORAN „GEÄNDERT" ERKANNT WIRD ────────────────────────────────────────────────────
// An der OBJEKT-IDENTITÄT, nicht am Feldinhalt. Copy-on-write ist im Kern verbindlich
// (ADR-v9-92 Punkt 3): ein Kommando gibt einen neuen Stand zurück und lässt unberührte
// Entitäten referenzgleich. „Andere Referenz" heißt damit „ein Kommando hat diese Entität
// angefasst" — die Prüfung kostet einen Zeigervergleich je Entität statt eines
// Feldvergleichs, und sie dupliziert NICHT die Vergleichslogik des Writers (die dort ihren
// guten Grund hat und hier eine zweite, driftende Wahrheit wäre).
//
// Der Preis ist eine bewusste Überannäherung: wer ein Formular öffnet und ohne Änderung
// „Speichern" drückt, bekommt einen neuen Zeitstempel. Das ist die Richtung, in der ein
// Fehler folgenlos bleibt — ein Datum, das einmal zu oft stimmt, gegenüber einem, das
// stillschweigend zu alt ist.
import type { Database } from './types';

/**
 * Datiert in EINER Entitäts-Map jede Entität, die gegenüber `vorher` neu oder ausgetauscht
 * ist. Gibt `nachher` unverändert zurück, wenn nichts zu tun war (Referenzstabilität).
 */
function gestempelt<K, T extends { lastChanged: string }>(
  vorher: Map<K, T>,
  nachher: Map<K, T>,
  stamp: string,
): Map<K, T> {
  if (vorher === nachher) return nachher; // ganze Map unberührt — der häufigste Fall

  let ersatz: Map<K, T> | null = null;
  for (const [id, entity] of nachher) {
    // Gleiche Referenz = kein Kommando hat sie angefasst. Der Fall „neu angelegt" fällt
    // hier korrekt heraus: `vorher.get(id)` ist dann `undefined`.
    if (vorher.get(id) === entity) continue;
    // Trägt sie den Stempel schon, ist nichts zu tun — hält die Funktion idempotent,
    // falls sie auf demselben Übergang zweimal läuft.
    if (entity.lastChanged === stamp) continue;
    ersatz ??= new Map(nachher);
    ersatz.set(id, { ...entity, lastChanged: stamp });
  }
  return ersatz ?? nachher;
}

/**
 * Datiert jede Entität, die `next` gegenüber `prev` neu oder ausgetauscht hat, auf `stamp`.
 *
 * Die fünf Karten sind ausgeschrieben statt über eine Schlüsselliste zu laufen: nur so
 * prüft der Compiler jede einzeln, und eine sechste Record-Art mit `lastChanged` fällt beim
 * Hinzufügen auf, statt still durchzurutschen. Orte/Höfe fehlen bewusst — sie leben in
 * `orte.json`, nicht in der Genealogie-Datei, und haben keinen `CHAN`-Block.
 *
 * Reine Funktion, framework- und uhrfrei (INV-ARCH-1): der Zeitpunkt kommt als fertiger
 * String von außen — die injizierte Clock lebt in der Schale, damit Tests eine feste Zeit
 * setzen können (TST-3).
 *
 * Referenzstabil: ändert sich nichts, kommt `next` unverändert zurück (wichtig, weil an
 * `commit` reaktive Ableitungen hängen).
 */
export function withChangeStamps(prev: Database, next: Database, stamp: string): Database {
  const individuals = gestempelt(prev.individuals, next.individuals, stamp);
  const families = gestempelt(prev.families, next.families, stamp);
  const sources = gestempelt(prev.sources, next.sources, stamp);
  const repositories = gestempelt(prev.repositories, next.repositories, stamp);
  const media = gestempelt(prev.media, next.media, stamp);

  if (
    individuals === next.individuals && families === next.families &&
    sources === next.sources && repositories === next.repositories && media === next.media
  ) {
    return next;
  }
  return { ...next, individuals, families, sources, repositories, media };
}
