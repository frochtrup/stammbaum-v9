// ui/views/family/family-event-menu.ts — welche Ereignistypen bietet das „+ Ereignis"-
// Sammelmenü der Familie noch an? (Spec 20 §2, ADR-v9-63). Reine Projektion über die
// Familie, kein DOM — das Gegenstück zu `person-event-menu.ts`, aus `FamilyDetail.svelte`
// herausgenommen.
//
// WARUM ALS EIGENE DATEI UND NICHT INLINE (BL-410). Die Liste lag als `const
// FAMILY_EVENT_TYPES` im `<script>` einer `.svelte`-Datei und war damit für
// `tests/core/event-tag-drift.test.ts` unerreichbar: dessen Richtung 2 („jeder anlegbare
// Ereignistyp wird beim Laden auch wieder erkannt") prüfte deshalb nur das PERSONEN-Menü.
// Ein Familien-Menüpunkt, den der Parser nicht zurücklesen kann, wäre stillschweigend
// durchgegangen — genau die Lücke, gegen die dieser Test angetreten ist. Als Modul ist die
// Liste importierbar, und beide Träger stehen unter derselben Zusicherung.
//
// Dieselbe Regel wie bei der Person („gefüllt schlägt selten"): ein Item verschwindet,
// sobald sein Typ an dieser Familie schon vorkommt. Personen-Ereignisse (Beruf, Wohnort,
// Tod) stehen bewusst NICHT hier — sie hängen am Menschen, nicht an der Ehe.
import type { Family } from '../../../core/model/types';
import { eventTypeLabel } from '../../shell/event-labels';

export interface EventMenuItem {
  tag: string;
  label: string;
}

/** Die generischen Familien-Ereignistypen (`Family.events[]`).
 *
 *  `DIV` steht seit BL-410 dabei (Nutzer-Wunsch): die Scheidung war der einzige
 *  Familien-Ereignistyp, den der Parser liest und der Writer schreibt, den aber niemand
 *  anlegen konnte — im Referenzbestand `Testdateien/Unsere Familie 2026.ged` genau 1×
 *  vorhanden. Sie bleibt ein `events[]`-Eintrag und bekommt KEINEN eigenen Modell-Slot
 *  neben `marriage`/`engagement`: Parser, Writer, `RECOGNIZED_FAMILY` und
 *  `MODELLIERTE_KINDER` führen `DIV` längst, der Roundtrip trägt sie also bereits — ein
 *  Sonder-Slot hätte sechs Schichten angefasst, ohne eine Frage zu beantworten, die offen
 *  war (Nutzer-Entscheidung 2026-08-29, [ADR-v9-305]).
 *
 *  Reihenfolge nach Bedeutung, nicht alphabetisch: die Scheidung ist das einzige Ereignis
 *  dieser Liste, das die Ehe selbst betrifft — sie steht deshalb vorn, wie „Ereignis" als
 *  neutralster Sammelbegriff dahinter. */
export const FAMILY_EVENT_TYPES = ['DIV', 'EVEN', 'CENS', 'PROP', 'FACT'] as const;

export function familyEventMenu(family: Family | null): EventMenuItem[] {
  if (!family) return [];
  return FAMILY_EVENT_TYPES.filter((t) => !family.events.some((e) => e.type === t)).map((t) => ({
    tag: t,
    label: eventTypeLabel(t),
  }));
}
