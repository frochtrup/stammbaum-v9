// core/research/suggest.ts — Forschungsschritt-Vorschlag (Spec 20 §3 „Konfiguration",
// [12 §1](Forschungsdaten), ADR-v9-165, BL-228).
//
// Der Vorschlag ist eine REINE FUNKTION, kein Assistent: er bildet einen Validierungs-
// Befund auf eine Quellengattung und — wo eindeutig ableitbar — auf eine bereits
// vorhandene Quelle ab, und BELEGT damit die Aufgabe VOR, die der ohnehin vorhandene
// „→ Als Aufgabe übernehmen"-Knopf anlegt. Er legt nichts an, er handelt nicht: die
// Wahl bleibt beim Menschen (LP-6), jedes Feld bleibt editierbar. Deshalb auch kein
// neues Bedienelement (INV-UI-11) und kein neues Modellfeld — `ResearchTask` trägt
// `category` und `sourceRef` bereits (Spec 12 §1).
//
// Das Gattungs-Vokabular ist DAS DER QUELLEN-VORLAGEN (`SOURCE_TEMPLATES`, BL-128),
// nicht eine zweite Liste (ADR-v9-165 Pkt 3, INV-UI-4 auf Datenebene). Die drei
// Regel-Slugs (`kirchenbuch`/`urkunde`/`online`) aus `Rule.category` sind BEWUSST nicht
// die Ausgabe: sie kommen in keinem Vorschlags-Preset vor, eine daraus angelegte Aufgabe
// trüge also eine Kategorie, die der Aufgaben-Editor nirgends anbietet.
//
// Absichtlich OHNE Import aus `core/validate` — dieselbe Entscheidung wie in
// `proof-summary.ts` („frei von einer lateralen core/validate-Abhängigkeit"); die
// Gegenrichtung existiert bereits (`core/validate/facts.ts` liest `research/types`).
// Die Eingabe ist deshalb strukturell beschrieben; ein `Finding` erfüllt sie ohne
// Umbau am Aufrufer.
import { SOURCE_TEMPLATES } from '../model/source-templates';
import type { Database } from '../model/types';

/** Die Felder eines Validierungs-Befunds, die der Vorschlag tatsächlich liest. */
export interface ResearchStepInput {
  rule: string;
  /** Grob-Einordnung der Regel (`kirchenbuch`/`urkunde`/`online`) — nur Rückfallebene. */
  category: string;
  personId: string | null;
  familyId: string | null;
}

export interface ResearchStepContext {
  db: Database;
  /**
   * Grenzjahr der Standesamts-Ära. Kommt vom Aufrufer aus den Regel-Schwellenwerten
   * (`thresholds.staStAera`, Vorgabe 1876) — dieselbe Zahl, die `BIRTH_AFTER_STAERA`
   * benutzt. Bewusst KEINE eigene Konstante hier: verschiebt der Nutzer die Schwelle,
   * müssen Regel und Vorschlag zusammen wandern.
   */
  staStAera: number;
}

/** Vorbelegung für den vorhandenen „→ Als Aufgabe übernehmen"-Knopf. */
export interface ResearchStepSuggestion {
  /** Label aus `SOURCE_TEMPLATES` — Vorbelegung für `ResearchTask.category`. */
  category: string;
  /** Vorhandene Quelle, oder `''` wenn nicht EINDEUTIG ableitbar. */
  sourceRef: string;
}

/** Welches Ereignis trägt den Befund? Bestimmt die Gattungs-Familie. */
type Anlass = 'geburt' | 'tod' | 'heirat';

/**
 * Regel → Anlass. Nur dort eingetragen, wo der Befund eindeutig an EINEM Ereignis hängt;
 * alles andere fällt auf `geburt` zurück (unten begründet).
 */
const ANLASS_JE_REGEL: Record<string, Anlass> = {
  MISSING_DEATHPLACE: 'tod',
  EVENT_AFTER_DEATH: 'tod',
  DEATH_BEFORE_BIRTH: 'tod',
  CHILD_AFTER_FATHER_DEATH: 'tod',
  AGE_OVER_MAX: 'tod',
  MISSING_MARRDATE: 'heirat',
  MARR_BEFORE_BIRTH: 'heirat',
  MARR_AFTER_DEATH: 'heirat',
  MARR_TOO_YOUNG: 'heirat',
  NO_FAM_SOURCES: 'heirat',
  MANY_CHILDREN: 'heirat',
};

/** Gattungs-Schlüssel je Anlass und Ära — die Schlüssel sind die der Quellen-Vorlagen. */
const GATTUNG: Record<Anlass, { kirche: string; amt: string }> = {
  geburt: { kirche: 'kb-taufen', amt: 'standesamt-geburt' },
  tod: { kirche: 'kb-beerdigungen', amt: 'standesamt-sterbefall' },
  heirat: { kirche: 'kb-heiraten', amt: 'standesamt-heirat' },
};

/** Erstes vierstelliges Jahr aus einem GEDCOM-Datum; `null`, wenn keines drinsteht. */
function jahr(date: string | null): number | null {
  if (!date) return null;
  const m = date.match(/\d{4}/);
  return m ? Number(m[0]) : null;
}

function anlassVon(input: ResearchStepInput): Anlass {
  const bekannt = ANLASS_JE_REGEL[input.rule];
  if (bekannt) return bekannt;
  // Rückfall auf die Geburt: sie ist das Ereignis, das die Identität einer Person
  // begründet, und der Taufeintrag nennt in aller Regel auch die Eltern — für einen
  // Befund ohne eigenes Ereignis (fehlendes Geschlecht, Waisen-Zitat, Vernetzung) ist
  // das der Beleg, der am ehesten weiterhilft.
  return 'geburt';
}

/** Das für den Anlass maßgebliche Jahr und der zugehörige Ort — beide können fehlen. */
function anlassDaten(
  anlass: Anlass,
  input: ResearchStepInput,
  db: Database,
): { jahr: number | null; ort: string } {
  if (anlass === 'heirat') {
    const f = input.familyId ? db.families.get(input.familyId) : undefined;
    return { jahr: jahr(f?.marriage.date ?? null), ort: f?.marriage.place ?? '' };
  }
  const p = input.personId ? db.individuals.get(input.personId) : undefined;
  if (!p) return { jahr: null, ort: '' };
  if (anlass === 'tod') {
    return { jahr: jahr(p.death.date) ?? jahr(p.buri.date), ort: p.death.place || p.buri.place || '' };
  }
  return { jahr: jahr(p.birth.date) ?? jahr(p.chr.date), ort: p.birth.place || p.chr.place || '' };
}

/**
 * Wörter, an denen eine vorhandene Quelle als „von dieser Gattung" erkannt wird.
 * Bewusst aus dem Vorlagen-Label abgeleitet statt separat gepflegt: ändert sich das
 * Vokabular, wandert die Erkennung mit.
 */
function gattungsWorte(templateKey: string): string[] {
  const t = SOURCE_TEMPLATES.find((x) => x.key === templateKey);
  return (t?.label ?? '').toLowerCase().split(/\s+/).filter(Boolean);
}

/** Der Ortsname ohne Zusätze — „Ochtrup (Westf.)" und „, Ochtrup, …" treffen beide. */
function ortsKern(ort: string): string {
  const ersterTeil = ort.split(',').map((s) => s.trim()).filter(Boolean)[0] ?? '';
  return ersterTeil.replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase();
}

/**
 * Bildet einen Validierungs-Befund auf Quellengattung + (wo ableitbar) vorhandene Quelle
 * ab. Rein lesend; das Ergebnis ist eine Vorbelegung, keine Handlung.
 */
export function suggestResearchStep(
  input: ResearchStepInput,
  ctx: ResearchStepContext,
): ResearchStepSuggestion {
  const anlass = anlassVon(input);
  const { jahr: j, ort } = anlassDaten(anlass, input, ctx.db);
  // Unbekanntes Jahr → Kirchenbuch. Das Kirchenbuch deckt beide Epochen ab; ein
  // Standesamtsregister, das es im fraglichen Jahr nie gab, wäre ein Vorschlag ins Leere.
  const key = j !== null && j >= ctx.staStAera ? GATTUNG[anlass].amt : GATTUNG[anlass].kirche;
  const category = SOURCE_TEMPLATES.find((t) => t.key === key)?.label ?? '';

  // Quellenbezug NUR bei Eindeutigkeit: ein falsch vorbelegter Bezug ist teurer als
  // ein leerer, weil er sich wie eine bereits getroffene Entscheidung liest.
  const worte = gattungsWorte(key);
  const kern = ortsKern(ort);
  const treffer: string[] = [];
  for (const s of ctx.db.sources.values()) {
    const heu = `${s.title} ${s.abbr}`.toLowerCase();
    if (!worte.every((w) => heu.includes(w))) continue;
    if (kern && !heu.includes(kern)) continue;
    treffer.push(s.id);
  }

  return { category, sourceRef: treffer.length === 1 ? treffer[0] : '' };
}
