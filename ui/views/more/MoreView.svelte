<script lang="ts">
  // ui/views/more/MoreView.svelte — "Mehr"-Hub (Spec 21 §2 Mobile-Modell: "Mehr = Hub
  // für die Lenses (Karte / Zeitleiste / Statistik / Story) + Ausgaben + Einstellungen").
  //
  // Diese Scheibe liefert das Navigations-Gerüst: ein Menü mit sechs Einträgen. Fünf davon
  // zeigen weiterhin den ComingSoonPanel-Platzhalter (ein `implemented`-Flag pro Eintrag,
  // "(folgt)"-Label-Suffix — analog dem Muster, das BottomNav/App.svelte für die anfangs
  // unimplementierten Bottom-Nav-Ziele nutzen). "Statistik" ist jetzt echt (Spec 20 §4
  // "Statistik-Report") — Nutzer-Entscheidung: Statistik ist bewusst KEINE Diagramm-/
  // imperative-Insel-Lens (anders als Baum/Karte/Zeitleiste), bekommt noch KEINEN
  // gemeinsamen Lens-Umschalter und ist für diese Slice ausschließlich über diesen Hub-
  // Eintrag erreichbar. Karte/Zeitleiste/Story/Ausgaben/Einstellungen bleiben Platzhalter —
  // eigene, spätere Bauabschnitte (Karte/Zeitleiste sind laut Spec 02 §5 sogar imperative
  // SVG-Inseln, eigener Agenten-Zuständigkeitsbereich, islands-builder).
  import type { AppState } from '../../shell/app-state.svelte';
  import ComingSoonPanel from '../../shell/ComingSoonPanel.svelte';
  import StatisticsView from '../stats/StatisticsView.svelte';

  interface Props {
    appState: AppState;
  }
  const { appState }: Props = $props();

  type MoreEntry = 'map' | 'timeline' | 'stats' | 'story' | 'reports' | 'settings';

  interface MenuItem {
    id: MoreEntry;
    icon: string;
    label: string;
    implemented: boolean;
  }

  // Reihenfolge folgt Spec 21 §1/§3: erst die vier Lenses (Ansichten), dann die zwei
  // Arbeitsflächen-Einträge, die laut §2 in den "Mehr"-Hub gehören.
  const items: MenuItem[] = [
    { id: 'map', icon: '🗺', label: 'Karte', implemented: false },
    { id: 'timeline', icon: '⏱', label: 'Zeitleiste', implemented: false },
    { id: 'stats', icon: '📊', label: 'Statistik', implemented: true },
    { id: 'story', icon: '📖', label: 'Story', implemented: false },
    { id: 'reports', icon: '🖨', label: 'Ausgaben', implemented: false },
    { id: 'settings', icon: '⚙', label: 'Einstellungen', implemented: false },
  ];

  // Ein Menü mit einer Sub-Ansicht reicht (Auftrag: "halte das einfach, kein komplexer
  // History-Stack nötig") — kein eigener Eintrag in der zentralen ViewState-Instanz,
  // weil dieser Hub rein lokale Menü-Navigation ist (INV-VS bleibt unberührt: die
  // "echte" Auswahl je Ziel bleibt weiterhin exklusiv bei ViewState, sobald die
  // einzelnen Lenses/Ausgaben/Einstellungen gebaut werden).
  let openEntry = $state<MenuItem | null>(null);

  function open(item: MenuItem) {
    openEntry = item;
  }

  function backToMenu() {
    openEntry = null;
  }
</script>

<div class="more-view">
  {#if openEntry}
    <div class="more-view__sub-header">
      <button type="button" class="more-view__back" onclick={backToMenu}>← Zurück zum Menü</button>
    </div>
    {#if openEntry.id === 'stats'}
      <StatisticsView {appState} />
    {:else}
      <ComingSoonPanel label="{openEntry.icon} {openEntry.label}" />
    {/if}
  {:else}
    <ul class="more-view__list">
      {#each items as item (item.id)}
        <li>
          <button type="button" class="more-view__item" onclick={() => open(item)}>
            <span class="more-view__icon" aria-hidden="true">{item.icon}</span>
            <span class="more-view__label">{item.label}{item.implemented ? '' : ' (folgt)'}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .more-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow-y: auto;
  }

  .more-view__list {
    list-style: none;
    margin: 0;
    padding: 0.5rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .more-view__item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-card);
    color: var(--stb-text);
    padding: 0.75rem 1rem;
    font-size: 0.95rem;
    text-align: left;
    cursor: pointer;
  }

  .more-view__icon {
    font-size: 1.25rem;
    line-height: 1;
  }

  .more-view__label {
    color: var(--stb-text);
  }

  .more-view__sub-header {
    padding: 0.5rem 0.75rem 0;
  }

  .more-view__back {
    background: transparent;
    border: none;
    color: var(--stb-gold-light);
    cursor: pointer;
    font: inherit;
    padding: 0;
  }
</style>
