// ui/shell/event-labels.ts — DIE EINE deutsche Übersetzung für GEDCOM-Ereignistyp-Tags
// (INV-UI-4). Nutzer-Fund 2026-07-10: rohe Tags (GRAD, EDUC, OCCU, …) mischten sich
// unübersetzt neben deutschen Labels (Geburt, Taufe) in derselben Ereignisliste — "deutsche
// Bezeichnungen lesen sich besser". Vorher FÜNF unabhängige, sich überschneidende
// SPECIAL_LABELS-Kopien (person-detail-model.ts, family-detail-model.ts,
// hof-detail-model.ts, place-detail-model.ts ×2) plus separate, inline Pill-Beschriftungen
// in PersonForm.svelte/FamilyForm.svelte — konsolidiert auf eine Quelle.
export const EVENT_TYPE_LABELS: Record<string, string> = {
  // Sonder-Ereignisse (Spec 10 §5.1) — Person
  BIRT: 'Geburt',
  CHR: 'Taufe',
  DEAT: 'Tod',
  BURI: 'Bestattung',
  // Sonder-Ereignisse — Familie
  ENGA: 'Verlobung',
  MARR: 'Heirat',
  // Häufige generische Ereignisse (Spec 20 §2 Ereignis-Pills)
  OCCU: 'Beruf',
  RESI: 'Wohnort',
  EMIG: 'Auswanderung',
  IMMI: 'Einwanderung',
  MILI: 'Militärdienst',
  EVEN: 'Ereignis',
  // Weitere GEDCOM-Standardtypen, die in Datenbeständen vorkommen können
  ADOP: 'Adoption',
  BAPM: 'Taufe',
  BARM: 'Bar Mizwa',
  BASM: 'Bat Mizwa',
  BLES: 'Segnung',
  CENS: 'Volkszählung',
  CHRA: 'Taufe (Erwachsene)',
  CONF: 'Konfirmation',
  CREM: 'Einäscherung',
  FCOM: 'Erstkommunion',
  GRAD: 'Abschluss',
  NATU: 'Einbürgerung',
  ORDN: 'Ordination',
  PROB: 'Testamentseröffnung',
  RETI: 'Ruhestand',
  WILL: 'Testament',
  EDUC: 'Ausbildung',
  PROP: 'Eigentum',
  FACT: 'Sonstiges',
};

/** Deutsches Label für einen GEDCOM-Ereignistyp-Tag — unbekannte Tags (z. B. ein freier
 *  `TYPE`-Text wie "Schule") kommen unverändert durch, keine Übersetzung erfunden. */
export function eventTypeLabel(tag: string): string {
  return EVENT_TYPE_LABELS[tag] ?? tag;
}

/** Feste Kategorie-Reihenfolge für die gruppierte Ereignisanzeige (Nutzer-Vorgabe
 *  2026-07-10: "primär/Lebensdaten, educ und grad, dann occu und beschäftigung, dann
 *  resi und prop sowie weitere etc") — bewusst FEST, nicht alphabetisch (anders als
 *  `groupByKey`s Default für PlaceDetail/SourceDetail, wo die Kategorien selbst
 *  gleichrangig sind). */
export const EVENT_CATEGORY_ORDER = ['Lebensdaten', 'Bildung', 'Beruf', 'Wohnen & Eigentum', 'Weitere Ereignisse'] as const;

const CATEGORY_BY_TAG: Record<string, (typeof EVENT_CATEGORY_ORDER)[number]> = {
  BIRT: 'Lebensdaten',
  CHR: 'Lebensdaten',
  DEAT: 'Lebensdaten',
  BURI: 'Lebensdaten',
  EDUC: 'Bildung',
  GRAD: 'Bildung',
  OCCU: 'Beruf',
  RETI: 'Beruf',
  RESI: 'Wohnen & Eigentum',
  PROP: 'Wohnen & Eigentum',
  CENS: 'Wohnen & Eigentum',
};

/** Für EVEN/FACT (generischer Tag OHNE eigene Kategorie-Bedeutung): der freie TYPE-Text
 *  trägt die eigentliche fachliche Bedeutung, nicht der Tag selbst — ein
 *  "Beschäftigung"-Ereignis (EVEN + TYPE Beschäftigung) gehört fachlich zu "Beruf", genau
 *  wie ein OCCU-Ereignis (Nutzer-Vorgabe 2026-07-10). Exakte, bekannte Synonyme — kein
 *  Freitext-Rätselraten für unbekannte TYPE-Werte (die landen weiterhin unter "Weitere
 *  Ereignisse", s. `eventCategory` Fallback). */
const CATEGORY_BY_CUSTOM_TEXT: Record<string, (typeof EVENT_CATEGORY_ORDER)[number]> = {
  Beschäftigung: 'Beruf',
};

/** `tag` ist der reale GEDCOM-Tag; `customText` (optional) der freie `TYPE`-Sub-Wert
 *  (`ev.eventType`), falls vorhanden. Ein bekannter Tag (OCCU, GRAD, …) entscheidet immer
 *  zuerst; nur für kategorie-lose Tags (EVEN/FACT/unbekannt) wird zusätzlich der freie
 *  Text gegen bekannte Synonyme geprüft. */
export function eventCategory(tag: string, customText?: string): (typeof EVENT_CATEGORY_ORDER)[number] {
  const byTag = CATEGORY_BY_TAG[tag];
  if (byTag) return byTag;
  if (customText && CATEGORY_BY_CUSTOM_TEXT[customText]) return CATEGORY_BY_CUSTOM_TEXT[customText];
  return 'Weitere Ereignisse';
}
