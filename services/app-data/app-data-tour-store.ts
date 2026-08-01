// services/app-data/app-data-tour-store.ts — „Erstnutzer-Rundgang gesehen" im B1-Bündel
// (Spec 30 §2.2, BL-213, ADR-v9-190).
//
// Bauform wie `AppDataValConfigStore`/`AppDataProjectsStore` daneben: lesen über den
// Sync-Dienst, schreiben über `reconcileAndSave` — kein eigener Speicher, keine zweite
// Wahrheit. Anders als jene beiden gibt es hier KEINEN Altspeicher zum Übernehmen: v8s
// `localStorage`-Schlüssel gehört zu einem anderen Programm, und ein v9-Nutzer, der den
// Rundgang noch nie gesehen hat, SOLL ihn sehen.
import type { AppDataSyncService } from './app-data-sync-service';

export interface TourStore {
  /** Hat der Nutzer den Rundgang schon gesehen (oder abgebrochen)? */
  isDone(): Promise<boolean>;
  markDone(): Promise<void>;
}

export class AppDataTourStore implements TourStore {
  constructor(private readonly sync: AppDataSyncService) {}

  async isDone(): Promise<boolean> {
    const state = await this.sync.load();
    return state.sections.tour?.done === true;
  }

  async markDone(): Promise<void> {
    const state = await this.sync.load();
    await this.sync.reconcileAndSave(
      { ...state.sections, tour: { done: true } },
      { rev: state.rev, sections: state.sections },
    );
  }
}
