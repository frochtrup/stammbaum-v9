// ui/shell/onboarding-state.svelte.ts — wann der Erstnutzer-Rundgang läuft
// (BL-213, ADR-v9-190). Bauform wie `online-status.svelte.ts`/`sw-update.svelte.ts`:
// ein kleiner reaktiver Zustand der Schale, damit App.svelte nur noch verdrahtet.
//
// Die BEDINGUNG steht bewusst hier und nicht verstreut in der Schale, weil sie aus drei
// unabhängigen Quellen kommt und jede einzeln falsch wirken kann:
//   1. der Merker aus dem B1-Bündel („schon gesehen"),
//   2. der Formfaktor (nur mobil — auf Desktop beschriftet die Sidebar dieselben Ziele
//      dauerhaft, ein Rundgang darüber erklärt Sichtbares, Spec 21 §3),
//   3. geladenes Demo-Material.
//
// Zu (3): Auslöser ist der ZUSTAND „Demo geladen", nicht das Ereignis „Demo-Knopf
// geklickt". Derselbe Zustand entsteht auch, wenn die Arbeitskopie der Demo beim Start
// wiederhergestellt wird (App.svelte `onMount`) — wer den Rundgang beim ersten Mal
// weggewischt hat, ohne ihn zu beenden, bekommt ihn dann erneut. Ein an den Klick
// gehängter Auslöser hätte genau diesen Fall verloren, und v8 hatte ihn auch nicht
// (`maybeStartOnboarding` lief nur im Demo-Ladepfad).
import { layout } from './layout.svelte';
import type { TourStore } from '../../services/app-data';

/** Dateiname des mitgelieferten Demo-Bestands — EINE Quelle für den Ladepfad
 *  (`ImportButton`) und die Rundgang-Bedingung hier. */
export const DEMO_FILE_NAME = 'demo.ged';

export interface TourState {
  /** Soll der Rundgang gerade sichtbar sein? */
  readonly visible: boolean;
  /** Merker aus dem B1-Bündel lesen (beim App-Start). Fehler = „schon gesehen", der
   *  Rundgang ist eine Zugabe und darf einen Speicherfehler nicht zum Ereignis machen. */
  load(): Promise<void>;
  /** Durchlaufen ODER abgebrochen — beides beendet ihn dauerhaft. */
  finish(): void;
}

/**
 * @param store    Merker im B1-Bündel (`createTourStore`).
 * @param fileName Zugriff auf den aktuell geladenen Dateinamen (AppState) — als Funktion,
 *                 damit der reaktive Lesevorgang beim Auswerten von `visible` passiert
 *                 und nicht einmalig beim Erzeugen.
 */
export function createTourState(store: TourStore, fileName: () => string): TourState {
  let done = $state(true); // bis der Merker gelesen ist: nichts zeigen
  return {
    get visible() {
      return !done && !layout.isDesktopLayout && fileName() === DEMO_FILE_NAME;
    },
    async load() {
      try {
        done = await store.isDone();
      } catch {
        done = true;
      }
    },
    finish() {
      done = true;
      void store.markDone().catch(() => {});
    },
  };
}
