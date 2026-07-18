// Geteilter Online-/Offline-Zustand der Schale (BL-03, Spec 20 §1.2).
//
// EIN Mechanismus für die Erkennung (INV-UI-4): vor diesem Modul las `MapLensView`
// `navigator.onLine` direkt und selbst. Die ANZEIGEN bleiben getrennt und sollen es
// auch — der Karten-Banner sagt etwas anderes („vereinfachte Weltkarte ohne
// Straßendetail") als der Schalen-Indikator („die App läuft aus dem Cache") —, aber
// die Frage „sind wir offline?" wird nur noch an einer Stelle beantwortet.
//
// Bewusst NICHT zusammengelegt mit der Umschalt-Entscheidung der Karte: die bleibt
// „einmal auf den Fallback, dann dabei bleiben" (ADR-v9-25, kein Flackern zwischen
// zwei Rendering-Pfaden), während dieser Zustand hier live mitläuft. Die Karte liest
// ihn nur als Startwert.

/** Injizierbar für Tests — im Browser sind das window/navigator/caches. */
export interface OnlineStatusEnv {
  isOnline: () => boolean;
  addListener: (type: 'online' | 'offline', cb: () => void) => void;
  removeListener: (type: 'online' | 'offline', cb: () => void) => void;
  /** Gibt es überhaupt einen App-Cache? Siehe `appCached` unten. */
  hasAppCache: () => Promise<boolean>;
}

const browserEnv: OnlineStatusEnv = {
  isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
  addListener: (type, cb) => window.addEventListener(type, cb),
  removeListener: (type, cb) => window.removeEventListener(type, cb),
  hasAppCache: async () => {
    if (typeof caches === 'undefined') return true;
    const keys = await caches.keys();
    return keys.some((k) => k.startsWith('stammbaum-v9-'));
  }
};

class OnlineStatus {
  #online = $state(true);
  #appCached = $state(true);
  // MUSS `$state` sein, nicht ein einfaches Feld: der Getter unten liest `#started`
  // als ERSTES, und `OfflineIndicator` rendert VOR dem `onMount` von `App.svelte`
  // (Kind vor Wurzel). Als plain field nahm das `$derived` der Komponente beim ersten
  // Auswerten den `#env.isOnline()`-Zweig und erfasste damit GAR KEINE reaktive
  // Abhängigkeit — es war danach für immer eingefroren. Genau so passiert
  // (2026-07-18): `start()` lief, das offline-Ereignis kam an, der Indikator blieb
  // unsichtbar. Alle Unit- und Komponententests waren grün, weil sie `start()` VOR
  // dem Rendern aufrufen; nur die Verifikation im echten Browser deckte es auf.
  #started = $state(false);

  /**
   * False, sobald der Browser keine Verbindung meldet.
   *
   * VOR `start()` wird die Plattform direkt gefragt, statt den Default `true`
   * zurückzugeben. Grund ist keine Test-Bequemlichkeit, sondern die Mount-Reihenfolge:
   * in Svelte läuft das `onMount` eines KINDES vor dem der Wurzel — `MapLensView` liest
   * seinen Startwert also, bevor `App.svelte` diesen Zustand verdrahtet hat. Mit einem
   * blinden `true` würde ein Kaltstart ohne Netz fälschlich „online" sehen. Der Wert
   * ist in dieser Phase nicht reaktiv (nur ein Direktabruf) — genau richtig für einen
   * einmaligen, ohnehin `untrack`-ten Startwert.
   */
  get online(): boolean {
    return this.#started ? this.#online : this.#env.isOnline();
  }

  /**
   * False, wenn offline UND kein App-Cache existiert — dann überlebt die App den
   * nächsten Reload nicht.
   *
   * Aus dem v8-Orakel übernommen (`_checkCacheStatus`, ui-views.js): dort ein Toast
   * „Cache fehlt — bitte einmal online öffnen für Offline-Funktion". Der Fall ist
   * schmal (online geladen, offline gegangen, bevor der Service Worker fertig
   * installiert war), aber genau dann ist der Hinweis das Einzige, was den
   * Datenverlust-Schreck beim nächsten Start verhindert. Der knappe Spec-Bullet
   * („Offline-Indikator") nennt ihn nicht — das Orakel schon (TST-6).
   */
  get appCached(): boolean {
    return this.#appCached;
  }

  /** Umgebung für den Direktabruf vor `start()` — von `start()` überschrieben. */
  #env: OnlineStatusEnv = browserEnv;

  /** Verdrahtet die Listener; gibt die Abmeldefunktion zurück. */
  start(env: OnlineStatusEnv = browserEnv): () => void {
    this.#env = env;
    this.#started = true;
    this.#online = env.isOnline();
    void this.#refreshCacheState(env);

    const onOnline = () => {
      this.#online = true;
      this.#appCached = true;
    };
    const onOffline = () => {
      this.#online = false;
      void this.#refreshCacheState(env);
    };

    env.addListener('online', onOnline);
    env.addListener('offline', onOffline);
    return () => {
      env.removeListener('online', onOnline);
      env.removeListener('offline', onOffline);
    };
  }

  async #refreshCacheState(env: OnlineStatusEnv): Promise<void> {
    // Nur im Offline-Fall interessant: online ist ein fehlender Cache belanglos
    // (die nächste Navigation holt alles aus dem Netz).
    if (this.#online) {
      this.#appCached = true;
      return;
    }
    try {
      this.#appCached = await env.hasAppCache();
    } catch {
      // Cache-API nicht verfügbar/blockiert: keine Behauptung aufstellen, die wir
      // nicht belegen können — lieber keinen Warnhinweis als einen falschen.
      this.#appCached = true;
    }
  }

  /** Nur für Tests. */
  reset(): void {
    this.#online = true;
    this.#appCached = true;
    this.#started = false;
    this.#env = browserEnv;
  }
}

export const onlineStatus = new OnlineStatus();
