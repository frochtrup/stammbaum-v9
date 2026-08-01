// services/app-data/app-data-projects-store.ts — die Forschungsprojekte wohnen im
// B1-Bündel (Spec 30 §2.2/§2.3, Spec 12 §5, ADR-v9-176, BL-239).
//
// Gleiche Bauart wie `AppDataValConfigStore`: ein ADAPTER auf einen bestehenden Vertrag
// (`ProjectsStore`), kein zweiter Speicher. Die UI (`projects-state.svelte.ts`) kennt
// weiterhin nur den Vertrag und merkt vom Umzug nichts; es gibt weiterhin genau EINE
// Wahrheit statt zweier Stores mit demselben Inhalt.
//
// Der alte, gerätelokale IDB-Store bleibt als EINMALIGE Quelle für die Übernahme
// bestehen: findet sich im Bündel kein Projekt-Abschnitt, aber im Altspeicher Projekte,
// werden sie übernommen. Still — es ist eine Verschiebung von gerätelokal nach
// gerätelokal (nur eben mit Mitnahme-Weg), kein Schreibvorgang in die geteilte
// Genealogie-Datei.
//
// WARUM DAS ÜBERHAUPT ZULÄSSIG IST: Projekte sind baumgebunden (`scope.personRefs` trägt
// datei-lokale GEDCOM-Ids). Bis BL-238 wäre das hier still falsch geworden — der Merge
// kennt keinen Datei-Kontext. Seit BL-238 tragen die Bezüge einen Fingerabdruck und
// werden am Referenten geprüft: ein mitgereister Scope aus einem fremden Bestand ist
// wirkungslos, nicht falsch. Deshalb ist BL-238 die Vorbedingung von BL-239 und nicht
// bloß dessen Nachbarschaft.
import { normalizeProject, type Project } from '../../core/research/index';
import type { ProjectsStore } from '../research/index';
import type { AppDataSyncService } from './app-data-sync-service';

export class AppDataProjectsStore implements ProjectsStore {
  constructor(
    private readonly sync: AppDataSyncService,
    /** Altspeicher — nur zum einmaligen Übernehmen; wird nie beschrieben. */
    private readonly legacy?: ProjectsStore,
  ) {}

  async load(): Promise<Project[]> {
    const state = await this.sync.load();
    if (state.sections.projects) return state.sections.projects.map(normalizeProject);

    const alt = await this.legacy?.load();
    if (!alt || alt.length === 0) return [];
    const uebernommen = alt.map(normalizeProject);
    // Übernahme: ab jetzt ist das Bündel die Wahrheit.
    await this.sync.reconcileAndSave(
      { ...state.sections, projects: uebernommen },
      { rev: state.rev, sections: state.sections },
    );
    return uebernommen;
  }

  async save(projects: Project[]): Promise<void> {
    const state = await this.sync.load();
    await this.sync.reconcileAndSave(
      { ...state.sections, projects },
      { rev: state.rev, sections: state.sections },
    );
  }
}
