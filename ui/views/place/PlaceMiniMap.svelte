<script lang="ts">
  // ui/views/place/PlaceMiniMap.svelte — Mini-Karte im Ort-/Hof-Steckbrief (BL-09, Spec 20
  // §1.7/§1.8). Präsentations-Komponente ohne eigene Kartenlogik: sie rendert den
  // gemeinsamen, reinen SVG-Renderer `renderMiniMapSvg` (ui/islands/map/mini-map.ts) — EIN
  // Mechanismus für Steckbrief UND Berichte (INV-UI-4). Keine Leaflet-/Netz-Abhängigkeit
  // (die interaktive Exploration lebt in der Karte-Lens; hierher springt der
  // CoordIndicator, ADR-v9-78 Punkt 4). Rendert NICHTS, wenn keine Koordinaten vorliegen —
  // der Aufrufer muss nicht selbst prüfen.
  import { renderMiniMapSvg } from '../../islands/map/mini-map';

  interface Props {
    lat: number | null;
    long: number | null;
    /** Zugänglicher Name (Ortsname/Hof-Adresse) für aria-label + Tooltip. */
    label?: string;
  }
  const { lat, long, label }: Props = $props();

  const hasCoords = $derived(lat != null && long != null);
  // {@html} ist hier sicher: `renderMiniMapSvg` ist ein reiner, projekt-eigener Renderer,
  // der jeden Textanteil (label) selbst maskiert — kein Fremd-HTML.
  const svg = $derived(hasCoords ? renderMiniMapSvg({ lat: lat!, long: long!, label }) : '');
</script>

{#if hasCoords}
  <section class="place-detail__section mini-map">
    <h3>Karte</h3>
    <div class="mini-map__frame">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html svg}
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
</style>
