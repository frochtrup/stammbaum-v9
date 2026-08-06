// ui/shell/curation-dedup.ts — geteilte Gewinner-Heuristik für die Massen-Dedup-Ansichten
// (Orte- UND Höfe-Tab, Spec 11 §9.2/ADR-v9-45: "Verwendungszahl → Koordinaten → Notiz →
// kleinste ID", wie v8 `_pickFarmWinner` und die Kern-interne `pickHofWinner`,
// core/places/commands.ts — dort NICHT exportiert, weil sie den automatischen Hof-
// Nachlauf nach einem Dorf-Merge intern bedient). Diese UI-Fassung ist NUR ein
// PRÄSENTATIONS-Vorschlag (vom Nutzer änderbar, s. Spec 11 §9.2 "Vorschlag, nicht
// bindend") — keine Mutation, keine Autorität über die tatsächliche Merge-Entscheidung.
// Generisch über (Orte, Höfe) hinweg, damit die Vergleichs-Logik nicht zweimal geschrieben
// wird (Vereinfachen vor Erfinden).

export interface DedupCandidateMeta {
  usage: number;
  hasCoords: boolean;
  hasNote: boolean;
  /**
   * Kuratiert (§9.1: geprüft ODER angereichert) — seit ADR-v9-225 das ERSTE Kriterium,
   * noch vor der Verwendungszahl. Grund ist ein am Realbestand gemessener Beinahe-Verlust:
   * ein kuratierter Ort (2 Namensvarianten, 6 datierte Ketten-Einträge, Koordinaten,
   * Ortsgeschichte) stand ohne Ereignisbezug neben einer Seed-Dublette, die das eine
   * Ereignis trug — die Heuristik schlug die DUBLETTE vor. Seit ADR-v9-222 behält der
   * Gewinner nur seine eigenen Angaben; ein Klick auf den Vorschlag hätte die Kuration
   * gelöscht. Die Ereignisse folgen dem Gewinner ohnehin (`placeRemap`), die
   * Verwendungszahl war also nie ein Argument FÜR ein Objekt, sondern nur ein Proxy für
   * „das wird gebraucht".
   */
  curated: boolean;
}

/**
 * Wählt den Gewinner-Vorschlag aus `ids` (Spec 11 §9.2 Heuristik). Deterministisch:
 * KURATIERT zuerst (ADR-v9-225), dann höhere Verwendungszahl, dann Koordinaten vorhanden,
 * dann Notiz vorhanden, dann kleinste ID (String-Vergleich) als letzter, stabiler
 * Tie-Breaker. Bleibt ein VORSCHLAG — der Nutzer wählt das Ziel selbst (§9.2).
 */
export function pickWinnerId<Id extends string>(ids: readonly Id[], meta: Map<Id, DedupCandidateMeta>): Id {
  return ids
    .slice()
    .sort((a, b) => {
      const ma = meta.get(a);
      const mb = meta.get(b);
      const ka = ma?.curated ? 1 : 0;
      const kb = mb?.curated ? 1 : 0;
      if (kb !== ka) return kb - ka;
      const ua = ma?.usage ?? 0;
      const ub = mb?.usage ?? 0;
      if (ub !== ua) return ub - ua;
      const ca = ma?.hasCoords ? 1 : 0;
      const cb = mb?.hasCoords ? 1 : 0;
      if (cb !== ca) return cb - ca;
      const na = ma?.hasNote ? 1 : 0;
      const nb = mb?.hasNote ? 1 : 0;
      if (nb !== na) return nb - na;
      return a.localeCompare(b);
    })[0];
}
