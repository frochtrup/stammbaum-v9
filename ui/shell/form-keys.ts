// ui/shell/form-keys.ts — Enter speichert, Escape bricht ab (BL-276, [21 §6i]
// „Tastatur-first überall", [32 TST-15]).
//
// DER BEFUND. Die Forschungs-Formulare (`TaskForm`/`LogForm`/`HypothesisForm`) waren
// `<form onsubmit>` und speicherten mit Enter; die Entitäts-Formulare (Person, Quelle,
// Archiv, Ort, Hof, Medium) waren `<div>` mit `type="button"` — Enter tat dort nichts,
// Escape auch nicht. Dieselbe App, zwei Klassen von Formularen; §6i macht diesen
// Unterschied nicht und gilt ausdrücklich mobil wie auf Desktop.
//
// EIN MECHANISMUS, KEIN MUSTER ZUM ABSCHREIBEN (INV-UI-4). Beide Handler stehen hier
// statt als inline-Lambda in jeder Datei — nicht wegen der drei gesparten Zeilen,
// sondern wegen der zwei Fallen darin, die man je Fundstelle neu übersehen kann:
//
//  (1) `stopPropagation` beim SUBMIT. Formulare liegen ineinander: `SourceForm` enthält
//      den `RepositoryPicker`, dessen „+ neu anlegen" ein vollständiges `RepositoryForm`
//      AN DER STELLE des Feldes rendert (dieselbe Verschachtelung bei `TaskForm` →
//      `PersonPicker` → `PersonForm`). HTML verbietet geschachtelte `<form>`, der
//      Svelte-Client baut das DOM aber über `createElement` — die Parser-Regel greift
//      nicht, die Elemente existieren wirklich. Das `submit`-Ereignis BLUBBERT: ohne
//      diesen Halt speicherte ein Enter im Entwurf zusätzlich das äußere Formular.
//  (2) `stopPropagation` beim ESCAPE. Dieselbe Nachbarschaft von der anderen Seite: das
//      erste Escape gehört der innersten Fläche, ein zweites darf das Overlay darum
//      schließen — genau die Regel, die `Picker.svelte` für seine Trefferliste schon
//      hält (INV-UI-13-Nachbarschaft, BL-08).
//
// WAS ESCAPE HIER BEDEUTET, ist eine Frage an INV-UI-16 ([21 §6m]), nicht an die Taste:
// auf einer Detailseite verwirft der Sekundär-Knopf die FELDWERTE und schließt den Modus
// NICHT — im Wegwerf-Entwurf eines Pickers schließt er die Fläche. Escape tut deshalb
// genau das, was der Sekundär-Knopf der jeweiligen Fläche tut; es ist kein zweiter,
// eigener Ausgang (der wäre das „Abbrechen", das mehr verspricht als es hält).

/** `onsubmit` einer Formular-Fläche: Enter (und der Speichern-Knopf) rufen `save`. */
export function formSubmit(save: () => void): (e: SubmitEvent) => void {
  return (e) => {
    e.preventDefault();
    e.stopPropagation();
    save();
  };
}

/** `onkeydown` einer Formular-Fläche: Escape ruft, was ihr Sekundär-Knopf ruft. */
export function formEscape(cancel: () => void): (e: KeyboardEvent) => void {
  return (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    cancel();
  };
}
