// ui/shell/event-clipboard.svelte.ts — Ereignis-Zwischenablage (BL-212, ADR-v9-156):
// ein Ereignis bei einer Person kopieren und bei der nächsten übernehmen (v8-Orakel
// `UIState._eventClipboard`, „+ Übernehmen").
//
// Die Mechanik (Fabrik, transient/Kategorie A, doppelte Kopie) liegt seit BL-234 in
// `clipboard.svelte.ts` und wird geteilt (INV-UI-4) — hier steht nur noch, WAS abgelegt
// wird und wie eine vom Original entkoppelte Kopie davon aussieht.
import type { Event } from '../../core/model/types';
import { createClipboard, type Clipboard } from './clipboard.svelte';

export type EventClipboard = Clipboard<Event>;

/**
 * Zitate und Medien reisen im Ereignis mit — würden sie geteilt, schriebe eine Änderung
 * an der einen Person still in die andere.
 *
 * **`grampsId` des EREIGNISSES fällt weg, die der Zitate bleibt** ([ADR-v9-260](../../specs/v9/04-Entscheidungslog.md#adr-v9-260)).
 * Der Unterschied liegt in dem, was die id benennt: ein `<citation>` identifiziert eine
 * FUNDSTELLE (Quelle + Seite) — dieselbe Fundstelle an einem zweiten Ereignis ist in
 * GRAMPS EIN geteilter Record, eine frische id wäre eine Dublette. Ein `<event>`
 * identifiziert dagegen ein GESCHEHEN BEI EINEM BESITZER; „⧉ Übernehmen" hängt es aber
 * definitionsgemäß an eine ANDERE Person. GRAMPS teilt Ereignisse nur, wenn es wirklich
 * dasselbe Geschehen ist (Volkszählung, Trauung) — das kann die Ablage nicht wissen, und
 * ein späterer Edit an der Kopie schriebe sonst das Ereignis der Herkunftsperson um.
 */
function deepCopy(ev: Event): Event {
  return {
    ...ev,
    grampsId: null,
    citations: ev.citations.map((c) => ({ ...c, media: c.media.map((m) => ({ ...m })) })),
    media: ev.media.map((m) => ({ ...m })),
  };
}

export function createEventClipboard(): EventClipboard {
  return createClipboard(deepCopy);
}
