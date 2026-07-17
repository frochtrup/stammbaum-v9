<script lang="ts">
  // ui/views/hof/HofDedupView.svelte — Massen-Dedup-Ansicht für Höfe (Spec 20 §1.8 [K]
  // "Massen-Dedup", Spec 11 §9.2, ADR-v9-45). Analog PlaceDedupView.svelte. Merge läuft
  // NUR über appState.mergeHof(survivorId, mergedIds) — keine Merge-Logik hier.
  import type { AppState } from '../../shell/app-state.svelte';
  import { collectAllEvents } from '../../shell/all-events';
  import { tooltip } from '../../shell/tooltip';
  import { buildHofDedupGroups } from './hof-dedup-model';

  interface Props {
    appState: AppState;
    onClose?: () => void;
  }
  const { appState, onClose }: Props = $props();

  const events = $derived(collectAllEvents(appState.db));
  const groups = $derived(buildHofDedupGroups(appState.db, appState.placeContext, events));

  let chosenWinner = $state<Record<string, string>>({});
  // A3: pro Gruppe die ABGEWÄHLTEN Mitglieder (Standard: leer = alle ausgewählt), analog
  // PlaceDedupView (geteiltes Muster für den bewusst symmetrischen Orte-/Höfe-Mechanismus).
  let deselected = $state<Record<string, string[]>>({});
  let statusMessage = $state('');

  function winnerFor(groupKey: string, suggested: string): string {
    return chosenWinner[groupKey] ?? suggested;
  }

  function chooseWinner(groupKey: string, id: string) {
    chosenWinner = { ...chosenWinner, [groupKey]: id };
  }

  /** Ist ein Mitglied im Merge enthalten? Der Gewinner ist immer enthalten (Ziel, nicht abwählbar). */
  function isSelected(groupKey: string, id: string, winnerId: string): boolean {
    if (id === winnerId) return true;
    return !(deselected[groupKey] ?? []).includes(id);
  }

  function toggleMember(groupKey: string, id: string) {
    const cur = deselected[groupKey] ?? [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    deselected = { ...deselected, [groupKey]: next };
  }

  function merge(groupKey: string, memberIds: string[], suggested: string) {
    const winnerId = winnerFor(groupKey, suggested);
    const loserIds = memberIds.filter((id) => id !== winnerId && isSelected(groupKey, id, winnerId));
    if (loserIds.length === 0) return;
    const winnerAddr = appState.db.hofObjects.get(winnerId)?.addrs[0]?.value || winnerId;
    appState.mergeHof(winnerId, loserIds);
    statusMessage = `${loserIds.length + 1} Höfe zu „${winnerAddr}" zusammengeführt.`;
    const nextWinner = { ...chosenWinner };
    delete nextWinner[groupKey];
    chosenWinner = nextWinner;
    const nextDesel = { ...deselected };
    delete nextDesel[groupKey];
    deselected = nextDesel;
  }
</script>

<div class="hof-dedup">
  <div class="hof-dedup__head">
    <h2>Höfe — Massen-Dedup</h2>
    {#if onClose}
      <button type="button" class="hof-dedup__close-btn" onclick={onClose}>✕ Schließen</button>
    {/if}
  </div>

  {#if statusMessage}
    <p class="hof-dedup__status">{statusMessage}</p>
  {/if}

  {#if groups.length === 0}
    <p class="hof-dedup__empty">Keine Dubletten-Kandidaten gefunden.</p>
  {:else}
    <ul class="hof-dedup__groups">
      {#each groups as group (group.key)}
        <li class="hof-dedup__group">
          <h3>{group.members.length} mutmaßliche Dubletten <span class="hof-dedup__village">— {group.villageTitle}</span></h3>
          <ul class="hof-dedup__members">
            {#each group.members as m (m.id)}
              {@const winnerId = winnerFor(group.key, group.suggestedWinnerId)}
              {@const isWinner = m.id === winnerId}
              <li class="hof-dedup__member-row">
                <label class="hof-dedup__member">
                  <input
                    type="radio"
                    name={`hof-dedup-winner-${group.key}`}
                    value={m.id}
                    checked={isWinner}
                    onchange={() => chooseWinner(group.key, m.id)}
                  />
                  {m.addr}
                  {#if m.id === group.suggestedWinnerId}
                    <span class="hof-dedup__suggested">(Vorschlag)</span>
                  {/if}
                  {#if !m.enriched}
                    <span class="stb-pill" use:tooltip={'Noch keine weiteren Angaben (Adress-Historie/Koordinaten/Notiz) erfasst.'}>ohne Zusatzangaben</span>
                  {/if}
                </label>
                <label class="hof-dedup__include" use:tooltip={isWinner ? 'Der Gewinner ist immer Ziel des Merges.' : 'In diese Zusammenführung einbeziehen.'}>
                  <input
                    type="checkbox"
                    checked={isSelected(group.key, m.id, winnerId)}
                    disabled={isWinner}
                    onchange={() => toggleMember(group.key, m.id)}
                  />
                  <span>einbeziehen</span>
                </label>
              </li>
            {/each}
          </ul>
          <button
            type="button"
            class="hof-dedup__merge-btn"
            onclick={() => merge(group.key, group.members.map((m) => m.id), group.suggestedWinnerId)}
          >
            Zusammenführen
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .hof-dedup {
    padding: 1rem;
    overflow-y: auto;
  }

  .hof-dedup__head {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .hof-dedup__head h2 {
    margin: 0;
  }

  .hof-dedup__close-btn {
    margin-left: auto;
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
  }

  .hof-dedup__status {
    margin-top: 0.7rem;
    padding: 0.5rem 0.7rem;
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    font-size: 0.85rem;
  }

  .hof-dedup__empty {
    color: var(--stb-text-dim);
    margin-top: 1rem;
  }

  .hof-dedup__groups {
    list-style: none;
    margin: 1rem 0 0;
    padding: 0;
  }

  .hof-dedup__group {
    background: var(--stb-surface-1);
    border-radius: var(--stb-radius-card);
    padding: 0.75rem 0.9rem;
    margin-bottom: 0.7rem;
  }

  .hof-dedup__group h3 {
    font-size: 0.9rem;
    color: var(--stb-gold-light);
    margin: 0 0 0.4rem;
  }

  .hof-dedup__village {
    color: var(--stb-text-dim);
    font-weight: 400;
  }

  .hof-dedup__members {
    list-style: none;
    margin: 0 0 0.6rem;
    padding: 0;
  }

  .hof-dedup__member-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .hof-dedup__member {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.2rem 0;
    font-size: 0.88rem;
    flex: 1;
  }

  .hof-dedup__include {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.78rem;
    color: var(--stb-text-dim);
    white-space: nowrap;
    cursor: pointer;
  }

  .hof-dedup__suggested {
    color: var(--stb-text-dim);
    font-size: 0.78rem;
  }

  .hof-dedup__merge-btn {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.8rem;
    cursor: pointer;
    font-weight: 600;
  }
</style>
