<script lang="ts">
  // ui/shell/SourceBadge.svelte — §N-Badge mit QUAY-Farbindikator (Spec 21 §7).
  // Optionaler onSelect-Callback (Spec 20 §1.6 [K]): navigiert zur Quellen-Detailseite.
  // Ohne Callback bleibt es eine reine, nicht-interaktive Anzeige (z. B. künftige
  // Kontexte ohne Quellen-Tab-Zugriff) — INV-UI-2: EIN kanonischer Klick-Weg, kein
  // zweiter Navigations-Pfad daneben.
  import type { Citation, Source } from '../../core/model/types';
  import { badgeLabel, quayClass, badgeTitle } from './source-badge';

  interface Props {
    citation: Citation;
    source: Source | undefined;
    onSelect?: (sourceId: string) => void;
  }
  const { citation, source, onSelect }: Props = $props();
</script>

{#if onSelect}
  <button
    type="button"
    class="src-badge src-badge--clickable {quayClass(citation)}"
    title={badgeTitle(citation, source)}
    onclick={() => onSelect(citation.sourceId)}
  >
    {badgeLabel(citation)}
  </button>
{:else}
  <span class="src-badge {quayClass(citation)}" title={badgeTitle(citation, source)}>
    {badgeLabel(citation)}
  </span>
{/if}

<style>
  .src-badge {
    display: inline-block;
    font-size: 0.62rem;
    line-height: 1;
    padding: 0.2em 0.45em;
    border-radius: 9px;
    font-weight: 600;
    color: var(--stb-text);
    background: var(--stb-surface-3);
    border: 1px solid var(--stb-gold-dim);
  }

  button.src-badge--clickable {
    font-family: inherit;
    cursor: pointer;
  }

  button.src-badge--clickable:hover,
  button.src-badge--clickable:focus-visible {
    background: var(--stb-surface-2);
  }
  .src-badge--q0 {
    border-color: var(--stb-quay-0);
    color: var(--stb-quay-0);
  }
  .src-badge--q1 {
    border-color: var(--stb-quay-1);
    color: var(--stb-quay-1);
  }
  .src-badge--q2 {
    border-color: var(--stb-quay-2);
    color: var(--stb-quay-2);
  }
  .src-badge--q3 {
    border-color: var(--stb-quay-3);
    color: var(--stb-quay-3);
  }
</style>
