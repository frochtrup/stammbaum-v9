<script lang="ts">
  // ui/views/person/PersonForm.svelte — Personen-Editor, REDUZIERT auf reine
  // Identitätsfelder (ADR-v9-63, Spec 20 §2 Formular-Feldtabelle "Person (Toggle-
  // Formular, nur Identität)"): Name (Vor-/Nachname, Präfix, Suffix, Rufname),
  // Geschlecht, Titel, Religion, Notiz, RESN, E-Mail, Website + die unveränderten
  // Identitäts-Pills (Präfix+Suffix, Rufname, Titel, Religion, RESN, E-Mail, Website).
  //
  // ALLE Ereignis-Bearbeitungslogik (Geburt/Taufe/Tod/Bestattung/generische Events/
  // Ereignis-Pills) ist ENTFERNT — das ist Rückbau von jetzt totem Duplikat-Code, kein
  // Feld-/Funktionsverlust: die Logik lebt bereits vollständig in `ui/shell/event-edit.ts`
  // + `ui/shell/EventEditModal.svelte` (ADR-v9-60) und ist direkt auf `PersonDetail.svelte`
  // verankert (die gestufte Ereignis-Pill-Reihe nach ADR-v9-62, dort implementiert).
  // `person.birth/chr/death/cause/buri/events` bleiben beim Speichern UNVERÄNDERT
  // erhalten (per `...person`-Spread) — dieses Formular liest/schreibt sie schlicht nicht.
  //
  // Baut analog PlaceDetail.svelte (inline-Editier-Abschnitt, appState.savePerson(model)
  // mit dem KOMPLETTEN Objekt) — kein Feld-Setter-Pattern aus dem DOM.
  import { untrack } from 'svelte';
  import type { AppState } from '../../shell/app-state.svelte';
  import type { Person } from '../../../core/model/types';
  import { composeGedcomName } from '../../../core/model/name-parts';

  interface Props {
    appState: AppState;
    /** Die zu bearbeitende Person (bereits existierend ODER frisch angelegtes Gerüst). */
    person: Person;
    /** Nach erfolgreichem Speichern (z. B. um zur Detailansicht zurückzukehren). */
    onSaved?: (personId: string) => void;
    /**
     * NUR für den Wegwerf-Entwurf: setzt der Aufrufer diese Prop, ist das Formular eine
     * transiente ANLAGE-Fläche (Picker „+ neu anlegen") ohne eigenen Ausgang — dann
     * schließt der Sekundär-Knopf sie („Abbrechen"), und Feldwerte zu verwerfen wäre
     * dasselbe wie sie wegzuwerfen. Auf einer Detailseite bleibt sie WEG: dort trägt die
     * Kopfzeile den Ausgang, und der Knopf verwirft nur die Feldwerte („Verwerfen",
     * INV-UI-16/ADR-v9-193). Ein Knopf, der beides täte, war genau der behobene Defekt.
     */
    onCancel?: () => void;
  }
  const { appState, person, onSaved, onCancel }: Props = $props();

  // Formular-Zustand wird NUR beim Mount aus der übergebenen Person initialisiert
  // (TST-10-Muster, `untrack(...)`) — kein fortlaufendes Re-Sync, falls sich
  // appState.db während des Editierens änderte. PersonDetail rendert PersonForm ohnehin
  // frisch (neuer Mount) bei jedem "Bearbeiten".
  let given = $state(untrack(() => person.given));
  let surname = $state(untrack(() => person.surname));
  let prefix = $state(untrack(() => person.prefix));
  let suffix = $state(untrack(() => person.suffix));
  let nick = $state(untrack(() => person.nick));
  let sex = $state(untrack(() => person.sex));
  let title = $state(untrack(() => person.title));

  let noteText = $state(untrack(() => person.noteText));
  let restriction = $state(untrack(() => person.restriction));
  let email = $state(untrack(() => person.email));
  let www = $state(untrack(() => person.www));

  // --- Schnellauswahl-Pills (ADR-v9-30 Punkt 3) ---------------------------------------
  // Sichtbarkeits-Kriterium "gefüllt schlägt selten": ein Pill-Feld erscheint NUR wenn
  // leer/nicht vorhanden. Einmal aktiviert (durch Nutzerklick ODER weil das Feld beim
  // Laden schon befüllt war) bleibt die Sektion für die Dauer der Formular-Sitzung
  // sichtbar (kein Zurückspringen hinter die Pille beim Leeren).
  //
  // Bündelung (Design-Entscheidung, s. Abschlussbericht): "Präfix/Suffix" ist EIN Pill
  // (geschlossene Einheit wie im v8-Vorbild `_PF_PILLS` "prefix-suffix"). Das v9-Modell
  // hat nur EIN "nick"-Feld (kein separates "Rufname" daneben wie in v8) — deshalb ein
  // einzelner "Rufname"-Pill statt eines Bündels.
  let showPrefixSuffix = $state(untrack(() => person.prefix !== '' || person.suffix !== ''));
  let showNick = $state(untrack(() => person.nick !== ''));
  let showTitle = $state(untrack(() => person.title !== ''));
  let showRestriction = $state(untrack(() => person.restriction !== ''));
  let showEmail = $state(untrack(() => person.email !== ''));
  let showWww = $state(untrack(() => person.www !== ''));

  interface FieldPill {
    id: string;
    label: string;
    activate: () => void;
  }

  /** Identitäts-Pills (Präfix/Suffix, Rufname, Titel, RESN, E-Mail, Website) — Religion
   *  ist seit BL-289 keine Identitäts-Eigenschaft mehr, sondern ein Ereignis mit Datum,
   *  Ort und Zitaten; sie wird über die Ereigniszeile gepflegt. —
   *  einzige verbleibende Pill-Gruppe in diesem Formular (die Ereignis-Pills leben seit
   *  ADR-v9-63 direkt auf `PersonDetail.svelte`). */
  const identityPills = $derived.by<FieldPill[]>(() => {
    const list: FieldPill[] = [];
    if (!showPrefixSuffix) list.push({ id: 'prefix-suffix', label: 'Präfix / Suffix', activate: () => (showPrefixSuffix = true) });
    if (!showNick) list.push({ id: 'nick', label: 'Rufname', activate: () => (showNick = true) });
    if (!showTitle) list.push({ id: 'title', label: 'Titel', activate: () => (showTitle = true) });
    if (!showRestriction) list.push({ id: 'restriction', label: 'Zugriffsbeschränkung', activate: () => (showRestriction = true) });
    if (!showEmail) list.push({ id: 'email', label: 'E-Mail', activate: () => (showEmail = true) });
    if (!showWww) list.push({ id: 'www', label: 'Website', activate: () => (showWww = true) });
    return list;
  });


  /**
   * Setzt die Feldwerte auf den GESPEICHERTEN Stand zurück (INV-UI-16, BL-270/274).
   * Liest `person` frisch statt eines Mount-Snapshots — daneben können sofort committende
   * Abschnitte den Datensatz geändert haben, und ein Verwerfen darf deren Ergebnis nicht
   * mitnehmen. Es schließt den Modus NICHT: das tut der Schalter, der ihn geöffnet hat.
   */
  function discard() {
    given = person.given;
    surname = person.surname;
    prefix = person.prefix;
    suffix = person.suffix;
    nick = person.nick;
    sex = person.sex;
    title = person.title;
    noteText = person.noteText;
    restriction = person.restriction;
    email = person.email;
    www = person.www;
  }

  function save() {
    // `person.name` (der rohe GEDCOM-NAME-Wert) ist die ZWEITE Hälfte derselben Sache
    // wie given/surname/suffix: der Writer schreibt NAME aus dem einen Feld und
    // GIVN/SURN/NSFX aus den anderen. Ohne Nachziehen exportiert eine Umbenennung
    // widersprüchliche Zeilen und der nächste Ladevorgang holt den ALTEN Namen zurück
    // (ADR-v9-81-Klasse, ADR-v9-112).
    //
    // NUR bei tatsächlicher Änderung neu zusammensetzen: sonst würde bloßes Öffnen und
    // Speichern ohne Edit einen byte-abweichenden NAME-Wert (z. B. doppeltes Leerzeichen
    // in der Quelle) glattziehen und den Record fälschlich als geändert markieren — das
    // wäre genau die automatische Änderung, vor der LP-1 schützt.
    const nameChanged =
      given.trim() !== person.given ||
      surname.trim() !== person.surname ||
      suffix.trim() !== person.suffix;
    const nextName = nameChanged
      ? composeGedcomName({ given: given.trim(), surname: surname.trim(), suffix: suffix.trim() })
      : person.name;

    const next: Person = {
      ...person,
      name: nextName,
      given: given.trim(),
      surname: surname.trim(),
      prefix: prefix.trim(),
      suffix: suffix.trim(),
      nick: nick.trim(),
      sex,
      title: title.trim(),
      noteText,
      restriction: restriction.trim(),
      email: email.trim(),
      www: www.trim(),
      // birth/chr/death/cause/buri/events bleiben unverändert (aus dem Spread oben) —
      // dieses Formular kennt/ändert keine Ereignisse mehr (ADR-v9-63).
    };
    appState.savePerson(next);
    onSaved?.(next.id);
  }
</script>

<div class="person-form" data-no-swipe>
  <!-- Nur im ANLAGE-Fall (BL-274, §10e Redundanter Hero-Titel): auf der Detailseite steht
       der Name bereits in der Kopfzeile, die seit BL-274 im Bearbeiten-Modus stehen bleibt
       — „Person bearbeiten" wäre dort ein zweiter, ärmerer Titel. Im Picker-Entwurf gibt
       es keine Kopfzeile, dort trägt diese Zeile die Einordnung. -->
  {#if !person.given && !person.surname}
    <h3>Neue Person</h3>
  {/if}

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
      <div class="stb-activation-pill-row" aria-label="Weitere Felder">
        {#each identityPills as pill (pill.id)}
          <button type="button" class="stb-activation-pill" onclick={pill.activate}>+ {pill.label}</button>
        {/each}
      </div>
    {/if}
  </section>

  <div class="person-form__actions">
    <button type="button" class="stb-btn" data-variant="primary" onclick={save}>Speichern</button>
    {#if onCancel}
      <button type="button" class="stb-btn" data-variant="secondary" onclick={onCancel}>Abbrechen</button>
    {:else}
      <button type="button" class="stb-btn" data-variant="secondary" onclick={discard}>Verwerfen</button>
    {/if}
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

  /* Basis-Optik (Hintergrund/Border/Padding/Font) kommt aus dem globalen
     `input, select, textarea`-Grundstil (design-system.css, INV-UI-4). */

  .person-form__actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 1.25rem;
  }


</style>
