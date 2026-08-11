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
  import { focusOnMap } from '../../shell/map-focus';
  import { tooltip } from '../../shell/tooltip';
  import type { PlacesNav } from '../../shell/places-host';
  import type { LensId } from '../../shell/lens-model';
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
    /** Sprung zur Karte-Lens (ADR-v9-150). NUR wenn `viewState` UND `onNavigateLens`
     *  gesetzt sind, wird die Karte klickbar — sonst bleibt sie reine Anzeige (Report-
     *  Kontext, isolierte Tests). */
    viewState?: PlacesNav;
    /** Optionale Marker-Hervorhebung am Ziel (Place-/Hof-Id) — s. `focusOnMap`. */
    focusId?: string | null;
    onNavigateLens?: (lens: LensId) => void;
  }
  const {
    lat,
    long,
    label,
    context = { kind: 'ort' },
    viewState,
    focusId = null,
    onNavigateLens,
  }: Props = $props();

  const hasCoords = $derived(lat != null && long != null);

  /** Klickbar nur mit vollständigem Navigations-Kontext (s. Props). */
  const canFocus = $derived(!!viewState && !!onNavigateLens && hasCoords);

  function openLens(): void {
    // Kein Klick-Wächter mehr für die Attribution: sie liegt seit BL-66 außerhalb des
    // Rahmens (s. Kommentar am Markup) — es gibt im Rahmen kein Bedienelement, dessen
    // Ziel gekapert werden könnte.
    focusOnMap(viewState!, lat != null && long != null ? { lat, long } : null, focusId, onNavigateLens);
  }

  function onFrameKey(ev: KeyboardEvent): void {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    openLens();
  }

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

{#snippet mapBody()}
  {#if usingFallback}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html svg}
  {:else}
    <div class="mini-map__leaflet" bind:this={containerEl}></div>
  {/if}
{/snippet}

{#if hasCoords}
  <section class="place-detail__section mini-map">
    <h3 class="stb-section-title">Karte</h3>
    <!-- Die Karte IST der Sprung zur Karte-Lens (ADR-v9-150 / INV-UI-12a: die Aktion hängt
         am Element, das ihre Bedeutung ohnehin trägt — kein separater „→ zur Karte"-Link
         daneben). `role="button"` statt `<button>`, weil die Leaflet-Attribution eigene
         `<a>` enthält und interaktive Elemente nicht ineinander verschachtelt werden
         dürfen; Enter/Space sind darum von Hand verdrahtet (dasselbe Muster wie
         `EventLine.svelte`, ADR-v9-105).
         Zwei statische Zweige statt EINES Rahmens mit bedingtem `role`/`tabindex`: Sveltes
         a11y-Analyse wertet ein dynamisches `role` nicht aus und meldete sonst
         „noninteractive element cannot have nonnegative tabIndex" — die Warnung wäre falsch,
         aber sie zu unterdrücken hieße, den Prüfer für einen echten künftigen Fall
         abzustumpfen. Der Inhalt liegt in EINEM Snippet, also keine Duplikation. -->
    {#if canFocus}
      <div
        class="mini-map__frame mini-map__frame--clickable"
        role="button"
        tabindex="0"
        aria-label={`${label ?? 'Ort'} auf der großen Karte öffnen`}
        use:tooltip={'Auf der großen Karte öffnen'}
        onclick={openLens}
        onkeydown={onFrameKey}
      >
        {@render mapBody()}
        <!-- Dauerhafte Affordanz, nicht nur Hover: Tooltip und `cursor:pointer` existieren
             auf Touch nicht — und iPhone/iPad ist die Primärplattform ([21 §2](21-UI-UX)).
             Ein Hover-only-Hinweis hätte die Karte auf dem Hauptgerät stumm gelassen.
             Glyph ist `◎` (Spec 21 §7: „Koordinaten vorhanden" UND der interne Karte-Sprung,
             ADR-v9-78/80) — NICHT `↗`, das dort ausschließlich „externen Link öffnen"
             bedeutet und hier die Symbolsprache brechen würde. -->
        <span class="mini-map__cue" aria-hidden="true">◎</span>
      </div>
    {:else}
      <!-- Ohne Navigations-Kontext (Report/isolierter Test) reine Anzeige — kein
           Klick-Signal ohne Ziel, gleiche Regel wie `CoordIndicator`s Fehlend-Zustand. -->
      <div class="mini-map__frame">{@render mapBody()}</div>
    {/if}
    <!-- Attribution UNTER dem Rahmen statt darin (BL-66, s. `mini-leaflet.ts`): im
         Rahmen wäre sie ein Link innerhalb einer Schaltfläche. Nur im Kachel-Zweig —
         der Offline-Vektor-Renderer zeigt keine OSM-Kacheln. -->
    {#if !usingFallback}
      <p class="mini-map__attribution">
        © <a href="https://openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>
      </p>
    {/if}
  </section>
{/if}

<style>
  /* Dezent wie zuvor Leaflets eigene Attributionsleiste (9px), nur außerhalb des
     Rahmens — die Namensnennung bleibt sichtbar direkt an der Karte. */
  .mini-map__attribution {
    max-width: 420px;
    margin: 2px 0 0;
    font-size: 9px;
    color: var(--stb-text-dim);
    text-align: right;
  }

  .mini-map__frame {
    max-width: 420px;
    border-radius: var(--stb-radius-card);
    overflow: hidden;
    border: 1px solid var(--stb-gold-dim);
    line-height: 0; /* kein Text-Baseline-Spalt unter dem inline-SVG */
  }

  /* Klick-Affordanz (ADR-v9-150): dieselbe Gold-Aufhellung, mit der die App überall
     „hier kann man klicken" sagt (Listenzeilen-Hover, `CoordIndicator`-Chip). Kein
     Dauer-Icon auf der Karte — das Bild selbst ist die Fläche. */
  .mini-map__frame--clickable {
    cursor: pointer;
    transition: border-color 120ms ease;
    position: relative; /* Anker für den Klick-Hinweis */
  }

  /* Klick-Hinweis in der oberen rechten Ecke — die Leaflet-Attribution sitzt unten rechts,
     die Ecken kollidieren also nicht. Dezent, aber auf Kachel- WIE Vektor-Grundkarte
     lesbar (eigener dunkler Grund statt Transparenz). */
  .mini-map__cue {
    position: absolute;
    top: 0.4rem;
    right: 0.4rem;
    z-index: 500; /* über Leaflets Kachel-Panes */
    display: grid;
    place-items: center;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--stb-surface-1) 82%, transparent);
    border: 1px solid var(--stb-gold-dim);
    color: var(--stb-gold);
    font-size: 0.9rem;
    line-height: 1;
    pointer-events: none; /* der ganze Rahmen ist das Ziel, nicht dieser Punkt */
  }

  .mini-map__frame--clickable:hover .mini-map__cue,
  .mini-map__frame--clickable:focus-visible .mini-map__cue {
    border-color: var(--stb-gold);
  }

  .mini-map__frame--clickable:hover,
  .mini-map__frame--clickable:focus-visible {
    border-color: var(--stb-gold);
  }

  /* Reduced-Motion respektieren (§6i) — der Übergang ist Zierde, kein Signal. */
  @media (prefers-reduced-motion: reduce) {
    .mini-map__frame--clickable {
      transition: none;
    }
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
