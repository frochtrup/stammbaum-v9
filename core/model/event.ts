// core/model/event.ts — Event-Prädikate. INV-P5: seen bewahrt leere-aber-vorhandene Blöcke.
import type { Event } from './types';

/**
 * Ist das Ereignis „vorhanden"?
 * - seen=true  → ja (leerer, aber vorhandener Block `1 BIRT`, INV-P5).
 * - sonst: ja, sobald irgendein Feld belegt/vorhanden ist. Tristate beachtet:
 *   date/place === '' (Tag vorhanden, leer) zählt als vorhanden; null zählt nicht.
 */
export function isEventPresent(ev: Event): boolean {
  if (ev.seen) return true;
  if (ev.value !== '') return true;
  if (ev.date !== null) return true;
  if (ev.place !== null) return true;
  if (ev.placeId !== null) return true;
  if (ev.hofId !== null) return true;
  if (ev.addr !== '') return true;
  if (ev.note !== '') return true;
  if (ev.datePhrase !== '') return true;
  if (ev.eventType !== '') return true;
  if (ev.citations.length > 0) return true;
  if (ev.media.length > 0) return true;
  return false;
}
