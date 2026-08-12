// ui/shell/citation-clipboard.svelte.ts — Quellreferenz-Zwischenablage (BL-234,
// [20 §2](../../specs/v9/20-Funktionen.md), ADR-v9-69 Punkt 5): eine Quellenreferenz an
// einer beliebigen anderen Zitat-Zeile wiederverwenden, ohne den Picker erneut zu
// durchsuchen.
//
// Abgrenzung zur Ereignis-Ablage (BL-212): die legt ein GANZES Ereignis ab, Zitate reisen
// darin mit — eine Zitation ALLEIN an eine fremde Zeile zu übertragen kann sie nicht.
// Beide teilen sich aber die Mechanik (`clipboard.svelte.ts`, INV-UI-4), es steht kein
// zweiter Ablage-Mechanismus daneben.
//
// **Abgelegt wird die VOLLSTÄNDIGE Zitation** — Quelle, Seite, QUAY, Notiz, Weblink und
// die Evidenz-Achsen (Nutzer-Vorgabe 2026-08-12: „alle Informationen sollten mitwandern").
// Der Zuschnitt ist bewusst weit: wer eine Quelle durcharbeitet, trägt für jeden Fund
// dieselbe Bewertung derselben Seite ein, und genau dieses Wiedertippen soll die Ablage
// abschaffen. Zwei Dinge, die der Nutzer dabei wissen sollte:
//
//   - Die Evidenz-Achse „direkt/indirekt/negativ" ([12 §3](../../specs/v9/12-Forschungsdaten.md))
//     bewertet das Verhältnis der Quelle zur BEHAUPTUNG, ist also streng genommen je
//     Ereignis eine eigene Aussage. Sie reist trotzdem mit — sie ist an der Zielzeile
//     sichtbar und in einem Zug änderbar; ein Feld leer zu lassen, das in neun von zehn
//     Fällen gleich ist, kostet mehr, als es schützt.
//   - Ein Deep Link kann datensatz-spezifisch sein (am Realbestand z. B.
//     `…famreport.php?ofb=lehrte&ID=I54630` — die ID ist die PERSON). Über die Ereignisse
//     EINER Person ist er derselbe, über Personengrenzen hinweg zeigt er auf den falschen
//     Datensatz. Deshalb nennt die Chip-Beschriftung ihn mit „↗", statt ihn still
//     mitzunehmen.
//
// `grampsId` reist AUCH mit — sie ist die Identität des GETEILTEN `<citation>`-Records in
// der GRAMPS-Datei ([10 §5.3](../../specs/v9/10-Domaenenmodell.md), ADR-v9-114/260), und
// dieselbe Fundstelle an einem zweiten Ereignis ist dort EIN Record mit zwei
// `<citationref>`-Besitzern. Eine frische id zu vergeben wäre eine Dublette, die GRAMPS
// selbst nie schriebe. Die Kehrseite trägt `abgeloest()` (`event-edit-citations.ts`): wird
// die eingefügte Zeile GEÄNDERT, ist sie nicht mehr dieselbe Fundstelle und gibt den
// Record ab.
import type { Citation } from '../../core/model/types';
import { createClipboard, type Clipboard } from './clipboard.svelte';

export type CitationClipboard = Clipboard<Citation>;

/** Medien (der Weblink lebt als OBJE/FILE darunter) und die Bewertung sind eigene
 *  Objekte — geteilt würden sie eine spätere Änderung an der einen Zeile still in die
 *  andere schreiben. */
function deepCopy(c: Citation): Citation {
  return {
    ...c,
    media: c.media.map((m) => ({ ...m })),
    eval: c.eval ? { ...c.eval } : null,
  };
}

export function createCitationClipboard(): CitationClipboard {
  return createClipboard(deepCopy);
}
