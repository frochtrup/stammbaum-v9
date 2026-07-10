<script lang="ts" generics="T extends { key: string }">
  // ui/shell/EventsByType.svelte — DIE EINE Darstellung für "Ereignis-Reihen, gruppiert
  // nach einem Schlüssel, mit Anzahl im Untertitel" (INV-UI-4, Spec 21 §6b Nachtrag).
  // Genutzt von PlaceDetail.svelte ("Ereignisse nach Typ", h4 "RESI (3)") und
  // SourceDetail.svelte (Referenzen nach Ereignistyp). HofDetail.svelte nutzte dies
  // vorübergehend ebenfalls (Bewohner/Eigentümer als getrennte Gruppen), wurde aber
  // per Nutzer-Nachtrag 2026-07-10 (Spec 21 §10j) auf EINE zeitlich integrierte Liste
  // zurückgestellt — dort differenziert jetzt `.stb-role-label` je Zeile statt einer
  // Gruppierung, weil Bewohner/Eigentümer-Wechsel eine zusammenhängende Zeiterzählung
  // sind, keine unabhängigen Kategorien wie Ereignistypen. Views, die ihre Zeilen
  // bereits fertig gruppiert liefern (`ui/shell/event-grouping.ts`, `groupByKey`),
  // reichen nur noch Gruppen + eine Zeilen-Snippet rein — die "Untertitel + Liste"-
  // Optik lebt hier EINMAL.
  import type { Snippet } from 'svelte';
  import type { EventGroup } from './event-grouping';

  interface Props {
    groups: EventGroup<T>[];
    row: Snippet<[T]>;
  }
  const { groups, row }: Props = $props();
</script>

{#each groups as group (group.type)}
  <div class="events-by-type__group">
    <h4>{group.type} ({group.rows.length})</h4>
    <ul>
      {#each group.rows as r (r.key)}
        <li>{@render row(r)}</li>
      {/each}
    </ul>
  </div>
{/each}

<style>
  .events-by-type__group h4 {
    font-size: 0.85rem;
    color: var(--stb-text-dim);
    margin: 0.6rem 0 0.2rem;
  }

  .events-by-type__group ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .events-by-type__group li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0;
    border-bottom: 1px solid var(--stb-surface-2);
    flex-wrap: wrap;
  }
</style>
