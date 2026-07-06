<script lang="ts">
  // ui/views/hof/HofDetail.svelte — Hof-Steckbrief + Bearbeitung (Spec 20 §1.8 [K]:
  // "Detail mit Bewohnern chronologisch", "Hof-Bearbeitung (Adressvarianten,
  // Koordinaten, Notiz, Lebenszyklus)"). Bewohner-Zeilen verlinken zur Person
  // (Cross-Tab-Navigation, ADR-v9-17-Muster).
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import DetailHeader from '../../shell/DetailHeader.svelte';
  import { withAddedHofAddr, withRemovedHofAddr } from '../../../core/places';
  import { buildHofDetail } from './hof-detail-model';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    onNavigateToPerson?: (personId: string) => void;
    /** "← Zur Liste" (Spec 21 §6b: EINE gemeinsame Kopfzeile statt EntityTabs eigener
     *  Zeile) — optional, damit isolierte Tests/Kontexte ohne EntityTab weiterlaufen. */
    onBack?: () => void;
  }
  const { appState, viewState, onNavigateToPerson, onBack }: Props = $props();

  const hofId = $derived(viewState.getCurrent('hof'));
  const detail = $derived(hofId ? buildHofDetail(appState.db, appState.placeContext, hofId) : null);

  let editing = $state(false);
  let formLat = $state<number | null>(null);
  let formLong = $state<number | null>(null);
  let formNote = $state('');
  let formExistsFrom = $state<number | null>(null);
  let formExistsTo = $state<number | null>(null);
  let formPredecessor = $state('');
  let formSuccessor = $state('');
  let newAddrValue = $state('');
  let newAddrFrom = $state<number | null>(null);
  let newAddrTo = $state<number | null>(null);

  function startEdit() {
    if (!detail) return;
    formLat = detail.hof.lat;
    formLong = detail.hof.long;
    formNote = detail.hof.note;
    formExistsFrom = detail.hof.existsFrom;
    formExistsTo = detail.hof.existsTo;
    formPredecessor = detail.hof.predecessor ?? '';
    formSuccessor = detail.hof.successor ?? '';
    editing = true;
  }

  function cancelEdit() {
    editing = false;
  }

  function saveEdit() {
    if (!detail) return;
    appState.saveHof({
      ...detail.hof,
      lat: formLat,
      long: formLong,
      note: formNote,
      existsFrom: formExistsFrom,
      existsTo: formExistsTo,
      predecessor: formPredecessor || null,
      successor: formSuccessor || null,
    });
    editing = false;
  }

  function addAddr() {
    if (!detail || !newAddrValue.trim()) return;
    appState.saveHof(withAddedHofAddr(detail.hof, newAddrValue, newAddrFrom, newAddrTo));
    newAddrValue = '';
    newAddrFrom = null;
    newAddrTo = null;
  }

  function removeAddr(index: number) {
    if (!detail) return;
    appState.saveHof(withRemovedHofAddr(detail.hof, index));
  }

  const otherHofs = $derived(
    detail ? Array.from(appState.db.hofObjects.values()).filter((h) => h.id !== detail.hof.id) : [],
  );
</script>

<div class="hof-detail">
  {#if !hofId}
    <p class="hof-detail__empty">Kein Hof ausgewählt.</p>
  {:else if !detail}
    <p class="hof-detail__empty">Hof nicht gefunden (evtl. gelöscht oder Datei gewechselt).</p>
  {:else}
    <DetailHeader title={detail.hof.addrs[0]?.value || detail.hof.id} onBack={onBack ?? (() => {})}>
      {#snippet actions()}
        <span class="hof-detail__village">{detail.villageTitle}</span>
        {#if !editing}
          <button type="button" class="hof-detail__edit-btn" onclick={startEdit}>✎ Bearbeiten</button>
        {/if}
      {/snippet}
    </DetailHeader>

    {#if editing}
      <section class="hof-detail__section hof-detail__form">
        <h3>Grunddaten</h3>
        <label>
          Breitengrad
          <input type="number" step="any" bind:value={formLat} />
        </label>
        <label>
          Längengrad
          <input type="number" step="any" bind:value={formLong} />
        </label>
        <label>
          Notiz
          <textarea bind:value={formNote}></textarea>
        </label>
        <label>
          Existiert von (Jahr)
          <input type="number" bind:value={formExistsFrom} />
        </label>
        <label>
          Existiert bis (Jahr)
          <input type="number" bind:value={formExistsTo} />
        </label>
        <label>
          Vorgänger-Hof
          <select value={formPredecessor} onchange={(e) => (formPredecessor = e.currentTarget.value)}>
            <option value="">(keiner)</option>
            {#each otherHofs as h (h.id)}
              <option value={h.id}>{h.addrs[0]?.value ?? h.id}</option>
            {/each}
          </select>
        </label>
        <label>
          Nachfolger-Hof
          <select value={formSuccessor} onchange={(e) => (formSuccessor = e.currentTarget.value)}>
            <option value="">(keiner)</option>
            {#each otherHofs as h (h.id)}
              <option value={h.id}>{h.addrs[0]?.value ?? h.id}</option>
            {/each}
          </select>
        </label>
        <div class="hof-detail__form-actions">
          <button type="button" class="hof-detail__save-btn" onclick={saveEdit}>Speichern</button>
          <button type="button" class="hof-detail__cancel-btn" onclick={cancelEdit}>Abbrechen</button>
        </div>
      </section>
    {/if}

    {#if detail.predecessorLabel || detail.successorLabel}
      <section class="hof-detail__section">
        <h3>Lebenszyklus</h3>
        {#if detail.predecessorLabel}<p>Vorgänger: {detail.predecessorLabel}</p>{/if}
        {#if detail.successorLabel}<p>Nachfolger: {detail.successorLabel}</p>{/if}
      </section>
    {/if}

    <section class="hof-detail__section">
      <h3>Adressvarianten</h3>
      <ul class="hof-detail__addr-list">
        {#each detail.hof.addrs as a, i (i)}
          <li>
            <span>{a.value}</span>
            {#if a.from || a.to}<span class="hof-detail__muted">({a.from ?? '…'}–{a.to ?? '…'})</span>{/if}
            <button type="button" class="hof-detail__remove-btn" onclick={() => removeAddr(i)} aria-label="Adressvariante entfernen">✕</button>
          </li>
        {/each}
      </ul>
      <div class="hof-detail__add-row">
        <input type="text" placeholder="neue Adresse…" bind:value={newAddrValue} aria-label="Neue Adressvariante" />
        <input type="number" placeholder="von" bind:value={newAddrFrom} aria-label="Gültig von (Jahr)" />
        <input type="number" placeholder="bis" bind:value={newAddrTo} aria-label="Gültig bis (Jahr)" />
        <button type="button" onclick={addAddr}>+ Hinzufügen</button>
      </div>
    </section>

    <section class="hof-detail__section">
      <h3>Bewohner (chronologisch)</h3>
      {#if detail.residents.length === 0}
        <p class="hof-detail__muted">Keine Bewohner-Ereignisse an diesem Hof erfasst.</p>
      {:else}
        <ul class="hof-detail__residents">
          {#each detail.residents as row (row.key)}
            <li>
              <button
                type="button"
                class="hof-detail__resident-link"
                onclick={() => onNavigateToPerson?.(row.personId)}
              >
                {row.personName}
              </button>
              <span class="hof-detail__muted">{row.label}{row.year ? `, ${row.year}` : ''}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</div>

<style>
  .hof-detail {
    padding: 1rem;
    overflow-y: auto;
  }

  .hof-detail__empty {
    color: var(--stb-text-dim);
  }

  .hof-detail__village {
    font-size: 0.85rem;
    color: var(--stb-text-dim);
  }

  .hof-detail__edit-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    font-size: 0.82rem;
  }

  .hof-detail__section {
    margin-top: 1.25rem;
  }

  .hof-detail__section h3 {
    font-size: 0.95rem;
    color: var(--stb-gold-light);
    margin-bottom: 0.4rem;
  }

  .hof-detail__muted {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
  }

  .hof-detail__form {
    background: var(--stb-surface-1);
    border-radius: var(--stb-radius-card);
    padding: 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .hof-detail__form label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.8rem;
    color: var(--stb-text-dim);
  }

  .hof-detail__form input,
  .hof-detail__form select,
  .hof-detail__form textarea {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.5rem;
    font: inherit;
  }

  .hof-detail__form-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .hof-detail__save-btn,
  .hof-detail__cancel-btn {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.8rem;
    cursor: pointer;
    font-weight: 600;
  }

  .hof-detail__cancel-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
  }

  .hof-detail__addr-list,
  .hof-detail__residents {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .hof-detail__addr-list li,
  .hof-detail__residents li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0;
    border-bottom: 1px solid var(--stb-surface-2);
    flex-wrap: wrap;
  }

  .hof-detail__remove-btn {
    margin-left: auto;
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
  }

  .hof-detail__add-row {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    margin-top: 0.5rem;
  }

  .hof-detail__add-row input {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.5rem;
  }

  .hof-detail__add-row button {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
  }

  .hof-detail__resident-link {
    background: transparent;
    border: none;
    color: var(--stb-gold-light);
    cursor: pointer;
    padding: 0;
    font: inherit;
    text-decoration: underline;
  }
</style>
