<script lang="ts">
  // ui/views/quality/GeoFindingsTile.svelte — Wegweiser-Kachel für Orts-/Hof-Befunde auf
  // dem sonst personbezogenen Qualitäts-Dashboard (Nutzer-Fund 2026-07-28: „Prüfung wirkt
  // personorientiert, Orts-/Hof-Probleme werden nicht angezeigt"). Geo-Befunde tragen keine
  // Person und bleiben aus der Dashboard-Auswertung heraus (core/validate/dashboard.ts) —
  // sie leben nur im „✓ Bericht". Diese Kachel ist das einzige Dauersignal dafür und öffnet
  // den Bericht. Keine zweite Engine, kein zweites Badge (§3): nur ein Wegweiser.
  import { SEVERITY_ICON } from '../validation/validation-model';

  interface Props {
    error: number;
    warn: number;
    info: number;
    /** true, wenn der Bericht bereits offen ist (aria-expanded). */
    expanded: boolean;
    onOpen: () => void;
  }
  const { error, warn, info, expanded, onOpen }: Props = $props();
  const total = $derived(error + warn + info);
</script>

<button
  type="button"
  class="geo-tile"
  class:geo-tile--clean={total === 0}
  onclick={onOpen}
  aria-expanded={expanded}
>
  <span class="geo-tile__icon" aria-hidden="true">🗺</span>
  <span class="geo-tile__lbl">Orte &amp; Höfe</span>
  {#if total === 0}
    <span class="geo-tile__count">keine Befunde</span>
  {:else}
    <span class="geo-tile__count">
      {#if error > 0}<span class="geo-tile__sev geo-tile__sev--error"
          >{SEVERITY_ICON.error} {error}</span
        >{/if}
      {#if warn > 0}<span class="geo-tile__sev geo-tile__sev--warn"
          >{SEVERITY_ICON.warn} {warn}</span
        >{/if}
      {#if info > 0}<span class="geo-tile__sev geo-tile__sev--info"
          >{SEVERITY_ICON.info} {info}</span
        >{/if}
    </span>
  {/if}
  <span class="geo-tile__go" aria-hidden="true">›</span>
</button>

<style>
  .geo-tile {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: calc(100% - 1.5rem);
    margin: 0.6rem 0.75rem 0;
    padding: 0.5rem 0.6rem;
    background: var(--stb-surface-1);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-card);
    color: var(--stb-text);
    font-size: 0.85rem;
    text-align: left;
    cursor: pointer;
  }

  .geo-tile:hover {
    border-color: var(--stb-gold-light);
  }

  .geo-tile--clean {
    color: var(--stb-text-dim);
  }

  .geo-tile__icon {
    font-size: 1rem;
  }

  .geo-tile__lbl {
    font-weight: 600;
  }

  .geo-tile__count {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
    color: var(--stb-text-dim);
    font-size: 0.8rem;
  }

  .geo-tile__sev--error { color: var(--stb-danger, #e06c6c); }
  .geo-tile__sev--warn { color: var(--stb-warn, #d9a441); }
  .geo-tile__sev--info { color: var(--stb-text-dim); }

  .geo-tile__go {
    color: var(--stb-gold-light);
    font-size: 1.1rem;
  }

  .geo-tile--clean .geo-tile__go {
    color: var(--stb-text-dim);
  }
</style>
