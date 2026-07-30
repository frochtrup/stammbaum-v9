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

  // Farbpalette (BL-209, ADR-v9-158): EIN Token-Satz (`--stb-proj-1..6`,
  // design-system.css), keine rohen v8-Hex-Werte hier. `Project.color` speichert den
  // Schlüssel ('1'..'6'); '' = keine Farbe (Bestandsdaten bleiben gültig, kein Punkt).
  const PROJECT_COLORS: { key: string; varName: string; label: string }[] = [
    { key: '1', varName: '--stb-proj-1', label: 'Goldbraun' },
    { key: '2', varName: '--stb-proj-2', label: 'Grün' },
    { key: '3', varName: '--stb-proj-3', label: 'Rot' },
    { key: '4', varName: '--stb-proj-4', label: 'Blau' },
    { key: '5', varName: '--stb-proj-5', label: 'Lila' },
    { key: '6', varName: '--stb-proj-6', label: 'Orange' },
  ];

  function colorVarFor(key: string): string | null {
    return PROJECT_COLORS.find((c) => c.key === key)?.varName ?? null;
  }

  let editing = $state<Project | null>(null);
  let showForm = $state(false);
  let fName = $state('');
  let fSurnames = $state('');
  let fPlaces = $state('');
  let fFrom = $state('');
  let fTo = $state('');
  let fColor = $state('');
  let fNote = $state('');

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
    fColor = '';
    fNote = '';
    showForm = true;
  }

  function openEdit(p: Project) {
    editing = p;
    fName = p.name;
    fSurnames = p.scope.surnames.join(', ');
    fPlaces = p.scope.places.join(', ');
    fFrom = p.scope.yearFrom == null ? '' : String(p.scope.yearFrom);
    fTo = p.scope.yearTo == null ? '' : String(p.scope.yearTo);
    fColor = p.color;
    fNote = p.note;
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
      projects.update({ ...editing, name: fName.trim(), scope, color: fColor, note: fNote });
    } else {
      const id = crypto.randomUUID();
      projects.add(
        makeProject(id, {
          name: fName.trim(),
          scope,
          color: fColor,
          note: fNote,
          created: new Date().toISOString().slice(0, 10),
        }),
      );
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
        {#if p.color && colorVarFor(p.color)}
          <span
            class="project-bar__dot"
            style:background-color="var({colorVarFor(p.color)})"
            aria-hidden="true"
          ></span>
        {/if}
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
      <div class="project-bar__field">
        <span id="project-bar-color-label">Farbe</span>
        <div class="project-bar__swatches" role="group" aria-labelledby="project-bar-color-label">
          <button
            type="button"
            class="project-bar__swatch project-bar__swatch--none"
            class:project-bar__swatch--active={fColor === ''}
            aria-pressed={fColor === ''}
            aria-label="Keine Farbe"
            title="Keine Farbe"
            onclick={() => (fColor = '')}
          >
            {#if fColor === ''}<span class="project-bar__swatch-check" aria-hidden="true">✓</span>{/if}
          </button>
          {#each PROJECT_COLORS as c (c.key)}
            <button
              type="button"
              class="project-bar__swatch"
              class:project-bar__swatch--active={fColor === c.key}
              style:background-color="var({c.varName})"
              aria-pressed={fColor === c.key}
              aria-label={c.label}
              title={c.label}
              onclick={() => (fColor = c.key)}
            >
              {#if fColor === c.key}<span class="project-bar__swatch-check" aria-hidden="true">✓</span>{/if}
            </button>
          {/each}
        </div>
      </div>
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
      <label class="project-bar__field">
        Notiz
        <textarea bind:value={fNote} rows="2" placeholder="Freie Notiz zu diesem Projekt"></textarea>
      </label>
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

  /* Chip-Farbpunkt (BL-209): nur gerendert, wenn das Projekt eine Farbe trägt — ein
     Projekt ohne gesetzte Farbe bleibt gültig und zeigt schlicht keinen Punkt. */
  /* Der Punkt steht auf ZWEI verschiedenen Untergründen: dunkler Chip (inaktiv) und
     goldener Chip (aktiv). Die Palette ist gegen die dunklen Flächen kalibriert — auf Gold
     kam der rote Punkt nur auf 2,22:1 und lag damit unter der 3:1-Schwelle für nicht-
     textliche Bedienelemente (WCAG 1.4.11, gemessen 2026-07-31). Statt die sechs Farben
     neu zu suchen, trennt ein dunkler Ring den Punkt von JEDEM Untergrund — er wirkt auf
     Gold als Kontur und geht auf der dunklen Fläche im Hintergrund auf. */
  .project-bar__dot {
    display: inline-block;
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    margin-right: 0.3rem;
    flex: none;
    box-shadow: 0 0 0 1.5px var(--stb-bg);
  }

  /* Swatch-Auswahl (BL-209, ADR-v9-158): Aktiv-Zustand über ✓-Glyph + aria-pressed,
     NICHT nur über eine farbige Umrandung — auch ohne Farbwahrnehmung bedienbar. */
  .project-bar__swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.2rem;
  }

  /* 44px Durchmesser (--stb-touch-target, ADR-v9-155) — auch für einen Farbpunkt gilt
     die Mindest-Trefferfläche, nicht nur für textbeschriftete Buttons. */
  .project-bar__swatch {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--stb-touch-target);
    height: var(--stb-touch-target);
    border-radius: 50%;
    border: 2px solid var(--stb-surface-3);
    cursor: pointer;
    padding: 0;
  }

  .project-bar__swatch--none {
    background: var(--stb-surface-2);
  }

  .project-bar__swatch--active {
    border-color: var(--stb-text);
  }

  .project-bar__swatch-check {
    color: var(--stb-bg);
    font-weight: 700;
    font-size: 0.85rem;
    text-shadow: 0 0 2px var(--stb-text);
  }

  .project-bar__swatch--none .project-bar__swatch-check {
    color: var(--stb-text);
    text-shadow: none;
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

  .project-bar__field input,
  .project-bar__field textarea {
    background: var(--stb-surface-2);
    color: var(--stb-text);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-control);
    padding: 0.35rem 0.5rem;
    font-size: 0.9rem;
    font-family: inherit;
    resize: vertical;
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
