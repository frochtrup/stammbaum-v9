<script lang="ts" generics="T extends { key: string }">
  // ui/shell/EventsByType.svelte — DIE EINE Darstellung für "Ereignis-Reihen, gruppiert
  // nach einem Schlüssel, mit Anzahl im Untertitel, paginiert + einklappbar" (INV-UI-4,
  // Spec 21 §6b Nachtrag, erweitert Spec 21 §10b/ADR-v9-78 Punkt 6). Genutzt von
  // PlaceDetail.svelte ("Ereignisse nach Typ", h4 "RESI (3)"), SourceDetail.svelte
  // (Referenzen nach Ereignistyp) und HofList.svelte (Höfe nach Dorf). HofDetail.svelte
  // nutzte dies vorübergehend ebenfalls (Bewohner/Eigentümer als getrennte Gruppen),
  // wurde aber per Nutzer-Nachtrag 2026-07-10 (Spec 21 §10j) auf EINE zeitlich
  // integrierte Liste zurückgestellt — dort differenziert jetzt `.stb-role-label` je
  // Zeile statt einer Gruppierung. Views, die ihre Zeilen bereits fertig gruppiert
  // liefern (`ui/shell/event-grouping.ts`, `groupByKey`), reichen nur noch Gruppen + ein
  // Zeilen-Snippet rein — Paginierung ("N weitere laden", je 30, `pageSlice`, Spec 21
  // §10b) UND Einklapp-Verhalten (Default: aufgeklappt, automatisch eingeklappt ab >30
  // Zeilen, der Gruppen-Header selbst das Klick-/Tap-Ziel, Spec 21 §10b Nachtrag/
  // ADR-v9-78 Punkt 6) leben hier EINMAL statt in jedem Konsumenten separat dupliziert
  // (SourceDetail.svelte hatte vor dieser Erweiterung eine eigene, duplizierte
  // Paginierungs-Implementierung — klassischer INV-UI-4-Fall, jetzt konsolidiert).
  import type { Snippet } from 'svelte';
  import type { EventGroup } from './event-grouping';
  import { pageSlice, DEFAULT_PAGE_SIZE } from './pagination';

  interface Props {
    groups: EventGroup<T>[];
    row: Snippet<[T]>;
    /** Schlüssel für den Paginierungs-/Einklapp-Zustand (z. B. `sourceId`/`placeId` des
     *  gerade dargestellten Gegenstands) — ändert er sich, verhält sich jede Gruppe
     *  wieder wie frisch gemountet (Default-Seitengröße, Auto-Einklapp-Regel neu
     *  ausgewertet), OHNE dass ein expliziter Reset-Effekt nötig wäre: der interne
     *  State-Record ist nach `${resetKey}::${type}` geschlüsselt, ein neuer resetKey
     *  trifft daher automatisch auf einen frischen (fehlenden) Eintrag. Alte Einträge
     *  bleiben harmlos ungenutzt im Record liegen (analog SourceDetail.svelte's
     *  Vorgänger-Muster `${sourceId}-${type}`, hier generalisiert).
     *
     *  BEWUSST PFLICHT (nicht `?`), obwohl `null` erlaubt ist: als optionales Prop wurde
     *  er von `PlaceDetail` schlicht vergessen — und fiel erst auf, als ADR-v9-78 Punkt 3
     *  (klickbare Kettenglieder) Ort→Ort-Navigation OHNE Unmount erstmals möglich machte
     *  und der Einklapp-Zustand des vorherigen Orts in den nächsten leckte. Der Compiler
     *  erzwingt jetzt an JEDEM Aufrufer eine bewusste Wahl; `null` heißt „dieser Aufrufer
     *  hat keinen wechselnden Gegenstand und mountet bei Bedarf ohnehin neu" (s.
     *  HofList.svelte) — eine Entscheidung, keine Unterlassung. */
    resetKey: string | null;
  }
  const { groups, row, resetKey }: Props = $props();

  let shownByGroup = $state<Record<string, number>>({});
  // Explizite Nutzer-Entscheidung je Gruppe (überschreibt die Auto-Einklapp-Regel in
  // beide Richtungen) — `undefined` = "noch keine explizite Wahl getroffen", dann greift
  // die Auto-Regel (>DEFAULT_PAGE_SIZE Zeilen → eingeklappt).
  let collapsedByGroup = $state<Record<string, boolean | undefined>>({});

  function groupKey(type: string): string {
    return `${resetKey ?? ''}::${type}`;
  }

  function contentId(type: string): string {
    return `events-by-type__content-${groupKey(type).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  }

  function shownFor(type: string): number {
    return shownByGroup[groupKey(type)] ?? DEFAULT_PAGE_SIZE;
  }

  function loadMore(type: string) {
    const key = groupKey(type);
    shownByGroup = { ...shownByGroup, [key]: shownFor(type) + DEFAULT_PAGE_SIZE };
  }

  function isCollapsed(group: EventGroup<T>): boolean {
    const explicit = collapsedByGroup[groupKey(group.type)];
    if (explicit !== undefined) return explicit;
    return group.rows.length > DEFAULT_PAGE_SIZE;
  }

  function toggleGroup(group: EventGroup<T>) {
    const key = groupKey(group.type);
    collapsedByGroup = { ...collapsedByGroup, [key]: !isCollapsed(group) };
  }

  const collapsedCount = $derived(groups.filter((g) => isCollapsed(g)).length);
  // "Alle auf-/zuklappen" (Spec 21 §10b, ADR-v9-78 Punkt 6b): EIN Toggle auf
  // Listenebene, nicht pro Gruppe dupliziert — erscheint erst ab drei gleichzeitig
  // eingeklappten Gruppen.
  const showCollapseAllToggle = $derived(collapsedCount >= 3);
  const allCollapsed = $derived(groups.length > 0 && collapsedCount === groups.length);

  function setAllCollapsed(next: boolean) {
    const entries: Record<string, boolean> = {};
    for (const g of groups) entries[groupKey(g.type)] = next;
    collapsedByGroup = { ...collapsedByGroup, ...entries };
  }
</script>

{#if showCollapseAllToggle}
  <button type="button" class="events-by-type__toggle-all" onclick={() => setAllCollapsed(!allCollapsed)}>
    {allCollapsed ? 'Alle aufklappen' : 'Alle einklappen'}
  </button>
{/if}

{#each groups as group (group.type)}
  {@const collapsed = isCollapsed(group)}
  {@const cid = contentId(group.type)}
  <div class="events-by-type__group">
    <button
      type="button"
      class="events-by-type__group-header"
      aria-expanded={!collapsed}
      aria-controls={cid}
      onclick={() => toggleGroup(group)}
    >
      {group.type} ({group.rows.length})
    </button>
    {#if !collapsed}
      {@const paged = pageSlice(group.rows, shownFor(group.type))}
      <ul id={cid}>
        {#each paged.visible as r (r.key)}
          <li>{@render row(r)}</li>
        {/each}
      </ul>
      {#if paged.remaining > 0}
        <button type="button" class="events-by-type__load-more" onclick={() => loadMore(group.type)}>
          {Math.min(paged.remaining, DEFAULT_PAGE_SIZE)} weitere laden
        </button>
      {/if}
    {/if}
  </div>
{/each}

<style>
  /* Gruppen-Header war vor ADR-v9-78 Punkt 6 ein reines <h4> — jetzt ein <button>
     (Klick-/Tap-Ziel zum Ein-/Ausklappen), optisch UNVERÄNDERT (gleiche Schriftgröße/
     -farbe/Abstand). Kein horizontales Padding (Zeilenabstand/Padding-Regel, Spec 21
     §6a): Container wie PlaceDetail/SourceDetail liefern das Padding selbst; Container
     ohne eigenes Padding (HofList.svelte) ergänzen es gezielt über :global(). */
  .events-by-type__group-header {
    display: block;
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    padding: 0;
    margin: 0.6rem 0 0.2rem;
    font: inherit;
    font-size: 0.85rem;
    color: var(--stb-text-dim);
    cursor: pointer;
  }

  .events-by-type__group-header:hover,
  .events-by-type__group-header:focus-visible {
    color: var(--stb-gold-light);
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

  .events-by-type__load-more,
  .events-by-type__toggle-all {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    font-size: 0.8rem;
  }

  .events-by-type__load-more:hover,
  .events-by-type__toggle-all:hover,
  .events-by-type__load-more:focus-visible,
  .events-by-type__toggle-all:focus-visible {
    border-color: var(--stb-gold);
  }

  .events-by-type__toggle-all {
    display: block;
    margin-bottom: 0.4rem;
  }

  .events-by-type__load-more {
    margin-top: 0.4rem;
  }
</style>
