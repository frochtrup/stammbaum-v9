<script lang="ts">
  // ui/views/media/MediaGallery.svelte — Medien-Tab-Liste (Spec 20 §1.4 [S] "① Kachel-
  // galerie"): globale Arbeitsfläche über db.media, nicht Personen-Tab-lokal. Besitzer-
  // Facette Personen/Familien/Quellen + Art-Facette (Dateien/Weblinks, ADR-v9-187), beide
  // ADDITIV (ADR-v9-192: Mehrfachauswahl je Reihe, ODER innerhalb, UND zwischen den
  // Reihen; „Alle" = leere Auswahl) + Suche über Dateiname/Titel/Notiz, kaputte
  // Datei-Referenz zeigt ⚠, INV-UI-5-kompakte Kacheln.
  //
  // Diese Fläche belegt in BEIDEN Formfaktoren die volle Breite (ADR-v9-192, `EntityTab`):
  // ein Kachelraster ist eine Arbeitsfläche, keine Spalte zum Überfliegen. Das Kachel-Grid
  // hier füllt deshalb, was es bekommt (`auto-fill`) — es rechnet nicht selbst mit einer
  // Breite und braucht dafür keine Layout-Kenntnis.
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
  import { PLAIN_FIELD } from '../../shell/plain-input';
  import type { ViewState } from '../../shell/view-state.svelte';
  import { layout } from '../../shell/layout.svelte';
  import { noDataHint } from '../../shell/nav-model';
  import { untrack } from 'svelte';
  import { createWindowed, type Windowed } from '../../shell/windowed.svelte';
  import {
    buildMediaTiles,
    buildOwnerFilterOptions,
    buildKindFilterOptions,
    hasBothMediaKinds,
    matchesOwnerFilter,
    matchesKindFilter,
    matchesMediaSearch,
    type MediaTileRow,
  } from './media-gallery-model';
  import { createMediaGalleryFilters, type MediaGalleryFilters } from './media-gallery-filters.svelte';
  import { webLinkHost } from '../../../core/model/media-kind';
  import MediaThumb from '../../shell/MediaThumb.svelte';
  import type { MediaResolver } from '../../../services/media';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    /** Medien-Auflösung (BL-258). Ohne sie bleiben Pfad-Bilder unaufgelöst — die Kachel
     *  zeigt dann Metadaten statt eines toten Bildsymbols. */
    mediaResolver?: MediaResolver;
    /**
     * Facetten-/Suchzustand von AUSSEN (ADR-v9-192). Muss die Detail-Navigation überleben:
     * seit die Galerie ganzflächig ist, baut sie beim Öffnen eines Mediums ab (Spec 21 §5,
     * Begründung in `media-gallery-filters.svelte.ts`). Optional, damit Komponententests
     * diese Fläche weiterhin ohne Umgebung montieren können — dann mit eigener Instanz,
     * die schlicht so lange lebt wie die Komponente.
     */
    filters?: MediaGalleryFilters;
    /**
     * Halter des virtuellen Scrollens (BL-311), von AUSSEN — wie `filters`, und weil
     * happy-dom kein Layout hat, ist er der einzige Weg, Messwerte für einen Test zu stellen
     * ([32 TST-24](../../../specs/v9/32-Testframework.md)).
     */
    windowed?: Windowed;
  }
  const {
    appState,
    viewState,
    mediaResolver,
    filters: filtersProp,
    windowed: windowedProp,
  }: Props = $props();

  // Einmal beim Aufbau festgelegt: die Instanz wird nie ausgetauscht (das `untrack` sagt
  // genau das — sonst warnte der Compiler zu Recht, hier werde nur der Anfangswert eines
  // Props gelesen). Der Zustand DARIN ist reaktiv, die Hülle nicht.
  const filters = untrack(() => filtersProp ?? createMediaGalleryFilters());

  const allRows = $derived(buildMediaTiles(appState.db));
  const isEmpty = $derived(appState.db.media.size === 0);

  // Additive Auswahl (ADR-v9-192): leere Menge = „Alle". Beide Reihen sind Mehrfachauswahl.
  const ownerSel = $derived(filters.owner);
  const kindSel = $derived(filters.kind);

  // Die Art-Vorauswahl hängt vom Bestand ab (ADR-v9-187) und steht deshalb erst fest, wenn
  // die Kacheln gebaut sind — nachgezogen nur bei einem Bestandswechsel, damit ein vom
  // Nutzer gesetzter Chip nicht zurückspringt (`syncKindDefault`).
  const showKindRow = $derived(hasBothMediaKinds(allRows));
  $effect(() => {
    filters.syncKindDefault(allRows);
  });

  // Facetten-Zähler: jede Reihe zählt über die von den ANDEREN Bedingungen gefilterte
  // Menge (s. `buildOwnerFilterOptions`) — die Zahl sagt damit, wie viele Kacheln ein Tipp
  // auf diesen Chip hinzufügt, statt eine Gesamtzahl zu versprechen, die die andere Reihe
  // längst beschnitten hat.
  const searched = $derived(allRows.filter((r) => matchesMediaSearch(r, filters.query)));
  const rowsForKindCounts = $derived(searched.filter((r) => matchesOwnerFilter(r, ownerSel)));
  const rowsForOwnerCounts = $derived(searched.filter((r) => matchesKindFilter(r, kindSel)));

  const ownerOptions = $derived(buildOwnerFilterOptions(rowsForOwnerCounts));
  const kindOptions = $derived(buildKindFilterOptions(rowsForKindCounts));

  const rows = $derived(searched.filter((r) => matchesKindFilter(r, kindSel) && matchesOwnerFilter(r, ownerSel)));

  // --- Virtuelles Scrollen (BL-311, ADR-v9-235/236) ---------------------------------------
  // EINE Fläche mit anderer Geometrie: die Galerie ist ein CSS-Raster, keine Liste. Gefenstert
  // wird deshalb über RASTERZEILEN, nicht über Kacheln. Rasterzeilen sind NICHT gleich hoch:
  // am Realbestand gemessen kommen 82,4 / 97,4 / 97,9 / 113,4px nebeneinander vor — Kacheln
  // mit Miniatur (`aspect-ratio: 4/3`) sind höher als Weblink-Kacheln, und ein umbrechender
  // Dateiname hebt eine ganze Reihe an (im Raster ist die Reihenhöhe das Maximum ihrer
  // Kacheln). Deshalb misst diese Fläche eine Höhe JE RASTERZEILE über dieselbe Primitive
  // wie die Listen. Ihr eigen bleiben nur die zwei Größen, die eine Liste nicht kennt:
  // Spaltenzahl und Zeilenabstand — letzterer steckt nicht in der Kachelhöhe und wird
  // deshalb auf die Präfixsumme addiert.
  const w = untrack(() => windowedProp ?? createWindowed());
  const sec = w.section('media');
  let spalten = $state(1);
  let zeilenAbstand = $state(0);

  /** Action am Raster: Spaltenzahl und Zeilenabstand messen, auch nach Größenänderung. */
  function raster(node: HTMLElement) {
    const messen = () => {
      const cs = window.getComputedStyle(node);
      // `grid-template-columns` liefert die AUFGELÖSTEN Spaltenbreiten — ihre Anzahl ist die
      // Spaltenzahl, ohne sie aus Container- und Mindestbreite nachrechnen zu müssen.
      const spaltenJetzt = cs.gridTemplateColumns.split(' ').filter(Boolean).length;
      if (spaltenJetzt > 0 && spaltenJetzt !== spalten) spalten = spaltenJetzt;
      const abstand = parseFloat(cs.rowGap) || 0;
      if (abstand !== zeilenAbstand) zeilenAbstand = abstand;
    };
    messen();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => messen());
    ro?.observe(node);
    return { destroy: () => ro?.disconnect() };
  }

  const spaltenSicher = $derived(Math.max(spalten, 1));
  const rasterZeilen = $derived(Math.ceil(rows.length / spaltenSicher));
  /** Rasterzeile einer Kachel — mehrere Kacheln teilen sich eine, und ihre Höhe auch. */
  const rasterZeileVon = (kachelIndex: number) => Math.floor(kachelIndex / spaltenSicher);

  /**
   * HÖHENKLASSE EINER RASTERZEILE — und warum sie hier nötig ist, nicht bloß hübsch.
   *
   * Im Raster ist die Reihenhöhe das MAXIMUM ihrer Kacheln, und eine Kachel mit Miniatur ist
   * mehr als doppelt so hoch wie eine ohne (`aspect-ratio: 4/3`; am Realbestand gemessen
   * 82–98px gegen 205–220px). Mit EINER Klasse ist die Schätzung für ungemessene Reihen der
   * Höchstwert — also 2,7× zu hoch für die Mehrheit. Jede neu gemessene Reihe korrigiert das
   * Modell dann stark nach unten, das verschiebt das Fenster, das rendert neue Reihen, die
   * gemessen werden … Bei einem großen Sprung kettet sich das innerhalb EINES Svelte-Takts so
   * oft, dass der Effektbaum abbricht (`effect_update_depth_exceeded`, im Browser ausgelöst).
   * Ob eine Reihe eine Miniatur enthält, steht aber in den DATEN — damit liegt die Schätzung
   * je Klasse nah an der Wahrheit und die Korrekturen bleiben klein.
   */
  const zeigtMiniatur = (row: (typeof rows)[number]) => row.fileKind !== 'weblink' && row.isImage;
  const klasseVonRasterzeile = (r: number) => {
    const von = r * spaltenSicher;
    for (let i = von; i < von + spaltenSicher && i < rows.length; i++) {
      if (zeigtMiniatur(rows[i])) return 'bild';
    }
    return 'text';
  };
  const off = $derived.by(() => {
    // Die gemessenen Höhen kommen aus DERSELBEN Primitive wie bei den Listen (je Rasterzeile
    // eine, gemessen sobald sie einmal im Fenster stand). Was sie nicht kennen kann, ist der
    // Zeilenabstand des Rasters: `getBoundingClientRect` einer Kachel enthält ihn nicht.
    // Deshalb hier aufaddiert — vor Zeile `i` liegen genau `i` Abstände.
    const roh = sec.offsets(rasterZeilen, klasseVonRasterzeile);
    const mitAbstand = new Float64Array(roh.length);
    for (let i = 1; i < roh.length; i++) mitAbstand[i] = roh[i] + zeilenAbstand * i;
    return mitAbstand;
  });
  const win = $derived(sec.slice(off));
  const sichtbareKacheln = $derived(rows.slice(win.start * spaltenSicher, win.end * spaltenSicher));


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

<div class="media-gallery" use:w.container>
  {#if isEmpty}
    <p class="media-gallery__empty">{noDataHint('Medien', layout.isDesktopLayout)}</p>
  {:else}
    <div class="media-gallery__toolbar">
      <input
        type="search" {...PLAIN_FIELD}
        class="media-gallery__search"
        placeholder="Dateiname, Titel, Notiz …"
        aria-label="Medien durchsuchen"
        value={filters.query}
        oninput={(e) => filters.setQuery(e.currentTarget.value)}
      />
      <!-- Beide Reihen: Mehrfachauswahl (ADR-v9-192). `aria-pressed` statt `role="tab"` —
           die Chips sind Umschalter, keine Navigation; mehrere dürfen gleichzeitig
           gedrückt sein. Der „Alle"-Chip ist kein weiterer Wert, sondern das Leeren der
           Auswahl, und ist genau dann gedrückt, wenn nichts gewählt ist. -->
      {#if showKindRow}
        <div class="stb-segment-row media-gallery__filters" aria-label="Medien nach Art filtern">
          <button
            type="button"
            class="stb-segment-btn"
            class:stb-segment-btn--active={kindSel.size === 0}
            aria-pressed={kindSel.size === 0}
            onclick={() => filters.clearKind()}
          >
            Alle <span class="media-gallery__filter-count">{rowsForKindCounts.length}</span>
          </button>
          {#each kindOptions as opt (opt.id)}
            <button
              type="button"
              class="stb-segment-btn"
              class:stb-segment-btn--active={kindSel.has(opt.id)}
              aria-pressed={kindSel.has(opt.id)}
              onclick={() => filters.toggleKind(opt.id)}
            >
              {opt.label} <span class="media-gallery__filter-count">{opt.count}</span>
            </button>
          {/each}
        </div>
      {/if}
      <div class="stb-segment-row media-gallery__filters" aria-label="Medien nach Bezug filtern">
        <button
          type="button"
          class="stb-segment-btn"
          class:stb-segment-btn--active={ownerSel.size === 0}
          aria-pressed={ownerSel.size === 0}
          onclick={() => filters.clearOwner()}
        >
          Alle <span class="media-gallery__filter-count">{rowsForOwnerCounts.length}</span>
        </button>
        {#each ownerOptions as opt (opt.id)}
          <button
            type="button"
            class="stb-segment-btn"
            class:stb-segment-btn--active={ownerSel.has(opt.id)}
            aria-pressed={ownerSel.has(opt.id)}
            onclick={() => filters.toggleOwner(opt.id)}
          >
            {opt.label} <span class="media-gallery__filter-count">{opt.count}</span>
          </button>
        {/each}
      </div>
    </div>

    {#if rows.length === 0}
      <p class="media-gallery__empty">Kein Medium passt zu Filter/Suche.</p>
    {:else}
      <ul class="media-gallery__tiles" use:sec.frame use:raster>
        {#if win.padTop > 0}
          <li class="stb-window-pad media-gallery__pad" style:height={win.padTop + 'px'} aria-hidden="true"></li>
        {/if}
        {#each sichtbareKacheln as row, i (row.id)}
          <li use:sec.probe={{ klasse: klasseVonRasterzeile(rasterZeileVon(win.start * spaltenSicher + i)), index: rasterZeileVon(win.start * spaltenSicher + i) }}>
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
        {#if win.padBottom > 0}
          <li class="stb-window-pad media-gallery__pad" style:height={win.padBottom + 'px'} aria-hidden="true"></li>
        {/if}
      </ul>
    {/if}
  {/if}
</div>

<style>
  /* Eigener Scroll-Container: seit ADR-v9-192 belegt die Galerie die volle Fläche und
     hängt nicht mehr im scrollenden Listen-Pane des Multi-Pane — sie muss ihre Höhe
     jetzt selbst begrenzen, sonst wächst sie über die Fläche hinaus. */
  .media-gallery {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .media-gallery__empty {
    padding: 1.5rem;
    color: var(--stb-text-dim);
  }

  /* Die beiden Filterreihen sitzen IN dieser Toolbar, die bereits 1rem seitlich
     polstert — die reihen-eigene Polsterung aus `.stb-segment-row` (0.75rem) käme
     obendrauf. 56 der 375px gingen so an Ränder, und die Bezugs-Reihe („Alle ·
     Personen · Familien · Quellen") brauchte 346,5px bei 343 verfügbaren: sie brach um,
     drei Pixel zu knapp. Die Polsterung gehört hierher, wo alle Kinder der Toolbar
     dieselbe Kante bekommen — nicht ein zweites Mal an jede Reihe. */
  .media-gallery__filters {
    padding-inline: 0;
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

  /* Die Platzhalter des Fensters müssen im Raster die volle Breite einnehmen — sonst
     belegten sie eine Kachelspalte und verschöben die Reihen. */
  .media-gallery__pad {
    grid-column: 1 / -1;
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
