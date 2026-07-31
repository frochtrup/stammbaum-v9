<script lang="ts">
  // ui/views/stats/StatsTopList.svelte — geteilte Balkenliste der vier Top-Listen
  // (Häufigste Nachnamen/Vornamen/Geburtsorte/Sterbeorte, Spec 20 §1.13). Extrahiert aus
  // StatisticsView.svelte (BL-54-Ratsche, eslint max-lines): die vier Sektionen waren
  // strukturell identisch (Label-Tooltip, Balken+Prozent-Tooltip, Zahl, BL-219/
  // ADR-v9-157) — EIN Renderer statt vier Kopien (INV-UI-4). Die Gesamt-Caption bleibt
  // beim Aufrufer (`StatisticsView.svelte` trägt `.stats-caption` bereits für alle
  // anderen Verteilungen — Svelte-Scoped-CSS kann sie nicht über die Komponentengrenze
  // teilen, ein zweiter Renderer nur für einen Absatz wäre Overhead ohne Nutzen).
  import { tooltip } from '../../shell/tooltip';
  import type { TopEntry } from './stats-model';

  interface Props {
    entries: TopEntry[];
    /** Balkenfarbe — 'gold' ist der Default. */
    variant?: 'gold' | 'blue' | 'dim';
  }
  const { entries, variant = 'gold' }: Props = $props();

  const maxCount = $derived(entries.length ? Math.max(...entries.map((e) => e.count)) : 1);
</script>

{#each entries as entry (entry.label)}
  <div class="stats-bar-row">
    <div class="stats-bar-row__lbl" use:tooltip={entry.label}>{entry.label}</div>
    <div class="stats-bar-row__track" use:tooltip={`${entry.count} (${entry.pct}%)`}>
      <div
        class="stats-bar-row__fill stats-bar-row__fill--{variant}"
        style:--stb-bar-pct={Math.round((entry.count / maxCount) * 100)}
      ></div>
    </div>
    <div class="stats-bar-row__cnt">{entry.count}</div>
  </div>
{/each}

<style>
  .stats-bar-row {
    display: grid;
    grid-template-columns: 8rem 1fr 2rem;
    align-items: center;
    gap: 0.5rem;
    margin: 0.3rem 0;
    font-size: 0.85rem;
  }

  .stats-bar-row__lbl {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stats-bar-row__track {
    height: 8px;
    background: var(--stb-surface-2);
    border-radius: 4px;
    overflow: hidden;
  }

  .stats-bar-row__fill {
    width: calc(var(--stb-bar-pct, 0) * 1%);
    height: 100%;
  }

  .stats-bar-row__fill--gold {
    background: var(--stb-gold-dim);
  }

  .stats-bar-row__fill--blue {
    background: var(--stb-sex-m);
  }

  .stats-bar-row__fill--dim {
    background: var(--stb-text-dim);
  }

  .stats-bar-row__cnt {
    text-align: right;
    color: var(--stb-text-dim);
  }
</style>
