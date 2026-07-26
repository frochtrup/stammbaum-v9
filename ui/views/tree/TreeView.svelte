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
  import { mountFanChart } from '../../islands/tree/fan-chart';
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import type { Route } from '../../shell/route.svelte';
  import type { Database, PersonId } from '../../../core/model/types';
  import type { TreeModeId } from '../../shell/nav-model';
  import LensViewHeader from '../../shell/LensViewHeader.svelte';
  import ViewModeToggle from '../../shell/ViewModeToggle.svelte';
  import type { LensId } from '../../shell/lens-model';
  import type { CardRing } from '../../islands/tree/tree-cards';
  // Vollständigkeits-Ring (BL-121): dieselbe Befundschwere wie das Qualitäts-Dashboard
  // (computePersonSeverity, INV-UI-4) — die Insel bekommt sie vorberechnet, wertet nichts aus.
  import { configFromStored, defaultConfig, type ValidationConfig } from '../../../core/validate/index';
  import { IdbValConfigStore, loadValConfig } from '../../../services/validate/index';
  import { buildTreeRings } from './tree-ring-model';
  // Diagramm-Export (BL-124): reiner Renderer + Sink über das vorhandene Export-Rohr.
  import { finalizeSvg, svgToPngBlob } from '../../islands/tree/diagram-export';
  import type { FileService } from '../../../services/file';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    /** Routen-Quelle für den Baum-Modus (Sanduhr/Nachkommen). Optional: Tests, die den
     *  Modus nicht prüfen, mounten ohne — dann bleibt es bei der Sanduhr. */
    route?: Route;
    /** Export-Rohr (BL-124) — dieselbe Instanz wie SaveButton/ExportView. Optional für Tests. */
    fileService?: FileService;
    /** Cross-Tab-Navigation zur Familien-Detailseite (⚭-Badge zwischen Proband/Ehepartner). */
    onNavigateToFamily?: (familyId: string) => void;
    /** Cross-Tab-Navigation: Klick auf die Zentrum-Karte öffnet die Personen-Detailseite. */
    onOpenPersonDetail?: (personId: string) => void;
    /** Lens-Umschalter (Spec 21 §4, INV-UI-3) — Klick auf eine ANDERE Lens. Der Fokus lebt
     *  im geteilten ViewState-Slot `lensFocus` und bleibt beim Wechsel erhalten. */
    onNavigateLens?: (lens: LensId) => void;
  }
  const { appState, viewState, route, fileService, onNavigateToFamily, onOpenPersonDetail, onNavigateLens }: Props = $props();

  let containerEl: HTMLDivElement | undefined = $state();
  let handle: TreeIslandHandle | null = null;
  let mounted: { mode: TreeModeId; db: Database } | null = null;

  const treeMode = $derived<TreeModeId>(route?.treeMode ?? 'hourglass');
  const focusId = $derived(viewState.getCurrent('lensFocus') ?? firstAvailablePersonId());

  // ── Vollständigkeits-Ring (BL-121, Spec 21 §8) ──
  // Regel-Konfiguration wie im Dashboard nachladen (dieselbe Quelle → gleiche Ringe/Ampel).
  let valConfig = $state<ValidationConfig>(defaultConfig());
  const valStore = new IdbValConfigStore();
  $effect(() => {
    let cancelled = false;
    loadValConfig(valStore)
      .then((stored) => {
        if (!cancelled) valConfig = configFromStored(stored);
      })
      .catch(() => {
        /* Defaults behalten. */
      });
    return () => {
      cancelled = true;
    };
  });
  const ringByPerson = $derived(buildTreeRings(appState.db, valConfig));

  const TREE_MODES = [
    { id: 'hourglass', label: 'Sanduhr' },
    { id: 'descendant', label: 'Nachkommen' },
    { id: 'fan', label: 'Fächer' },
  ];

  function firstAvailablePersonId(): string | null {
    const first = appState.db.individuals.keys().next();
    return first.done ? null : first.value;
  }

  function recenter(id: string): void {
    viewState.setCurrent('lensFocus', id);
  }

  function mountFor(
    mode: TreeModeId,
    container: HTMLDivElement,
    db: Database,
    id: string,
    ring: ReadonlyMap<PersonId, CardRing>,
  ): TreeIslandHandle {
    const callbacks = {
      onSelect: recenter,
      onSelectCenter: (pid: string) => onOpenPersonDetail?.(pid),
      onSelectFamily: (fid: string) => onNavigateToFamily?.(fid),
    };
    // Der Ring gilt nur für die Rechteck-Karten (Sanduhr/Nachkommen), nicht den Fächer (§8).
    if (mode === 'descendant') return mountDescendantTree(container, db, id, callbacks, { ringByPerson: ring });
    if (mode === 'fan') return mountFanChart(container, db, id, callbacks);
    return mountHourglassTree(container, db, id, callbacks, { ringByPerson: ring });
  }

  $effect(() => {
    const id = focusId;
    const db = appState.db;
    const mode = treeMode;
    const ring = ringByPerson;
    if (!containerEl || !id) return;
    // Modus- oder Datensatz-Wechsel: alte Insel abbauen und neu mounten (Spec 02 §5).
    if (handle && (mounted?.mode !== mode || mounted?.db !== db)) {
      handle.destroy();
      handle = null;
    }
    if (!handle) {
      handle = mountFor(mode, containerEl, db, id, ring);
      mounted = { mode, db };
    } else {
      handle.update(id, { ringByPerson: ring });
    }
  });

  onDestroy(() => {
    handle?.destroy();
    handle = null;
  });

  // ── Diagramm-Export (BL-124, Spec 21 §6h: EIN Einstiegspunkt, Feinoptionen dahinter) ──
  let exportMenuOpen = $state(false);
  let exporting = $state(false);

  function exportFileName(ext: string): string {
    return `stammbaum-${treeMode}.${ext}`;
  }

  async function exportPng(): Promise<void> {
    const d = handle?.getExportSvg();
    if (!d || !fileService) return;
    exporting = true;
    try {
      const blob = await svgToPngBlob(finalizeSvg(d));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await fileService.exportToFile(bytes, exportFileName('png'), 'image/png', { forceDownload: true });
    } finally {
      exporting = false;
      exportMenuOpen = false;
    }
  }

  async function exportA1Svg(): Promise<void> {
    const d = handle?.getExportSvg();
    if (!d || !fileService) return;
    exporting = true;
    try {
      await fileService.exportToFile(finalizeSvg(d, { a1: true }), exportFileName('svg'), 'image/svg+xml', { forceDownload: true });
    } finally {
      exporting = false;
      exportMenuOpen = false;
    }
  }
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
    {#if fileService}
      <!-- EIN Einstiegspunkt (INV-UI-11 §6h): das Menü trägt die Feinoptionen (PNG/A1),
           kein Dauer-Icon pro Format. -->
      <div class="tree-view__export">
        <button
          type="button"
          class="tree-view__export-btn"
          aria-haspopup="menu"
          aria-expanded={exportMenuOpen}
          disabled={exporting || !focusId}
          onclick={() => (exportMenuOpen = !exportMenuOpen)}
        >
          {exporting ? '…' : '↓ Export'}
        </button>
        {#if exportMenuOpen}
          <div class="tree-view__export-menu" role="menu">
            <button type="button" role="menuitem" onclick={exportPng}>PNG-Bild</button>
            <button type="button" role="menuitem" onclick={exportA1Svg}>A1-Poster (SVG)</button>
          </div>
        {/if}
      </div>
    {/if}
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
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--stb-surface-3);
  }

  .tree-view__mode-row :global(.view-mode-toggle) {
    flex: 1;
    min-width: 0;
  }

  .tree-view__export {
    position: relative;
    flex: none;
  }

  .tree-view__export-btn {
    padding: 0.3rem 0.6rem;
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    cursor: pointer;
    white-space: nowrap;
  }
  .tree-view__export-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .tree-view__export-menu {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    z-index: 20;
    display: flex;
    flex-direction: column;
    min-width: 12rem;
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    overflow: hidden;
  }
  .tree-view__export-menu button {
    padding: 0.55rem 0.75rem;
    background: none;
    color: var(--stb-text);
    border: none;
    text-align: left;
    cursor: pointer;
  }
  .tree-view__export-menu button:hover,
  .tree-view__export-menu button:focus-visible {
    background: var(--stb-surface-3);
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
