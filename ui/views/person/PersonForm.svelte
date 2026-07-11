<script lang="ts">
  // ui/views/person/PersonForm.svelte — Personen-Editor (Spec 20 §2 Formular-Feldtabelle
  // "Person"/"Ereignis"; Spec 21 §2 "Bottom-Sheets mit progressiver Offenlegung"). Baut
  // analog PlaceDetail.svelte (inline-Editier-Abschnitt, appState.savePerson(model) mit
  // dem KOMPLETTEN Objekt) — kein Feld-Setter-Pattern aus dem DOM.
  //
  // Sonder-Ereignisse (birth/chr/death+cause/buri) haben feste, eigene Abschnitte (Spec
  // 10 §5.1 "Sonder-Ereignisse... feste UI-Position"). events[] ist eine generische
  // Hinzufügen/Entfernen-Liste (makeEvent(type) aus dem Kern, Spec 20 §2). Beide teilen
  // sich EINE Überschrift "Ereignisse" (ADR-v9-30 Nachtrag 2026-07-06 — ersetzt die
  // zuvor getrennten, nicht zielführenden Überschriften "Sonder-Ereignisse"/"Weitere
  // Ereignisse"): Geburt (immer offen) -> Tod (isEventPresent-gesteuert wie jedes andere
  // Ereignis-Pill, erscheint kanonisch direkt nach Geburt sobald befüllt) -> Ereignis-
  // Pill-Reihe -> aktivierte/weitere events[]-Einträge.
  //
  // ADR-v9-30 Punkt 1 (Datum-Dirty-Tracking) + Punkt 3 (Schnellauswahl-Pills) + Punkt 4
  // (kompakte Zeilen, INV-UI-5): Datum/Ort sind IMMER direkt editierbar (keine Gate-
  // Checkbox mehr); seltene Felder/Sonder-Ereignisse erscheinen als "+ Label"-Pill, wenn
  // sie leer sind, und an ihrer kanonischen Formularposition, sobald aktiviert.
  //
  // Ort/Adresse bleiben Freitext (Roundtrip-Fidelity, freies Weitertippen immer möglich)
  // — ADR-v9-42 ergänzt aber `EventPlaceField`/`EventAddrField`: ein Picker-Icon neben dem
  // Textfeld erlaubt zusätzlich, ein bestehendes PlaceObject/HofObject zu wählen ODER
  // inline neu anzulegen; Auswahl/Anlage verknüpft SOFORT über `linkEventToPlace`/
  // `linkEventToHof` (ID + Text atomar reprojiziert, kein zweiter Zuordnungsweg neben
  // `resolveEvents()`). Evidenz-Achsen (eval) sind auskommentiert (TODO Folgeschritt) —
  // siehe Kommentar unten bei der Quellen-Sektion.
  import { untrack } from 'svelte';
  import type { AppState } from '../../shell/app-state.svelte';
  import type { Person, Event, Quay } from '../../../core/model/types';
  import { makeEvent, makeCitation } from '../../../core/model/factory';
  import type { DateQualifier } from '../../../core/model/gedcom-date';
  import { setCitationQuay } from '../../../core/model/citation';
  import { isEventPresent } from '../../../core/model';
  import { HOF_EVENT_TYPES } from '../../../core/places';
  import { eventTypeLabel } from '../../shell/event-labels';
  import SourceCitationRow from '../../shell/SourceCitationRow.svelte';
  import EventPlaceField from '../../shell/EventPlaceField.svelte';
  import EventAddrField from '../../shell/EventAddrField.svelte';
  import {
    toEditable as buildEditable,
    markDateDirty,
    fromEditable,
    pickPlaceFor as sharedPickPlaceFor,
    pickHofFor as sharedPickHofFor,
    onMonthBlur,
    QUALIFIER_OPTIONS,
    type EditableEvent,
  } from '../../shell/event-edit';

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

  // Datum-Parsing/-Dirty-Tracking, Ort-/Hof-Picker-Reprojektion + Tristate-Erhaltung
  // (EditableEvent, toEditable/fromEditable/computeDate/liveEventFrom/pickPlaceFor/
  // pickHofFor/markDateDirty/onMonthBlur/QUALIFIER_OPTIONS) leben jetzt in
  // ui/shell/event-edit.ts — identischer Code war zuvor hier UND in FamilyForm.svelte
  // dupliziert (ADR-v9-30 Punkt 1), jetzt auch von EventEditModal.svelte genutzt
  // (Einzel-Ereignis-Bearbeitung, INV-UI-4). Dünne lokale Wrapper binden appState/
  // person.cause dort an, wo die geteilte Funktion appState braucht ODER dieses
  // Formular ein zusätzliches, event-fremdes Feld hat (cause lebt auf Person.cause,
  // NICHT am Event — s. event-edit.ts Modul-Kommentar).
  function toEditable(key: string, ev: Event): EditableEvent {
    return buildEditable(key, ev, appState.placeContext);
  }

  function pickPlaceFor(target: EditableEvent, placeId: string): void {
    sharedPickPlaceFor(appState, target, placeId);
  }

  function pickHofFor(target: EditableEvent, hofId: string): void {
    sharedPickHofFor(appState, target, hofId);
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
  let death = $state(untrack(() => toEditable('DEAT', person.death)));
  /** Todesursache lebt auf Person.cause, NICHT am Event (core/model/types.ts) — deshalb
   *  separat vom EditableEvent 'death' geführt (event-edit.ts's EditableEvent hat bewusst
   *  kein 'cause'-Feld, s. dortiger Modul-Kommentar). */
  let deathCause = $state(untrack(() => person.cause));
  let buri = $state(untrack(() => toEditable('BURI', person.buri)));

  // --- Weitere Ereignisse ---
  let events = $state(untrack(() => person.events.map((ev, i) => toEditable(`ev-${i}`, ev))));
  let newEventType = $state<string>(EVENT_TYPE_OPTIONS[0]);
  let eventKeySeq = untrack(() => events.length);

  function addEvent() {
    addEventOfType(newEventType);
  }

  /** Fügt sofort ein Ereignis eines festen Typs hinzu (ADR-v9-30 Punkt 3 Nachtrag: Beruf-
   *  /Wohnort-Pills) — derselbe Kern-Mechanismus (makeEvent + toEditable) wie addEvent(),
   *  nur ohne den Umweg über Typ-Dropdown + Button-Klick. */
  function addEventOfType(type: string): void {
    const fresh = makeEvent(type);
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

  // --- Schnellauswahl-Pills (ADR-v9-30 Punkt 3) ---------------------------------------
  // Sichtbarkeits-Kriterium "gefüllt schlägt selten": ein Pill-Feld/-Ereignis erscheint
  // NUR wenn leer/nicht vorhanden — für Sonder-Ereignisse per isEventPresent (Kern-
  // Prädikat, kein neuer Mechanismus), für Skalarfelder per leerer-String-Test. Einmal
  // aktiviert (durch Nutzerklick ODER weil das Feld beim Laden schon befüllt war) bleibt
  // die Sektion für die Dauer der Formular-Sitzung sichtbar (kein Zurückspringen hinter
  // die Pille beim Leeren).
  //
  // Bündelung (Design-Entscheidung, s. Abschlussbericht): "Präfix/Suffix" ist EIN Pill
  // (geschlossene Einheit wie im v8-Vorbild `_PF_PILLS` "prefix-suffix"). Das v9-Modell
  // hat nur EIN "nick"-Feld (kein separates "Rufname" daneben wie in v8) — deshalb ein
  // einzelner "Rufname"-Pill statt eines Bündels.
  let showPrefixSuffix = $state(untrack(() => person.prefix !== '' || person.suffix !== ''));
  let showNick = $state(untrack(() => person.nick !== ''));
  let showTitle = $state(untrack(() => person.title !== ''));
  let showReligion = $state(untrack(() => person.religion !== ''));
  let showRestriction = $state(untrack(() => person.restriction !== ''));
  let showEmail = $state(untrack(() => person.email !== ''));
  let showWww = $state(untrack(() => person.www !== ''));
  let showChr = $state(untrack(() => isEventPresent(person.chr)));
  let showDeath = $state(untrack(() => isEventPresent(person.death) || person.cause !== ''));
  let showBuri = $state(untrack(() => isEventPresent(person.buri)));

  interface FieldPill {
    id: string;
    label: string;
    activate: () => void;
  }

  /** Identitäts-Pills (Präfix/Suffix, Rufname, Titel, Religion, RESN, E-Mail, Website) —
   *  eigene, räumlich getrennte Reihe bei der Identitäts-Sektion (ADR-v9-30 Nachtrag
   *  "Zwei graphisch getrennte Pill-Gruppen", Spec 20 §2). */
  const identityPills = $derived.by<FieldPill[]>(() => {
    const list: FieldPill[] = [];
    if (!showPrefixSuffix) list.push({ id: 'prefix-suffix', label: 'Präfix / Suffix', activate: () => (showPrefixSuffix = true) });
    if (!showNick) list.push({ id: 'nick', label: 'Rufname', activate: () => (showNick = true) });
    if (!showTitle) list.push({ id: 'title', label: 'Titel', activate: () => (showTitle = true) });
    if (!showReligion) list.push({ id: 'religion', label: 'Religion', activate: () => (showReligion = true) });
    if (!showRestriction) list.push({ id: 'restriction', label: 'Zugriffsbeschränkung', activate: () => (showRestriction = true) });
    if (!showEmail) list.push({ id: 'email', label: 'E-Mail', activate: () => (showEmail = true) });
    if (!showWww) list.push({ id: 'www', label: 'Website', activate: () => (showWww = true) });
    return list;
  });

  /** Ereignis-Pills (Taufe/Tod/Bestattung + Beruf/Wohnort/Auswanderung/Einwanderung/
   *  Militärdienst) — eigene Reihe bei den Sonder-/weiteren Ereignissen. Die generischen
   *  Ereignis-Pills verschwinden, sobald (mindestens) ein Event des jeweiligen Typs in
   *  events[] existiert — der generische "+ Ereignis hinzufügen"-Weg bleibt für einen
   *  ZWEITEN Event desselben Typs (z. B. Berufswechsel, zweite Auswanderung) weiterhin
   *  nutzbar (ADR-v9-30 Punkt 3, Zweiter Nachtrag 2026-07-06). */
  const hasOccu = $derived(events.some((e) => e.type === 'OCCU'));
  const hasResi = $derived(events.some((e) => e.type === 'RESI'));
  const hasEmig = $derived(events.some((e) => e.type === 'EMIG'));
  const hasImmi = $derived(events.some((e) => e.type === 'IMMI'));
  const hasMili = $derived(events.some((e) => e.type === 'MILI'));
  const hasEven = $derived(events.some((e) => e.type === 'EVEN'));

  const eventPills = $derived.by<FieldPill[]>(() => {
    const list: FieldPill[] = [];
    if (!showChr) list.push({ id: 'chr', label: eventTypeLabel('CHR'), activate: () => (showChr = true) });
    if (!showDeath) list.push({ id: 'death', label: eventTypeLabel('DEAT'), activate: () => (showDeath = true) });
    if (!showBuri) list.push({ id: 'buri', label: eventTypeLabel('BURI'), activate: () => (showBuri = true) });
    if (!hasOccu) list.push({ id: 'occu', label: eventTypeLabel('OCCU'), activate: () => addEventOfType('OCCU') });
    if (!hasResi) list.push({ id: 'resi', label: eventTypeLabel('RESI'), activate: () => addEventOfType('RESI') });
    if (!hasEmig) list.push({ id: 'emig', label: eventTypeLabel('EMIG'), activate: () => addEventOfType('EMIG') });
    if (!hasImmi) list.push({ id: 'immi', label: eventTypeLabel('IMMI'), activate: () => addEventOfType('IMMI') });
    if (!hasMili) list.push({ id: 'mili', label: eventTypeLabel('MILI'), activate: () => addEventOfType('MILI') });
    if (!hasEven) list.push({ id: 'even', label: eventTypeLabel('EVEN'), activate: () => addEventOfType('EVEN') });
    return list;
  });

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
      cause: deathCause.trim(),
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
    <select
      aria-label="Datums-Qualifier"
      value={ev.dateQualifier}
      onchange={(e) => {
        ev.dateQualifier = (e.currentTarget as HTMLSelectElement).value as DateQualifier;
        markDateDirty(ev);
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
      value={ev.day ?? ''}
      onchange={(e) => {
        const v = (e.currentTarget as HTMLInputElement).value;
        ev.day = v === '' ? null : Number(v);
        markDateDirty(ev);
      }}
      class="person-form__day"
    />
    <input
      type="text"
      placeholder="Monat"
      aria-label="Monat"
      value={ev.month ?? ''}
      onchange={(e) => onMonthBlur(ev, 'month', (e.currentTarget as HTMLInputElement).value)}
    />
    <input
      type="number"
      placeholder="Jahr"
      aria-label="Jahr"
      value={ev.year ?? ''}
      onchange={(e) => {
        const v = (e.currentTarget as HTMLInputElement).value;
        ev.year = v === '' ? null : Number(v);
        markDateDirty(ev);
      }}
      class="person-form__year"
    />
    {#if ev.dateQualifier === 'BET' || ev.dateQualifier === 'FROM'}
      <span class="person-form__muted">{ev.dateQualifier === 'BET' ? 'und' : 'bis'}</span>
      <input
        type="number"
        placeholder="Tag"
        aria-label="Tag (Ende)"
        value={ev.day2 ?? ''}
        onchange={(e) => {
          const v = (e.currentTarget as HTMLInputElement).value;
          ev.day2 = v === '' ? null : Number(v);
          markDateDirty(ev);
        }}
        class="person-form__day"
      />
      <input
        type="text"
        placeholder="Monat"
        aria-label="Monat (Ende)"
        value={ev.month2 ?? ''}
        onchange={(e) => onMonthBlur(ev, 'month2', (e.currentTarget as HTMLInputElement).value)}
      />
      <input
        type="number"
        placeholder="Jahr"
        aria-label="Jahr (Ende)"
        value={ev.year2 ?? ''}
        onchange={(e) => {
          const v = (e.currentTarget as HTMLInputElement).value;
          ev.year2 = v === '' ? null : Number(v);
          markDateDirty(ev);
        }}
        class="person-form__year"
      />
    {/if}
  </div>
{/snippet}

{#snippet citationList(ev: EditableEvent, labelPrefix: string)}
  <div class="person-form__citations">
    <div class="person-form__citations-head">
      <h5>Quellen</h5>
      <button type="button" class="person-form__add-citation-btn" onclick={() => addCitation(ev)} disabled={sources.length === 0}>
        + Quelle hinzufügen
      </button>
    </div>
    {#each ev.citations as cit, i (i)}
      <SourceCitationRow
        {appState}
        citation={cit}
        index={i}
        {labelPrefix}
        onSourceChange={(id) => setCitationSource(ev, i, id)}
        onPageChange={(page) => setCitationPage(ev, i, page)}
        onQuayChange={(quay) => setCitationQuayAt(ev, i, quay)}
        onNoteChange={(note) => setCitationNote(ev, i, note)}
        onRemove={() => removeCitation(ev, i)}
      />
    {/each}
  </div>
{/snippet}

{#snippet specialEventSection(title2: string, ev: EditableEvent, showCause: boolean, showAddr: boolean)}
  <div class="person-form__event person-form__event--special">
    <h4>{title2}</h4>
    {@render dateFields(ev)}
    <label>
      Ort (Freitext)
      <EventPlaceField
        {appState}
        value={ev.place}
        onTextChange={(v) => {
          ev.place = v;
          ev.placeDirty = true;
        }}
        onPick={(placeId) => pickPlaceFor(ev, placeId)}
        label={`${title2} Ort`}
      />
    </label>
    {#if showAddr}
      <label>
        Adresse
        <EventAddrField
          {appState}
          value={ev.addr}
          onTextChange={(v) => (ev.addr = v)}
          onPick={(hofId) => pickHofFor(ev, hofId)}
          villageId={ev.placeId}
          label={`${title2} Adresse`}
        />
      </label>
    {/if}
    {#if showCause}
      <label>
        Todesursache
        <input type="text" bind:value={deathCause} />
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
        Geschlecht
        <select value={sex} onchange={(e) => (sex = (e.currentTarget as HTMLSelectElement).value as typeof sex)}>
          <option value="M">Männlich</option>
          <option value="F">Weiblich</option>
          <option value="U">Unbekannt</option>
        </select>
      </label>
      {#if showPrefixSuffix}
        <label>
          Präfix
          <input type="text" bind:value={prefix} />
        </label>
        <label>
          Suffix
          <input type="text" bind:value={suffix} />
        </label>
      {/if}
      {#if showNick}
        <label>
          Rufname
          <input type="text" bind:value={nick} />
        </label>
      {/if}
      {#if showTitle}
        <label>
          Titel
          <input type="text" bind:value={title} />
        </label>
      {/if}
      {#if showReligion}
        <label>
          Religion
          <input type="text" bind:value={religion} />
        </label>
      {/if}
      {#if showRestriction}
        <label>
          RESN (Zugriffsbeschränkung)
          <input type="text" bind:value={restriction} placeholder="confidential | locked | privacy" />
        </label>
      {/if}
      {#if showEmail}
        <label>
          E-Mail
          <input type="email" bind:value={email} />
        </label>
      {/if}
      {#if showWww}
        <label>
          Website
          <input type="url" bind:value={www} />
        </label>
      {/if}
    </div>
    <label>
      Notiz
      <textarea bind:value={noteText}></textarea>
    </label>
    {#if identityPills.length > 0}
      <div class="person-form__pill-row" aria-label="Weitere Felder">
        {#each identityPills as pill (pill.id)}
          <button type="button" class="person-form__pill" onclick={pill.activate}>+ {pill.label}</button>
        {/each}
      </div>
    {/if}
  </section>

  <section class="person-form__section">
    <h4>Ereignisse</h4>
    {@render specialEventSection('Geburt (BIRT)', birth, false, false)}
    {#if showChr}
      {@render specialEventSection('Taufe (CHR)', chr, false, false)}
    {/if}
    {#if showDeath}
      {@render specialEventSection('Tod (DEAT)', death, true, false)}
    {/if}
    {#if showBuri}
      {@render specialEventSection('Bestattung (BURI)', buri, false, false)}
    {/if}
    {#if eventPills.length > 0}
      <div class="person-form__pill-row person-form__pill-row--events" aria-label="Weitere Ereignisse">
        {#each eventPills as pill (pill.id)}
          <button type="button" class="person-form__pill" onclick={pill.activate}>+ {pill.label}</button>
        {/each}
      </div>
    {/if}
    {#each events as ev (ev.key)}
      <div class="person-form__event">
        <div class="person-form__event-head">
          <strong>{ev.eventType || eventTypeLabel(ev.type)}</strong>
          <button type="button" class="person-form__remove-btn" onclick={() => removeEvent(ev.key)} aria-label={`Ereignis ${ev.eventType || eventTypeLabel(ev.type)} entfernen`}>✕ Entfernen</button>
        </div>
        {#if ev.type === 'EVEN' || ev.type === 'FACT'}
          <label>
            Typ-Freitext (TYPE)
            <input type="text" bind:value={ev.eventType} />
          </label>
        {/if}
        <label>
          Wert
          <input type="text" bind:value={ev.value} placeholder="z. B. Beruf bei OCCU" />
        </label>
        {@render dateFields(ev)}
        <label>
          Ort (Freitext)
          <EventPlaceField
            {appState}
            value={ev.place}
            onTextChange={(v) => {
              ev.place = v;
              ev.placeDirty = true;
            }}
            onPick={(placeId) => pickPlaceFor(ev, placeId)}
            label={`${eventTypeLabel(ev.type)} Ort`}
          />
        </label>
        {#if HOF_EVENT_TYPES.has(ev.type)}
          <label>
            Adresse
            <EventAddrField
              {appState}
              value={ev.addr}
              onTextChange={(v) => (ev.addr = v)}
              onPick={(hofId) => pickHofFor(ev, hofId)}
              villageId={ev.placeId}
              label={`${eventTypeLabel(ev.type)} Adresse`}
            />
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
          <option value={t}>{eventTypeLabel(t)}</option>
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

  /* Basis-Optik (Hintergrund/Border/Padding/Font) kommt jetzt aus dem globalen
     `input, select, textarea`-Grundstil (design-system.css, INV-UI-4) — hier nur
     noch, wo dieses Formular wirklich abweicht (s. Breiten-Overrides unten). */

  /* Schnellauswahl-Pills (ADR-v9-30 Punkt 3): eigener Stil, bewusst NICHT .stb-pill
     (design-system.css) wiederverwendet — .stb-pill ist ein entfernbarer Chip/Tag
     (Namensvarianten in PlaceDetail), diese Pille ist dagegen ein AKTIVIERUNGS-Button
     ("+ Label" -> blendet ein Feld ein und verschwindet selbst), kein Tag mit
     Remove-Slot. Analog v8-Vorbild `.field-pill` (legacy-v8/ui-forms-person.js). */
  .person-form__pill-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.6rem;
  }

  /* Ereignis-Pills (Taufe/Tod/Bestattung/Beruf/Wohnort) sind räumlich/optisch von den
     Identitäts-Pills getrennt (ADR-v9-30 Nachtrag "Zwei graphisch getrennte Pill-
     Gruppen") — eigener oberer Abstand + dezente Trennlinie statt derselben Reihe. */
  .person-form__pill-row--events {
    margin-top: 0.75rem;
    padding-top: 0.6rem;
    border-top: 1px dashed var(--stb-gold-dim);
  }

  .person-form__pill {
    background: var(--stb-surface-2);
    border: 1px dashed var(--stb-gold-dim);
    color: var(--stb-gold-light);
    border-radius: 999px;
    padding: 0.2rem 0.7rem;
    font-size: 0.78rem;
    cursor: pointer;
  }

  .person-form__pill:hover,
  .person-form__pill:focus-visible {
    border-style: solid;
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
    gap: 0.3rem;
    margin-top: 0.4rem;
  }

  /* ADR-v9-30 Punkt 4 Nachtrag (2026-07-06): Qualifier-Select UND Monat-Feld brauchen
     ebenfalls eine feste/begrenzte geschlossene Feldbreite, sonst bläht die längste
     Qualifier-Option ("zwischen (BET…AND…)") das <select> so weit auf, dass Tag/Monat/
     Jahr auf 375px Viewport-Breite (primäre Mobile-Zielbreite, Spec 21 §2) nicht mehr in
     eine Zeile passen. Das native Dropdown-Menü selbst zeigt trotzdem die vollen Labels —
     nur die GESCHLOSSENE <select>-Breite ist begrenzt (min-width:0 erlaubt das
     Schrumpfen unter die intrinsische Optionsbreite, text-overflow blendet den Rest ab).
     Werte so bemessen, dass Qualifier(5.5rem)+Tag(3.2rem)+Monat(3.6rem)+Jahr(3.2rem) +
     3 Gaps (0.3rem) auf 375px-Viewport (~285px nutzbare Breite in .person-form__event
     nach Padding) in eine Zeile passen — verifiziert per preview_resize(mobile). */
  .person-form__date-row select {
    flex: 0 1 5.5rem;
    min-width: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
  }

  .person-form__date-row input[type='text'] {
    width: 3.6rem;
    flex: 0 0 auto;
  }

  .person-form__day,
  .person-form__year {
    width: 3.2rem;
    flex: 0 0 auto;
  }

  .person-form__date-row input[type='number'] {
    padding-left: 0.3rem;
    padding-right: 0.2rem;
  }

  .person-form__muted {
    color: var(--stb-text-dim);
    font-size: 0.82rem;
  }

  .person-form__citations {
    margin-top: 0.6rem;
  }

  /* Quellen-Widget kompakt (ADR-v9-30 Nachtrag 2026-07-06 Befund 2, INV-UI-5): Überschrift
     + "+ Quelle hinzufügen"-Button in EINER Zeile statt Überschrift/Leerzustand/Button auf
     drei eigenen Zeilen. Der Leerzustand-Text "Keine Quellen zugeordnet." entfällt
     ersatzlos — der Button allein signalisiert bereits den fehlenden Inhalt. */
  .person-form__citations-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.3rem;
  }

  .person-form__citations h5 {
    font-size: 0.8rem;
    color: var(--stb-text-dim);
    margin: 0;
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
