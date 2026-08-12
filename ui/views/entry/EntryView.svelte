<script lang="ts">
  // ui/views/entry/EntryView.svelte — die Arbeitsfläche „Erfassung" (BL-353, ADR-v9-265).
  // Eigenes Navigationsziel der Rolle `work` (nav-model.ts) — NICHT mehr ein Werkzeug der
  // Personenliste (ADR-v9-264 E9, dort überholt): eine Vorlage legt Personen UND Familien
  // in einem Zug an, sie gehört keiner einzelnen Entitäts-Fläche.
  //
  // DREI ZUSTÄNDE, EIN VIEW (INV-VS: genau eine Auswahl-Instanz, kein verstreutes Trio):
  //  - Liste (Einstieg): `EntryTemplateList` — erfassen/bearbeiten/kopieren/löschen/neu.
  //  - Builder (bearbeiten/neu/kopieren): `EntryTemplateBuilder`.
  //  - Erfassen: die in BL-352 gebaute `EntryTemplateCapture` — UNVERÄNDERT übernommen,
  //    diese Fläche öffnet sie nur noch von einem anderen Ort aus (ADR-v9-265 Konsequenz).
  //
  // Persistenz AUSSCHLIESSLICH über den B1-Bündel-Abschnitt `entryTemplates`
  // (`services/app-data`, ADR-v9-264 E7) — kein eigener Speicher. Die mitgelieferten
  // Vorlagen (`BUILTIN_ENTRY_TEMPLATES`) sind eine Kern-Konstante und werden nie
  // geschrieben (E8); `combinedEntryTemplates` fügt sie nur für die ANZEIGE zusammen.
  import { onMount, untrack } from 'svelte';
  import type { AppState } from '../../shell/app-state.svelte';
  import { BUILTIN_ENTRY_TEMPLATES, type EntryTemplate } from '../../../core/model/entry-templates';
  import {
    combinedEntryTemplates,
    copyEntryTemplate,
    emptyEntryTemplate,
    newEntryTemplateId,
  } from './entry-template-builder-model';
  import { createEntryTemplatesState, type EntryTemplatesState } from '../../shell/entry-templates-state.svelte';
  import { createEntryTemplatesStore } from '../../../services/app-data';
  import EntryTemplateList from './EntryTemplateList.svelte';
  import EntryTemplateBuilder from './EntryTemplateBuilder.svelte';
  import EntryTemplateCapture from '../../shell/EntryTemplateCapture.svelte';

  interface Props {
    appState: AppState;
    /** Der geteilte Halter der NUTZER-Vorlagen (App.svelte verdrahtet ihn wie
     *  `tourStore`/`projectsState`: EINMAL erzeugt, damit die Liste einen Ausflug in ein
     *  anderes Nav-Ziel überlebt). Ohne ihn (z. B. ein isolierter Komponententest) legt
     *  sich diese Fläche selbst einen an — dieselbe Rückwärtskompatibilität wie
     *  `appDataIO`/`mediaResolver` in MoreView.svelte. */
    templates?: EntryTemplatesState;
  }
  const { appState, templates }: Props = $props();

  // `untrack`: der Halter ist eine Instanz, kein Prop-Wert, der sich ändern soll (TST-10-
  // Geist — Erstlese-Muster, hier für einen Fallback-Konstruktor statt eines Feldwerts).
  const store = untrack(() => templates ?? createEntryTemplatesState(createEntryTemplatesStore()));

  onMount(() => {
    void store.load();
  });

  type Mode =
    | { kind: 'list' }
    | { kind: 'builder'; template: EntryTemplate }
    | { kind: 'capture'; template: EntryTemplate };
  let mode = $state<Mode>({ kind: 'list' });

  // EINE Quelle für „alle Vorlagen" (mitgeliefert + eigene) — die Liste UND der
  // „nicht unterscheidbar"-Fertig-Zustand (BL-353) hängen an derselben Zusammenführung.
  const all = $derived(combinedEntryTemplates(BUILTIN_ENTRY_TEMPLATES, store.templates));

  function openNew(): void {
    mode = { kind: 'builder', template: emptyEntryTemplate(newEntryTemplateId()) };
  }
  function openEdit(tpl: EntryTemplate): void {
    mode = { kind: 'builder', template: tpl };
  }
  function openCopy(tpl: EntryTemplate): void {
    mode = { kind: 'builder', template: copyEntryTemplate(tpl, newEntryTemplateId()) };
  }
  function openCapture(tpl: EntryTemplate): void {
    mode = { kind: 'capture', template: tpl };
  }
  function backToList(): void {
    mode = { kind: 'list' };
  }
  function saveTemplate(tpl: EntryTemplate): void {
    if (store.templates.some((t) => t.id === tpl.id)) store.update(tpl);
    else store.add(tpl);
    mode = { kind: 'list' };
  }
  function deleteTemplate(tpl: EntryTemplate): void {
    store.remove(tpl.id);
  }
</script>

{#if mode.kind === 'list'}
  <EntryTemplateList
    templates={all}
    onCapture={openCapture}
    onEdit={openEdit}
    onCopy={openCopy}
    onDelete={deleteTemplate}
    onNew={openNew}
  />
{:else if mode.kind === 'builder'}
  <!-- `{#key}` erzwingt eine frische Instanz je Vorlage (TST-10/ADR-v9-83-Geist): sonst
       trüge ein zweites, ohne Unmount geöffnetes Formular den Entwurf des ersten weiter. -->
  {#key mode.template.id}
    <EntryTemplateBuilder {appState} template={mode.template} onSave={saveTemplate} onCancel={backToList} />
  {/key}
{:else}
  {#key mode.template.id}
    <EntryTemplateCapture {appState} template={mode.template} onClose={backToList} />
  {/key}
{/if}
