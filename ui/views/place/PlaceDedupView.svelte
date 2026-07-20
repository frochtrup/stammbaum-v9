<script lang="ts">
  // ui/views/place/PlaceDedupView.svelte — Massen-Dedup-Ansicht für Orte (Spec 20 §1.7
  // [K] "Massen-Dedup", Spec 11 §9.2, ADR-v9-45). EIGENE Ansicht, NICHT identisch mit dem
  // paarweisen Dubletten-Merge in PlaceDetail.svelte (dort wählt der Nutzer bewusst EIN
  // Ziel für EINEN bereits geöffneten Ort; hier schlägt `findPlaceDuplicates` GRUPPEN
  // wahrscheinlicher Dubletten automatisch vor, ohne dass der Nutzer vorher einen
  // bestimmten Ort geöffnet haben muss). Kein automatisches Zusammenführen beim Laden —
  // nur auf expliziten "Zusammenführen"-Klick pro Gruppe (§9.2).
  //
  // Merge läuft NUR über den Kern-Chokepoint appState.mergePlace(survivorId, mergedIds)
  // (Spec 02 §3) — keine Merge-Logik hier. Meldet `hofsMerged>0` (automatischer Hof-
  // Nachlauf nach Dorf-Merge, ADR-v9-45 Nachtrag 2026-07-10) als lokale Status-Meldung
  // (Transparenz, LP-6) — kein app-weites Toast-System vorhanden, ein lokaler Hinweis an
  // der Merge-Stelle selbst reicht für diesen Zweck (Vereinfachen vor Erfinden).
  import type { AppState } from '../../shell/app-state.svelte';
  import { placeDisplayName } from '../../../core/places';
  import { collectAllEvents } from '../../shell/all-events';
  import { tooltip } from '../../shell/tooltip';
  import { buildPlaceDedupGroups } from './place-dedup-model';

  interface Props {
    appState: AppState;
    onClose?: () => void;
  }
  const { appState, onClose }: Props = $props();

  const events = $derived(collectAllEvents(appState.db));
  const groups = $derived(buildPlaceDedupGroups(appState.db, appState.placeContext, events));

  let chosenWinner = $state<Record<string, string>>({});
  // A3: pro Gruppe die ABGEWÄHLTEN Mitglieder (Standard: leer = alle ausgewählt). Der Nutzer
  // kann Mitglieder aus dem konkreten Merge herausnehmen; sie bleiben im Bestand und tauchen
  // beim nächsten Aufbau der Dedup-Liste ggf. erneut auf (reine `findPlaceDuplicates`-Neu-
  // berechnung — keine eigene Zwischenzustands-Logik).
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
    const winnerTitle = placeDisplayName(appState.db.placeObjects.get(winnerId)) || winnerId;
    const result = appState.mergePlace(winnerId, loserIds);
    statusMessage =
      result.hofsMerged > 0
        ? `${loserIds.length + 1} Orte zu „${winnerTitle}" zusammengeführt — ${result.hofsMerged} Hof-Dubletten unter „${winnerTitle}" automatisch mit zusammengeführt.`
        : `${loserIds.length + 1} Orte zu „${winnerTitle}" zusammengeführt.`;
    const nextWinner = { ...chosenWinner };
    delete nextWinner[groupKey];
    chosenWinner = nextWinner;
    const nextDesel = { ...deselected };
    delete nextDesel[groupKey];
    deselected = nextDesel;
  }
</script>

<div class="place-dedup">
  <div class="place-dedup__head">
    <h2>Orte — Massen-Dedup</h2>
    {#if onClose}
      <button type="button" class="place-dedup__close-btn" onclick={onClose}>✕ Schließen</button>
    {/if}
  </div>

  {#if statusMessage}
    <p class="place-dedup__status">{statusMessage}</p>
  {/if}

  {#if groups.length === 0}
    <p class="place-dedup__empty">Keine Dubletten-Kandidaten gefunden.</p>
  {:else}
    <ul class="place-dedup__groups">
      {#each groups as group (group.key)}
        <li class="place-dedup__group" class:place-dedup__group--conflict={group.conflict || group.typeMismatch}>
          <h3>
            {group.members.length} mutmaßliche Dubletten
            {#if group.conflict}
              <span class="place-dedup__conflict-badge" use:tooltip={'Die Verwaltungszugehörigkeit der Einträge widerspricht sich — bitte die volle Namenskette vergleichen, bevor zusammengeführt wird (Spec 11 §8 Restklasse 3).'}>⚠ abweichende Verwaltungszugehörigkeit — prüfen</span>
            {/if}
            {#if group.typeMismatch}
              <span class="place-dedup__conflict-badge" use:tooltip={'Diese Einträge haben unterschiedliche Orts-Typen (z. B. Stadt und Kreis desselben Namens) — vermutlich KEINE Dublette, bitte vor dem Zusammenführen prüfen.'}>⚠ unterschiedliche Orts-Typen — prüfen</span>
            {/if}
          </h3>
          <ul class="place-dedup__members">
            {#each group.members as m (m.id)}
              {@const winnerId = winnerFor(group.key, group.suggestedWinnerId)}
              {@const isWinner = m.id === winnerId}
              <li class="place-dedup__member-row">
                <label class="place-dedup__member">
                  <input
                    type="radio"
                    name={`place-dedup-winner-${group.key}`}
                    value={m.id}
                    checked={isWinner}
                    onchange={() => chooseWinner(group.key, m.id)}
                  />
                  {m.fullName}
                  {#if m.id === group.suggestedWinnerId}
                    <span class="place-dedup__suggested">(Vorschlag)</span>
                  {/if}
                  {#if m.type}
                    <span class="stb-pill">{m.type}</span>
                  {/if}
                  {#if !m.enriched}
                    <span class="stb-pill" use:tooltip={'Nur der automatische Orts-Seed bzw. eine leere Neuanlage — noch keine weiteren Angaben erfasst.'}>ohne Zusatzangaben</span>
                  {/if}
                </label>
                <label class="place-dedup__include" use:tooltip={isWinner ? 'Der Gewinner ist immer Ziel des Merges.' : 'In diese Zusammenführung einbeziehen.'}>
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
            class="place-dedup__merge-btn"
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
  .place-dedup {
    padding: 1rem;
    overflow-y: auto;
  }

  .place-dedup__head {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .place-dedup__head h2 {
    margin: 0;
  }

  .place-dedup__close-btn {
    margin-left: auto;
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
  }

  .place-dedup__status {
    margin-top: 0.7rem;
    padding: 0.5rem 0.7rem;
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    font-size: 0.85rem;
  }

  .place-dedup__empty {
    color: var(--stb-text-dim);
    margin-top: 1rem;
  }

  .place-dedup__groups {
    list-style: none;
    margin: 1rem 0 0;
    padding: 0;
  }

  .place-dedup__group {
    background: var(--stb-surface-1);
    border-radius: var(--stb-radius-card);
    padding: 0.75rem 0.9rem;
    margin-bottom: 0.7rem;
  }

  .place-dedup__group--conflict {
    border: 1px solid var(--stb-quay-1);
  }

  .place-dedup__conflict-badge {
    display: inline-block;
    margin-left: 0.5rem;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--stb-quay-1);
    vertical-align: middle;
  }

  .place-dedup__group h3 {
    font-size: 0.9rem;
    color: var(--stb-gold-light);
    margin: 0 0 0.4rem;
  }

  .place-dedup__members {
    list-style: none;
    margin: 0 0 0.6rem;
    padding: 0;
  }

  .place-dedup__member-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .place-dedup__member {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.2rem 0;
    font-size: 0.88rem;
    flex: 1;
  }

  .place-dedup__include {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.78rem;
    color: var(--stb-text-dim);
    white-space: nowrap;
    cursor: pointer;
  }

  .place-dedup__suggested {
    color: var(--stb-text-dim);
    font-size: 0.78rem;
  }

  .place-dedup__merge-btn {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.8rem;
    cursor: pointer;
    font-weight: 600;
  }
</style>
