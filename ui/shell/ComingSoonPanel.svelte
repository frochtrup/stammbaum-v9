<script lang="ts">
  // ui/shell/ComingSoonPanel.svelte — sichtbarer, klickbarer Platzhalter für die vier
  // noch nicht gebauten Bottom-Nav-Ziele (Spec-Auftrag: "kein Absturz beim Klick").
  interface Props {
    label: string;
  }
  const { label }: Props = $props();
</script>

<div class="coming-soon">
  <p class="coming-soon__title">{label}</p>
  <p class="coming-soon__hint">Dieser Bereich folgt in einem späteren Bau-Durchgang.</p>
</div>

<style>
  .coming-soon {
    padding: 2.5rem 1.5rem;
    text-align: center;
    color: var(--stb-text-dim);
  }

  .coming-soon__title {
    font-family: var(--stb-font-title);
    font-size: 1.3rem;
    color: var(--stb-gold-light);
    margin-bottom: 0.4rem;
  }

  .coming-soon__hint {
    font-size: 0.85rem;
  }
</style>
