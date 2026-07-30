import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';

// BL-54 — Ratsche gegen fette Views (Spec 02 §2, Spec 32 „Architektur-Gates").
// Der Fund lautete ursprünglich „die Views werden fett" (`PlaceDetail.svelte` 921 Zeilen,
// UI zu Kern 4:1). Als Risikozeile wäre das ein Gradient ohne Fertig-Zustand — deshalb
// eine Schwelle: neue `.svelte`-Dateien laufen sofort gegen 600 Zeilen.
//
// Die Altfälle darunter sind KEINE Freistellung, sondern eine Ratsche auf ihrem
// Ist-Stand (dasselbe Muster wie das Perf-Budget, ADR-v9-88/91): schrumpfen dürfen sie,
// wachsen nicht. Wer eine dieser Dateien inhaltlich anfasst, zerlegt sie und streicht
// ihre Zeile hier — DIESE LISTE IST DER FORTSCHRITTSANZEIGER. Schrumpft sie nicht, ist
// das sichtbar, statt in einer Risikoliste zu verschwinden.
//
// Warum exakt der Ist-Wert und nicht „Ist + etwas Luft": eine Ratsche mit Puffer ist
// keine Ratsche, sie ist eine höhere Schwelle. Stand 2026-07-18: Median 195 Zeilen,
// 12 Dateien über 400, 9 über 500, 5 über der Schwelle von 600 — nur diese fünf brauchen
// einen Eintrag. Die vier Dateien zwischen 500 und 600 bekommen bewusst KEINEN: ein
// Eintrag für eine Datei, die die Regel gar nicht verletzt, würde sie stattdessen von
// der 600er-Schwelle ausnehmen — also genau den Schutz abschalten, den er vorgibt zu
// dokumentieren.
const SVELTE_ALTFAELLE = {
  // Alle fünf ursprünglichen Altfälle sind abbezahlt/entfallen — die Liste ist LEER, jede
  // .svelte-Datei läuft jetzt gegen die reguläre 600er-Schwelle. Historie (der Fortschritts-
  // anzeiger, s. o.):
  // - PlaceDetail.svelte (war 921): bei BL-130/191 zerlegt (PlaceContemporaries/PlaceEditForm/
  //   PlaceMergeSection) → ~507.
  // - TasksView.svelte (war 676): bei BL-04 Aufgaben-Formular → TaskForm.svelte, ~598.
  // - HofDetail.svelte (war 641): bei BL-09 (Mini-Karte) inhaltlich angefasst und die
  //   Grunddaten-Form → HofEditForm.svelte extrahiert (wie PlaceDetail→PlaceEditForm) → 389.
  // - PersonDetail.svelte (war 632): bei BL-61 → PersonFamilies/ProofSummaryNote, ~514.
  // - HypothesesView.svelte (war 608): bei BL-56/58 → HypothesisForm.svelte, ~300.
};

const MAX_LINES_SVELTE = 600;
const maxLinesRule = (max) => ({
  'max-lines': ['error', { max, skipBlankLines: false, skipComments: false }]
});

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'tools/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    // eslint-plugin-svelte's flat/recommended wires svelte-eslint-parser for
    // *.svelte/*.svelte.ts, but leaves the embedded <script>-Parser für Svelte 5
    // + TypeScript ungesetzt (leeres parserOptions) — ohne dies parst es TS-Syntax
    // (Typen, Interfaces, Generics) mit espree und bricht. Standard-Verdrahtung
    // laut eslint-plugin-svelte-Doku.
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser
      }
    }
  },
  {
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly' }
    }
  },
  {
    // Svelte-Komponenten sind die reaktive Schale (Spec 02 §2) — sie dürfen DOM-Refs
    // halten (`bind:this`), anders als der Kern (INV-ARCH-1, gilt nur für core/).
    // Ohne diese Globals meldet der eingebettete <script>-Parser HTMLDivElement/window/
    // document als undefined (base no-undef, DOM-Lib-Typen sind kein Laufzeit-Scope).
    // `navigator`/`setTimeout`/`clearTimeout` ergänzt für die Karten-Lens (ADR-v9-25:
    // Offline-Erkennung + Animations-Takt) — dieselbe Plattform-Erlaubnis wie window/
    // document, weiterhin nur außerhalb von core/ (INV-ARCH-1-Gate prüft das separat).
    // `ResizeObserver` ergänzt für die Zeitleiste-Lens (Spec 20 §1.10: Swim-Lane-Breite
    // folgt der Containerbreite, analog zum Orakel-`window.resize`-Listener).
    // `fetch` ergänzt für den Demo-Ladeweg (Spec 20 §1.2 [S]: `fetch('./demo.ged')`,
    // analog Verhaltens-Orakel legacy-v8/storage.js loadDemo()).
    // `HTMLInputElement` ergänzt für PersonForm (Spec 20 §2: value/onchange-Muster auf
    // <input>-Feldern, analog dem bereits erlaubten HTMLSelectElement).
    // `KeyboardEvent` ergänzt für EventEditModal.svelte (Escape-Taste schließt das Modal,
    // `svelte:window onkeydown` — analog der bereits erlaubten HTMLInputElement/-Select-
    // Element-Ergänzung).
    files: ['**/*.svelte'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        ResizeObserver: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLInputElement: 'readonly',
        KeyboardEvent: 'readonly',
        // Für die Picker-Combobox (ADR-v9-103): `Event`/`FocusEvent`/`Node` in den
        // Handler-Signaturen, `crypto.randomUUID` für die instanz-eindeutige Listen-id
        // der aria-controls/activedescendant-Kopplung.
        Event: 'readonly',
        FocusEvent: 'readonly',
        Node: 'readonly',
        // Standalone-Orte-Editor (Spec 22): `confirm` ist im Projekt das etablierte
        // Bestaetigungs-Muster (Loeschen von Ort/Hof), `localStorage` traegt die
        // Geraetekennung der gespeicherten Datei, `BeforeUnloadEvent` die Warnung vor
        // ungespeicherter Arbeit (INV-ORTE-3).
        confirm: 'readonly',
        localStorage: 'readonly',
        BeforeUnloadEvent: 'readonly',
        crypto: 'readonly',
        fetch: 'readonly'
      }
    }
  },
  {
    // `<select bind:value>` ist unter happy-dom (Komponenten-Testumgebung, Spec 32 §6)
    // nicht per `fireEvent.change` testbar — happy-dom reflektiert `:checked` auf
    // `<option>` nach einem 'change'-Event nicht zuverlässig zurück in Svelte 5s
    // kompiliertes bind:value, wodurch der gebundene Wert beim nächsten Lesen (z. B.
    // ein Speichern-Klick direkt danach) veraltet bleibt — kein Svelte-/eslint-
    // Compile-Fehler, nur ein stiller Test-/Laufzeit-Bug. Wurde einmal projektweit
    // gefunden+behoben (7 Selects), tauchte aber in der Task/Log/Hypothesis-Session
    // (2026-07-07, ADR-v9-37) in 7 NEUEN Stellen wieder auf, weil die Lehre nur in
    // Kommentaren stand, nicht strukturell erzwungen war. Deshalb jetzt als Lint-Gate:
    // `value={x} onchange={(e) => (x = e.currentTarget.value)}` ist das etablierte
    // Ersatzmuster (s. PersonForm.svelte `sex`-Select als Vorbild).
    files: ['**/*.svelte'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'SvelteElement[name.name="select"] SvelteDirective[kind="Binding"]:has(SvelteDirectiveKey[name.name="value"])',
          message:
            '<select bind:value> ist unter happy-dom nicht zuverlässig testbar (TST-12, Spec 32). Nutze stattdessen value={x} onchange={(e) => (x = e.currentTarget.value)}.'
        },
        {
          // TST-18 (Spec 32, ADR-v9-103): Ein <label> reicht JEDEN Klick in seinem Inneren
          // an das zugehörige Feld weiter. Seit die Picker eine Combobox mit aufklappender
          // Trefferliste sind, liegen die Trefferzeilen INNERHALB dieses Wrappers — ein
          // Klick auf einen Treffer klickt damit zusätzlich das Feld an und öffnet die
          // eben geschlossene Liste sofort wieder. Beim Umbau lagen sieben solche Stellen
          // vor (EventEditModal 2x, TaskForm, SourceForm, LogView 3x); ohne Gate wäre die
          // achte nur eine Frage der Zeit — genau der Verlauf der <select bind:value>-Falle
          // eine Regel weiter oben. Ersatzmuster: <div class="stb-field"> +
          // <span class="stb-field__caption">, der Picker trägt seinen Namen über `label`.
          selector:
            'SvelteElement[name.name="label"] SvelteElement[name.name=/^(Picker|PersonPicker|FamilyPicker|SourcePicker|RepositoryPicker|EventPlaceField|EventAddrField)$/]',
          message:
            'Ein Picker darf nicht in einem <label> stehen (TST-18, Spec 32): das <label> leitet den Klick auf eine Trefferzeile an das Feld weiter und öffnet die Liste sofort wieder. Nutze <div class="stb-field"> + <span class="stb-field__caption">.'
        }
      ]
    }
  },
  {
    // TST-19 (Spec 32, ADR-v9-112): Personennamen werden NICHT von Hand zusammengesetzt.
    //
    // Bewusst ENG gefasst — verboten ist die Komposition (`${p.given} ${p.surname}`), nicht
    // der Feldzugriff. Seit der Parser die Felder beim Einlesen füllt, ist `p.given` zu lesen
    // korrekt; ein Pauschalverbot wäre die konservative Regel „aus Prinzip" und würde
    // legitime Stellen treffen (Vornamen-Statistik, Validierungsregeln, Suchheuhaufen).
    //
    // Was der Selbstbau dagegen verlässlich verliert: Präfix und Suffix, und den Rückfall
    // für namenlose Personen. Alle drei Diagramm-Inseln hatten genau diese Zeile — die
    // Sanduhr zeigte deshalb „Theodor Hermann /Zurloh/" mit Schrägstrichen. Ersatz:
    // `displayName(p)` aus ui/shell/person-display.ts (mit `fallback`-Argument, wo eine
    // ID sinnvoller ist als der Platzhalter), bzw. `composeGedcomName()` für den rohen
    // GEDCOM-NAME-Wert.
    files: ['ui/**/*.ts', 'ui/**/*.svelte', 'services/**/*.ts'],
    ignores: ['ui/shell/person-display.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TemplateLiteral:has(MemberExpression[property.name="surname"])',
          message:
            'Personennamen nicht von Hand zusammensetzen (TST-19, Spec 32): `${p.given} ${p.surname}` verliert Präfix/Suffix und den Rückfall für namenlose Personen. Nutze displayName(p) aus ui/shell/person-display.ts — oder composeGedcomName() für den rohen GEDCOM-NAME-Wert.'
        }
      ]
    }
  },
  {
    // INV-UI-14 (Spec 21 §6l, ADR-v9-90/-100, BL-88): Kein View bildet den Anzeigenamen
    // eines Orts selbst — `ctx.places.byId(id).title` ist der Weg, über den das zuletzt in
    // die Karten-Insel gesickert war (BL-87). `placeDisplayName(po)` (= shortName || title ||
    // id) ist der EINZIGE erlaubte Weg (INV-UI-4), `buildListPlaceName(ev, ctx)` der Listen-
    // Zwilling mit Hof-/Kettenlogik — beide in core/places. Bewusst ENG auf den Resolver-
    // Pfad `.places.byId(...).title` gefasst (nicht ein pauschales `.title`-Verbot, das
    // Quellen/Aufgaben/Personen träfe); `.byId` ist orts-/hof-spezifisch, Höfe haben kein
    // `title` → false-positive-frei. Die zwei dokumentierten Ketten-Ausnahmen (§6l: Review-
    // Klasse P, Massen-Dedup) tragen ein begründetes `eslint-disable`.
    files: ['ui/**/*.ts', 'ui/**/*.svelte'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[property.name='title'][object.callee.property.name='byId'][object.callee.object.property.name='places']",
          message:
            'Kein View liest den Ortstitel direkt (INV-UI-14, Spec 21 §6l): `places.byId(id).title` verliert shortName und die Kurzname-Regel. Nutze placeDisplayName(po) bzw. buildListPlaceName(ev, ctx) aus core/places.'
        }
      ]
    }
  },
  {
    // Service Worker (BL-02): eigener globaler Scope — `self` ist der
    // ServiceWorkerGlobalScope, `clients`/`caches` gibt es nur hier. Die Datei liegt
    // in app/public/ und wird verbatim ausgeliefert, ist also klassisches Skript
    // (kein Modul, keine Imports) — deshalb ein eigener Block statt der Browser-
    // Globals oben.
    files: ['app/public/sw.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        caches: 'readonly',
        clients: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly'
      }
    }
  },
  {
    // Schwelle für alle .svelte-Dateien (s. Kopf: BL-54).
    files: ['**/*.svelte'],
    rules: maxLinesRule(MAX_LINES_SVELTE)
  },
  ...Object.entries(SVELTE_ALTFAELLE).map(([file, max]) => ({
    files: [file],
    rules: maxLinesRule(max)
  }))
);
