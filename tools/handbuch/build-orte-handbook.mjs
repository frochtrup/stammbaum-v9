#!/usr/bin/env node
// tools/handbuch/build-orte-handbook.mjs — erzeugt das Handbuch des Orte-Editors
// (BL-224/OE-9, Spec 22 §8, ADR-v9-164).
//
// WARUM ERZEUGT UND NICHT GESCHRIEBEN: Der Editor zeigt dieselben Orts-/Hof-Flächen wie
// das Hauptprogramm. Zwei von Hand gepflegte Beschreibungen desselben Gegenstands sind die
// Drift, die dieses Projekt an mehreren Stellen bezahlt hat — ein Extrakt kann nicht
// auseinanderlaufen.
//
// WAS ES NICHT TUT: Es verschiebt nichts. Kapitel 7/8 behalten ihren Rang im Hauptbuch;
// hier werden sie ausgewählt, umsortiert und neu nummeriert.
//
// Zwei Mechanismen, mehr nicht (bewusst klein gehalten):
//   1. `data-doc="app"|"orte"` an einem Element — unmarkiert heißt „in beiden".
//   2. Das Manifest bestimmt Auswahl, Reihenfolge und Überschriften.
// Eine Ersetzungs-Syntax (Alternativtext je Textstelle) wurde erwogen und verworfen: zwei
// benachbarte, je markierte Absätze brauchen kein neues Konzept, und ihre Abweichung ist
// im Diff sichtbar.
//
// Aufruf:  node tools/handbuch/build-orte-handbook.mjs [--check]
//          --check  prüft nur (schreibt nichts) — für CI/Gate-Zwecke.

import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..', '..');
const SRC = join(REPO, 'app', 'public', 'HANDBUCH.html');
const OUT = join(REPO, 'app-orte', 'public', 'HANDBUCH-ORTE.html');
const MANIFEST = join(__dirname, 'orte-handbuch.manifest.json');
const checkOnly = process.argv.includes('--check');

const fail = (m) => {
  console.error('[handbuch-orte] FEHLER: ' + m);
  process.exit(1);
};

if (!existsSync(SRC)) fail(`Quelle fehlt: ${SRC}`);
const src = readFileSync(SRC, 'utf8');
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

// --- Ausschneiden ------------------------------------------------------------
//
// Ein Abschnitt reicht von seinem Anker bis zum nächsten Element derselben oder höherer
// Ebene. Bewusst eine Textsuche statt eines DOM-Parsers: das Handbuch ist eine einzige,
// flach strukturierte Datei ohne Bibliothek — ein Parser wäre hier neue Abhängigkeit für
// nichts (Vereinfachen vor Erfinden).

/** Findet den Start eines Abschnitts anhand seines `id`-Attributs. */
function sectionStart(id) {
  const m = new RegExp(`<(h1|h2|section)[^>]*\\sid="${id}"`).exec(src);
  return m ? { index: m.index, tag: m[1] } : null;
}

/** Ende: der nächste `<h1 class="chapter"`, das nächste `<section id=` oder das Dokumentende. */
function sectionEnd(from, tag) {
  const stops = [];
  const h1 = src.indexOf('<h1 class="chapter"', from + 1);
  if (h1 > 0) stops.push(h1);
  const sec = src.indexOf('<section id=', from + 1);
  if (sec > 0) stops.push(sec);
  const top = src.indexOf('<a id="to-top"', from + 1);
  if (top > 0) stops.push(top);
  if (tag === 'section') {
    // Ein `<section>` endet an seinem eigenen Schluss-Tag, nicht am nächsten Kapitel.
    const close = src.indexOf('</section>', from);
    if (close > 0) return close + '</section>'.length;
  }
  return stops.length ? Math.min(...stops) : src.length;
}

const fehler = [];
const teile = [];

for (const abschnitt of manifest.abschnitte) {
  const start = sectionStart(abschnitt.id);
  if (!start) {
    fehler.push(`Manifest nennt „${abschnitt.id}", aber im Handbuch gibt es diese Kennung nicht.`);
    continue;
  }
  let html = src.slice(start.index, sectionEnd(start.index, start.tag));
  // Überschrift des Extrakts setzen (Umnummerierung).
  html = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/, `<h1 class="chapter" id="${abschnitt.id}">${abschnitt.titel}</h1>`);
  if (!/^<h1/.test(html)) html = `<h1 class="chapter" id="${abschnitt.id}">${abschnitt.titel}</h1>\n` + html;
  teile.push({ id: abschnitt.id, titel: abschnitt.titel, html });
}

if (fehler.length) fail(fehler.join('\n         '));

// --- Filtern: data-doc ------------------------------------------------------
//
// Elemente mit `data-doc="app"` fliegen raus, `data-doc="orte"` bleibt (und verliert das
// Attribut), alles Unmarkierte bleibt. Entfernt wird das ganze Element samt Inhalt.

function stripAppOnly(html) {
  let out = html;
  let guard = 0;
  for (;;) {
    const m = /<([a-z0-9]+)([^>]*\sdata-doc="app")[^>]*>/i.exec(out);
    if (!m || guard++ > 500) break;
    const tag = m[1].toLowerCase();
    const start = m.index;
    // Passendes Schluss-Tag suchen (verschachtelte gleiche Tags mitzählen).
    const open = new RegExp(`<${tag}\\b`, 'gi');
    const close = new RegExp(`</${tag}>`, 'gi');
    open.lastIndex = start + m[0].length;
    close.lastIndex = start + m[0].length;
    let depth = 1;
    let end = -1;
    while (depth > 0) {
      const c = close.exec(out);
      if (!c) break;
      let o;
      let inner = 0;
      open.lastIndex = start + m[0].length;
      while ((o = open.exec(out)) && o.index < c.index) inner++;
      depth = 1 + inner - 1;
      // Vereinfachung: das Handbuch verschachtelt markierte Elemente nicht.
      end = c.index + c[0].length;
      break;
    }
    if (end < 0) break;
    out = out.slice(0, start) + out.slice(end);
  }
  return out.replace(/\sdata-doc="orte"/g, '');
}

for (const t of teile) t.html = stripAppOnly(t.html);

// --- Bilder: Variante gewinnt, falls vorhanden ------------------------------
//
// `<name>.orte.png` im Editor-Verzeichnis ersetzt `<name>.png`. Ohne Variante bleibt das
// geteilte Bild des Hauptbuchs stehen — Aufnahmen, die nur geteilte Komponenten zeigen,
// brauchen also keine eigene. Der Pfad zeigt dann eine Ebene höher: beide Programme liegen
// unter derselben Adresse, das spart eine Kopie jeder Binärdatei.
const SHOTS = join(REPO, 'app-orte', 'public', 'handbuch-assets');
const SHARED_SHOTS = join(REPO, 'app', 'public', 'handbuch-assets');
const kopiert = [];
function resolveShots(html) {
  return html.replace(/src="handbuch-assets\/([^"]+)\.png"/g, (_m, name) => {
    if (existsSync(join(SHOTS, `${name}.orte.png`))) return `src="handbuch-assets/${name}.orte.png"`;
    // Kein eigener Blickwinkel nötig — das geteilte Bild wird MITKOPIERT statt verlinkt.
    // Ein `../handbuch-assets/`-Verweis wäre in der Produktion zwar korrekt, aber im
    // Dev-Server tot und im Offline-Betrieb nicht im Precache des Editors. Die Kopie ist
    // ein Erzeugnis wie das Dokument selbst und kann deshalb nicht driften.
    const quelle = join(SHARED_SHOTS, `${name}.png`);
    if (existsSync(quelle)) {
      mkdirSync(SHOTS, { recursive: true });
      copyFileSync(quelle, join(SHOTS, `${name}.png`));
      kopiert.push(`${name}.png`);
    }
    return `src="handbuch-assets/${name}.png"`;
  });
}
for (const t of teile) t.html = resolveShots(t.html);

// --- Wächter ----------------------------------------------------------------
//
// Ein erzeugtes Dokument ist nicht automatisch ein richtiges. Drei Prüfungen, jede gegen
// einen konkreten Verfallsweg:

const body = teile.map((t) => t.html).join('\n');
const eigeneIds = new Set([...body.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

// (a) Tote Anker: Kapitel 7/8 verweisen aus dem Extrakt heraus (belegt: auf Kap. 10 und 16).
const toteAnker = [...new Set([...body.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]))].filter(
  (a) => !eigeneIds.has(a) && a !== 'toc'
);

// (b) Editor-Prosa, die nie ausgeliefert wird: ein `data-doc="orte"` außerhalb der
//     Manifest-Abschnitte wäre Text, den niemand je sieht — die lautlose Sorte Fehler.
const orteMarkierungenGesamt = (src.match(/data-doc="orte"/g) || []).length;
const orteMarkierungenImExtrakt = teile.length
  ? (manifest.abschnitte
      .map((a) => {
        const s = sectionStart(a.id);
        return s ? src.slice(s.index, sectionEnd(s.index, s.tag)) : '';
      })
      .join('')
      .match(/data-doc="orte"/g) || []).length
  : 0;

// (c) Leerer Extrakt.
const leer = body.trim().length < 500;

const warnungen = [];
if (toteAnker.length) warnungen.push(`Tote Sprungmarken im Extrakt: ${toteAnker.join(', ')}`);
if (orteMarkierungenGesamt !== orteMarkierungenImExtrakt)
  warnungen.push(
    `${orteMarkierungenGesamt - orteMarkierungenImExtrakt} Element(e) mit data-doc="orte" liegen AUSSERHALB der Manifest-Abschnitte — dieser Text wird nie ausgeliefert.`
  );
if (leer) warnungen.push('Der Extrakt ist praktisch leer.');

if (warnungen.length) fail(warnungen.join('\n         '));

// --- Schreiben --------------------------------------------------------------

const kopf = /<head>[\s\S]*?<\/head>/.exec(src)?.[0] ?? '<head><meta charset="utf-8"></head>';
const stamp = /Version \d+(?:\.\d+)? · Stand [^<]+/.exec(src)?.[0] ?? '';

const doc = `<!doctype html>
<html lang="de">
${kopf.replace(/<title>[\s\S]*?<\/title>/, `<title>${manifest.titel}</title>`)}
<body>
<!-- ERZEUGT — nicht von Hand bearbeiten.
     Quelle: app/public/HANDBUCH.html + tools/handbuch/orte-handbuch.manifest.json
     Neu erzeugen: node tools/handbuch/build-orte-handbook.mjs -->
<header class="cover">
  <h1>${manifest.titel}</h1>
  <p>${manifest.untertitel}</p>
  ${stamp ? `<p class="stamp">${stamp}</p>` : ''}
</header>

<nav id="toc">
  <h2>Inhalt</h2>
  <ul>
${teile.map((t) => `    <li><a href="#${t.id}">${t.titel}</a></li>`).join('\n')}
  </ul>
</nav>

${body}

<a id="to-top" href="#toc" aria-label="Zurück zum Inhaltsverzeichnis">
  <span class="arrow" aria-hidden="true">↑</span><span class="label">Inhalt</span>
</a>
</body>
</html>
`;

if (checkOnly) {
  const gleich = existsSync(OUT) && readFileSync(OUT, 'utf8') === doc;
  if (!gleich) fail('Der Extrakt ist nicht aktuell — `node tools/handbuch/build-orte-handbook.mjs` ausführen und den Diff committen.');
  console.log(`[handbuch-orte] aktuell (${teile.length} Abschnitte, ${doc.length} Zeichen).`);
  process.exit(0);
}

writeFileSync(OUT, doc);
console.log(
  `[handbuch-orte] ${OUT.replace(REPO + '/', '')} erzeugt — ${teile.length} Abschnitte, ${doc.length} Zeichen, ${kopiert.length} geteilte Aufnahme(n) mitkopiert, keine toten Anker.`
);
