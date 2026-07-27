// ui/views/reports/open-report.ts — einzige DOM-/Blob-Berührung der Report-Ausgabe:
// öffnet ein fertiges, standalone-HTML in einem neuen Tab (der Nutzer druckt/sichert dort
// über den Browser als PDF). Bei blockiertem Popup Fallback auf Datei-Download.
//
// Bewusst hier statt in ReportsView.svelte: der eingebettete Svelte-<script>-Parser fährt
// `no-undef` und kennt Blob/URL nicht als Global (nur die in eslint.config gelisteten);
// in einer .ts-Datei erledigt das die TypeScript-DOM-Lib. Gleiche Trennung wie
// diagram-export.ts (die Insel bleibt DOM-frei, die Rasterung liegt im Helfer).

/** Öffnet `html` in einem neuen Tab; fällt bei blockiertem Popup auf Download zurück. */
export function openReportInNewTab(html: string, filename: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'noopener');
  if (!win) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  // Spät widerrufen: der neue Tab muss die Blob-URL noch laden können.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
