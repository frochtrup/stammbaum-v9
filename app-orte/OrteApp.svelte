<script lang="ts">
  // app-orte/OrteApp.svelte — die Schale des Standalone-Orte-Editors (Spec 22 §6).
  //
  // Bewusst klein: Kopfzeile mit den Datei-Befehlen, zwei Segmente Orte | Höfe, darunter
  // die GETEILTE Liste-↔-Detail-Fläche. Keine Bottom-Navigation, keine Linsen, kein
  // Dashboard — und vor allem keine eigenen Listen-/Formular-/Dialogmuster: der Editor
  // zeigt die Komponenten des Hauptprogramms (INV-UI-4, INV-ORTE-1).
  //
  // Was hier NICHT steht, ist Absicht: „Zuordnungen prüfen" und „Quelle schärfen" werden
  // gar nicht erst als Callback übergeben (D2/D5) — die geteilten Listen blenden ihre
  // Trigger dann von selbst aus. Massen-Dedup dagegen bleibt: er braucht keine Ereignisse.
  import PlaceList from '../ui/views/place/PlaceList.svelte';
  import PlaceDetail from '../ui/views/place/PlaceDetail.svelte';
  import PlaceDedupView from '../ui/views/place/PlaceDedupView.svelte';
  import HofList from '../ui/views/hof/HofList.svelte';
  import HofDetail from '../ui/views/hof/HofDetail.svelte';
  import HofDedupView from '../ui/views/hof/HofDedupView.svelte';
  import { createOrteHost } from './orte-state.svelte';
  import { createOrteNav } from './orte-nav.svelte';
  import {
    emptyOrteState,
    newDocument,
    pickAndOpen,
    saveDocument,
    type OrteDocIO,
    type OrteDocumentState
  } from './orte-doc';
  import { IdbOrteDraftStore, debounceDraft, type OrteDraft } from './orte-draft-store';
  import { InputFilePickerAdapter } from '../services/file/picker-adapter';
  import { createFileService } from '../services/file/create-file-service';
  import { IdbPlacesFileHandleStore } from '../services/places';
  import { loadContextDocument } from './orte-context';
  // Formfaktor: EINE Quelle für beide Programme (Spec 21 §3). Seit ADR-v9-171 meldet sie
  // sich selbst an — der Editor braucht kein eigenes `start()`.
  import { layout } from '../ui/shell/layout.svelte';
  // Update-Hinweis statt stillem Bruch (Spec 30 NFR-2) — dieselbe Komponente wie im
  // Hauptprogramm, kein zweiter Mechanismus (INV-UI-4).
  import UpdateBanner from '../ui/shell/UpdateBanner.svelte';
  import { swUpdate } from '../ui/shell/sw-update.svelte';
  import { applyUpdate } from '../app/sw-register';

  type Tab = 'places' | 'hofs';
  type Tool = null | 'dedup';

  const draftStore = new IdbOrteDraftStore();
  const draftWriter = debounceDraft(draftStore);

  const host = createOrteHost({
    onChanged: (content) => {
      if (!doc.open) return;
      draftWriter.write({
        fileName: doc.fileName,
        baseRev: doc.rev,
        savedAt: Date.now(),
        placeObjects: [...content.placeObjects.values()],
        hofObjects: [...content.hofObjects.values()]
      });
    }
  });
  const nav = createOrteNav();

  const io: OrteDocIO = {
    // EIGENE Picker-Instanz (ADR-v9-70): sie teilt sich keinen Zustand mit einem
    // Genealogie-Import. Ohne gzip-Codec — orte.json ist immer unkomprimiertes JSON.
    picker: new InputFilePickerAdapter(),
    fileService: createFileService(),
    handleStore: new IdbPlacesFileHandleStore(),
    now: () => Date.now(),
    deviceId: () => deviceId()
  };

  /** Geräte-Kennung für den `device`-Eintrag der Datei (Spec 30 §4). Einmal erzeugt,
   *  lokal gemerkt — dieselbe Rolle wie im Hauptprogramm, eigener Schlüssel. */
  function deviceId(): string {
    const KEY = 'stammbaum-orte-editor-device';
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = `orte-editor-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  }

  let doc = $state<OrteDocumentState>(emptyOrteState());
  let tab = $state<Tab>('places');
  let tool = $state<Tool>(null);
  let notice = $state('');
  let contextName = $state('');
  let busy = $state(false);

  const title = $derived(doc.open ? `${doc.fileName}${doc.dirty ? ' •' : ''}` : 'Keine Datei geöffnet');

  async function openFile(): Promise<void> {
    if (!(await confirmDiscard())) return;
    busy = true;
    try {
      const opened = await pickAndOpen(io);
      if (!opened) return;
      host.loadContent(opened.content);
      doc = opened.state;
      notice = opened.state.readOnly
        ? 'Nur-Lese-Modus: die Datei stammt aus einer neueren Programmfassung.'
        : `${opened.content.placeObjects.size} Orte, ${opened.content.hofObjects.size} Höfe geladen.`;
      await draftStore.clear().catch(() => {});
    } catch (err) {
      notice = err instanceof Error ? err.message : 'Die Datei konnte nicht gelesen werden.';
    } finally {
      busy = false;
    }
  }

  async function createNew(): Promise<void> {
    if (!(await confirmDiscard())) return;
    const fresh = newDocument();
    host.loadContent(fresh.content);
    doc = fresh.state;
    notice = 'Neues, leeres Ortsverzeichnis.';
    await draftStore.clear().catch(() => {});
  }

  async function save(): Promise<void> {
    if (!doc.open) return;
    busy = true;
    try {
      const outcome = await saveDocument(io, host.content(), doc);
      notice = outcome.saved ? 'Gespeichert.' : outcome.notice;
      if (outcome.saved) {
        doc = outcome.state;
        host.markSaved();
        // Der Entwurf hat seinen Zweck erfüllt und verfällt (INV-ORTE-3) — er darf nie
        // zur Quelle werden, aus der ein späterer Start etwas anderes wiederherstellt,
        // als in der Datei steht.
        draftWriter.flushCancel();
        await draftStore.clear().catch(() => {});
      }
    } finally {
      busy = false;
    }
  }

  async function loadContext(): Promise<void> {
    busy = true;
    try {
      const loaded = await loadContextDocument(io.picker, host.content());
      if (!loaded) return;
      host.setEventContext(loaded.db);
      contextName = loaded.fileName;
      notice = `Kontextdatei „${loaded.fileName}" gelesen — sie wird nie geschrieben.`;
    } catch (err) {
      notice = err instanceof Error ? err.message : 'Die Kontextdatei konnte nicht gelesen werden.';
    } finally {
      busy = false;
    }
  }

  function dropContext(): void {
    host.setEventContext(null);
    contextName = '';
    notice = 'Kontextdatei entfernt.';
  }

  async function confirmDiscard(): Promise<boolean> {
    if (!host.dirty) return true;
    return confirm('Es gibt ungespeicherte Änderungen. Trotzdem fortfahren?');
  }

  // Absturz-Wiederherstellung (OE-4): beim Start ANBIETEN, nie stillschweigend einsetzen.
  //
  // Der ganze Block ist abgesichert: der Entwurf ist eine Rettungsleine, keine
  // Voraussetzung (INV-ORTE-3). Ist IndexedDB nicht verfügbar — privater Modus,
  // gesperrter Speicher, Testumgebung —, muss der Editor trotzdem starten. Ohne den
  // Fang riss der abgewiesene Speicherzugriff den Effekt mit; im Komponententest wurde
  // das als geworfener Fehler sichtbar, im Browser wäre es ein toter Startbildschirm.
  $effect(() => {
    void (async () => {
      const draft: OrteDraft | null = await draftStore.load().catch(() => null);
      if (!draft || doc.open) return;
      const when = new Date(draft.savedAt).toLocaleString('de-DE');
      if (!confirm(`Ungespeicherter Entwurf von ${when} gefunden (${draft.placeObjects.length} Orte). Wiederherstellen?`)) {
        await draftStore.clear().catch(() => {});
        return;
      }
      host.loadContent({
        placeObjects: new Map(draft.placeObjects.map((p) => [p.id, p])),
        hofObjects: new Map(draft.hofObjects.map((h) => [h.id, h]))
      });
      doc = { fileName: draft.fileName, open: true, dirty: true, readOnly: false, rev: draft.baseRev };
      notice = 'Entwurf wiederhergestellt — noch nicht gespeichert.';
    })();
  });

  // Ungespeicherte Arbeit nicht wortlos verlieren (Spec 22 §4).
  $effect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (host.dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  });

  const placeId = $derived(nav.getCurrent('place'));
  const hofId = $derived(nav.getCurrent('hof'));
  const hasSelection = $derived(tab === 'places' ? placeId !== null : hofId !== null);
</script>

{#snippet listPane()}
  {#if tab === 'places'}
    <PlaceList appState={host} viewState={nav} onOpenDedup={() => (tool = 'dedup')} />
  {:else}
    <HofList appState={host} viewState={nav} onOpenDedup={() => (tool = 'dedup')} />
  {/if}
{/snippet}

{#snippet detailPane()}
  {#if tab === 'places'}
    <PlaceDetail appState={host} viewState={nav} onBack={() => nav.setCurrent('place', null)} />
  {:else}
    <HofDetail appState={host} viewState={nav} onBack={() => nav.setCurrent('hof', null)} />
  {/if}
{/snippet}

<div class="orte-app">
  <UpdateBanner visible={swUpdate.ready} onApply={applyUpdate} />

  <header class="orte-app__bar">
    <h1 class="orte-app__title" title={doc.open ? doc.fileName : ''}>{title}</h1>
    <div class="orte-app__commands">
      <button type="button" onclick={openFile} disabled={busy}>Öffnen</button>
      <button type="button" onclick={createNew} disabled={busy}>Neu</button>
      <button type="button" onclick={save} disabled={busy || !doc.open || doc.readOnly}>Speichern</button>
      <button type="button" onclick={() => host.undo()} disabled={!host.canUndo} aria-label="Rückgängig">↶</button>
      <button type="button" onclick={() => host.redo()} disabled={!host.canRedo} aria-label="Wiederholen">↷</button>
      <a class="orte-app__help" href="./HANDBUCH-ORTE.html" target="_blank" rel="noopener">Handbuch</a>
      {#if contextName}
        <button type="button" onclick={dropContext} title={contextName}>Kontext lösen</button>
      {:else}
        <button type="button" onclick={loadContext} disabled={busy}>Kontextdatei …</button>
      {/if}
    </div>
  </header>

  {#if notice}
    <p class="orte-app__notice" role="status">{notice}</p>
  {/if}

  {#if !doc.open}
    <div class="orte-app__empty">
      <p>Ein Editor für <code>orte.json</code> — dem Ortsverzeichnis, das über die einzelne Genealogie-Datei hinaus gilt.</p>
      <p>Öffnen Sie eine vorhandene Datei oder legen Sie ein leeres Verzeichnis an. Eine Genealogie-Datei kann zusätzlich nur lesend geladen werden; sie wird nie geschrieben.</p>
    </div>
  {:else}
    <div class="stb-segment-row orte-app__tabs" role="tablist" aria-label="Bereich wählen">
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'places'}
        class="stb-segment-btn"
        class:stb-segment-btn--active={tab === 'places'}
        onclick={() => { tab = 'places'; tool = null; }}
      >
        Orte ({host.db.placeObjects.size})
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'hofs'}
        class="stb-segment-btn"
        class:stb-segment-btn--active={tab === 'hofs'}
        onclick={() => { tab = 'hofs'; tool = null; }}
      >
        Höfe ({host.db.hofObjects.size})
      </button>
    </div>

    <main class="orte-app__body">
      {#if tool === 'dedup'}
        <!-- Werkzeuge nehmen die ganze Fläche — wie im Hauptprogramm: ein Massen-Dedup
             ist eine eigene Arbeitsfläche, keine Detailansicht neben der Liste. -->
        {#if tab === 'places'}
          <PlaceDedupView appState={host} onClose={() => (tool = null)} />
        {:else}
          <HofDedupView appState={host} onClose={() => (tool = null)} />
        {/if}
      {:else if layout.isDesktopLayout}
        <div class="orte-app__panes">
          <div class="orte-app__pane orte-app__pane--list">{@render listPane()}</div>
          <div class="orte-app__pane orte-app__pane--detail">{@render detailPane()}</div>
        </div>
      {:else if hasSelection}
        {@render detailPane()}
      {:else}
        {@render listPane()}
      {/if}
    </main>
  {/if}
</div>

<style>
  .orte-app {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    background: var(--stb-surface-0);
    color: var(--stb-text);
  }

  .orte-app__bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--stb-surface-3);
  }

  .orte-app__title {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--stb-gold-light);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1 1 8rem;
  }

  .orte-app__commands {
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
  }

  .orte-app__commands button {
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-gold-dim);
    color: var(--stb-gold-light);
    border-radius: var(--stb-radius-control);
    padding: 0.25rem 0.55rem;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .orte-app__help {
    align-self: center;
    color: var(--stb-gold-light);
    font-size: 0.8rem;
    text-decoration: none;
    border-bottom: 1px solid var(--stb-gold-dim);
  }

  .orte-app__commands button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .orte-app__notice {
    margin: 0;
    padding: 0.4rem 0.75rem;
    font-size: 0.8rem;
    color: var(--stb-text-dim);
    border-bottom: 1px solid var(--stb-surface-3);
  }

  .orte-app__empty {
    padding: 1.5rem 1rem;
    max-width: 38rem;
    color: var(--stb-text-dim);
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .orte-app__tabs {
    margin: 0.5rem 0.75rem 0;
  }

  /* Zwei Fenster ab der Layout-Grenze (Spec 21 §3, ADR-v9-171) — dasselbe Muster wie
     `EntityTab`, keine zweite Media-Query: der Formfaktor wird an genau einer Stelle
     entschieden. Für die Ortskuration ist die Liste kein Index zum Überfliegen, sondern
     das Arbeitsmittel — Dubletten, Schreibvarianten und Ketten vergleicht man
     nebeneinander, nicht nacheinander. */
  .orte-app__panes {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .orte-app__pane {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    overflow-y: auto;
  }

  .orte-app__pane--list {
    width: 22rem;
    flex-shrink: 0;
    border-right: 1px solid var(--stb-surface-3);
  }

  .orte-app__pane--detail {
    flex: 1;
  }

  .orte-app__body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
</style>
