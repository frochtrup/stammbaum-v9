<script lang="ts">
  // ui/shell/EntryTemplateCapture.svelte — die Erfassungs-Fläche EINER Vorlage (BL-352,
  // ADR-v9-264 Entscheidung 5/6/10). Rendert die Felder einer `EntryTemplate` aus den
  // vorhandenen Struktureingaben (INV-UI-4, kein neuer Mechanismus), hält den Entwurf bis
  // „Speichern" (E5: vor dem Speichern existiert kein Datensatz), verknüpft Personen-Rollen
  // per Live-Dubletten-Treffer statt sie neu anzulegen, fragt bei einer Familien-
  // Mehrdeutigkeit über `FamilyPicker` nach und bleibt für die Serienerfassung offen.
  //
  // EIN Kommando, EIN Undo-Schritt: `appState.applyEntryTemplate` (app-state.svelte.ts) —
  // diese Fläche ruft es auf, sie kennt keine eigene Schreib-Logik (INV-ARCH-1).
  //
  // Wo sie eingehängt wird: BL-353 (Werkzeug „Erfassungs-Vorlagen" hinter der Werkzeuge-
  // Disclosure der Personenliste, ADR-v9-264 E9) — dieser Bauabschnitt liefert nur die
  // Fläche selbst, gemountet bislang ausschließlich aus Komponententests.
  import { untrack } from 'svelte';
  import type { AppState } from './app-state.svelte';
  import type { EntryFamilyRole, EntryPersonRole, EntryTemplate } from '../../core/model/entry-templates';
  import { isEventSlot, slotKey } from '../../core/model/entry-templates';
  import { makeEntryDraft, resolveEntrySourcePrefill, normalizeSex } from '../../core/model';
  import type { EntryTemplateAmbiguity } from '../../core/model';
  import type { FamilyId, PersonId } from '../../core/model/types';
  import { runValidationOn, defaultConfig } from '../../core/validate';
  import { computeDate, editableDateFrom, makeEditableDate, type EditableDate } from './event-edit';
  import {
    groupTemplateSlots,
    hiddenPrefillChips,
    effectiveIdentityValue,
    ENTRY_ROLE_LABELS,
  } from './entry-template-capture-model';
  import { duplicateSuggestions } from './entry-template-dedup';
  import { sourceLabel } from './source-label';
  import { PLAIN_FIELD } from './plain-input';
  import { formSubmit, formEscape } from './form-keys';
  import EntryTemplateRoleSection from './EntryTemplateRoleSection.svelte';
  import FamilyPicker from './FamilyPicker.svelte';
  import StatusNotice from './StatusNotice.svelte';

  interface Props {
    appState: AppState;
    template: EntryTemplate;
    onClose: () => void;
  }
  const { appState, template, onClose }: Props = $props();

  // TST-10-Muster: die Gruppierung hängt nur an `template` (stabil für die Lebensdauer
  // dieser Instanz, ein Vorlagenwechsel mountet neu — wie EventEditModal/PersonForm).
  const groups = untrack(() => groupTemplateSlots(template));
  const chips = untrack(() => hiddenPrefillChips(template));

  /** Ein frisches `EditableDate`-Gerüst je Datums-Slot OHNE Vorbelegung — vorab angelegt,
   *  nicht lazy während des Renderns (`state_unsafe_mutation`: Svelte 5 verbietet eine
   *  `$state`-Mutation innerhalb einer Template-Auswertung). Dieselbe Funktion liefert den
   *  Startzustand UND den Reset für die Serienerfassung (`resetForSeries`). */
  function freshDateStates(): Record<string, EditableDate> {
    const out: Record<string, EditableDate> = {};
    for (const slot of template.slots) {
      // `hidden`/`locked` brauchen kein Entwurfsfeld — ihr Wert kommt direkt aus dem Slot.
      // `prefilled` dagegen ist ein START-Wert in einem änderbaren Feld (ADR-v9-268 E6):
      // er wird hier eingesetzt, damit die Zeile ihn zeigt und der Nutzer ihn überschreiben
      // kann. Auch der Serien-Reset läuft hierüber — die Vorbelegung steht danach wieder da.
      if (slot.prefillMode === 'hidden' || slot.prefillMode === 'locked') continue;
      if (isEventSlot(slot) && slot.field === 'date') {
        out[slotKey(slot)] = editableDateFrom(slot.prefill ?? null);
      }
    }
    return out;
  }

  /** Startwerte der Textfelder — das Gegenstück zu `freshDateStates()` für alles, was
   *  keine Datumszeile ist: ein `prefilled`-Slot beginnt mit seinem Wert im Feld, alle
   *  anderen leer (ADR-v9-268 E6). */
  function freshTextValues(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const slot of template.slots) {
      if (slot.prefillMode !== 'prefilled') continue;
      if (isEventSlot(slot) && slot.field === 'date') continue; // hat sein eigenes Gerüst
      out[slotKey(slot)] = slot.prefill;
    }
    return out;
  }

  // --- Entwurf (ADR-v9-264 E5: vor „Speichern" existiert kein Datensatz) ----------------
  let textValues = $state<Record<string, string>>(untrack(() => freshTextValues()));
  let dateStates = $state<Record<string, EditableDate>>(untrack(() => freshDateStates()));
  let persons = $state<Partial<Record<EntryPersonRole, PersonId>>>({});
  /** Kandidaten der Live-Dubletten-Suche je Rolle — reiner Vorschlag, keine Bindung. */
  let suggestions = $state<Partial<Record<EntryPersonRole, readonly PersonId[]>>>({});
  let families = $state<Partial<Record<EntryFamilyRole, FamilyId>>>({});
  let page = $state('');
  let url = $state('');

  let ambiguity = $state<EntryTemplateAmbiguity[]>([]);
  let notice = $state('');

  // --- Quellen-Vorbelegung (ADR-v9-264 E7): am Referenten geprüft, wirkungslos statt falsch ---
  const resolvedSource = $derived(
    template.source ? resolveEntrySourcePrefill(template.source, appState.db.sources.get(template.source.sourceId)) : null,
  );

  // NICHT lazy anlegen: `dateStateFor` wird auch aus `EntryTemplateRoleSection`s Template
  // heraus aufgerufen (`EventDateFields editable={dateStateFor(key)}`) — eine `$state`-
  // Mutation WÄHREND einer Template-Auswertung ist in Svelte 5 verboten
  // (`state_unsafe_mutation`), unabhängig davon, in welcher Datei die Funktion steht.
  // `freshDateStates()` legt deshalb JEDEN Datums-Slot bereits beim Entwurfs-Start an.
  function dateStateFor(key: string): EditableDate {
    return dateStates[key] ?? makeEditableDate();
  }

  function textValue(key: string): string {
    return textValues[key] ?? '';
  }
  function setText(key: string, v: string): void {
    textValues[key] = v;
  }

  function buildDraft() {
    const values: Record<string, string> = {};
    for (const slot of template.slots) {
      // Ein `prefill` fließt bei `hidden`/`locked` direkt über `slot.prefill` in
      // `applyEntryTemplate` ein (aufloesen()) — diese Slots brauchen hier keinen
      // Entwurfswert. `prefilled` schon: dort gewinnt der FELDWERT, weil der Nutzer ihn
      // geändert haben kann (ADR-v9-268 E6).
      if (slot.prefillMode === 'hidden' || slot.prefillMode === 'locked') continue;
      const key = slotKey(slot);
      values[key] = isEventSlot(slot) && slot.field === 'date' ? (computeDate(dateStateFor(key)) ?? '') : (textValues[key] ?? '').trim();
    }
    return makeEntryDraft({
      values,
      persons: { ...persons },
      families: { ...families },
      page: page.trim(),
      url: url.trim(),
    });
  }

  function resetForSeries(): void {
    // Vorbelegungen bleiben stehen (E3: sie sind Eigenschaft der VORLAGE, nicht des
    // Entwurfs) — nur der Nutzer-Entwurf wird geleert.
    //
    // AUSSER, wo die Vorlage `carry` gesetzt hat (ADR-v9-271): dort überlebt der
    // EINGETIPPTE Wert den Reset. Der Fall, der das verlangt hat, ist ein Hofregister —
    // derselbe Nachname über zwanzig Einträge, ohne Vorbelegung, weil er von Bestand zu
    // Bestand ein anderer ist. Die Entscheidung fällt je FELD in der Vorlage, nicht
    // pauschal und nicht je Rollen-Block.
    //
    // WARUM DAS KEINE STILLE ÜBERNAHME IST: der mitgeführte Wert steht sichtbar und
    // änderbar im Feld — genau der Modus, den ADR-v9-268 E7 erlaubt. Was dort verboten
    // ist, ist ein Wert, den niemand zu Gesicht bekommt; `carry` gibt es deshalb nur an
    // änderbaren Feldern (der Typ erzwingt es, `SlotPrefill`).
    const mitgefuehrt = new Set(template.slots.filter((s) => s.carry).map(slotKey));
    const frischeTexte = freshTextValues();
    const frischeDaten = freshDateStates();
    for (const key of mitgefuehrt) {
      if (key in textValues) frischeTexte[key] = textValues[key];
      if (key in dateStates) frischeDaten[key] = dateStates[key];
    }
    textValues = frischeTexte;
    dateStates = frischeDaten;
    // Die GEWÄHLTE Person/Familie läuft NICHT mit: sie ist keine Eingabe, sondern eine
    // Zuordnung an genau diesen einen Eintrag — der nächste Taufeintrag betrifft ein
    // anderes Kind, auch wenn der Nachname derselbe bleibt.
    persons = {};
    families = {};
    if (!template.source?.pageCarry) page = '';
    if (!template.source?.urlCarry) url = '';
  }

  function trySave(): void {
    const res = appState.applyEntryTemplate(template, buildDraft());
    if (res.ambiguous.length > 0) {
      ambiguity = res.ambiguous;
      return;
    }
    ambiguity = [];
    const personIds = Object.values(res.persons).filter((v): v is PersonId => v !== undefined);
    const familyIds = Object.values(res.families).filter((v): v is FamilyId => v !== undefined);
    // Sofort-Plausibilitätsprüfung NUR über die berührten Datensätze (ADR-v9-264 E10) —
    // nicht `runValidation` über den ganzen Bestand.
    // Ein leerer Entwurf legt nichts an (eine Vorbelegung, die der Nutzer nicht sieht oder
    // nicht ändern kann, ist keine Eingabe — core/model/apply-entry-template.ts). Das ist
    // richtig, darf aber NICHT als „gespeichert" gemeldet werden: eine Erfolgsmeldung über
    // einen Nicht-Vorgang ist die schlechteste Sorte Rückmeldung.
    if (personIds.length === 0 && familyIds.length === 0) {
      notice = 'Nichts erfasst — es war kein Feld ausgefüllt.';
      return;
    }
    const findings = runValidationOn(appState.db, defaultConfig(), { personIds, familyIds });
    notice =
      findings.length === 0
        ? `„${template.label}“ gespeichert.`
        : `„${template.label}“ gespeichert — ${findings.length} Befund${findings.length === 1 ? '' : 'e'}: ${findings
            .slice(0, 2)
            .map((f) => f.text)
            .join('; ')}${findings.length > 2 ? ' …' : ''}`;
    resetForSeries();
  }

  function resolveAmbiguity(role: EntryFamilyRole, id: FamilyId): void {
    families[role] = id;
    trySave();
  }

  // --- Live-Dubletten-Erkennung, entprellt (ADR-v9-264 E10) -----------------------------
  const DEBOUNCE_MS = 400;
  const debounceTimers: Partial<Record<EntryPersonRole, ReturnType<typeof setTimeout>>> = {};

  function scheduleDedupe(role: EntryPersonRole): void {
    const running = debounceTimers[role];
    if (running) clearTimeout(running);
    debounceTimers[role] = setTimeout(() => runDedupe(role), DEBOUNCE_MS);
  }

  function runDedupe(role: EntryPersonRole): void {
    if (persons[role]) return; // bereits verknüpft — erst nach „lösen" erneut suchen
    const group = groups.find((g) => g.role === role);
    if (!group) return;
    // Der WIRKSAME Wert, nicht der getippte: eine versteckte Vorbelegung (z. B. das
    // Geschlecht der Heirats-Vorlage) wird beim Speichern übernommen — die Suche muss
    // dieselbe Person beurteilen, die nachher entsteht.
    const wert = (field: 'given' | 'surname' | 'sex') =>
      effectiveIdentityValue(group, field, textValues[`${role}.${field}`] ?? '');
    const given = wert('given');
    const surname = wert('surname');
    const sex = normalizeSex(wert('sex') || 'U');
    // NUR vorschlagen. Das Verknüpfen ist eine Wahl des Nutzers im `PersonPicker` — ein
    // automatisch gebundener Bestpunkt-Treffer schriebe die erfassten Daten still an eine
    // fremde Person (am Score belegt, s. `entry-template-dedup.ts`).
    suggestions[role] = duplicateSuggestions(appState.db, { given, surname, sex }).map((m) => m.id);
  }

  function link(role: EntryPersonRole, id: PersonId): void {
    persons[role] = id;
    suggestions[role] = [];
  }

  function unlink(role: EntryPersonRole): void {
    delete persons[role];
  }
</script>

<div class="entry-template-capture">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <form
    class="entry-template-capture__form"
    onsubmit={formSubmit(trySave)}
    onkeydown={formEscape(onClose)}
  >
    <div class="entry-template-capture__head">
      <h3>{template.label}</h3>
      <button type="button" class="stb-icon-btn" onclick={onClose} aria-label="Erfassung schließen">✕</button>
    </div>

    {#if chips.length > 0}
      <div class="stb-pill-row" aria-label="Vorbelegte Werte">
        {#each chips as chip (chip.key)}
          <span class="stb-pill">{chip.text}</span>
        {/each}
      </div>
    {/if}

    {#each groups as group (group.role)}
      <EntryTemplateRoleSection
        {appState}
        {group}
        {textValue}
        {setText}
        {dateStateFor}
        linkedId={group.isFamily ? undefined : persons[group.role as EntryPersonRole]}
        onNameInput={() => scheduleDedupe(group.role as EntryPersonRole)}
        onUnlink={() => unlink(group.role as EntryPersonRole)}
        suggestions={group.isFamily ? [] : (suggestions[group.role as EntryPersonRole] ?? [])}
        onLink={(id) => link(group.role as EntryPersonRole, id)}
      />
    {/each}

    {#if template.source}
      <section class="entry-template-capture__source">
        <h4 class="stb-section-title">Quelle</h4>
        {#if resolvedSource}
          <span class="stb-pill">📎 {sourceLabel(appState.db, template.source.sourceId)}</span>
          <label>
            Seite / Fundstelle
            <input type="text" {...PLAIN_FIELD} bind:value={page} aria-label="Seite / Fundstelle" placeholder={template.source.pagePattern} />
          </label>
          <label>
            Weblink
            <input type="text" {...PLAIN_FIELD} bind:value={url} aria-label="Weblink" placeholder={template.source.urlPattern} />
          </label>
        {:else}
          <p class="entry-template-capture__hint">
            Die vorbelegte Quelle passt nicht zum aktuellen Bestand — es wird keine Zitation angehängt.
          </p>
        {/if}
      </section>
    {/if}

    {#each ambiguity as amb (amb.role)}
      <section class="entry-template-capture__ambiguity">
        <p>Mehrere passende {ENTRY_ROLE_LABELS[amb.role]}n gefunden — welche ist gemeint?</p>
        <!-- `onClose` ist Pflicht bei `startOpen` (BL-300, tests/ui/picker-dismiss-
             contract.test.ts) — hier ein No-op: die Sektion hängt an `ambiguity`, nicht an
             einem eigenen Sichtbarkeits-Flag dieser Fläche; ein Escape/Klick-daneben lässt
             das Feld einfach geschlossen stehen, erneut anklickbar, kein „steckengeblieben". -->
        <FamilyPicker
          {appState}
          value={families[amb.role] ?? null}
          onChange={(id) => id && resolveAmbiguity(amb.role, id)}
          candidateIds={amb.candidates}
          allowCreate={false}
          label={`${ENTRY_ROLE_LABELS[amb.role]} wählen`}
          startOpen
          onClose={() => {}}
        />
      </section>
    {/each}

    <StatusNotice text={notice} onDismiss={() => (notice = '')} />

    <div class="entry-template-capture__actions">
      <button type="submit" class="stb-btn" data-variant="primary">Speichern</button>
      <button type="button" class="stb-btn" data-variant="secondary" onclick={onClose}>Abbrechen</button>
    </div>
  </form>
</div>

<style>
  .entry-template-capture__form {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }

  .entry-template-capture__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .entry-template-capture__head h3 {
    margin: 0;
    color: var(--stb-gold-light);
  }

  .entry-template-capture label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.8rem;
    color: var(--stb-text-dim);
  }

  .entry-template-capture__source,
  .entry-template-capture__ambiguity {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.6rem;
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-card);
  }

  .entry-template-capture__hint {
    margin: 0;
    color: var(--stb-text-dim);
    font-size: 0.82rem;
  }

  .entry-template-capture__actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
</style>
