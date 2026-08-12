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
  import {
    createEntryTemplatesStore,
    exportEntryTemplates,
    importEntryTemplates,
    mergeImportedTemplates,
  } from '../../../services/app-data';
  import type { FileService } from '../../../services/file';
  import type { PickerAdapter } from '../../../services/file/types';
  import EntryTemplateList from './EntryTemplateList.svelte';
  import EntryTemplateBuilder from './EntryTemplateBuilder.svelte';
  import EntryTemplateCapture from '../../shell/EntryTemplateCapture.svelte';
  import StatusNotice from '../../shell/StatusNotice.svelte';

  interface Props {
    appState: AppState;
    /** Der geteilte Halter der NUTZER-Vorlagen (App.svelte verdrahtet ihn wie
     *  `tourStore`/`projectsState`: EINMAL erzeugt, damit die Liste einen Ausflug in ein
     *  anderes Nav-Ziel überlebt). Ohne ihn (z. B. ein isolierter Komponententest) legt
     *  sich diese Fläche selbst einen an — dieselbe Rückwärtskompatibilität wie
     *  `appDataIO`/`mediaResolver` in MoreView.svelte. */
    templates?: EntryTemplatesState;
    /** Dasselbe Export-Rohr wie Genealogie-Datei/`orte.json`/`app-data.json`
     *  (INV-FILE-2/3, BL-354) und derselbe Picker wie jeder andere Import. Beide optional:
     *  ohne sie bleiben die Datei-Aktionen unsichtbar statt tot. */
    fileService?: FileService;
    picker?: PickerAdapter;
  }
  const { appState, templates, fileService, picker }: Props = $props();

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

  // --- Eine Vorlage als Datei weitergeben (BL-354) --------------------------------------
  // Der laufende Bestand reist ohnehin im B1-Bündel; diese Datei ist der Weg, EINE Vorlage
  // an jemand anderen zu geben. Rückmeldung über den geteilten Baustein, kein eigener Kanal
  // (BL-334 — neue Flächen fangen nicht damit an).
  let hinweis = $state('');

  async function exportTemplate(tpl: EntryTemplate): Promise<void> {
    if (!fileService) return;
    try {
      const res = await exportEntryTemplates(fileService, [tpl], tpl.label);
      hinweis = !res.ok
        ? 'Sichern abgebrochen.'
        : res.tier === 'fs-handle'
          ? `„${tpl.label}“ in die Datei gesichert.`
          : res.tier === 'share'
            ? `„${tpl.label}“ zum Sichern angeboten.`
            : `„${tpl.label}“ als Download bereitgestellt.`;
    } catch (err) {
      hinweis = 'Sichern fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err));
    }
  }

  async function importTemplate(): Promise<void> {
    if (!picker) return;
    try {
      const gelesen = await importEntryTemplates(picker);
      if (!gelesen) return; // Picker abgebrochen — kein Fehler, keine Meldung.
      // Ergänzen, nie ersetzen (v8 überschrieb die ganze Liste). Die mitgelieferten ids
      // sind gesperrt, damit eine fremde Datei sie nicht besetzt (ADR-v9-264 E8).
      const vorher = store.templates.length;
      const zusammen = mergeImportedTemplates(
        store.templates,
        gelesen,
        BUILTIN_ENTRY_TEMPLATES.map((t) => t.id),
      );
      for (const tpl of zusammen.slice(vorher)) store.add(tpl);
      hinweis =
        gelesen.length === 1
          ? `„${gelesen[0].label}“ übernommen.`
          : `${gelesen.length} Vorlagen übernommen.`;
    } catch (err) {
      hinweis = 'Laden fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err));
    }
  }
</script>

{#if hinweis}
  <StatusNotice text={hinweis} onDismiss={() => (hinweis = '')} />
{/if}

{#if mode.kind === 'list'}
  <EntryTemplateList
    templates={all}
    onCapture={openCapture}
    onEdit={openEdit}
    onCopy={openCopy}
    onDelete={deleteTemplate}
    onNew={openNew}
    onImport={picker ? importTemplate : undefined}
  />
{:else if mode.kind === 'builder'}
  <!-- `{#key}` erzwingt eine frische Instanz je Vorlage (TST-10/ADR-v9-83-Geist): sonst
       trüge ein zweites, ohne Unmount geöffnetes Formular den Entwurf des ersten weiter. -->
  {#key mode.template.id}
    <EntryTemplateBuilder
      {appState}
      template={mode.template}
      onSave={saveTemplate}
      onCancel={backToList}
      onExport={fileService ? exportTemplate : undefined}
    />
  {/key}
{:else}
  {#key mode.template.id}
    <EntryTemplateCapture {appState} template={mode.template} onClose={backToList} />
  {/key}
{/if}
