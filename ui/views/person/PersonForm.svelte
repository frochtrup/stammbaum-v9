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
  import type { Person, Event, Citation, Quay } from '../../../core/model/types';
  import { makeEvent, makeCitation } from '../../../core/model/factory';
  import { parseDateValue, formatDateValue, normalizeMonth, type DateQualifier } from '../../../core/model/gedcom-date';
  import { setCitationQuay } from '../../../core/model/citation';
  import { isEventPresent } from '../../../core/model';
  import { HOF_EVENT_TYPES, linkEventToPlace, linkEventToHof } from '../../../core/places';
  import { eventPlaceLabel } from '../../shell/person-display';
  import SourcePicker from '../../shell/SourcePicker.svelte';
  import EventPlaceField from '../../shell/EventPlaceField.svelte';
  import EventAddrField from '../../shell/EventAddrField.svelte';

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
   *  die Qualifier/Tag/Monat/Jahr-Felder direkt daran binden können. ADR-v9-30 Punkt 1:
   *  KEIN hasDate/hasPlace-Gate mehr — stattdessen originalDate/originalPlace (roher
   *  Ursprungswert, Tristate-treu) + dateDirty/placeDirty (wird von JEDEM Change-Handler
   *  am jeweiligen Teilformular gesetzt). Nur wenn der Nutzer das Teilformular tatsächlich
   *  anfasst, wird beim Speichern neu berechnet — sonst bleibt der Rohwert (null/''/Wert)
   *  unangetastet durchgereicht (Roundtrip-Erhaltung, [10 §5.1](10-Domaenenmodell.md)). */
  interface EditableEvent {
    key: string;
    type: string;
    value: string;
    eventType: string;
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
     *  linkEventToHof) — anders als Datum/Ort-Freitext kein Tristate-Dirty-Tracking nötig,
     *  weil das Setzen IMMER explizit über eine Nutzerauswahl passiert (nie stiller Reset). */
    placeId: string | null;
    hofId: string | null;
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
      value: ev.value,
      eventType: ev.eventType,
      dateQualifier: parts?.qualifier ?? 'EXACT',
      day: parts?.day ?? null,
      month: parts?.month ?? null,
      year: parts?.year ?? null,
      day2: parts?.day2 ?? null,
      month2: parts?.month2 ?? null,
      year2: parts?.year2 ?? null,
      originalDate: ev.date,
      dateDirty: false,
      // ADR-v9-47 Punkt 3: bei gesetzter placeId/hofId LIVE aus dem Modell seeden
      // (derselbe Chokepoint-Pfad wie die Listen-Anzeige) statt den ggf. veralteten
      // Cache-Rohwert zu zeigen — NUR der initiale Anzeigewert, s. Modul-Kommentar oben
      // "Live-Anfangswert". Tristate-Erhaltung bleibt unverändert: originalPlace bleibt
      // der ROHE ev.place-Wert, den ein unberührtes Feld beim Speichern unangetastet
      // zurückgibt (Save-Time-No-Op, unschädlich weil Writer/Dirty-Check ohnehin live lesen).
      place: ev.placeId != null || ev.hofId != null ? eventPlaceLabel(ev, appState.placeContext) : (ev.place ?? ''),
      originalPlace: ev.place,
      placeDirty: false,
      placeId: ev.placeId,
      hofId: ev.hofId,
      addr: ev.addr,
      note: ev.note,
      cause,
      citations: ev.citations.map((c) => ({ ...c })),
    };
  }

  /** Markiert das Datums-Teilformular als angefasst — von JEDEM Qualifier/Tag/Monat/Jahr
   *  (inkl. der zweiten BET/FROM-Grenze)-Change-Handler aufgerufen (ADR-v9-30 Punkt 1). */
  function markDateDirty(ev: EditableEvent): void {
    ev.dateDirty = true;
  }

  /** Baut den Roh-Datumsstring aus dem strukturierten Teilformular (Tristate beachtet,
   *  ADR-v9-30 Punkt 1): unberührt (`!dateDirty`) -> Rohwert unverändert; sonst neu
   *  zusammengesetzt (leer -> null = "kein Datum"). Gemeinsam genutzt von `fromEditable`
   *  (Speichern) UND `liveEventFrom` (Picker-Verknüpfung braucht das aktuell angezeigte
   *  Datum für die Jahres-Ableitung, `eventYear`/`buildPlacForGedcom`, ohne DRY zu
   *  verletzen). */
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

  /** Baut ein Event-Objekt aus dem AKTUELLEN Formularzustand (nicht nur dem gespeicherten
   *  Original) — für `linkEventToPlace`/`linkEventToHof`, die den vollen Event-Kontext
   *  (Typ/Datum/Ort/Adresse) für die Jahres-Ableitung + Reprojektion brauchen. Felder
   *  ohne Formular-Entsprechung (lati/long/datePhrase/media/seen) sind hier neutral
   *  belegt — sie fließen weder in die Jahres-Ableitung noch in buildPlacForGedcom ein. */
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

  /** Picker-Auswahl/-Neuanlage eines Ortes (EventPlaceField.onPick, ADR-v9-42): verknüpft
   *  über den Kern-Chokepoint `linkEventToPlace` (ID + Text SOFORT atomar reprojiziert)
   *  und übernimmt das Ergebnis zurück ins Formularfeld (placeDirty, damit `fromEditable`
   *  beim Speichern den reprojizierten Text — nicht den alten Rohwert — verwendet). */
  function pickPlaceFor(target: EditableEvent, placeId: string): void {
    const live = liveEventFrom(target);
    linkEventToPlace(live, placeId, appState.placeContext);
    target.place = live.place ?? '';
    target.placeId = live.placeId;
    target.placeDirty = true;
  }

  /** Picker-Auswahl/-Neuanlage eines Hofes (EventAddrField.onPick, ADR-v9-42): analog
   *  pickPlaceFor, aber über `linkEventToHof` — reprojiziert `place` UND füllt `addr`
   *  (nur wenn bisher leer, s. Kommentar an linkEventToHof). */
  function pickHofFor(target: EditableEvent, hofId: string): void {
    const live = liveEventFrom(target);
    linkEventToHof(live, hofId, appState.placeContext);
    target.place = live.place ?? '';
    target.addr = live.addr;
    target.hofId = live.hofId;
    target.placeDirty = true;
  }

  /** Baut das strukturierte Formular-Ereignis zurück in ein Event (Tristate beachtet,
   *  Spec 10 §5.1 "date/place unterscheiden null/''/Wert"). placeId/hofId werden jetzt
   *  aus dem Formularzustand übernommen (ADR-v9-42 — Picker kann sie SOFORT setzen,
   *  s. pickPlaceFor/pickHofFor), nicht mehr blind vom Original übernommen. */
  function fromEditable(original: Event, e: EditableEvent): Event {
    const date = computeDate(e);
    const place = !e.placeDirty ? e.originalPlace : (e.place === '' ? null : e.place);
    return {
      ...original,
      type: e.type,
      value: e.value,
      eventType: e.eventType,
      date,
      place,
      placeId: e.placeId,
      hofId: e.hofId,
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

  function onMonthBlur(target: EditableEvent, field: 'month' | 'month2', raw: string) {
    target[field] = normalizeMonth(raw);
    markDateDirty(target);
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
    if (!showChr) list.push({ id: 'chr', label: 'Taufe', activate: () => (showChr = true) });
    if (!showDeath) list.push({ id: 'death', label: 'Tod', activate: () => (showDeath = true) });
    if (!showBuri) list.push({ id: 'buri', label: 'Bestattung', activate: () => (showBuri = true) });
    if (!hasOccu) list.push({ id: 'occu', label: 'Beruf', activate: () => addEventOfType('OCCU') });
    if (!hasResi) list.push({ id: 'resi', label: 'Wohnort', activate: () => addEventOfType('RESI') });
    if (!hasEmig) list.push({ id: 'emig', label: 'Auswanderung', activate: () => addEventOfType('EMIG') });
    if (!hasImmi) list.push({ id: 'immi', label: 'Einwanderung', activate: () => addEventOfType('IMMI') });
    if (!hasMili) list.push({ id: 'mili', label: 'Militärdienst', activate: () => addEventOfType('MILI') });
    if (!hasEven) list.push({ id: 'even', label: 'Ereignis', activate: () => addEventOfType('EVEN') });
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
      <div class="person-form__citation-row">
        <SourcePicker
          {appState}
          value={cit.sourceId}
          onChange={(id) => setCitationSource(ev, i, id ?? '')}
          label={`${labelPrefix} Quelle ${i + 1}`}
        />
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
          <strong>{ev.type}</strong>
          <button type="button" class="person-form__remove-btn" onclick={() => removeEvent(ev.key)} aria-label={`Ereignis ${ev.type} entfernen`}>✕ Entfernen</button>
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
            label={`${ev.type} Ort`}
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
