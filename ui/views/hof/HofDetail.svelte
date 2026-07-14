<script lang="ts">
  // ui/views/hof/HofDetail.svelte — Hof-Steckbrief + Bearbeitung (Spec 20 §1.8 [K]:
  // "Detail mit Bewohnern chronologisch", "Hof-Bearbeitung (Adressvarianten,
  // Koordinaten, Notiz, Lebenszyklus)"). Bewohner-Zeilen verlinken zur Person
  // (Cross-Tab-Navigation, ADR-v9-17-Muster).
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import DetailHeader from '../../shell/DetailHeader.svelte';
  import Picker from '../../shell/Picker.svelte';
  import { withAddedHofAddr, withRemovedHofAddr, findOrCreateHof } from '../../../core/places';
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
  let formLat = $state<number | null>(null);
  let formLong = $state<number | null>(null);
  let formNote = $state('');
  let formExistsFrom = $state<number | null>(null);
  let formExistsTo = $state<number | null>(null);
  let formPredecessor = $state('');
  let formSuccessor = $state('');
  let formGovId = $state('');
  /** GOV-Typen (`govTypes: string[] | null`) als komma-getrennter Freitext bearbeitet —
   *  analog PlaceDetail.svelte (kein etabliertes Array-of-string-Editier-Muster im
   *  Projekt gefunden). */
  let formGovTypes = $state('');
  let newAddrValue = $state('');
  let newAddrFrom = $state<number | null>(null);
  let newAddrTo = $state<number | null>(null);

  /** Inline-Neuanlage eines Vorgänger-/Nachfolger-Hofes (ADR-v9-42 Punkt 5): Hof-Identität
   *  braucht Adresse+Dorf-Kontext (findOrCreateHof) — kein blankes Namensfeld wie bei Ort,
   *  darum ein simples Adress-Textfeld statt eines eigenen HofForm.svelte (analog
   *  HofReview.svelte "+ Hof anlegen"). Der Dorf-Kontext ist unzweideutig: der neue
   *  Vorgänger/Nachfolger gehört zwangsläufig zum selben Dorf wie der aktuelle Hof. */
  let creatingHofFor = $state<'predecessor' | 'successor' | null>(null);
  let newHofAddr = $state('');

  function beginCreateHof(target: 'predecessor' | 'successor') {
    creatingHofFor = target;
    newHofAddr = '';
  }

  function cancelCreateHof() {
    creatingHofFor = null;
    newHofAddr = '';
  }

  function confirmCreateHof() {
    if (!detail || !creatingHofFor) return;
    const addrText = newHofAddr.trim();
    if (!addrText) return;
    const result = findOrCreateHof(addrText, detail.hof.villageId, appState.db.hofObjects);
    if (!result) return;
    if (result.created) appState.saveHof(result.created);
    if (creatingHofFor === 'predecessor') formPredecessor = result.hofId;
    else formSuccessor = result.hofId;
    creatingHofFor = null;
    newHofAddr = '';
  }

  /** Komma-getrennten Freitext in `govTypes: string[] | null` zurückübersetzen — analog
   *  PlaceDetail.svelte. */
  function parseGovTypes(text: string): string[] | null {
    const items = text
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return items.length > 0 ? items : null;
  }

  function startEdit() {
    if (!detail) return;
    formLat = detail.hof.lat;
    formLong = detail.hof.long;
    formNote = detail.hof.note;
    formExistsFrom = detail.hof.existsFrom;
    formExistsTo = detail.hof.existsTo;
    formPredecessor = detail.hof.predecessor ?? '';
    formSuccessor = detail.hof.successor ?? '';
    formGovId = detail.hof.govId ?? '';
    formGovTypes = detail.hof.govTypes?.join(', ') ?? '';
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
      govId: formGovId.trim() || null,
      govTypes: parseGovTypes(formGovTypes),
    });
    editing = false;
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

  function hofLabel(h: HofObject): string {
    return h.addrs[0]?.value ?? h.id;
  }

  function hofMatches(h: HofObject, query: string): boolean {
    return hofLabel(h).toLowerCase().includes(query.trim().toLowerCase());
  }
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
          <!-- "+ neuen Hof anlegen" (ADR-v9-42, ersetzt die ADR-v9-40-Ausnahme): eine
               einzelne, bewusste Nutzerhandlung im Editier-Modus ist strukturell identisch
               zu "+ Neue Person/Familie/Quelle/Archiv anlegen" — die Kurations-Sorge
               (ADR-v9-13/28/29) betrifft nur automatische Massenanlage beim Import. -->
          {#if creatingHofFor === 'predecessor'}
            <div class="hof-detail__inline-create">
              <input
                type="text"
                placeholder="Adresse des neuen Hofs…"
                bind:value={newHofAddr}
                aria-label="Adresse des neuen Vorgänger-Hofs"
              />
              <button type="button" onclick={confirmCreateHof} disabled={!newHofAddr.trim()}>Anlegen</button>
              <button type="button" onclick={cancelCreateHof}>Abbrechen</button>
            </div>
          {:else}
            <Picker
              items={otherHofs}
              getId={(h) => h.id}
              getLabel={hofLabel}
              matches={hofMatches}
              value={formPredecessor || null}
              onChange={(id) => (formPredecessor = id ?? '')}
              allowNone={true}
              noneLabel="(keiner)"
              label="Vorgänger-Hof"
              createLabel="+ neuen Hof anlegen …"
              onCreateRequested={() => beginCreateHof('predecessor')}
            />
          {/if}
        </label>
        <label>
          Nachfolger-Hof
          {#if creatingHofFor === 'successor'}
            <div class="hof-detail__inline-create">
              <input
                type="text"
                placeholder="Adresse des neuen Hofs…"
                bind:value={newHofAddr}
                aria-label="Adresse des neuen Nachfolger-Hofs"
              />
              <button type="button" onclick={confirmCreateHof} disabled={!newHofAddr.trim()}>Anlegen</button>
              <button type="button" onclick={cancelCreateHof}>Abbrechen</button>
            </div>
          {:else}
            <Picker
              items={otherHofs}
              getId={(h) => h.id}
              getLabel={hofLabel}
              matches={hofMatches}
              value={formSuccessor || null}
              onChange={(id) => (formSuccessor = id ?? '')}
              allowNone={true}
              noneLabel="(keiner)"
              label="Nachfolger-Hof"
              createLabel="+ neuen Hof anlegen …"
              onCreateRequested={() => beginCreateHof('successor')}
            />
          {/if}
        </label>
        <label>
          GOV-ID
          <input type="text" bind:value={formGovId} placeholder="z. B. eine gov.genealogy.net-Kennung" />
        </label>
        <label>
          GOV-Typen (kommagetrennt)
          <input type="text" bind:value={formGovTypes} placeholder="z. B. Hof, Gehöft" />
        </label>
        <div class="hof-detail__form-actions">
          <button type="button" class="hof-detail__save-btn" onclick={saveEdit}>Speichern</button>
          <button type="button" class="hof-detail__cancel-btn" onclick={cancelEdit}>Abbrechen</button>
          <button type="button" class="hof-detail__delete-btn" onclick={handleDelete}>Hof löschen</button>
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

  /* Destruktive Aktion — analog PlaceDetail.svelte's .place-detail__delete-btn (INV-UI-4:
     gleicher Mechanismus, nur andere Klassennamen-Präfix). `margin-left: auto` auf
     :last-child statt unbedingt auf der Klasse (TST-11). */
  .hof-detail__delete-btn {
    background: transparent;
    color: var(--stb-danger);
    border: 1px solid var(--stb-danger);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.8rem;
    cursor: pointer;
  }

  .hof-detail__form-actions > :last-child {
    margin-left: auto;
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

  /* Inline-Neuanlage Vorgänger-/Nachfolger-Hof (ADR-v9-42): gleiche add-row-Optik wie
     Adressvarianten/Namensvarianten, eigener Klassenname statt weiterer .hof-detail__
     add-row-Überladung (unterschiedliche Spalten: Adresstext + Anlegen + Abbrechen). */
  .hof-detail__inline-create {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .hof-detail__inline-create input {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.5rem;
    flex: 1 1 auto;
    min-width: 8rem;
  }

  .hof-detail__inline-create button {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
  }

  .hof-detail__inline-create button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
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
