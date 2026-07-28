// tests/ui/story-epochs.test.ts — Story-Epochen-Kontext (BL-184, Spec 20 §1.10).
// Reiner Selektor über die Epochen-Referenztabelle; Orakel v8 `_sectionEpoch`. Wächter:
// bleibt unskipped.
import { describe, expect, it } from 'vitest';
import { STORY_EPOCHS, epochContext } from '../../ui/views/story/story-epochs';

describe('STORY_EPOCHS (Referenzdaten)', () => {
  it('trägt die elf deutschsprachigen Epochen, jede mit Kontext-Satz', () => {
    expect(STORY_EPOCHS).toHaveLength(11);
    expect(STORY_EPOCHS.every((e) => e.ctx.length > 0 && e.gen.length > 0)).toBe(true);
  });
});

describe('epochContext', () => {
  it('eine überlappende Epoche → Genitiv-Label + deren Kontext-Satz', () => {
    const out = epochContext(1872, 1900, 'Er');
    expect(out).toBe(
      'Er lebte in der Zeit des Deutschen Kaiserreichs (1871–1918). Industrialisierung, wirtschaftliches Wachstum und Aufbruch in die Moderne prägten diese Ära.',
    );
  });

  it('mehrere Epochen → bis zu drei aufgezählt, Kontext der Epoche mit größtem Überlapp', () => {
    // 1910–1945 überlappt (Tabellen-Reihenfolge) Kaiserreich/WWI/Weimar/NS/WWII;
    // top 3 = Kaiserreich, WWI, Weimar. Größter Überlapp unter top3: Weimarer Republik
    // (15 J. vs. Kaiserreich 8, WWI 4) → deren Kontext-Satz.
    const out = epochContext(1910, 1945, 'Sie');
    expect(out).toContain('Sie lebte in der Zeit des Deutschen Kaiserreichs (1871–1918), des Ersten Weltkriegs (1914–1918) und der Weimarer Republik (1918–1933).');
    expect(out).toContain('Demokratischer Neuanfang, Hyperinflation und politische Unruhen');
  });

  it('fehlendes Sterbejahr → Lebensspanne birthYear + 80', () => {
    // 1860 + 80 = 1940 → überlappt u. a. Kaiserreich.
    expect(epochContext(1860, null, 'Er')).toContain('Kaiserreich');
  });

  it('ohne jede Datierung → leer', () => {
    expect(epochContext(null, null, 'Er')).toBe('');
  });

  it('Lebensspanne vor der ersten Epoche → leer', () => {
    expect(epochContext(1500, 1560, 'Er')).toBe('');
  });
});
