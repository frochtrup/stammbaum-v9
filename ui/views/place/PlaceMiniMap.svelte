<script lang="ts">
  // ui/views/place/PlaceMiniMap.svelte — Mini-Karte im Ort-/Hof-Steckbrief (BL-214,
  // ADR-v9-147). Präsentations-Komponente ohne eigene Kartenlogik. Zeigt einen
  // KONTEXT-Ausschnitt (`fitMiniMapBounds`, Punkt 1) — Ort: Regional-Zoom, Hof: Dorf +
  // Geschwisterhöfe.
  //
  // Grundkarte zweigeteilt nach Kontext (ADR-v9-147 Punkt 2):
  //  · App ONLINE  → echte OSM-Kacheln (`mini-leaflet.ts`, Wiederverwendung des Kachel-
  //    Insels). Am Hof-Zoom die eigentliche Rettung (Straßen/Häuser sichtbar).
  //  · App OFFLINE → gebündelter Vektor-Renderer (`mini-map.ts`, region-geo) als
  //    self-contained SVG — netz-frei, deterministisch, derselbe Renderer wie im Report.
  //  Umschaltung wie MapLensView (ADR-v9-25): Startwert `onlineStatus.online` (sticky,
  //  `untrack` — kein Flackern), danach schaltet nur `onTileError` auf den Vektor-Fallback.
  //
  // Rendert NICHTS ohne Koordinaten (der unangereicherte Regelfall) — der Aufrufer muss
  // nicht selbst prüfen.
  import { onDestroy, untrack } from 'svelte';
  import { onlineStatus } from '../../shell/online-status.svelte';
  import { renderMiniMapSvg } from '../../islands/map/mini-map';
  import { fitMiniMapBounds, type MiniMapContext, type LatLong } from '../../islands/map/mini-map-bounds';
  import { mountMiniLeaflet, type MiniLeafletHandle } from '../../islands/map/mini-leaflet';
  import '../../islands/map/mini-leaflet.css';

  /** Kontext für die Ausschnittswahl — ohne lat/long (die kommen aus den Props). */
  type PlaceKindContext =
    | { kind: 'ort' }
    | { kind: 'hof'; villageCoords?: LatLong | null; siblingCoords?: LatLong[] };

  interface Props {
    lat: number | null;
    long: number | null;
    /** Zugänglicher Name (Ortsname/Hof-Adresse) für aria-label + Tooltip. */
    label?: string;
    /** Ort (Regional-Zoom) oder Hof (Dorf + Geschwisterhöfe). Default: Ort. */
    context?: PlaceKindContext;
  }
  const { lat, long, label, context = { kind: 'ort' } }: Props = $props();

  const hasCoords = $derived(lat != null && long != null);

  /** Gedämpfte Kontext-Punkte (Dorf + Geschwisterhöfe) — nur im Hof-Kontext. */
  const contextPoints = $derived.by<LatLong[]>(() => {
    if (context.kind !== 'hof') return [];
    const pts: LatLong[] = [];
    if (context.villageCoords) pts.push(context.villageCoords);
    for (const s of context.siblingCoords ?? []) pts.push(s);
    return pts;
  });

  const bounds = $derived(
    hasCoords
      ? fitMiniMapBounds(
          context.kind === 'hof'
            ? { kind: 'hof', lat: lat!, long: long!, villageCoords: context.villageCoords, siblingCoords: context.siblingCoords }
            : ({ kind: 'ort', lat: lat!, long: long! } satisfies MiniMapContext),
        )
      : null,
  );

  // Startwert aus dem geteilten Schalen-Zustand (INV-UI-4, BL-03); `untrack`, damit ein
  // späterer Online-Wechsel nicht doch umschaltet (Sticky, ADR-v9-25).
  let usingFallback = $state(untrack(() => !onlineStatus.online));
  let containerEl = $state<HTMLDivElement | null>(null);
  let handle: MiniLeafletHandle | null = null;

  // {@html} ist hier sicher: `renderMiniMapSvg` ist ein reiner, projekt-eigener Renderer,
  // der jeden Textanteil (label) selbst maskiert — kein Fremd-HTML.
  const svg = $derived(
    hasCoords && usingFallback && bounds
      ? renderMiniMapSvg({ lat: lat!, long: long!, bounds, label, contextPoints })
      : '',
  );

  function mountOrUpdate(): void {
    if (usingFallback || !hasCoords || !bounds || !containerEl) {
      if (handle) {
        handle.destroy();
        handle = null;
      }
      return;
    }
    const opts = {
      lat: lat!,
      long: long!,
      bounds,
      label,
      contextPoints,
      onTileError: () => {
        // Verlässliches Signal: Kacheln laden nicht → auf den Vektor-Fallback wechseln.
        if (usingFallback) return;
        handle?.destroy();
        handle = null;
        usingFallback = true;
      },
    };
    if (!handle) handle = mountMiniLeaflet(containerEl, opts);
    else handle.update(opts);
  }

  $effect(() => {
    void lat;
    void long;
    void bounds;
    void contextPoints;
    void usingFallback;
    void containerEl;
    mountOrUpdate();
  });

  onDestroy(() => {
    handle?.destroy();
    handle = null;
  });
</script>

{#if hasCoords}
  <section class="place-detail__section mini-map">
    <h3>Karte</h3>
    <div class="mini-map__frame">
      {#if usingFallback}
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html svg}
      {:else}
        <div class="mini-map__leaflet" bind:this={containerEl}></div>
      {/if}
    </div>
  </section>
{/if}

<style>
  .mini-map__frame {
    max-width: 420px;
    border-radius: var(--stb-radius-card);
    overflow: hidden;
    border: 1px solid var(--stb-gold-dim);
    line-height: 0; /* kein Text-Baseline-Spalt unter dem inline-SVG */
  }

  /* Das SVG füllt den Rahmen; das Seitenverhältnis (viewBox 1000×520) bleibt erhalten. */
  .mini-map__frame :global(.mini-map__svg) {
    display: block;
    width: 100%;
    height: auto;
  }

  .mini-map__leaflet {
    width: 100%;
  }
</style>
