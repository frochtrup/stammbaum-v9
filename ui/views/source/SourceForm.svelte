<script lang="ts">
  // ui/views/source/SourceForm.svelte — Quellen-Editor (Spec 20 §2 Formular-Feldtabelle
  // "Quelle": Titel, Kurzname, Autor, "Erfasst am", Verlag, Archiv, Signatur, Notiz).
  // "Erfasst am" (ADR-v9-179) heisst bewusst nicht mehr "Datum": das Feld traegt eine
  // Eigenschaft des DATENSATZES (CREA/_DATE), nicht des Dokuments. Dessen Entstehung
  // fuehrt PUBL, den abgedeckten Zeitraum SOUR.DATA.EVEN.
  //
  // BL-128 (Spec 20 §1.6 [S] "Quellen-Vorlagen") ergänzt zwei Dinge: ① einen optionalen
  // Vorlagen-Picker, NUR beim Anlegen einer frischen Quelle sichtbar, der Kurzname/Titel/
  // Autor/Medientyp aus `core/model/source-templates.ts` vorbelegt (Preset+Freitext-
  // <datalist>-Mechanik wie TaskForm.svelte/PersonAssociations.svelte, INV-UI-4) — jedes
  // Feld bleibt danach frei editierbar, kein geschlossenes Enum. ② das bisher komplett
  // fehlende `callMedia`-Feld ("Medientyp", GEDCOM SOUR.REPO.CALN.MEDI) — vormals laut
  // ADR-v9-151 nur read-only im Steckbrief sichtbar; ohne ein editierbares Feld hätte die
  // Vorlage nichts, das "danach frei editierbar" bleibt (Spec-Vorgabe).
  //
  // Source ist ein FLACHES Modell (Spec 10 §4): createdDate/text/… sind PLAIN STRINGS, keine
  // Event-Objekte — anders als PersonForm.svelte braucht es KEIN Dirty-Tracking/Tristate
  // fuer Datum/Ort. Einfache bind:value-Textfelder reichen (analog den Identitaetsfeldern
  // in PersonForm.svelte).
  //
  // Archiv (repo): Source.repo ist `RepoId | string` (Spec 10 §4) — entweder eine gueltige
  // @Rxx@-Referenz auf ein Repository ODER Legacy-Freitext (Roundtrip-Fidelity fuer Altbestand
  // ohne strukturiertes REPO, s. source-detail-model.ts `db.repositories.get(source.repo)`).
  // RepositoryPicker (ADR-v9-40, INV-UI-4 — EIN Entitäts-Picker-Muster statt eines
  // eigenen flachen <select>, allowNone weil "— kein Archiv —" ein gueltiger Zustand ist)
  // zeigt einen unbekannten Freitext-Wert unveraendert als Feldinhalt an (Picker.svelte-
  // Fallback: value ohne Treffer in items -> Rohwert statt "nichts ausgewaehlt") — bleibt
  // erhalten, bis der Nutzer aktiv ein anderes Archiv waehlt oder "— kein Archiv —" waehlt.
  import { untrack } from 'svelte';
  import type { AppState } from '../../shell/app-state.svelte';
  import type { Source } from '../../../core/model/types';
  import { SOURCE_TEMPLATES, type SourceTemplate } from '../../../core/model/source-templates';
  import RepositoryPicker from '../../shell/RepositoryPicker.svelte';

  interface Props {
    appState: AppState;
    /** Die zu bearbeitende Quelle (bereits existierend ODER frisch angelegtes Gerüst). */
    source: Source;
    /** Nach erfolgreichem Speichern (z. B. um zur Detailansicht zurückzukehren). */
    onSaved?: (sourceId: string) => void;
    /** Abbrechen ohne Speichern. */
    onCancel?: () => void;
  }
  const { appState, source, onSaved, onCancel }: Props = $props();

  // Formular-Zustand wird NUR beim Mount aus der übergebenen Source initialisiert
  // (untrack-Muster analog PersonForm.svelte/FamilyForm.svelte) — kein fortlaufendes
  // Re-Sync, falls appState.db sich während des Editierens ändert.
  let abbr = $state(untrack(() => source.abbr));
  let title = $state(untrack(() => source.title));
  let author = $state(untrack(() => source.author));
  let createdDate = $state(untrack(() => source.createdDate));
  let publisher = $state(untrack(() => source.publisher));
  let callNumber = $state(untrack(() => source.callNumber));
  let callMedia = $state(untrack(() => source.callMedia));
  let text = $state(untrack(() => source.text));

  let repo = $state(untrack(() => source.repo));

  // Vorlagen-Auswahl (BL-128, Spec 20 §1.6 [S]): NUR beim Anlegen einer frischen Quelle
  // sichtbar (Kurzname UND Titel beim Mount leer) — dieselbe, bereits vorhandene
  // Heuristik wie die Überschrift unten ("Neue Quelle" vs. "Quelle bearbeiten"). Der
  // Vorlagen-Picker ist KEIN Dauer-Feld an jeder bestehenden Quelle.
  const showTemplates = untrack(() => !source.title && !source.abbr);
  let templateQuery = $state('');

  // Auswahl füllt NUR leere Felder — schon getippter eigener Text (oder eine zuvor
  // gewählte andere Vorlage) wird nie stillschweigend überschrieben. Jedes Feld bleibt
  // danach frei editierbar (Spec 20 §1.6: "kein geschlossenes Enum"). Wer die Vorlage
  // wechseln will, überschreibt das jeweilige Feld selbst von Hand.
  function applyTemplate(t: SourceTemplate) {
    if (!abbr.trim()) abbr = t.abbr;
    if (!title.trim()) title = t.title;
    if (!author.trim()) author = t.author;
    if (!callMedia.trim()) callMedia = t.callMedia;
  }

  // `callMedia` reist als `SOUR.REPO.CALN.MEDI` — strukturell unter der Signatur, die
  // wiederum unter dem Archiv hängt. `write-back-emit.ts` schreibt MEDI deshalb nur bei
  // gesetztem Archiv UND gesetzter Signatur; das ist korrektes GEDCOM, macht aber aus
  // einem allein ausgefüllten Medientyp-Feld eine stille Löschung (tippen, speichern,
  // nach dem Neuladen weg). Da die Vorlagen oben das Feld von sich aus vorbelegen, ist
  // das der Regelfall, nicht der Ausnahmefall — also sagen wir es, statt es zu schlucken.
  const mediaOrphan = $derived(!!callMedia.trim() && !(repo && callNumber.trim()));

  function applyTemplateByLabel() {
    const match = SOURCE_TEMPLATES.find((t) => t.label === templateQuery);
    if (match) applyTemplate(match);
  }

  function save() {
    const next: Source = {
      ...source,
      abbr: abbr.trim(),
      title: title.trim(),
      author: author.trim(),
      createdDate: createdDate.trim(),
      publisher: publisher.trim(),
      repo,
      callNumber: callNumber.trim(),
      callMedia: callMedia.trim(),
      text,
    };
    appState.saveSource(next);
    onSaved?.(next.id);
  }

  function cancel() {
    onCancel?.();
  }
</script>

<div class="source-form">
  <h3>{source.title || source.abbr ? 'Quelle bearbeiten' : 'Neue Quelle'}</h3>

  {#if showTemplates}
    <div class="source-form__field stb-field">
      <span class="stb-field__caption">Vorlage (optional)</span>
      <input
        type="text"
        bind:value={templateQuery}
        list="source-templates"
        placeholder="Vorlage wählen…"
        onchange={applyTemplateByLabel}
      />
      <datalist id="source-templates">
        {#each SOURCE_TEMPLATES as t (t.key)}
          <option value={t.label}></option>
        {/each}
      </datalist>
      <div class="source-form__chips">
        {#each SOURCE_TEMPLATES as t (t.key)}
          <button type="button" class="source-form__chip" onclick={() => applyTemplate(t)}>{t.label}</button>
        {/each}
      </div>
    </div>
  {/if}

  <div class="source-form__grid">
    <label>
      Titel
      <input type="text" bind:value={title} />
    </label>
    <label>
      Kurzname
      <input type="text" bind:value={abbr} />
    </label>
    <label>
      Autor
      <input type="text" bind:value={author} />
    </label>
    <label>
      Erfasst am
      <input type="text" bind:value={createdDate} />
    </label>
    <label>
      Verlag
      <input type="text" bind:value={publisher} />
    </label>
    <label>
      Signatur
      <input type="text" bind:value={callNumber} />
    </label>
    <label>
      <!-- GEDCOM SOUR.REPO.CALN.MEDI: hängt strukturell an der Signatur (CALN) — der
           Writer emittiert MEDI nur, wenn zugleich eine Signatur gesetzt ist
           (write-back-emit.ts emitSource). Keine erfundene Vorgabe: dieselbe Kopplung
           gilt bereits für die read-only-Anzeige im Steckbrief (ADR-v9-151). -->
      Medientyp (zur Signatur)
      <input
        type="text"
        bind:value={callMedia}
        placeholder="z. B. manuscript, tombstone"
        aria-describedby={mediaOrphan ? 'source-form-media-warn' : undefined}
      />
    </label>
    <!-- Der Hinweis steht ausserhalb des <label>: dort drin wuerde er Teil des
         Accessible Name des Feldes ("Medientyp (zur Signatur) Medientyp wird erst …"),
         statt als Beschreibung angesagt zu werden. Deshalb aria-describedby. -->
    {#if mediaOrphan}
      <p class="source-form__warn" id="source-form-media-warn">
        Medientyp wird erst mit Archiv und Signatur gespeichert.
      </p>
    {/if}
    <div class="stb-field">
      <span class="stb-field__caption">Archiv</span>
      <RepositoryPicker
        {appState}
        value={repo || null}
        onChange={(id) => (repo = id ?? '')}
        allowNone={true}
        noneLabel="— kein Archiv —"
        label="Archiv"
      />
    </div>
  </div>

  <label>
    Notiz
    <textarea bind:value={text}></textarea>
  </label>

  <div class="source-form__actions">
    <button type="button" class="source-form__save-btn" onclick={save}>Speichern</button>
    <button type="button" class="source-form__cancel-btn" onclick={cancel}>Abbrechen</button>
  </div>
</div>

<style>
  .source-form {
    padding: 1rem;
    overflow-y: auto;
    background: var(--stb-surface-1);
    border-radius: var(--stb-radius-card);
  }

  .source-form__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 0.5rem;
  }

  /* Vorlagen-Auswahl (BL-128) — gleicher Aufbau wie TaskForm.svelte's Kategorie-Feld
     (Preset+Freitext-<datalist> + Chip-Reihe, INV-UI-4). */
  .source-form__field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.8rem;
    color: var(--stb-text-dim);
    margin-top: 0.4rem;
  }

  /* Hinweis, kein Fehler: die Eingabe ist gültig, nur noch nicht speicherbar — deshalb
     die gedämpfte Warnfarbe statt der Fehler-Rotstufe. */
  .source-form__warn {
    font-size: 0.72rem;
    color: var(--stb-warn);
    line-height: 1.3;
    margin: 0.15rem 0 0;
    /* Volle Breite im auto-fill-Raster, damit der Satz nicht in einer 180px-Spalte
       umbricht und dabei vom zugehörigen Feld weggeschoben wird. */
    grid-column: 1 / -1;
  }

  .source-form__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-top: 0.3rem;
  }

  .source-form__chip {
    background: var(--stb-surface-3);
    color: var(--stb-text-dim);
    border: 1px solid var(--stb-gold-dim);
    border-radius: 999px;
    padding: 0.15rem 0.6rem;
    font-size: 0.72rem;
    cursor: pointer;
    min-height: var(--stb-touch-target);
  }

  .source-form label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.8rem;
    color: var(--stb-text-dim);
    margin-top: 0.4rem;
  }

  .source-form input,
  .source-form textarea {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.5rem;
    font: inherit;
  }

  .source-form__actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 1.25rem;
  }

  .source-form__save-btn,
  .source-form__cancel-btn {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.45rem 1rem;
    cursor: pointer;
    font-weight: 600;
  }

  .source-form__cancel-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
  }
</style>
