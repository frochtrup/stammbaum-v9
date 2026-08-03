// ui/views/person/person-event-modal.svelte.ts — der Einzel-Ereignis-Editor der
// Personen-Detailansicht (✎-Icon je Zeile, ADR-v9-60) samt Neu-Anlage (ADR-v9-63) und
// Zwischenablage (BL-212).
//
// Aus `PersonDetail.svelte` extrahiert, als diese die max-lines-Ratsche (BL-54) riss —
// dieselbe Aufteilung wie `person-event-menu.ts` daneben und wie
// `entity-tab-overlays.svelte.ts` (Zustand + seine Regeln als Fabrik, kein Modul-
// Singleton, damit Tests eine frische Instanz bekommen). Es ist eine kohäsive Einheit:
// EIN Modal-Zustand für beide Aufrufarten, plus alles, was aus ihm abgeleitet wird
// (welches Ereignis, welche Beschriftung, welche Todesursache, ist es kopierbar) und der
// eine Rückschreibe-Pfad.
//
// Was in der Komponente BLEIBT: was gerendert wird. Hier liegt nur, WAS bearbeitet wird.
import type { AppState } from '../../shell/app-state.svelte';
import type { EventClipboard } from '../../shell/event-clipboard.svelte';
import type { Event, Person } from '../../../core/model/types';
import { makeEvent } from '../../../core/model/factory';
import { eventTypeLabel } from '../../shell/event-labels';
import { displayName } from '../../shell/person-display';
import { formatDateForDisplay } from '../../../core/model/gedcom-date';
import type { PersonDetailModel } from './person-detail-model';

/** `edit` = bestehende Zeile (Row-`key` wie in `person-detail-model.ts`s toEventRow:
 *  'BIRT'/'CHR'/'DEAT'/'BURI'/`ev-${i}`), `create` = frisch angelegtes Event eines
 *  GEDCOM-Tags (`makeEvent(tag)`). */
type ModalState = { kind: 'edit'; key: string } | { kind: 'create'; tag: string };

export interface PersonEventModal {
  /** Das zu bearbeitende Ereignis — `null`, solange kein Editor offen ist. */
  readonly event: Event | null;
  /** `edit`/`create` für den Modal-Modus; `null`, wenn geschlossen. */
  readonly mode: 'edit' | 'create' | null;
  readonly label: string;
  /** Todesursache (lebt auf `Person.cause`, nicht am Event) — nur beim DEAT-Edit. */
  readonly cause: string | null;
  /** Darf das Ereignis in die Ablage kopiert werden? (s. Begründung unten) */
  readonly copyable: boolean;
  openEdit(key: string): void;
  startCreate(tag: string): void;
  close(): void;
  copy(ev: Event): void;
  paste(): void;
  save(updated: Event, cause: string, derivedBirth?: string | null): void;
}

/** Liest das rohe Event-Objekt aus der Person für einen Row-key (Kehrseite von
 *  toEventRow's key-Vergabe). */
export function eventForKey(p: Person, key: string): Event {
  if (key === 'BIRT') return p.birth;
  if (key === 'CHR') return p.chr;
  if (key === 'DEAT') return p.death;
  if (key === 'BURI') return p.buri;
  return p.events[Number(key.slice(3))];
}

export function createPersonEventModal(deps: {
  appState: AppState;
  /** Der aktuelle Steckbrief — als Getter, damit er der Reaktivität des Aufrufers folgt. */
  detail: () => PersonDetailModel | null;
  /** Ereignis-Ablage der Sitzung (BL-212) — ohne sie entfallen Kopieren/Übernehmen. */
  clipboard?: EventClipboard;
}): PersonEventModal {
  const { appState, detail, clipboard } = deps;

  let modal = $state<ModalState | null>(null);

  const event = $derived.by<Event | null>(() => {
    const d = detail();
    if (!d || !modal) return null;
    if (modal.kind === 'edit') return eventForKey(d.person, modal.key);
    return makeEvent(modal.tag);
  });

  const label = $derived.by<string>(() => {
    const d = detail();
    if (!d || !modal) return '';
    // Lokale Kopie: im `.find()`-Callback verliert TypeScript sonst die Einschränkung
    // auf `kind === 'edit'` (Closure über eine mutable `let`-Variable — TS muss
    // annehmen, sie könne sich zwischen Check und Aufruf ändern). Zur Laufzeit
    // harmlos (`.find` ist synchron), aber svelte-check meldet es zu Recht.
    const m = modal;
    if (m.kind === 'edit') {
      const row = d.events.find((r) => r.key === m.key);
      return row?.label ?? eventTypeLabel(m.key);
    }
    return eventTypeLabel(m.tag);
  });

  const cause = $derived(
    modal?.kind === 'edit' && modal.key === 'DEAT' ? (detail()?.person.cause ?? '') : null,
  );

  /** Kopieren gibt es NUR für generische `events[]`-Einträge, nicht für die vier
   *  Sonder-Felder (BIRT/CHR/DEAT/BURI): eingefügt landet ein Ereignis immer in `events[]`,
   *  ein dort abgelegtes DEAT erzeugte also eine ZWEITE `1 DEAT`-Zeile im Export neben
   *  `person.death` — beim nächsten Laden gewönne eine davon still (dieselbe Falle wie
   *  RELI, ADR-v9-156). */
  const copyable = $derived(modal?.kind === 'edit' && modal.key.startsWith('ev-'));

  return {
    get event() {
      return event;
    },
    get mode() {
      return modal?.kind ?? null;
    },
    get label() {
      return label;
    },
    get cause() {
      return cause;
    },
    get copyable() {
      return copyable;
    },

    openEdit(key) {
      modal = { kind: 'edit', key };
    },

    /** Sonder-Ereignis-Pills (Taufe/Bestattung) UND generische Neu-Anlage (Wohnort-
     *  Standing-Pill, "+ Ereignis"-Menü, "andere Typ"-Fallback) laufen über denselben
     *  Neu-Modus — `save` entscheidet anhand des Tags, ob das Ergebnis ein Sonder-Feld
     *  ersetzt oder zu `events[]` hinzugefügt wird. */
    startCreate(tag) {
      modal = { kind: 'create', tag };
    },

    close() {
      modal = null;
    },

    /** Beschriftung der Ablage: Typ + der Wert, der das Ereignis unterscheidbar macht,
     *  + Herkunftsperson (Design-Kritik 2026-07-31 — „⧉ Übernehmen: Beruf" verriet weder,
     *  WELCHER Beruf noch VON WEM; nach ein paar Minuten ist das nicht mehr erratbar). */
    copy(ev) {
      const d = detail();
      if (!d) return;
      const typ = eventTypeLabel(ev.type);
      const wert = ev.value || ev.addr || ev.place || '';
      const wer = displayName(d.person) || d.person.id;
      clipboard?.copy(ev, wert ? `${typ} (${wert}) von ${wer}` : `${typ} von ${wer}`);
    },

    /** Das eingefügte Ereignis wird direkt angehängt — es ist bereits vollständig, ein
     *  leerer Editor-Zwischenschritt wäre nur ein Klick mehr. */
    paste() {
      const d = detail();
      if (!d || !clipboard) return;
      const ev = clipboard.take();
      if (!ev) return;
      appState.savePerson({ ...d.person, events: [...d.person.events, ev] });
    },

    /**
     * Schreibt das im Modal bearbeitete/angelegte Event zurück — klont die Person,
     * ersetzt NUR das betroffene Feld (Sonder-Ereignis-Feld ODER events[Index]) bzw. hängt
     * ein frisch angelegtes generisches Event an `events[]` an, und ruft
     * `appState.savePerson(model)` mit dem VOLLSTÄNDIGEN Objekt auf (Spec 02 §3 Kommando-
     * Chokepoint, kein Feld-Setter-Pattern). `cause` (Todesursache) wird nur bei
     * key==='DEAT' übernommen (lebt auf Person.cause, nicht am Event).
     */
    save(updated, causeText, derivedBirth = null) {
      const d = detail();
      if (!d || !modal) return;
      const p = d.person;
      const next: Person = { ...p };
      if (modal.kind === 'edit') {
        const key = modal.key;
        if (key === 'BIRT') next.birth = updated;
        else if (key === 'CHR') next.chr = updated;
        else if (key === 'DEAT') {
          next.death = updated;
          next.cause = causeText;
        } else if (key === 'BURI') next.buri = updated;
        else {
          const idx = Number(key.slice(3));
          next.events = p.events.map((e, i) => (i === idx ? updated : e));
        }
      } else {
        const tag = modal.tag;
        if (tag === 'CHR') next.chr = updated;
        else if (tag === 'BURI') next.buri = updated;
        else next.events = [...p.events, updated];
      }
      // Im Dialog vorgemerktes Geburtsdatum (BL-212/ADR-v9-168) im SELBEN Kommando
      // schreiben — ein Speichern, ein Undo-Schritt. Ein vorhandenes Datum wird nie still
      // überschrieben; sagt der Nutzer hier Nein, bleibt der Rest der Änderung trotzdem.
      if (derivedBirth) {
        const vorhanden = next.birth.date;
        const beschriftung = formatDateForDisplay(derivedBirth);
        if (
          !vorhanden ||
          window.confirm(
            `Geburtsdatum ist bereits „${formatDateForDisplay(vorhanden)}". Durch „${beschriftung}" ersetzen?`,
          )
        ) {
          next.birth = { ...next.birth, date: derivedBirth };
        }
      }
      appState.savePerson(next);
      modal = null;
    },
  };
}
