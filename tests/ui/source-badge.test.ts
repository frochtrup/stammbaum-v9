// tests/ui/source-badge.test.ts — §N-Badge + QUAY-Beweiskraft-Meter (Spec 21 §7, ADR-v9-118).
import { describe, expect, it } from 'vitest';
import { makeCitation, makeSource } from '../../core/model';
import {
  badgeLabel,
  badgeNumber,
  badgeTitle,
  badgeLinkHref,
  quayAriaLabel,
  MAX_BADGE_LABEL,
} from '../../ui/shell/source-badge';

describe('badgeNumber — Zahl aus dem numerischen ID-Teil', () => {
  it('extrahiert die Zahl aus einer GEDCOM-ID wie @S042@', () => {
    expect(badgeNumber('@S042@')).toBe('042');
  });
});

describe('badgeLabel — menschenlesbarer Quellenname statt Datensatz-ID (ADR-v9-120)', () => {
  it('zeigt den Kurznamen (abbr) der Quelle, nicht die ID', () => {
    const cit = makeCitation('@S42@');
    const src = makeSource('@S42@', { abbr: 'KB Ochtrup', title: 'Kirchenbuch Ochtrup, Band 3' });
    expect(badgeLabel(cit, src)).toBe('KB Ochtrup');
  });

  it('fällt auf den Titel zurück, wenn kein Kurzname gesetzt ist', () => {
    const cit = makeCitation('@S42@');
    const src = makeSource('@S42@', { title: 'Aufsatz Hörstmann' });
    expect(badgeLabel(cit, src)).toBe('Aufsatz Hörstmann');
  });

  it('die Seite landet NICHT im Label, sondern im Tooltip (Dichte)', () => {
    const cit = makeCitation('@S42@', { page: 'S. 42' });
    const src = makeSource('@S42@', { abbr: 'KB Ochtrup' });
    expect(badgeLabel(cit, src)).toBe('KB Ochtrup');
  });

  // --- Dichte-Kontrakt: die Marke darf pro Zeile nicht ausufern -------------------
  it('kürzt einen langen Namen auf höchstens MAX_BADGE_LABEL Zeichen mit „…“', () => {
    const long = 'Adressbuch Kreis Steinfurt 1951'; // 31 Z. — realer Median liegt bei ~37
    const cit = makeCitation('@S1@');
    const label = badgeLabel(cit, makeSource('@S1@', { abbr: long }));
    expect(label.length).toBeLessThanOrEqual(MAX_BADGE_LABEL);
    expect(label.endsWith('…')).toBe(true);
    expect(label.startsWith('Adressbuch')).toBe(true); // Anfang bleibt erkennbar
  });

  it('lässt einen kurzen Namen ungekürzt (kein „…“)', () => {
    const cit = makeCitation('@S1@');
    expect(badgeLabel(cit, makeSource('@S1@', { abbr: 'Duesmann' }))).toBe('Duesmann');
  });

  // --- Fallback §N: nur wenn die Quelle fehlt oder namenlos ist --------------------
  it('fällt auf §N zurück, wenn die Quelle nicht (mehr) existiert', () => {
    expect(badgeLabel(makeCitation('@S42@'), undefined)).toBe('§42');
  });

  it('fällt auf §N zurück, wenn die Quelle weder Kurzname noch Titel hat', () => {
    expect(badgeLabel(makeCitation('@S42@'), makeSource('@S42@', { abbr: '', title: '' }))).toBe('§42');
  });

  it('im §N-Fallback hängt eine kurze Seite (<=5 Z.) als Suffix an', () => {
    expect(badgeLabel(makeCitation('@S42@', { page: '15' }), undefined)).toBe('§42·15');
  });

  it('im §N-Fallback wird eine zu lange Seite (>5 Z.) weggelassen', () => {
    expect(badgeLabel(makeCitation('@S42@', { page: 'S. 15-22 ff' }), undefined)).toBe('§42');
  });
});

describe('quayAriaLabel — Beweiskraft als lesbares aria-Label (Meter statt Farbe)', () => {
  it.each([0, 1, 2, 3] as const)('beschreibt quay=%s als "Beweiskraft %s von 3"', (q) => {
    expect(quayAriaLabel(q)).toBe(`Beweiskraft ${q} von 3`);
  });
});

describe('badgeTitle — Tooltip zeigt den Quellentitel, nicht die GEDCOM-ID', () => {
  it('bevorzugt den Kurznamen (abbr)', () => {
    const cit = makeCitation('@S1@');
    const src = makeSource('@S1@', { abbr: 'KB Ochtrup', title: 'Kirchenbuch Ochtrup, Band 3' });
    expect(badgeTitle(cit, src)).toBe('KB Ochtrup');
  });

  it('fällt auf den vollen Titel zurück, wenn kein Kurzname gesetzt ist', () => {
    const cit = makeCitation('@S1@');
    const src = makeSource('@S1@', { title: 'Kirchenbuch Ochtrup' });
    expect(badgeTitle(cit, src)).toBe('Kirchenbuch Ochtrup');
  });

  it('fällt auf die rohe Quellen-ID zurück, wenn die Quelle nicht (mehr) existiert', () => {
    const cit = makeCitation('@S404@');
    expect(badgeTitle(cit, undefined)).toBe('@S404@');
  });

  it('hängt die Referenz (PAGE) an, wenn gesetzt', () => {
    const cit = makeCitation('@S1@', { page: 'S. 42' });
    const src = makeSource('@S1@', { abbr: 'KB Ochtrup' });
    expect(badgeTitle(cit, src)).toBe('KB Ochtrup · S. 42');
  });

  it('zeigt PAGE auch dann, wenn die Quelle fehlt', () => {
    const cit = makeCitation('@S404@', { page: '12' });
    expect(badgeTitle(cit, undefined)).toBe('@S404@ · 12');
  });
});

describe('badgeLinkHref — ↗-Weblink aus Zitat-Medium bzw. PAGE-als-URL', () => {
  it('nimmt die erste http(s)-Medien-Datei', () => {
    const cit = makeCitation('@S1@', {
      media: [{ file: 'https://example.org/rec/42', title: '' }],
    });
    expect(badgeLinkHref(cit)).toBe('https://example.org/rec/42');
  });

  it('fällt auf deepLinkUrl zurück, wenn dieser eine URL ist', () => {
    const cit = makeCitation('@S1@', { deepLinkUrl: 'https://example.org/dl' });
    expect(badgeLinkHref(cit)).toBe('https://example.org/dl');
  });

  it('erkennt eine URL in PAGE (Altdaten-Fallback)', () => {
    const cit = makeCitation('@S1@', { page: 'https://example.org/page' });
    expect(badgeLinkHref(cit)).toBe('https://example.org/page');
  });

  it('liefert "" bei nicht-URL-Medien und normalem PAGE-Text', () => {
    const cit = makeCitation('@S1@', {
      page: 'S. 42',
      media: [{ file: 'scans/kb.jpg', title: 'Scan' }],
    });
    expect(badgeLinkHref(cit)).toBe('');
  });
});
