// ui/shell/event-clipboard.svelte.ts — Ereignis-Zwischenablage (BL-212, ADR-v9-156):
// ein Ereignis bei einer Person kopieren und bei der nächsten übernehmen (v8-Orakel
// `UIState._eventClipboard`, „+ Übernehmen").
//
// AUSDRÜCKLICH TRANSIENT — Kategorie A ([30 §2](../../specs/v9/30-NFR-und-Persistenz.md)):
// lebt nur in dieser Sitzung, wird NICHT persistiert und reist nicht mit der Datei. Damit
// berührt sie das Kategorie-B-Sync-Bündel (BL-180) nicht; eine Zwischenablage, die einen
// Neustart überlebt, wäre auch fachlich Unsinn.
//
// Bauform wie createRoute()/createViewState(): KEIN Modul-Singleton, damit Tests eine
// frische, isolierte Instanz bekommen und zwei Testfälle sich nicht gegenseitig füllen.
//
// Kopiert wird eine TIEFE Momentaufnahme: das Original-Event lebt weiter in seiner Person
// und darf sich danach ändern, ohne die Ablage zu verändern (und umgekehrt darf das
// Einfügen keine geteilten Zitat-/Medien-Arrays zwischen zwei Personen entstehen lassen —
// sonst schriebe eine Änderung an der einen still in die andere).
import type { Event } from '../../core/model/types';

export interface EventClipboard {
  /** Das kopierte Ereignis oder null (Ablage leer). */
  readonly event: Event | null;
  /** Kurzbeschriftung für das Menü („Wohnort: Ochtrup"), leer wenn nichts abgelegt ist. */
  readonly label: string;
  copy(ev: Event, label: string): void;
  clear(): void;
  /** Frische Kopie zum Einfügen — nie das abgelegte Objekt selbst (s. Kopfkommentar). */
  take(): Event | null;
}

function deepCopy(ev: Event): Event {
  return {
    ...ev,
    citations: ev.citations.map((c) => ({ ...c, media: c.media.map((m) => ({ ...m })) })),
    media: ev.media.map((m) => ({ ...m })),
  };
}

export function createEventClipboard(): EventClipboard {
  let event = $state<Event | null>(null);
  let label = $state('');

  return {
    get event() {
      return event;
    },
    get label() {
      return label;
    },
    copy(ev, lbl) {
      event = deepCopy(ev);
      label = lbl;
    },
    clear() {
      event = null;
      label = '';
    },
    take() {
      return event ? deepCopy(event) : null;
    },
  };
}
