// ui/shell/app-startup.ts — was die Schale GENAU EINMAL beim Start tut.
//
// Herausgelöst aus `App.svelte`, das mit der Baum-Überlagerung (BL-367/368) über die
// 600-Zeilen-Grenze lief. Herausgelöst wurde eine kohäsive Einheit — „der Startlauf" —
// statt an der Restdatei zu trimmen; dasselbe Vorgehen wie bei `view-holders.svelte.ts`
// („was die Wurzel für ihre Flächen hält").
//
// Was dazugehört: die Arbeitskopie laden, die drei app-privaten Bestände nachladen
// (Projekte · Erfassungs-Vorlagen · Rundgangs-Merker), den Medien-Ordner
// wiederherstellen und die beiden Plattform-Listener der Schale starten.
// Was NICHT dazugehört: alles, was auf eine NUTZERAKTION reagiert — das bleibt in der
// Schale bei seinem Auslöser.
//
// Die Fehlerhaltung ist bewusst durchgehend dieselbe und der Grund, warum die fünf
// Schritte zusammengehören: keiner darf den Start blockieren. Keine Arbeitskopie, kein
// gespeichertes Projekt, kein erneut erteiltes Leserecht am Medien-Ordner — nichts davon
// ist ein Fehler, die App läuft vollständig weiter, nur ohne die jeweilige Bequemlichkeit.
import { loadDocText } from './load-doc-text';
import { onlineStatus } from './online-status.svelte';
import { layout, type LayoutEnv } from './layout.svelte';
import type { AppState } from './app-state.svelte';
import type { FileService } from '../../services/file';
import type { MediaResolver } from '../../services/media';
import type { PlacesPersister } from './places-persister';

export interface AppStartupDeps {
  appState: AppState;
  fileService: FileService;
  persister: PlacesPersister;
  mediaResolver: MediaResolver;
  /** Formfaktor-Quelle (BL-91); `undefined` = echtes `window.matchMedia`. */
  layoutEnv?: LayoutEnv;
  /** Die drei app-privaten Bestände — jeder lädt für sich und blockiert nichts. */
  loadProjects: () => Promise<unknown>;
  loadEntryTemplates: () => Promise<unknown>;
  loadTour: () => Promise<unknown>;
  /** Hinweis-Kanal der Schale (BL-335). */
  notify: (text: string) => void;
  /** Das FS-Handle der geladenen Arbeitskopie zurückmelden (Tier-1-Export, Spec 14 §4). */
  setFileHandle: (handle: unknown) => void;
}

/**
 * Führt den Startlauf aus und gibt die Aufräumfunktion für die Plattform-Listener zurück
 * — bestimmt für `onMount`. Die Zustände leben zwar so lange wie die App, aber ein
 * Listener-Leck in Komponententests (mehrfaches Mounten) wäre real.
 */
export function startApp(deps: AppStartupDeps): () => void {
  const { appState, fileService, persister, mediaResolver, layoutEnv } = deps;

  // Auto-Load der Arbeitskopie (Spec 20 §1.2 [K], Spec 14 §3.1/§8 Schritt 4). Gibt es
  // keine, bleibt der Startzustand wie bisher (leere DB, Import-Buttons sichtbar). Nutzt
  // DIESELBE Lade-Pipeline wie ImportButton/Demo (`loadDocText`) — EIN Lade-Pfad
  // (INV-UI-4), nur die Text-Quelle ist hier die Arbeitskopie statt Picker/fetch.
  void (async () => {
    const copy = await fileService.loadWorkingCopy();
    if (!copy) return;
    deps.setFileHandle(copy.handle);
    const result = await loadDocText(copy.format ?? 'gedcom', copy.text, copy.name, appState, persister);
    deps.notify(result.placesNotice);
  })();

  // Forschungsprojekte (BL-58), Erfassungs-Vorlagen (BL-353), Rundgangs-Merker (BL-213):
  // ein Speicherfehler blockiert jeweils nicht — leere Liste bzw. die drei mitgelieferten
  // Vorlagen bleiben sichtbar, ein ungelesener Merker gilt als „schon gesehen".
  void deps.loadProjects();
  void deps.loadEntryTemplates();
  void deps.loadTour();

  // Medien-Ordner wiederherstellen (BL-257): gespeicherter Verzeichnis-Handle +
  // Leserecht-Nachfrage, genau wie beim Arbeitskopie-Handle. Kein Ordner oder kein erneut
  // erteiltes Recht ist KEIN Fehler — die App läuft weiter, nur ohne Medien-Vorschauen.
  void mediaResolver.restore().catch(() => {});

  // `layout` (BL-91) ist der EINE Formfaktor-Zustand (Spec 21 §3): hier verdrahtet, damit
  // es genau ein `matchMedia` in der Schale gibt. Gelesen wird er erst von der Sidebar
  // (BL-06) und dem Multi-Pane (BL-92) — verdrahtet ist er trotzdem schon hier, weil die
  // eine Stelle, an der Plattform-Listener der Schale starten, genau diese ist.
  const stopOnline = onlineStatus.start();
  const stopLayout = layout.start(layoutEnv);
  return () => {
    stopOnline();
    stopLayout();
  };
}
