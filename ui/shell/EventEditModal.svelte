<script lang="ts">
  // ui/shell/EventEditModal.svelte — fokussierter Einzel-Ereignis-Editor als Overlay
  // (Bau-Auftrag "Ereignis direkt aus der Detail-Ansicht bearbeiten"). Öffnet sich über
  // das ✎-Icon an JEDER Ereigniszeile in PersonDetail.svelte/FamilyDetail.svelte, statt
  // das GESAMTE PersonForm/FamilyForm (alle Identitätsfelder + alle Ereignisse) zu öffnen
  // — schneller Pfad für "nur diesen einen Beruf/dieses eine Wohnort-Ereignis ändern".
  //
  // Feld-Editier-Logik (Datum-Parsing/-Dirty-Tracking, Ort-/Hof-Picker-Reprojektion,
  // Tristate-Erhaltung) ist EXTRAHIERT aus PersonForm.svelte/FamilyForm.svelte nach
  // ui/shell/event-edit.ts (INV-UI-4, ein Mechanismus statt drei Kopien) — dieses Modal
  // dupliziert NICHTS davon, nur die Template-Markup ist lokal (eigene, dichtere Layout-
  // Klassen `.event-edit-modal__*` statt `.person-form__*`/`.family-form__*`, analog wie
  // PersonForm/FamilyForm bereits je eigene, sehr ähnliche CSS-Blöcke pflegen).
  //
  // Speichert NICHT selbst — ruft `onSave(updatedEvent, cause)` mit dem VOLLSTÄNDIGEN
  // Event-Objekt auf; der Aufrufer (PersonDetail/FamilyDetail) kennt, in welchem Feld
  // des Person-/Family-Objekts dieses Event lebt (birth/chr/death/buri/marriage/
  // engagement ODER events[i]) und ruft appState.savePerson/saveFamily(model) mit dem
  // KOMPLETTEN, geklonten Objekt auf (Spec 02 §3 Kommando-Chokepoint, kein Feld-Setter-
  // Pattern). `cause` (Todesursache) lebt auf Person.cause, NICHT am Event
  // (core/model/types.ts) — nur bei Person+DEAT gesetzt (s. `cause`-Prop), sonst leer.
  //
  // Modal-Schale (Backdrop + Panel + Schließen) ist NEU — im Repo existierte bisher kein
  // wiederverwendbares Overlay-Muster (geprüft: PlaceDedupView/HofDedupView sind volle
  // Ansichten ohne Backdrop, kein `<dialog>`/Modal-Baustein vorhanden). Künftige Einzel-
  // Objekt-Bearbeitungs-Fälle können `.event-edit-modal__backdrop`/`__panel` als Vorbild
  // nehmen statt ein drittes Overlay-Muster zu erfinden (INV-UI-4).
  import { untrack } from 'svelte';
  import type { AppState } from './app-state.svelte';
  import type { Event, Quay } from '../../core/model/types';
  import { makeCitation } from '../../core/model/factory';
  import { setCitationQuay } from '../../core/model/citation';
  import { HOF_EVENT_TYPES } from '../../core/places';
  import SourceCitationRow from './SourceCitationRow.svelte';
  import EventPlaceField from './EventPlaceField.svelte';
  import EventAddrField from './EventAddrField.svelte';
  import {
    toEditable,
    markDateDirty,
    fromEditable,
    pickPlaceFor as sharedPickPlaceFor,
    pickHofFor as sharedPickHofFor,
    onMonthBlur,
    QUALIFIER_OPTIONS,
    type EditableEvent,
  } from './event-edit';

  interface Props {
    appState: AppState;
    /** Das zu bearbeitende Ereignis (roh, unverändert) — der Aufrufer weiß, in welchem
     *  Person-/Family-Feld es lebt (s. Modul-Kommentar), dieses Modal kennt nur das Event
     *  selbst. */
    event: Event;
    /** Übersetztes Label des Ereignistyps (`EventRow.label`/`FamilyEventRow.label`, bereits
     *  `ev.eventType || eventTypeLabel(tag)`, INV-UI-8) — Basis für die Überschrift
     *  ("<label> bearbeiten") UND das aria-label-Präfix der Ort-/Adresse-/Quellen-Felder
     *  (analog PersonForm/FamilyForm's `title2`-Parameter an `specialEventSection`). */
    label: string;
    /** Todesursache (Person.cause) — NUR bei Person + DEAT gesetzt, sonst undefined/null
     *  (Feld bleibt dann ausgeblendet, s. Modul-Kommentar). */
    cause?: string | null;
    /** Vollständiges, aktualisiertes Event-Objekt + (ggf. leere) Todesursache — der
     *  Aufrufer baut daraus das volle Person-/Family-Objekt und ruft
     *  appState.savePerson/saveFamily(model) auf (kein Speichern hier im Modal). */
    onSave: (updatedEvent: Event, cause: string) => void;
    onClose: () => void;
  }
  const { appState, event, label, cause = null, onSave, onClose }: Props = $props();

  // Formular-Zustand wird NUR beim Mount aus dem übergebenen Event initialisiert (analog
  // PersonForm/FamilyForm's untrack(...)-Muster, TST-10) — kein fortlaufendes Re-Sync,
  // falls appState.db während des Editierens wechselt. Aufrufer mounten dieses Modal
  // ohnehin frisch pro Öffnen (kein bestehender Modal-Instanz-Wiederverwendungs-Pfad).
  let editable = $state<EditableEvent>(untrack(() => toEditable('modal-event', event, appState.placeContext)));
  let deathCause = $state(untrack(() => cause ?? ''));

  const showAddr = $derived(HOF_EVENT_TYPES.has(editable.type));
  /** Analog PersonForm/FamilyForm: EVEN/FACT haben keine eigene Tag-Bedeutung — der freie
   *  TYPE-Text (`eventType`) trägt die eigentliche fachliche Beschriftung UND entscheidet
   *  (über `eventCategory`'s CATEGORY_BY_CUSTOM_TEXT) mit über die Kategorie-Gruppierung
   *  in PersonDetail — dieses Feld fehlt zu lassen wäre ein stiller Feld-Verlust (TST-9). */
  const showTypeText = $derived(editable.type === 'EVEN' || editable.type === 'FACT');

  function pickPlaceFor(placeId: string): void {
    sharedPickPlaceFor(appState, editable, placeId);
  }

  function pickHofFor(hofId: string): void {
    sharedPickHofFor(appState, editable, hofId);
  }

  const sources = $derived(Array.from(appState.db.sources.values()));

  function addCitation() {
    if (sources.length === 0) return;
    editable.citations = [...editable.citations, makeCitation(sources[0].id)];
  }

  function removeCitation(index: number) {
    editable.citations = editable.citations.filter((_, i) => i !== index);
  }

  function setCitationSource(index: number, sourceId: string) {
    editable.citations = editable.citations.map((c, i) => (i === index ? { ...c, sourceId } : c));
  }

  function setCitationPage(index: number, page: string) {
    editable.citations = editable.citations.map((c, i) => (i === index ? { ...c, page } : c));
  }

  function setCitationNote(index: number, note: string) {
    editable.citations = editable.citations.map((c, i) => (i === index ? { ...c, note } : c));
  }

  function setCitationQuayAt(index: number, quay: Quay) {
    editable.citations = editable.citations.map((c, i) => (i === index ? setCitationQuay(c, quay) : c));
  }

  function save() {
    const updated = fromEditable(event, editable);
    onSave(updated, deathCause.trim());
  }

  function onBackdropKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onBackdropKeydown} />

<!-- Backdrop ist rein dekorativ/Maus-Komfort (Klick außerhalb schließt) — die
     Tastatur-taugliche Entsprechung ist der globale Escape-Handler oben (svelte:window),
     nicht ein zweiter Handler auf diesem <div>. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="event-edit-modal__backdrop" onclick={onClose} role="presentation">
  <div
    class="event-edit-modal__panel"
    onclick={(e) => e.stopPropagation()}
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label={`${label} bearbeiten`}
  >
    <div class="event-edit-modal__head">
      <h3>{label} bearbeiten</h3>
      <button type="button" class="event-edit-modal__close-btn" onclick={onClose} aria-label="Schließen">✕</button>
    </div>

    <div class="event-edit-modal__date-row">
      <select
        aria-label="Datums-Qualifier"
        value={editable.dateQualifier}
        onchange={(e) => {
          editable.dateQualifier = (e.currentTarget as HTMLSelectElement).value as EditableEvent['dateQualifier'];
          markDateDirty(editable);
        }}
      >
        {#each QUALIFIER_OPTIONS as q (q.value)}
          <option value={q.value}>{q.label}</option>
        {/each}
      </select>
      <input
        type="number"
        placeholder="Tag"
        aria-label="Tag"
        value={editable.day ?? ''}
        onchange={(e) => {
          const v = (e.currentTarget as HTMLInputElement).value;
          editable.day = v === '' ? null : Number(v);
          markDateDirty(editable);
        }}
        class="event-edit-modal__day"
      />
      <input
        type="text"
        placeholder="Monat"
        aria-label="Monat"
        value={editable.month ?? ''}
        onchange={(e) => onMonthBlur(editable, 'month', (e.currentTarget as HTMLInputElement).value)}
      />
      <input
        type="number"
        placeholder="Jahr"
        aria-label="Jahr"
        value={editable.year ?? ''}
        onchange={(e) => {
          const v = (e.currentTarget as HTMLInputElement).value;
          editable.year = v === '' ? null : Number(v);
          markDateDirty(editable);
        }}
        class="event-edit-modal__year"
      />
      {#if editable.dateQualifier === 'BET' || editable.dateQualifier === 'FROM'}
        <span class="event-edit-modal__muted">{editable.dateQualifier === 'BET' ? 'und' : 'bis'}</span>
        <input
          type="number"
          placeholder="Tag"
          aria-label="Tag (Ende)"
          value={editable.day2 ?? ''}
          onchange={(e) => {
            const v = (e.currentTarget as HTMLInputElement).value;
            editable.day2 = v === '' ? null : Number(v);
            markDateDirty(editable);
          }}
          class="event-edit-modal__day"
        />
        <input
          type="text"
          placeholder="Monat"
          aria-label="Monat (Ende)"
          value={editable.month2 ?? ''}
          onchange={(e) => onMonthBlur(editable, 'month2', (e.currentTarget as HTMLInputElement).value)}
        />
        <input
          type="number"
          placeholder="Jahr"
          aria-label="Jahr (Ende)"
          value={editable.year2 ?? ''}
          onchange={(e) => {
            const v = (e.currentTarget as HTMLInputElement).value;
            editable.year2 = v === '' ? null : Number(v);
            markDateDirty(editable);
          }}
          class="event-edit-modal__year"
        />
      {/if}
    </div>

    {#if showTypeText}
      <label>
        Typ-Freitext (TYPE)
        <input type="text" bind:value={editable.eventType} />
      </label>
    {/if}

    <label>
      Ort (Freitext)
      <EventPlaceField
        {appState}
        value={editable.place}
        onTextChange={(v) => {
          editable.place = v;
          editable.placeDirty = true;
        }}
        onPick={(placeId) => pickPlaceFor(placeId)}
        label={`${label} Ort`}
      />
    </label>

    {#if showAddr}
      <label>
        Adresse
        <EventAddrField
          {appState}
          value={editable.addr}
          onTextChange={(v) => (editable.addr = v)}
          onPick={(hofId) => pickHofFor(hofId)}
          villageId={editable.placeId}
          label={`${label} Adresse`}
        />
      </label>
    {/if}

    <label>
      Wert
      <input type="text" bind:value={editable.value} placeholder="z. B. Beruf bei OCCU" />
    </label>

    {#if cause != null}
      <label>
        Todesursache
        <input type="text" bind:value={deathCause} />
      </label>
    {/if}

    <label>
      Notiz
      <textarea bind:value={editable.note}></textarea>
    </label>

    <div class="event-edit-modal__citations">
      <div class="event-edit-modal__citations-head">
        <h5>Quellen</h5>
        <button type="button" class="event-edit-modal__add-citation-btn" onclick={addCitation} disabled={sources.length === 0}>
          + Quelle hinzufügen
        </button>
      </div>
      {#each editable.citations as cit, i (i)}
        <SourceCitationRow
          {appState}
          citation={cit}
          index={i}
          labelPrefix={label}
          onSourceChange={(id) => setCitationSource(i, id)}
          onPageChange={(page) => setCitationPage(i, page)}
          onQuayChange={(quay) => setCitationQuayAt(i, quay)}
          onNoteChange={(note) => setCitationNote(i, note)}
          onRemove={() => removeCitation(i)}
        />
      {/each}
    </div>

    <div class="event-edit-modal__actions">
      <button type="button" class="event-edit-modal__save-btn" onclick={save}>Speichern</button>
      <button type="button" class="event-edit-modal__cancel-btn" onclick={onClose}>Abbrechen</button>
    </div>
  </div>
</div>

<style>
  .event-edit-modal__backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 1.5rem 1rem;
    overflow-y: auto;
    z-index: 100;
  }

  .event-edit-modal__panel {
    background: var(--stb-surface-1);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-card);
    padding: 1rem;
    max-width: 32rem;
    width: 100%;
  }

  .event-edit-modal__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .event-edit-modal__head h3 {
    margin: 0;
    font-size: 1rem;
    color: var(--stb-gold-light);
  }

  .event-edit-modal__close-btn {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
    font-size: 1rem;
    padding: 0;
  }

  .event-edit-modal__panel label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.8rem;
    color: var(--stb-text-dim);
    margin-top: 0.5rem;
  }

  .event-edit-modal__date-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
    margin-top: 0.6rem;
  }

  /* Feste/begrenzte Feldbreiten (INV-UI-5, ADR-v9-30 Punkt 4 Nachtrag — identische Werte
     wie PersonForm.svelte/FamilyForm.svelte, dort ausführlich per preview_resize(mobile)
     auf 375px verifiziert): Qualifier(5.5rem)+Tag(3.2rem)+Monat(3.6rem)+Jahr(3.2rem) + 3
     Gaps passen auf die primäre Mobile-Zielbreite in eine Zeile. */
  .event-edit-modal__date-row select {
    flex: 0 1 5.5rem;
    min-width: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
  }

  .event-edit-modal__date-row input[type='text'] {
    width: 3.6rem;
    flex: 0 0 auto;
  }

  .event-edit-modal__day,
  .event-edit-modal__year {
    width: 3.2rem;
    flex: 0 0 auto;
  }

  .event-edit-modal__date-row input[type='number'] {
    padding-left: 0.3rem;
    padding-right: 0.2rem;
  }

  .event-edit-modal__muted {
    color: var(--stb-text-dim);
    font-size: 0.82rem;
  }

  .event-edit-modal__citations {
    margin-top: 0.6rem;
  }

  .event-edit-modal__citations-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.3rem;
  }

  .event-edit-modal__citations h5 {
    font-size: 0.8rem;
    color: var(--stb-text-dim);
    margin: 0;
  }

  .event-edit-modal__add-citation-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    font-size: 0.82rem;
  }

  .event-edit-modal__add-citation-btn:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .event-edit-modal__actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 1.1rem;
  }

  .event-edit-modal__save-btn,
  .event-edit-modal__cancel-btn {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.45rem 1rem;
    cursor: pointer;
    font-weight: 600;
  }

  .event-edit-modal__cancel-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
  }
</style>
