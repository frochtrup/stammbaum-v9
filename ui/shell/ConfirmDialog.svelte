<script lang="ts">
  // ui/shell/ConfirmDialog.svelte — DIE EINE Rückfrage vor einer destruktiven Aktion
  // (BL-351, Spec 21 §6).
  //
  // DER BEFUND (Nutzer, 2026-08-12): „im dev funktioniert der Löschen-Knopf nicht."
  // Gemessen in der Vorschau-Fläche: `window.confirm(...)` liefert dort SOFORT `false`,
  // ohne je einen Dialog zu zeigen — native Dialoge sind unterdrückt. Damit war JEDE
  // bestätigungspflichtige Aktion dort wirkungslos: Ereignis löschen, Person/Ort/Hof/
  // Quelle löschen, Assoziation entfernen, Forschungseintrag löschen.
  //
  // WARUM ES KEIN TEST GESEHEN HAT — und das ist der eigentliche Lehrsatz: jeder Test
  // ersetzte `window.confirm` durch einen Stub. Geprüft wurde damit alles AUSSER dem
  // Mechanismus, der versagt (CLAUDE.md: „die eigene Testmethode zuerst verdächtigen").
  // Diese Komponente ist Teil des Baums, den die Tests rendern — die Rückfrage wird ab
  // jetzt geklickt, nicht wegdefiniert.
  //
  // WARUM ES VORHER NICHT STANDARDISIERT WAR: es war es — aber nur als ENTSCHEIDUNG
  // („natives confirm(), kein eigenes Dialog-Muster", DeleteEntityButton), nicht als
  // Primitive. Ohne geteilte Form driftet die Umsetzung: fünf Aufrufstellen, drei
  // Lösch-Glyphen (×, ✕, 🗑), drei lokale Knopf-Klassen, zwei Reihenfolgen. Dieselbe
  // Klasse Befund wie die Sektions-Überschrift (BL-342) und der Abschnitts-Abstand
  // (BL-343): geteilte Absicht, kopierte Ausführung.
  //
  // KEIN GLOBALER DIALOG-DIENST, sondern eine Komponente, die der Aufrufer rendert. Ein
  // app-weiter Singleton müsste in App.svelte hängen — in einem Komponententest, der nur
  // `PersonDetail` rendert, gäbe es ihn nicht, und die Rückfrage wäre dort wieder
  // unbeantwortbar. Genau die Lücke, aus der dieser Befund entstand.
  import { portal } from './portal';
  import { focusTrap } from './focus-trap';

  interface Props {
    /** Die Frage in einem Satz, als Überschrift — nennt die Aktion, nicht „Achtung". */
    titel: string;
    /** Was verloren geht. Der Text der bisherigen `confirm()`-Meldungen, unverändert. */
    text: string;
    /** Beschriftung der bestätigenden Aktion — ein VERB („Löschen", „Entfernen",
     *  „Ersetzen"), nie „OK": der Knopf soll allein gelesen sagen, was er tut. */
    bestaetigen?: string;
    onConfirm: () => void;
    onCancel: () => void;
  }
  const { titel, text, bestaetigen = 'Löschen', onConfirm, onCancel }: Props = $props();

  // Fokus: `focusTrap` setzt ihn auf das Panel selbst (nicht auf einen Knopf) — so liest
  // ein Screenreader erst die Frage, dann die Antworten. Escape und ein Klick neben das
  // Panel bedeuten Abbrechen, wie bei jedem anderen Overlay hier.
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onCancel()} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- Portaliert wie jedes andere Overlay (INV-UI-13/§6k, BL-278): `position: fixed` trägt
     nur, solange kein Vorfahre `transform`/`filter`/`contain` setzt. -->
<div class="stb-modal-backdrop" use:portal use:focusTrap onclick={onCancel} role="presentation">
  <div
    class="confirm__panel"
    onclick={(e) => e.stopPropagation()}
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="confirm-titel"
    aria-describedby="confirm-text"
    tabindex="-1"
  >
    <h3 class="confirm__titel" id="confirm-titel">{titel}</h3>
    <p class="confirm__text" id="confirm-text">{text}</p>
    <div class="confirm__aktionen">
      <button type="button" class="stb-btn" data-variant="secondary" onclick={onCancel}>
        Abbrechen
      </button>
      <button type="button" class="stb-btn" data-variant="danger" onclick={onConfirm}>
        {bestaetigen}
      </button>
    </div>
  </div>
</div>

<style>
  /* Der Backdrop kommt aus `.stb-modal-backdrop` (design-system.css, INV-UI-4) — hier
     bleibt nur das Panel, wie bei jedem anderen Overlay. Schmaler als ein Formular-Panel:
     eine Frage mit zwei Antworten braucht keine Fläche, und die Knöpfe sollen nah
     beieinander stehen statt an zwei Bildschirmrändern. */
  .confirm__panel {
    background: var(--stb-surface-1);
    border: 1px solid var(--stb-gold-dim);
    border-radius: var(--stb-radius-card);
    padding: 1rem;
    max-width: 26rem;
    width: 100%;
  }

  .confirm__titel {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    color: var(--stb-gold-light);
  }

  .confirm__text {
    margin: 0 0 1rem;
    color: var(--stb-text);
    line-height: 1.45;
  }

  /* Bestätigung rechts, Abbrechen links — dieselbe Anordnung wie die Formular-Aktionen
     (LogForm/TaskForm/HypothesisForm): die fortführende Aktion steht außen rechts. */
  .confirm__aktionen {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
</style>
