<script lang="ts">
  // ui/views/family/FamilyForm.svelte — Familien-Editor (Spec 20 §2 Formular-Feldtabelle
  // "Familie": "Eltern (Dropdown), Heirat + Verlobung, Kinder ±, Quellen"). Baut analog
  // ui/views/person/PersonForm.svelte (Bottom-Sheet, value/onchange-Muster statt
  // bind:value bei <select> — bekannter happy-dom-Testbug, appState.saveFamily(model) mit
  // dem KOMPLETTEN Objekt statt Feld-Settern aus dem DOM).
  //
  // Eltern-Dropdowns und der Kinder-Picker lesen appState.db.individuals NUR lesend
  // (Chokepoint-Query) — die eigentliche INDI-Seiten-Synchronisation (childOf/parentIn)
  // übernimmt der Kern (core/model/commands.ts saveFamily) beim Speichern, NICHT dieses
  // Formular (INV-P3 bleibt an EINER Stelle verantwortet).
  //
  // Evidenz-Achsen (eval) sind wie bei PersonForm auskommentiert (TODO Folgeschritt).
  //
  // ADR-v9-30 Punkt 1 (Datum-Dirty-Tracking) + Punkt 3 (Schnellauswahl-Pills) + Punkt 4
  // (kompakte Zeilen, INV-UI-5), analog PersonForm.svelte: Heirat ist IMMER offen (feste
  // Sektion, kein Pill); Verlobung erscheint als "+ Verlobung"-Pill, solange sie leer ist
  // (isEventPresent), UND an ihrer KANONISCHEN GEDCOM-Position VOR der Heirat (ENGA vor
  // MARR, [10 §5.1](../../../specs/v9/10-Domaenenmodell.md)/GEDCOM.md) — anders als bei
  // Person, wo Tod NACH Geburt kommt. Beide Sonder-Ereignisse + events[] teilen sich EINE
  // Überschrift "Ereignisse" (ersetzt die zuvor getrennten Überschriften "Sonder-
  // Ereignisse"/"Weitere Ereignisse"). Kein Beruf/Wohnort-Analogon (Personen-Ereignisse).
  import { untrack } from 'svelte';
  import type { AppState } from '../../shell/app-state.svelte';
  import type { Family, Event, Citation, Quay, PersonId } from '../../../core/model/types';
  import { makeEvent, makeCitation } from '../../../core/model/factory';
  import { parseDateValue, formatDateValue, normalizeMonth, type DateQualifier } from '../../../core/model/gedcom-date';
  import { setCitationQuay } from '../../../core/model/citation';
  import { isEventPresent } from '../../../core/model';
  import { HOF_EVENT_TYPES, linkEventToPlace, linkEventToHof } from '../../../core/places';
  import { displayName, eventPlaceLabel } from '../../shell/person-display';
  import PersonPicker from '../../shell/PersonPicker.svelte';
  import SourceCitationRow from '../../shell/SourceCitationRow.svelte';
  import EventPlaceField from '../../shell/EventPlaceField.svelte';
  import EventAddrField from '../../shell/EventAddrField.svelte';

  interface Props {
    appState: AppState;
    /** Die zu bearbeitende Familie (bereits existierend ODER frisch angelegtes Gerüst). */
    family: Family;
    /** Nach erfolgreichem Speichern (z. B. um zur Detailansicht zurückzukehren). */
    onSaved?: (familyId: string) => void;
    /** Abbrechen ohne Speichern. */
    onCancel?: () => void;
  }
  const { appState, family, onSaved, onCancel }: Props = $props();

  /** Gängige GEDCOM-Event-Tags für "weitere Ereignisse hinzufügen" (Spec 20 §2, FAM-Ebene). */
  const EVENT_TYPE_OPTIONS = ['EVEN', 'CENS', 'PROP', 'FACT'] as const;

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
   *  die Qualifier/Tag/Monat/Jahr-Felder direkt daran binden können (analog PersonForm).
   *  ADR-v9-30 Punkt 1: KEIN hasDate/hasPlace-Gate mehr — stattdessen originalDate/
   *  originalPlace (roher Ursprungswert, Tristate-treu) + dateDirty/placeDirty (wird von
   *  JEDEM Change-Handler am jeweiligen Teilformular gesetzt). Nur wenn der Nutzer das
   *  Teilformular tatsächlich anfasst, wird beim Speichern neu berechnet — sonst bleibt
   *  der Rohwert (null/''/Wert) unangetastet durchgereicht (Roundtrip-Erhaltung,
   *  [10 §5.1](../../../specs/v9/10-Domaenenmodell.md)). */
  interface EditableEvent {
    key: string;
    type: string;
    eventType: string;
    value: string;
    dateQualifier: DateQualifier;
    day: number | null;
    month: string | null;
    year: number | null;
    day2: number | null;
    month2: string | null;
    year2: number | null;
    originalDate: string | null;
    dateDirty: boolean;
    place: string;
    originalPlace: string | null;
    placeDirty: boolean;
    /** ADR-v9-42: über EventPlaceField/EventAddrField per Picker gesetzt (linkEventToPlace/
     *  linkEventToHof) — analog PersonForm.svelte. */
    placeId: string | null;
    hofId: string | null;
    addr: string;
    note: string;
    citations: Citation[];
  }

  function toEditable(key: string, ev: Event): EditableEvent {
    const parts = ev.date != null ? parseDateValue(ev.date) : null;
    return {
      key,
      type: ev.type,
      eventType: ev.eventType,
      value: ev.value,
      dateQualifier: parts?.qualifier ?? 'EXACT',
      day: parts?.day ?? null,
      month: parts?.month ?? null,
      year: parts?.year ?? null,
      day2: parts?.day2 ?? null,
      month2: parts?.month2 ?? null,
      year2: parts?.year2 ?? null,
      originalDate: ev.date,
      dateDirty: false,
      // ADR-v9-47 Punkt 3 (analog PersonForm.svelte): Live-Anfangswert bei gesetzter
      // placeId/hofId, Tristate-Erhaltung bleibt unverändert (originalPlace bleibt roh).
      place: ev.placeId != null || ev.hofId != null ? eventPlaceLabel(ev, appState.placeContext) : (ev.place ?? ''),
      originalPlace: ev.place,
      placeDirty: false,
      placeId: ev.placeId,
      hofId: ev.hofId,
      addr: ev.addr,
      note: ev.note,
      citations: ev.citations.map((c) => ({ ...c })),
    };
  }

  /** Markiert das Datums-Teilformular als angefasst — von JEDEM Qualifier/Tag/Monat/Jahr
   *  (inkl. der zweiten BET/FROM-Grenze)-Change-Handler aufgerufen (ADR-v9-30 Punkt 1). */
  function markDateDirty(ev: EditableEvent): void {
    ev.dateDirty = true;
  }

  /** Baut den Roh-Datumsstring aus dem strukturierten Teilformular (analog PersonForm.svelte
   *  computeDate) — gemeinsam genutzt von fromEditable (Speichern) UND liveEventFrom
   *  (Picker-Verknüpfung braucht das aktuell angezeigte Datum für die Jahres-Ableitung). */
  function computeDate(e: EditableEvent): string | null {
    if (!e.dateDirty) return e.originalDate;
    const formatted = formatDateValue({
      qualifier: e.dateQualifier,
      day: e.day,
      month: e.month,
      year: e.year,
      day2: e.day2,
      month2: e.month2,
      year2: e.year2,
    });
    return formatted === '' ? null : formatted;
  }

  /** Baut ein Event-Objekt aus dem AKTUELLEN Formularzustand (analog PersonForm.svelte) —
   *  für linkEventToPlace/linkEventToHof. */
  function liveEventFrom(e: EditableEvent): Event {
    return {
      type: e.type,
      value: e.value,
      eventType: e.eventType,
      date: computeDate(e),
      datePhrase: '',
      place: e.place === '' ? null : e.place,
      placeId: e.placeId,
      hofId: e.hofId,
      lati: null,
      long: null,
      addr: e.addr,
      note: e.note,
      citations: e.citations,
      media: [],
      seen: true,
    };
  }

  /** Picker-Auswahl/-Neuanlage eines Ortes (EventPlaceField.onPick, ADR-v9-42, analog
   *  PersonForm.svelte). */
  function pickPlaceFor(target: EditableEvent, placeId: string): void {
    const live = liveEventFrom(target);
    linkEventToPlace(live, placeId, appState.placeContext);
    target.place = live.place ?? '';
    target.placeId = live.placeId;
    target.placeDirty = true;
  }

  /** Picker-Auswahl/-Neuanlage eines Hofes (EventAddrField.onPick, ADR-v9-42, analog
   *  PersonForm.svelte). */
  function pickHofFor(target: EditableEvent, hofId: string): void {
    const live = liveEventFrom(target);
    linkEventToHof(live, hofId, appState.placeContext);
    target.place = live.place ?? '';
    target.addr = live.addr;
    target.hofId = live.hofId;
    target.placeDirty = true;
  }

  /** Baut das strukturierte Formular-Ereignis zurück in ein Event (Tristate beachtet,
   *  Spec 10 §5.1 "date/place unterscheiden null/''/Wert"). placeId/hofId kommen jetzt
   *  aus dem Formularzustand (ADR-v9-42 — Picker kann sie SOFORT setzen). */
  function fromEditable(original: Event, e: EditableEvent): Event {
    const date = computeDate(e);
    const place = !e.placeDirty ? e.originalPlace : (e.place === '' ? null : e.place);
    return {
      ...original,
      type: e.type,
      eventType: e.eventType,
      value: e.value,
      date,
      place,
      placeId: e.placeId,
      hofId: e.hofId,
      addr: e.addr,
      note: e.note,
      citations: e.citations,
    };
  }

  // Formular-Zustand wird NUR beim Mount aus der übergebenen Familie initialisiert (analog
  // PersonForm) — kein fortlaufendes Re-Sync, falls sich appState.db während des Editierens
  // ändert. FamilyDetail rendert FamilyForm ohnehin frisch (neuer Mount) bei "Bearbeiten".

  // --- Eltern ---
  let husband = $state(untrack(() => family.husband));
  let wife = $state(untrack(() => family.wife));

  // --- Kinder (± Liste, Ziel-Reihenfolge wie im Formular gezeigt) ---
  // Vereinfacht ggü. dem bisherigen zweistufigen "auswählen dann + Kind hinzufügen"-Muster
  // (ADR-v9-30 Punkt 2, Aufgabenbeschreibung "darf vereinfacht werden"): der PersonPicker
  // wählt direkt -> Kind ist sofort in der Liste, kein Zwischenschritt/Bestätigungs-Klick
  // mehr nötig. `excludeIds={children}` ersetzt die bisherige `availableChildren`-Berechnung
  // (identische Filterlogik: bereits zugeordnete Kinder werden nicht nochmal angeboten).
  let children = $state<PersonId[]>(untrack(() => family.children.slice()));

  function addChild(id: PersonId | null) {
    if (!id || children.includes(id)) return;
    children = [...children, id];
  }

  function removeChild(id: string) {
    children = children.filter((cid) => cid !== id);
  }

  function personLabel(id: string): string {
    const p = appState.db.individuals.get(id);
    return p ? displayName(p) : id;
  }

  // --- Heirat (MARR) + Verlobung (ENGA) — Sonder-Ereignisse (Spec 10 §5.1). Heirat ist
  // IMMER offen (häufigstes Feld); Verlobung ist ADR-v9-30-Pill-gesteuert (s. u.) und
  // erscheint an ihrer KANONISCHEN Position VOR der Heirat (ENGA vor MARR, GEDCOM.md). ---
  let marriage = $state(untrack(() => toEditable('MARR', family.marriage)));
  let engagement = $state(untrack(() => toEditable('ENGA', family.engagement)));

  // --- weitere Ereignisse (events[]) ---
  let events = $state(untrack(() => family.events.map((ev, i) => toEditable(`ev-${i}`, ev))));
  let newEventType = $state<string>(EVENT_TYPE_OPTIONS[0]);
  let eventKeySeq = untrack(() => events.length);

  function addEvent() {
    addEventOfType(newEventType);
  }

  /** Fügt sofort ein Ereignis eines festen Typs hinzu (ADR-v9-30 Nachtrag Befund 2:
   *  "+ Ereignis"-Pill für EVEN) — derselbe Mechanismus wie addEvent(), nur ohne den Umweg
   *  über Typ-Dropdown + Button-Klick (analog PersonForm.svelte addEventOfType). */
  function addEventOfType(type: string): void {
    const fresh = makeEvent(type);
    eventKeySeq += 1;
    events = [...events, toEditable(`new-${eventKeySeq}`, fresh)];
  }

  function removeEvent(key: string) {
    events = events.filter((e) => e.key !== key);
  }

  // --- Notiz + Familien-Quellen ---
  let noteText = $state(untrack(() => family.noteText));
  let citations = $state<Citation[]>(untrack(() => family.citations.map((c) => ({ ...c }))));

  // --- Quellen-Widget (pro Ereignis UND für die Familien-Quellen-Liste) ---
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

  function addFamilyCitation() {
    if (sources.length === 0) return;
    citations = [...citations, makeCitation(sources[0].id)];
  }

  function removeFamilyCitation(index: number) {
    citations = citations.filter((_, i) => i !== index);
  }

  function setFamilyCitationSource(index: number, sourceId: string) {
    citations = citations.map((c, i) => (i === index ? { ...c, sourceId } : c));
  }

  function setFamilyCitationPage(index: number, page: string) {
    citations = citations.map((c, i) => (i === index ? { ...c, page } : c));
  }

  function setFamilyCitationNote(index: number, note: string) {
    citations = citations.map((c, i) => (i === index ? { ...c, note } : c));
  }

  function setFamilyCitationQuay(index: number, quay: Quay) {
    citations = citations.map((c, i) => (i === index ? setCitationQuay(c, quay) : c));
  }

  function onMonthBlur(target: EditableEvent, field: 'month' | 'month2', raw: string) {
    target[field] = normalizeMonth(raw);
    markDateDirty(target);
  }

  // --- Schnellauswahl-Pills (ADR-v9-30 Punkt 3) ---------------------------------------
  // Sichtbarkeits-Kriterium "gefüllt schlägt selten" (analog PersonForm): Verlobung
  // erscheint als Pill NUR, wenn sie leer/nicht vorhanden ist (isEventPresent). Ist sie
  // bereits befüllt (importiert), ist sie sofort inline sichtbar, kein Pill nötig.
  let showEngagement = $state(untrack(() => isEventPresent(family.engagement)));

  interface FieldPill {
    id: string;
    label: string;
    activate: () => void;
  }

  /** Familie hat außer Verlobung noch den generischen "+ Ereignis"-Pill für EVEN (ADR-v9-30
   *  Nachtrag Befund 2, [20 §2](../../../specs/v9/20-Funktionen.md)) — kein Beruf/Wohnort-
   *  Analogon (das sind Personen-Ereignisse). Sichtbarkeitskriterium für EVEN identisch zu
   *  PersonForm: erscheint nur, solange kein events[]-Eintrag vom Typ EVEN existiert. */
  const hasEven = $derived(events.some((e) => e.type === 'EVEN'));

  const eventPills = $derived.by<FieldPill[]>(() => {
    const list: FieldPill[] = [];
    if (!showEngagement) list.push({ id: 'engagement', label: 'Verlobung', activate: () => (showEngagement = true) });
    if (!hasEven) list.push({ id: 'even', label: 'Ereignis', activate: () => addEventOfType('EVEN') });
    return list;
  });

  function save() {
    const next: Family = {
      ...family,
      husband,
      wife,
      children: children.slice(),
      marriage: fromEditable(family.marriage, marriage),
      engagement: fromEditable(family.engagement, engagement),
      events: events.map((e, i) => fromEditable(family.events[i] ?? makeEvent(e.type), e)),
      noteText,
      citations,
    };
    appState.saveFamily(next);
    onSaved?.(next.id);
  }

  function cancel() {
    onCancel?.();
  }
</script>

{#snippet dateFields(ev: EditableEvent)}
  <div class="family-form__date-row">
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
      class="family-form__day"
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
      class="family-form__year"
    />
    {#if ev.dateQualifier === 'BET' || ev.dateQualifier === 'FROM'}
      <span class="family-form__muted">{ev.dateQualifier === 'BET' ? 'und' : 'bis'}</span>
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
        class="family-form__day"
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
        class="family-form__year"
      />
    {/if}
  </div>
{/snippet}

{#snippet citationList(ev: EditableEvent, labelPrefix: string)}
  <div class="family-form__citations">
    <div class="family-form__citations-head">
      <h5>Quellen</h5>
      <button type="button" class="family-form__add-citation-btn" onclick={() => addCitation(ev)} disabled={sources.length === 0}>
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

{#snippet specialEventSection(title2: string, ev: EditableEvent)}
  <div class="family-form__event family-form__event--special">
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
    <label>
      Notiz
      <textarea bind:value={ev.note}></textarea>
    </label>
    {@render citationList(ev, title2)}
  </div>
{/snippet}

<div class="family-form">
  <h3>{family.husband || family.wife || family.children.length > 0 ? 'Familie bearbeiten' : 'Neue Familie'}</h3>

  <section class="family-form__section">
    <h4>Eltern</h4>
    <div class="family-form__grid">
      <label>
        Ehemann
        <PersonPicker
          {appState}
          value={husband}
          onChange={(id) => (husband = id)}
          allowNone={true}
          noneLabel="— kein Elternteil —"
          label="Ehemann"
        />
      </label>
      <label>
        Ehefrau
        <PersonPicker
          {appState}
          value={wife}
          onChange={(id) => (wife = id)}
          allowNone={true}
          noneLabel="— kein Elternteil —"
          label="Ehefrau"
        />
      </label>
    </div>
  </section>

  <section class="family-form__section">
    <h4>Ereignisse</h4>
    <!-- ADR-v9-30 Nachtrag: EINE gemeinsame Überschrift für Sonder-Ereignisse + events[]
         (ersetzt die zuvor getrennten Überschriften "Sonder-Ereignisse"/"Weitere
         Ereignisse"). Reihenfolge: Verlobung (isEventPresent-gesteuert, kanonisch VOR der
         Heirat — GEDCOM-Schreibreihenfolge ENGA vor MARR, anders als Person wo Tod NACH
         Geburt kommt) -> Heirat (immer offen) -> Ereignis-Pill-Reihe (nur "+ Verlobung",
         falls noch nicht gezeigt) -> aktivierte/weitere events[]-Einträge. -->
    {#if showEngagement}
      {@render specialEventSection('Verlobung (ENGA)', engagement)}
    {/if}
    {@render specialEventSection('Heirat (MARR)', marriage)}
    {#if eventPills.length > 0}
      <div class="family-form__pill-row family-form__pill-row--events" aria-label="Weitere Ereignisse">
        {#each eventPills as pill (pill.id)}
          <button type="button" class="family-form__pill" onclick={pill.activate}>+ {pill.label}</button>
        {/each}
      </div>
    {/if}
    {#each events as ev (ev.key)}
      <div class="family-form__event">
        <div class="family-form__event-head">
          <strong>{ev.type}</strong>
          <button type="button" class="family-form__remove-btn" onclick={() => removeEvent(ev.key)} aria-label={`Ereignis ${ev.type} entfernen`}>✕ Entfernen</button>
        </div>
        {#if ev.type === 'EVEN' || ev.type === 'FACT'}
          <label>
            Typ-Freitext (TYPE)
            <input type="text" bind:value={ev.eventType} />
          </label>
        {/if}
        <label>
          Wert
          <input type="text" bind:value={ev.value} />
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
            label={`${ev.type} Ort`}
          />
        </label>
        {#if HOF_EVENT_TYPES.has(ev.type)}
          <!-- ADR-v9-41-Fund/TST-9: FamilyForm hatte für CENS/PROP (beide in
               HOF_EVENT_TYPES, Spec 11 §3) BISHER GAR KEIN Adresse-Feld — geschlossen
               im selben Zug wie die generalisierte Picker-Verdrahtung (ADR-v9-42). -->
          <label>
            Adresse
            <EventAddrField
              {appState}
              value={ev.addr}
              onTextChange={(v) => (ev.addr = v)}
              onPick={(hofId) => pickHofFor(ev, hofId)}
              villageId={ev.placeId}
              label={`${ev.type} Adresse`}
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
    <div class="family-form__add-row">
      <select aria-label="Neuer Ereignis-Typ" value={newEventType} onchange={(e) => (newEventType = (e.currentTarget as HTMLSelectElement).value)}>
        {#each EVENT_TYPE_OPTIONS as t (t)}
          <option value={t}>{t}</option>
        {/each}
      </select>
      <button type="button" onclick={addEvent}>+ Ereignis hinzufügen</button>
    </div>
  </section>

  <section class="family-form__section">
    <h4>Kinder</h4>
    {#if children.length === 0}
      <p class="family-form__muted">Keine Kinder zugeordnet.</p>
    {:else}
      <ul class="family-form__children">
        {#each children as childId (childId)}
          <li>
            <span class="family-form__child-name">{personLabel(childId)}</span>
            <button
              type="button"
              class="family-form__remove-btn"
              onclick={() => removeChild(childId)}
              aria-label={`Kind ${personLabel(childId)} entfernen`}
            >
              ✕
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    <div class="family-form__add-row">
      <PersonPicker
        {appState}
        value={null}
        onChange={addChild}
        excludeIds={children}
        label="Kind hinzufügen"
        placeholder="Kind hinzufügen…"
      />
    </div>
  </section>

  <section class="family-form__section">
    <h4>Notiz & Familien-Quellen</h4>
    <label>
      Notiz
      <textarea bind:value={noteText}></textarea>
    </label>
    <div class="family-form__citations">
      <div class="family-form__citations-head">
        <h5>Quellen (Familie)</h5>
        <button type="button" class="family-form__add-citation-btn" onclick={addFamilyCitation} disabled={sources.length === 0}>
          + Quelle hinzufügen
        </button>
      </div>
      {#each citations as cit, i (i)}
        <SourceCitationRow
          {appState}
          citation={cit}
          index={i}
          labelPrefix="Familie"
          onSourceChange={(id) => setFamilyCitationSource(i, id)}
          onPageChange={(page) => setFamilyCitationPage(i, page)}
          onQuayChange={(quay) => setFamilyCitationQuay(i, quay)}
          onNoteChange={(note) => setFamilyCitationNote(i, note)}
          onRemove={() => removeFamilyCitation(i)}
        />
      {/each}
    </div>
  </section>

  <div class="family-form__actions">
    <button type="button" class="family-form__save-btn" onclick={save}>Speichern</button>
    <button type="button" class="family-form__cancel-btn" onclick={cancel}>Abbrechen</button>
  </div>
</div>

<style>
  .family-form {
    padding: 1rem;
    overflow-y: auto;
    background: var(--stb-surface-1);
    border-radius: var(--stb-radius-card);
  }

  .family-form__section {
    margin-top: 1.25rem;
  }

  .family-form__section h4 {
    font-size: 0.95rem;
    color: var(--stb-gold-light);
    margin-bottom: 0.4rem;
  }

  .family-form__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 0.5rem;
  }

  .family-form label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.8rem;
    color: var(--stb-text-dim);
    margin-top: 0.4rem;
  }

  .family-form input,
  .family-form select,
  .family-form textarea {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.5rem;
    font: inherit;
  }

  /* Schnellauswahl-Pills (ADR-v9-30 Punkt 3, analog PersonForm.svelte): eigener Stil,
     bewusst NICHT .stb-pill (design-system.css) wiederverwendet — .stb-pill ist ein
     entfernbarer Chip/Tag, diese Pille ist dagegen ein AKTIVIERUNGS-Button ("+ Label"
     -> blendet eine Sektion ein und verschwindet selbst), kein Tag mit Remove-Slot. */
  .family-form__pill-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.6rem;
  }

  .family-form__pill-row--events {
    padding-top: 0.6rem;
    border-top: 1px dashed var(--stb-gold-dim);
  }

  .family-form__pill {
    background: var(--stb-surface-2);
    border: 1px dashed var(--stb-gold-dim);
    color: var(--stb-gold-light);
    border-radius: 999px;
    padding: 0.2rem 0.7rem;
    font-size: 0.78rem;
    cursor: pointer;
  }

  .family-form__pill:hover,
  .family-form__pill:focus-visible {
    border-style: solid;
  }

  .family-form__event {
    background: var(--stb-surface-2);
    border-radius: var(--stb-radius-card);
    padding: 0.6rem 0.8rem;
    margin-bottom: 0.75rem;
  }

  .family-form__event--special {
    border-left: 3px solid var(--stb-gold-dim);
  }

  .family-form__event h4 {
    margin: 0 0 0.3rem;
    font-size: 0.88rem;
    color: var(--stb-gold-light);
  }

  .family-form__event-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .family-form__date-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
    margin-top: 0.4rem;
  }

  /* ADR-v9-30 Punkt 4 (INV-UI-5, analog PersonForm.svelte Nachtrag 2026-07-06): Qualifier-
     Select UND Monat-Feld brauchen ebenfalls eine feste/begrenzte geschlossene Feldbreite,
     sonst bläht die längste Qualifier-Option ("zwischen (BET…AND…)") das <select> so weit
     auf, dass Tag/Monat/Jahr auf 375px Viewport-Breite (primäre Mobile-Zielbreite, Spec
     21 §2) nicht mehr in eine Zeile passen. Das native Dropdown-Menü selbst zeigt trotzdem
     die vollen Labels — nur die GESCHLOSSENE <select>-Breite ist begrenzt (min-width:0
     erlaubt das Schrumpfen unter die intrinsische Optionsbreite, text-overflow blendet den
     Rest ab). Gleiche Werte/Technik wie PersonForm.svelte. */
  .family-form__date-row select {
    flex: 0 1 5.5rem;
    min-width: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
  }

  .family-form__date-row input[type='text'] {
    width: 3.6rem;
    flex: 0 0 auto;
  }

  .family-form__day,
  .family-form__year {
    width: 3.2rem;
    flex: 0 0 auto;
  }

  .family-form__date-row input[type='number'] {
    padding-left: 0.3rem;
    padding-right: 0.2rem;
  }

  .family-form__muted {
    color: var(--stb-text-dim);
    font-size: 0.82rem;
  }

  .family-form__citations {
    margin-top: 0.6rem;
  }

  .family-form__citations h5 {
    font-size: 0.8rem;
    color: var(--stb-text-dim);
    margin: 0;
  }

  /* ADR-v9-30 Nachtrag Befund 2 (INV-UI-5): Überschrift + "+ Quelle hinzufügen" in einer
     Zeile statt gestapelt; der Leerzustand-Text entfällt ersatzlos (der Button allein zeigt
     bereits, dass keine Quelle zugeordnet ist). */
  .family-form__citations-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 0.3rem;
  }

  .family-form__remove-btn {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
    font-size: 0.8rem;
  }

  .family-form__add-citation-btn,
  .family-form__add-row button {
    background: var(--stb-surface-3);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    font-size: 0.82rem;
  }

  .family-form__add-citation-btn:disabled,
  .family-form__add-row button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .family-form__add-row {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    margin-top: 0.5rem;
  }

  .family-form__children {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .family-form__children li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.35rem 0;
    border-bottom: 1px solid var(--stb-surface-2);
  }

  .family-form__child-name {
    color: var(--stb-text);
  }

  .family-form__actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 1.25rem;
  }

  .family-form__save-btn,
  .family-form__cancel-btn {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.45rem 1rem;
    cursor: pointer;
    font-weight: 600;
  }

  .family-form__cancel-btn {
    background: var(--stb-surface-3);
    color: var(--stb-text);
  }
</style>
