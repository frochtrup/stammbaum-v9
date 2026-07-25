<script lang="ts">
  // ui/views/research-projects/ProjectBar.svelte — Projekt-Chip-Selektor + Verwaltung
  // (Spec 12 §5, Spec 20 §1.11f, BL-58). Lebt GENAU EINMAL auf der ResearchTab-Umbrella-
  // Ebene (oberhalb der Segmente, INV-UI-11) und scoped Aufgaben+Protokoll+Dashboard
  // gemeinsam — NICHT pro Segment dupliziert.
  //
  // Die Scope-Achsen (Nachname/Ort/Zeitraum) sind kommagetrennte Freitext-Eingaben; die
  // Matching-Wahrheit (welche Person fällt hinein) liegt im Kern (matchesScope, BL-58),
  // nicht hier.
  import type { ProjectsState } from '../../shell/projects-state.svelte';
  import { makeProject, type Project } from '../../../core/research/index';

  interface Props {
    projects: ProjectsState;
  }
  const { projects }: Props = $props();

  let editing = $state<Project | null>(null);
  let showForm = $state(false);
  let fName = $state('');
  let fSurnames = $state('');
  let fPlaces = $state('');
  let fFrom = $state('');
  let fTo = $state('');

  function splitList(s: string): string[] {
    return s.split(',').map((x) => x.trim()).filter(Boolean);
  }
  function toYear(s: string): number | null {
    const n = parseInt(s.trim(), 10);
    return Number.isFinite(n) ? n : null;
  }

  function openNew() {
    editing = null;
    fName = '';
    fSurnames = '';
    fPlaces = '';
    fFrom = '';
    fTo = '';
    showForm = true;
  }

  function openEdit(p: Project) {
    editing = p;
    fName = p.name;
    fSurnames = p.scope.surnames.join(', ');
    fPlaces = p.scope.places.join(', ');
    fFrom = p.scope.yearFrom == null ? '' : String(p.scope.yearFrom);
    fTo = p.scope.yearTo == null ? '' : String(p.scope.yearTo);
    showForm = true;
  }

  function save() {
    if (!fName.trim()) return;
    const scope = {
      surnames: splitList(fSurnames),
      places: splitList(fPlaces),
      yearFrom: toYear(fFrom),
      yearTo: toYear(fTo),
      personIds: editing ? editing.scope.personIds : [],
    };
    if (editing) {
      projects.update({ ...editing, name: fName.trim(), scope });
    } else {
      const id = crypto.randomUUID();
      projects.add(makeProject(id, { name: fName.trim(), scope, created: new Date().toISOString().slice(0, 10) }));
      projects.setActive(id);
    }
    showForm = false;
  }

  function removeCurrent() {
    if (editing) projects.remove(editing.id);
    showForm = false;
  }
</script>

<div class="project-bar">
  <div class="project-bar__chips stb-segment-row" role="tablist" aria-label="Forschungsprojekt wählen">
    <button
      type="button"
      role="tab"
      class="stb-segment-btn"
      class:stb-segment-btn--active={projects.activeProjectId === null}
      aria-selected={projects.activeProjectId === null}
      onclick={() => projects.setActive(null)}
    >
      Alle
    </button>
    {#each projects.projects as p (p.id)}
      <button
        type="button"
        role="tab"
        class="stb-segment-btn"
        class:stb-segment-btn--active={projects.activeProjectId === p.id}
        aria-selected={projects.activeProjectId === p.id}
        onclick={() => projects.setActive(p.id)}
        ondblclick={() => openEdit(p)}
        title="Doppelklick zum Bearbeiten"
      >
        {p.name}
      </button>
    {/each}
    <button type="button" class="project-bar__add" onclick={openNew} aria-label="Neues Forschungsprojekt">＋</button>
  </div>

  {#if showForm}
    <form class="project-bar__form" onsubmit={(e) => { e.preventDefault(); save(); }}>
      <label class="project-bar__field">
        Name
        <input type="text" bind:value={fName} placeholder="z. B. Linie Decker" />
      </label>
      <div class="project-bar__row">
        <label class="project-bar__field">
          Nachnamen
          <input type="text" bind:value={fSurnames} placeholder="Decker, Meyer" />
        </label>
        <label class="project-bar__field">
          Orte
          <input type="text" bind:value={fPlaces} placeholder="Ochtrup, Rheine" />
        </label>
      </div>
      <div class="project-bar__row">
        <label class="project-bar__field">
          Jahr von
          <input type="number" bind:value={fFrom} placeholder="1800" />
        </label>
        <label class="project-bar__field">
          Jahr bis
          <input type="number" bind:value={fTo} placeholder="1900" />
        </label>
      </div>
      <p class="project-bar__hint">Leere Achse schränkt nicht ein; alle Achsen sind UND-verknüpft.</p>
      <div class="project-bar__actions">
        {#if editing}
          <button type="button" class="project-bar__delete" onclick={removeCurrent}>Löschen</button>
        {/if}
        <button type="button" class="project-bar__cancel" onclick={() => (showForm = false)}>Abbrechen</button>
        <button type="submit" class="project-bar__save">Speichern</button>
      </div>
    </form>
  {/if}
</div>

<style>
  .project-bar {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.4rem 1rem;
    border-bottom: 1px solid var(--stb-surface-3);
  }

  .project-bar__chips {
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .project-bar__add {
    background: transparent;
    border: 1px solid var(--stb-surface-3);
    color: var(--stb-text-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.2rem 0.6rem;
    cursor: pointer;
  }

  .project-bar__form {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    background: var(--stb-surface-1);
    border: 1px solid var(--stb-surface-3);
    border-radius: var(--stb-radius-control);
    padding: 0.6rem;
  }

  .project-bar__row {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .project-bar__row .project-bar__field {
    flex: 1 1 120px;
  }

  .project-bar__field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.8rem;
    color: var(--stb-text-dim);
  }

  .project-bar__field input {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.5rem;
    font-size: 0.9rem;
  }

  .project-bar__hint {
    margin: 0;
    font-size: 0.75rem;
    color: var(--stb-text-muted);
  }

  .project-bar__actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .project-bar__delete {
    margin-right: auto;
    background: transparent;
    border: 1px solid var(--stb-danger);
    color: var(--stb-danger);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
  }

  .project-bar__cancel {
    background: transparent;
    border: 1px solid var(--stb-surface-3);
    color: var(--stb-text-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    cursor: pointer;
  }

  .project-bar__save {
    background: var(--stb-gold);
    color: var(--stb-bg);
    border: none;
    border-radius: var(--stb-radius-control);
    padding: 0.3rem 0.7rem;
    font-weight: 700;
    cursor: pointer;
  }
</style>
