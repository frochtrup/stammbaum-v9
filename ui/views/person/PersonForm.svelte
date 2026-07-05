<script lang="ts">
  // ui/views/person/PersonForm.svelte — Personen-Editor (Spec 20 §2 Formular-Feldtabelle
  // "Person"/"Ereignis"; Spec 21 §2 "Bottom-Sheets mit progressiver Offenlegung"). Baut
  // analog PlaceDetail.svelte (inline-Editier-Abschnitt, appState.savePerson(model) mit
  // dem KOMPLETTEN Objekt) — kein Feld-Setter-Pattern aus dem DOM.
  //
  // Sonder-Ereignisse (birth/chr/death+cause/buri) haben feste, eigene Abschnitte (Spec
  // 10 §5.1 "Sonder-Ereignisse... feste UI-Position"). events[] ist eine generische
  // Hinzufügen/Entfernen-Liste (makeEvent(type) aus dem Kern, Spec 20 §2).
  //
  // Ort ist in DIESER Scheibe bewusst NUR Freitext (Spec-Aufgabe: "6-Felder-Toggle NICHT
  // im Scope"). Evidenz-Achsen (eval) sind auskommentiert (TODO Folgeschritt) — siehe
  // Kommentar unten bei der Quellen-Sektion.
  import { untrack } from 'svelte';
  import type { AppState } from '../../shell/app-state.svelte';
  import type { Person, Event, Citation, Quay } from '../../../core/model/types';
  import { makeEvent, makeCitation } from '../../../core/model/factory';
  import { parseDateValue, formatDateValue, normalizeMonth, type DateQualifier } from '../../../core/model/gedcom-date';
  import { setCitationQuay } from '../../../core/model/citation';

  interface Props {
    appState: AppState;
    /** Die zu bearbeitende Person (bereits existierend ODER frisch angelegtes Gerüst). */
    person: Person;
    /** Nach erfolgreichem Speichern (z. B. um zur Detailansicht zurückzukehren). */
    onSaved?: (personId: string) => void;
    /** Abbrechen ohne Speichern. */
    onCancel?: () => void;
  }
  const { appState, person, onSaved, onCancel }: Props = $props();

  /** Gängige GEDCOM-Event-Tags für "weitere Ereignisse hinzufügen" (Spec 20 §2). */
  const EVENT_TYPE_OPTIONS = [
    'OCCU', 'RESI', 'EDUC', 'EMIG', 'IMMI', 'NATU', 'EVEN', 'GRAD', 'ADOP', 'MILI', 'FACT', 'CENS', 'PROP',
  ] as const;

  const QUALIFIER_OPTIONS: { value: DateQualifier; label: string }[] = [
    { value: 'EXACT', label: 'exakt' },
    { value: 'ABT', label: 'ca. (ABT)' },
    { value: 'CAL', label: 'errechnet (CAL)' },
    { value: 'EST', label: 'geschätzt (EST)' },
    { value: 'BEF', label: 'vor (BEF)' },
    { value: 'AFT', label: 'nach (AFT)' },
    { value: 'BET', label: 'zwischen (BET…AND…)' },
    { value: 'FROM', label: 'Zeitraum (FROM…TO…)' },
  ];

  /** Editierbarer Ereignis-Zustand: strukturiertes Datum statt roher Raw-String, damit
   *  die Qualifier/Tag/Monat/Jahr-Felder direkt daran binden können. */
  interface EditableEvent {
    key: string;
    type: string;
    eventType: string;
    dateQualifier: DateQualifier;
    day: number | null;
    month: string | null;
    year: number | null;
    day2: number | null;
    month2: string | null;
    year2: number | null;
    hasDate: boolean;
    place: string;
    hasPlace: boolean;
    addr: string;
    note: string;
    cause: string;
    citations: Citation[];
  }

  function toEditable(key: string, ev: Event, cause = ''): EditableEvent {
    const parts = ev.date != null ? parseDateValue(ev.date) : null;
    return {
      key,
      type: ev.type,
      eventType: ev.eventType,
      dateQualifier: parts?.qualifier ?? 'EXACT',
      day: parts?.day ?? null,
      month: parts?.month ?? null,
      year: parts?.year ?? null,
      day2: parts?.day2 ?? null,
      month2: parts?.month2 ?? null,
      year2: parts?.year2 ?? null,
      hasDate: ev.date != null,
      place: ev.place ?? '',
      hasPlace: ev.place != null,
      addr: ev.addr,
      note: ev.note,
      cause,
      citations: ev.citations.map((c) => ({ ...c })),
    };
  }

  /** Baut das strukturierte Formular-Ereignis zurück in ein Event (Tristate beachtet,
   *  Spec 10 §5.1 "date/place unterscheiden null/''/Wert"). placeId/hofId bleiben
   *  unangetastet (Scope-Grenze: 6-Felder-Ort-Eingabe ist NICHT Teil dieser Scheibe). */
  function fromEditable(original: Event, e: EditableEvent): Event {
    const date = e.hasDate
      ? formatDateValue({
          qualifier: e.dateQualifier,
          day: e.day,
          month: e.month,
          year: e.year,
          day2: e.day2,
          month2: e.month2,
          year2: e.year2,
        })
      : null;
    return {
      ...original,
      type: e.type,
      eventType: e.eventType,
      date,
      place: e.hasPlace ? e.place : (e.place ? e.place : null),
      addr: e.addr,
      note: e.note,
      citations: e.citations,
    };
  }

  // Formular-Zustand wird NUR beim Mount aus der übergebenen Person initialisiert (analog
  // dem untrack(initialSegment)-Muster in EntityTab.svelte) — kein fortlaufendes Re-Sync,
  // falls sich appState.db während des Editierens änderte (z. B. anderer Tab/Import).
  // Person-Detail rendert PersonForm ohnehin frisch (neuer Mount) bei jedem "Bearbeiten".

  // --- Identität ---
  let given = $state(untrack(() => person.given));
  let surname = $state(untrack(() => person.surname));
  let prefix = $state(untrack(() => person.prefix));
  let suffix = $state(untrack(() => person.suffix));
  let nick = $state(untrack(() => person.nick));
  let sex = $state(untrack(() => person.sex));
  let title = $state(untrack(() => person.title));
  let religion = $state(untrack(() => person.religion));
  let noteText = $state(untrack(() => person.noteText));
  let restriction = $state(untrack(() => person.restriction));
  let email = $state(untrack(() => person.email));
  let www = $state(untrack(() => person.www));

  // --- Sonder-Ereignisse ---
  let birth = $state(untrack(() => toEditable('BIRT', person.birth)));
  let chr = $state(untrack(() => toEditable('CHR', person.chr)));
  let death = $state(untrack(() => toEditable('DEAT', person.death, person.cause)));
  let buri = $state(untrack(() => toEditable('BURI', person.buri)));

  // --- Weitere Ereignisse ---
  let events = $state(untrack(() => person.events.map((ev, i) => toEditable(`ev-${i}`, ev))));
  let newEventType = $state<string>(EVENT_TYPE_OPTIONS[0]);
  let eventKeySeq = untrack(() => events.length);

  function addEvent() {
    const fresh = makeEvent(newEventType);
    eventKeySeq += 1;
    events = [...events, toEditable(`new-${eventKeySeq}`, fresh)];
  }

  function removeEvent(key: string) {
    events = events.filter((e) => e.key !== key);
  }

  // --- Quellen-Widget (pro Ereignis) ---
  const sources = $derived(Array.from(appState.db.sources.values()));

  function addCitation(target: EditableEvent) {
    if (sources.length === 0) return;
    target.citations = [...target.citations, makeCitation(sources[0].id)];
  }

  function removeCitation(target: EditableEvent, index: number) {
    target.citations = target.citations.filter((_, i) => i !== index);
  }

  function setCitationSource(target: EditableEvent, index: number, sourceId: string) {
    target.citations = target.citations.map((c, i) => (i === index ? { ...c, sourceId } : c));
  }

  function setCitationPage(target: EditableEvent, index: number, page: string) {
    target.citations = target.citations.map((c, i) => (i === index ? { ...c, page } : c));
  }

  function setCitationNote(target: EditableEvent, index: number, note: string) {
    target.citations = target.citations.map((c, i) => (i === index ? { ...c, note } : c));
  }

  function setCitationQuayAt(target: EditableEvent, index: number, quay: Quay) {
    target.citations = target.citations.map((c, i) => (i === index ? setCitationQuay(c, quay) : c));
  }

  function onMonthBlur(target: EditableEvent, field: 'month' | 'month2', raw: string) {
    target[field] = normalizeMonth(raw);
  }

  function save() {
    const next: Person = {
      ...person,
      given: given.trim(),
      surname: surname.trim(),
      prefix: prefix.trim(),
      suffix: suffix.trim(),
      nick: nick.trim(),
      sex,
      title: title.trim(),
      religion: religion.trim(),
      noteText,
      restriction: restriction.trim(),
      email: email.trim(),
      www: www.trim(),
      birth: fromEditable(person.birth, birth),
      chr: fromEditable(person.chr, chr),
      death: fromEditable(person.death, death),
      cause: death.cause.trim(),
      buri: fromEditable(person.buri, buri),
      events: events.map((e, i) => fromEditable(person.events[i] ?? makeEvent(e.type), e)),
    };
    appState.savePerson(next);
    onSaved?.(next.id);
  }

  function cancel() {
    onCancel?.();
  }
</script>

{#snippet dateFields(ev: EditableEvent)}
  <div class="person-form__date-row">
    <label class="person-form__checkbox">
      <input
        type="checkbox"
        checked={ev.hasDate}
        onchange={(e) => (ev.hasDate = (e.currentTarget as HTMLInputElement).checked)}
      />
      Datum erfasst
    </label>
    {#if ev.hasDate}
      <select
        aria-label="Datums-Qualifier"
        value={ev.dateQualifier}
        onchange={(e) => (ev.dateQualifier = (e.currentTarget as HTMLSelectElement).value as DateQualifier)}
      >
        {#each QUALIFIER_OPTIONS as q (q.value)}
          <option value={q.value}>{q.label}</option>
        {/each}
      </select>
      <input type="number" placeholder="Tag" aria-label="Tag" bind:value={ev.day} class="person-form__day" />
      <input
        type="text"
        placeholder="Monat"
        aria-label="Monat"
        value={ev.month ?? ''}
        onchange={(e) => onMonthBlur(ev, 'month', (e.currentTarget as HTMLInputElement).value)}
      />
      <input type="number" placeholder="Jahr" aria-label="Jahr" bind:value={ev.year} class="person-form__year" />
      {#if ev.dateQualifier === 'BET' || ev.dateQualifier === 'FROM'}
        <span class="person-form__muted">{ev.dateQualifier === 'BET' ? 'und' : 'bis'}</span>
        <input type="number" placeholder="Tag" aria-label="Tag (Ende)" bind:value={ev.day2} class="person-form__day" />
        <input
          type="text"
          placeholder="Monat"
          aria-label="Monat (Ende)"
          value={ev.month2 ?? ''}
          onchange={(e) => onMonthBlur(ev, 'month2', (e.currentTarget as HTMLInputElement).value)}
        />
        <input type="number" placeholder="Jahr" aria-label="Jahr (Ende)" bind:value={ev.year2} class="person-form__year" />
      {/if}
    {/if}
  </div>
{/snippet}

{#snippet citationList(ev: EditableEvent, labelPrefix: string)}
  <div class="person-form__citations">
    <h5>Quellen</h5>
    {#if ev.citations.length === 0}
      <p class="person-form__muted">Keine Quellen zugeordnet.</p>
    {/if}
    {#each ev.citations as cit, i (i)}
      <div class="person-form__citation-row">
        <select
          aria-label={`${labelPrefix} Quelle ${i + 1}`}
          value={cit.sourceId}
          onchange={(e) => setCitationSource(ev, i, (e.currentTarget as HTMLSelectElement).value)}
        >
          {#each sources as s (s.id)}
            <option value={s.id}>{s.abbr || s.title || s.id}</option>
          {/each}
        </select>
        <input
          type="text"
          placeholder="Seite"
          aria-label={`${labelPrefix} Seite ${i + 1}`}
          value={cit.page}
          onchange={(e) => setCitationPage(ev, i, (e.currentTarget as HTMLInputElement).value)}
        />
        <select
          aria-label={`${labelPrefix} Zuverlässigkeit ${i + 1}`}
          value={String(cit.quay)}
          onchange={(e) => setCitationQuayAt(ev, i, Number((e.currentTarget as HTMLSelectElement).value) as Quay)}
        >
          <option value="0">QUAY 0</option>
          <option value="1">QUAY 1</option>
          <option value="2">QUAY 2</option>
          <option value="3">QUAY 3</option>
        </select>
        <input
          type="text"
          placeholder="Notiz"
          aria-label={`${labelPrefix} Notiz ${i + 1}`}
          value={cit.note}
          onchange={(e) => setCitationNote(ev, i, (e.currentTarget as HTMLInputElement).value)}
        />
        <!-- TODO Folgeschritt: Evidenz-Achsen (eval: source/information/evidence) — nicht
             hart erforderlich für diese Scheibe (Spec 20 §2). -->
        <button type="button" class="person-form__remove-btn" onclick={() => removeCitation(ev, i)} aria-label={`${labelPrefix} Quelle ${i + 1} entfernen`}>✕</button>
      </div>
    {/each}
    <button type="button" class="person-form__add-citation-btn" onclick={() => addCitation(ev)} disabled={sources.length === 0}>
      + Quelle hinzufügen
    </button>
  </div>
{/snippet}

{#snippet specialEventSection(title2: string, ev: EditableEvent, showCause: boolean, showAddr: boolean)}
  <div class="person-form__event person-form__event--special">
    <h4>{title2}</h4>
    {@render dateFields(ev)}
    <label>
      Ort (Freitext)
      <input
        type="text"
        value={ev.place}
        onchange={(e) => {
          const v = (e.currentTarget as HTMLInputElement).value;
          ev.place = v;
          ev.hasPlace = v !== '';
        }}
      />
    </label>
    {#if showAddr}
      <label>
        Adresse
        <input type="text" bind:value={ev.addr} />
      </label>
    {/if}
    {#if showCause}
      <label>
        Todesursache
        <input type="text" bind:value={ev.cause} />
      </label>
    {/if}
    <label>
      Notiz
      <textarea bind:value={ev.note}></textarea>
    </label>
    {@render citationList(ev, title2)}
  </div>
{/snippet}

<div class="person-form">
  <h3>{person.given || person.surname ? 'Person bearbeiten' : 'Neue Person'}</h3>

  <section class="person-form__section">
    <h4>Identität</h4>
    <div class="person-form__grid">
      <label>
        Vorname
        <input type="text" bind:value={given} />
      </label>
      <label>
        Nachname
        <input type="text" bind:value={surname} />
      </label>
      <label>
        Präfix
        <input type="text" bind:value={prefix} />
      </label>
      <label>
        Suffix
        <input type="text" bind:value={suffix} />
      </label>
      <label>
        Rufname
        <input type="text" bind:value={nick} />
      </label>
      <label>
        Geschlecht
        <select value={sex} onchange={(e) => (sex = (e.currentTarget as HTMLSelectElement).value as typeof sex)}>
          <option value="M">Männlich</option>
          <option value="F">Weiblich</option>
          <option value="U">Unbekannt</option>
        </select>
      </label>
      <label>
        Titel
        <input type="text" bind:value={title} />
      </label>
      <label>
        Religion
        <input type="text" bind:value={religion} />
      </label>
      <label>
        RESN (Zugriffsbeschränkung)
        <input type="text" bind:value={restriction} placeholder="confidential | locked | privacy" />
      </label>
      <label>
        E-Mail
        <input type="email" bind:value={email} />
      </label>
      <label>
        Website
        <input type="url" bind:value={www} />
      </label>
    </div>
    <label>
      Notiz
      <textarea bind:value={noteText}></textarea>
    </label>
  </section>

  <section class="person-form__section">
    <h4>Sonder-Ereignisse</h4>
    {@render specialEventSection('Geburt (BIRT)', birth, false, false)}
    {@render specialEventSection('Taufe (CHR)', chr, false, false)}
    {@render specialEventSection('Tod (DEAT)', death, true, false)}
    {@render specialEventSection('Bestattung (BURI)', buri, false, false)}
  </section>

  <section class="person-form__section">
    <h4>Weitere Ereignisse</h4>
    {#each events as ev (ev.key)}
      <div class="person-form__event">
        <div class="person-form__event-head">
          <strong>{ev.type}</strong>
          <button type="button" class="person-form__remove-btn" onclick={() => removeEvent(ev.key)} aria-label={`Ereignis ${ev.type} entfernen`}>✕ Entfernen</button>
        </div>
        {#if ev.type === 'EVEN' || ev.type === 'FACT'}
          <label>
            Typ-Freitext (TYPE)
            <input type="text" bind:value={ev.eventType} />
          </label>
        {/if}
        {@render dateFields(ev)}
        <label>
          Ort (Freitext)
          <input
            type="text"
            value={ev.place}
            onchange={(e) => {
              const v = (e.currentTarget as HTMLInputElement).value;
              ev.place = v;
              ev.hasPlace = v !== '';
            }}
          />
        </label>
        {#if ev.type === 'RESI'}
          <label>
            Adresse
            <input type="text" bind:value={ev.addr} />
          </label>
        {/if}
        <label>
          Notiz
          <textarea bind:value={ev.note}></textarea>
        </label>
        {@render citationList(ev, ev.type)}
      </div>
    {/each}
    <div class="person-form__add-row">
      <select aria-label="Neuer Ereignis-Typ" value={newEventType} onchange={(e) => (newEventType = (e.currentTarget as HTMLSelectElement).value)}>
        {#each EVENT_TYPE_OPTIONS as t (t)}
          <option value={t}>{t}</option>
        {/each}
      </select>
      <button type="button" onclick={addEvent}>+ Ereignis hinzufügen</button>
    </div>
  </section>

  <div class="person-form__actions">
    <button type="button" class="person-form__save-btn" onclick={save}>Speichern</button>
    <button type="button" class="person-form__cancel-btn" onclick={cancel}>Abbrechen</button>
  </div>
</div>

<style>
  .person-form {
    padding: 1rem;
    overflow-y: auto;
    background: var(--stb-surface-1);
    border-radius: var(--stb-radius-card);
  }

  .person-form__section {
    margin-top: 1.25rem;
  }

  .person-form__section h4 {
    font-size: 0.95rem;
    color: var(--stb-gold-light);
    margin-bottom: 0.4rem;
  }

  .person-form__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 0.5rem;
  }

  .person-form label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.8rem;
    color: var(--stb-text-dim);
    margin-top: 0.4rem;
  }

  .person-form input,
  .person-form select,
  .person-form textarea {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.5rem;
    font: inherit;
  }

  .person-form__checkbox {
    flex-direction: row;
    align-items: center;
    gap: 0.35rem;
  }

  .person-form__event {
    background: var(--stb-surface-2);
    border-radius: var(--stb-radius-card);
    padding: 0.6rem 0.8rem;
    margin-bottom: 0.75rem;
  }

  .person-form__event--special {
    border-left: 3px solid var(--stb-gold-dim);
  }

  .person-form__event h4 {
    margin: 0 0 0.3rem;
    font-size: 0.88rem;
    color: var(--stb-gold-light);
  }

  .person-form__event-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .person-form__date-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.4rem;
  }

  .person-form__day,
  .person-form__year {
    width: 5.5rem;
  }

  .person-form__muted {
    color: var(--stb-text-dim);
    font-size: 0.82rem;
  }

  .person-form__citations {
    margin-top: 0.6rem;
  }

  .person-form__citations h5 {
    font-size: 0.8rem;
    color: var(--stb-text-dim);
    margin: 0 0 0.3rem;
  }

  .person-form__citation-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
    margin-bottom: 0.35rem;
  }

  .person-form__remove-btn {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
    font-size: 0.8rem;
  }

  .person-form__add-citation-btn,
  .person-form__add-row button {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    font-size: 0.82rem;
  }

  .person-form__add-citation-btn:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .person-form__add-row {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    margin-top: 0.5rem;
  }

  .person-form__actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 1.25rem;
  }

  .person-form__save-btn,
  .person-form__cancel-btn {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.45rem 1rem;
    cursor: pointer;
    font-weight: 600;
  }

  .person-form__cancel-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
  }
</style>
