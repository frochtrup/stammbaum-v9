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
  // Neu-Anlage-Modus (ADR-v9-63, `mode="create"`): derselbe Editor, zwei Aufrufarten —
  // der Aufrufer übergibt entweder ein bestehendes Event (Edit, Default) ODER ein frisch
  // erzeugtes `makeEvent(tag)` (core/model/factory.ts, KEINE neue Factory) als `event`-
  // Prop; `mode` steuert nur die Kopfzeile ("bearbeiten" vs. "anlegen"), keine Logik
  // ändert sich sonst. Ob das Save-Ergebnis ein bestehendes Feld ersetzt oder neu zu
  // `events[]` hinzugefügt wird, entscheidet AUSSCHLIESSLICH der Aufrufer (PersonDetail/
  // FamilyDetail) in seinem `onSave`-Handler — dieses Modal kennt keine Person-/Family-
  // Struktur.
  //
  // Der Backdrop kommt aus `.stb-modal-backdrop` (design-system.css, INV-UI-4) — das
  // hiesige lokale Duplikat lag mit `z-index: 100` UNTER der Bottom-Nav (400): das Modal
  // war nicht modal, die Navigation blieb darüber bedienbar und verdeckte bei hohem Panel
  // die eigenen Aktionsknöpfe. Nur das Panel bleibt lokal (Breite/Polsterung je Fall).
  import { untrack } from 'svelte';
  import type { AppState } from './app-state.svelte';
  import type { Event, MediaCitation } from '../../core/model/types';
  import { makeMedia, makeMediaCitation } from '../../core/model/factory';
  import { HOF_EVENT_TYPES } from '../../core/places';
  import EventCitationsSection from './EventCitationsSection.svelte';
  import EventPlaceField from './EventPlaceField.svelte';
  import EventAddrField from './EventAddrField.svelte';
  import EventAgeHelper from './EventAgeHelper.svelte';
  import { formSubmit } from './form-keys';
  import { portal } from './portal';
  import { focusTrap } from './focus-trap';
  import {
    toEditable,
    markDateDirty,
    fromEditable,
    pickPlaceFor as sharedPickPlaceFor,
    pickHofFor as sharedPickHofFor,
    onMonthBlur,
    computeDate,
    liveEventFrom,
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
    /** "edit" (Default) = bestehendes Event ändern ("<Label> bearbeiten"); "create" =
     *  frisch angelegtes Event ("<Label> anlegen") — reine Kopfzeilen-/aria-label-
     *  Unterscheidung, s. Modul-Kommentar. */
    mode?: 'edit' | 'create';
    /** Vollständiges, aktualisiertes Event-Objekt + (ggf. leere) Todesursache — der
     *  Aufrufer baut daraus das volle Person-/Family-Objekt und ruft
     *  appState.savePerson/saveFamily(model) auf (kein Speichern hier im Modal). */
    /** Drittes Argument (BL-212/ADR-v9-168): ein im Dialog VORGEMERKTES Geburtsdatum —
     *  es wird zusammen mit dem Ereignis committet, nicht vorher. Aufrufer ohne
     *  `onDeriveBirth` bekommen hier immer `null`. */
    onSave: (updatedEvent: Event, cause: string, derivedBirth: string | null) => void;
    onClose: () => void;
    /** „⧉ Kopieren" — legt dieses Ereignis in die Sitzungs-Zwischenablage (BL-212).
     *  Weglassen blendet den Knopf aus (Kontexte ohne Zwischenablage, z. B. FamilyDetail). */
    onCopy?: (ev: Event) => void;
    /** Nur sinnvoll am Sterbe-Ereignis (BL-212): schaltet die Alters-Eingabehilfe frei.
     *  Das errechnete Geburtsdatum wird VORGEMERKT und über `onSave` übergeben — der
     *  Aufrufer besitzt die Person und entscheidet, ob er ein vorhandenes Datum
     *  überschreibt. Dieses Modal kennt nur EIN Ereignis. */
    allowDeriveBirth?: boolean;
  }
  const { appState, event, label, cause = null, mode = 'edit', onSave, onClose, onCopy, allowDeriveBirth = false }: Props = $props();
  const headingVerb = $derived(mode === 'create' ? 'anlegen' : 'bearbeiten');

  // Formular-Zustand wird NUR beim Mount aus dem übergebenen Event initialisiert (analog
  // PersonForm/FamilyForm's untrack(...)-Muster, TST-10) — kein fortlaufendes Re-Sync,
  // falls appState.db während des Editierens wechselt. Aufrufer mounten dieses Modal
  // ohnehin frisch pro Öffnen (kein bestehender Modal-Instanz-Wiederverwendungs-Pfad).
  let editable = $state<EditableEvent>(untrack(() => toEditable('modal-event', event, appState.placeContext)));
  let deathCause = $state(untrack(() => cause ?? ''));

  /** Ereignis brachte beim Öffnen einen ADDR-Wert mit — EINMAL beim Mount festgehalten,
   *  bewusst NICHT reaktiv: ein live abgeleiteter Ausdruck ließe das Feld beim Leeren unter
   *  dem Cursor verschwinden, und Leeren ist bei einem Non-Hof-Ereignis die häufigste
   *  Auflösung (s. showAddr). */
  const hadAddrOnOpen = untrack(() => (event.addr ?? '').trim() !== '');

  /** Häufige Konfessionswerte — s. das Datalist am Wert-Feld unten. */
  const RELIGION_PRESETS = ['röm.-kath.', 'evang.', 'katholisch'];
  /** Hof-Typen (RESI/PROP/CENS) haben das Adressfeld immer — dort entsteht Hof-Identität
   *  (`resolve.ts` Pfad B′). Ein Non-Hof-Typ bekommt es, wenn das Ereignis eine ADDR
   *  MITBRINGT: genau diese Kombination landet in der Hof-Review als Klasse A/D
   *  (`resolve.ts` Schritt 7), und Spec 11 §6 nennt „Quelle schärfen" → „Nutzer passt
   *  PLAC/ADDR an" als deren Auflösung — ohne sichtbares Feld war dieser Weg zu, die Review
   *  zeigte also einen Befund, den man in der UI nicht beheben konnte (ADR-v9-186). */
  const showAddr = $derived(HOF_EVENT_TYPES.has(editable.type) || hadAddrOnOpen);
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

  /** Die Alters-Eingabehilfe (BL-212) lebt in EventAgeHelper.svelte — hier nur die Frage,
   *  OB sie gezeigt wird: nur am Sterbe-Ereignis und nur, wenn der Aufrufer ein
   *  Geburtsdatum entgegennehmen kann. */
  const showAgeHelper = $derived(allowDeriveBirth && editable.type === 'DEAT');
  /** Vorgemerktes Geburtsdatum (ADR-v9-168): EIN Commit-Punkt je Dialog — „Abbrechen"
   *  verwirft es zusammen mit allen übrigen Feldänderungen. Vorher schrieb die Hilfe
   *  sofort, sodass „Abbrechen" die halbe Änderung stehen ließ (Design-Kritik 2026-07-31). */
  let stagedBirth = $state<string | null>(null);

  // Die Quellen-Sektion (Überschrift, „+ Quelle hinzufügen", Zeilenliste) liegt seit
  // BL-276 in `EventCitationsSection.svelte` — die Oberflächen-Hälfte derselben
  // max-lines-Extraktion, die schon `event-edit-citations.ts` erzeugt hat.

  // 📷-Kamera-Schnellzugriff (Spec 20 §1.4 [S]): das gewählte/aufgenommene Foto wird SOFORT
  // mit DIESEM Ereignis verknüpft. `capture="environment"` öffnet mobil direkt die Kamera,
  // fällt am Desktop auf einen Dateiwähler zurück — offlinefähig, kein Netz nötig. Der
  // Dateiname ist die Media-Identität (Media.file, Spec 10 §4/14 §7). Das Media-Record wird
  // sofort angelegt (appState.saveMedia); die Verknüpfung sammelt sich in `pendingMedia` und
  // wird beim Speichern des Ereignisses an event.media angehängt (fromEditable trägt media
  // nicht, daher hier explizit).
  let pendingMedia = $state<MediaCitation[]>([]);

  function onCameraFiles(input: HTMLInputElement) {
    const files = input.files;
    if (!files) return;
    for (const f of Array.from(files)) {
      const id = f.name;
      appState.saveMedia(makeMedia(id, { file: id, form: f.type, title: '' }));
      if (!pendingMedia.some((m) => m.mediaId === id) && !event.media.some((m) => m.mediaId === id)) {
        pendingMedia = [...pendingMedia, makeMediaCitation(id)];
      }
    }
    input.value = '';
  }

  const attachedCount = $derived(event.media.length + pendingMedia.length);

  function save() {
    const updated = fromEditable(event, editable);
    onSave({ ...updated, media: [...event.media, ...pendingMedia] }, deathCause.trim(), stagedBirth);
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
<!-- Portaliert (BL-278, INV-UI-13/§6k): §6k nennt Modal-Backdrops namentlich unter
     „Wer portaliert" — bis hierher taten es die vier Konsumenten als einzige nicht. Der
     Backdrop liegt `position: fixed`, das trug bisher; es trägt aber nur, solange KEIN
     Vorfahre `transform`/`filter`/`contain`/`will-change` setzt (dann wird er der
     Containing Block, und erst dann klippt auch sein `overflow: auto`). Diese Bedingung
     ist nichts, worauf eine Overlay-Fläche sich verlassen darf. -->
<div class="stb-modal-backdrop" use:portal use:focusTrap onclick={onClose} role="presentation">
  <div
    class="event-edit-modal__panel"
    onclick={(e) => e.stopPropagation()}
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label={`${label} ${headingVerb}`}
  >
  <!-- Der Inhalt ist ein `<form>` (BL-276, §6i): Escape schloss schon (svelte:window
       oben), Enter tat nichts. Es liegt INNERHALB des Panels, nicht an seiner Stelle —
       die Dialog-Rolle kann ein `<form>` nicht tragen. Alle Knöpfe darin sind
       `type="button"` (geprüft), auch die der eingebetteten `SourceCitationRow` — Enter
       gehört damit dem Speichern. -->
  <form class="event-edit-modal__form" onsubmit={formSubmit(save)}>
    <div class="event-edit-modal__head">
      <h3>{label} {headingVerb}</h3>
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

    {#if showAgeHelper}
      <EventAgeHelper deathDate={computeDate(editable)} onStage={(d) => (stagedBirth = d)} staged={stagedBirth} />
    {/if}

    {#if showTypeText}
      <label>
        Typ-Freitext (TYPE)
        <input type="text" bind:value={editable.eventType} />
      </label>
    {/if}

    <div class="stb-field">
      <span class="stb-field__caption">Ort (Freitext)</span>
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
    </div>

    {#if showAddr}
      <div class="stb-field">
        <span class="stb-field__caption">Adresse</span>
        <EventAddrField
          {appState}
          value={editable.addr}
          onTextChange={(v) => (editable.addr = v)}
          onPick={(hofId) => pickHofFor(hofId)}
          villageId={editable.placeId}
          allowCreate={HOF_EVENT_TYPES.has(editable.type)}
          label={`${label} Adresse`}
        />
      </div>
    {/if}

    <label>
      Wert
      <input
        type="text"
        bind:value={editable.value}
        placeholder={editable.type === 'RELI' ? 'z. B. röm.-kath.' : 'z. B. Beruf bei OCCU'}
        list={editable.type === 'RELI' ? 'event-value-presets' : undefined}
      />
      <!-- Konfessions-Vorschläge (BL-212/ADR-v9-156, mit BL-289 vom Personen-Formular hierher
           gewandert, weil RELI jetzt ein Ereignis ist): Preset+Freitext wie bei den
           Aufgaben-Kategorien (INV-UI-4), KEIN geschlossenes Enum — Bestandswerte bleiben
           unverändert (LP-1). Am Realbestand stehen mehrere Schreibweisen derselben
           Konfession nebeneinander („röm.-kath." 58×, „röm. kath." 11×, „röm.-kath" 1×);
           genau diese Streuung sollen die Vorschläge eindämmen. -->
      {#if editable.type === 'RELI'}
        <datalist id="event-value-presets">
          {#each RELIGION_PRESETS as preset (preset)}
            <option value={preset}></option>
          {/each}
        </datalist>
      {/if}
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

    <EventCitationsSection
      {appState}
      citations={editable.citations}
      labelPrefix={label}
      onChange={(next) => (editable.citations = next)}
    />

    <div class="event-edit-modal__media">
      <label class="event-edit-modal__camera-btn">
        📷 Foto aufnehmen/anhängen
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          class="event-edit-modal__file-input"
          aria-label="Foto aufnehmen oder Datei anhängen"
          onchange={(e) => onCameraFiles(e.currentTarget)}
        />
      </label>
      {#if attachedCount > 0}
        <span class="event-edit-modal__media-count">{attachedCount} Medium{attachedCount === 1 ? '' : 'en'} verknüpft</span>
      {/if}
    </div>

    <div class="event-edit-modal__actions">
      {#if onCopy}
        <button
          type="button"
          class="event-edit-modal__copy-btn"
          onclick={() => onCopy(liveEventFrom(editable))}
        >⧉ Kopieren</button>
      {/if}
      <button type="submit" class="stb-btn" data-variant="primary">Speichern</button>
      <button type="button" class="stb-btn" data-variant="secondary" onclick={onClose}>Abbrechen</button>
    </div>
  </form>
  </div>
</div>

<style>
  /* Das Formular ist eine reine Gruppierungs-Hülle im Panel (BL-276) — es soll dessen
     Fluss nicht verändern, deshalb erbt es Spalten-Layout und Lücke. */
  .event-edit-modal__form {
    display: contents;
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

  .event-edit-modal__media {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
    margin-top: 0.9rem;
  }

  .event-edit-modal__camera-btn {
    display: inline-flex;
    align-items: center;
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    font-size: 0.82rem;
  }

  .event-edit-modal__file-input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .event-edit-modal__media-count {
    font-size: 0.78rem;
    color: var(--stb-text-dim);
  }







  .event-edit-modal__copy-btn {
    margin-right: auto;
    background: transparent;
    color: var(--stb-text-dim);
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.7rem;
    cursor: pointer;
    min-height: var(--stb-touch-target);
  }

  .event-edit-modal__actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 1.1rem;
  }


</style>
