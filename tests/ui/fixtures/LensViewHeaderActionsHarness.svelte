<script lang="ts">
  // tests/ui/fixtures/LensViewHeaderActionsHarness.svelte — Test-Harness, die einen
  // `actions`-Snippet an LensViewHeader übergibt (Svelte-5-Snippets lassen sich aus
  // einer reinen .test.ts-Datei nicht als Prop konstruieren, daher dieser dünne
  // Wrapper — analog zu anderen Fixture-Harnessen in diesem Test-Set).
  import LensViewHeader from '../../../ui/shell/LensViewHeader.svelte';
  import type { LensId } from '../../../ui/shell/lens-model';

  interface Props {
    active: LensId;
    onNavigate: (lens: LensId) => void;
  }
  const { active, onNavigate }: Props = $props();
</script>

<LensViewHeader {active} {onNavigate}>
  {#snippet actions()}
    <button type="button">⤢ Vollbild</button>
  {/snippet}
</LensViewHeader>
