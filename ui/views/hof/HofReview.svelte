<script lang="ts">
  // ui/views/hof/HofReview.svelte — "Hof-Zuweisungen prüfen"-Review (Spec 20 §1.8 [K],
  // Spec 11 §6). Zeigt Events mit event.addr ohne aufgelösten Hof, klassifiziert A/C/D,
  // mit den drei Aktionstypen. "Quelle schärfen" navigiert zur Person/Familie (Event-
  // Edit-Formular existiert in dieser Scheibe noch nicht — Navigations-Stub, s. Auftrag).
  import type { PlacesHost } from '../../shell/places-host';
  import Picker from '../../shell/Picker.svelte';
  import type { HofObject } from '../../../core/places/types';
  import { buildHofReview, type HofReviewRow } from './hof-review-model';
  import { applyCreateHof, applyAddVariant, applyChooseHof } from './hof-review-actions';

  interface Props {
    appState: PlacesHost;
    onNavigateToPerson?: (personId: string) => void;
    onNavigateToFamily?: (familyId: string) => void;
    onClose?: () => void;
  }
  const { appState, onNavigateToPerson, onNavigateToFamily, onClose }: Props = $props();

  const review = $derived(buildHofReview(appState.db));

  let variantTargets = $state<Record<number, string>>({});
  let errorByRow = $state<Record<number, string>>({});

  const klassLabel: Record<HofReviewRow['klass'], string> = {
    A: 'Non-Hof-Ereignis ohne Hof-Match',
    C: 'Mehrdeutig — mehrere Höfe gleicher Adresse',
    D: 'Norm-Drift — passt zu keinem bestehenden Hof',
  };

  function clearError(index: number) {
    const next = { ...errorByRow };
    delete next[index];
    errorByRow = next;
  }

  function createHof(row: HofReviewRow) {
    const event = review.flatEvents[row.index];
    if (!event) return;
    const result = applyCreateHof(appState, event, row.villageId ?? '');
    if (result.ok) clearError(row.index);
    else errorByRow = { ...errorByRow, [row.index]: result.reason };
  }

  function addVariant(row: HofReviewRow) {
    const event = review.flatEvents[row.index];
    const target = variantTargets[row.index];
    if (!event || !target) return;
    const result = applyAddVariant(appState, event, target);
    if (result.ok) clearError(row.index);
    else errorByRow = { ...errorByRow, [row.index]: result.reason };
  }

  function chooseHof(row: HofReviewRow, hofId: string) {
    const event = review.flatEvents[row.index];
    if (!event) return;
    applyChooseHof(appState, event, hofId);
    clearError(row.index);
  }

  function sharpenSource(row: HofReviewRow) {
    if (row.ownerKind === 'person') onNavigateToPerson?.(row.ownerId);
    else onNavigateToFamily?.(row.ownerId);
  }

  function hofLabel(h: HofObject): string {
    return h.addrs[0]?.value ?? h.id;
  }

  function hofMatches(h: HofObject, query: string): boolean {
    return hofLabel(h).toLowerCase().includes(query.trim().toLowerCase());
  }

  function variantCandidates(row: HofReviewRow): HofObject[] {
    return Array.from(appState.db.hofObjects.values()).filter((h) => h.villageId === row.villageId);
  }
</script>

<div class="hof-review">
  <div class="hof-review__head">
    <h2>Hof-Zuweisungen prüfen</h2>
    {#if onClose}
      <button type="button" class="hof-review__close-btn" onclick={onClose}>✕ Schließen</button>
    {/if}
  </div>

  {#if review.rows.length === 0}
    <p class="hof-review__empty">Keine offenen Zuweisungen — alle Adress-Ereignisse sind eindeutig aufgelöst.</p>
  {:else}
    <ul class="hof-review__rows">
      {#each review.rows as row (row.index)}
        <li class="hof-review__row">
          <div class="hof-review__row-head">
            <span class="hof-review__klass-badge hof-review__klass-badge--{row.klass}">Klasse {row.klass}</span>
            <span class="hof-review__klass-label">{klassLabel[row.klass]}</span>
          </div>
          <p class="hof-review__context">
            <strong>{row.ownerLabel}</strong> — {row.eventType} · ADDR „{row.addr}"
          </p>

          {#if errorByRow[row.index]}
            <p class="hof-review__error">{errorByRow[row.index]}</p>
          {/if}

          <div class="hof-review__actions">
            {#if row.klass === 'A'}
              <button type="button" onclick={() => createHof(row)}>+ Hof anlegen</button>
            {/if}
            {#if row.klass === 'C'}
              {#each row.candidates as c (c.hofId)}
                <button type="button" onclick={() => chooseHof(row, c.hofId)}>Hof wählen: {c.label}</button>
              {/each}
            {/if}
            {#if row.klass === 'D'}
              <button type="button" onclick={() => createHof(row)}>+ Hof anlegen</button>
              <div class="hof-review__variant-picker">
                <!-- Kein "+ neu anlegen"-Slot (ADR-v9-13/28/29, ADR-v9-40): Höfe entstehen
                     ausschließlich über die kuratierte Auflösung, nicht aus diesem Picker. -->
                <Picker
                  items={variantCandidates(row)}
                  getId={(h) => h.id}
                  getLabel={hofLabel}
                  matches={hofMatches}
                  value={variantTargets[row.index] ?? null}
                  onChange={(id) => (variantTargets[row.index] = id ?? '')}
                  label="Ziel-Hof für Variante"
                  placeholder="Ziel-Hof wählen…"
                />
                <button type="button" onclick={() => addVariant(row)}>Variante zum Hof</button>
              </div>
            {/if}
            <button type="button" class="hof-review__sharpen-btn" onclick={() => sharpenSource(row)}>
              Quelle schärfen
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .hof-review {
    padding: 1rem;
    overflow-y: auto;
  }

  .hof-review__head {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .hof-review__head h2 {
    margin: 0;
  }

  .hof-review__close-btn {
    margin-left: auto;
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
  }

  .hof-review__empty {
    color: var(--stb-text-dim);
    margin-top: 1rem;
  }

  .hof-review__rows {
    list-style: none;
    margin: 1rem 0 0;
    padding: 0;
  }

  .hof-review__row {
    background: var(--stb-surface-1);
    border-radius: var(--stb-radius-card);
    padding: 0.75rem 0.9rem;
    margin-bottom: 0.7rem;
  }

  .hof-review__row-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.3rem;
  }

  .hof-review__klass-badge {
    font-size: 0.7rem;
    font-weight: 700;
    padding: 0.1em 0.5em;
    border-radius: 9px;
    border: 1px solid var(--stb-gold-dim);
  }

  .hof-review__klass-badge--A {
    border-color: var(--stb-quay-1);
    color: var(--stb-quay-1);
  }

  .hof-review__klass-badge--C {
    border-color: var(--stb-quay-0);
    color: var(--stb-quay-0);
  }

  .hof-review__klass-badge--D {
    border-color: var(--stb-quay-2);
    color: var(--stb-quay-2);
  }

  .hof-review__klass-label {
    font-size: 0.8rem;
    color: var(--stb-text-dim);
  }

  .hof-review__context {
    margin: 0.2rem 0 0.5rem;
    font-size: 0.88rem;
  }

  .hof-review__error {
    color: var(--stb-danger);
    font-size: 0.8rem;
  }

  .hof-review__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }

  .hof-review__actions button {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.6rem;
    cursor: pointer;
    font-size: 0.82rem;
  }

  .hof-review__sharpen-btn {
    margin-left: auto;
  }

  .hof-review__variant-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }
</style>
