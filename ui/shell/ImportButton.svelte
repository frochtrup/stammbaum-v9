<script lang="ts">
  // ui/shell/ImportButton.svelte — Import-Einstieg (Spec 20 §1.2): "Datei öffnen"
  // nutzt services/file (createFileService + pickAndImport), core/interop (parseGedcom)
  // gibt reines Domänenmodell zurück, das über AppState.loadDatabase() geladen wird.
  // GRAMPS-Import ist NICHT Teil dieser Scheibe (nur GEDCOM).
  //
  // Orte/Höfe-Wiring (Spec 14 §6, Spec 11 §4, Behebung ADR-v9-19-Befund): NACH dem Parsen
  // und VOR appState.loadDatabase() wird der orte.json-Browser-Spiegel geladen und
  // core/places.resolveEvents() über applyPlaceResolution() auf ALLE Events der frisch
  // geparsten Datenbank angewendet — sonst bleiben Orte-/Höfe-Tab nach echtem Import leer
  // (nur die live-berechneten Chokepoint-Fallbacks laufen dann, aber ohne befüllte
  // Registry-Maps gibt es nichts zu matchen). Ist durch den Hof-Bootstrap (Pfade C/B')
  // db.hofObjects gewachsen, wird der orte.json-Spiegel aktualisiert zurückgespeichert,
  // BEVOR appState.loadDatabase() die Schale mit dem fertig aufgelösten Stand versorgt —
  // ein Ladepfad, keine zweite Invalidierung danach.
  import { createFileService } from '../../services/file';
  import { parseGedcom } from '../../core/interop';
  import { createPlacesSyncService, applyPlaceResolution } from '../../services/places';
  import type { AppState } from './app-state.svelte';

  interface Props {
    appState: AppState;
  }
  const { appState }: Props = $props();

  let status = $state<'idle' | 'loading' | 'error'>('idle');
  let errorMessage = $state('');
  /** Einfacher State-Flag für Konflikt-/Schema-Hinweise (Spec 30 §4 LP-9) — kein Modal,
   * keine eigene Toast-Infrastruktur vorhanden; reicht laut Aufgabenstellung. */
  let placesNotice = $state('');

  const fileService = createFileService();
  const placesSync = createPlacesSyncService();

  async function handleClick() {
    status = 'loading';
    errorMessage = '';
    placesNotice = '';
    try {
      const picked = await fileService.pickAndImport();
      if (!picked) {
        status = 'idle';
        return;
      }
      const parsed = parseGedcom(picked.text);

      const loaded = await placesSync.loadPlaces();
      parsed.db.placeObjects = loaded.placeObjects;
      parsed.db.hofObjects = loaded.hofObjects;

      const resolution = applyPlaceResolution(parsed.db);

      if (resolution.hofObjectsGrew) {
        const reconciled = await placesSync.reconcileAndSave(
          parsed.db.placeObjects,
          parsed.db.hofObjects,
          loaded.rev
        );
        parsed.db.placeObjects = reconciled.placeObjects;
        parsed.db.hofObjects = reconciled.hofObjects;
        if (reconciled.warning?.kind === 'union-merge') {
          placesNotice = 'Orts-/Hofwissen wurde mit einem anderen Gerät zusammengeführt (kein Datenverlust).';
        } else if (reconciled.warning?.kind === 'schema-too-new') {
          placesNotice = 'Orts-/Hofwissen stammt von einer neueren App-Version — nicht gespeichert (Nur-Lese-Schutz).';
        }
      }

      appState.loadDatabase(parsed.db, picked.name);
      status = 'idle';
    } catch (err) {
      status = 'error';
      errorMessage = err instanceof Error ? err.message : String(err);
    }
  }
</script>

<div class="import-bar">
  <button type="button" class="import-bar__button" onclick={handleClick} disabled={status === 'loading'}>
    {status === 'loading' ? 'Lade …' : 'Datei öffnen (GEDCOM)'}
  </button>
  {#if appState.fileName}
    <span class="import-bar__filename">{appState.fileName}</span>
  {/if}
  {#if status === 'error'}
    <span class="import-bar__error" role="alert">Fehler beim Import: {errorMessage}</span>
  {/if}
  {#if placesNotice}
    <span class="import-bar__notice" role="status">{placesNotice}</span>
  {/if}
</div>

<style>
  .import-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 1rem;
    background: var(--stb-surface-2);
    border-bottom: 1px solid var(--stb-surface-3);
    flex-wrap: wrap;
  }

  .import-bar__button {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.5rem 0.9rem;
    font-weight: 600;
    cursor: pointer;
  }

  .import-bar__button:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .import-bar__filename {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
  }

  .import-bar__error {
    color: var(--stb-danger);
    font-size: 0.85rem;
  }

  .import-bar__notice {
    color: var(--stb-text-dim);
    font-size: 0.85rem;
    font-style: italic;
  }
</style>
