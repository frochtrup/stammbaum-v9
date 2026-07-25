<script lang="ts">
  // ui/views/person/ProofSummaryNote.svelte — Beweisführungsnotiz (GPS-Zusammenfassung,
  // Spec 20 §1.11e, BL-61). Rein lesende Projektion aus dem Evidenzmodell (§3) + den
  // Hypothesen (§4) einer Person; kein eigener Speicher, keine Edits. Der Aufrufer
  // (PersonDetail) zeigt sie nur, wenn ≥1 Hypothese existiert.
  //
  // Eigene Komponente statt inline in PersonDetail: das hält die Aggregation gekapselt
  // und PersonDetail an der max-lines-Ratsche (BL-54) — die vier Blöcke sind eine in sich
  // geschlossene Einheit.
  import type { Person } from '../../../core/model/types';
  import { personCitations } from '../../../core/validate/facts';
  import { buildProofSummary } from '../../../core/research/index';

  interface Props {
    person: Person;
  }
  const { person }: Props = $props();

  const summary = $derived(buildProofSummary(personCitations(person), person.hypotheses));
</script>

<details class="proof-note">
  <summary class="proof-note__summary">
    ⚖ Beweisführung
    <span class="proof-note__maturity">{summary.maturityPct} % aufgelöst</span>
  </summary>

  <p class="proof-note__sources">
    <strong>Quellenlage:</strong>
    {summary.sources.total} Zitat{summary.sources.total === 1 ? '' : 'e'} ·
    {summary.sources.evaluated} evidenzbewertet ·
    {summary.sources.withQuay} mit QUAY
  </p>

  {#if summary.confirmed.length > 0}
    <div class="proof-note__block">
      <h4>Bestätigte Schlüsse</h4>
      {#each summary.confirmed as h (h.id)}
        <div class="proof-note__item">
          <p class="proof-note__claim">{h.text}</p>
          {#if h.conclusion}<p class="proof-note__detail">{h.conclusion}</p>{/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if summary.open.length > 0}
    <div class="proof-note__block">
      <h4>Offene Fragen</h4>
      {#each summary.open as h (h.id)}
        <div class="proof-note__item">
          <p class="proof-note__claim">{h.text}</p>
          {#if h.rationale}<p class="proof-note__detail">{h.rationale}</p>{/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if summary.rejected.length > 0}
    <div class="proof-note__block">
      <h4>Verworfene Annahmen</h4>
      {#each summary.rejected as h (h.id)}
        <div class="proof-note__item">
          <p class="proof-note__claim">{h.text}</p>
          {#if h.conclusion}<p class="proof-note__detail">{h.conclusion}</p>{/if}
        </div>
      {/each}
    </div>
  {/if}
</details>

<style>
  .proof-note {
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    padding: 0.4rem 0.6rem;
    background: var(--stb-surface-1);
  }

  .proof-note__summary {
    cursor: pointer;
    font-weight: 700;
    color: var(--stb-gold-light);
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .proof-note__maturity {
    color: var(--stb-text-dim);
    font-weight: 400;
    font-size: 0.85rem;
  }

  .proof-note__sources {
    margin: 0.5rem 0 0.3rem;
    font-size: 0.85rem;
    color: var(--stb-text-dim);
  }

  .proof-note__block h4 {
    margin: 0.6rem 0 0.2rem;
    font-size: 0.82rem;
    color: var(--stb-gold-light);
  }

  .proof-note__item {
    margin-bottom: 0.3rem;
  }

  .proof-note__claim {
    margin: 0;
    font-size: 0.9rem;
    color: var(--stb-text);
  }

  .proof-note__detail {
    margin: 0;
    font-size: 0.82rem;
    color: var(--stb-text-dim);
  }
</style>
