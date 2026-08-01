<script lang="ts">
  // Update-Hinweis (BL-02, Spec 30 NFR-2: „Bei App-Update: Nutzerhinweis — kein
  // stiller Bruch durch alten Cache").
  //
  // Eigene Komponente statt der passiven `app-shell__notice`-Zeile, weil dieser
  // Hinweis eine ACTION trägt (INV-UI-12: die Aktion sitzt am bedeutungstragenden
  // Element, kein „Tu X →"-Fließtext). Er verdrängt nichts und blockiert nichts —
  // wer weiterarbeiten will, ignoriert ihn; das Update wartet.
  interface Props {
    /** Sichtbar, sobald eine neue Version installiert und wartebereit ist. */
    visible: boolean;
    /** Übernimmt die wartende Version und lädt neu. */
    onApply: () => void;
  }
  const { visible, onApply }: Props = $props();
</script>

{#if visible}
  <div class="stb-update" role="status">
    <span class="stb-update__text">Neue Version verfügbar.</span>
    <button type="button" class="stb-btn stb-update__action" data-variant="secondary" onclick={onApply}>Neu laden</button>
  </div>
{/if}

<style>
  .stb-update {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 0.45rem 1rem;
    background: var(--stb-surface-2);
    border-bottom: 1px solid var(--stb-gold-dim);
    font-size: 0.85rem;
  }

  .stb-update__text {
    color: var(--stb-text);
  }

  /* Optik + Trefferfläche aus `.stb-btn[data-variant='secondary']` (design-system.css).
     Der `stb-`-Präfix ließ diese Klasse wie eine geteilte aussehen — sie war es nie;
     sie trug sogar einen eigenen `border-radius: 6px` statt des Tokens. */
  .stb-update__action {
    font: inherit;
  }

  .stb-update__action:hover,
  .stb-update__action:focus-visible {
    background: var(--stb-gold-dim);
    color: var(--stb-bg);
  }
</style>
