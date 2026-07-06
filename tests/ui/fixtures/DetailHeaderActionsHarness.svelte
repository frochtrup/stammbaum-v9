<script lang="ts">
  // tests/ui/fixtures/DetailHeaderActionsHarness.svelte — Test-Harness, die einen
  // `actions`-Snippet an DetailHeader übergibt (Svelte-5-Snippets lassen sich aus einer
  // reinen .test.ts-Datei nicht als Prop konstruieren, daher dieser dünne Wrapper —
  // analog LensViewHeaderActionsHarness.svelte).
  import DetailHeader from '../../../ui/shell/DetailHeader.svelte';

  interface Props {
    title: string;
    onBack: () => void;
  }
  const { title, onBack }: Props = $props();
</script>

<DetailHeader {title} {onBack}>
  {#snippet actions()}
    <button type="button">✎ Bearbeiten</button>
    <button type="button">⧖ Im Baum anzeigen</button>
  {/snippet}
</DetailHeader>
