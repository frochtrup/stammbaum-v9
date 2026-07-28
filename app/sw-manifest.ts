// Precache-Manifest für den Service Worker (BL-02, Spec 30 NFR-2).
//
// Reine Funktionen, bewusst ohne Vite-/Node-Abhängigkeit: der Build-Teil
// (`app/sw-plugin.ts`) liest Dateien und hasht sie, DIESES Modul entscheidet nur,
// was in den Precache gehört und wie die Cache-Version daraus entsteht. Damit ist
// die Logik build-frei testbar (TST-1) — dieselbe Zweiteilung wie `csp-policy.ts`
// (Wahrheit) ⇄ `csp-plugin.ts` (Injektion), ADR-v9-39.
//
// WARUM überhaupt generiert und nicht wie in v8 von Hand gepflegt: v8s `sw.js` trug
// eine handgeschriebene Liste von ~70 Dateinamen und eine handgezählte
// `CACHE_NAME = 'stammbaum-v1057'`. Spec 30 NFR-2 führt die daraus entstandene Falle
// ausdrücklich als „v9-Falle (aus v8)": wer ein Modul hinzufügt oder ein Asset
// umbenennt und das Bumpen vergisst, liefert eine veraltete Shell aus, die neue
// Module falsch lädt. Unter Vite wäre dieselbe Liste sogar unmöglich von Hand zu
// pflegen (gehashte Dateinamen ändern sich bei jedem inhaltlichen Build). Die
// Generierung macht aus der Erinnerungspflicht einen Automatismus — dasselbe
// „Zwang statt Erinnerung"-Muster wie `resetKey` (ADR-v9-83) oder die
// max-lines-Ratsche (BL-54).

export interface PrecacheInput {
  /** Pfad relativ zum Build-Wurzelverzeichnis, z. B. `assets/index-CSrp18N3.js`. */
  path: string;
  /** Inhalts-Digest der Datei (Hex). Trägt die Cache-Version — s. `computeCacheVersion`. */
  digest: string;
}

export interface PrecacheManifest {
  /** Cache-Name-Suffix; ändert sich genau dann, wenn sich ein Precache-Inhalt ändert. */
  version: string;
  /** Atomar: schlägt eine dieser Dateien fehl, schlägt die Installation fehl. */
  critical: string[];
  /** Einzeln und fehlertolerant gecacht — die App bleibt ohne sie benutzbar. */
  optional: string[];
}

/**
 * Die Schale muss vollständig sein oder sie ist kaputt: HTML, JS, CSS, das Manifest
 * und das Icon werden atomar vorgehalten. Alles andere (Beispieldaten, Schriften,
 * Bilder) degradiert sauber — ein fehlendes `demo.ged` kostet den Demo-Ladeweg, nicht
 * die App. Entspricht v8s Zweiteilung PRECACHE_CRITICAL/PRECACHE_OPTIONAL.
 */
const CRITICAL_EXTENSIONS = ['.html', '.js', '.css', '.webmanifest', '.svg'];

/**
 * Der Service Worker selbst gehört NIE in seinen eigenen Precache: ein gecachter SW
 * würde sich beim Update selbst aus dem Cache bedienen und könnte sich damit nie
 * ersetzen. Browser laden `sw.js` ohnehin an jedem Cache vorbei neu.
 */
const NEVER_PRECACHED = ['sw.js', 'HANDBUCH.html'];

/**
 * Das Benutzerhandbuch (`HANDBUCH.html` + `handbuch-assets/`) wird als Online-Hilfedoc
 * mit-deployt (app/public → dist), gehört aber NICHT in den Precache: es ist keine
 * App-kritische Ressource, und — wichtiger — es ändert sich bei jedem `npm run handbuch`.
 * Läge es im (kritischen) Precache, bumpte jede Doku-Änderung die App-Cache-Version und
 * zwänge alle Nutzer zum Voll-Neuladen. Der Hilfelink lädt es stattdessen aus dem Netz.
 */
const NEVER_PRECACHED_PREFIXES = ['handbuch-assets/'];

function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.');
  const slash = path.lastIndexOf('/');
  return dot > slash ? path.slice(dot).toLowerCase() : '';
}

/**
 * FNV-1a (32 bit) über die sortierten `pfad:digest`-Paare.
 *
 * Bewusst kein `node:crypto`: dieses Modul bleibt dependency-frei und damit
 * build-frei testbar. Kryptographische Stärke ist hier ohne Belang — die Version
 * muss sich bei geändertem Inhalt ändern, nicht fälschungssicher sein. Die
 * Kollisionsresistenz der Eingabe steckt bereits in den übergebenen SHA-256-Digests.
 */
export function computeCacheVersion(entries: PrecacheInput[]): string {
  const canonical = entries
    .map((e) => `${e.path}:${e.digest}`)
    .sort()
    .join('\n');
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Baut das Precache-Manifest aus den tatsächlich gebauten Dateien.
 *
 * `base` ist das Vite-`base` des Builds (`/stammbaum-v9/` auf GitHub Pages, `/` lokal)
 * — die Pfade landen absolut im Manifest, weil der SW sie sonst gegen seinen eigenen
 * Scope auflösen müsste und ein Scope-Fehler still zu 404s im Precache führt.
 */
export function buildPrecacheManifest(files: PrecacheInput[], base: string): PrecacheManifest {
  const relevant = files.filter(
    (f) => !NEVER_PRECACHED.includes(f.path) && !NEVER_PRECACHED_PREFIXES.some((p) => f.path.startsWith(p)),
  );
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const toUrl = (path: string) => `${prefix}${path}`;

  const critical: string[] = [];
  const optional: string[] = [];
  for (const file of relevant) {
    const target = CRITICAL_EXTENSIONS.includes(extensionOf(file.path)) ? critical : optional;
    target.push(toUrl(file.path));
  }

  return {
    // Version über ALLE Precache-Dateien, nicht nur die kritischen: ändert sich das
    // mitgelieferte demo.ged, soll der Cache ebenfalls erneuert werden.
    version: computeCacheVersion(relevant),
    critical: critical.sort(),
    optional: optional.sort()
  };
}

/** Markierter Block in `app/public/sw.js`, den der Build ersetzt. */
export const INJECT_START = '// >>> BUILD-INJECT:PRECACHE';
export const INJECT_END = '// <<< BUILD-INJECT:PRECACHE';

/**
 * Ersetzt den markierten Block im SW-Quelltext durch das echte Manifest.
 *
 * Wirft, wenn die Marker fehlen — ein stiller Fehlschlag würde einen SW mit LEEREM
 * Precache ausliefern, der offline nichts kann und dabei grün aussieht (genau die
 * Fehlerklasse „Gate läuft durch, misst aber nichts", ADR-v9-91).
 */
export function injectManifest(source: string, manifest: PrecacheManifest): string {
  const start = source.indexOf(INJECT_START);
  const end = source.indexOf(INJECT_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `sw-plugin: Injektions-Marker nicht gefunden (${INJECT_START} … ${INJECT_END}). ` +
        'Ohne sie würde ein Service Worker mit leerem Precache ausgeliefert.'
    );
  }
  const injected =
    `${INJECT_START}\n` +
    `const PRECACHE = ${JSON.stringify(manifest, null, 2)};\n` +
    `${INJECT_END}`;
  return source.slice(0, start) + injected + source.slice(end + INJECT_END.length);
}
