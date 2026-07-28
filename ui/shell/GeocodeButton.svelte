<script lang="ts">
  // Wiederverwendbarer Nominatim-Geocode-Button (BL-130, Spec 20 §1.7). Kapselt Aufruf,
  // Ladezustand und Status-/Fehlerzeile. Schreibt NICHTS selbst — er reicht den Treffer
  // per `onResult` an den Aufrufer, der ihn zur Prüfung ins Formular übernimmt
  // (Review-vor-Speichern). Opt-in: läuft nur auf Klick. Plattform-`fetch` steckt im
  // injizierten Adapter des Service (services/places), nicht hier.
  import { geocodePlace, browserGeocodeDeps } from '../../services/places';
  import type { GeocodeHit } from '../../core/places';

  interface Props {
    /** Der zu geocodierende Name (z. B. der aktuelle Orts-/Hof-Titel). */
    name: string;
    onResult: (hit: GeocodeHit) => void;
  }
  const { name, onResult }: Props = $props();

  let busy = $state(false);
  let msg = $state<string | null>(null);

  async function run() {
    const q = name.trim();
    if (!q) {
      msg = '⚠ Kein Name zum Geocodieren';
      return;
    }
    busy = true;
    msg = null;
    try {
      const hit = await geocodePlace(q, browserGeocodeDeps());
      if (!hit) {
        msg = '⚠ Kein Ergebnis von Nominatim';
        return;
      }
      onResult(hit);
      msg = '✓ Koordinaten übernommen — prüfen und speichern';
    } catch {
      msg = '⚠ Geocoding fehlgeschlagen (offline?)';
    } finally {
      busy = false;
    }
  }
</script>

<div class="geocode">
  <button type="button" class="geocode__btn" onclick={run} disabled={busy}>
    {busy ? 'Geocodiere…' : '📍 Via Nominatim geocodieren'}
  </button>
  {#if msg}<span class="geocode__msg">{msg}</span>{/if}
</div>

<style>
  .geocode {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .geocode__btn {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.6rem;
    font: inherit;
    cursor: pointer;
  }

  .geocode__btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .geocode__msg {
    font-size: 0.8rem;
    color: var(--stb-text-dim);
  }
</style>
