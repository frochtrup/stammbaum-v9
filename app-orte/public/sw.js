// Stammbaum v9 — Service Worker des ORTE-EDITORS (OE-10, Spec 22 §2, Spec 30 NFR-2).
//
// Inhaltlich derselbe Worker wie der des Hauptprogramms (app/public/sw.js) mit EINEM
// Unterschied: dem Cache-Praefix. Beide Programme liegen auf demselben Origin — mit
// geteiltem Praefix loeschte die Aufraeum-Logik jeder Aktivierung die Caches des jeweils
// anderen, weil sie „alles mit meinem Praefix ausser meiner Version" verwirft. Getrennte
// Namensraeume sind hier die einfachere Loesung als eine gemeinsame Verwaltung.
//
// Klassisches Skript ohne Imports: der SW läuft außerhalb des Vite-Modulgraphen und
// wird unverändert aus `app/public/` ausgeliefert. Die einzige Build-Berührung ist der
// injizierte PRECACHE-Block unten (`app/sw-plugin.ts` + `app/sw-manifest.ts`).
//
// Strategie (aus dem v8-Orakel übernommen, dort bewährt):
//   • Precache-Assets  → Cache-first  (kein Netzwarten beim Start)
//   • Navigationen     → Network-first mit Cache-/Offline-Fallback
//   • alles Übrige     → Network-first mit 4 s Timeout, dann Cache
//
// Bewusste ABWEICHUNG vom Orakel: kein `skipWaiting()` beim Install. v8 übernahm
// sofort — damit kann eine offene Seite alte und neue Chunks mischen (unter Vite mit
// gehashten Dateinamen schlimmer als in v8s unversionierter Welt: der alte
// index-ALT.js ist nach dem Update schlicht weg). Spec 30 NFR-2 verlangt ohnehin
// einen Nutzerhinweis statt eines stillen Bruchs. Der neue SW bleibt deshalb in
// `waiting`, bis die Seite `SKIP_WAITING` schickt (Klick auf „Neu laden").

// >>> BUILD-INJECT:PRECACHE
const PRECACHE = { version: 'dev', critical: [], optional: [] };
// <<< BUILD-INJECT:PRECACHE

const CACHE_NAME = `stammbaum-orte-${PRECACHE.version}`;
const NETWORK_TIMEOUT_MS = 4000;

// Absolute Pfade für den Cache-first-Lookup (die Manifest-Einträge sind bereits
// absolut, s. buildPrecacheManifest — hier nur noch als Set für O(1)-Prüfung).
const PRECACHE_PATHS = new Set([...PRECACHE.critical, ...PRECACHE.optional]);

// Die Offline-Seite ist der letzte Rettungsanker für Navigationen; sie steckt im
// kritischen Precache, wird hier aber noch einmal separat gesucht, weil ihr Pfad
// (anders als index.html) nicht aus dem Request ableitbar ist.
const OFFLINE_URL = PRECACHE.critical.find((url) => url.endsWith('/offline.html'));
const INDEX_URL = PRECACHE.critical.find((url) => url.endsWith('/index.html'));

// --- Install: kritisch atomar, optional fehlertolerant -----------------------
self.addEventListener('install', (event) => {
  // Schutz gegen den UNINJIZIERTEN Zustand: ohne den Build-Schritt steht hier noch der
  // Dev-Platzhalter (leerer Precache). Ein solcher Worker installiert sich klaglos,
  // legt einen leeren Cache an und kann offline NICHTS — er sieht gesund aus und ist
  // hohl. Beobachtet bei der eigenen Verifikation (2026-07-18): während eines Rebuilds
  // lieferte `vite preview` für einen Moment die rohe public/sw.js aus, und genau so
  // ein Cache (`stammbaum-v9-dev`) entstand im Browser.
  //
  // Die Installation wird deshalb über ein rejectetes `waitUntil` zum Scheitern
  // gebracht, statt einen leeren Cache anzulegen. VERIFIZIERT ist die Wirkung, auf die
  // es ankommt: mit dieser Sperre entsteht KEIN Cache (vorher entstand ein leerer
  // `stammbaum-v9-dev`). Ob der Browser den Worker zusätzlich als `redundant`
  // verwirft, war im Preview-Browser nicht eindeutig ablesbar — die Zusicherung hier
  // ist deshalb bewusst nur „legt keinen hohlen Cache an", nicht mehr.
  if (PRECACHE.critical.length === 0) {
    event.waitUntil(
      Promise.reject(
        new Error(
          'Service Worker ohne Precache-Manifest (Build-Injektion fehlt) — Installation abgebrochen.'
        )
      )
    );
    return;
  }

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // `addAll` ist per Definition atomar: schlägt EIN Request fehl, wird der
      // gesamte Aufruf rejected und die Installation bricht ab — genau die von
      // NFR-2 geforderte Zusicherung „atomarer Precache".
      cache.addAll(PRECACHE.critical).then(() =>
        Promise.allSettled(PRECACHE.optional.map((url) => cache.add(url).catch(() => undefined)))
      )
    )
  );
  // KEIN self.skipWaiting() — s. Kopfkommentar.
});

// --- Activate: fremde Cache-Versionen abräumen -------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            // Nur eigene Caches anfassen: `caches` ist origin-weit geteilt, und auf
            // GitHub Pages (frochtrup.github.io) liegen ggf. weitere Projekte unter
            // demselben Origin. Ein pauschales „alles außer CACHE_NAME löschen"
            // würde deren Caches mit abräumen.
            .filter((key) => key.startsWith('stammbaum-orte-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// --- Message: Update auf Nutzerwunsch übernehmen -----------------------------
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// --- Fetch -------------------------------------------------------------------
function networkWithTimeout(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS);
    fetch(request).then(
      (response) => {
        clearTimeout(timer);
        resolve(response);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (!request.url.startsWith(self.location.origin)) return;

  const pathname = new URL(request.url).pathname;

  // 1. Precache-Asset → Cache-first
  if (PRECACHE_PATHS.has(pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          // Optionales Asset, das beim Install nicht durchkam: aus dem Netz
          // nachziehen und dann mitcachen.
          return fetch(request).then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // 2. Navigation → Network-first, dann gecachte Shell, dann Offline-Seite.
  //    Die App ist eine SPA: jede Navigation landet fachlich auf index.html.
  if (request.mode === 'navigate') {
    event.respondWith(
      networkWithTimeout(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || (INDEX_URL && caches.match(INDEX_URL)))
            .then((cached) => cached || (OFFLINE_URL && caches.match(OFFLINE_URL)))
            .then((cached) => cached || Response.error())
        )
    );
    return;
  }

  // 3. Alles Übrige → Network-first mit Timeout, Cache als Fallback
  event.respondWith(
    networkWithTimeout(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error()))
  );
});
