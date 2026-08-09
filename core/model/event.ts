// core/model/event.ts — Event-Prädikate. INV-P5: seen bewahrt leere-aber-vorhandene Blöcke.
import type { Event } from './types';

/**
 * Ist das Ereignis „vorhanden"?
 * - seen=true  → ja (leerer, aber vorhandener Block `1 BIRT`, INV-P5).
 * - sonst: ja, sobald irgendein Feld belegt/vorhanden ist. Tristate beachtet:
 *   date/place/addr === '' (Tag vorhanden, leer) zählt als vorhanden; null zählt nicht.
 */
export function isEventPresent(ev: Event): boolean {
  if (ev.seen) return true;
  if (ev.value !== '') return true;
  if (ev.date !== null) return true;
  if (ev.place !== null) return true;
  if (ev.placeId !== null) return true;
  if (ev.hofId !== null) return true;
  if (ev.addr !== null) return true;
  if (ev.note !== '') return true;
  if (ev.datePhrase !== '') return true;
  if (ev.eventType !== '') return true;
  if (ev.citations.length > 0) return true;
  if (ev.media.length > 0) return true;
  return false;
}

/**
 * Ist das Ereignis „leer" im UI-Rücknahme-Sinn (Nachtrag 2026-07-12, Spec 20 §2
 * „Generalisiert" — die Tod-✕-Rücknahme verallgemeinert auf JEDE Ereigniszeile)?
 *
 * Identisch zu `isEventPresent` OHNE `seen` — ein reines `seen`-Flag (bare `1 CHR`/
 * `1 OCCU`-Tag ohne Sub-Tags, GEDCOM-Import, INV-P5) trägt keinen fachlichen Inhalt und
 * gilt hier bewusst als „leer", auch wenn `isEventPresent()` deswegen bereits `true`
 * liefert — genau DAS ist der Unterschied, den diese Funktion existiert: ein Ereignis,
 * das nur durch `seen`/Bookkeeping „vorhanden" ist, aber sonst nichts trägt, darf die
 * ✕-Rücknahme zeigen (sonst bliebe ein leerer, nie wieder entfernbarer Eintrag stehen —
 * der ursprüngliche Bug-Befund: ein leer angelegtes/wieder geleertes generisches Event
 * verschwindet scheinbar aus der Ansicht, bleibt aber als leerer `events[]`-Eintrag
 * bestehen, weil kein Rücknahme-Pfad existierte).
 *
 * `media`/`datePhrase`/`eventType`/`lati`+`long` sind bewusst MIT geprüft (über die im
 * Spec-Text genannten Datum/Ort/Adresse/Wert/Notiz/Quellen hinaus) — keines dieser Felder
 * ist über `EventEditModal` editierbar/löschbar (`lati`/`long` z. B. aus einem `2 MAP`-
 * Sub-Tag beim GEDCOM-Import, unabhängig von `place`/`placeId`, s.
 * `core/interop/gedcom-parse.ts`), ein still vorhandener Wert dort wäre also echter,
 * nicht vom Nutzer rücknehmbarer Inhalt (Datenverlust-Vermeidung, kein folgenloser Fall
 * mehr). Todesursache (`Person.cause`) ist NICHT Teil dieses Tests — sie lebt außerhalb
 * von `Event`; Aufrufer, die sie kennen (PersonDetail bei DEAT), behalten ihre eigene,
 * bereits bestehende Death-spezifische Prüfung (`value='Y'` zählt dort bewusst NICHT als
 * „echte Daten" — anders als hier, wo `value` echten Inhalt trägt, z. B. den Beruf bei
 * OCCU).
 */
export function isEventEmpty(ev: Event): boolean {
  // ADR-v9-228: eine strukturierte Adresse lebt in `addrExtra`, während `addr` leer ist.
  // Ohne diese Zeile gälte ein Ereignis mit „Osterbauernschaft 41, Ochtrup" als leer und
  // bekäme das folgenlose ✕ statt der Löschabfrage — dieselbe Datenverlust-Vermeidung wie
  // bei `lati`/`long`/`media` unten.
  if (ev.addrExtra.length > 0) return false;
  if (ev.value !== '') return false;
  if (ev.date !== null) return false;
  if (ev.place !== null) return false;
  if (ev.placeId !== null) return false;
  if (ev.hofId !== null) return false;
  if (ev.lati !== null) return false;
  if (ev.long !== null) return false;
  if (ev.addr !== null) return false;
  if (ev.note !== '') return false;
  if (ev.datePhrase !== '') return false;
  if (ev.eventType !== '') return false;
  if (ev.citations.length > 0) return false;
  if (ev.media.length > 0) return false;
  return true;
}

/**
 * Anzeige-Text der Adresse (ADR-v9-228) — was in Ereigniszeile und Editor-Feld erscheint.
 *
 * Normalfall: `addr` selbst. Ist die `ADDR`-Zeile aber leer und die Adresse steckt nur in
 * den Index-Tags (an `Testdateien/Unsere Familie 2026.ged` 83× der Fall), wird sie aus
 * `addrExtra` zusammengesetzt — sonst bliebe das Feld leer, obwohl die Adresse in der
 * Datei steht.
 *
 * Die Reihenfolge `ADR1 · ADR2 · ADR3 · POST CITY · CTRY` ist eine gesetzte Konvention,
 * KEINE Spec-Vorgabe: GEDCOM 5.5.1 sagt dazu nichts, weil die Adresse dort ohnehin schon
 * vollständig in `ADDR`/`CONT` stünde. `STAE` steht bewusst hinter `CITY` und vor `CTRY`
 * (Bundesland zwischen Ort und Land), wie es auf einem Umschlag stünde.
 *
 * Reine PROJEKTION, kein Modellwert: der Rückgabewert wird nie gespeichert. Wer die
 * Adresse ändert, schreibt in `addr` — und leert damit `addrExtra` (fromEditable).
 */
export function addrDisplay(ev: Event): string {
  if (ev.addr) return ev.addr;
  if (ev.addrExtra.length === 0) return ev.addr ?? '';

  const wert = (tag: string): string => ev.addrExtra.find((c) => c.tag === tag)?.value.trim() ?? '';
  const ortszeile = [wert('POST'), wert('CITY')].filter(Boolean).join(' ');
  const teile = [wert('ADR1'), wert('ADR2'), wert('ADR3'), ortszeile, wert('STAE'), wert('CTRY')];
  const zusammen = teile.filter(Boolean).join(', ');
  // Kein Treffer unter den bekannten Tags (ein fremdes Programm hängt etwas Eigenes
  // darunter): dann lieber den rohen `addr`-Wert zurückgeben als eine leere Zeile mit
  // Kommas — die Knoten bleiben trotzdem erhalten, sie sind nur nicht anzeigbar.
  return zusammen || (ev.addr ?? '');
}
