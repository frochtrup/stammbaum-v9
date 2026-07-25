<script lang="ts">
  // ui/views/tree/TreeView.svelte — dünner Svelte-Wrapper um die imperativen Baum-Inseln
  // (Spec 02 §5). Kein Layout/SVG-Code hier — das lebt in ui/islands/tree/ (framework-frei).
  //
  // Seit BL-122 hostet die Baum-Lens DREI Modi (Sanduhr · Nachkommen · Fächer[folgt]) über
  // EINEN geteilten Viewport (ADR-v9-123). Der Modus lebt in route.treeMode (analog mapMode,
  // übersteht das Verlassen der Lens) und wird über den geteilten ViewModeToggle gewählt —
  // ein View-internes Konzept, deshalb UNTER der Lens-Kopfzeile (wie der Karten-Modusrow),
  // nicht im Lens-Umschalter selbst (INV-UI-3/§4). Wechselt der Modus, wird die alte Insel
  // zerstört und die neue in denselben Container gemountet (kein Fein-Diffing, Spec 02 §5).
  import { onDestroy } from 'svelte';
  import '../../islands/tree/hourglass-tree.css';
  import { mountHourglassTree, type TreeIslandHandle } from '../../islands/tree/hourglass-tree';
  import { mountDescendantTree } from '../../islands/tree/descendant-tree';
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import type { Route } from '../../shell/route.svelte';
  import type { Database } from '../../../core/model/types';
  import type { TreeModeId } from '../../shell/nav-model';
  import LensViewHeader from '../../shell/LensViewHeader.svelte';
  import ViewModeToggle from '../../shell/ViewModeToggle.svelte';
  import type { LensId } from '../../shell/lens-model';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    /** Routen-Quelle für den Baum-Modus (Sanduhr/Nachkommen). Optional: Tests, die den
     *  Modus nicht prüfen, mounten ohne — dann bleibt es bei der Sanduhr. */
    route?: Route;
    /** Cross-Tab-Navigation zur Familien-Detailseite (⚭-Badge zwischen Proband/Ehepartner). */
    onNavigateToFamily?: (familyId: string) => void;
    /** Cross-Tab-Navigation: Klick auf die Zentrum-Karte öffnet die Personen-Detailseite. */
    onOpenPersonDetail?: (personId: string) => void;
    /** Lens-Umschalter (Spec 21 §4, INV-UI-3) — Klick auf eine ANDERE Lens. Der Fokus lebt
     *  im geteilten ViewState-Slot `lensFocus` und bleibt beim Wechsel erhalten. */
    onNavigateLens?: (lens: LensId) => void;
  }
  const { appState, viewState, route, onNavigateToFamily, onOpenPersonDetail, onNavigateLens }: Props = $props();

  let containerEl: HTMLDivElement | undefined = $state();
  let handle: TreeIslandHandle | null = null;
  let mounted: { mode: TreeModeId; db: Database } | null = null;

  const treeMode = $derived<TreeModeId>(route?.treeMode ?? 'hourglass');
  const focusId = $derived(viewState.getCurrent('lensFocus') ?? firstAvailablePersonId());

  const TREE_MODES = [
    { id: 'hourglass', label: 'Sanduhr' },
    { id: 'descendant', label: 'Nachkommen' },
  ];

  function firstAvailablePersonId(): string | null {
    const first = appState.db.individuals.keys().next();
    return first.done ? null : first.value;
  }

  function recenter(id: string): void {
    viewState.setCurrent('lensFocus', id);
  }

  function mountFor(mode: TreeModeId, container: HTMLDivElement, db: Database, id: string): TreeIslandHandle {
    const callbacks = {
      onSelect: recenter,
      onSelectCenter: (pid: string) => onOpenPersonDetail?.(pid),
      onSelectFamily: (fid: string) => onNavigateToFamily?.(fid),
    };
    return mode === 'descendant'
      ? mountDescendantTree(container, db, id, callbacks)
      : mountHourglassTree(container, db, id, callbacks);
  }

  $effect(() => {
    const id = focusId;
    const db = appState.db;
    const mode = treeMode;
    if (!containerEl || !id) return;
    // Modus- oder Datensatz-Wechsel: alte Insel abbauen und neu mounten (Spec 02 §5).
    if (handle && (mounted?.mode !== mode || mounted?.db !== db)) {
      handle.destroy();
      handle = null;
    }
    if (!handle) {
      handle = mountFor(mode, containerEl, db, id);
      mounted = { mode, db };
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
  <!-- Kein `actions`-Snippet: der Vollbild-Schalter sitzt in der Insel selbst (BL-95). -->
  <LensViewHeader active="tree" onNavigate={(lens) => onNavigateLens?.(lens)} />
  <!-- Modus-Umschalter: View-internes Konzept, deshalb AUSSERHALB der Lens-Kopfzeile
       (wie der Karten-Modusrow, INV-UI-11 „Alternativansicht-Umschalter" = EIN Slot). -->
  <div class="tree-view__mode-row">
    <ViewModeToggle
      modes={TREE_MODES}
      value={treeMode}
      onChange={(id) => route?.setTreeMode(id as TreeModeId)}
      ariaLabel="Baum-Ansicht wählen"
    />
  </div>
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

  .tree-view__mode-row {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--stb-surface-3);
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
