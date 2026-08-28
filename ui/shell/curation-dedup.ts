// ui/shell/curation-dedup.ts — geteilte Gewinner-Heuristik für die Massen-Dedup-Ansichten
// (Orte- UND Höfe-Tab, Spec 11 §9.2). Generisch über beide Entitäten, damit die
// Vergleichs-Logik nicht zweimal geschrieben wird (Vereinfachen vor Erfinden).
//
// NUR ein PRÄSENTATIONS-Vorschlag (§9.2 „Vorschlag, nicht bindend") — keine Mutation,
// keine Autorität über die tatsächliche Merge-Entscheidung.
//
// WARUM EINE KETTE UND KEINE GEWICHTETE KENNZAHL ([ADR-v9-296]). Eine Summe kann
// „unbedingt zuerst" nicht ausdrücken: bei genügend großem Summanden überstimmt jede Menge
// jedes Gewicht — genau der Fehler, den [ADR-v9-225] geschlossen hat, als die
// Verwendungszahl die Kuration überstimmte und ein Klick sie gelöscht hätte. Dazu sind die
// Kriterien nicht kommensurabel („hat Koordinaten" gegen „acht datierte Perioden" hat keine
// gemeinsame Einheit; eine Summe erzwingt einen Wechselkurs, den niemand begründen kann),
// und eine Kette lässt sich in einem Satz erklären, eine Summe nicht.
import type { EnrichmentLevel } from '../../core/places';

const LEVEL_RANG: Record<EnrichmentLevel, number> = { none: 0, sparse: 1, rich: 2 };

export interface DedupCandidateMeta {
  /**
   * Kuratiert (§9.1: geprüft ODER angereichert) — seit [ADR-v9-225] das ERSTE Kriterium.
   * Grund war ein am Realbestand gemessener Beinahe-Verlust: ein kuratierter Ort (2
   * Namensvarianten, 6 datierte Ketten-Einträge, Koordinaten, Ortsgeschichte) stand ohne
   * Ereignisbezug neben einer Seed-Dublette, die das eine Ereignis trug — die damalige
   * Heuristik schlug die DUBLETTE vor. Seit [ADR-v9-222] behält der Gewinner nur seine
   * eigenen Angaben; ein Klick auf den Vorschlag hätte die Kuration gelöscht.
   */
  curated: boolean;
  /**
   * Anreicherungs-GRAD ([ADR-v9-191] E3): sieben Facetten, JE MERKMAL gezählt statt je
   * Eintrag, Schwellen am Bestand gemessen. Bis [ADR-v9-296] stand die Kennzahl nur in der
   * Anzeige („kein Einfluss auf die Gewinner-Heuristik"), während die Heuristik daneben
   * zwei ihrer sieben Facetten einzeln abfragte (`hasCoords`/`hasNote`) — dieselbe Frage,
   * dreimal gestellt, zweimal gröber. Jetzt ist sie die Sprosse; die beiden Einzelfragen
   * sind entfallen.
   */
  level: EnrichmentLevel;
  /**
   * Menge der DATIERTEN Perioden über beide Zeitachsen — bei Orten `enclosedBy` + `pnames`,
   * bei Höfen die `addrs`. Nicht ihr ANTEIL ([ADR-v9-296], am Bestand widerlegt): der ist
   * bei 10 von 12 Dedup-Mitgliedern 1,00, bei einem Land ohne Elter 0/0 (ausgerechnet
   * `Deutschland`, der bestgepflegte Knoten des Bestands), und er bestraft den Reicheren —
   * fünf von sechs datierten Kanten (0,83) verlöre gegen eine von einer (1,00).
   *
   * Warum überhaupt eine eigene Sprosse neben `level`: für eine VERWALTUNGSEINHEIT ist die
   * Zeitachse das Wesensmerkmal, und `level` ist mit drei Stufen dafür zu grob — am Bestand
   * sind die Mitglieder der beiden Verwaltungs-Gruppen durchweg `rich`, dort entschied bis
   * dahin der ID-String.
   */
  datiertePerioden: number;
  /**
   * Verwendungszahl. Seit [ADR-v9-296] das LETZTE inhaltliche Kriterium, auf
   * Nutzer-Entscheidung: „die Verwendung sagt nichts über die Güte des gepflegten Ortes."
   * [ADR-v9-225] hatte sie bereits hinter `curated` gestellt und dabei selbst begründet,
   * dass sie kein Argument FÜR ein Objekt ist — die Ereignisse folgen dem Gewinner ohnehin
   * (`placeRemap`). Sie bleibt, weil sie als einziges Kriterium Relevanz FÜR DIESEN
   * STAMMBAUM misst statt Pflegetiefe des Objekts; bei sonst gleichstehenden Kandidaten ist
   * das ein Argument, nur eben das schwächste.
   */
  usage: number;
}

/**
 * Wählt den Gewinner-Vorschlag aus `ids` (Spec 11 §9.2). Deterministisch, in dieser
 * Reihenfolge: KURATIERT → Anreicherungs-Grad → datierte Perioden → Verwendungszahl →
 * kleinste ID (String-Vergleich) als stabiler Tie-Break. Bleibt ein VORSCHLAG.
 */
export function pickWinnerId<Id extends string>(ids: readonly Id[], meta: Map<Id, DedupCandidateMeta>): Id {
  const wert = (id: Id): [number, number, number, number] => {
    const m = meta.get(id);
    return [
      m?.curated ? 1 : 0,
      m ? LEVEL_RANG[m.level] : 0,
      m?.datiertePerioden ?? 0,
      m?.usage ?? 0,
    ];
  };
  return ids
    .slice()
    .sort((a, b) => {
      const wa = wert(a);
      const wb = wert(b);
      for (let i = 0; i < wa.length; i++) if (wb[i] !== wa[i]) return wb[i] - wa[i];
      return a.localeCompare(b);
    })[0];
}
