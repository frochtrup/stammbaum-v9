import { describe, expect, it } from 'vitest';
import { injectCspMeta } from '../../app/csp-plugin';
import { CSP_POLICY } from '../../app/csp-policy';

const HTML = '<html><head><title>Stammbaum v9</title></head><body></body></html>';

describe('injectCspMeta', () => {
  it('injiziert das CSP-Meta-Tag nur im Produktions-Build', () => {
    const out = injectCspMeta(HTML, 'build');
    expect(out).toContain(`<meta http-equiv="Content-Security-Policy" content="${CSP_POLICY}">`);
  });

  it('lässt den Dev-Server unangetastet (Vites CSS-HMR würde sonst brechen)', () => {
    const out = injectCspMeta(HTML, 'serve');
    expect(out).toBe(HTML);
  });
});

describe('CSP_POLICY', () => {
  it('erlaubt nie unsafe-inline oder unsafe-eval', () => {
    expect(CSP_POLICY).not.toMatch(/unsafe-inline/);
    expect(CSP_POLICY).not.toMatch(/unsafe-eval/);
  });

  it('setzt default-src/script-src/style-src auf self', () => {
    expect(CSP_POLICY).toMatch(/default-src 'self'/);
    expect(CSP_POLICY).toMatch(/script-src 'self'/);
    expect(CSP_POLICY).toMatch(/style-src 'self'/);
  });

  it('sperrt object-src und frame-ancestors', () => {
    expect(CSP_POLICY).toMatch(/object-src 'none'/);
    expect(CSP_POLICY).toMatch(/frame-ancestors 'none'/);
  });
});
