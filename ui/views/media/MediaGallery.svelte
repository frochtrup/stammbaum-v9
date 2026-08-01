<script lang="ts">
  // ui/views/media/MediaGallery.svelte — Medien-Tab-Liste (Spec 20 §1.4 [S] "① Kachel-
  // galerie"): globale Arbeitsfläche über db.media, nicht Personen-Tab-lokal. Besitzer-
  // Filter Alle/Personen/Familien/Quellen + Art-Facette (Dateien/Weblinks, ADR-v9-187)
  // + Suche über Dateiname/Titel/Notiz, kaputte Datei-Referenz zeigt ⚠, INV-UI-5-
  // kompakte Kacheln.
  //
  // Die Art-Facette ist kein Kosmetik-Filter: am Realbestand sind 452 der 642 Medien
  // Weblinks (Online-Fundorte von Zitaten) und würden die 189 echten Dateien überdecken.
  // Welcher Art ein Wert ist, entscheidet der Kern (`core/model/media-kind.ts`), nicht
  // diese View — dieselbe Quelle speist Detail, Steckbrief und Berichte.
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
    buildKindFilterOptions,
    initialKindFilter,
    matchesOwnerFilter,
    matchesKindFilter,
    matchesMediaSearch,
    type MediaOwnerFilter,
    type MediaKindFilter,
    type MediaTileRow,
  } from './media-gallery-model';
  import { webLinkHost } from '../../../core/model/media-kind';
  import MediaThumb from '../../shell/MediaThumb.svelte';
  import type { MediaResolver } from '../../../services/media';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    /** Medien-Auflösung (BL-258). Ohne sie bleiben Pfad-Bilder unaufgelöst — die Kachel
     *  zeigt dann Metadaten statt eines toten Bildsymbols. */
    mediaResolver?: MediaResolver;
  }
  const { appState, viewState, mediaResolver }: Props = $props();

  const allRows = $derived(buildMediaTiles(appState.db));
  const isEmpty = $derived(appState.db.media.size === 0);

  let filter = $state<MediaOwnerFilter>('all');
  let query = $state('');

  const filterOptions = $derived(buildOwnerFilterOptions(allRows));
  const kindOptions = $derived(buildKindFilterOptions(allRows));

  // Die Art-Vorauswahl hängt vom Bestand ab (ADR-v9-187) und steht deshalb erst fest,
  // wenn die Kacheln gebaut sind. `$state` + Nachziehen per Schlüssel statt `$derived`:
  // der Nutzer soll den Chip wechseln können, ohne dass die Ableitung ihn zurücksetzt.
  let kindFilter = $state<MediaKindFilter>('all');
  let kindFilterKey = $state('');
  $effect(() => {
    const key = `${allRows.length}:${kindOptions.length}`;
    if (key !== kindFilterKey) {
      kindFilterKey = key;
      kindFilter = initialKindFilter(allRows);
    }
  });

  const rows = $derived(
    allRows.filter(
      (r) =>
        matchesOwnerFilter(r, filter) &&
        matchesKindFilter(r, kindFilter) &&
        matchesMediaSearch(r, query),
    ),
  );

  // ⚠ auf der Kachel-ÜBERSCHRIFT meint weiterhin nur den fehlenden Verweis; ob eine
  // Datei im Ordner auffindbar ist, beantwortet `MediaThumb` an der Bildstelle selbst
  // (dort steht auch der Dateiname im Tooltip).
  function isBroken(row: MediaTileRow): boolean {
    return row.fileKind === 'empty';
  }

  // Ein Ordnerwechsel muss jede Kachel neu auflösen lassen; der Resolver ist bewusst
  // kein Svelte-Store (er gehört der services-Schicht), also ist dieser Schlüssel die
  // Brücke. Die Galerie liest ihn beim Mount und wenn die Zahl der Ordner-Dateien
  // wechselt — mehr Kopplung braucht es nicht.
  const folderKey = $derived(mediaResolver?.status().fileCount ?? 0);

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
      {#if kindOptions.length > 0}
        <div class="stb-segment-row media-gallery__filters" aria-label="Medien nach Art filtern">
          {#each kindOptions as opt (opt.id)}
            <button
              type="button"
              class="stb-segment-btn"
              class:stb-segment-btn--active={kindFilter === opt.id}
              aria-pressed={kindFilter === opt.id}
              onclick={() => (kindFilter = opt.id)}
            >
              {opt.label} <span class="media-gallery__filter-count">{opt.count}</span>
            </button>
          {/each}
        </div>
      {/if}
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
              {#if row.fileKind !== 'weblink' && row.isImage}
                <MediaThumb
                  file={row.file}
                  form={row.form}
                  resolver={mediaResolver}
                  resolveKey={folderKey}
                  size="tile"
                />
              {/if}
              <span class="media-gallery__tile-title">
                {#if isBroken(row)}<span class="media-gallery__warn" title="Datei-Referenz fehlt">⚠</span>{/if}
                {row.title}
              </span>
              <span class="media-gallery__tile-meta">
                {#if row.fileKind === 'weblink'}
                  <span class="media-gallery__host" title={row.file}>↗ {webLinkHost(row.file) || 'Weblink'}</span>
                {:else if !row.isImage && row.fileKind !== 'empty'}
                  <span class="media-gallery__doc" title="Dokument">📄</span>
                {/if}
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

  .media-gallery__host {
    overflow-wrap: anywhere;
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
