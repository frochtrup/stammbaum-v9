<script lang="ts">
  // ui/views/tools/RelationshipTool.svelte — Beziehungsrechner (BL-134, Spec 20 §1.12).
  // On-Demand-Werkzeug (kein Dauer-Element, INV-UI-11): Overlay im Personen-Segment, genau
  // wie PersonDedupView (INV-UI-4). Zwei Personen wählen → gemeinsamer Vorfahre + Grad-
  // Benennung (reine Logik `findRelationshipPath`, kein DOM-Rechnen). „Verwandtschafts-
  // nachweis drucken" erzeugt Report #9 (BL-175) — die EINE Stelle mit beiden Personen zur
  // Hand (INV-UI-2), deshalb hier statt im Ein-Personen-Ausgaben-Hub.
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import type { PersonId } from '../../../core/model/types';
  import { findRelationshipPath } from './relationship';
  import { buildRelationshipProof } from '../reports';
  import { openReportInNewTab } from '../reports/open-report';
  import { displayName } from '../../shell/person-display';
  import { resolveProband } from '../../shell/proband';
  import PersonPicker from '../../shell/PersonPicker.svelte';

  interface Props {
    appState: AppState;
    /** Für die Proband-Vorbelegung von Person A (lensFocus, sonst kleinste ID — der
     *  app-weite Proband-Begriff, ADR-v9-135). Optional, damit Tests ohne ViewState laufen. */
    viewState?: ViewState;
    onClose?: () => void;
  }
  const { appState, viewState, onClose }: Props = $props();

  let idA = $state<PersonId | null>(null);
  let idB = $state<PersonId | null>(null);

  // Person A startet auf dem Probanden (BL-120): die effektive Referenzperson der Sitzung
  // (`resolveProband` — gesetzter Proband, sonst kleinste ID, ADR-v9-135/139). Nur einmal,
  // solange A noch leer ist — eine spätere Nutzer-Wahl bleibt unangetastet.
  $effect(() => {
    if (idA || !viewState) return;
    idA = resolveProband(appState.db, viewState);
  });

  const rel = $derived(idA && idB ? findRelationshipPath(appState.db, idA, idB) : null);
  const nameOf = (id: PersonId | null): string => {
    if (!id) return '';
    const p = appState.db.individuals.get(id);
    return p ? displayName(p) : id;
  };

  // Etikett ist A-bezogen („A ist <Vater> von B"); für symmetrische/negative Fälle als
  // Aussage über beide formuliert.
  const verdictSentence = $derived.by(() => {
    if (!rel) return '';
    if (!rel.related) return `${nameOf(idA)} und ${nameOf(idB)} sind nicht (in Reichweite) verwandt.`;
    if (rel.label === 'Geschwister') return `${nameOf(idA)} und ${nameOf(idB)} sind Geschwister.`;
    return `${nameOf(idA)} ist ${rel.label} von ${nameOf(idB)}.`;
  });

  function printProof() {
    if (!idA || !idB) return;
    const on = new Date().toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' });
    openReportInNewTab(buildRelationshipProof(appState.db, idA, idB, on), 'Verwandtschaftsnachweis.html');
  }
</script>

<div class="rel-tool">
  <div class="rel-tool__head">
    <h2>Beziehungsrechner</h2>
    {#if onClose}
      <button type="button" class="rel-tool__close-btn" onclick={onClose}>✕ Schließen</button>
    {/if}
  </div>

  <p class="rel-tool__hint">Zwei Personen wählen — der kürzeste Verwandtschaftspfad über den gemeinsamen Vorfahren wird berechnet.</p>

  <div class="rel-tool__pickers">
    <div class="rel-tool__field" role="group" aria-labelledby="rel-a-label">
      <span id="rel-a-label" class="stb-role-label">Person A</span>
      <PersonPicker {appState} value={idA} onChange={(id) => (idA = id)} allowCreate={false} label="Person A" placeholder="Person A wählen…" />
    </div>
    <div class="rel-tool__field" role="group" aria-labelledby="rel-b-label">
      <span id="rel-b-label" class="stb-role-label">Person B</span>
      <PersonPicker {appState} value={idB} onChange={(id) => (idB = id)} allowCreate={false} label="Person B" placeholder="Person B wählen…" />
    </div>
  </div>

  {#if idA && idB && idA === idB}
    <p class="rel-tool__note">Bitte zwei verschiedene Personen wählen.</p>
  {:else if rel}
    <div class="rel-tool__result">
      <p class="rel-tool__verdict">{verdictSentence}</p>
      {#if rel.related}
        {#if rel.commonId}
          <p class="rel-tool__common">Gemeinsamer Vorfahre: <strong>{nameOf(rel.commonId)}</strong></p>
        {/if}
        {#if rel.multiPath}
          <p class="rel-tool__note">Mehrere gleich kurze Pfade — der kürzeste ist dargestellt.</p>
        {/if}
        <ol class="rel-tool__path">
          {#each rel.path as pid (pid)}
            <li class:rel-tool__common-node={pid === rel.commonId}>
              {pid === rel.commonId ? '⬡ ' : ''}{nameOf(pid)}
            </li>
          {/each}
        </ol>
        <button type="button" class="rel-tool__print" onclick={printProof}>🖨 Verwandtschaftsnachweis drucken</button>
      {/if}
    </div>
  {:else}
    <p class="rel-tool__note">Noch keine zwei Personen gewählt.</p>
  {/if}
</div>

<style>
  .rel-tool {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0.75rem;
    width: 100%;
    max-width: 40rem;
    margin: 0 auto;
  }

  .rel-tool__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .rel-tool__head h2 {
    margin: 0;
    font-size: 1.1rem;
    color: var(--stb-gold-light);
  }

  .rel-tool__close-btn {
    background: transparent;
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    color: var(--stb-text);
    padding: 0.35rem 0.7rem;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .rel-tool__hint,
  .rel-tool__note {
    margin: 0;
    color: var(--stb-text-dim);
    font-size: 0.82rem;
  }

  .rel-tool__pickers {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .rel-tool__field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    flex: 1 1 14rem;
    min-width: 12rem;
  }

  .rel-tool__result {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    border-top: 1px solid var(--stb-surface-3);
    padding-top: 1rem;
  }

  .rel-tool__verdict {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--stb-text);
  }

  .rel-tool__common {
    margin: 0;
    color: var(--stb-text);
  }

  .rel-tool__path {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .rel-tool__path li {
    color: var(--stb-text-dim);
    font-size: 0.9rem;
  }

  .rel-tool__common-node {
    color: var(--stb-gold);
    font-weight: 600;
  }

  .rel-tool__print {
    align-self: flex-start;
    margin-top: 0.5rem;
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: 1px solid var(--stb-gold);
    border-radius: var(--stb-radius-control);
    padding: 0.5rem 0.9rem;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }
</style>
