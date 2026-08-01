<script lang="ts">
  // ui/views/hof/HofDetail.svelte — Hof-Steckbrief + Bearbeitung (Spec 20 §1.8 [K]:
  // "Detail mit Bewohnern chronologisch", "Hof-Bearbeitung (Adressvarianten,
  // Koordinaten, Notiz, Lebenszyklus)"). Bewohner-Zeilen verlinken zur Person
  // (Cross-Tab-Navigation, ADR-v9-17-Muster).
  import type { PlacesHost, PlacesNav } from '../../shell/places-host';
  import type { LensId } from '../../shell/lens-model';
  import DetailHeader from '../../shell/DetailHeader.svelte';
  import ReviewedToggle from '../../shell/ReviewedToggle.svelte';
  import { withAddedHofAddr, withRemovedHofAddr, findOrCreateHof, markHofReviewed } from '../../../core/places';
  import PlaceMiniMap from '../place/PlaceMiniMap.svelte';
  import HofEditForm from './HofEditForm.svelte';
  import Picker from '../../shell/Picker.svelte';
  import { placeDisplayName, normPlaceName } from '../../../core/places';
  import { hofHeading } from '../../shell/place-labels';
  import { buildHofDetail, type HofResidentRow } from './hof-detail-model';
  import type { HofObject, PlaceObject } from '../../../core/places/types';

  interface Props {
    appState: PlacesHost;
    viewState: PlacesNav;
    onNavigateToPerson?: (personId: string) => void;
    /** "← Zur Liste" (Spec 21 §6b: EINE gemeinsame Kopfzeile statt EntityTabs eigener
     *  Zeile) — optional, damit isolierte Tests/Kontexte ohne EntityTab weiterlaufen. */
    onBack?: () => void;
    /** Sprung zur Karte-Lens über die Mini-Karte (ADR-v9-150, INV-UI-3). */
    onNavigateLens?: (lens: LensId) => void;
  }
  const { appState, viewState, onNavigateToPerson, onBack, onNavigateLens }: Props = $props();

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
    const label = hofHeading(detail.hof);
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

  /** Dorf-Kandidaten: alle PlaceObjects — welcher Ort ein „Dorf" ist, entscheidet der
   *  Nutzer, nicht der Typ (ein Hof kann an einer Bauerschaft, einem Kirchspiel oder einer
   *  Stadt hängen). Kein Typ-Filter, der ihn aussperrt. */
  const villages = $derived([...appState.db.placeObjects.values()]);
  const villageLabel = (p: PlaceObject) => placeDisplayName(p);
  const villageMatches = (p: PlaceObject, q: string) =>
    normPlaceName(placeDisplayName(p)).includes(normPlaceName(q));

  let moveNotice = $state('');

  /**
   * Hängt den Hof an ein anderes Dorf. Meldet, wenn im Zieldorf ein gleichadressiger Hof
   * konsolidiert wurde — der Nachlauf ist verlustfrei, aber er soll nicht unbemerkt
   * passieren (LP-6, analog dem Toast nach dem Dorf-Merge).
   */
  function moveToVillage(id: string | null): void {
    if (!detail || !id || id === detail.hof.villageId) return;
    const result = appState.moveHof(detail.hof.id, id);
    moveNotice =
      result.merged > 0
        ? `Im Zieldorf lag bereits ein Hof mit dieser Adresse — ${result.merged} Eintrag/Einträge wurden verlustfrei zusammengeführt.`
        : '';
    // Wurde der Hof selbst zum Verlierer, lebt er unter der Gewinner-Id weiter.
    if (result.hofId !== detail.hof.id) viewState.setCurrent('hof', result.hofId);
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
    <DetailHeader title={hofHeading(detail.hof)} onBack={onBack ?? (() => {})}>
      {#snippet actions()}
        <span class="hof-detail__village">{detail.villageTitle}</span>
        {#if !editing}
          <!-- Geschwister-Stelle zu PlaceDetail (ADR-v9-191, INV-UI-4): dieselbe Frage,
               derselbe Schalter, dieselbe Komponente. -->
          <ReviewedToggle
            reviewedAt={detail.hof.reviewedAt}
            kind="Hof"
            onToggle={(at) => appState.saveHof(markHofReviewed(detail.hof, at))}
          />
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

        <!-- Das Dorf gehört zur IDENTITÄT eines Hofes, nicht zu seinen Grunddaten:
             `(villageId, normalisierte Adresse)` ist der Identitätsschlüssel (Spec 11 §1,
             §9.2). Deshalb steht der Picker hier neben den Adressen und nicht unten im
             Grunddaten-Formular — und deshalb committet er SOFORT wie add/remove daneben,
             statt auf dessen „Speichern" zu warten (ADR-v9-172; dasselbe Timing wie
             `updateHofAddr`). -->
        <div class="hof-detail__village-edit">
          <Picker
            items={villages}
            getId={(p) => p.id}
            getLabel={villageLabel}
            matches={villageMatches}
            value={detail.hof.villageId}
            onChange={moveToVillage}
            label="Dorf des Hofes"
            placeholder="Dorf wählen…"
          />
          {#if moveNotice}
            <p class="hof-detail__muted" role="status">{moveNotice}</p>
          {/if}
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
      label={hofHeading(detail.hof)}
      context={{ kind: 'hof', villageCoords: detail.villageCoords, siblingCoords: detail.siblingCoords }}
      {viewState}
      focusId={hofId}
      {onNavigateLens}
    />

    <!-- TST-14 — Geschwister-Stelle zum Ort-Steckbrief: die Hof-Notiz war ebenfalls nur
         eingebbar. Die Hof-LISTE signalisiert sie sogar mit einer 📝-Pille, ohne dass der
         Inhalt je zu sehen war. -->
    {#if !editing && detail.hof.note}
      <section class="hof-detail__section">
        <h3>Notiz</h3>
        <p class="hof-detail__note">{detail.hof.note}</p>
      </section>
    {/if}

    <!-- D3 (Spec 22 §3.1) — Geschwister-Stelle zu PlaceContemporaries: ohne
         Ereignis-Kontext gibt es keine Bewohner-Auskunft, also auch keinen Abschnitt. -->
    {#if appState.caps.hasEventContext}
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
  {/if}
</div>

<style>
  .hof-detail__village-edit {
    margin-top: 0.6rem;
  }

  .hof-detail__note {
    margin: 0;
    white-space: pre-wrap;
    color: var(--stb-text);
    font-size: 0.85rem;
    line-height: 1.45;
  }

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
