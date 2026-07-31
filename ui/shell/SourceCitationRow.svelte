<script lang="ts">
  // ui/shell/SourceCitationRow.svelte — kompakte EIN-Zeilen-Darstellung einer Quellen-
  // Zitation (Citation) an einem Ereignis/einer Familie (INV-UI-4, INV-UI-5). Ersetzt das
  // bisherige 3-Zeilen-Layout in PersonForm.svelte/FamilyForm.svelte (1: große Karte für
  // die Quelle im vollen Entitäts-Picker-Kartenstil `.stb-person-box`, 2: Seite+QUAY-
  // Zeile, 3: Notiz+Entfernen-Zeile) durch EINE flex-wrap-Zeile: Quellenname als Text-Link
  // + Seite + QUAY + Notiz + ✕ — analog dem etablierten kompakten Zeilen-Muster
  // (`.person-detail__event-head`, PersonDetail.svelte: display:flex, flex-wrap:wrap,
  // align-items, gap — kein neues Muster erfunden, INV-UI-4).
  //
  // Der Quellenname-Link übernimmt exakt die bisherige Karten-Klick-Funktion (Quelle
  // wechseln ODER inline neu anlegen) — direkt über die generische Picker-Shell komponiert
  // (analog EventPlaceField.svelte/EventAddrField.svelte: eigener kompakter Auslöser +
  // `Picker.svelte` mit startOpen=true + Inline-SourceForm-Neuanlage), statt die
  // `SourcePicker.svelte`-Karte einzubetten (die für DIESEN dichten Zeilen-Kontext zu groß
  // ist — SourcePicker bleibt an anderer Stelle, z. B. Repository-/Aufgaben-Referenzfeld,
  // weiterhin der richtige Stil, INV-UI-4 "EIN Stil pro Kontext, nicht pro Datentyp").
  //
  // Chokepoint-Disziplin: liest appState.db.sources NUR lesend; jede Änderung läuft über
  // die vom Aufrufer übergebenen onX-Callbacks (PersonForm/FamilyForm bauen daraus das
  // volle Citation-Objekt und rufen appState.savePerson/saveFamily(model) — kein Feld-
  // Setter-Pattern hier).
  import type { AppState } from './app-state.svelte';
  import type {
    Source,
    Citation,
    Quay,
    EvidenceEval,
    EvidenceSource,
    EvidenceInformation,
    EvidenceEvidenceKind,
  } from '../../core/model/types';
  import { makeSource, allocatorFromDatabase, nextId, citationUrl } from '../../core/model';
  import { evalToQuay, isEvidenceEvalEmpty, makeEvidenceEval } from '../../core/research';
  import { matchesSearch } from '../views/source/source-list-model';
  import SourceForm from '../views/source/SourceForm.svelte';
  import Picker from './Picker.svelte';
  import { tooltip } from './tooltip';

  interface Props {
    appState: AppState;
    citation: Citation;
    /** 0-basierter Index innerhalb der Zitationsliste — für aria-labels ("Quelle 2" usw.),
     *  identisch zu den bisherigen, direkt in PersonForm/FamilyForm gebauten Labels. */
    index: number;
    /** Formular-Kontext-Präfix für aria-labels (z. B. "Geburt (BIRT)", "Familie"). */
    labelPrefix: string;
    onSourceChange: (sourceId: string) => void;
    onPageChange: (page: string) => void;
    onQuayChange: (quay: Quay) => void;
    onNoteChange: (note: string) => void;
    /** Weblink der Referenz (↗) — als OBJE/FILE-Medium gespeichert, s. core setCitationUrl. */
    onUrlChange: (url: string) => void;
    /**
     * Evidenz-Bewertung (Spec 20 §1.11c/12 §3) — volles `EvidenceEval`-Objekt oder `null`
     * (alle drei Achsen + Informant leer, s. `isEvidenceEvalEmpty`). Der Aufrufer baut daraus
     * die volle `Citation` (`{ ...citation, eval }`) und speichert über den vorhandenen
     * Chokepoint — kein Feld-Setter hier, exakt wie die übrigen onX-Callbacks.
     */
    onEvalChange: (evaluation: EvidenceEval | null) => void;
    onRemove: () => void;
  }
  const {
    appState,
    citation,
    index,
    labelPrefix,
    onSourceChange,
    onPageChange,
    onQuayChange,
    onNoteChange,
    onUrlChange,
    onEvalChange,
    onRemove,
  }: Props = $props();

  const url = $derived(citationUrl(citation));

  const sources = $derived(Array.from(appState.db.sources.values()));
  const selectedSource = $derived<Source | undefined>(sources.find((s) => s.id === citation.sourceId));

  function sourceLabel(s: Source): string {
    return s.abbr || s.title || s.id;
  }

  function sourceSubLabel(s: Source): string {
    return [s.author, s.date].filter(Boolean).join(' · ');
  }

  /** Wie Picker.svelte's Fallback (Zeile "value referenziert keinen Kandidaten..."): eine
   *  dangling sourceId wird als Rohwert gezeigt statt stillschweigend zu verschwinden
   *  (TST-9). */
  const displayLabel = $derived(selectedSource ? sourceLabel(selectedSource) : citation.sourceId);
  const displayTitle = $derived(selectedSource ? sourceSubLabel(selectedSource) : '');

  let panelOpen = $state(false);
  let creating = $state(false);
  let draft = $state<Source | null>(null);

  function togglePanel() {
    panelOpen = !panelOpen;
    creating = false;
  }

  function selectExisting(id: string | null) {
    if (id) onSourceChange(id);
    panelOpen = false;
  }

  /** Frisches Quellen-Gerüst mit kollisionsfreier id — exakt das SourcePicker.svelte-Muster. */
  function draftSource(): Source {
    const alloc = allocatorFromDatabase(appState.db);
    const id = nextId(alloc, 'S');
    return makeSource(id);
  }

  function beginCreate() {
    draft = draftSource();
    creating = true;
  }

  function onSourceCreated(id: string) {
    creating = false;
    panelOpen = false;
    draft = null;
    onSourceChange(id);
  }

  function cancelCreate() {
    creating = false;
    draft = null;
  }

  // --- Evidenz-Bewertung (Spec 20 §1.11c, Aufklapper hinter EINEM Auslöser) --------------
  // Drei Achsen + Informant leben an DIESER Zitat-Ereignis-Verknüpfung (nicht an der Quelle
  // selbst) — Citation.eval. `evalToQuay()` ist der Kern-Vorschlag (INV-C2/Spec 10 §5.3):
  // rein informativ, setzt QUAY NIE automatisch — nur der explizite "Übernehmen"-Klick tut das.
  let evalOpen = $state(false);

  const hasEval = $derived(!isEvidenceEvalEmpty(citation.eval));
  /** Arbeitswert für die drei Selects/den Informant-Input — leeres Gerüst, wenn noch keine
   *  Bewertung existiert (nie `citation.eval` selbst mutieren, s. `updateEvalAxis`). */
  const currentEval = $derived<EvidenceEval>(citation.eval ?? makeEvidenceEval());
  const suggestedQuay = $derived(hasEval ? evalToQuay(currentEval) : null);
  const suggestionDiffers = $derived(suggestedQuay !== null && suggestedQuay !== citation.quay);

  function toggleEval() {
    evalOpen = !evalOpen;
  }

  /** Baut aus dem aktuellen Arbeitswert + der geänderten Achse das VOLLE `EvidenceEval`-
   *  Objekt und meldet es nach oben — `null`, sobald keine Achse (und kein Informant) mehr
   *  gesetzt ist (isEvidenceEvalEmpty), damit der Writer später keinen leeren `_EVAL`-
   *  Subtree schreibt (Kern-Kommentar core/research/eval.ts). */
  function updateEvalAxis(patch: Partial<EvidenceEval>) {
    const merged: EvidenceEval = { ...currentEval, ...patch };
    onEvalChange(isEvidenceEvalEmpty(merged) ? null : merged);
  }

  function applySuggestedQuay() {
    if (suggestedQuay !== null) onQuayChange(suggestedQuay);
  }
</script>

<div class="source-citation-row">
  <button
    type="button"
    class="source-citation-row__source-link"
    aria-label={`${labelPrefix} Quelle ${index + 1}`}
    use:tooltip={displayTitle}
    onclick={togglePanel}
  >
    {displayLabel}
  </button>
  <input
    type="text"
    class="source-citation-row__page"
    placeholder="Seite"
    aria-label={`${labelPrefix} Seite ${index + 1}`}
    value={citation.page}
    onchange={(e) => onPageChange((e.currentTarget as HTMLInputElement).value)}
  />
  <select
    class="source-citation-row__quay"
    aria-label={`${labelPrefix} Zuverlässigkeit ${index + 1}`}
    value={String(citation.quay)}
    onchange={(e) => onQuayChange(Number((e.currentTarget as HTMLSelectElement).value) as Quay)}
  >
    <option value="0">QUAY 0</option>
    <option value="1">QUAY 1</option>
    <option value="2">QUAY 2</option>
    <option value="3">QUAY 3</option>
  </select>
  <!-- Ein Auslöser für die Evidenz-Bewertung (⚖, Spec 20 §1.11c) — kein Dauer-Bedienelement
       für die Achsen selbst, keine zweite Badge-Fundstelle (ADR-v9-98): der Zustand
       ("bewertet?") steckt in genau diesem EINEN Toggle, nicht in einer separaten Zahl. -->
  <button
    type="button"
    class="source-citation-row__eval-toggle"
    class:source-citation-row__eval-toggle--active={hasEval}
    aria-expanded={evalOpen}
    aria-label={`${labelPrefix} Quelle ${index + 1} Bewertung ${hasEval ? 'bearbeiten' : 'hinzufügen'}`}
    use:tooltip={hasEval ? 'Evidenz bewertet' : 'Evidenz bewerten'}
    onclick={toggleEval}
  >
    ⚖
  </button>
  <input
    type="text"
    class="source-citation-row__note"
    placeholder="Notiz"
    aria-label={`${labelPrefix} Notiz ${index + 1}`}
    value={citation.note}
    onchange={(e) => onNoteChange((e.currentTarget as HTMLInputElement).value)}
  />
  <input
    type="url"
    class="source-citation-row__url"
    placeholder="Weblink (https://…)"
    aria-label={`${labelPrefix} Weblink ${index + 1}`}
    value={url}
    onchange={(e) => onUrlChange((e.currentTarget as HTMLInputElement).value)}
  />
  <button
    type="button"
    class="source-citation-row__remove-btn"
    onclick={onRemove}
    aria-label={`${labelPrefix} Quelle ${index + 1} entfernen`}
  >
    ✕
  </button>
</div>
{#if panelOpen}
  <div class="source-citation-row__panel">
    {#if creating && draft}
      <SourceForm {appState} source={draft} onSaved={onSourceCreated} onCancel={cancelCreate} />
    {:else}
      <Picker
        items={sources}
        getId={(s) => s.id}
        getLabel={sourceLabel}
        getSubLabel={sourceSubLabel}
        matches={matchesSearch}
        value={citation.sourceId}
        onChange={selectExisting}
        label={`${labelPrefix} Quelle ${index + 1} auswählen`}
        placeholder="Quelle suchen…"
        createLabel="+ Neue Quelle anlegen …"
        onCreateRequested={beginCreate}
        startOpen={true}
      />
    {/if}
  </div>
{/if}
{#if evalOpen}
  <div class="source-citation-row__eval-panel">
    <label class="source-citation-row__eval-field">
      <span>Quellentyp</span>
      <select
        aria-label={`${labelPrefix} Quelle ${index + 1} Quellentyp`}
        value={currentEval.source}
        onchange={(e) =>
          updateEvalAxis({ source: (e.currentTarget as HTMLSelectElement).value as EvidenceSource })}
      >
        <option value="">—</option>
        <option value="original">Original</option>
        <option value="derivative">Abschrift</option>
        <option value="authored">Autorenwerk</option>
      </select>
    </label>
    <label class="source-citation-row__eval-field">
      <span>Information</span>
      <select
        aria-label={`${labelPrefix} Quelle ${index + 1} Information`}
        value={currentEval.information}
        onchange={(e) =>
          updateEvalAxis({
            information: (e.currentTarget as HTMLSelectElement).value as EvidenceInformation,
          })}
      >
        <option value="">—</option>
        <option value="primary">primär</option>
        <option value="secondary">sekundär</option>
        <option value="undetermined">unbestimmt</option>
      </select>
    </label>
    <label class="source-citation-row__eval-field">
      <span>Evidenz</span>
      <select
        aria-label={`${labelPrefix} Quelle ${index + 1} Evidenz`}
        value={currentEval.evidence}
        onchange={(e) =>
          updateEvalAxis({
            evidence: (e.currentTarget as HTMLSelectElement).value as EvidenceEvidenceKind,
          })}
      >
        <option value="">—</option>
        <option value="direct">direkt</option>
        <option value="indirect">indirekt</option>
        <option value="negative">negativ</option>
      </select>
    </label>
    <label class="source-citation-row__eval-field">
      <span>Informant</span>
      <input
        type="text"
        placeholder="wer hat berichtet?"
        aria-label={`${labelPrefix} Quelle ${index + 1} Informant`}
        value={currentEval.informant ?? ''}
        onchange={(e) => updateEvalAxis({ informant: (e.currentTarget as HTMLInputElement).value })}
      />
    </label>
    {#if hasEval}
      <div class="source-citation-row__eval-suggestion">
        <span
          class="source-citation-row__eval-suggestion-text"
          class:source-citation-row__eval-suggestion-text--differs={suggestionDiffers}
        >
          Vorschlag: QUAY {suggestedQuay}{suggestionDiffers ? ' (aktuell abweichend)' : ''}
        </span>
        <button type="button" class="source-citation-row__eval-apply" onclick={applySuggestedQuay}>
          Übernehmen
        </button>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* EIN flex-wrap-Zeilen-Muster analog PersonDetail.svelte .person-detail__event-head —
     kein margin-left:auto (TST-11-Falle: der Entfernen-Button ist nicht garantiert das
     letzte Element in der Zeile, sobald sie umbricht). */
  .source-citation-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.35rem;
  }

  .source-citation-row__source-link {
    background: transparent;
    border: none;
    color: var(--stb-gold-light);
    text-decoration: underline;
    cursor: pointer;
    font: inherit;
    padding: 0;
    max-width: 11rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .source-citation-row__source-link:hover,
  .source-citation-row__source-link:focus-visible {
    color: var(--stb-gold);
  }

  .source-citation-row input,
  .source-citation-row select {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.4rem;
    font: inherit;
    font-size: 0.85rem;
  }

  .source-citation-row__page {
    width: 4.6rem;
    flex: 0 0 auto;
  }

  .source-citation-row__quay {
    flex: 0 1 6.5rem;
    min-width: 0;
  }

  .source-citation-row__note {
    flex: 1 1 8rem;
    min-width: 6rem;
  }

  .source-citation-row__url {
    flex: 1 1 9rem;
    min-width: 6rem;
  }

  .source-citation-row__remove-btn {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
    font-size: 0.8rem;
    flex: 0 0 auto;
  }

  .source-citation-row__panel {
    margin-bottom: 0.5rem;
  }

  /* Evidenz-Aufklapper (Spec 20 §1.11c) — EIN Auslöser, keine Dauer-Achsen-Felder in der
     Zeile selbst (INV-UI-5). Explizite Trefferfläche (ADR-v9-169: der Wächter fängt nur
     zu kleine EXPLIZITE Werte, nicht fehlende — hier bewusst gesetzt + im Browser gemessen). */
  .source-citation-row__eval-toggle {
    background: transparent;
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    color: var(--stb-text-dim);
    cursor: pointer;
    font-size: 0.95rem;
    line-height: 1;
    flex: 0 0 auto;
    min-width: var(--stb-touch-target);
    min-height: var(--stb-touch-target);
  }

  .source-citation-row__eval-toggle--active {
    color: var(--stb-gold-light);
    border-color: var(--stb-gold-light);
  }

  .source-citation-row__eval-panel {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.6rem;
    margin: 0 0 0.6rem 0;
    padding: 0.5rem 0.6rem;
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
  }

  .source-citation-row__eval-field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.75rem;
    color: var(--stb-text-dim);
  }

  .source-citation-row__eval-field input,
  .source-citation-row__eval-field select {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.4rem;
    font: inherit;
    font-size: 0.85rem;
    min-height: var(--stb-touch-target);
  }

  .source-citation-row__eval-suggestion {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: var(--stb-text-dim);
  }

  .source-citation-row__eval-suggestion-text--differs {
    color: var(--stb-gold-light);
    font-weight: 600;
  }

  .source-citation-row__eval-apply {
    background: transparent;
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    color: var(--stb-gold-light);
    cursor: pointer;
    padding: 0.3rem 0.6rem;
    font-size: 0.8rem;
    min-height: var(--stb-touch-target);
  }
</style>
