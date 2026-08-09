<script lang="ts">
  // ui/views/person/PersonListRow.svelte — EINE Zeile der Personenliste.
  //
  // Eigene Datei, weil `PersonList.svelte` mit dem virtuellen Scrollen (BL-311) über die
  // 600-Zeilen-Grenze lief. Herausgelöst wurde eine kohäsive Einheit — „wie eine
  // Personenzeile aussieht", Markup UND ihre Stile — statt an der Restdatei zu trimmen; die
  // Liste liegt damit wieder komfortabel unter der Grenze, nicht knapp darunter.
  //
  // Rein darstellend: keine Auswahl-Logik, kein Zustand. Sie steht im gefensterten Pfad und
  // wird beim Scrollen fortlaufend auf- und abgebaut — deshalb keine eigenen Effekte.
  import { tooltip } from '../../shell/tooltip';
  import { sexSymbol } from '../../shell/person-display';
  import type { PersonRow } from './person-list-model';

  interface Props {
    row: PersonRow;
    onSelect: (id: string) => void;
  }
  const { row, onSelect }: Props = $props();
</script>

<button type="button" class="person-list__row" onclick={() => onSelect(row.id)}>
  <span class="person-list__name-line">
    <span class="person-list__sex person-list__sex--{row.sex.toLowerCase()}" aria-hidden="true">{sexSymbol(row.sex)}</span>
    <span class="person-list__name">{row.name}</span>
    {#if row.kekule != null}<span class="person-list__kekule" use:tooltip={'Ahnenziffer (Kekulé) zum Probanden'}>#{row.kekule}</span>{/if}
    {#if row.hasMedia}<span class="stb-pill" use:tooltip={'Medien vorhanden'}>📎</span>{/if}
  </span>
  <span class="person-list__meta">
    {#if row.birthSummary}
      <span use:tooltip={row.birthPlaceFull || undefined}>* {row.birthSummary}</span>
    {/if}
    {#if row.deathSummary}
      <span use:tooltip={row.deathPlaceFull || undefined}>† {row.deathSummary}</span>
    {/if}
  </span>
</button>

<style>
  .person-list__row {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--stb-surface-2);
    padding: 0.55rem 1rem;
    text-align: left;
    cursor: pointer;
    color: var(--stb-text);
  }

  .person-list__row:hover,
  .person-list__row:focus-visible {
    background: var(--stb-surface-2);
  }

  .person-list__name-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
  }

  .person-list__name {
    font-weight: 600;
  }

  /* Geschlechts-Icon (BL-195) — dieselben Farben wie Sanduhr/Statistik (--stb-sex-*). */
  .person-list__sex {
    flex: none;
    font-size: 0.9rem;
    line-height: 1;
    color: var(--stb-text-dim);
  }
  .person-list__sex--m {
    color: var(--stb-sex-m);
  }
  .person-list__sex--f {
    color: var(--stb-sex-f);
  }

  /* Kekulé-/Ahnenziffer relativ zum Probanden (BL-195, v8-Orakel `p-kekule`).
     Sekundär-Datum → bewusst entdramatisiert (Design-Kritik 2026-07-29): Outline statt
     gefülltem Gold, damit der Name primär bleibt und die Ziffer nicht mit Aktions-Pills
     konkurriert. Löst zugleich das Gold-auf-Gold-Kontrastrisiko. */
  .person-list__kekule {
    flex: none;
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
    color: var(--stb-gold-light);
    background: transparent;
    border: 1px solid var(--stb-gold-dim);
    border-radius: 0.6rem;
    padding: 0.05rem 0.4rem;
  }

  .person-list__meta {
    display: flex;
    gap: 0.75rem;
    font-size: 0.78rem;
    color: var(--stb-text-dim);
  }
</style>
