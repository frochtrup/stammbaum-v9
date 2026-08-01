<script lang="ts">
  // ui/views/media/MediaDetail.svelte — Medium-Detail (Spec 20 §1.4 [S] "② Medium-Detail"
  // + "③ Referenzliste"). Zwei Feldgruppen im Toggle-Formular-Muster (ADR-v9-30, wie
  // Ort/Hof): GLOBALE Felder (Datei/Format/Typ/Titel, gelten für ALLE Referenzen —
  // "Speichern (alle Ref.)", schreibt am Media-Record) vs. REFERENZ-SPEZIFISCHE Felder
  // (Titel-Override/Aufnahmedatum/Notiz/Primärbild, gelten nur für die angetippte
  // Referenzzeile — eigenes "Speichern"; leerer Override ⇒ globaler Titel).
  //
  // Verknüpfen (③): "+ Person/+ Familie/+ Quelle" nutzt den bestehenden Picker (INV-UI-4),
  // keine eigene Such-Konstruktion. Familien-Medien hängen laut Modell (Spec 10 §4) am
  // HEIRATS-Ereignis (f.marriage.media), nicht an einem Familien-Top-Level-Feld — der
  // Familien-Zweig editiert daher marriage, nicht die Familie selbst.
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import DetailHeader from '../../shell/DetailHeader.svelte';
  import DeleteEntityButton from '../../shell/DeleteEntityButton.svelte';
  import EventsByType from '../../shell/EventsByType.svelte';
  import PersonPicker from '../../shell/PersonPicker.svelte';
  import FamilyPicker from '../../shell/FamilyPicker.svelte';
  import SourcePicker from '../../shell/SourcePicker.svelte';
  import {
    makeMediaCitation,
    withAddedMediaCitation,
    withRemovedMediaCitation,
    withUpdatedMediaCitation,
  } from '../../../core/model';
  import type { MediaCitation } from '../../../core/model/types';
  import { buildMediaDetail, type MediaReferenceRow } from './media-detail-model';
  import { classifyMediaFile, isImageMedia, webLinkHost } from '../../../core/model/media-kind';
  import MediaThumb from '../../shell/MediaThumb.svelte';
  import type { MediaResolver } from '../../../services/media';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    onNavigateToPerson: (personId: string) => void;
    onNavigateToFamily: (familyId: string) => void;
    onNavigateToSource: (sourceId: string) => void;
    onBack?: () => void;
    /** Medien-Auflösung (BL-258) — ohne sie bleibt es bei eingebetteten Bildern. */
    mediaResolver?: MediaResolver;
  }
  const {
    appState,
    viewState,
    onNavigateToPerson,
    onNavigateToFamily,
    onNavigateToSource,
    onBack,
    mediaResolver,
  }: Props = $props();

  const mediaId = $derived(viewState.getCurrent('media'));
  const detail = $derived(mediaId ? buildMediaDetail(appState.db, mediaId) : null);

  // — Globale Feldgruppe (② oben) —
  let editingGlobal = $state(false);
  let gFile = $state('');
  let gForm = $state('');
  let gType = $state('');
  let gTitle = $state('');

  function startEditGlobal() {
    const m = detail?.media;
    if (!m) return;
    gFile = m.file;
    gForm = m.form;
    gType = m.type;
    gTitle = m.title;
    editingGlobal = true;
  }

  function saveGlobal() {
    const m = detail?.media;
    if (!m) return;
    appState.saveMedia({ ...m, file: gFile.trim(), form: gForm.trim(), type: gType.trim(), title: gTitle.trim() });
    editingGlobal = false;
  }

  // — Referenzen (③): verknüpfen —
  let adding = $state<'person' | 'family' | 'source' | null>(null);

  function alreadyLinked(cits: readonly MediaCitation[], id: string): boolean {
    return cits.some((c) => c.mediaId === id);
  }

  function linkPerson(personId: string | null) {
    adding = null;
    const m = detail?.media;
    if (!personId || !m) return;
    const p = appState.db.individuals.get(personId);
    if (!p || alreadyLinked(p.media, m.id)) return;
    appState.savePerson(withAddedMediaCitation(p, makeMediaCitation(m.id)));
  }

  function linkFamily(familyId: string | null) {
    adding = null;
    const m = detail?.media;
    if (!familyId || !m) return;
    const f = appState.db.families.get(familyId);
    if (!f || alreadyLinked(f.marriage.media, m.id)) return;
    appState.saveFamily({ ...f, marriage: withAddedMediaCitation(f.marriage, makeMediaCitation(m.id)) });
  }

  function linkSource(sourceId: string | null) {
    adding = null;
    const m = detail?.media;
    if (!sourceId || !m) return;
    const s = appState.db.sources.get(sourceId);
    if (!s || alreadyLinked(s.media, m.id)) return;
    appState.saveSource(withAddedMediaCitation(s, makeMediaCitation(m.id)));
  }

  function removeRef(row: MediaReferenceRow) {
    const m = detail?.media;
    if (!m) return;
    if (row.ownerKind === 'person') {
      const p = appState.db.individuals.get(row.ownerId);
      if (p) appState.savePerson(withRemovedMediaCitation(p, m.id));
    } else if (row.ownerKind === 'source') {
      const s = appState.db.sources.get(row.ownerId);
      if (s) appState.saveSource(withRemovedMediaCitation(s, m.id));
    } else if (row.ownerKind === 'family') {
      const f = appState.db.families.get(row.ownerId);
      if (f) appState.saveFamily({ ...f, marriage: withRemovedMediaCitation(f.marriage, m.id) });
    }
  }

  // — Per-Ref-Formular —
  let editingKey = $state<string | null>(null);
  let rTitle = $state('');
  let rDate = $state('');
  let rNote = $state('');
  let rPrimary = $state(false);

  function startEditRef(row: MediaReferenceRow) {
    rTitle = row.citation.title;
    rDate = row.citation.date;
    rNote = row.citation.note;
    rPrimary = row.citation.primary;
    editingKey = row.key;
  }

  function saveRef(row: MediaReferenceRow) {
    const m = detail?.media;
    if (!m) return;
    const patch = { title: rTitle.trim(), date: rDate.trim(), note: rNote.trim(), primary: rPrimary };
    if (row.ownerKind === 'person') {
      const p = appState.db.individuals.get(row.ownerId);
      if (p) appState.savePerson(withUpdatedMediaCitation(p, m.id, patch));
    } else if (row.ownerKind === 'source') {
      const s = appState.db.sources.get(row.ownerId);
      if (s) appState.saveSource(withUpdatedMediaCitation(s, m.id, patch));
    } else if (row.ownerKind === 'family') {
      const f = appState.db.families.get(row.ownerId);
      if (f) appState.saveFamily({ ...f, marriage: withUpdatedMediaCitation(f.marriage, m.id, patch) });
    }
    editingKey = null;
  }

  const OWNER_ICONS: Record<string, string> = { person: '👤', family: '👪', source: '📜', event: '📅', citation: '§' };

  function jumpTo(row: MediaReferenceRow) {
    if (row.ownerKindForNav === 'person') onNavigateToPerson(row.ownerId);
    else if (row.ownerKindForNav === 'family') onNavigateToFamily(row.ownerId);
    else onNavigateToSource(row.ownerId);
  }

  /** Anzeige der „Datei"-Zeile: ein eingebetteter `data:`-URI wäre roh eine tausende
   *  Zeichen lange Zeichenkette — stattdessen ein knappes „eingebettet (MIME)". */
  function fileLabel(file: string): string {
    const m = /^data:([^;,]+)[;,]/i.exec(file.trim());
    return m ? `eingebettet (${m[1]})` : file || '—';
  }

  // Art des Werts aus dem EINEN Kern-Chokepoint (ADR-v9-187). Vorher entschied diese
  // View selbst — und kannte nur `data:`; ein Weblink (der häufigste Fall im Bestand)
  // stand hier als toter Text, obwohl derselbe Wert an der Quellen-Pille längst ein
  // klickbares ↗ trägt.
  const fileKind = $derived(detail ? classifyMediaFile(detail.media.file) : 'empty');
  const linkHost = $derived(detail ? webLinkHost(detail.media.file) : '');
</script>

{#snippet refRow(row: MediaReferenceRow)}
  <span class="media-detail__ref-icon" aria-hidden="true">{OWNER_ICONS[row.ownerKind] ?? '•'}</span>
  <button type="button" class="media-detail__ref-owner" onclick={() => jumpTo(row)}>
    {row.ownerLabel} <span class="media-detail__ref-ctx">{row.context}</span> ↗
  </button>
  {#if row.citation.primary}<span class="stb-pill media-detail__prim">Primär</span>{/if}
  {#if row.editable}
    <span class="media-detail__ref-actions">
      <button type="button" class="media-detail__ref-btn" onclick={() => startEditRef(row)} aria-label="Referenz bearbeiten">✎</button>
      <button type="button" class="media-detail__ref-btn" onclick={() => removeRef(row)} aria-label="Referenz entfernen">✕</button>
    </span>
  {/if}
  {#if editingKey === row.key}
    <div class="media-detail__ref-form">
      <label>Titel-Override <input type="text" placeholder="(leer ⇒ globaler Titel)" bind:value={rTitle} /></label>
      <label>Aufnahmedatum <input type="text" bind:value={rDate} /></label>
      <label>Notiz <input type="text" bind:value={rNote} /></label>
      <label class="media-detail__ref-prim"><input type="checkbox" bind:checked={rPrimary} /> Primärbild/-dokument</label>
      <div class="media-detail__ref-form-actions">
        <button type="button" class="media-detail__save-btn" onclick={() => saveRef(row)}>Speichern</button>
        <button type="button" class="media-detail__cancel-btn" onclick={() => (editingKey = null)}>Abbrechen</button>
      </div>
    </div>
  {/if}
{/snippet}

<div class="media-detail">
  {#if !mediaId}
    <p class="media-detail__empty">Kein Medium ausgewählt.</p>
  {:else if !detail}
    <p class="media-detail__empty">Medium nicht gefunden (evtl. gelöscht oder Datei gewechselt).</p>
  {:else}
    <!-- `backAlways`: die Galerie belegt in beiden Formfaktoren die volle Fläche und wird
         von diesem Detail ERSETZT (ADR-v9-192) — der Rückweg darf hier auch auf Desktop
         nicht fehlen, anders als bei den Multi-Pane-Segmenten. -->
    <DetailHeader title={detail.displayTitle} onBack={onBack ?? (() => {})} backAlways>
      {#snippet actions()}
        {#if !editingGlobal}
          <button type="button" class="media-detail__edit-btn" onclick={startEditGlobal}>✎ Bearbeiten</button>
        {/if}
      {/snippet}
    </DetailHeader>

    {#if editingGlobal}
      <div class="media-detail__global-form">
        <label>Titel <input type="text" bind:value={gTitle} /></label>
        <label>Dateipfad <input type="text" bind:value={gFile} /></label>
        <label>Format (MIME) <input type="text" bind:value={gForm} /></label>
        <label>Medientyp <input type="text" bind:value={gType} /></label>
        <div class="media-detail__form-actions">
          <button type="button" class="media-detail__save-btn" onclick={saveGlobal}>Speichern (alle Ref.)</button>
          <button type="button" class="media-detail__cancel-btn" onclick={() => (editingGlobal = false)}>Abbrechen</button>
        </div>
      </div>
    {:else}
      {#if fileKind !== 'weblink' && isImageMedia(detail.media.file, detail.media.form)}
        <figure class="media-detail__preview">
          <MediaThumb
            file={detail.media.file}
            form={detail.media.form}
            alt={detail.displayTitle}
            resolver={mediaResolver}
            size="large"
          />
        </figure>
      {/if}
      <dl class="media-detail__meta">
        <dt>{fileKind === 'weblink' ? 'Fundort' : 'Datei'}</dt>
        <dd>
          {#if fileKind === 'weblink'}
            <!-- Verlinkt, NIE geladen (ADR-v9-187): kein Fetch für Vorschau oder Ausgabe.
                 `rel` wie bei jedem anderen Fremdlink der App. -->
            <a
              class="media-detail__link"
              href={detail.media.file}
              target="_blank"
              rel="noopener noreferrer"
            >{linkHost || detail.media.file} ↗</a>
            <span class="media-detail__link-full">{detail.media.file}</span>
          {:else}
            {fileLabel(detail.media.file)}
          {/if}
        </dd>
        {#if detail.media.form}<dt>Format</dt><dd>{detail.media.form}</dd>{/if}
        {#if detail.media.type}<dt>Typ</dt><dd>{detail.media.type}</dd>{/if}
      </dl>
    {/if}

    <section class="media-detail__section">
      <h3>Referenzen ({detail.references.length})</h3>
      <div class="media-detail__add-row">
        <button type="button" class="media-detail__add-btn" onclick={() => (adding = 'person')}>+ Person</button>
        <button type="button" class="media-detail__add-btn" onclick={() => (adding = 'family')}>+ Familie</button>
        <button type="button" class="media-detail__add-btn" onclick={() => (adding = 'source')}>+ Quelle</button>
      </div>
      {#if adding === 'person'}
        <PersonPicker {appState} value={null} onChange={linkPerson} allowCreate={false} startOpen onClose={() => (adding = null)} />
      {:else if adding === 'family'}
        <FamilyPicker {appState} value={null} onChange={linkFamily} startOpen onClose={() => (adding = null)} />
      {:else if adding === 'source'}
        <SourcePicker {appState} value={null} onChange={linkSource} startOpen onClose={() => (adding = null)} />
      {/if}

      {#if detail.references.length === 0}
        <p class="media-detail__muted">Keine Person/Familie/Quelle referenziert dieses Medium.</p>
      {:else}
        <EventsByType groups={detail.referencesByType} row={refRow} resetKey={mediaId} />
      {/if}
    </section>

    <DeleteEntityButton
      label="Medium löschen"
      message={`Medium „${detail.displayTitle}" wirklich löschen? Alle Verknüpfungen (Person/Familie/Quelle/Ereignis) werden entfernt.`}
      onConfirm={() => {
        appState.deleteMedia(detail.media.id);
        editingGlobal = false;
        onBack?.();
      }}
    />
  {/if}
</div>

<style>
  .media-detail {
    padding: 1rem;
    overflow-y: auto;
  }

  .media-detail__empty,
  .media-detail__muted {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
  }

  .media-detail__edit-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    font-size: 0.82rem;
  }

  .media-detail__link {
    color: var(--stb-gold);
    overflow-wrap: anywhere;
  }

  /* Die volle Adresse bleibt lesbar (kopierbar), tritt aber optisch zurück — der Host
     allein trägt die Orientierung, die volle URL ist bei matricula & Co. sehr lang. */
  .media-detail__link-full {
    display: block;
    font-size: 0.72rem;
    color: var(--stb-text-dim);
    overflow-wrap: anywhere;
  }

  .media-detail__preview {
    margin: 0.75rem 0;
    text-align: center;
  }


  .media-detail__meta {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.2rem 0.75rem;
    margin: 0.75rem 0;
    font-size: 0.88rem;
  }

  .media-detail__meta dt {
    color: var(--stb-text-muted);
  }

  .media-detail__meta dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .media-detail__global-form,
  .media-detail__ref-form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0.75rem 0;
  }

  .media-detail__ref-form {
    flex-basis: 100%;
    background: var(--stb-surface-2);
    border-radius: var(--stb-radius-control);
    padding: 0.6rem;
    margin-top: 0.4rem;
  }

  .media-detail__global-form label,
  .media-detail__ref-form label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.78rem;
    color: var(--stb-text-muted);
  }

  .media-detail__global-form input[type='text'],
  .media-detail__ref-form input[type='text'] {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.5rem;
    font-size: 0.85rem;
  }

  .media-detail__ref-prim {
    flex-direction: row;
    align-items: center;
    gap: 0.4rem;
  }

  .media-detail__form-actions,
  .media-detail__ref-form-actions {
    display: flex;
    gap: 0.5rem;
  }

  .media-detail__save-btn {
    background: var(--stb-gold);
    color: var(--stb-bg);
    font-weight: 600;
    border: 1px solid var(--stb-gold);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    font-size: 0.82rem;
  }

  .media-detail__cancel-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    font-size: 0.82rem;
  }

  .media-detail__section {
    margin-top: 1.25rem;
  }

  .media-detail__section h3 {
    font-size: 0.95rem;
    color: var(--stb-gold-light);
    margin-bottom: 0.4rem;
  }

  .media-detail__add-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-bottom: 0.5rem;
  }

  .media-detail__add-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.25rem 0.6rem;
    cursor: pointer;
    font-size: 0.8rem;
  }

  .media-detail__ref-icon {
    font-size: 0.85rem;
  }

  .media-detail__ref-owner {
    background: transparent;
    border: none;
    color: var(--stb-gold-light);
    cursor: pointer;
    padding: 0;
    font-size: 0.85rem;
    font-weight: 600;
    text-align: left;
  }

  .media-detail__ref-ctx {
    color: var(--stb-text-dim);
    font-weight: 400;
  }

  .media-detail__prim {
    font-size: 0.68rem;
  }

  .media-detail__ref-actions {
    margin-left: auto;
    display: inline-flex;
    gap: 0.3rem;
  }

  .media-detail__ref-btn {
    background: transparent;
    border: 1px solid var(--stb-gold-dim);
    color: var(--stb-text-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.1rem 0.4rem;
    cursor: pointer;
    font-size: 0.75rem;
  }

  .media-detail__ref-btn:hover,
  .media-detail__ref-btn:focus-visible {
    color: var(--stb-gold);
    border-color: var(--stb-gold);
  }
</style>
