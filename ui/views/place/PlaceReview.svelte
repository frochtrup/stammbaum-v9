<script lang="ts">
  // ui/views/place/PlaceReview.svelte — "Orts-Zuweisungen prüfen"-Review (Klasse P,
  // Spec 11 §6, Spec 20 §1.7). Gegenstück zu HofReview.svelte (Klassen A/C/D) und bewusst
  // in dessen Struktur/Optik gehalten (INV-UI-4: EIN Review-Muster, kein zweites erfunden).
  //
  // Schließt eine reale Lücke (Befund 2026-07-16): Klasse P lief bis dahin in die
  // HOF-Review, erschien dort mit leerem Klassen-Label und bot Hof-Aktionen an, die auf ein
  // Orts-Problem nicht passen; nach deren Filterung war sie unsichtbar.
  //
  // "Quelle schärfen" ist wie in HofReview ein Navigations-Stub zur Person/Familie. Für
  // Klasse P ist das laut Spec 11 §6 der DETERMINISTISCHE Weg (disambiguierenden Elter in
  // den PLAC schreiben) — "Ort wählen" erledigt die Reprojektion allerdings bereits mit
  // (linkEventToPlace, ADR-v9-19/-42), sodass der geschärfte PLAC beim nächsten Load
  // ohnehin deterministisch bindet.
  import type { PlacesHost } from '../../shell/places-host';
  import { buildPlaceReview, type PlaceReviewRow } from './place-review-model';
  import { applyPlaceChoice } from './place-review-actions';
  import { enrichmentLabel } from '../../shell/place-labels';

  interface Props {
    appState: PlacesHost;
    onNavigateToPerson?: (personId: string) => void;
    onNavigateToFamily?: (familyId: string) => void;
    onClose?: () => void;
  }
  const { appState, onNavigateToPerson, onNavigateToFamily, onClose }: Props = $props();

  const review = $derived(buildPlaceReview(appState.db, appState.placeContext));

  let errorByRow = $state<Record<number, string>>({});

  function clearError(index: number) {
    const next = { ...errorByRow };
    delete next[index];
    errorByRow = next;
  }

  function choosePlace(row: PlaceReviewRow, placeId: string) {
    const event = review.flatEvents[row.index];
    if (!event) return;
    const result = applyPlaceChoice(appState, event, placeId);
    if (result.ok) clearError(row.index);
    else errorByRow = { ...errorByRow, [row.index]: result.reason };
  }

  function sharpenSource(row: PlaceReviewRow) {
    if (row.ownerKind === 'person') onNavigateToPerson?.(row.ownerId);
    else onNavigateToFamily?.(row.ownerId);
  }
</script>

<div class="place-review">
  <div class="place-review__head">
    <h2>Orts-Zuweisungen prüfen</h2>
    {#if onClose}
      <button type="button" class="place-review__close-btn" onclick={onClose}>✕ Schließen</button>
    {/if}
  </div>

  {#if review.rows.length === 0}
    <p class="place-review__empty">Keine offenen Zuweisungen — alle Orts-Ereignisse sind eindeutig aufgelöst.</p>
  {:else}
    <ul class="place-review__rows">
      {#each review.rows as row (row.index)}
        <li class="place-review__row">
          <div class="place-review__row-head">
            <span class="place-review__klass-badge">Klasse {row.klass}</span>
            <span class="place-review__klass-label">Mehrdeutig — mehrere gleichnamige Orte</span>
          </div>
          <p class="place-review__context">
            <strong>{row.ownerLabel}</strong> — {row.eventType} · PLAC „{row.placeText}"
          </p>

          {#if errorByRow[row.index]}
            <p class="place-review__error">{errorByRow[row.index]}</p>
          {/if}

          {#if row.candidatesIndistinguishable}
            <!-- Kein Auswahl-, sondern ein Dubletten-Problem (s. place-review-model.ts):
                 „Ort wählen" bände eines von N identischen Objekten und ließe die übrigen
                 liegen — derselbe Fall kehrt beim nächsten Import wieder. -->
            <p class="place-review__dupe-hint">
              ⚠ Die Kandidaten sind anhand ihrer Verwaltungskette nicht unterscheidbar —
              meist ein Dubletten-Fall. Erst „Massen-Dedup" zusammenführen; danach ist die
              Zuordnung eindeutig, ganz ohne Wahl.
            </p>
          {/if}

          <div class="place-review__actions">
            <!-- Kandidaten-Label trägt die volle Kette (place-review-model.ts) — bei
                 Klasse P sind ALLE Kandidaten gleichnamig, der Titel allein wäre als
                 Auswahlhilfe wertlos ("Oldenburg" vs. "Oldenburg"). -->
            {#each row.candidates as c (c.placeId)}
              <!-- ADR-v9-191: Grad + Prüf-Marker AM Kandidaten. Wo die Verwaltungskette
                   nicht unterscheidet, ist das oft das einzige, was noch unterscheidet —
                   und die Zeile stellt genau diese Frage. -->
              <button type="button" onclick={() => choosePlace(row, c.placeId)}>
                Ort wählen: {c.label}
                <span class="place-review__cand-level">· {enrichmentLabel(c.level)}</span>
                {#if c.reviewed}<span class="place-review__cand-level">· ✓ geprüft</span>{/if}
              </button>
            {/each}
            <button type="button" class="place-review__sharpen-btn" onclick={() => sharpenSource(row)}>
              Quelle schärfen
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  /* Struktur/Optik bewusst identisch zu HofReview.svelte (INV-UI-4) — dieselbe Sorte
     Ansicht, nur eine andere Review-Klasse. Kein neuer Stil erfunden. */
  .place-review {
    padding: 1rem;
    overflow-y: auto;
  }

  .place-review__head {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .place-review__head h2 {
    margin: 0;
  }

  .place-review__close-btn {
    margin-left: auto;
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
  }

  .place-review__empty {
    color: var(--stb-text-dim);
    margin-top: 1rem;
  }

  .place-review__rows {
    list-style: none;
    margin: 1rem 0 0;
    padding: 0;
  }

  .place-review__row {
    background: var(--stb-surface-1);
    border-radius: var(--stb-radius-card);
    padding: 0.75rem 0.9rem;
    margin-bottom: 0.7rem;
  }

  .place-review__row-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.3rem;
  }

  .place-review__klass-badge {
    font-size: 0.7rem;
    font-weight: 700;
    padding: 0.1em 0.5em;
    border-radius: 9px;
    border: 1px solid var(--stb-gold-dim);
    color: var(--stb-gold-light);
  }

  .place-review__klass-label {
    font-size: 0.85rem;
    color: var(--stb-text-dim);
  }

  .place-review__context {
    margin: 0.2rem 0 0.5rem;
    font-size: 0.9rem;
  }

  .place-review__error {
    color: var(--stb-danger, #e88);
    font-size: 0.85rem;
    margin: 0.2rem 0;
  }

  /* Warn-Hinweis im Stil der Dedup-Konflikt-Badges (ADR-v9-50/77) — gedämpft, kein
     Fehler: die Zeile ist gültig, nur der naheliegende Weg ist der falsche. */
  .place-review__dupe-hint {
    color: var(--stb-text-dim);
    font-size: 0.8rem;
    margin: 0.2rem 0 0.5rem;
    line-height: 1.35;
  }

  .place-review__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .place-review__actions button {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .place-review__sharpen-btn {
    margin-left: auto;
  }

  /* Der Kandidaten-Zusatz ordnet sich dem Namen unter: die Kette entscheidet zuerst,
     der Kurationsstand erst, wenn sie nicht unterscheidet (ADR-v9-191). */
  .place-review__cand-level {
    color: var(--stb-text-dim);
    font-size: 0.8em;
  }
</style>
