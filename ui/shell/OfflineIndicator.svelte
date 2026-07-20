<script lang="ts">
  // Offline-Indikator der Schale (BL-03, Spec 20 §1.2).
  //
  // Ton bewusst neutral, nicht alarmierend: diese App ist offline-first (LP-2, Spec 30
  // NFR-2) — ohne Netz zu arbeiten ist der Normalfall, kein Fehler. Der Indikator
  // erklärt lediglich, warum z. B. Kartenkacheln fehlen. Deshalb gedämpftes Gold statt
  // der Fehlerfarbe; v8 färbte ihn rot (`--red`), was den Zustand als Störung
  // darstellte, die er hier nicht ist.
  //
  // EIN Ausnahmefall verdient echte Warnfarbe: offline UND kein App-Cache — dann
  // überlebt die App den nächsten Reload nicht (v8-Orakel `_checkCacheStatus`).
  //
  // Tooltip über die geteilte Action, nicht über natives `title` (ADR-v9-86: nativ
  // erscheint auf Touch/iPad gar nicht).
  import { tooltip } from './tooltip';
  import { onlineStatus } from './online-status.svelte';

  const sichtbar = $derived(!onlineStatus.online);
  const ohneCache = $derived(!onlineStatus.online && !onlineStatus.appCached);
  const hinweis = $derived(
    ohneCache
      ? 'Offline — und die App ist noch nicht vollständig gespeichert. Einmal online öffnen, damit sie auch ohne Netz startet.'
      : 'Offline — die App läuft aus dem Cache. Bearbeiten und Speichern funktionieren normal.',
  );
</script>

{#if sichtbar}
  <span
    class="stb-offline"
    class:stb-offline--warn={ohneCache}
    role="status"
    aria-label={hinweis}
    use:tooltip={hinweis}
  >
    ⊘ offline
  </span>
{/if}

<style>
  .stb-offline {
    display: inline-block;
    margin-left: 0.5rem;
    padding: 0.05rem 0.4rem;
    border: 1px solid var(--stb-gold-dim);
    border-radius: 6px;
    color: var(--stb-text-dim);
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    vertical-align: middle;
    white-space: nowrap;
  }

  .stb-offline--warn {
    border-color: var(--stb-danger);
    color: var(--stb-danger);
  }
</style>
