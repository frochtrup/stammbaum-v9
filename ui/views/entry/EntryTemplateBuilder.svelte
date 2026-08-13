<script lang="ts">
  // ui/views/entry/EntryTemplateBuilder.svelte — der Editor der Erfassungs-Vorlagen
  // (BL-353, ADR-v9-264/-265, Fertig-Zustand: eine hier gebaute Vorlage ist von einer
  // mitgelieferten NICHT unterscheidbar — gleicher Typ `EntryTemplate`, gleicher
  // Anwenden-Pfad `applyEntryTemplate`). Trägt Vorlagenname, optionale Quellen-Vorbelegung
  // (`SourcePicker` + Fingerabdruck, ADR-v9-264 E7) und die Feld-Editoren je Rolle
  // (`EntryTemplateBuilderRoleSection`).
  //
  // TST-10-Muster: der Entwurf wird beim Mount EINMAL aus `template` gelesen (untrack) —
  // ein Vorlagenwechsel mountet neu (wie PersonForm/FamilyForm), kein fortlaufendes
  // Re-Sync.
  import { untrack } from 'svelte';
  import type { AppState } from '../../shell/app-state.svelte';
  import type { EntrySlot, EntryTemplate } from '../../../core/model/entry-templates';
  import {
    ALL_ENTRY_ROLES,
    draftSourcePrefill,
    entryTemplateBuilderErrors,
    moveRoleBlock,
    roleOrderOf,
  } from './entry-template-builder-model';
  import { groupTemplateSlots, ENTRY_ROLE_LABELS, type EntryRoleGroup } from '../../shell/entry-template-capture-model';
  import { isFamilyRole, type EntryRole } from '../../../core/model/entry-templates';
  import type { Quay, SourceId } from '../../../core/model/types';
  import { PLAIN_FIELD } from '../../shell/plain-input';
  import SourcePicker from '../../shell/SourcePicker.svelte';
  import EntryTemplateBuilderRoleSection from './EntryTemplateBuilderRoleSection.svelte';

  interface Props {
    appState: AppState;
    /** Ausgangspunkt: eine leere Vorlage (＋ Neue Vorlage), eine eigene bestehende
     *  (bearbeiten) oder eine frische Kopie (kopieren, s. EntryView) — NIE eine
     *  mitgelieferte selbst (die ist nicht überschreibbar, ADR-v9-264 E8). */
    template: EntryTemplate;
    onSave: (tpl: EntryTemplate) => void;
    onCancel: () => void;
    /** Diese eine Vorlage als Datei weitergeben (BL-354). Optional: ohne Datei-Rohr
     *  bleibt der Knopf unsichtbar statt tot. */
    onExport?: (tpl: EntryTemplate) => void;
  }
  const { appState, template, onSave, onCancel, onExport }: Props = $props();

  let label = $state(untrack(() => template.label));
  let slots = $state<EntrySlot[]>(untrack(() => template.slots.map((s) => ({ ...s }))));

  let sourceEnabled = $state(untrack(() => template.source !== undefined));
  let sourceId = $state<SourceId | null>(untrack(() => template.source?.sourceId ?? null));
  let quay = $state<Quay | null>(untrack(() => template.source?.quay ?? null));
  let pagePattern = $state(untrack(() => template.source?.pagePattern ?? ''));
  let urlPattern = $state(untrack(() => template.source?.urlPattern ?? ''));
  // Seite und Weblink sind KEINE Slots (sie gehören der Zitation, nicht einer Rolle) und
  // tragen ihr Mitführen deshalb hier statt an einem Slot — ADR-v9-271.
  let pageCarry = $state(untrack(() => template.source?.pageCarry ?? false));
  let urlCarry = $state(untrack(() => template.source?.urlCarry ?? false));

  function buildSource() {
    if (!sourceEnabled || !sourceId) return undefined;
    // Der Fingerabdruck wird FRISCH aus dem aktuellen Bestand gezogen (ADR-v9-264 E7) —
    // dieselbe Quelle, wie sie JETZT heißt, nicht ein eingefrorener Altwert.
    const src = appState.db.sources.get(sourceId);
    return draftSourcePrefill({
      sourceId,
      abbr: src?.abbr ?? '',
      title: src?.title ?? '',
      quay,
      pagePattern,
      urlPattern,
      pageCarry,
      urlCarry,
    });
  }

  const draft = $derived<EntryTemplate>({ id: template.id, label, slots, source: buildSource() });
  const groups = $derived(groupTemplateSlots(draft));
  const errors = $derived(entryTemplateBuilderErrors(draft));

  function groupFor(role: EntryRole): EntryRoleGroup {
    return (
      groups.find((g) => g.role === role) ?? {
        role,
        label: ENTRY_ROLE_LABELS[role],
        isFamily: isFamilyRole(role),
        identitySlots: [],
        eventGroups: [],
      }
    );
  }

  function onSlotsChange(next: EntrySlot[]) {
    slots = next;
  }

  /**
   * Belegte Rollen in ihrer (verschiebbaren) Reihenfolge, leere hinten dran — als EINE
   * Liste. Zwei getrennte `{#each}`-Blöcke wären naheliegender, aber ein Abschnitt würde
   * dann neu montieren, sobald er sein erstes Feld bekommt (er wechselt die Liste): der
   * Aufrufer verlöre seine DOM-Referenz, offene Menüs schlössen sich, der Fokus spränge.
   * Eine Liste, keyed nach Rolle, hält die Instanz.
   */
  const rollenReihenfolge = $derived(roleOrderOf(slots));
  const alleRollen = $derived([
    ...rollenReihenfolge,
    ...ALL_ENTRY_ROLES.filter((r) => !rollenReihenfolge.includes(r)),
  ]);

  function trySave() {
    if (errors.length > 0) return;
    // $state.snapshot: `draft` trägt den reaktiven `slots`-Proxy — der Aufrufer bekommt
    // einen reinen, klonbaren Wert (dieselbe Regel wie projects-state.svelte.ts).
    onSave($state.snapshot(draft));
  }
</script>

<div class="entry-builder">
  <div class="entry-builder__head">
    <label class="entry-builder__name">
      Vorlagenname
      <input type="text" {...PLAIN_FIELD} bind:value={label} aria-label="Vorlagenname" />
    </label>
    <button type="button" class="stb-icon-btn" onclick={onCancel} aria-label="Builder schließen">✕</button>
  </div>

  <section class="entry-builder__source">
    <label class="entry-builder__source-toggle">
      <input type="checkbox" bind:checked={sourceEnabled} />
      Quellen-Vorbelegung verwenden
    </label>
    {#if sourceEnabled}
      <div class="stb-field">
        <span class="stb-field__caption">Quelle</span>
        <SourcePicker
          {appState}
          value={sourceId}
          onChange={(id) => (sourceId = id)}
          allowNone
          label="Vorbelegte Quelle auswählen"
        />
      </div>
      <label class="entry-builder__source-field">
        Zuverlässigkeit (QUAY)
        <select
          value={quay === null ? '' : String(quay)}
          aria-label="Vorbelegte Zuverlässigkeit"
          onchange={(e) => {
            const v = (e.currentTarget as HTMLSelectElement).value;
            quay = v === '' ? null : (Number(v) as Quay);
          }}
        >
          <option value="">QUAY —</option>
          <option value="0">QUAY 0</option>
          <option value="1">QUAY 1</option>
          <option value="2">QUAY 2</option>
          <option value="3">QUAY 3</option>
        </select>
      </label>
      <label class="entry-builder__source-field">
        Seiten-Muster
        <input type="text" {...PLAIN_FIELD} bind:value={pagePattern} aria-label="Seiten-Muster" placeholder="Nr. …" />
      </label>
      <!-- Beim Abschreiben eines Kirchenbuchs ist die Seite die Angabe, die sich am
           wenigsten ändert — mitgeführt steht sie sichtbar im Feld und wird korrigiert
           statt neu getippt (ADR-v9-271). -->
      <label class="entry-builder__source-carry">
        <input type="checkbox" bind:checked={pageCarry} aria-label="Seite in den nächsten Eintrag mitführen" />
        <span>Seite mitführen</span>
      </label>
      <label class="entry-builder__source-field">
        Weblink-Muster
        <input type="text" {...PLAIN_FIELD} bind:value={urlPattern} aria-label="Weblink-Muster" />
      </label>
      <label class="entry-builder__source-carry">
        <input type="checkbox" bind:checked={urlCarry} aria-label="Weblink in den nächsten Eintrag mitführen" />
        <span>Weblink mitführen</span>
      </label>
    {/if}
  </section>

  <!-- Die BELEGTEN Rollen zuerst, in ihrer eigenen Reihenfolge (ADR-v9-268 E5) — sie ist
       verschiebbar. Die noch leeren hängen unverändert hinten dran: sie haben keine
       Position, weil sie kein Feld haben. -->
  <div class="entry-builder__roles">
    {#each alleRollen as role, i (role)}
      <!-- Verschiebbar ist nur, was eine Position hat: die belegten Rollen. Eine noch
           leere steht hinten und bekommt keine Pfeile — sie hat kein Feld, das wandern
           könnte (ADR-v9-268 E5). -->
      <EntryTemplateBuilderRoleSection
        {appState}
        {role}
        group={groupFor(role)}
        {slots}
        {onSlotsChange}
        onMoveUp={i > 0 && i < rollenReihenfolge.length ? () => onSlotsChange(moveRoleBlock(slots, role, -1)) : undefined}
        onMoveDown={i < rollenReihenfolge.length - 1 ? () => onSlotsChange(moveRoleBlock(slots, role, 1)) : undefined}
      />
    {/each}
  </div>

  {#if errors.length > 0}
    <ul class="entry-builder__errors">
      {#each errors as err (err)}
        <li>{err}</li>
      {/each}
    </ul>
  {/if}

  <div class="entry-builder__actions">
    <button type="button" class="stb-btn" data-variant="primary" disabled={errors.length > 0} onclick={trySave}>
      Vorlage speichern
    </button>
    <button type="button" class="stb-btn" data-variant="secondary" onclick={onCancel}>Abbrechen</button>
    {#if onExport}
      <!-- BL-354: EINE Vorlage weitergeben. Steht hier statt in der Liste, weil man an
           dieser Stelle ohnehin an genau dieser Vorlage arbeitet — und weil die Zeile
           drüben keine vierte Glyphe bekommt ([21 §7](21-UI-UX.md)/Altlast §10). Eine
           MITGELIEFERTE Vorlage hat den Knopf damit gar nicht; sie weiterzugeben wäre
           ohnehin sinnlos, der Empfänger hat sie schon. -->
      <button type="button" class="stb-btn" data-variant="secondary" onclick={() => onExport($state.snapshot(draft))}>
        Als Datei sichern
      </button>
    {/if}
  </div>
</div>

<style>
  .entry-builder {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    padding: 0.75rem;
    overflow-y: auto;
  }

  .entry-builder__head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .entry-builder__name {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.85rem;
    color: var(--stb-text-dim);
    flex: 1;
  }

  .entry-builder__source {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.6rem;
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-card);
  }

  .entry-builder__source-toggle {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
  }

  .entry-builder__source-field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.8rem;
    color: var(--stb-text-dim);
  }

  /* Schalter mit Wort, kein Feld mit Beschriftung darüber — deshalb in der Zeile. */
  .entry-builder__source-carry {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.8rem;
    color: var(--stb-text-dim);
  }

  .entry-builder__roles {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .entry-builder__errors {
    margin: 0;
    padding-left: 1.2rem;
    color: var(--stb-danger);
    font-size: 0.82rem;
  }

  .entry-builder__actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
</style>
