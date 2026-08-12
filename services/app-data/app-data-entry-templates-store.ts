// services/app-data/app-data-entry-templates-store.ts — die Erfassungs-Vorlagen wohnen im
// B1-Bündel (Spec 30 §2.2/§2.3, Spec 20 §2, ADR-v9-264 E7, BL-232).
//
// Bauform wie `AppDataProjectsStore`/`AppDataTourStore` daneben: lesen über den
// Sync-Dienst, schreiben über `reconcileAndSave` — kein eigener Speicher, keine zweite
// Wahrheit. Wie beim Rundgang-Merker gibt es KEINEN Altspeicher zum Übernehmen: v8s
// `quick_templates`-IDB-Cache gehört zu einem anderen Programm und zu einem anderen
// Vorlagen-Format (zwei Schema-Welten, ADR-v9-264 Kontext) — er wird nicht migriert,
// sondern durch die drei mitgelieferten Standard-Vorlagen ersetzt
// (`BUILTIN_ENTRY_TEMPLATES`, Kern).
//
// WAS HIER GESPEICHERT WIRD, sind die Vorlagen des NUTZERS. Die mitgelieferten liegen als
// Konstante im Kern und werden nicht mitgeschrieben — sonst gäbe es sie doppelt, und eine
// spätere Korrektur an ihnen käme bei niemandem mehr an (kopierbar statt überschreibbar,
// ADR-v9-264 E8).
//
// GELESEN WIRD DEFENSIV (`normalizeEntryTemplate`): was aus dem Bündel kommt, kann von
// Hand bearbeitet oder von einer anderen Programmversion geschrieben worden sein —
// dieselbe Lage und dieselbe Haltung wie bei den Projekten (BL-239): der Nutzer verliert
// eine unbrauchbare Zeile, nicht seine Vorlagenliste.
import { normalizeEntryTemplate, type EntryTemplate } from '../../core/model/entry-templates';
import type { AppDataSyncService } from './app-data-sync-service';

/** Speicher-Vertrag der Erfassungs-Vorlagen — in Tests durch eine Attrappe ersetzbar. */
export interface EntryTemplatesStore {
  load(): Promise<EntryTemplate[]>;
  save(templates: EntryTemplate[]): Promise<void>;
}

export class AppDataEntryTemplatesStore implements EntryTemplatesStore {
  constructor(private readonly sync: AppDataSyncService) {}

  async load(): Promise<EntryTemplate[]> {
    const state = await this.sync.load();
    return (state.sections.entryTemplates ?? []).map(normalizeEntryTemplate);
  }

  async save(templates: EntryTemplate[]): Promise<void> {
    const state = await this.sync.load();
    await this.sync.reconcileAndSave(
      { ...state.sections, entryTemplates: templates },
      { rev: state.rev, sections: state.sections },
    );
  }
}
