// ui/shell/focus-trap.ts — der Tastaturfokus bleibt im offenen Dialog (LP-8, [21 §6i]).
//
// DER BEFUND (2026-08-03, gemessen bei 375×812 am offenen Ereignis-Editor): alle vier
// Modale tragen `role="dialog"` + `aria-modal="true"` — eine ZUSAGE an Hilfstechnik,
// dass außerhalb gerade nichts erreichbar ist. Niemand löste sie ein: nach dem Öffnen
// blieb der Fokus auf dem Auslöser-Knopf HINTER dem Backdrop, und bis ins Modal lagen
// 15 Tab-Stopps durch die verdeckte Seite. Wer mit Tastatur oder Switch-Control ein
// Modal öffnet, sieht ein Modal und bedient etwas anderes.
//
// WARUM EINE EIGENE ACTION UND NICHT TEIL VON `portal`: portaliert wird auch, was NICHT
// fangen darf — Menüs, Tooltips, die Picker-Trefferliste. Ein Dialog ist der Sonderfall,
// nicht die Regel; die beiden Actions stehen deshalb nebeneinander am selben Knoten.
//
// UND DAS IST KEIN VERBOTENER „KEYBOARD-TRAP" (WCAG 2.1.2): verboten ist der Ring OHNE
// Ausgang. Alle vier Modale schließen mit Escape — der Ausgang ist die Vorbedingung,
// unter der dieser Ring überhaupt zulässig ist, und er war schon da. Diese Datei baut
// den Ring, nicht den Ausgang; wer ein Overlay ohne Escape-Ausgang damit versieht, baut
// den Verstoß, den §6i meint.

/** Was Tab erreichen kann. Bewusst BEI JEDEM Tastendruck neu erhoben, nicht beim Mount
 *  gecacht: die Modale blenden Felder je nach Zustand ein und aus (die Hof-Neuanlage im
 *  Zugehörigkeits-Modal, die Vorlagenreihe im Quellen-Formular). Eine beim Öffnen
 *  eingefrorene Liste zeigte nach dem ersten Aufklappen an der falschen Stelle um. */
const FOKUSSIERBAR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function fokussierbareIn(node: HTMLElement): HTMLElement[] {
  return Array.from(node.querySelectorAll<HTMLElement>(FOKUSSIERBAR)).filter(
    // `offsetParent === null` heißt „nicht gerendert" — deckt `display: none` samt
    // eingeklappter Abschnitte ab. `position: fixed` hat kein offsetParent und ist
    // trotzdem sichtbar; der Dialog selbst ist genau so einer.
    (e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed',
  );
}

/**
 * Hält den Tastaturfokus im Knoten, solange er lebt.
 *
 * Beim Mount wandert der Fokus auf das `role="dialog"`-Element (es trägt in allen vier
 * Modalen bereits `tabindex="-1"`) statt auf das erste Bedienelement: so liest ein
 * Screenreader zuerst den Dialog-Namen vor, und der Fokus landet nicht auf dem
 * ✕-Knopf, der wie „das schließt gleich" aussieht. Tab geht von dort weiter ins erste
 * Feld — die normale Reihenfolge, nur eben innerhalb.
 *
 * Beim Zerstören kehrt der Fokus zum Auslöser zurück, sofern es ihn noch gibt (der
 * Merge-Dialog kann die Zeile entfernt haben, aus der er geöffnet wurde).
 */
export function focusTrap(node: HTMLElement) {
  const ausloeser = document.activeElement as HTMLElement | null;

  // `queueMicrotask` statt direkt: der Knoten trägt zugleich `use:portal`, und ein
  // `focus()` auf einem noch nicht eingehängten Element verpufft still. Die Reihenfolge
  // der Attribute im Markup entscheidet damit NICHT über die Wirkung — genau die Sorte
  // stiller Kopplung, die beim nächsten Umsortieren niemand bemerkt.
  queueMicrotask(() => {
    if (!node.isConnected) return;
    const dialog = node.querySelector<HTMLElement>('[role="dialog"]') ?? node;
    dialog.focus();
  });

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const liste = fokussierbareIn(node);
    if (liste.length === 0) return;
    const erstes = liste[0];
    const letztes = liste[liste.length - 1];
    const aktiv = document.activeElement;

    // Der Dialog-Container selbst steht nicht in `liste` (tabindex="-1"). Von ihm aus
    // führt Tab regulär ins erste Feld und Shift+Tab ans Ende — beides muss hier gesetzt
    // werden, sonst verließe der erste Tastendruck nach dem Öffnen den Dialog wieder.
    if (!liste.includes(aktiv as HTMLElement)) {
      e.preventDefault();
      (e.shiftKey ? letztes : erstes).focus();
      return;
    }
    if (!e.shiftKey && aktiv === letztes) {
      e.preventDefault();
      erstes.focus();
    } else if (e.shiftKey && aktiv === erstes) {
      e.preventDefault();
      letztes.focus();
    }
  }

  node.addEventListener('keydown', onKeydown);

  return {
    destroy() {
      node.removeEventListener('keydown', onKeydown);
      if (ausloeser && document.contains(ausloeser)) ausloeser.focus();
    },
  };
}
