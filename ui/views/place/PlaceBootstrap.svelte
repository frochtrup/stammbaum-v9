<script lang="ts">
  // ui/views/place/PlaceBootstrap.svelte — "Orte vorschlagen"-Sichtungsdialog (Spec 20
  // §1.7 [K] "Orte-Bootstrap-Vorschlag aus GEDCOM-PLAC-Hierarchien", ADR-v9-27). Opt-in,
  // NIEMALS automatisch: sammelt distinkte unaufgelöste PLAC-Kandidaten und lässt den
  // Nutzer auswählen, bevor irgendetwas angelegt wird. Struktur-Vorbild HofReview.svelte
  // (Sichtungs-/Bestätigungs-Panel als Toggle innerhalb des Tabs, kein neuer Dialog-Stil,
  // INV-UI-4).
  import type { AppState } from '../../shell/app-state.svelte';
  import { buildPlaceCandidates, draftPlaceObject } from './place-bootstrap-model';

  interface Props {
    appState: AppState;
    onClose?: () => void;
  }
  const { appState, onClose }: Props = $props();

  const candidates = $derived(buildPlaceCandidates(appState.db, appState.placeContext));

  // Alle Kandidaten sind standardmäßig ausgewählt (Auftrags-Vorgabe) — Auswahl je Titel
  // (Kandidaten sind bereits über normPlaceName dedupliziert, der Titel ist als Schlüssel
  // innerhalb dieser Liste eindeutig genug für die Checkbox-Zuordnung).
  let selected = $state<Record<string, boolean>>({});
  let createdCount = $state<number | null>(null);

  function isSelected(title: string): boolean {
    return selected[title] ?? true;
  }

  function toggle(title: string) {
    selected = { ...selected, [title]: !isSelected(title) };
  }

  function selectAll() {
    selected = Object.fromEntries(candidates.map((c) => [c.title, true]));
  }

  function selectNone() {
    selected = Object.fromEntries(candidates.map((c) => [c.title, false]));
  }

  function confirmSelected() {
    const chosen = candidates.filter((c) => isSelected(c.title));
    for (const candidate of chosen) {
      const draft = draftPlaceObject(candidate, appState.db.placeObjects);
      appState.savePlace(draft);
    }
    createdCount = chosen.length;
  }
</script>

<div class="place-bootstrap">
  <div class="place-bootstrap__head">
    <h2>Orte vorschlagen</h2>
    {#if onClose}
      <button type="button" class="place-bootstrap__close-btn" onclick={onClose}>✕ Schließen</button>
    {/if}
  </div>

  {#if createdCount !== null}
    <p class="place-bootstrap__result">
      {createdCount === 0
        ? 'Keine Orte ausgewählt — es wurde nichts angelegt.'
        : `${createdCount} ${createdCount === 1 ? 'Ort wurde' : 'Orte wurden'} angelegt.`}
      {#if createdCount > 0}
        Nach dem erneuten Laden der Datei werden passende Ereignisse automatisch verknüpft.
      {/if}
    </p>
  {/if}

  {#if candidates.length === 0}
    <p class="place-bootstrap__empty">
      Keine unaufgelösten Orte gefunden — alle Ereignisse sind bereits mit einem Ort verknüpft.
    </p>
  {:else}
    <p class="place-bootstrap__hint">
      Diese Orte kommen aus den geladenen Ereignissen, sind aber noch keinem erfassten Ort
      zugeordnet. Wähle aus, was übernommen werden soll — danach kannst du Typ, Koordinaten
      und Varianten wie bei jedem anderen Ort ergänzen.
    </p>

    <div class="place-bootstrap__bulk">
      <button type="button" onclick={selectAll}>Alle auswählen</button>
      <button type="button" onclick={selectNone}>Keine auswählen</button>
    </div>

    <ul class="place-bootstrap__rows">
      {#each candidates as candidate (candidate.title)}
        <li class="place-bootstrap__row">
          <label class="place-bootstrap__row-label">
            <input
              type="checkbox"
              checked={isSelected(candidate.title)}
              onchange={() => toggle(candidate.title)}
            />
            <span class="place-bootstrap__title">{candidate.title}</span>
            <span class="place-bootstrap__meta">
              {candidate.sourceEventCount}
              {candidate.sourceEventCount === 1 ? 'Ereignis' : 'Ereignisse'} · z. B. {candidate.sampleEventType}
            </span>
          </label>
        </li>
      {/each}
    </ul>

    <div class="place-bootstrap__actions">
      <button type="button" class="place-bootstrap__confirm-btn" onclick={confirmSelected}>
        Ausgewählte anlegen
      </button>
    </div>
  {/if}
</div>

<style>
  .place-bootstrap {
    padding: 1rem;
    overflow-y: auto;
  }

  .place-bootstrap__head {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .place-bootstrap__head h2 {
    margin: 0;
  }

  .place-bootstrap__close-btn {
    margin-left: auto;
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
  }

  .place-bootstrap__hint,
  .place-bootstrap__result {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
    margin: 0.75rem 0;
  }

  .place-bootstrap__result {
    color: var(--stb-quay-3);
  }

  .place-bootstrap__empty {
    color: var(--stb-text-dim);
    margin-top: 1rem;
  }

  .place-bootstrap__bulk {
    display: flex;
    gap: 0.4rem;
    margin-bottom: 0.6rem;
  }

  .place-bootstrap__bulk button {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.6rem;
    cursor: pointer;
    font-size: 0.78rem;
  }

  .place-bootstrap__rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .place-bootstrap__row {
    background: var(--stb-surface-1);
    border-radius: var(--stb-radius-card);
    padding: 0.6rem 0.9rem;
    margin-bottom: 0.5rem;
  }

  .place-bootstrap__row-label {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    cursor: pointer;
  }

  .place-bootstrap__title {
    font-weight: 600;
  }

  .place-bootstrap__meta {
    margin-left: auto;
    color: var(--stb-text-dim);
    font-size: 0.78rem;
    white-space: nowrap;
  }

  .place-bootstrap__actions {
    margin-top: 0.75rem;
  }

  .place-bootstrap__confirm-btn {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: 1px solid var(--stb-gold);
    border-radius: var(--stb-radius-control);
    padding: 0.45rem 0.9rem;
    font-weight: 700;
    cursor: pointer;
  }
</style>
