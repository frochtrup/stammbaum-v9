// core/validate/rules.ts — der Regelkatalog (Spec 20 §3).
//
// EINE Regel = EIN Objektliteral in RULES. Eine Regel zu ergänzen heißt: Eintrag
// anhängen, ID in types.ts aufnehmen, Test schreiben. Runner, Konfigurations-Sheet und
// Berichts-Ansicht lesen alle aus dieser Liste — es gibt keine zweite Fundstelle, die
// mitgepflegt werden müsste.
//
// Verhaltens-Orakel: legacy-v8/gedcom-validator.js (Personen-/Familien-Regeln) und
// legacy-v8/ui-views-place.js `validatePlaces()` (Geo-Regeln). Spec 20 §3 führt die
// Geo-Prüfungen bewusst in DIESELBE Engine, nicht als zweites Werkzeug mit eigenem Badge.
import type { Hit, Rule, RuleContext } from './types';
import type { Family, Person } from '../model/types';
import { distanceKm } from './geo';
import type { CitationFact } from './facts';
import {
  birthYear,
  citedSourceIds,
  deathYear,
  familyCitationFacts,
  familyCitations,
  hasAnyEval,
  hasAnyQuay,
  hasSources,
  openHypotheses,
  personCitationFacts,
  personCitations,
  personLabel,
  yearOf,
} from './facts';

const NONE: readonly Hit[] = [];

/** Kurzform für „genau ein Treffer mit diesem Text". */
function hit(text: string, personId?: string | null): readonly Hit[] {
  return [{ text, personId: personId ?? null }];
}

/** Ehepartner einer Familie aufgelöst (fehlende Referenzen → null). */
function spouses(f: Family, ctx: RuleContext): { husb: Person | null; wife: Person | null } {
  return {
    husb: f.husband ? (ctx.db.individuals.get(f.husband) ?? null) : null,
    wife: f.wife ? (ctx.db.individuals.get(f.wife) ?? null) : null,
  };
}

/** Anker für Familien-Befunde ohne betroffenen Einzel-Gatten (v8: husb, sonst wife). */
function familyAnchor(f: Family): string | null {
  return f.husband ?? f.wife ?? null;
}

/** Jahr aus einem Dated-Feld (`from`/`to` sind bereits Jahre, `dateRaw` der Rohtext). */
function datedYear(v: number | null, raw: string | null | undefined): number | null {
  return v ?? yearOf(raw ?? null);
}

/**
 * Widersprüchliche Evidenz JE FAKTUM (EVIDENCE_CONFLICT, ADR-v9-165): dieselbe Aussage
 * einmal direkt belegt und einmal negativ. EIN Befund je Faktum, nicht je Zitatpaar —
 * vier sich kreuzende Zitate sind EIN Widerspruch, nicht vier.
 *
 * Unbewertete Zitate zählen nicht: über eine fehlende Bewertung klagt MISSING_EVAL.
 */
function konflikte(facts: readonly CitationFact[]): Hit[] {
  const out: Hit[] = [];
  for (const f of facts) {
    let direkt = false;
    let negativ = false;
    for (const c of f.citations) {
      if (c.eval?.evidence === 'direct') direkt = true;
      else if (c.eval?.evidence === 'negative') negativ = true;
    }
    if (direkt && negativ) {
      out.push({
        text: `${f.label}: ein Zitat belegt direkt, ein anderes negativ — Widerspruch klären`,
      });
    }
  }
  return out;
}

export const RULES: readonly Rule[] = [
  // ── Logische Fehler ───────────────────────────────────────────────────────
  {
    id: 'DEATH_BEFORE_BIRTH',
    label: 'Sterbejahr vor Geburtsjahr',
    group: 'logik',
    severity: 'error',
    defaultEnabled: true,
    threshold: null,
    category: 'urkunde',
    person: (p) => {
      const b = birthYear(p);
      const d = deathYear(p);
      return b !== null && d !== null && d < b
        ? hit(`Sterbejahr ${d} liegt vor Geburtsjahr ${b}`)
        : NONE;
    },
  },
  {
    id: 'EVENT_AFTER_DEATH',
    label: 'Ereignis nach Sterbedatum',
    group: 'logik',
    severity: 'error',
    defaultEnabled: true,
    threshold: null,
    category: 'kirchenbuch',
    person: (p) => {
      const d = deathYear(p);
      if (d === null) return NONE;
      const out: Hit[] = [];
      const chr = yearOf(p.chr.date);
      if (chr !== null && chr > d) out.push({ text: `Taufdatum ${chr} nach Sterbejahr ${d}` });
      // BURI ist bewusst ausgenommen — eine Bestattung NACH dem Tod ist der Normalfall.
      for (const ev of p.events) {
        const y = yearOf(ev.date);
        if (y !== null && y > d) {
          out.push({ text: `Ereignis ${ev.type || '?'} (${y}) nach Sterbejahr ${d}` });
        }
      }
      return out;
    },
  },
  {
    id: 'MARR_BEFORE_BIRTH',
    label: 'Heirat vor eigener Geburt',
    group: 'logik',
    severity: 'error',
    defaultEnabled: true,
    threshold: null,
    category: 'urkunde',
    family: (f, ctx) => {
      const my = yearOf(f.marriage.date);
      if (my === null) return NONE;
      const { husb, wife } = spouses(f, ctx);
      const out: Hit[] = [];
      for (const s of [husb, wife]) {
        if (!s) continue;
        const b = birthYear(s);
        if (b !== null && my < b) {
          out.push({ text: `Heiratsjahr ${my} liegt vor eigener Geburt ${b}`, personId: s.id });
        }
      }
      return out;
    },
  },
  {
    id: 'MARR_AFTER_DEATH',
    label: 'Heirat nach Tod eines Gatten',
    group: 'logik',
    severity: 'error',
    defaultEnabled: true,
    threshold: null,
    category: 'urkunde',
    family: (f, ctx) => {
      const my = yearOf(f.marriage.date);
      if (my === null) return NONE;
      const { husb, wife } = spouses(f, ctx);
      const out: Hit[] = [];
      if (husb) {
        const d = deathYear(husb);
        if (d !== null && my > d) {
          out.push({ text: `Heiratsjahr ${my} nach Tod des Mannes (${d})`, personId: husb.id });
        }
      }
      if (wife) {
        const d = deathYear(wife);
        if (d !== null && my > d) {
          out.push({ text: `Heiratsjahr ${my} nach Tod der Frau (${d})`, personId: wife.id });
        }
      }
      return out;
    },
  },
  {
    id: 'CHILD_BEFORE_PARENT',
    label: 'Kind nicht jünger als Elternteil',
    group: 'logik',
    severity: 'error',
    defaultEnabled: true,
    threshold: null,
    category: 'kirchenbuch',
    family: (f, ctx) => {
      const { husb, wife } = spouses(f, ctx);
      const out: Hit[] = [];
      for (const childId of f.children) {
        const child = ctx.db.individuals.get(childId);
        if (!child) continue;
        const cy = birthYear(child);
        if (cy === null) continue;
        const cname = personLabel(child);
        for (const [parent, role] of [
          [wife, 'Mutter'],
          [husb, 'Vater'],
        ] as const) {
          if (!parent) continue;
          const py = birthYear(parent);
          if (py !== null && cy - py <= 0) {
            out.push({
              text: `Kind ${cname} (${cy}) nicht jünger als ${role} (${py})`,
              personId: parent.id,
            });
          }
        }
      }
      return out;
    },
  },
  {
    id: 'CHILD_AFTER_FATHER_DEATH',
    label: 'Kind >1 Jahr nach Tod des Vaters',
    group: 'logik',
    severity: 'error',
    defaultEnabled: true,
    threshold: null,
    category: 'kirchenbuch',
    family: (f, ctx) => {
      const { husb } = spouses(f, ctx);
      if (!husb) return NONE;
      const hd = deathYear(husb);
      if (hd === null) return NONE;
      const out: Hit[] = [];
      for (const childId of f.children) {
        const child = ctx.db.individuals.get(childId);
        if (!child) continue;
        const cy = birthYear(child);
        // Das Toleranzjahr deckt das nachgeborene Kind ab (Schwangerschaft bei Tod).
        if (cy !== null && cy > hd + 1) {
          out.push({
            text: `Kind ${personLabel(child)} (${cy}) mehr als 1 Jahr nach Tod des Vaters (${hd})`,
            personId: husb.id,
          });
        }
      }
      return out;
    },
  },
  {
    id: 'MOTHER_TOO_YOUNG',
    label: 'Mutter zu jung bei Geburt',
    group: 'logik',
    severity: 'error',
    defaultEnabled: true,
    threshold: 'minMotherAge',
    category: 'kirchenbuch',
    family: (f, ctx) => parentAgeHits(f, ctx, 'wife', 'min', ctx.thresholds.minMotherAge),
  },

  // ── Plausibilität ─────────────────────────────────────────────────────────
  {
    id: 'AGE_OVER_MAX',
    label: 'Unrealistisches Alter',
    group: 'plausibilitaet',
    severity: 'warn',
    defaultEnabled: true,
    threshold: 'maxAge',
    category: 'online',
    person: (p, ctx) => {
      const b = birthYear(p);
      const d = deathYear(p);
      if (b === null || d === null) return NONE;
      const age = d - b;
      return age > ctx.thresholds.maxAge
        ? hit(`Alter unrealistisch: ${age} Jahre (Grenze: ${ctx.thresholds.maxAge})`)
        : NONE;
    },
  },
  {
    id: 'MOTHER_TOO_OLD',
    label: 'Mutter zu alt bei Geburt',
    group: 'plausibilitaet',
    severity: 'warn',
    defaultEnabled: true,
    threshold: 'maxMotherAge',
    category: 'kirchenbuch',
    family: (f, ctx) => parentAgeHits(f, ctx, 'wife', 'max', ctx.thresholds.maxMotherAge),
  },
  {
    id: 'FATHER_TOO_OLD',
    label: 'Vater zu alt bei Geburt',
    group: 'plausibilitaet',
    severity: 'warn',
    defaultEnabled: true,
    threshold: 'maxFatherAge',
    category: 'kirchenbuch',
    family: (f, ctx) => parentAgeHits(f, ctx, 'husband', 'max', ctx.thresholds.maxFatherAge),
  },
  {
    id: 'FATHER_TOO_YOUNG',
    label: 'Vater zu jung bei Geburt',
    group: 'plausibilitaet',
    severity: 'warn',
    defaultEnabled: true,
    threshold: 'minFatherAge',
    category: 'kirchenbuch',
    family: (f, ctx) => parentAgeHits(f, ctx, 'husband', 'min', ctx.thresholds.minFatherAge),
  },
  {
    id: 'MARR_TOO_YOUNG',
    label: 'Heiratsalter zu jung',
    group: 'plausibilitaet',
    severity: 'warn',
    defaultEnabled: true,
    threshold: 'minMarrAge',
    category: 'urkunde',
    family: (f, ctx) => {
      const my = yearOf(f.marriage.date);
      if (my === null) return NONE;
      const { husb, wife } = spouses(f, ctx);
      const out: Hit[] = [];
      for (const [s, role] of [
        [husb, 'Mann'],
        [wife, 'Frau'],
      ] as const) {
        if (!s) continue;
        const b = birthYear(s);
        if (b === null) continue;
        const age = my - b;
        // age < 0 fällt an MARR_BEFORE_BIRTH — hier nicht doppelt melden.
        if (age >= 0 && age < ctx.thresholds.minMarrAge) {
          out.push({
            text: `Heiratsalter ${role}: ${age} Jahre (Grenze: ${ctx.thresholds.minMarrAge})`,
            personId: s.id,
          });
        }
      }
      return out;
    },
  },
  {
    id: 'MISSING_SURNAME',
    label: 'Nachname fehlt',
    group: 'plausibilitaet',
    severity: 'warn',
    defaultEnabled: true,
    threshold: null,
    category: 'online',
    person: (p) => (p.surname.trim() ? NONE : hit('Nachname fehlt')),
  },
  {
    id: 'MISSING_SEX',
    label: 'Geschlecht unbekannt',
    group: 'plausibilitaet',
    severity: 'warn',
    defaultEnabled: true,
    threshold: null,
    category: 'online',
    person: (p) => (p.sex === 'U' ? hit('Geschlecht unbekannt') : NONE),
  },
  {
    id: 'MANY_CHILDREN',
    label: 'Ungewöhnlich viele Kinder',
    group: 'plausibilitaet',
    severity: 'warn',
    defaultEnabled: true,
    threshold: 'maxChildren',
    category: 'kirchenbuch',
    family: (f, ctx) => {
      const n = f.children.length;
      const anchor = familyAnchor(f);
      return n > ctx.thresholds.maxChildren && anchor
        ? hit(`Ungewöhnlich viele Kinder: ${n} (Grenze: ${ctx.thresholds.maxChildren})`, anchor)
        : NONE;
    },
  },
  {
    id: 'MULTI_FAMC',
    label: 'Mehr als eine Herkunftsfamilie',
    group: 'plausibilitaet',
    severity: 'warn',
    defaultEnabled: true,
    threshold: null,
    category: 'online',
    person: (p) =>
      p.childOf.length > 1
        ? hit(`${p.childOf.length} Herkunftsfamilien eingetragen (erwartet: max. 1)`)
        : NONE,
  },

  // ── Vollständigkeit ───────────────────────────────────────────────────────
  {
    id: 'MISSING_BIRTH',
    label: 'Geburtsdatum/-taufe fehlt',
    group: 'vollstaendigkeit',
    severity: 'info',
    defaultEnabled: true,
    threshold: null,
    category: 'kirchenbuch',
    person: (p) => (!p.birth.date && !p.chr.date ? hit('Geburtsdatum/-taufe fehlt') : NONE),
  },
  {
    id: 'MISSING_BIRTHPLACE',
    label: 'Geburtsort fehlt (wenn Datum bekannt)',
    group: 'vollstaendigkeit',
    severity: 'info',
    defaultEnabled: true,
    threshold: null,
    category: 'kirchenbuch',
    person: (p) => (p.birth.date && !p.birth.place?.trim() ? hit('Geburtsort fehlt') : NONE),
  },
  {
    id: 'MISSING_DEATHPLACE',
    label: 'Sterbeort fehlt (wenn Datum bekannt)',
    group: 'vollstaendigkeit',
    severity: 'info',
    defaultEnabled: true,
    threshold: null,
    category: 'kirchenbuch',
    person: (p) => (p.death.date && !p.death.place?.trim() ? hit('Sterbeort fehlt') : NONE),
  },
  {
    id: 'MISSING_GIVEN',
    label: 'Vorname fehlt',
    group: 'vollstaendigkeit',
    severity: 'info',
    defaultEnabled: true,
    threshold: null,
    category: 'online',
    // Nur wenn ein Nachname da ist — eine völlig namenlose Person meldet MISSING_SURNAME.
    person: (p) => (p.surname.trim() && !p.given.trim() ? hit('Vorname fehlt') : NONE),
  },
  {
    id: 'MISSING_MARRDATE',
    label: 'Heiratsdatum fehlt',
    group: 'vollstaendigkeit',
    severity: 'info',
    defaultEnabled: true,
    threshold: null,
    category: 'urkunde',
    family: (f, ctx) => {
      const { husb, wife } = spouses(f, ctx);
      // Nur wenn BEIDE Gatten bekannt sind — sonst ist die Familie ohnehin unfertig.
      return husb && wife && !f.marriage.date ? hit('Heiratsdatum fehlt', husb.id) : NONE;
    },
  },
  {
    id: 'MISSING_QUAY',
    label: 'Quellen ohne QUAY-Bewertung',
    group: 'vollstaendigkeit',
    severity: 'info',
    defaultEnabled: true,
    threshold: null,
    category: 'online',
    person: (p) =>
      hasSources(p) && !hasAnyQuay(p)
        ? hit('Quellenangaben ohne Qualitätsbewertung (kein QUAY)')
        : NONE,
  },

  // ── Quellen ───────────────────────────────────────────────────────────────
  {
    id: 'NO_SOURCES_AT_ALL',
    label: 'Keine Quellenangabe (Person)',
    group: 'quellen',
    severity: 'info',
    defaultEnabled: true,
    threshold: null,
    category: 'kirchenbuch',
    person: (p) => (hasSources(p) ? NONE : hit('Keine Quellenangabe vorhanden')),
  },
  {
    id: 'BIRTH_AFTER_STAERA',
    label: 'Geburt nach Standesamt-Ära, keine Quelle',
    group: 'quellen',
    severity: 'info',
    defaultEnabled: true,
    threshold: 'staStAera',
    category: 'urkunde',
    person: (p, ctx) => {
      const b = birthYear(p);
      return b !== null && b >= ctx.thresholds.staStAera && !hasSources(p)
        ? hit(`Geburt ${b} — Standesamtsurkunde suchen`)
        : NONE;
    },
  },
  {
    id: 'NO_FAM_SOURCES',
    label: 'Keine Quellenangabe (Familie)',
    group: 'quellen',
    severity: 'info',
    defaultEnabled: true,
    threshold: null,
    category: 'kirchenbuch',
    family: (f) => {
      const anchor = familyAnchor(f);
      return familyCitations(f).length === 0 && anchor
        ? hit('Familie ohne Quellenangabe', anchor)
        : NONE;
    },
  },
  {
    id: 'ORPHAN_CITATION',
    label: 'Quellbezug ohne vorhandene Quelle',
    group: 'quellen',
    severity: 'warn',
    defaultEnabled: true,
    threshold: null,
    category: 'online',
    person: (p, ctx) =>
      citedSourceIds(personCitations(p))
        .filter((sid) => !ctx.knownSourceIds.has(sid))
        .map((sid) => ({ text: `Quellbezug auf nicht vorhandene Quelle: ${sid}` })),
    family: (f, ctx) => {
      const anchor = familyAnchor(f);
      if (!anchor) return NONE;
      return citedSourceIds(familyCitations(f))
        .filter((sid) => !ctx.knownSourceIds.has(sid))
        .map((sid) => ({
          text: `Quellbezug auf nicht vorhandene Quelle: ${sid}`,
          personId: anchor,
        }));
    },
  },
  {
    id: 'MISSING_EVAL',
    label: 'Quellen ohne Evidenzbewertung',
    group: 'quellen',
    severity: 'info',
    // Ab Werk AUS (Spec 20 §3): die Evidenzbewertung ist eine fortgeschrittene
    // Opt-in-Disziplin; sonst flutet ein Dauerhinweis jede unbewertete Quelle.
    defaultEnabled: false,
    threshold: null,
    category: 'online',
    person: (p) =>
      hasSources(p) && !hasAnyEval(p)
        ? hit('Quellenangaben ohne Evidenzbewertung (Quellentyp/Information/Evidenz)')
        : NONE,
  },
  {
    id: 'EVIDENCE_CONFLICT',
    label: 'Widersprüchliche Evidenz an einem Faktum',
    group: 'quellen',
    severity: 'warn',
    // Ab Werk AN (Spec 20 §3, ADR-v9-165 Pkt 4) — und das ist KEIN Widerspruch zum
    // default-off von MISSING_EVAL direkt darüber: jene Regel klagt über die ABWESENHEIT
    // einer Bewertung und würde jede unbewertete Quelle fluten; diese hier schlägt
    // ausschließlich dort an, wo jemand ZWEI Bewertungen bewusst gesetzt hat und sie
    // einander widersprechen. Wer nie bewertet, sieht sie nie.
    defaultEnabled: true,
    threshold: null,
    category: 'kirchenbuch',
    person: (p) => konflikte(personCitationFacts(p)),
    family: (f) => {
      const anchor = familyAnchor(f);
      return anchor ? konflikte(familyCitationFacts(f)).map((h) => ({ ...h, personId: anchor })) : NONE;
    },
  },
  {
    id: 'OPEN_HYPO',
    label: 'Offene Hypothesen',
    group: 'quellen',
    severity: 'info',
    // Ab Werk AUS (Spec 20 §3): eine offene Hypothese ist ein normaler
    // Forschungszustand, kein Mangel — Opt-in für die gezielte Durchsicht.
    defaultEnabled: false,
    threshold: null,
    category: 'online',
    person: (p) => {
      const n = openHypotheses(p.hypotheses);
      return n > 0
        ? hit(`${n} offene Hypothese${n > 1 ? 'n' : ''} — Evidenz prüfen/auflösen`)
        : NONE;
    },
    family: (f) => {
      const n = openHypotheses(f.hypotheses);
      const anchor = familyAnchor(f);
      return n > 0 && anchor
        ? hit(`${n} offene Hypothese${n > 1 ? 'n' : ''} an dieser Familie`, anchor)
        : NONE;
    },
  },

  // ── Vernetzung ────────────────────────────────────────────────────────────
  // Beide Regeln sind gewöhnliche Personen-Prädikate — sie lesen nur die DB-weit
  // EINMAL berechnete Erreichbarkeitsmenge aus dem Kontext (siehe types.ts RuleContext).
  {
    id: 'ISOLATED_PERSON',
    label: 'Person ist mit keiner Familie verknüpft',
    group: 'vernetzung',
    severity: 'info',
    defaultEnabled: true,
    threshold: null,
    category: 'online',
    person: (p) =>
      p.childOf.length === 0 && p.parentIn.length === 0
        ? hit('Person ist mit keiner Familie verknüpft (weder Eltern- noch eigene Familie)')
        : NONE,
  },
  {
    id: 'DISCONNECTED_FROM_ROOT',
    label: 'Person ist nicht mit dem Kernbaum verbunden',
    group: 'vernetzung',
    severity: 'warn',
    defaultEnabled: true,
    threshold: null,
    category: 'online',
    person: (p, ctx) =>
      ctx.rootId !== null && p.id !== ctx.rootId && !ctx.reachable.has(p.id)
        ? hit('Person ist nicht mit dem Kernbaum (Probanden) verbunden')
        : NONE,
  },

  // ── Geo (Orte/Höfe) ───────────────────────────────────────────────────────
  {
    id: 'GEO_BBOX',
    label: 'Koordinaten außerhalb des erwarteten Gebiets',
    group: 'geo',
    severity: 'warn',
    defaultEnabled: true,
    // Als einzige Regel von VIER Schwellen abhängig (bboxMinLat…bboxMaxLon). `threshold`
    // benennt genau eine und bliebe hier irreführend — das Konfigurations-Sheet rendert
    // die Schwellen ohnehin aus `Thresholds`, nicht aus diesem Feld.
    threshold: null,
    category: 'online',
    place: (o, ctx) => bboxHits(o.lat, o.long, ctx),
    hof: (h, ctx) => bboxHits(h.lat, h.long, ctx),
  },
  {
    id: 'PNAME_DATE',
    label: 'Namensvariante: Startjahr nach Endjahr',
    group: 'geo',
    severity: 'warn',
    defaultEnabled: true,
    threshold: null,
    category: 'online',
    place: (o) => {
      const out: Hit[] = [];
      for (const pn of o.pnames) {
        const f = datedYear(pn.from, pn.dateRaw);
        const t = datedYear(pn.to, pn.dateRaw);
        if (f !== null && t !== null && f > t) {
          out.push({ text: `Name „${pn.value}": Startjahr ${f} > Endjahr ${t}` });
        }
      }
      return out;
    },
  },
  {
    id: 'PNAME_OVERLAP',
    label: 'Namensvarianten überlappen zeitlich',
    group: 'geo',
    severity: 'warn',
    defaultEnabled: true,
    threshold: null,
    category: 'online',
    place: (o) => {
      // Nur datierte Varianten: zwei undatierte Namen sind kein Widerspruch, sondern
      // der Normalfall „Schreibvariante ohne Periodenangabe".
      const spans = o.pnames
        .filter((pn) => pn.from !== null || pn.to !== null)
        .map((pn) => ({ f: pn.from ?? 0, t: pn.to ?? 9999, val: pn.value }));
      const out: Hit[] = [];
      for (let i = 0; i < spans.length; i++) {
        for (let j = i + 1; j < spans.length; j++) {
          if (spans[i].f < spans[j].t && spans[j].f < spans[i].t) {
            out.push({
              text: `Namen „${spans[i].val}" und „${spans[j].val}" überlappen zeitlich`,
            });
          }
        }
      }
      return out;
    },
  },
  {
    id: 'ENCLOSURE_CYCLE',
    label: 'Zirkelreferenz in der „Teil von"-Kette',
    group: 'geo',
    severity: 'error',
    defaultEnabled: true,
    threshold: null,
    category: 'online',
    place: (o, ctx) => {
      const places = ctx.db.placeObjects;
      // Erreicht man von `start` aus wieder `o.id`? Tiefenbegrenzung als Fangnetz für
      // pathologisch tiefe Ketten; `seen` verhindert Endlosläufe in Fremd-Zirkeln.
      const canReach = (start: string): boolean => {
        const stack: [string, number][] = [[start, 0]];
        const seen = new Set<string>();
        while (stack.length) {
          const [pid, depth] = stack.pop()!;
          if (pid === o.id) return true;
          if (depth >= 15 || seen.has(pid)) continue;
          seen.add(pid);
          for (const e of places.get(pid)?.enclosedBy ?? []) {
            if (e.placeId) stack.push([e.placeId, depth + 1]);
          }
        }
        return false;
      };
      for (const enc of o.enclosedBy) {
        if (!enc.placeId) continue;
        if (enc.placeId === o.id || canReach(enc.placeId)) {
          return hit('Zirkelreferenz in „Teil von"-Kette');
        }
      }
      return NONE;
    },
  },
  {
    id: 'HOF_NO_COORD',
    label: 'Hof ohne eigene Koordinaten',
    group: 'geo',
    severity: 'info',
    defaultEnabled: true,
    threshold: null,
    category: 'online',
    hof: (h, ctx) =>
      ctx.hofsWithResidence.has(h.id) && (h.lat === null || h.long === null)
        ? hit('Hof ohne Koordinaten — auf der Karte nicht sichtbar')
        : NONE,
  },
  {
    id: 'HOF_FAR',
    label: 'Hof zu weit vom umschließenden Ort entfernt',
    group: 'geo',
    severity: 'warn',
    defaultEnabled: true,
    threshold: 'hofMaxDistKm',
    category: 'online',
    hof: (h, ctx) => {
      if (!ctx.hofsWithResidence.has(h.id)) return NONE;
      if (h.lat === null || h.long === null) return NONE;
      const village = ctx.db.placeObjects.get(h.villageId);
      if (!village || village.lat === null || village.long === null) return NONE;
      const km = distanceKm(h.lat, h.long, village.lat, village.long);
      return km > ctx.thresholds.hofMaxDistKm
        ? hit(
            `Hof ${km.toFixed(0)} km vom Ort „${village.title || village.id}" entfernt — ` +
              'evtl. vertauschte/falsche Koordinaten',
          )
        : NONE;
    },
  },
];

// --- geteilte Prädikat-Bausteine -------------------------------------------

function bboxHits(
  lat: number | null,
  long: number | null,
  ctx: RuleContext,
): readonly Hit[] {
  if (lat === null || long === null) return NONE;
  const t = ctx.thresholds;
  const outside =
    lat < t.bboxMinLat || lat > t.bboxMaxLat || long < t.bboxMinLon || long > t.bboxMaxLon;
  return outside
    ? hit(`Koordinaten außerhalb des erwarteten Gebiets: ${lat.toFixed(3)}, ${long.toFixed(3)}`)
    : NONE;
}

/**
 * Elternalter bei Kindsgeburt — der Baustein hinter vier Regeln (Mutter/Vater ×
 * zu jung/zu alt). Der Fall „Kind nicht jünger als Elternteil" (age <= 0) gehört
 * CHILD_BEFORE_PARENT und wird hier bewusst übersprungen, damit ein einzelner
 * Datenfehler nicht zwei Befunde erzeugt (v8-Parität: dort eine if/else-Kette).
 */
function parentAgeHits(
  f: Family,
  ctx: RuleContext,
  role: 'husband' | 'wife',
  bound: 'min' | 'max',
  limit: number,
): readonly Hit[] {
  const parentId = role === 'husband' ? f.husband : f.wife;
  const parent = parentId ? ctx.db.individuals.get(parentId) : null;
  if (!parent) return NONE;
  const py = birthYear(parent);
  if (py === null) return NONE;

  const out: Hit[] = [];
  for (const childId of f.children) {
    const child = ctx.db.individuals.get(childId);
    if (!child) continue;
    const cy = birthYear(child);
    if (cy === null) continue;
    const age = cy - py;
    if (age <= 0) continue; // → CHILD_BEFORE_PARENT
    const violates = bound === 'min' ? age < limit : age > limit;
    if (!violates) continue;
    const lead = bound === 'min' ? 'Zu jung' : 'Alter';
    out.push({
      text: `${lead} bei Geburt von ${personLabel(child)}: ${age} Jahre (Grenze: ${limit})`,
      personId: parent.id,
    });
  }
  return out;
}

/** Registry-Zugriff nach ID — für UI und Tests. */
export const RULES_BY_ID: ReadonlyMap<string, Rule> = new Map(RULES.map((r) => [r.id, r]));
