<script lang="ts">
  // ui/views/hof/HofDetail.svelte — Hof-Steckbrief + Bearbeitung (Spec 20 §1.8 [K]:
  // "Detail mit Bewohnern chronologisch", "Hof-Bearbeitung (Adressvarianten,
  // Koordinaten, Notiz, Lebenszyklus)"). Bewohner-Zeilen verlinken zur Person
  // (Cross-Tab-Navigation, ADR-v9-17-Muster).
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import DetailHeader from '../../shell/DetailHeader.svelte';
  import { withAddedHofAddr, withRemovedHofAddr, findOrCreateHof } from '../../../core/places';
  import PlaceMiniMap from '../place/PlaceMiniMap.svelte';
  import HofEditForm from './HofEditForm.svelte';
  import { buildHofDetail, type HofResidentRow } from './hof-detail-model';
  import type { HofObject } from '../../../core/places/types';

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
  let newAddrValue = $state('');
  let newAddrFrom = $state<number | null>(null);
  let newAddrTo = $state<number | null>(null);

  function startEdit() {
    editing = true;
  }

  function cancelEdit() {
    editing = false;
  }

  /** HofEditForm reicht das fertige HofObject zurück → speichern + Bearbeiten-Modus verlassen. */
  function handleSaveEdit(updated: HofObject) {
    appState.saveHof(updated);
    editing = false;
  }

  /**
   * Legt für die Vorgänger-/Nachfolger-Picker der Bearbeiten-Form einen neuen Hof an (Callback
   * von HofEditForm, ADR-v9-42 Punkt 5): Hof-Identität braucht Adresse + Dorf-Kontext
   * (findOrCreateHof) — der Dorf-Kontext ist der des aktuellen Hofs (Vorgänger/Nachfolger
   * gehören zwangsläufig zum selben Dorf). Liefert die id zurück; die Form bindet sie ein.
   */
  function createHofForForm(addr: string): string | null {
    if (!detail || !addr) return null;
    const result = findOrCreateHof(addr, detail.hof.villageId, appState.db.hofObjects);
    if (!result) return null;
    if (result.created) appState.saveHof(result.created);
    return result.hofId;
  }

  /**
   * Löschen (ADR-v9-78 Punkt 1): destruktiv, mit nativem `confirm()` (analog
   * PlaceDetail.svelte — kein etabliertes Bestätigungs-Dialog-Muster im Projekt).
   */
  function handleDelete() {
    if (!detail) return;
    const label = detail.hof.addrs[0]?.value || detail.hof.id;
    if (!window.confirm(`Hof „${label}" wirklich löschen? Ereignis-Verknüpfungen zu diesem Hof werden dabei entfernt (nicht die Ereignisse selbst).`)) {
      return;
    }
    appState.deleteHof(detail.hof.id);
    editing = false;
    onBack?.();
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

  /**
   * Bearbeitet eine BESTEHENDE Adressvariante (u. a. der im Steckbrief angezeigte
   * Hof-„Name", `addrs[0].value`) — Timing analog `addAddr`/`removeAddr` im selben
   * Abschnitt: sofortiger Commit über `appState.updateHofAddr`, nicht erst beim globalen
   * „Speichern"-Button (der deckt nur die Grunddaten-Sektion ab; die Adressvarianten-
   * Sektion committet Änderungen schon bei add/remove sofort — Konsistenz INNERHALB
   * dieses Abschnitts statt eines vierten eigenen Timings). `updateHofAddr` (statt
   * `saveHof`) zieht bei einer tatsächlichen Namensänderung (`addrs[0].value` u. Ä.)
   * die Umbenennung auf alle referenzierenden Events mit (`ev.addr`/`ev.place`) — der
   * neue Name muss durchgängig sichtbar werden, nicht nur im Steckbrief.
   */
  function updateAddrValue(index: number, value: string) {
    if (!detail) return;
    const a = detail.hof.addrs[index];
    if (!a) return;
    appState.updateHofAddr(detail.hof.id, index, value, a.from, a.to);
  }

  function updateAddrFrom(index: number, raw: string) {
    if (!detail) return;
    const a = detail.hof.addrs[index];
    if (!a) return;
    const from = raw.trim() === '' ? null : Number(raw);
    appState.updateHofAddr(detail.hof.id, index, a.value, from, a.to);
  }

  function updateAddrTo(index: number, raw: string) {
    if (!detail) return;
    const a = detail.hof.addrs[index];
    if (!a) return;
    const to = raw.trim() === '' ? null : Number(raw);
    appState.updateHofAddr(detail.hof.id, index, a.value, a.from, to);
  }

  const otherHofs = $derived(
    detail ? Array.from(appState.db.hofObjects.values()).filter((h) => h.id !== detail.hof.id) : [],
  );
</script>

{#snippet residentRow(row: HofResidentRow)}
  <span class="stb-role-label" class:hof-detail__role--owner={row.role === 'Eigentümer'}>{row.role}</span>
  <button type="button" class="hof-detail__resident-link" onclick={() => onNavigateToPerson?.(row.personId)}>
    {row.personName}
  </button>
  <span class="hof-detail__muted">{row.label}{row.year ? `, ${row.year}` : ''}</span>
{/snippet}

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

    <!-- Name & Adressvarianten (Nutzer-Wunsch, s. Auftrag TEIL C): der Name eines Hofes
         IST addrs[0].value — steht deshalb als erste Sektion direkt unter dem Titel, VOR
         den Grunddaten, in BEIDEN Modi (Lese- wie Bearbeiten-Modus). -->
    <section class="hof-detail__section">
      <h3>Name &amp; Adressvarianten</h3>
      <ul class="hof-detail__addr-list">
        {#each detail.hof.addrs as a, i (i)}
          <li>
            {#if editing}
              <input
                type="text"
                class="hof-detail__addr-edit-value"
                value={a.value}
                onchange={(e) => updateAddrValue(i, e.currentTarget.value)}
                aria-label={`Adresswert Zeile ${i + 1}`}
              />
              <input
                type="number"
                class="hof-detail__addr-edit-year"
                value={a.from ?? ''}
                onchange={(e) => updateAddrFrom(i, e.currentTarget.value)}
                aria-label={`Gültig von Zeile ${i + 1}`}
                placeholder="von"
              />
              <input
                type="number"
                class="hof-detail__addr-edit-year"
                value={a.to ?? ''}
                onchange={(e) => updateAddrTo(i, e.currentTarget.value)}
                aria-label={`Gültig bis Zeile ${i + 1}`}
                placeholder="bis"
              />
              <button type="button" class="hof-detail__remove-btn" onclick={() => removeAddr(i)} aria-label="Adressvariante entfernen">✕</button>
            {:else}
              <span>{a.value}</span>
              {#if a.from || a.to}<span class="hof-detail__muted">({a.from ?? '…'}–{a.to ?? '…'})</span>{/if}
            {/if}
          </li>
        {/each}
      </ul>
      {#if editing}
        <div class="hof-detail__add-row">
          <input type="text" placeholder="neue Adresse…" bind:value={newAddrValue} aria-label="Neue Adressvariante" />
          <input type="number" placeholder="von" bind:value={newAddrFrom} aria-label="Gültig von (Jahr)" />
          <input type="number" placeholder="bis" bind:value={newAddrTo} aria-label="Gültig bis (Jahr)" />
          <button type="button" onclick={addAddr}>+ Hinzufügen</button>
        </div>
      {/if}
    </section>

    {#if editing}
      <HofEditForm
        hof={detail.hof}
        {otherHofs}
        onSave={handleSaveEdit}
        onCancel={cancelEdit}
        onDelete={handleDelete}
        onCreateHof={createHofForForm}
      />
    {/if}

    {#if detail.predecessorLabel || detail.successorLabel}
      <section class="hof-detail__section">
        <h3>Lebenszyklus</h3>
        {#if detail.predecessorLabel}<p>Vorgänger: {detail.predecessorLabel}</p>{/if}
        {#if detail.successorLabel}<p>Nachfolger: {detail.successorLabel}</p>{/if}
      </section>
    {/if}

    <!-- Mini-Karte (BL-09/BL-214) — Höfe tragen eigene Geodaten (Binnenmigration im Dorf
         sichtbar, Spec 11 §1). Hof-Kontext: Ausschnitt über Dorf + Geschwisterhöfe
         (ADR-v9-147 Punkt 1), gleicher gemeinsamer Renderer wie im Ort-Steckbrief (INV-UI-4). -->
    <PlaceMiniMap
      lat={detail.hof.lat}
      long={detail.hof.long}
      label={detail.hof.addrs[0]?.value || detail.hof.id}
      context={{ kind: 'hof', villageCoords: detail.villageCoords, siblingCoords: detail.siblingCoords }}
    />

    <section class="hof-detail__section">
      <h3>Bewohner &amp; Eigentümer</h3>
      {#if detail.residents.length === 0}
        <p class="hof-detail__muted">Keine Bewohner-/Eigentümer-Ereignisse an diesem Hof erfasst.</p>
      {:else}
        <ul class="hof-detail__residents">
          {#each detail.residents as row (row.key)}
            <li class:hof-detail__resident--owner={row.role === 'Eigentümer'}>{@render residentRow(row)}</li>
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

  .hof-detail__addr-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .hof-detail__addr-list li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0;
    border-bottom: 1px solid var(--stb-surface-2);
    flex-wrap: wrap;
  }

  /* Editierbare bestehende Adresszeile (gleiche Feld-Optik wie .hof-detail__add-row
     input, INV-UI-4 — kein eigener Input-Stil). */
  .hof-detail__addr-edit-value,
  .hof-detail__addr-edit-year {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.5rem;
    font: inherit;
  }

  .hof-detail__addr-edit-value {
    flex: 1 1 auto;
    min-width: 8rem;
  }

  .hof-detail__addr-edit-year {
    width: 4.5rem;
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

  /* Bewohner/Eigentümer: EINE zeitlich integrierte Liste (Nachtrag 2026-07-10,
     Spec 21 §10j) — Differenzierung über .stb-role-label je Zeile, nicht über
     getrennte Sektionen. */
  .hof-detail__residents {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .hof-detail__residents li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0 0.3rem 0.5rem;
    border-bottom: 1px solid var(--stb-surface-2);
    border-left: 3px solid transparent;
    flex-wrap: wrap;
  }

  /* Optische Differenzierung Bewohner/Eigentümer (Nutzer-Fund 2026-07-10, Nachtrag zu
     ADR-v9-56): ein reines Textlabel allein ("BEWOHNER"/"EIGENTÜMER") reicht nicht als
     "optisch differenziert" — Eigentümer-Zeilen bekommen einen Gold-Akzent (Rand +
     Label-Farbe), analog dem bereits etablierten "besonderes Ereignis"-Randmuster
     (PersonForm.svelte's .person-form__event--special), statt einer neuen Farbe. */
  .hof-detail__resident--owner {
    border-left-color: var(--stb-gold-dim);
  }

  .hof-detail__role--owner {
    color: var(--stb-gold-light);
    font-weight: 700;
  }
</style>
