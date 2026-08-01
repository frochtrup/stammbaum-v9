<script lang="ts">
  // ui/views/reports/ReportsView.svelte — der „Ausgaben"-Hub (Spec 20 §4, BL-169). Ersetzt
  // den vormaligen ComingSoonPanel-Platzhalter im Mehr-Hub. Listet die verfügbaren Druck-
  // Reports (Katalog `REPORTS`, keine zweite Liste hier) und erzeugt sie als standalone-
  // HTML: die reine Renderfunktion des jeweiligen Builders (aus dem Modell gerechnet, nie
  // aus dem DOM) → Blob → neuer Tab, in dem der Nutzer über den Browser druckt/als PDF
  // sichert (kein Server, keine externe Bibliothek — Spec 20 §4).
  import type { AppState } from '../../shell/app-state.svelte';
  import type { ViewState } from '../../shell/view-state.svelte';
  import type { PersonId } from '../../../core/model/types';
  import { REPORTS } from './index';
  import { openReportInNewTab } from './open-report';
  import { resolveProband } from '../../shell/proband';
  import type { MediaResolver } from '../../../services/media';
  import PersonPicker from '../../shell/PersonPicker.svelte';

  interface Props {
    appState: AppState;
    /** Für die Proband-Vorbelegung der Bezugsperson (BL-120). Optional, damit bestehende
     *  Tests ohne ViewState weiterlaufen — ohne ihn bleibt die Bezugsperson zunächst leer. */
    viewState?: ViewState;
    /** Medien-Auflösung (BL-261) — ohne sie enthalten Ausgaben nur eingebettete Fotos. */
    mediaResolver?: MediaResolver;
  }
  const { appState, viewState, mediaResolver }: Props = $props();

  const hasData = $derived(appState.db.individuals.size > 0);

  // Gemeinsame Bezugsperson für die personen-bezogenen Reports (Ahnenliste/Familienbogen/
  // Nachkommentafel). Vorbelegt mit dem Probanden (effektive Referenzperson, BL-120 —
  // vorher die erste Person in Einfüge-Reihenfolge), damit diese Reports sofort ohne
  // Zwischenschritt erzeugbar sind; per Picker änderbar.
  let personId = $state<PersonId | null>(null);
  $effect(() => {
    if (!personId && appState.db.individuals.size > 0) {
      personId = viewState ? resolveProband(appState.db, viewState) : (appState.db.individuals.keys().next().value ?? null);
    }
  });

  let error = $state('');

  async function generate(reportId: string) {
    error = '';
    const def = REPORTS.find((r) => r.id === reportId);
    if (!def) return;
    if (def.needsPerson && !personId) {
      error = 'Bitte zuerst eine Bezugsperson wählen.';
      return;
    }
    let html: string;
    try {
      const on = new Date().toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' });
      // Vorlauf (BL-261): erst die Bilder auflösen, dann synchron bauen. Nur Reports
      // mit Fotos zahlen den Preis — die übrigen tragen kein `mediaFiles`.
      const embed =
        def.mediaFiles && mediaResolver
          ? await mediaResolver.dataUrls(def.mediaFiles(appState.db, personId))
          : undefined;
      html = def.build(appState.db, appState.placeContext, on, personId, embed);
    } catch (err) {
      error = `${def.label}: ${err instanceof Error ? err.message : String(err)}`;
      return;
    }
    openReportInNewTab(html, `${def.label}.html`);
  }
</script>

<div class="reports">
  {#if !hasData}
    <p class="reports__empty">Keine Daten geladen — unter „Mehr" eine Datei öffnen, um Ausgaben zu erzeugen.</p>
  {:else}
    <section class="reports__person" role="group" aria-labelledby="reports-person-label">
      <h3 id="reports-person-label" class="stb-role-label">Bezugsperson</h3>
      <p class="reports__hint">Für Ahnenliste, Familienbogen, Nachkommentafel und Familienbuch.</p>
      <PersonPicker
        {appState}
        value={personId}
        onChange={(id) => (personId = id)}
        allowCreate={false}
        label="Bezugsperson für Reports"
        placeholder="Person wählen…"
      />
    </section>

    {#if error}
      <p class="reports__error" role="alert">⚠ {error}</p>
    {/if}

    <ul class="reports__list">
      {#each REPORTS as def (def.id)}
        <li class="reports__card">
          <div class="reports__card-text">
            <span class="reports__card-label">{def.label}</span>
            <span class="reports__card-desc">{def.description}</span>
            {#if def.needsPerson}
              <span class="reports__card-tag">braucht Bezugsperson</span>
            {/if}
          </div>
          <button
            type="button"
            class="reports__gen"
            disabled={def.needsPerson && !personId}
            onclick={() => generate(def.id)}
          >Anzeigen / Drucken</button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .reports {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0.75rem;
    width: 100%;
    max-width: 40rem;
    margin: 0 auto;
  }

  .reports__empty {
    color: var(--stb-text-dim);
    padding: 1rem 0.25rem;
  }

  .reports__person {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    border-bottom: 1px solid var(--stb-surface-3);
    padding-bottom: 1rem;
  }

  .reports__hint {
    margin: 0;
    font-size: 0.82rem;
    color: var(--stb-text-dim);
  }

  .reports__error {
    margin: 0;
    color: var(--stb-danger, #c04040);
    font-size: 0.9rem;
  }

  .reports__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .reports__card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    background: var(--stb-surface-2);
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-card);
    padding: 0.75rem 1rem;
  }

  .reports__card-text {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .reports__card-label {
    color: var(--stb-text);
    font-weight: 600;
  }

  .reports__card-desc {
    color: var(--stb-text-dim);
    font-size: 0.82rem;
  }

  .reports__card-tag {
    color: var(--stb-gold);
    font-size: 0.72rem;
  }

  /* Gold-gefüllte Primäraktion — dieselbe Sprache wie „＋ Neue Person" (INV-UI-4). */
  .reports__gen {
    flex: 0 0 auto;
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: 1px solid var(--stb-gold);
    border-radius: var(--stb-radius-control);
    padding: 0.5rem 0.9rem;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }

  .reports__gen:disabled {
    background: var(--stb-surface-3);
    color: var(--stb-text-dim);
    border-color: var(--stb-gold-dim);
    cursor: not-allowed;
  }
</style>
