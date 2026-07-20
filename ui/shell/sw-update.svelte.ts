// Reaktiver Zustand für den Update-Hinweis (BL-02, Spec 30 NFR-2).
//
// Eigenes Mini-Modul statt eines Feldes in `app-state.svelte.ts`: der AppState trägt
// Genealogie-Zustand (Datenbank, Auswahl, Undo) — ob eine neue App-VERSION bereitsteht,
// ist Schalen-/Auslieferungszustand und hat dort nichts verloren. Zudem meldet die
// Plattform (`app/sw-register.ts`) das Ereignis von außerhalb des Komponentenbaums;
// ein Modul-Singleton ist dafür die kleinste Verdrahtung.
class SwUpdateState {
  #ready = $state(false);

  /** True, sobald eine neue Version installiert ist und auf Aktivierung wartet. */
  get ready(): boolean {
    return this.#ready;
  }

  markReady(): void {
    this.#ready = true;
  }

  /** Nur für Tests — der echte Weg aus `ready` heraus ist der Reload. */
  reset(): void {
    this.#ready = false;
  }
}

export const swUpdate = new SwUpdateState();
