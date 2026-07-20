import { CSP_POLICY } from './csp-policy';

// Nur im Produktions-Build injiziert (`command === 'build'`), NIE im Dev-Server
// (`vite`/`command === 'serve'`): Vites CSS-HMR fügt im Dev-Modus <style>-Tags
// per JS ein — eine aktive `style-src 'self'` ohne `unsafe-inline` würde das
// blockieren und die lokale Vorschau unstyled liefern. Command-abhängig statt
// statisch, exakt die in ADR-v9-38 verankerte Lehre (dort: Vite-`base`).
export function injectCspMeta(html: string, command: 'build' | 'serve'): string {
  if (command !== 'build') return html;
  const tag = `<meta http-equiv="Content-Security-Policy" content="${CSP_POLICY}">`;
  return html.replace('</title>', `</title>\n    ${tag}`);
}
