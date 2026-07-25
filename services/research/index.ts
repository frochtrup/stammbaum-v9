// services/research/index.ts — öffentliche API der Forschungs-Persistenz (Spec 12 §5,
// Spec 30 §2.2). Plattform-API (IndexedDB) hinter dem ProjectsStore-Vertrag.
export { IdbProjectsStore, loadProjects, type ProjectsStore } from './idb-projects-store';
