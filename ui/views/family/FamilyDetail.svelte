<script lang="ts">
  // ui/views/family/FamilyDetail.svelte — Familien-Detail (Spec 20 §1.5 [K]): anklickbare
  // Mitglieder (-> Personen-Detail), Ereignisse, Quellen-Badges. `FamilyForm` ENTFÄLLT
  // vollständig (ADR-v9-63, Spec 20 §2): Familie hat keine eigenen Skalarfelder — Eltern-
  // Wechsel (Ehemann/Ehefrau) und Kinder± sind DIREKTE Picker-Aktionen auf dieser Scheibe
  // (kein "✎ Bearbeiten"-Button/Formular-Umweg mehr, ADR-v9-42-Begründung: einzelne
  // geprüfte Nutzerentscheidung, keine Massenanlage). Ereignisse laufen wie bei Person
  // über `EventEditModal` (✎ je Zeile, ADR-v9-60) + die gestufte Pill-Reihe (Verlobung-
  // Pill + "+ Ereignis"-Sammel-Menü, ADR-v9-62/63) — kein Tod/Wohnort (Personen-Ereignisse).
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import type { LensId } from '../../shell/lens-model';
  import type { Family, Event, PersonId } from '../../../core/model/types';
  import { makeEvent } from '../../../core/model/factory';
  import { isEventPresent } from '../../../core/model';
  import SourceBadge from '../../shell/SourceBadge.svelte';
  import DetailHeader from '../../shell/DetailHeader.svelte';
  import EventEditModal from '../../shell/EventEditModal.svelte';
  import EventTypeMenu from '../../shell/EventTypeMenu.svelte';
  import EventLine from '../../shell/EventLine.svelte';
  import PersonPicker from '../../shell/PersonPicker.svelte';
  import { eventTypeLabel } from '../../shell/event-labels';
  import { buildFamilyDetail, type FamilyEventRow } from './family-detail-model';

  interface Props {
    appState: AppState;
    viewState: ViewState;
    /** Cross-Tab-Navigation zu einer Person (wechselt auch den Entitäts-Segment). */
    onNavigateToPerson: (personId: string) => void;
    /** Cross-Tab-Navigation zur Quellen-Detailseite (optional — Tests ohne Quellen-Tab). */
    onNavigateToSource?: (sourceId: string) => void;
    /** Cross-Tab-Navigation zum Orte-Tab (optional — Tests/Kontexte ohne Orte-Tab). */
    onNavigateToPlace?: (placeId: string) => void;
    /** Cross-Tab-Navigation zum Höfe-Tab (optional — Tests/Kontexte ohne Höfe-Tab). */
    onNavigateToHof?: (hofId: string) => void;
    /** Cross-Tab-Navigation zur Karte-Lens (ADR-v9-78/80, `EventLine`/`CoordIndicator`)
     *  — optional, damit isolierte Tests/Kontexte ohne Lens-Umschalter weiterlaufen. */
    onNavigateLens?: (lens: LensId) => void;
    /** "← Zur Liste" (Spec 21 §6b: EINE gemeinsame Kopfzeile statt EntityTabs eigener
     *  Zeile) — optional, damit isolierte Tests/Kontexte ohne EntityTab weiterlaufen. */
    onBack?: () => void;
  }
  const {
    appState,
    viewState,
    onNavigateToPerson,
    onNavigateToSource,
    onNavigateToPlace,
    onNavigateToHof,
    onNavigateLens,
    onBack,
  }: Props = $props();

  const familyId = $derived(viewState.getCurrent('family'));
  const detail = $derived(familyId ? buildFamilyDetail(appState.db, appState.placeContext, familyId) : null);

  const roleLabel: Record<'husband' | 'wife' | 'child', string> = {
    husband: 'Ehemann',
    wife: 'Ehefrau',
    child: 'Kind',
  };

  /** Eltern-Boxen (Ehemann/Ehefrau), gleicher kompakter Box-Stil wie PersonPicker
   *  (Nachtrag 2026-07-06 [20 §1.5]). */
  const parents = $derived(detail?.members.filter((m) => m.role === 'husband' || m.role === 'wife') ?? []);
  /** Kinder — zeigen zusätzlich das Geburtsjahr (summary) zur eindeutigen Identifikation
   *  bei Namensgleichheit (Nachtrag 2026-07-06 [20 §1.5]). */
  const children = $derived(detail?.members.filter((m) => m.role === 'child') ?? []);

  /** Heirat steht prominent direkt nach den Eltern-Boxen, nicht als Teil der generischen
   *  Ereignis-Liste (Nachtrag 2026-07-06 [20 §1.5]). Verlobung bleibt (falls vorhanden)
   *  ebenfalls hier, in ihrer kanonischen GEDCOM-Reihenfolge VOR der Heirat. Alle übrigen
   *  Ereignisse (events[]) bleiben in der generischen Liste am Ende. */
  const marriageEvents = $derived(detail?.events.filter((e) => e.key === 'MARR' || e.key === 'ENGA') ?? []);
  const otherEvents = $derived(detail?.events.filter((e) => e.key !== 'MARR' && e.key !== 'ENGA') ?? []);

  // --- Eltern-Wechsel: direkte Picker-Aktion (ADR-v9-63, kein Formular-Umweg) ---------
  // Klick auf einen leeren Slot ODER den "Ändern"-Knopf neben einer besetzten Box öffnet
  // PersonPicker INLINE (dasselbe Picker-Muster wie zuvor in FamilyForm.svelte, MIT
  // "+ neue Person anlegen"). Auswahl speichert SOFORT über appState.saveFamily(model)
  // mit dem vollen Objekt (Spec 02 §3 Kommando-Chokepoint) — kein Zwischenschritt.
  let editingParent = $state<'husband' | 'wife' | null>(null);

  function setParent(role: 'husband' | 'wife', id: PersonId | null) {
    if (!detail) return;
    const f = detail.family;
    const next: Family = { ...f, [role]: id };
    appState.saveFamily(next);
    editingParent = null;
  }

  // --- Kinder ± : direkte Picker-Aktion, sofort gespeichert (analog FamilyForm.svelte,
  // ADR-v9-30 Punkt 2 "vereinfacht: PersonPicker wählt direkt -> Kind ist sofort in der
  // Liste"), jetzt direkt auf FamilyDetail statt hinter "✎ Bearbeiten". ---
  function addChild(id: PersonId | null) {
    if (!detail || !id) return;
    const f = detail.family;
    if (f.children.includes(id)) return;
    const next: Family = { ...f, children: [...f.children, id] };
    appState.saveFamily(next);
  }

  function removeChild(id: PersonId) {
    if (!detail) return;
    const f = detail.family;
    const next: Family = { ...f, children: f.children.filter((c) => c !== id) };
    appState.saveFamily(next);
  }

  /** Generalisierte ✕-Rücknahme (Nachtrag 2026-07-12, Spec 20 §2 „Generalisiert", analog
   *  PersonDetail.svelte) für JEDE Ereigniszeile außer MARR (Heirat, immer offen, nicht
   *  rücknehmbar). Direktes Kommando, kein Modal — Verlobung wird auf den unbefüllten
   *  Ausgangszustand zurückgesetzt (`makeEvent('ENGA')`), generische `events[]`-Einträge
   *  (`ev-${i}`-Key) werden aus dem Array entfernt. Nur über den Template-Guard
   *  `ev.empty` erreichbar — kein Bestätigungsdialog nötig (nur der leere/folgenlose Fall
   *  ist betroffen). */
  function retractOrRemove(key: string) {
    if (!detail) return;
    const f = detail.family;
    if (key === 'ENGA') {
      appState.saveFamily({ ...f, engagement: makeEvent('ENGA') });
    } else if (key.startsWith('ev-')) {
      const idx = Number(key.slice(3));
      appState.saveFamily({ ...f, events: f.events.filter((_, i) => i !== idx) });
    }
  }

  // --- Einzel-Ereignis-Editor (✎-Icon je Zeile, ADR-v9-60) + Neu-Anlage (ADR-v9-63) —
  // EIN Modal-Zustand für beide Aufrufarten, analog PersonDetail.svelte. Familie kennt
  // kein cause-Äquivalent (nur Person hat Person.cause) — EventEditModal bekommt hier
  // nie `cause`. ---
  type ModalState = { kind: 'edit'; key: string } | { kind: 'create'; tag: string };
  let modal = $state<ModalState | null>(null);

  function eventForKey(f: Family, key: string): Event {
    if (key === 'ENGA') return f.engagement;
    if (key === 'MARR') return f.marriage;
    return f.events[Number(key.slice(3))];
  }

  function openEventEdit(key: string) {
    modal = { kind: 'edit', key };
  }

  function startCreate(tag: string) {
    modal = { kind: 'create', tag };
  }

  function closeModal() {
    modal = null;
  }

  const modalEvent = $derived.by<Event | null>(() => {
    if (!detail || !modal) return null;
    if (modal.kind === 'edit') return eventForKey(detail.family, modal.key);
    return makeEvent(modal.tag);
  });

  const modalLabel = $derived.by<string>(() => {
    if (!detail || !modal) return '';
    if (modal.kind === 'edit') {
      const row = detail.events.find((r) => r.key === modal.key);
      return row?.label ?? eventTypeLabel(modal.key);
    }
    return eventTypeLabel(modal.tag);
  });

  /** Speichert EIN Event zurück — klont die Familie, ersetzt NUR das betroffene Feld
   *  (Sonder-Ereignis-Feld ODER events[Index]) bzw. hängt ein frisch angelegtes
   *  generisches Event an `events[]` an, und ruft appState.saveFamily(model) mit dem
   *  VOLLSTÄNDIGEN Objekt auf (Spec 02 §3 Kommando-Chokepoint, kein Feld-Setter-Pattern). */
  function saveModal(updated: Event) {
    if (!detail || !modal) return;
    const f = detail.family;
    const next: Family = { ...f };
    if (modal.kind === 'edit') {
      const key = modal.key;
      if (key === 'ENGA') next.engagement = updated;
      else if (key === 'MARR') next.marriage = updated;
      else {
        const idx = Number(key.slice(3));
        next.events = f.events.map((e, i) => (i === idx ? updated : e));
      }
    } else {
      const tag = modal.tag;
      if (tag === 'ENGA') next.engagement = updated;
      else next.events = [...f.events, updated];
    }
    appState.saveFamily(next);
    modal = null;
  }

  // --- "+ Ereignis"-Sammel-Menü (analog PersonDetail, ohne die personen-spezifischen
  // Standing-Pills Tod/Wohnort) — flache Liste, kein "andere Typ"-Fallback nötig (schon
  // die vollständige, bisherige FamilyForm-Typliste, Spec 20 §2). ---
  const FAMILY_EVENT_TYPES = ['EVEN', 'CENS', 'PROP', 'FACT'] as const;
  interface MenuItem {
    tag: string;
    label: string;
  }
  const menuItems = $derived.by<MenuItem[]>(() => {
    if (!detail) return [];
    return FAMILY_EVENT_TYPES.filter((t) => !detail!.family.events.some((e) => e.type === t)).map((t) => ({
      tag: t,
      label: eventTypeLabel(t),
    }));
  });

  const engagementPresent = $derived(!!detail && isEventPresent(detail.family.engagement));
</script>

{#snippet eventRow(ev: FamilyEventRow)}
  <EventLine
    {ev}
    {appState}
    {viewState}
    {onNavigateToPlace}
    {onNavigateToHof}
    {onNavigateToSource}
    {onNavigateLens}
    onRetract={ev.key !== 'MARR' ? retractOrRemove : undefined}
    onEdit={openEventEdit}
  />
{/snippet}

<div class="family-detail">
  {#if !familyId}
    <p class="family-detail__empty">Keine Familie ausgewählt.</p>
  {:else if !detail}
    <p class="family-detail__empty">Familie nicht gefunden (evtl. gelöscht oder Datei gewechselt).</p>
  {:else}
    <DetailHeader title={detail.label} onBack={onBack ?? (() => {})} compact />

    <section class="family-detail__section">
      <h3>Eltern</h3>
      <div class="family-detail__parents">
        {#each (['husband', 'wife'] as const) as role (role)}
          {@const member = parents.find((p) => p.role === role)}
          <div class="family-detail__parent-slot">
            {#if editingParent === role}
              <PersonPicker
                {appState}
                value={role === 'husband' ? detail.family.husband : detail.family.wife}
                onChange={(id) => setParent(role, id)}
                allowNone={true}
                noneLabel="— kein Elternteil —"
                label={roleLabel[role]}
                startOpen={true}
              />
            {:else if member}
              <div class="family-detail__parent-box-wrap">
                <button
                  type="button"
                  class="stb-person-box family-detail__parent-box"
                  onclick={() => onNavigateToPerson(member.personId)}
                >
                  <span class="stb-role-label">{roleLabel[role]}</span>
                  <span class="stb-person-box__name">{member.name}</span>
                  {#if member.summary}<span class="stb-person-box__meta">{member.summary}</span>{/if}
                </button>
                <button
                  type="button"
                  class="family-detail__parent-change-btn"
                  onclick={() => (editingParent = role)}
                  aria-label={`${roleLabel[role]} ändern`}
                >
                  ✎
                </button>
              </div>
            {:else}
              <button type="button" class="stb-activation-pill" onclick={() => (editingParent = role)}>
                + {roleLabel[role]} wählen
              </button>
            {/if}
          </div>
        {/each}
      </div>
    </section>

    <section class="family-detail__section">
      <div class="stb-activation-pill-row family-detail__quick-actions">
        {#if !engagementPresent}
          <button type="button" class="stb-activation-pill" onclick={() => startCreate('ENGA')}>+ Verlobung</button>
        {/if}
        <EventTypeMenu groups={[menuItems]} onSelect={startCreate} />
      </div>
      {#if marriageEvents.length > 0}
        <ul class="family-detail__events">
          {#each marriageEvents as ev (ev.key)}
            {@render eventRow(ev)}
          {/each}
        </ul>
      {/if}
    </section>

    <section class="family-detail__section">
      {#if children.length > 0}
        <h3>Kinder</h3>
        <ul class="family-detail__children">
          {#each children as child (child.personId)}
            <li>
              <button
                type="button"
                class="family-detail__child-link"
                onclick={() => onNavigateToPerson(child.personId)}
              >
                {child.name}
                {#if child.summary}<span class="family-detail__child-summary">({child.summary})</span>{/if}
              </button>
              <button
                type="button"
                class="family-detail__child-remove-btn"
                onclick={() => removeChild(child.personId)}
                aria-label={`Kind ${child.name} entfernen`}
              >
                ✕
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      <div class="family-detail__add-child">
        <PersonPicker
          {appState}
          value={null}
          onChange={addChild}
          excludeIds={detail.family.children}
          label="Kind hinzufügen"
          placeholder="Kind hinzufügen…"
        />
      </div>
    </section>

    {#if otherEvents.length > 0}
      <section class="family-detail__section">
        <h3>Weitere Ereignisse</h3>
        <ul class="family-detail__events">
          {#each otherEvents as ev (ev.key)}
            {@render eventRow(ev)}
          {/each}
        </ul>
      </section>
    {/if}

    {#if detail.citations.length > 0}
      <section class="family-detail__section">
        <h3>Quellen (Familie)</h3>
        <div class="family-detail__citations">
          {#each detail.citations as cit, i (i)}
            <SourceBadge
              citation={cit}
              source={appState.db.sources.get(cit.sourceId)}
              onSelect={onNavigateToSource}
            />
          {/each}
        </div>
      </section>
    {/if}

    {#if modal && modalEvent}
      <EventEditModal
        {appState}
        event={modalEvent}
        label={modalLabel}
        mode={modal.kind}
        onSave={saveModal}
        onClose={closeModal}
      />
    {/if}
  {/if}
</div>

<style>
  .family-detail {
    padding: 1rem;
    overflow-y: auto;
  }

  .family-detail__empty {
    color: var(--stb-text-dim);
  }

  .family-detail__section {
    margin-bottom: 1.25rem;
  }

  .family-detail__section h3 {
    font-size: 0.95rem;
    color: var(--stb-gold-light);
    margin-bottom: 0.4rem;
  }

  /* Eltern-Boxen (Nachtrag 2026-07-06 [20 §1.5]): nebeneinander, gemeinsame Box-Optik
     aus .stb-person-box (design-system.css, INV-UI-4) — nur Layout (Grid) + die
     zusätzliche Rollen-Beschriftung bleiben hier lokal. */
  .family-detail__parents {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 0.5rem;
  }

  .family-detail__parent-slot {
    min-width: 0;
  }

  .family-detail__parent-box-wrap {
    display: flex;
    align-items: stretch;
    gap: 0.3rem;
  }

  .family-detail__parent-box {
    flex: 1;
    min-width: 0;
  }

  .family-detail__parent-change-btn {
    background: transparent;
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    color: var(--stb-text-dim);
    cursor: pointer;
    padding: 0 0.5rem;
    font-size: 0.85rem;
    flex: 0 0 auto;
  }

  .family-detail__parent-change-btn:hover,
  .family-detail__parent-change-btn:focus-visible {
    color: var(--stb-gold-light);
    border-color: var(--stb-gold);
  }

  .family-detail__quick-actions {
    margin-bottom: 0.5rem;
  }

  /* Kinder — kompakte, anklickbare Einzeiler (INV-UI-5): Name + Geburtsjahr in Klammern,
     kein voller .stb-person-box-Kasten nötig (Nachtrag 2026-07-06 [20 §1.5]). */
  .family-detail__children {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .family-detail__children li {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    border-bottom: 1px solid var(--stb-surface-2);
  }

  .family-detail__child-link {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    background: transparent;
    border: none;
    color: var(--stb-gold-light);
    cursor: pointer;
    padding: 0.4rem 0;
    font: inherit;
    text-align: left;
    text-decoration: underline;
  }

  .family-detail__child-summary {
    color: var(--stb-text-dim);
    font-size: 0.82rem;
    text-decoration: none;
  }

  .family-detail__child-remove-btn {
    background: transparent;
    border: none;
    color: var(--stb-text-dim);
    cursor: pointer;
    font-size: 0.82rem;
    flex: 0 0 auto;
  }

  .family-detail__child-remove-btn:hover,
  .family-detail__child-remove-btn:focus-visible {
    color: var(--stb-danger);
  }

  .family-detail__add-child {
    margin-top: 0.5rem;
  }

  /* Die generische Ereigniszeile selbst lebt seit ADR-v9-80 in `EventLine.svelte`
     (`ui/shell/`, `.event-line__*`-Klassen dort) — hier nur noch der Listen-Container. */
  .family-detail__events {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .family-detail__citations {
    margin-top: 0.35rem;
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
  }
</style>
