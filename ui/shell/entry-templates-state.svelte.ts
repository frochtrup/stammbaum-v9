// ui/shell/entry-templates-state.svelte.ts — reaktiver Halter der NUTZER-Erfassungs-
// Vorlagen (Spec 20 §2, ADR-v9-264 E7, BL-353). Bauform wie `projects-state.svelte.ts`
// (analog `tourStore`/`projectsState` in App.svelte, Spec 30 §2.2): der Halter wird EINMAL
// erzeugt und durchgereicht, damit die Vorlagenliste einen Ausflug in ein anderes
// Nav-Ziel überlebt (Spec 21 §5) — sie muss nicht bei jedem Öffnen der Erfassungs-Fläche
// neu aus dem B1-Bündel gelesen werden.
//
// Die MITGELIEFERTEN Vorlagen (`BUILTIN_ENTRY_TEMPLATES`) leben NICHT hier — sie sind eine
// Konstante im Kern (core/model/entry-templates.ts) und werden nie gespeichert (ADR-v9-264
// E8). Dieser Halter trägt ausschließlich die Vorlagen, die der Nutzer im Builder angelegt
// oder aus einer mitgelieferten kopiert hat.
import type { EntryTemplate } from '../../core/model/entry-templates';
import type { EntryTemplatesStore } from '../../services/app-data';

export interface EntryTemplatesState {
  readonly templates: EntryTemplate[];
  load(): Promise<void>;
  add(tpl: EntryTemplate): void;
  update(tpl: EntryTemplate): void;
  remove(id: string): void;
}

export function createEntryTemplatesState(store: EntryTemplatesStore): EntryTemplatesState {
  let templates = $state<EntryTemplate[]>([]);

  function persist() {
    // $state.snapshot: die Liste ist ein tief-reaktiver Svelte-Proxy; structured-clone
    // (IndexedDB via reconcileAndSave) kann einen Proxy nicht klonen (DataCloneError) —
    // dieselbe Falle und derselbe Ausweg wie bei `projects-state.svelte.ts`.
    void store.save($state.snapshot(templates)).catch(() => {
      /* Persistenzfehler blockiert die UI nicht — der Nutzer verliert seine letzte
       * Änderung nicht (sie steht im Halter), nur ihre Sicherung schlägt fehl. */
    });
  }

  return {
    get templates() {
      return templates;
    },
    async load() {
      // Ein defekter/fehlender Speicher darf die Fläche nicht blockieren — dieselbe
      // Haltung wie bei den Projekten und den Vorlagen selbst (`normalizeEntryTemplate`).
      try {
        templates = await store.load();
      } catch {
        templates = [];
      }
    },
    add(tpl) {
      templates = [...templates, tpl];
      persist();
    },
    update(tpl) {
      templates = templates.map((t) => (t.id === tpl.id ? tpl : t));
      persist();
    },
    remove(id) {
      templates = templates.filter((t) => t.id !== id);
      persist();
    },
  };
}
