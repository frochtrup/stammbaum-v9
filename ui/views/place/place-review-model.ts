// ui/views/place/place-review-model.ts — "Orts-Zuweisungen prüfen"-Review, Klasse P
// (Spec 11 §6, Spec 20 §1.7). Gegenstück zu hof-review-model.ts (Klassen A/C/D): beide
// sammeln über den geteilten `collectAllEvents` (ui/shell/review-events.ts, INV-UI-4) und
// rufen den EINEN Kern-Klassifikator `resolveEvents()` — keine eigene Review-Logik in der
// UI-Schicht (ADR-v9-18-Lehre).
//
// Klasse P (Spec 11 §6): "Verwaltungs-Ort mehrdeutig — atomarer PLAC oder rich-PLAC ohne
// disambiguierenden Elter trifft ≥2 gleichnamige PlaceObjects (oder einziger Kandidat per
// Konsistenz-Guard verworfen, §4.2)". Der Kern bindet bewusst NICHT und rät nicht
// (ADR-v9-29) — die Entscheidung gehört dem Menschen, und genau dafür ist diese Ansicht da.
//
// Diese Ansicht schließt eine reale Lücke (Befund 2026-07-16): P-Items liefen bis dahin in
// die HOF-Review, wo sie mit leerem Klassen-Label erschienen und Hof-Aktionen anboten, die
// auf ein Orts-Problem nicht passen. Nach deren Filterung waren sie unsichtbar —
// `hof-review-model.ts` war der einzige Konsument von `resolveEvents().review`.
import type { Database, Event, PlaceId } from '../../../core/model/types';
import type { EnrichmentLevel, PlaceContext, ReviewItem } from '../../../core/places';
import { isReviewed, placeEnrichmentLevel, resolveEvents } from '../../../core/places';
import { collectAllEvents, ownerLabelFor, type OwnerRef } from '../../shell/review-events';

export interface PlaceCandidate {
  placeId: PlaceId;
  /** Voller Ketten-Text („Oldenburg › Niedersachsen") — bei Klasse P sind ALLE Kandidaten
   *  per Definition gleichnamig, der blosse Titel wäre als Auswahlhilfe wertlos. */
  label: string;
  /**
   * Anreicherungs-Grad + Prüf-Marker (Spec 11 §9.1, ADR-v9-191). Diese Ansicht trug bis
   * dahin GAR KEIN Kurations-Signal, obwohl sie die Frage stellt, für die es gemacht ist:
   * welcher der gleichnamigen Kandidaten ist der gepflegte? Wo die Kette nicht
   * unterscheidet (`candidatesIndistinguishable`), ist das oft das einzige, was noch
   * unterscheidet. Reine Anzeige — die Auswahl selbst bleibt Nutzersache, und der Kern rät
   * weiterhin nicht (ADR-v9-29).
   */
  level: EnrichmentLevel;
  reviewed: boolean;
  /**
   * Roher `PlaceObject.type` (BL-268) — die UI übersetzt über `placeTypeLabel`
   * (ADR-v9-149, EINE Quelle). Ergänzt Kette und Anreicherungs-Grad um die Achse, die
   * beide nicht tragen: **welche Verwaltungsebene** ist gemeint. Befund bei der
   * Verifikation von BL-267 an Realdaten — der Grad trennt zwei „Ochtrup" sauber, zwei
   * „Münster" nicht: dort sind beide „ausführlich" und der Unterschied ist Stadt ⇄ Kreis,
   * genau der `typeMismatch`-Fall, den der Dedup-Dialog seit ADR-v9-77 je Mitglied zeigt.
   * Leerer Typ zeigt nichts (ADR-v9-77: der normale, unauffällige Fall).
   */
  type: string;
}

export interface PlaceReviewRow {
  index: number;
  /** Immer 'P' — die Ansicht kennt nur diese Klasse. Feld bleibt für die Anzeige/
   *  Symmetrie zur Hof-Review erhalten. */
  klass: 'P';
  /** Der rohe PLAC-Text des Events, der die Mehrdeutigkeit ausgelöst hat. */
  placeText: string;
  eventType: string;
  ownerKind: 'person' | 'family';
  ownerId: string;
  ownerLabel: string;
  candidates: PlaceCandidate[];
  /**
   * `true`, wenn ALLE Kandidaten dasselbe Label tragen — die Verwaltungskette
   * unterscheidet sie also nicht (Befund am echten Datenbestand 2026-07-16: 23 von 96
   * P-Zeilen, z. B. vier PlaceObjects „Bremen", alle mit Kette „Bremen › Deutschland",
   * alle unangereichert, alle ohne Koordinaten — in jeder sichtbaren Eigenschaft gleich).
   *
   * Fachlich ist das kein Auswahl-, sondern ein DUBLETTEN-Problem: „Ort wählen" würde
   * eines von N identischen Objekten binden und die übrigen N-1 als Müll liegen lassen —
   * derselbe Fall kehrt beim nächsten Import wieder. Der richtige Weg ist der Massen-Dedup
   * (§9.2); danach bleibt EIN Kandidat und die Zuordnung wird eindeutig, ganz ohne Wahl.
   * Die Ansicht sagt das, statt eine sinnlose Wahl anzubieten.
   */
  candidatesIndistinguishable: boolean;
}

export interface PlaceReviewResult {
  rows: PlaceReviewRow[];
  /** Flache Event-Liste in EXAKT der Reihenfolge, die resolveEvents bekam — die
   *  UI-Kommandos führen `row.index` darüber auf das ECHTE Event zurück
   *  (s. place-review-actions.ts). */
  flatEvents: Event[];
  owners: OwnerRef[];
}

/**
 * Beschriftung eines Kandidaten: volle undatierte Kette, damit zwei gleichnamige Orte
 * überhaupt unterscheidbar sind. `enclosureChainAsOf(id, year)` mit dem Ereignisjahr wäre
 * periodengerechter, aber die Zeile stellt die Frage „WELCHER dieser Orte ist gemeint?" —
 * dafür zählt die Identität des Kandidaten, nicht seine Benennung im Ereignisjahr.
 */
function candidateLabel(ctx: PlaceContext, id: PlaceId, year: number | null): string {
  const chain = ctx.places.enclosureChainAsOf(id, year);
  // §6l-Ausnahme (Review-Klasse P): hier ist UNTERSCHEIDEN der Zweck, nicht Überfliegen —
  // die Kandidatenliste behält bewusst die volle Kette und, ohne Kette, den `title` (NICHT
  // `placeDisplayName`, dessen `shortName` genau die Unterscheidung verwischen würde).
  // eslint-disable-next-line no-restricted-syntax -- dokumentierte INV-UI-14-Ausnahme, Spec 21 §6l
  return chain.length ? chain.join(' › ') : (ctx.places.byId(id)?.title ?? id);
}

/**
 * Baut das Orts-Review (Spec 11 §6, Klasse P) über ALLE Events der Datenbank.
 * `flatEvents`/`owners` werden mitgeliefert, weil resolveEvents rein ist (kopiert Events)
 * — die Kommandos müssen die ECHTEN, in Person/Family lebenden Events treffen.
 *
 * `ctx` ist bewusst PFLICHT (kein `?`): ohne Registry liefe die Kandidaten-Beschriftung
 * auf den blossen Titel zurück — und der ist bei Klasse P per Definition bei ALLEN
 * Kandidaten identisch („Oldenburg" vs. „Oldenburg"). Die Auswahl wäre dann nicht bloss
 * unschön, sondern unmöglich. Gleiche Härtung wie EventsByType.resetKey (2026-07-16):
 * ein optionaler Parameter, dessen Fehlen die Funktion still entwertet, wird vergessen.
 */
export function buildPlaceReview(db: Database, ctx: PlaceContext): PlaceReviewResult {
  const { events, owners } = collectAllEvents(db);
  const result = resolveEvents(events, db.placeObjects, db.hofObjects);

  // Nur Klasse P — A/C/D gehören in die Hof-Review (Spec 20 §1.8), s. hof-review-model.ts.
  const placeItems = result.review.filter((item: ReviewItem) => item.klass === 'P');

  const rows: PlaceReviewRow[] = placeItems.map((item) => {
    const owner = owners[item.index];
    const ev = events[item.index];
    const year = result.events[item.index]?.event.date ? Number(String(ev.date).match(/\d{4}/)?.[0] ?? '') || null : null;
    const candidates: PlaceCandidate[] = item.candidates.map((placeId) => {
      const po = ctx.places.byId(placeId);
      return {
        placeId,
        label: candidateLabel(ctx, placeId, year),
        level: po ? placeEnrichmentLevel(po) : 'none',
        reviewed: po ? isReviewed(po) : false,
        type: po?.type ?? '',
      };
    });
    return {
      index: item.index,
      klass: 'P' as const,
      placeText: ev?.place ?? '',
      eventType: item.eventType,
      ownerKind: owner.ownerKind,
      ownerId: owner.ownerId,
      ownerLabel: ownerLabelFor(db, owner),
      candidates,
      candidatesIndistinguishable: candidates.length > 1 && new Set(candidates.map((c) => c.label)).size === 1,
    };
  });

  return { rows, flatEvents: events, owners };
}
