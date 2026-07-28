// tests/services/report-shell.test.ts — geteilte Druck-HTML-Hülle (BL-169, Spec 20 §4).
// Die Hülle rechnet aus dem übergebenen Modell, nie aus dem DOM → headless goldfile-testbar.
import { describe, expect, it } from 'vitest';
import { renderReport, esc } from '../../services/reports';

describe('esc', () => {
  it('maskiert alle HTML-kritischen Zeichen', () => {
    expect(esc('<a href="x">A & B\'s</a>')).toBe('&lt;a href=&quot;x&quot;&gt;A &amp; B&#39;s&lt;/a&gt;');
  });
});

describe('renderReport (Hülle)', () => {
  const html = renderReport({
    title: 'Ahnenliste',
    subtitle: 'Otto Meyer (*1850 †1920)',
    meta: '3 Vorfahren · Erstellt 27. Juli 2026',
    body: '<table class="ahnen"></table>',
  });

  it('erzeugt ein in sich geschlossenes, standalone-druckbares HTML-Dokument', () => {
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<html lang="de">');
    expect(html).toContain('<title>Ahnenliste</title>');
    // Print-CSS ist inline eingebettet — keine externe Ressource (kein Server, Spec 20 §4).
    expect(html).toContain('<style>');
    expect(html).not.toMatch(/<link|<script/);
  });

  it('rendert Cover aus Titel/Untertitel/Meta und schließt den Rumpf ein', () => {
    expect(html).toContain('<h1>Ahnenliste</h1>');
    expect(html).toContain('Otto Meyer (*1850 †1920)');
    expect(html).toContain('3 Vorfahren · Erstellt 27. Juli 2026');
    expect(html).toContain('<table class="ahnen"></table>');
  });

  it('enthält eine gedruckte Seitenzahl-Regel (Spec 20 §4 „Seitenzahlen")', () => {
    expect(html).toContain('@page');
    expect(html).toContain('counter(page)');
  });

  it('ist deterministisch (kein Wall-Clock in der Hülle selbst)', () => {
    const again = renderReport({
      title: 'Ahnenliste',
      subtitle: 'Otto Meyer (*1850 †1920)',
      meta: '3 Vorfahren · Erstellt 27. Juli 2026',
      body: '<table class="ahnen"></table>',
    });
    expect(again).toBe(html);
  });

  it('escaped Feldwerte (kein HTML-Durchschlag aus dem Modell)', () => {
    const evil = renderReport({ title: 'A<b>', body: 'X' });
    expect(evil).toContain('<title>A&lt;b&gt;</title>');
    expect(evil).toContain('<h1>A&lt;b&gt;</h1>');
  });
});
