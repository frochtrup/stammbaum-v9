// tests/ui/citation-clipboard.test.ts — Quellreferenz-Zwischenablage (BL-234).
// Transienter Sitzungszustand, kein persistierter Speicher (Kategorie A) — geprüft wird
// vor allem die Entkopplung (wie bei der Ereignis-Ablage: eine Kopie darf nie ein
// geteiltes Objekt mit dem Original oder mit einer zweiten Einfügung sein). Abgelegt wird
// die VOLLSTÄNDIGE Zitation (Nutzer-Vorgabe 2026-08-12), also müssen auch ihre
// Unterobjekte — Medien und Evidenz-Bewertung — entkoppelt sein.
import { describe, expect, it } from 'vitest';
import { createCitationClipboard } from '../../ui/shell/citation-clipboard.svelte';
import { makeCitation, setCitationUrl } from '../../core/model';
import { makeEvidenceEval } from '../../core/research';

describe('CitationClipboard', () => {
  it('ist anfangs leer', () => {
    const c = createCitationClipboard();
    expect(c.value).toBeNull();
    expect(c.label).toBe('');
    expect(c.take()).toBeNull();
  });

  it('merkt sich ALLE Angaben der Zitation und die Beschriftung', () => {
    const c = createCitationClipboard();
    const cit = setCitationUrl(
      makeCitation('@S1@', {
        page: 'fol. 3',
        quay: 2,
        note: 'Randbemerkung',
        eval: makeEvidenceEval({ source: 'original', information: 'primary', evidence: 'direct' }),
      }),
      'https://example.org/kb/3',
    );

    c.copy(cit, 'KB Musterdorf · fol. 3 ↗');

    expect(c.value?.sourceId).toBe('@S1@');
    expect(c.value?.page).toBe('fol. 3');
    expect(c.value?.quay).toBe(2);
    expect(c.value?.note).toBe('Randbemerkung');
    expect(c.value?.eval?.evidence).toBe('direct');
    expect(c.value?.media[0].mediaId).toBe('https://example.org/kb/3');
    expect(c.label).toBe('KB Musterdorf · fol. 3 ↗');
  });

  it('legt eine TIEFE Kopie ab — spätere Änderungen am Original ändern die Ablage nicht', () => {
    const c = createCitationClipboard();
    const original = setCitationUrl(
      makeCitation('@S1@', { page: '12', eval: makeEvidenceEval({ evidence: 'direct' }) }),
      'https://example.org/a',
    );

    c.copy(original, 'KB');
    original.page = '99';
    original.media[0].mediaId = 'https://example.org/b';
    original.eval!.evidence = 'indirect';

    expect(c.value?.page).toBe('12');
    expect(c.value?.media[0].mediaId).toBe('https://example.org/a');
    expect(c.value?.eval?.evidence).toBe('direct');
  });

  it('liefert bei jedem take() ein eigenes Objekt — zwei Einfügungen teilen nichts', () => {
    const c = createCitationClipboard();
    c.copy(setCitationUrl(makeCitation('@S1@', { page: '12' }), 'https://example.org/a'), 'KB');

    const a = c.take()!;
    const b = c.take()!;
    expect(a).not.toBe(b);
    expect(a.media[0]).not.toBe(b.media[0]);
    a.page = '99';
    a.media[0].mediaId = 'https://example.org/b';
    expect(b.page).toBe('12');
    expect(b.media[0].mediaId).toBe('https://example.org/a');
    // Und die Ablage selbst bleibt unberührt, bleibt also mehrfach einfügbar.
    expect(c.value?.page).toBe('12');
  });

  it('clear() leert Ablage und Beschriftung', () => {
    const c = createCitationClipboard();
    c.copy(makeCitation('@S1@', { page: '12' }), 'KB');
    c.clear();
    expect(c.value).toBeNull();
    expect(c.label).toBe('');
  });

  it('zwei Instanzen sind unabhängig (kein Modul-Singleton)', () => {
    const a = createCitationClipboard();
    const b = createCitationClipboard();
    a.copy(makeCitation('@S1@', { page: '12' }), 'KB');
    expect(b.value).toBeNull();
  });
});
