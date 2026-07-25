// ui/shell/projects-state.svelte.ts — reaktiver Halter der Forschungsprojekte + der
// aktiven Projekt-Auswahl (Spec 12 §5, Spec 20 §1.11f, BL-58).
//
// App-privat: die Projekte reisen NICHT mit der Genealogie-Datei (LP-1), sie liegen
// geräteweit in IndexedDB hinter dem ProjectsStore-Vertrag (services/research). Der
// Halter wird in App.svelte EINMAL erzeugt und durchgereicht — die aktive Auswahl muss
// das Wegnavigieren aus der Forschungsfläche überleben (dieselbe Merker-Logik wie
// route.researchTarget, ADR-v9-102), deshalb lebt sie hier oberhalb von ResearchTab und
// nicht in der bei jeder Navigation neu montierten Komponente.
//
// Bauform wie createRoute()/createViewState(): KEIN Modul-Singleton, damit Tests eine
// frische, isolierte Instanz bekommen. Persistenz ist „fire and forget" — ein
// Speicherfehler darf die UI nicht blockieren (der Nutzer verliert dann Projekte, nicht
// die Funktion; loadProjects fällt seinerseits auf die leere Liste zurück).
import type { Project, ProjectScope } from '../../core/research/index';
import { loadProjects, type ProjectsStore } from '../../services/research/index';

export interface ProjectsState {
  readonly projects: Project[];
  readonly activeProjectId: string | null;
  readonly activeProject: Project | null;
  /** Scope des aktiven Projekts oder null (= keine Einschränkung, „Alle Personen"). */
  readonly activeScope: ProjectScope | null;
  load(): Promise<void>;
  setActive(id: string | null): void;
  add(project: Project): void;
  update(project: Project): void;
  remove(id: string): void;
}

export function createProjectsState(store: ProjectsStore): ProjectsState {
  let projects = $state<Project[]>([]);
  let activeProjectId = $state<string | null>(null);

  function persist() {
    // $state.snapshot: die Liste ist ein tief-reaktiver Svelte-Proxy; IndexedDBs
    // structured-clone kann einen Proxy NICHT klonen (DataCloneError) — ohne den
    // Snapshot scheitert jeder Save still am `.catch` und nichts wird persistiert
    // (Browser-Verifikation 2026-07-25). Der Snapshot ist ein reiner, klonbarer Wert.
    void store.save($state.snapshot(projects)).catch(() => {});
  }

  const activeProject = $derived(projects.find((p) => p.id === activeProjectId) ?? null);

  return {
    get projects() {
      return projects;
    },
    get activeProjectId() {
      return activeProjectId;
    },
    get activeProject() {
      return activeProject;
    },
    get activeScope() {
      return activeProject ? activeProject.scope : null;
    },
    async load() {
      // loadProjects fällt bei jedem Speicherfehler (fehlendes/defektes IndexedDB) auf
      // die leere Liste zurück — ein defekter Store darf die App nicht blockieren.
      projects = await loadProjects(store);
      // Eine evtl. gemerkte Auswahl, deren Projekt es nicht mehr gibt, fällt auf „Alle".
      if (activeProjectId && !projects.some((p) => p.id === activeProjectId)) activeProjectId = null;
    },
    setActive(id) {
      activeProjectId = id;
    },
    add(project) {
      projects = [...projects, project];
      persist();
    },
    update(project) {
      projects = projects.map((p) => (p.id === project.id ? project : p));
      persist();
    },
    remove(id) {
      projects = projects.filter((p) => p.id !== id);
      if (activeProjectId === id) activeProjectId = null;
      persist();
    },
  };
}
