<script lang="ts">
  // tests/ui/fixtures/FilterBarHarness.svelte — Test-Harness, die einen children-
  // Snippet an FilterBar übergibt (Svelte-5-Snippets lassen sich aus einer reinen
  // .test.ts-Datei nicht als Prop konstruieren, analog DetailHeaderActionsHarness.svelte).
  import FilterBar from '../../../ui/shell/FilterBar.svelte';

  interface Props {
    activeCount?: number;
  }
  const { activeCount = 0 }: Props = $props();
</script>

<FilterBar {activeCount}>
  <label>
    Geburtsjahr von
    <input type="number" aria-label="Geburtsjahr von" />
  </label>
  <button type="button">Filter zurücksetzen</button>
</FilterBar>
