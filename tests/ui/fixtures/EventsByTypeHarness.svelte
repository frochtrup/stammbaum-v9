<script lang="ts">
  // tests/ui/fixtures/EventsByTypeHarness.svelte — Test-Harness, die den `row`-Snippet
  // an EventsByType.svelte übergibt (Svelte-5-Snippets lassen sich aus einer reinen
  // .test.ts-Datei nicht als Prop konstruieren, daher dieser dünne Wrapper — analog
  // DetailHeaderActionsHarness.svelte).
  import EventsByType from '../../../ui/shell/EventsByType.svelte';
  import type { EventGroup } from '../../../ui/shell/event-grouping';
  import type { HarnessRow } from './events-by-type-harness-types';

  interface Props {
    groups: EventGroup<HarnessRow>[];
    resetKey?: string | null;
    onRowClick?: (key: string) => void;
  }
  const { groups, resetKey, onRowClick }: Props = $props();
</script>

<EventsByType {groups} {resetKey}>
  {#snippet row(item: HarnessRow)}
    <button type="button" onclick={() => onRowClick?.(item.key)}>{item.label}</button>
  {/snippet}
</EventsByType>
