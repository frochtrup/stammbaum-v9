<script lang="ts">
  // ui/views/tree/TreeView.svelte — dünner Svelte-Wrapper um die imperative
  // Sanduhr-Insel (Spec 02 §5: "die reaktive Schale rendert nur einen leeren
  // Container und übergibt Kern-Daten + Callbacks"). Kein Layout/SVG-Code hier —
  // das lebt komplett in ui/islands/tree/hourglass-tree.ts (framework-frei).
  //
  // Mount/Unmount-Muster: `bind:this` + `$effect` (erster Präzedenzfall in dieser
  // Scheibe für eine imperative Insel — bisherige Views sind rein reaktiv/Svelte-
  // deklarativ). Bei jeder Änderung von personId/appState.db: kompletter Neu-Aufbau
  // über `handle.update(...)`, kein Fein-Diffing (Spec 02 §5).
  import { onDestroy } from 'svelte';
  import '../../islands/tree/hourglass-tree.css';
  import { mountHourglassTree, type TreeIslandHandle } from '../../islands/tree/hourglass-tree';
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import LensViewHeader from '../../shell/LensViewHeader.svelte';
  import type { LensId } from '../../shell/lens-model';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    /** Cross-Tab-Navigation zur Familien-Detailseite (⚭-Badge zwischen Proband/Ehepartner). */
    onNavigateToFamily?: (familyId: string) => void;
    /** Cross-Tab-Navigation: Klick auf die Zentrum-Karte öffnet die Personen-Detailseite. */
    onOpenPersonDetail?: (personId: string) => void;
    /**
     * Lens-Umschalter (Spec 21 §4, INV-UI-3) — Klick auf eine ANDERE implementierte
     * Lens (aktuell nur "Baum" selbst ist implementiert, aber der Slot ruft trotzdem
     * durch, damit der nächste Bauabschnitt (Karte) nur noch hier andocken muss).
     * Der Fokus selbst wandert NICHT über diesen Callback — er lebt bereits im
     * geteilten ViewState-Slot `lensFocus` und bleibt beim Wechsel automatisch erhalten.
     */
    onNavigateLens?: (lens: LensId) => void;
  }
  const { appState, viewState, onNavigateToFamily, onOpenPersonDetail, onNavigateLens }: Props = $props();

  let containerEl: HTMLDivElement | undefined = $state();
  let handle: TreeIslandHandle | null = null;

  const focusId = $derived(viewState.getCurrent('lensFocus') ?? firstAvailablePersonId());

  function firstAvailablePersonId(): string | null {
    const first = appState.db.individuals.keys().next();
    return first.done ? null : first.value;
  }

  function recenter(id: string): void {
    viewState.setCurrent('lensFocus', id);
  }

  $effect(() => {
    const id = focusId;
    const db = appState.db;
    if (!containerEl || !id) return;
    if (!handle) {
      handle = mountHourglassTree(
        containerEl,
        db,
        id,
        {
          onSelect: recenter,
          onSelectCenter: (pid) => onOpenPersonDetail?.(pid),
          onSelectFamily: (fid) => onNavigateToFamily?.(fid),
        },
      );
    } else {
      handle.update(id);
    }
  });

  onDestroy(() => {
    handle?.destroy();
    handle = null;
  });
</script>

<div class="tree-view">
  <!-- Kein `actions`-Snippet mehr: der Vollbild-Schalter sitzt in der Insel selbst
       (BL-95). Er war hier oben im Vollbild unerreichbar (die Insel legt sich als
       `position: fixed` darüber) UND nahm dem Lens-Umschalter 79 px, wodurch „Story"
       aus dem Bild rutschte. -->
  <LensViewHeader active="tree" onNavigate={(lens) => onNavigateLens?.(lens)} />
  {#if !focusId}
    <p class="tree-view__empty">Keine Person geladen.</p>
  {/if}
  <div class="tree-view__host" bind:this={containerEl}></div>
</div>

<style>
  .tree-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .tree-view__empty {
    padding: 1rem;
    color: var(--stb-text-dim);
  }

  .tree-view__host {
    flex: 1;
    min-height: 0;
  }
</style>
