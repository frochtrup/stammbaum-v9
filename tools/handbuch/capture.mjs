#!/usr/bin/env node
// tools/handbuch/capture.mjs
//
// Erzeugt ALLE Screenshots für das Handbuch (handbuch-assets/*.png) aus der laufenden
// App. Wird vom Orchestrator build-handbook.mjs aufgerufen, der zuvor die anonymisierte
// Beispieldatei nach app/public/demo.ged legt und den Dev-Server startet.
//
// Voraussetzungen: laufender Dev-Server (Standard :5173), System-Chrome, puppeteer-core.
// Aufruf:  node capture.mjs [--url http://localhost:5173] [--out <dir>]
//
// Kernkniffe (am Code verifiziert, siehe Chronik der Lessons Learned):
//   * Orts-Anreicherung (Koordinaten/Hierarchie) wird VOR "Demo laden" direkt in den
//     IndexedDB-Store `places-mirror` geschrieben — load-gedcom-text liest ihn beim Laden
//     und löst die Ereignisse dagegen auf (→ Marker auf der Karte). Kein Datei-Picker nötig
//     (der ließe sich headless nicht auslösen).
//   * Forschungsdaten (Aufgaben/Hypothesen/Protokoll) hängen je an einer Ziel-Person und
//     werden per Formular geseedet, damit die Screens nicht leer sind.
//   * Karte: auf den Median der Marker (= Deutschland) zoomen, damit nicht die Welt-
//     Ansicht mit Auswanderer-Ausreißern erscheint.

import puppeteer from 'puppeteer-core';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const URL = arg('--url', 'http://localhost:5173');
const OUT = arg('--out', '/Users/franzdecker/dev/stammbaum-v9/app/public/handbuch-assets');
// --only <a,b,…>: nur passende Screenshots SCHREIBEN (Teilstring-Match auf den Shot-Namen).
// Die Navigation läuft trotzdem vollständig durch (die Screens hängen sequenziell voneinander
// ab) — aber die übrigen, bereits korrekten PNGs bleiben unangetastet. Debug-Läufe für EINEN
// neuen Screenshot verschmutzen so nicht die 30+ anderen (Screenshots rendern nicht-
// deterministisch → sonst „M" in git für jede Datei ohne inhaltliche Änderung).
const ONLY = arg('--only', '').split(',').map((s) => s.trim()).filter(Boolean);
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WRAPPER = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'orte.json'), 'utf8'));

// Bild-Dateinamen der Fixture — Grundlage des Medien-Seeds (s. u. „Medien-Bytes seeden").
// Nur Bildendungen: PDFs sollen bewusst als Dokument-Symbol erscheinen, nicht als Kachel.
const MEDIA_IMAGE_NAMES = [
  ...new Set(
    readFileSync(join(__dirname, 'fixtures', 'demo-rich.anon.ged'), 'utf8')
      .split('\n')
      .map((l) => /^\d FILE (.+)$/.exec(l.trim())?.[1])
      .filter((f) => f && /\.(bmp|jpe?g|png|gif|tiff?)$/i.test(f)),
  ),
];

// Ziel-Personen — Pseudonyme aus fixtures/demo-rich.anon.ged (deterministisch stabil).
// Bei Wechsel der Quell-Fixture neu ableiten (reichste Person mit vielen Beruf-Events).
// BEWUSST eine VERSTORBENE Person (†1997) für alle Personen-zentrierten Screenshots —
// so zeigt kein Steckbrief/keine Zeitleiste eine (ggf. lebende) Person, und der Lebenslauf
// ist vollständig (Nutzer-Vorgabe). @I3@ hat DEAT 7 SEP 1997.
const RICH_PERSON = 'Kaspar Hörstmann'; // *1933 Vechta, †1997 Ochtrup, viele Berufe (Sanduhr-Vater, @I3@)
const RICH_SURNAME = 'Hörstmann';
// Für die Lösch-Zone (04c) bewusst eine KURZE Seite — die Zone steht per Definition ganz
// unten, und nur hier passt der GANZE Steckbrief mitsamt ihr auf einen Schirm: Das Bild
// zeigt damit die Aussage selbst („Löschen sitzt abgesetzt am Fuß"), statt einen aus dem
// Zusammenhang gerissenen Seitenausschnitt.
//
// URSPRÜNGLICH war es ein Ausweichmanöver: auf einer langen Seite war die Zone am Handy
// gar nicht erreichbar (BL-309 — `.entity-tab__swipe` ohne CSS-Regel, die Detailfläche
// wurde nie höhenbegrenzt und scrollte nicht). Das ist seit ADR-v9-220 behoben; die
// kurze Seite bleibt trotzdem, jetzt aus dem Grund oben. Ebenfalls verstorben (README-
// Vorgabe) und im Bestand namens-EINDEUTIG geprüft (Lesson 6).
const SHORT_PERSON = 'Engelbert Bendfeld'; // @I174@, nur NAME/SEX/BIRT/DEAT — Seite passt auf einen Schirm

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!existsSync(CHROME)) { console.error('Chrome nicht gefunden:', CHROME); process.exit(1); }

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 375, height: 812, deviceScaleFactor: 2 },
  args: ['--no-sandbox', '--hide-scrollbars'],
});
const page = await browser.newPage();
page.setDefaultTimeout(20000);

async function click(text, { contains = false, nth = 0 } = {}) {
  const ok = await page.evaluate((text, contains, nth) => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const all = [...document.querySelectorAll('button,[role=tab],[role=button],a,summary,label,div,li,span')];
    // Match auf sichtbaren Text ODER `aria-label`: die Entitäten-Segmentreihe zeigt mobil
    // Kurzformen (`Pers.`/`Fam.`, ADR-v9-133), trägt aber den vollen Namen als `aria-label`.
    // So bleibt `click('Familien')` gültig, ohne an die Kurzform gekoppelt zu sein — dieselbe
    // „stabiler Bezeichner statt sichtbarer Text"-Logik wie `bottomNav`s `data-slot`.
    const m = all.filter((el) => {
      const t = norm(el.textContent);
      const a = norm(el.getAttribute && el.getAttribute('aria-label'));
      return contains ? (t.includes(text) || (a && a.includes(text))) : (t === text || a === text);
    });
    // NUR bei EXAKT-Treffern echte Bedien-Elemente bevorzugen: ein umschließender
    // <div>/<span> kann denselben (gleich langen) Text tragen wie der Button, den er
    // umschließt — z. B. `.stb-filterbar` um den einzigen "Filter"-Trigger. `.click()` auf
    // so einem Wrapper löst den Button-onclick NICHT aus (Click propagiert nach oben, nicht
    // nach unten) → das Panel bliebe zu (02/03 zeigten die Liste roh). Diese Kollision gibt
    // es nur bei Exakt-Gleichheit. Bei `contains`-Treffern bleibt die reine Längen-Heuristik
    // (spezifischstes Blatt-Element, dessen Klick nach oben zum Button propagiert) — sonst
    // träfe ein mehrdeutiger Teiltext wie "Kaspar Hörstmann" eine ANDERE, kürzere Zeile als
    // die gemeinte (04/30 zeigten sonst den kargen statt des reichen Datensatzes).
    const interactive = (el) => el.matches('button,a,summary,label,[role=tab],[role=button]') ? 1 : 0;
    m.sort((a, b) => {
      if (!contains) { const d = interactive(b) - interactive(a); if (d) return d; }
      return norm(a.textContent).length - norm(b.textContent).length;
    });
    const el = m[nth]; if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true;
  }, text, contains, nth);
  if (!ok) console.log('  ! nicht gefunden:', text);
  await sleep(450); return ok;
}
async function bottomNav(slot) {
  // Trifft den Bottom-Nav-Slot über seine STABILE Id (`data-slot`, = nav-model `item.id`:
  // 'tree'|'person'|'search'|'tasks'|'more'), NICHT über den sichtbaren Text. Grund: das
  // Label ist umbenennbar (ADR-v9-122 machte aus „Personen/Baum/Aufgaben" → „Daten/Ansichten/
  // Forschung") und das Symbol könnte folgen — beides würde eine Text-/Icon-Suche still auf
  // den falschen Screen führen. `data-slot` ist die eine Wahrheit und driftet nicht mit der
  // Beschriftung. (Der Selektor bleibt auf `nav.bottom-nav` skopiert, damit ein gleichnamiges
  // Segment anderswo nicht kollidiert.)
  const ok = await page.evaluate((slot) => {
    const b = document.querySelector(`nav.bottom-nav .bottom-nav__item[data-slot="${slot}"]`);
    if (b) { b.click(); return true; }
    return false;
  }, slot);
  if (!ok) console.log('  ! bottomNav-Slot nicht gefunden:', slot);
  await sleep(650);
}
async function shot(name) {
  if (ONLY.length && !ONLY.some((o) => name.includes(o))) { console.log('  · übersprungen (--only):', name); return; }
  await sleep(650); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('  ✓', name);
}
async function scrollTop() { await page.evaluate(() => window.scrollTo(0, 0)); await sleep(200); }
// Wie scrollTop, aber auch für Ansichten, die einen INNEREN Container scrollen (Lesson 7):
// `window.scrollTo` bewirkt dort nichts. Nötig nach jedem `click()`, denn dessen
// `scrollIntoView({block:'center'})` verschiebt genau diesen Container — ein danach am
// Kopf gemeinter Screenshot läge sonst mitten im Formular.
async function scrollAllTop() {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    for (const el of document.querySelectorAll('*')) {
      if (el.scrollHeight > el.clientHeight + 4) el.scrollTop = 0;
    }
  });
  await sleep(250);
}
// Scrollt ein Element in die MITTE des Sichtfelds; `scrollIntoView` findet den richtigen
// Scroll-Vorfahren selbst (Lesson 7), eine eigene Vorfahren-Suche trifft dagegen leicht
// einen kleinen inneren Container und lässt die Seite stehen (erlebt).
//
// ZWEI Fallen, beide an 04c-loeschzone erlebt:
//  (a) `block:'end'` richtet die Unterkante an der Container-Unterkante aus — und die
//      liegt hinter der eingeblendeten Bottom-Nav. Deshalb 'center'.
//  (b) Der Steckbrief wächst NACH dem Scrollen: das Porträt und die Ereignis-Miniaturen
//      kommen aus IndexedDB und werden asynchron eingesetzt. Wer sofort scrollt, scrollt
//      auf eine Layout-Höhe, die es 300ms später nicht mehr gibt — das Ziel rutscht unter
//      die Falz. Darum erst absetzen lassen, dann scrollen.
// Deshalb wird ZWEIMAL gescrollt, mit einer Pause dazwischen: der zweite Lauf korrigiert,
// was das Nachwachsen verschoben hat. Ein einzelner Scroll (auch nach 1,2s Wartezeit)
// landete reproduzierbar knapp zu hoch.
async function scrollToEl(selector, settleMs = 1200) {
  const scrollIt = () => page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    // Erst den echten Scroll-Container ans Ende fahren (er ist es, der die Position
    // bestimmt), dann scrollIntoView als Feinschliff für den Fall, dass das Ziel NICHT
    // das letzte Element ist. Nur scrollIntoView reichte nicht: es „zentriert" und
    // klemmt am Maximum, landete an der langen Personenseite aber reproduzierbar so,
    // dass das Ziel unter der Bottom-Nav lag.
    let p = el.parentElement;
    while (p) {
      if (p.scrollHeight > p.clientHeight + 4) { p.scrollTop = p.scrollHeight; break; }
      p = p.parentElement;
    }
    el.scrollIntoView({ block: 'center' });
    return true;
  }, selector);
  await sleep(settleMs);
  const ok = await scrollIt();
  if (!ok) { console.log('  ! Element nicht gefunden:', selector); return false; }
  await sleep(900);
  await scrollIt();
  await sleep(300);
  return true;
}
async function fill(ph, val) { const ok = await page.evaluate((ph) => { const i = [...document.querySelectorAll('input,textarea')].find((x) => x.placeholder === ph && x.offsetParent); if (i) { i.focus(); return true; } return false; }, ph); if (ok) await page.keyboard.type(val, { delay: 8 }); await sleep(200); return ok; }
// ALLE Index-Listen sind GEFENSTERT (`createWindowed`: Person, Familie, Quelle, Archiv,
// Ort, Medien, globale Suche): nur die gerade sichtbaren Zeilen stehen im DOM. Ein Eintrag
// weiter hinten im Alphabet ist deshalb per Text überhaupt nicht anklickbar — `click(…)`
// fand nichts, meldete brav „! nicht gefunden" und der Lauf machte trotzdem weiter.
//
// WAS DAS ANGERICHTET HAT, über mehrere ausgelieferte Fassungen: `04-person-detail` und
// `30-desktop-liste` zeigten die LISTE statt des Steckbriefs, der Proband wurde nie gesetzt
// (und damit fielen Sanduhr, Beziehungsrechner und Story auf ihre Vorbelegung zurück),
// `09-quelle-detail` und `11-ort-steckbrief` — Letzteres auch im Editor-Handbuch — zeigten
// ebenfalls ihre Liste. 15 Fehlklicks in einem Lauf, jeder einzeln geloggt, keiner laut.
// `Engelbert Bendfeld` lag unter „B" zufällig im ersten Fenster und ging durch; genau
// deshalb sah es nach einem Einzelfall aus.
//
// Also: erst filtern, dann klicken, dann das Feld wieder leeren. Das Leeren VOR und NACH
// dem Klick ist Absicht — die Listensuche überlebt die Navigation (ADR-v9-230), und eine
// spätere Listen-Aufnahme zeigte sonst eine gefilterte Liste. Alle Index-Listen benutzen
// denselben Platzhalter `Suche…`, deshalb genügt EIN Helfer (INV-UI-4).
async function clearListSearch() {
  const had = await page.evaluate(() => {
    const i = [...document.querySelectorAll('input')].find((x) => x.placeholder === 'Suche…' && x.offsetParent);
    if (!i || !i.value) return false;
    i.focus(); i.select(); return true;
  });
  if (had) { await page.keyboard.press('Backspace'); await sleep(300); }
}
// Die Quellenliste hat KEIN Suchfeld (am Code geprüft: `SourceList.svelte` führt keines) —
// filtern geht dort also nicht, gefenstert ist sie trotzdem. Deshalb der zweite Weg: den
// Scroll-Container schrittweise weiterfahren, bis der Eintrag ins Fenster nachrückt. Beide
// Wege enden im selben `click`, damit es EINE Aufrufform für alle Listen gibt.
async function scrollUntilVisible(text, maxSteps = 24) {
  for (let i = 0; i < maxSteps; i++) {
    const da = await page.evaluate((t) => [...document.querySelectorAll('li,button,a,div')]
      .some((el) => (el.textContent || '').replace(/\s+/g, ' ').includes(t)), text);
    if (da) return true;
    const bewegt = await page.evaluate(() => {
      const c = [...document.querySelectorAll('*')]
        .filter((el) => el.scrollHeight > el.clientHeight + 40)
        .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
      if (!c) { const v = window.scrollY; window.scrollBy(0, 600); return window.scrollY !== v; }
      const v = c.scrollTop; c.scrollTop = v + c.clientHeight * 0.8; return c.scrollTop !== v;
    });
    await sleep(250);
    if (!bewegt) return false;
  }
  return false;
}
async function openInList(name) {
  await clearListSearch();
  const gefiltert = await fill('Suche…', name);
  if (gefiltert) await sleep(600);
  else await scrollUntilVisible(name);
  const hit = await click(name, { contains: true });
  if (!hit) console.log('  ! Eintrag weder gefiltert noch gescrollt erreichbar:', name);
  await sleep(400);
  if (gefiltert) await clearListSearch();
  return hit;
}
async function pickTarget(term) {
  await page.evaluate(() => { const c = [...document.querySelectorAll('input[role=combobox]')].find((x) => /Person/.test(x.placeholder || '') && x.offsetParent); if (c) c.focus(); });
  await page.keyboard.type(term, { delay: 20 }); await sleep(800);
  await page.evaluate(() => { const o = [...document.querySelectorAll('[role=option]')].find((x) => !/Neue Person/.test(x.textContent)); if (o) o.click(); });
  await sleep(350);
}
// Wie pickTarget, aber trifft GENAU das Picker-Feld, dessen Placeholder `phFrag` enthält —
// nötig, wo zwei Personen-Picker nebeneinander stehen (Beziehungsrechner: „Person A"/„Person B").
// Wählt bewusst die Option, die den Suchbegriff ENTHÄLT (nicht blind die erste) — sonst
// träfe die alphabetisch erste Person, falls das Tippen die Liste nicht gefiltert hat.
async function pickInField(phFrag, term) {
  const box = await page.evaluate((frag) => {
    const c = [...document.querySelectorAll('input[role=combobox]')].find((x) => (x.placeholder || '').includes(frag) && x.offsetParent);
    if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, phFrag);
  if (!box) { console.log('  ! Picker-Feld nicht gefunden:', phFrag); return; }
  await page.mouse.click(box.x, box.y); await sleep(300);       // echter Klick öffnet die Liste zuverlässiger als focus()
  await page.keyboard.type(term, { delay: 30 }); await sleep(800);
  const ok = await page.evaluate((t) => { const o = [...document.querySelectorAll('[role=option]')].find((x) => x.textContent.includes(t) && !/Neue Person|anlegen/.test(x.textContent)); if (o) { o.click(); return true; } return false; }, term);
  if (!ok) console.log('  ! Option nicht gefunden:', term);
  await sleep(350);
}
async function save() { await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Speichern' && x.offsetParent); if (b) b.click(); }); await sleep(550); }

console.log('→', URL);
await page.goto(URL, { waitUntil: 'networkidle2' }); await sleep(1200);

// Orts-Spiegel VOR dem Laden seeden
await page.evaluate(async (wrapper) => {
  // OHNE Versionsnummer öffnen — die Seite hat die DB beim Laden bereits angelegt, und
  // `open(name)` nimmt genau die vorhandene Version. Bis 2026-08-01 stand hier eine
  // kopierte Version + Store-Liste aus services/idb-schema.ts, mit dem Kommentar „bei
  // jedem Schema-Bump mitziehen": genau das wurde vergessen (DB stand auf 8, hier 6), und
  // der Lauf brach mit „VersionError" ab. Eine zweite Fassung des Schemas, die per
  // Erinnerung gepflegt wird, ist die Drift — sie entfällt hier ersatzlos.
  await new Promise((res, rej) => {
    let versuche = 0;
    const seed = () => {
      const rq = indexedDB.open('stammbaum-v9');
      rq.onerror = () => rej(rq.error);
      rq.onsuccess = () => {
        const db = rq.result;
        if (!db.objectStoreNames.contains('places-mirror')) {
          // Die App hat die DB noch nicht fertig angelegt — kurz warten statt selbst
          // anzulegen (sonst entstünde eine leere DB in falscher Version).
          db.close();
          if (++versuche > 20) return rej(new Error('places-mirror-Store nach 10s nicht da'));
          return setTimeout(seed, 500);
        }
        const tx = db.transaction('places-mirror', 'readwrite');
        tx.objectStore('places-mirror').put(wrapper, 'current');
        tx.oncomplete = () => { db.close(); res(); };
        tx.onerror = () => rej(tx.error);
      };
    };
    seed();
  });
}, WRAPPER);

// ---- Medien-Bytes seeden ----
// WARUM: Die anonymisierte Fixture trägt Dateinamen (`foto_28328.bmp`), aber keine
// Dateien — die Pfade zeigen bewusst ins Leere. Ohne Bytes zeigt die Galerie lauter
// leere Kacheln und der Steckbrief kein Porträt; die seit BL-258/259/260 gebauten
// Medien-Funktionen wären im Handbuch unsichtbar. Einen ECHTEN Ordner kann headless
// niemand freigeben (der Verzeichnis-Picker braucht eine Nutzergeste), also nimmt der
// Seed den ZWEITEN, gleichwertigen Zugangsweg: den Import-Speicher (`media-bytes`,
// Schlüssel `img:<pfad>`), den der Resolver genauso auflöst.
//
// Die Bilder werden im Browser gezeichnet (Canvas → PNG-Blob), nicht im Repo abgelegt:
// keine Binärdateien im git, und sie sind als NEUTRALE PLATZHALTER erkennbar — ein
// Handbuch soll keine erfundenen Familienfotos zeigen. Die Farbe leitet sich aus dem
// Dateinamen ab, damit das Kachelraster nicht monoton wirkt.
//
// Folge fürs Handbuch: die Kacheln tragen das „≈" (Zuordnung nur über den Dateinamen) —
// genau der Zustand, den Kapitel 9 beschreibt.
console.log(`Medien-Bytes seeden (${MEDIA_IMAGE_NAMES.length} Bilder) …`);
await page.evaluate(async (names) => {
  const zeichne = (name) => {
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
    const cv = document.createElement('canvas');
    cv.width = 400; cv.height = 300;
    const g = cv.getContext('2d');
    g.fillStyle = `hsl(${h} 22% 82%)`; g.fillRect(0, 0, 400, 300);
    g.fillStyle = `hsl(${h} 18% 62%)`;
    g.fillRect(24, 24, 352, 252);
    g.fillStyle = `hsl(${h} 20% 88%)`;
    g.beginPath(); g.arc(200, 118, 52, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(110, 276); g.bezierCurveTo(110, 200, 290, 200, 290, 276); g.fill();
    g.fillStyle = `hsl(${h} 25% 30%)`;
    g.font = '600 20px -apple-system, Helvetica, sans-serif';
    g.textAlign = 'center';
    g.fillText('Beispielbild', 200, 60);
    return new Promise((res) => cv.toBlob(res, 'image/png'));
  };
  const db = await new Promise((res, rej) => {
    const rq = indexedDB.open('stammbaum-v9');
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
  });
  if (!db.objectStoreNames.contains('media-bytes')) { db.close(); throw new Error('Store media-bytes fehlt'); }
  for (const name of names) {
    const blob = await zeichne(name);
    await new Promise((res, rej) => {
      const tx = db.transaction('media-bytes', 'readwrite');
      // Schlüsselform = `bytesKey()`/`normalizePath()` aus services/media (Präfix,
      // Backslash→Slash, führendes ./ weg, NFC, klein).
      const key = 'img:' + name.trim().replace(/\\/g, '/').replace(/^\.?\//, '').normalize('NFC').toLowerCase();
      tx.objectStore('media-bytes').put(blob, key);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }
  db.close();
}, MEDIA_IMAGE_NAMES);

// Der Import-Index wird EINMAL beim App-Start gelesen (media-resolver `restore()`) —
// ohne Neuladen bliebe der Seed unsichtbar. Noch ist nichts geladen, der Reload ist billig.
await page.reload({ waitUntil: 'networkidle2' }); await sleep(1500);

console.log('Demo laden …');
await bottomNav('more'); await click('Datei'); await click('Demo laden'); await sleep(5500);

// ---- Erstnutzer-Rundgang (BL-213) ----
// Er erscheint GENAU HIER von selbst: frisches Profil (Merker ungesetzt), mobiler
// Viewport, demo.ged geladen. Erst abbilden, dann wegklicken — sonst läge der Spotlight
// über den nächsten 30 Screenshots.
await scrollTop(); await shot('00-rundgang');
await click('Überspringen'); await sleep(400);

// ---- Forschungsdaten seeden ----
console.log('Forschungsdaten seeden …');
await bottomNav('tasks');
for (const t of [
  'Taufeintrag im Kirchenbuch Ochtrup 1720–1740 prüfen',
  'Sterbeurkunde beim Standesamt Ochtrup anfragen',
  'Heiratsregister St. Lamberti (Matricula) S. 93 auswerten',
  'Auswanderer-Listen Bremerhaven → USA durchsuchen',
]) { await click('+ Aufgabe', { contains: true }); await fill('Was ist zu tun?', t); await pickTarget(RICH_SURNAME); await save(); }
await bottomNav('tasks'); await click('Hypothesen');
for (const [txt, rat] of [
  ['Die Person stammt aus dem Kirchspiel Ochtrup (Kreis Steinfurt)', 'Gleicher Familienname am selben Ort, passender Altersabstand, namensgleicher Taufpate.'],
  ['Die Linie wanderte um 1855 über Bremerhaven nach Mississippi aus', 'Namensgleiche Person in den Vicksburg-Kirchenbüchern; Registerlücke ab 1854.'],
]) { await click('+ Hypothese', { contains: true }); await sleep(300); await fill('Was wird vermutet?', txt); await fill('Beweisführung', rat); await pickTarget(RICH_SURNAME); await save(); }
await bottomNav('tasks'); await click('Protokoll');
await click('+ Eintrag', { contains: true }); await sleep(300);
await fill('Wonach wurde gesucht?', 'Taufeinträge im Kirchenbuch Ochtrup 1770–1780');
await fill('Ergebnis / Beobachtungen', 'Zwei mögliche Treffer auf S. 93/94; Verfilmung bestellt, Vatername unleserlich.');
await pickTarget(RICH_SURNAME); await save();

// ---- MOBIL ----
console.log('Screenshots (mobil) …');
await bottomNav('person'); await scrollTop(); await shot('01-personenliste');
await bottomNav('person'); await scrollTop(); await click('Filter'); await shot('02-person-filter'); await click('Filter');
await bottomNav('person'); await scrollTop(); await click('Werkzeuge'); await shot('03-person-werkzeuge');
// Duplikat-Liste AUS dem bereits offenen Werkzeuge-Blatt (nicht erneut „Werkzeuge" klicken —
// das würde das Blatt wieder zuklappen). „Duplikate suchen" öffnet die Dedup-Ansicht; der
// Scan-Knopf trägt denselben Text wie der Werkzeug-Eintrag → per Klasse starten.
await click('Duplikate suchen'); await sleep(500);
await page.evaluate(() => { const b = document.querySelector('.person-dedup__scan-btn'); if (b) b.click(); }); await sleep(1800);
await scrollTop(); await shot('05-duplikate');
await page.evaluate(() => { const b = document.querySelector('.person-dedup__close-btn'); if (b) b.click(); }); await sleep(400);
await bottomNav('person'); await scrollTop(); await openInList(RICH_PERSON); await shot('04-person-detail');
// Bearbeiten-Modus (BL-273/274): der Editor ERSETZT die Seite nicht mehr — Kopfzeile,
// Name und Rückweg bleiben stehen, das Identitäts-Formular klappt darunter auf, der
// Schalter heißt jetzt „Fertig". Genau das soll der Screenshot zeigen, also am KOPF
// framen (scrollAllTop, nicht scrollTop: `click()` hat den inneren Scroll-Container
// eben mit `block:'center'` verschoben).
await click('✎ Identität'); await sleep(500); await scrollAllTop(); await shot('04b-person-bearbeiten');
await click('Fertig'); await sleep(450); await scrollAllTop();
// Die abgesetzte Lösch-Zone (BL-277): seit ADR-v9-217 tragen ALLE sieben Datenarten
// dieselbe Danger-Zone unten am Steckbrief, mit Trennlinie und nie neben „Speichern".
// Dafür auf eine KURZE Personenseite wechseln (Begründung bei SHORT_PERSON). Der Weg
// zurück zur Liste ist der Klick auf das BEREITS AKTIVE Segment (BL-298) — derselbe
// Griff, den Kapitel 3 beschreibt.
await click('Personen'); await sleep(500); await scrollAllTop();
await openInList(SHORT_PERSON); await sleep(600);
await scrollToEl('.delete-entity'); await shot('04c-loeschzone');
await click('Personen'); await sleep(500); await scrollAllTop();
await openInList(RICH_PERSON); await sleep(600); await scrollAllTop();
// Kaspar als Session-Proband setzen (BL-120): die effektive Referenzperson der Sitzung.
// Davon erben gleich Beziehungsrechner (Person A), Ausgaben-Bezugsperson und Story-Modus
// ihre Vorbelegung — der Screenshot des „★ Proband"-Zustands liegt im Steckbrief-Kopf.
await click('☆ Als Proband'); await sleep(400);
// Sanduhr DIREKT aus dem offenen Steckbrief des verstorbenen Probanden (@I3@, †1997). Der
// Absprung ist seit BL-60/ADR-v9-153 der kanonische Lens-Umschalter im Steckbrief (vormals
// der Einzelknopf „Im Baum anzeigen") — er setzt lensFocus, davon erben gleich Karte-
// Personen-Modus & Zeitleiste. Exakt-Treffer auf die Reihen-Beschriftung, damit nicht der
// gleichnamige Bottom-Nav-/Sidebar-Eintrag gewinnt.
await click('Diese Person in einer anderen Ansicht öffnen'); await sleep(200);
await click('⧖ Baum'); await sleep(1000); await shot('14-sanduhr');
// Export-Menü (BL-124) am Handy: EIN Einstiegspunkt „↓ Export" öffnet PNG/A1-Poster.
// EXAKTER Text, nicht contains: bei `contains` gewinnt bei Gleich-Länge der umschließende
// `.tree-view__export`-<div> (dessen Klick den Button-onclick NICHT auslöst); nur der
// Exakt-Pfad bevorzugt das interaktive Element (s. click()-Kommentar). Nächster Schritt
// navigiert ohnehin weg → kein Schließen nötig.
await click('↓ Export'); await sleep(500); await shot('14d-export');
await bottomNav('person'); await click('Familien'); await scrollTop(); await shot('06-familienliste');
await bottomNav('person'); await click('Familien'); await scrollTop(); await click(RICH_SURNAME, { contains: true }); await shot('07-familie-detail');
await bottomNav('person'); await click('Quellen'); await scrollTop(); await shot('08-quellenliste');
await bottomNav('person'); await click('Quellen'); await scrollTop(); await openInList('KB'); await shot('09-quelle-detail');
await bottomNav('person'); await click('Orte'); await scrollTop(); await shot('10-ortsliste');
await bottomNav('person'); await click('Orte'); await scrollTop(); await openInList('Ochtrup (Westf'); await shot('11-ort-steckbrief');
// Orts-Review (BL-267/268): die Kandidatenzeilen tragen Verwaltungsebene, Anreicherungs-
// Grad und ggf. „✓ geprüft" — die Angaben, an denen sich die Zuordnung entscheidet. Der
// Steckbrief von eben ist noch offen; erst zurück auf die Liste, sonst rendert die
// Werkzeuge-Disclosure nicht (mobiles Entweder-oder).
await page.evaluate(() => { const b = document.querySelector('.detail-header__back'); if (b) b.click(); }); await sleep(500);
// Den Trigger über SEINE KLASSE treffen, nicht über Text. Grund (beim Lauf gelernt): der
// Werkzeuge-Trigger trägt bei offenen Fällen einen Achtungs-Punkt samt Vorlese-Text
// („Werkzeuge — Handlungsbedarf"), also scheitert der Exakt-Treffer; und bei `contains`
// hat der umschließende `.stb-filterbar`-<div> denselben Text bei gleicher Länge und
// gewinnt in DOM-Reihenfolge — sein Klick löst den Button-onclick nicht aus (Klicks
// propagieren nach oben, nicht nach unten; s. Kommentar in click()). Beides zusammen:
// „gefunden" gemeldet, Panel zu, Shot auf der Ortsliste.
await scrollTop();
await page.evaluate(() => {
  const t = [...document.querySelectorAll('.stb-filterbar__trigger')]
    .find((b) => /Werkzeuge/.test(b.textContent || '') && b.offsetParent);
  if (t) t.click();
}); await sleep(500);
await click('Orts-Zuweisungen prüfen', { contains: true }); await sleep(900);
await scrollTop(); await shot('10b-orte-review');
await page.evaluate(() => { const b = document.querySelector('.place-review__close-btn'); if (b) b.click(); }); await sleep(400);
await bottomNav('person'); await click('Höfe'); await scrollTop(); await shot('12-hoefeliste');
await bottomNav('person'); await click('Höfe'); await scrollTop(); await click('Oster 141', { nth: 0 }); await shot('13-hof-detail');
// Medien-Galerie + Medium-Detail (BL-126). „Medien" ist das 6. Entitäten-Segment; die
// reiche Beispieldatei trägt ~227 OBJE, die Galerie ist also gefüllt. Fürs Detail die
// erste Kachel öffnen (alphabetisch nach Titel) — zeigt globale Felder + Referenzliste.
await bottomNav('person'); await click('Medien'); await scrollTop(); await shot('13b-mediengalerie');
await page.evaluate(() => { const t = document.querySelector('.media-gallery__tile'); if (t) t.click(); }); await sleep(500); await scrollTop(); await shot('13c-medium-detail');

// Karte (Orte) — auf Deutschland (Marker-Median) zoomen. lensFocus (@I3@, verstorben) wurde
// bereits oben beim Sanduhr-Schritt gesetzt → der Personen-Modus der Karte erbt ihn.
await bottomNav('tree'); await click('Karte'); await sleep(3000);
for (let i = 0; i < 5; i++) {
  const m = await page.evaluate(() => { const ms = [...document.querySelectorAll('.leaflet-marker-icon')].map((e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }).filter((p) => p.y > 180 && p.y < 1500); if (!ms.length) return null; ms.sort((a, b) => a.x - b.x); const mx = ms[Math.floor(ms.length / 2)].x; ms.sort((a, b) => a.y - b.y); const my = ms[Math.floor(ms.length / 2)].y; return { x: mx, y: my }; });
  if (!m) break; await page.mouse.move(m.x, m.y); await page.mouse.wheel({ deltaY: -350 }); await sleep(1400);
}
await page.mouse.move(360, 760); await sleep(3000); await shot('15-karte-orte');
await click('Personen', { nth: 0 }); await sleep(2200); await page.mouse.move(360, 760); await sleep(500); await shot('16-karte-personen');

// Zeitleiste bewusst NICHT hier (mobil) — die Swim-Lanes brauchen Breite; sie wird unten im
// Desktop-Layout aufgenommen (17-zeitleiste). lensFocus = @I3@ bleibt dafür gesetzt.

await bottomNav('more'); await click('Statistik'); await sleep(900); await scrollTop(); await shot('18-statistik');
// Suche als „Halbauswahl" zeigen — ein paar Zeichen vorbelegt, damit gruppierte Treffer
// über mehrere Datenarten sichtbar sind (statt eines leeren Feldes mit Mindestlängen-Hinweis).
await bottomNav('search'); await scrollTop();
await page.evaluate(() => { const i = [...document.querySelectorAll('input[type=search]')].find((x) => /Suche über/.test(x.placeholder || '') && x.offsetParent); if (i) i.focus(); });
await page.keyboard.type('Ochtr', { delay: 40 }); await sleep(900);
await scrollTop(); await shot('19-suche');
await bottomNav('tasks'); await click('Aufgaben'); await sleep(300); await shot('20-aufgaben');
await bottomNav('tasks'); await click('Aufgaben'); await click('Board', { contains: true }); await sleep(500); await shot('20b-aufgaben-board');
await bottomNav('tasks'); await click('Protokoll'); await sleep(300); await shot('21-protokoll');
await bottomNav('tasks'); await click('Hypothesen'); await sleep(300); await shot('22-hypothesen');
await bottomNav('tasks'); await click('Dashboard'); await sleep(900); await scrollTop(); await shot('23-dashboard');
await bottomNav('more'); await click('Datei'); await shot('24-datei');
await bottomNav('more'); await click('Datei'); await click('In anderes Format exportieren', { contains: true }); await shot('25-export');
await bottomNav('more'); await shot('26-mehr');
// Einstellungen (BL-257): eigene Fläche seit ADR-v9-188 — Medien-Ordner (gerätelokal),
// App-Daten (reist mit) und die ehrlichen Verweise auf anderswo bediente Einstellungen.
// Headless ist KEIN Ordner verbunden; die Statuszeile zeigt darum die importierten
// Dateien aus dem Medien-Seed — genau der iOS-Zugangsweg, den Kapitel 9 beschreibt.
await bottomNav('more'); await click('Einstellungen'); await sleep(600); await scrollTop(); await shot('31-einstellungen');

// Ausgaben-Hub (BL-169…179): der Druck-Report-Katalog. Bezugsperson ist mit dem oben
// gesetzten Proband (Kaspar) vorbelegt → die personen-bezogenen Reports sind sofort erzeugbar.
await bottomNav('more'); await click('Ausgaben'); await sleep(500); await scrollTop(); await shot('27-ausgaben');

// Beziehungsrechner (BL-134/175): Personen-Segment → Werkzeuge → „Verwandtschaft berechnen".
// Person A ist der Proband (Kaspar), Person B = seine Schwester „Styna Hörstmann" (@I9@,
// im Bestand eindeutig — „Styna" allein ist bei vielen ein Zweitname) → „Geschwister",
// gemeinsamer Vorfahre + Pfad. „🖨 Verwandtschaftsnachweis drucken" erzeugt Report #9.
// bottomNav('person') öffnet nur die DATEN-Gruppe und zeigt das ZULETZT aktive Segment
// (hier: Medien, von 13c) — deshalb explizit auf das Personen-Segment schalten.
// FRISCHER VERLAUF durch Neuladen (BL-07). Die Werkzeuge-Disclosure gehört der LISTE, an
// dieser Stelle steht aber noch ein Steckbrief offen. Seit BL-07 ist „← Zurück"
// herkunftsbewusst — es führt dorthin, wo der Nutzer HERKAM, und das ist nach dem
// Quer-durch-die-App-Lauf dieses Skripts die Medien-Detailseite (13c), nicht die Liste.
// Dagegen hilft kein wiederholtes Zurück (jeder erzwungene Segmentwechsel legt selbst
// wieder einen Verlaufspunkt an, das pendelt). Ein Neuladen ist der ehrliche Weg: Verlauf
// UND Auswahl sind Sitzungszustand, danach steht die Liste wie bei einem echten Neustart.
// Die Arbeitskopie lädt automatisch nach; der Proband ist ebenfalls transient und wird
// deshalb gleich neu gesetzt — er füllt „Person A" im Rechner vor.
await page.goto(URL, { waitUntil: 'networkidle2' }); await sleep(4000);
await bottomNav('person'); await click('Personen'); await scrollTop();
await openInList(RICH_PERSON); await sleep(700);
await click('☆ Als Proband'); await sleep(400);
// Jetzt IST die Liste die Herkunft — ein Klick genügt.
await page.evaluate(() => { const b = document.querySelector('.detail-header__back'); if (b) b.click(); }); await sleep(500);
await scrollTop(); await click('Werkzeuge'); await click('Verwandtschaft berechnen'); await sleep(600);
await pickInField('Person B', 'Styna Hörstmann'); await sleep(400);
await scrollTop(); await shot('28-beziehung');
await page.evaluate(() => { const b = document.querySelector('.rel-tool__close-btn'); if (b) b.click(); }); await sleep(400);

// ---- DESKTOP ----
console.log('Screenshots (Desktop) …');
await page.setViewport({ width: 1280, height: 850, deviceScaleFactor: 2 }); await sleep(600);
await page.evaluate(() => { const b = [...document.querySelectorAll('button,a,[role=button]')].find((x) => /Personen/.test(x.textContent || '')); if (b) b.click(); }); await sleep(500);
await openInList(RICH_PERSON); await sleep(600); await shot('30-desktop-liste');
await page.keyboard.down('Meta'); await page.keyboard.press('KeyK'); await page.keyboard.up('Meta'); await sleep(500);
await page.keyboard.type('Karte', { delay: 25 }); await sleep(500); await shot('32-command-palette');
await page.keyboard.press('Escape'); await sleep(300);

// Medien-Galerie im DESKTOP-Layout (BL-269, ADR-v9-192): das eigentliche Argument dieses
// Shots ist die Fläche — die Galerie belegt das ganze Fenster (mehrspaltiges Raster)
// statt der 22rem-Listenspalte. Mobil zeigt 13b dieselbe Galerie einspaltig.
await click('Medien'); await sleep(1200); await scrollTop(); await shot('13d-medien-desktop');

// Baum-Modi (Desktop, breit): Nachkommen-Baum und Fächer brauchen die Breite (mobil zu
// eng); die Sanduhr-Ringe zeigt der Handy-Shot 14. lensFocus (@I3@) ist gesetzt.
await page.evaluate(() => { const b = [...document.querySelectorAll('button,a,[role=button]')].find((x) => /Baum/.test(x.textContent || '')); if (b) b.click(); }); await sleep(1300);
await click('Nachkommen'); await sleep(1300); await shot('14b-nachkommen');
await click('Fächer'); await sleep(1300); await shot('14c-faecher');
await click('Sanduhr'); await sleep(600);

// Zeitleiste im DESKTOP-Layout — Swim-Lanes über die volle Breite (mobil zu schmal). Der
// Sidebar-Eintrag „Zeitleiste" führt zum Lens; lensFocus (@I3@, verstorben, ereignisreich)
// belegt die Leiste automatisch mit genau EINER Person (kein zweiter gleichnamiger Chip).
// Kürzere Viewport-Höhe, damit der Screenshot eng auf die Bahnen sitzt (kein leerer Boden).
await click('Zeitleiste'); await sleep(800);
await page.setViewport({ width: 1280, height: 640, deviceScaleFactor: 2 }); await sleep(900);
await shot('17-zeitleiste');

// Story-Lens (BL-133/183…190): erzählte Biografie der Fokus-Person (lensFocus = @I3@,
// verstorben, ereignisreich). Der Lens-Umschalter „📖 Story" steht in der Kopfzeile der
// Zeitleiste; Person-/Familien-Modus über den Umschalter darunter. Volle Höhe, damit
// Einleitungstext + Lebensweg-Karte + Inline-Diagramm sichtbar sind.
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 }); await sleep(600);
await click('Story'); await sleep(1600);
// Die USP der Story ist der ERZÄHLTE Text — nicht nur Karte/Diagramm. Deshalb so scrollen,
// dass unter dem Diagramm-Ende die erste Biografie-Sektion (Überschrift + Prosa) sichtbar wird.
// Die Story scrollt einen INNEREN Container (nicht window) → scrollIntoView auf die erste
// Biografie-Überschrift; danach im selben Container ~240px zurück, damit das Diagramm-Ende
// oben noch anschneidet (Karte/Diagramm UND erzählter Text in einem Bild).
await page.evaluate(() => {
  const h = document.querySelector('.story-lens-view__section-title');
  if (!h) return;
  h.scrollIntoView({ block: 'start' });
  let el = h.parentElement;
  while (el && el.scrollHeight <= el.clientHeight) el = el.parentElement;
  if (el) el.scrollTop = Math.max(0, el.scrollTop - 240);
}); await sleep(600);
await shot('29-story');

await browser.close();
console.log('fertig — Screenshots in', OUT);
