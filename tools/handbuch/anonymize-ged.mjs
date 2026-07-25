#!/usr/bin/env node
// tools/handbuch/anonymize-ged.mjs
//
// Erzeugt aus einer echten (privaten) GEDCOM-Datei eine REICHHALTIGE, ANONYMISIERTE
// Beispieldatei für die Handbuch-Illustrationen. Struktur, Daten, Orte, Quellen und
// Verwandtschaft bleiben vollständig erhalten — nur PERSONENNAMEN werden deterministisch
// durch Pseudonyme ersetzt (gleicher Originalname → immer gleiches Pseudonym).
//
// Warum so: Reichhaltigkeit (≈2.800 Personen, echte Familienstruktur, historisch
// stimmige Daten, reale Ortsgeografie) ist für aussagekräftige Screenshots wertvoll;
// personenbeziehbar sind vor allem die NAMEN. Orte/Kirchenbuch-Titel sind öffentliche
// Geografie bzw. Bestände und bleiben unverändert, damit Karte, Orts-Steckbrief und
// Quellen realistisch aussehen.
//
// Aufruf:  node anonymize-ged.mjs <quelle.ged> <ziel.ged>
//
// Das ZIEL ist gefahrlos committierbar; die QUELLE bleibt privat (gitignored).

import { readFileSync, writeFileSync } from 'node:fs';

const [, , SRC, OUT] = process.argv;
if (!SRC || !OUT) {
  console.error('Aufruf: node anonymize-ged.mjs <quelle.ged> <ziel.ged>');
  process.exit(1);
}

// --- Pseudonym-Pools (Münsterland/Oldenburg-Anmutung, bewusst NICHT die echten Namen) ---
const MALE = [
  'Johann', 'Heinrich', 'Wilhelm', 'Friedrich', 'Bernhard', 'Hermann', 'August', 'Franz',
  'Josef', 'Georg', 'Anton', 'Theodor', 'Konrad', 'Ludwig', 'Gerhard', 'Clemens', 'Aloys',
  'Engelbert', 'Everhard', 'Gottfried', 'Kaspar', 'Melchior', 'Bernard', 'Wessel', 'Dietrich',
  'Reinhold', 'Norbert', 'Wendelin', 'Lambert', 'Ferdinand',
];
const FEMALE = [
  'Anna', 'Maria', 'Elisabeth', 'Margarethe', 'Katharina', 'Gertrud', 'Sophia', 'Wilhelmine',
  'Auguste', 'Bernhardine', 'Josefine', 'Klara', 'Franziska', 'Agnes', 'Therese', 'Hedwig',
  'Adelheid', 'Regina', 'Ottilie', 'Christine', 'Johanna', 'Angela', 'Aleydis', 'Fenne',
  'Grete', 'Styna', 'Trine', 'Lucia', 'Mechteld', 'Wibbeke',
];
const SURNAMES = [
  'Brinkmann', 'Hagedorn', 'Tenbrock', 'Middendorf', 'Bäumer', 'Wewer', 'Averbeck', 'Holtkamp',
  'Rensing', 'Espelage', 'Beckmann', 'Rottmann', 'Sudhoff', 'Determann', 'Hövelmann', 'Nienhaus',
  'Recker', 'Wietkamp', 'Bußmann', 'Elpermann', 'Silkenbömer', 'Wißmann', 'Kortenbrede',
  'Uphoff', 'Grothues', 'Lindemann', 'Vennemann', 'Deitmar', 'Schulze-Buxloh', 'Robbert',
  'Terhalle', 'Wigger', 'Epping', 'Bendfeld', 'Hörstmann', 'Kösters', 'Lammersmann', 'Rövekamp',
  'Schmedding', 'Wördemann', 'Beckhoff', 'Duesmann', 'Gausmann', 'Hunkemöller', 'Löcke',
];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}
const pick = (pool, key) => pool[hash(key) % pool.length];

// Behalte "leere"/unbekannte Marker unverändert.
const KEEP = new Set(['', '?', '...', '…', 'unbekannt', 'Unbekannt', 'N.N.', 'NN']);

// Schlüssel case-insensitiv normalisieren: echte Daten mischen Schreibweisen
// ("Decker" vs "DECKER") — sonst bekämen Vater und Sohn verschiedene Pseudonyme.
const surnameMap = new Map(); // lower(original) -> pseudonym
function mapSurname(s) {
  const t = s.trim();
  if (KEEP.has(t)) return s;
  const key = t.toLowerCase();
  if (!surnameMap.has(key)) surnameMap.set(key, pick(SURNAMES, 'S:' + key));
  return surnameMap.get(key);
}
function mapGiven(g, sex) {
  const t = g.trim();
  if (KEEP.has(t)) return g;
  const pool = sex === 'F' ? FEMALE : MALE; // Unbekannt → männlicher Pool (neutral genug)
  return pick(pool, (sex || 'U') + ':' + t.toLowerCase());
}

// Titel/Partikel, die KEINE Rufnamen sind und unangetastet bleiben.
const PREFIXES = new Set([
  'dr.', 'dr.-ing.', 'prof.', 'ing.', 'med.', 'phil.', 'jur.',
  'von', 'van', 'zu', 'zur', 'zum', 'de', 'den', 'der', 'ten', 'ter', 'op',
  'gen.', 'genannt', 'frhr.', 'freiherr', 'graf', 'gräfin', 'jun.', 'sen.',
]);
// Vornamen TOKEN-weise mappen: so bleiben NAME-Vorname und GIVN konsistent, und
// Titel wie "Dr.-Ing." (inline in der NAME-Zeile) werden nicht zu Rufnamen verdreht.
function mapGivenPhrase(phrase, sex) {
  return phrase.split(/(\s+)/).map((tok) => {
    if (/^\s*$/.test(tok)) return tok; // Whitespace erhalten
    const m = tok.match(/^([^\p{L}]*)(.*?)([^\p{L}]*)$/u);
    const [, pre, core, post] = m;
    if (!core || KEEP.has(core) || PREFIXES.has(core.toLowerCase())) return tok;
    return pre + mapGiven(core, sex) + post;
  }).join('');
}
// NAME-Zeile "Vorname Teile /Nachname/ Suffix" zerlegen und neu zusammensetzen.
function anonName(value, sex) {
  const m = value.match(/^(.*?)\/([^/]*)\/(.*)$/);
  if (!m) return mapGivenPhrase(value, sex); // kein Schrägstrich → alles Vorname
  const given = mapGivenPhrase(m[1].trimEnd(), sex);
  const surname = mapSurname(m[2]);
  return `${given ? given + ' ' : ''}/${surname}/${m[3]}`;
}

const lines = readFileSync(SRC, 'utf8').split(/\r?\n/);

// --- Durchlauf 1: SEX sowie kanonische GIVN/SURN je Individuum sammeln ---
const sexByXref = new Map();
const givnByXref = new Map();
const surnByXref = new Map();
let cur = null;
for (const line of lines) {
  const mi = line.match(/^0 (@[^@]+@) INDI/);
  if (mi) { cur = mi[1]; continue; }
  if (/^0 /.test(line)) { cur = null; continue; }
  if (cur) {
    let ms;
    if ((ms = line.match(/^1 SEX (\w)/))) sexByXref.set(cur, ms[1]);
    else if ((ms = line.match(/^2 GIVN (.+)$/)) && !givnByXref.has(cur)) givnByXref.set(cur, ms[1]);
    else if ((ms = line.match(/^2 SURN (.+)$/)) && !surnByXref.has(cur)) surnByXref.set(cur, ms[1]);
  }
}

// --- Durchlauf 2: reale Nach- UND Vornamen sammeln (für Freitext-Ersatz) ---
const realSurnames = new Set();
const femaleGivens = new Set();
const maleGivens = new Set();
{
  let x = null;
  for (const line of lines) {
    const mi = line.match(/^0 (@[^@]+@) INDI/);
    if (mi) { x = mi[1]; continue; }
    if (/^0 /.test(line)) { x = null; }
    let m = line.match(/^\d+ SURN (.+)$/);
    if (m && !KEEP.has(m[1].trim())) realSurnames.add(m[1].trim());
    m = line.match(/^\d+ NAME (.*?)\/([^/]+)\//);
    if (m && !KEEP.has(m[2].trim())) realSurnames.add(m[2].trim());
    // Vornamen-Tokens (aus GIVN und NAME-Vornamensteil), nach Geschlecht sortiert
    const givenSrc = (line.match(/^\d+ GIVN (.+)$/) || [])[1]
      ?? ((line.match(/^\d+ NAME (.*?)\//) || [])[1]);
    if (givenSrc) {
      const sex = x ? sexByXref.get(x) : null;
      for (const tokRaw of givenSrc.split(/\s+/)) {
        const core = (tokRaw.match(/[\p{L}][\p{L}-]*/u) || [])[0];
        if (!core || core.length < 3 || KEEP.has(core) || PREFIXES.has(core.toLowerCase())) continue;
        (sex === 'F' ? femaleGivens : maleGivens).add(core);
      }
    }
  }
}
function reFrom(set) {
  return set.size
    ? new RegExp('(?<![\\p{L}])(' + [...set].sort((a, b) => b.length - a.length)
        .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![\\p{L}])', 'giu')
    : null;
}
const surnameRe = reFrom(realSurnames);
const femaleRe = reFrom(femaleGivens);
const maleRe = reFrom(maleGivens);
// Freitext: reale Nach- und Vornamen durch Pseudonyme ersetzen (Ort/Datum sind separat
// geschützt, siehe SKIP unten). Vornamen geschlechtsgerecht, damit Notizen stimmig bleiben.
function scrubFreeText(v) {
  let out = v;
  if (surnameRe) out = out.replace(surnameRe, (m0) => mapSurname(m0));
  if (femaleRe) out = out.replace(femaleRe, (m0) => mapGiven(m0, 'F'));
  if (maleRe) out = out.replace(maleRe, (m0) => mapGiven(m0, 'M'));
  return out;
}

// Tags, deren Wert NICHT angetastet wird (Geografie, Datum, Struktur, Zeiger).
const SKIP_SCRUB = new Set([
  'PLAC', 'MAP', 'LATI', 'LONG', 'DATE', 'SEX', 'FORM', 'VERS', 'CHAR', 'GEDC',
  'RIN', 'RFN', 'AFN', '_UID', 'CHAN', 'LANG', 'TIME', 'QUAY', 'ADDR', 'POST',
  'CTRY', 'STAE', 'CITY', 'PHON', 'WWW', 'EMAIL',
]);

// --- Durchlauf 3: neu schreiben ---
cur = null;
const out = lines.map((line) => {
  const mi = line.match(/^0 (@[^@]+@) INDI/);
  if (mi) { cur = mi[1]; return line; }
  if (/^0 /.test(line)) { cur = null; /* Header/SUBM etc. weiter unten */ }

  const sex = cur ? (sexByXref.get(cur) || 'U') : 'U';

  let m;
  if ((m = line.match(/^(\d+) NAME (.*)$/))) {
    // Wo GIVN/SURN-Untertags existieren, die NAME-Zeile daraus KONSISTENT neu aufbauen
    // (verhindert, dass NAME-Vorname und GIVN divergieren, und lässt inline-Titel wie
    // "Dr.-Ing." weg — die stehen im eigenen NPFX-Tag).
    const g = cur && givnByXref.has(cur) ? givnByXref.get(cur) : null;
    const s = cur && surnByXref.has(cur) ? surnByXref.get(cur) : null;
    if (g !== null || s !== null) {
      const gp = g !== null ? mapGivenPhrase(g, sex) : '';
      const sp = s !== null ? mapSurname(s) : '';
      return `${m[1]} NAME ${gp}${gp ? ' ' : ''}/${sp}/`;
    }
    return `${m[1]} NAME ${anonName(m[2], sex)}`;
  }
  if ((m = line.match(/^(\d+) (GIVN|NICK) (.*)$/))) return `${m[1]} ${m[2]} ${mapGivenPhrase(m[3], sex)}`;
  if ((m = line.match(/^(\d+) (SURN) (.*)$/))) return `${m[1]} ${m[2]} ${mapSurname(m[3])}`;
  if ((m = line.match(/^(\d+) (_MARNM) (.*)$/))) return `${m[1]} ${m[2]} ${anonName(m[3], 'F')}`;

  // Datei-/Objektpfade neutralisieren (leaken Benutzernamen UND reale Namen im Dateinamen).
  if ((m = line.match(/^(\d+) FILE (.*)$/))) {
    const ext = (m[2].match(/\.[A-Za-z0-9]+$/) || ['.jpg'])[0];
    return `${m[1]} FILE foto_${hash(m[2]) % 100000}${ext.toLowerCase()}`;
  }

  // Allgemeiner Freitext-Scrub: jede Nicht-Skip-Zeile mit Textwert (auch Level-0-
  // NOTE-Records mit Xref: "0 @N1@ NOTE …", und Quellenfelder ABBR/AUTH/PUBL/TITL/TEXT).
  let mm;
  if ((mm = line.match(/^(\d+) (@[^@]+@) (\w+)(?: (.*))?$/))) {
    const [, lvl, xref, tag, val] = mm;
    if (val && !SKIP_SCRUB.has(tag) && !/^@[^@]+@$/.test(val)) {
      return `${lvl} ${xref} ${tag} ${scrubFreeText(val)}`;
    }
    return line;
  }
  if ((mm = line.match(/^(\d+) (_?\w+)(?: (.*))?$/))) {
    const [, lvl, tag, val] = mm;
    if (val && !SKIP_SCRUB.has(tag) && !/^@[^@]+@$/.test(val)) {
      return `${lvl} ${tag} ${scrubFreeText(val)}`;
    }
  }
  return line;
});

writeFileSync(OUT, out.join('\n'), 'utf8');

console.log(`Anonymisiert: ${SRC} → ${OUT}`);
console.log(`  ${sexByXref.size} Personen, ${surnameMap.size} Nachnamen pseudonymisiert, ` +
  `${realSurnames.size} reale Nachnamen erkannt.`);
