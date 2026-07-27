<script lang="ts">
  // ui/views/media/MediaGallery.svelte — Medien-Tab-Liste (Spec 20 §1.4 [S] "① Kachel-
  // galerie"): globale Arbeitsfläche über db.media, nicht Personen-Tab-lokal. Filter
  // Alle/Personen/Familien/Quellen + Suche über Dateiname/Titel/Notiz, kaputte Datei-
  // Referenz zeigt ⚠, INV-UI-5-kompakte Kacheln.
  //
  // Bewusst KEIN "＋ Neues Medium" (anders als SourceList): ein leeres Medium ohne Datei-
  // pfad ist bedeutungslos (Media.file ist die einzige Wahrheitsquelle, Spec 10 §4/14 §7).
  // Medien entstehen beim Import oder über den 📷-Schnellzugriff im Ereignis-Editor (Spec
  // 20 §1.4 [S]) — dieselbe "keine leere Neuanlage"-Begründung wie PersonPicker allowCreate.
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import { layout } from '../../shell/layout.svelte';
  import { noDataHint } from '../../shell/nav-model';
  import {
    buildMediaTiles,
    buildOwnerFilterOptions,
    matchesOwnerFilter,
    matchesMediaSearch,
    type MediaOwnerFilter,
    type MediaTileRow,
  } from './media-gallery-model';

  interface Props {
    appState: AppState;
    viewState: ViewState;
  }
  const { appState, viewState }: Props = $props();

  const allRows = $derived(buildMediaTiles(appState.db));
  const isEmpty = $derived(appState.db.media.size === 0);

  let filter = $state<MediaOwnerFilter>('all');
  let query = $state('');

  const filterOptions = $derived(buildOwnerFilterOptions(allRows));
  const rows = $derived(
    allRows.filter((r) => matchesOwnerFilter(r, filter) && matchesMediaSearch(r, query)),
  );

  // "kaputte Datei-Referenz zeigt ⚠": im Browser (kein Dateisystem-Zugriff) ist nur der
  // leere/fehlende Pfad zuverlässig als kaputt erkennbar — das echte "Datei existiert nicht"
  // bräuchte den FileService (Spec 14). Bewusst auf diese erkennbare Teilmenge beschränkt.
  function isBroken(row: MediaTileRow): boolean {
    return !row.file.trim();
  }

  const OWNER_ICONS: Record<'person' | 'family' | 'source', string> = {
    person: '👤',
    family: '👪',
    source: '📜',
  };

  function selectMedia(id: string) {
    viewState.setCurrent('media', id);
  }
</script>

<div class="media-gallery">
  {#if isEmpty}
    <p class="media-gallery__empty">{noDataHint('Medien', layout.isDesktopLayout)}</p>
  {:else}
    <div class="media-gallery__toolbar">
      <input
        type="search"
        class="media-gallery__search"
        placeholder="Dateiname, Titel, Notiz …"
        aria-label="Medien durchsuchen"
        bind:value={query}
      />
      <div class="stb-segment-row media-gallery__filters" aria-label="Medien nach Bezug filtern">
        {#each filterOptions as opt (opt.id)}
          <button
            type="button"
            class="stb-segment-btn"
            class:stb-segment-btn--active={filter === opt.id}
            aria-pressed={filter === opt.id}
            onclick={() => (filter = opt.id)}
          >
            {opt.label} <span class="media-gallery__filter-count">{opt.count}</span>
          </button>
        {/each}
      </div>
    </div>

    {#if rows.length === 0}
      <p class="media-gallery__empty">Kein Medium passt zu Filter/Suche.</p>
    {:else}
      <ul class="media-gallery__tiles">
        {#each rows as row (row.id)}
          <li>
            <button type="button" class="media-gallery__tile" onclick={() => selectMedia(row.id)}>
              <span class="media-gallery__tile-title">
                {#if isBroken(row)}<span class="media-gallery__warn" title="Datei-Referenz fehlt">⚠</span>{/if}
                {row.title}
              </span>
              <span class="media-gallery__tile-meta">
                {#if row.form}<span class="media-gallery__form">{row.form}</span>{/if}
                {#each [...row.ownerKinds] as kind (kind)}
                  <span class="media-gallery__owner" title={kind}>{OWNER_ICONS[kind]}</span>
                {/each}
                <span class="stb-list-stat">{row.refCount}× verknüpft</span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

<style>
  .media-gallery {
    overflow-y: auto;
  }

  .media-gallery__empty {
    padding: 1.5rem;
    color: var(--stb-text-dim);
  }

  .media-gallery__toolbar {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--stb-surface-2);
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .media-gallery__search {
    width: 100%;
    box-sizing: border-box;
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.6rem;
    font-size: 0.85rem;
  }

  .media-gallery__filter-count {
    opacity: 0.7;
    font-variant-numeric: tabular-nums;
  }

  .media-gallery__tiles {
    list-style: none;
    margin: 0;
    padding: 0.5rem;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
    gap: 0.5rem;
  }

  .media-gallery__tile {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.3rem;
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    padding: 0.6rem 0.7rem;
    text-align: left;
    cursor: pointer;
    color: var(--stb-text);
  }

  .media-gallery__tile:hover,
  .media-gallery__tile:focus-visible {
    border-color: var(--stb-gold-dim);
    background: var(--stb-surface-3);
  }

  .media-gallery__tile-title {
    font-weight: 600;
    font-size: 0.85rem;
    overflow-wrap: anywhere;
  }

  .media-gallery__warn {
    color: var(--stb-warn, #d9a400);
  }

  .media-gallery__tile-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: var(--stb-text-dim);
  }

  .media-gallery__form {
    text-transform: uppercase;
    font-size: 0.65rem;
    letter-spacing: 0.03em;
    padding: 0.05rem 0.35rem;
    border: 1px solid var(--stb-surface-3);
    border-radius: 9px;
  }
</style>
